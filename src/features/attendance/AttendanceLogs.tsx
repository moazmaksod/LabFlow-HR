import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import api from '../../lib/axios';
import { 
  Search, Filter, Calendar as CalendarIcon, RefreshCw, X, 
  MapPin, Clock, Coffee, ExternalLink, Check, AlertCircle, AlertTriangle,
  CheckCircle, XCircle, Info
} from 'lucide-react';
import { formatStatusLabel } from '../../lib/utils';
import { useAuthStore } from '../../store/useAuthStore';
import { formatDisplayTime, formatDisplayDate, resolveTimezone, getWebNow, formatDuration } from '../../lib/timeManager';

interface AttendanceLog {
  id: number;
  user_name: string;
  job_title: string | null;
  profile_picture_url?: string | null;
  date: string;
  check_in: string;
  check_out: string | null;
  checkin_status: string;
  checkout_status: string | null;
  working_status: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  breaks?: any[];
  requests?: any[];
  shift_start_time?: string | null;
  shift_end_time?: string | null;
  shift_status?: string | null;
  shift_id?: string | null;
}

const determineOverallStatus = (checkinStatus: string, checkoutStatus: string | null): string => {
  const inStatus = checkinStatus;
  const outStatus = checkoutStatus || 'on_time';

  if (inStatus === 'unscheduled' || outStatus === 'unscheduled') {
    return 'unscheduled';
  }
  if (inStatus === 'on_time' && outStatus === 'on_time') {
    return 'on_time';
  }
  if (inStatus === 'late_in' && outStatus === 'early_out') {
    return 'incomplete';
  }
  if (inStatus === 'late_in') {
    return 'late_in';
  }
  if (outStatus === 'early_out') {
    return 'early_out';
  }
  return 'unknown';
};

const getDisplayStatus = (log: AttendanceLog): string => {
  return determineOverallStatus(log.checkin_status, log.checkout_status);
};

// --- TIMELINE PROGRESS BAR COMPONENT ---
interface AttendanceTimelineProps {
  log: AttendanceLog;
  showLabels?: boolean;
  showStats?: boolean;
}

type SegmentType = 'work' | 'break' | 'missed' | 'remaining' | 'overtime' | 'none';

const AttendanceTimeline = ({ log, showLabels = false, showStats = false }: AttendanceTimelineProps) => {
  const user = useAuthStore(state => state.user);
  const resolvedTimezone = resolveTimezone(user?.display_timezone);

  const hasShift = log.shift_id && !log.shift_id.startsWith('US_') && log.shift_start_time && log.shift_end_time;
  const shiftStartMs = hasShift ? new Date(log.shift_start_time!).getTime() : 0;
  const shiftEndMs = hasShift ? new Date(log.shift_end_time!).getTime() : 0;

  const checkOutStr = log.check_out;
  const checkInMs = new Date(log.check_in).getTime();

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolvedTimezone
  }).format(new Date(getWebNow()));
  const isToday = log.date === todayStr;

  let currentNowMs = 0;
  if (checkOutStr) {
    currentNowMs = new Date(checkOutStr).getTime();
  } else if (isToday) {
    currentNowMs = new Date(getWebNow()).getTime();
  } else {
    currentNowMs = hasShift ? shiftEndMs : checkInMs + 8 * 3600000;
  }

  const startMsList = [checkInMs];
  const endMsList = [currentNowMs];

  const isTimelineScheduled = !!hasShift;

  let timelineStartMs = isTimelineScheduled ? shiftStartMs : checkInMs;
  if (!isTimelineScheduled) {
    timelineStartMs = Math.min(timelineStartMs, ...startMsList);
  }

  let timelineEndMs = isTimelineScheduled ? shiftEndMs : currentNowMs;
  if (!isTimelineScheduled) {
    timelineEndMs = Math.max(timelineEndMs, ...endMsList);
    if (currentNowMs > timelineEndMs) {
      timelineEndMs = currentNowMs;
    }
  }

  const activeDurationRaw = currentNowMs - timelineStartMs;
  const isEnded = !!checkOutStr || !isToday;
  if (!isTimelineScheduled && !isEnded) {
    const minDurationMs = 60000;
    const activeDuration = Math.max(activeDurationRaw, minDurationMs);
    timelineEndMs = timelineStartMs + activeDuration * 1.1;
  }

  const totalDuration = timelineEndMs - timelineStartMs;

  const boundaryPointsSet = new Set<number>();
  if (isTimelineScheduled) {
    boundaryPointsSet.add(shiftStartMs);
    boundaryPointsSet.add(shiftEndMs);
  }
  boundaryPointsSet.add(currentNowMs);
  boundaryPointsSet.add(timelineStartMs);
  boundaryPointsSet.add(timelineEndMs);
  boundaryPointsSet.add(checkInMs);

  const sessionBreaks = log.breaks || [];
  sessionBreaks.forEach((b: any) => {
    const bStart = new Date(b.start_time).getTime();
    const bEnd = b.end_time 
      ? new Date(b.end_time).getTime() 
      : (checkOutStr ? new Date(checkOutStr).getTime() : currentNowMs);
    boundaryPointsSet.add(bStart);
    boundaryPointsSet.add(bEnd);
  });

  const sortedPoints = Array.from(boundaryPointsSet)
    .filter(t => t >= timelineStartMs && t <= timelineEndMs)
    .sort((a, b) => a - b);

  const isInsideBreak = (t: number) => {
    return sessionBreaks.some((b: any) => {
      const bStart = new Date(b.start_time).getTime();
      const bEnd = b.end_time 
        ? new Date(b.end_time).getTime() 
        : (checkOutStr ? new Date(checkOutStr).getTime() : currentNowMs);
      return t >= bStart && t <= bEnd;
    });
  };

  const isInsideWork = (t: number) => {
    return t >= checkInMs && t <= currentNowMs;
  };

  const classifyInterval = (t: number): SegmentType => {
    if (isInsideBreak(t)) return 'break';

    if (isInsideWork(t)) {
      if (isTimelineScheduled) {
        if (t >= shiftStartMs && t <= shiftEndMs) {
          return 'work';
        }
        return 'overtime';
      }
      return 'overtime';
    }

    if (isTimelineScheduled) {
      if (t >= shiftStartMs && t <= shiftEndMs) {
        return t < currentNowMs ? 'missed' : 'remaining';
      }
    }
    return 'none';
  };

  const segments: { type: SegmentType; widthPct: number }[] = [];
  let workedMins = 0;
  let breakMins = 0;
  let remainingMins = 0;

  sortedPoints.forEach((t2, idx) => {
    if (idx === 0) return;
    const t1 = sortedPoints[idx - 1];
    const duration = t2 - t1;
    if (duration <= 0) return;

    const t_mid = (t1 + t2) / 2;
    const type = classifyInterval(t_mid);

    const widthPct = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
    segments.push({ type, widthPct });

    const durationMins = duration / 60000;
    if (type === 'work' || type === 'overtime') {
      workedMins += durationMins;
    } else if (type === 'break') {
      breakMins += durationMins;
    } else if (type === 'remaining') {
      remainingMins += durationMins;
    }
  });

  const nowPctRaw = totalDuration > 0 ? ((currentNowMs - timelineStartMs) / totalDuration) * 100 : 0;
  const nowPct = Math.max(0, Math.min(100, nowPctRaw));
  const startMarkerPct = totalDuration > 0 && isTimelineScheduled ? ((shiftStartMs - timelineStartMs) / totalDuration) * 100 : 0;
  const endMarkerPct = totalDuration > 0 && isTimelineScheduled ? ((shiftEndMs - timelineStartMs) / totalDuration) * 100 : 0;

  const showLeftLabel = isTimelineScheduled || (activeDurationRaw >= 60000);

  const getSegmentColorClass = (type: SegmentType) => {
    switch (type) {
      case 'work': return 'bg-emerald-500';
      case 'break': return 'bg-amber-500';
      case 'missed': return 'bg-amber-600 dark:bg-amber-700';
      case 'remaining': return 'bg-slate-200 dark:bg-zinc-700';
      case 'overtime': return 'bg-indigo-600 dark:bg-indigo-400';
      case 'none':
      default: return 'bg-transparent';
    }
  };

  const getSegmentLabel = (type: SegmentType) => {
    switch (type) {
      case 'work': return 'Worked';
      case 'break': return 'Break';
      case 'missed': return 'Missed';
      case 'remaining': return 'Remaining';
      case 'overtime': return 'Overtime';
      default: return '';
    }
  };

  const formatTimeOnly = (ms: number) => {
    if (!ms) return '';
    return formatDisplayTime(new Date(ms).toISOString(), user?.display_timezone, 'HH:mm');
  };

  const isOngoing = !log.check_out && isToday;

  return (
    <div className="w-full">
      {totalDuration > 0 ? (
        <div className="relative pt-1 pb-1">
          {/* Main Track */}
          <div className="relative h-3 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
            {segments.map((seg, idx) => (
              <div
                key={idx}
                className={`h-full ${getSegmentColorClass(seg.type)}`}
                style={{ width: `${seg.widthPct}%` }}
                title={`${getSegmentLabel(seg.type)}: ${seg.widthPct.toFixed(1)}%`}
              />
            ))}
          </div>

          {/* Scheduled Shift Markers */}
          {isTimelineScheduled && (
            <>
              {timelineStartMs < shiftStartMs && (
                <div 
                  className="absolute top-1 bottom-1 w-[2px] bg-slate-400 dark:bg-slate-500 z-10" 
                  style={{ left: `${startMarkerPct}%` }}
                  title="Shift Start"
                />
              )}
              {timelineEndMs > shiftEndMs && (
                <div 
                  className="absolute top-1 bottom-1 w-[2px] bg-slate-400 dark:bg-slate-500 z-10" 
                  style={{ left: `${endMarkerPct}%` }}
                  title="Shift End"
                />
              )}
            </>
          )}

          {/* "Now" Indicator (Only for ongoing shifts) */}
          {isOngoing && showLabels && (
            <div 
              className="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-20 flex flex-col items-center" 
              style={{ left: `${nowPct}%` }}
            >
              {/* Arrow */}
              <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-rose-500 -mt-1.5 animate-pulse" />
              <span className="absolute top-4 text-[9px] font-black text-rose-500 whitespace-nowrap bg-background px-1 rounded border border-rose-300 dark:border-rose-800/40">
                Now: {formatTimeOnly(currentNowMs)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground italic">No duration data</div>
      )}

      {/* Start/End Time Labels */}
      {showLabels && totalDuration > 0 && (
        <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1 px-0.5">
          <span>{showLeftLabel ? formatTimeOnly(timelineStartMs) : ''}</span>
          <span>{isTimelineScheduled ? formatTimeOnly(timelineEndMs) : ''}</span>
        </div>
      )}

      {/* Stats Details Row */}
      {showStats && totalDuration > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 mt-2 border-t border-border/50 text-xs">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isTimelineScheduled ? 'bg-emerald-500' : 'bg-indigo-600 dark:bg-indigo-400'}`} />
            <div>
              <span className="text-[10px] text-muted-foreground block">{isTimelineScheduled ? 'Worked' : 'Overtime'}</span>
              <span className="font-semibold font-mono">{formatDuration(Math.floor(workedMins))}</span>
            </div>
          </div>
          {isTimelineScheduled && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <div>
                  <span className="text-[10px] text-muted-foreground block">Break</span>
                  <span className="font-semibold font-mono">{formatDuration(Math.floor(breakMins))}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-200 dark:bg-zinc-700" />
                <div>
                  <span className="text-[10px] text-muted-foreground block">Remaining</span>
                  <span className="font-semibold font-mono">{formatDuration(Math.floor(remainingMins))}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-700" />
                <div>
                  <span className="text-[10px] text-muted-foreground block">Missed</span>
                  <span className="font-semibold font-mono">
                    {formatDuration(Math.floor(Math.max(0, (totalDuration / 60000) - workedMins - breakMins - remainingMins)))}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default function AttendanceLogs() {
  const queryClient = useQueryClient();
  const user = useAuthStore(state => state.user);
  const location = useLocation();
  
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const tz = user?.display_timezone || resolveTimezone(user?.display_timezone);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz
    }).format(new Date(getWebNow()));
  });
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const tz = user?.display_timezone || resolveTimezone(user?.display_timezone);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz
    }).format(new Date(getWebNow()));
  });
  const [filterStatus, setFilterStatus] = useState(() => {
    return (location.state as any)?.filterStatus || '';
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Log State for Drawer
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);

  // Request review details state
  const [managerNote, setManagerNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [acceptedDurationHHMM, setAcceptedDurationHHMM] = useState('00:00');
  const [applyPenalty, setApplyPenalty] = useState(false);
  const [penaltyDurationHHMM, setPenaltyDurationHHMM] = useState('00:00');
  const [showConfirmStep, setShowConfirmStep] = useState(false);
  const [confirmActionType, setConfirmActionType] = useState<'approve' | 'reject' | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedRequestId !== null) {
          setSelectedRequestId(null);
          setError(null);
        } else {
          setSelectedLogId(null);
        }
      }
    };
    if (selectedLogId !== null) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedLogId, selectedRequestId]);

  const { data: logs, isLoading, refetch, isFetching } = useQuery<AttendanceLog[]>({
    queryKey: ['attendance-logs'],
    queryFn: async () => {
      const res = await api.get('/attendance');
      return res.data;
    }
  });

  const selectedLog = logs?.find(l => l.id === selectedLogId) || null;
  const selectedRequest = selectedLog?.requests?.find(r => r.id === selectedRequestId) || null;

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, manager_note, approved_minutes, paid_minutes, penalty_minutes }: { id: number, status: string, manager_note?: string, approved_minutes?: number, paid_minutes?: number, penalty_minutes?: number }) => {
      const res = await api.put(`/requests/${id}/status`, { status, manager_note, approved_minutes, paid_minutes, penalty_minutes });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-stats'] });
      setSelectedRequestId(null);
      setManagerNote('');
      setError(null);
      setShowConfirmStep(false);
      setConfirmActionType(null);
      setIsRejecting(false);
    }
  });

  const formatTime = (isoString: string | null) => formatDisplayTime(isoString, user?.display_timezone, 'HH:mm');

  // Request Helpers
  const getDurationMins = (start: string | null | undefined, end: string | null | undefined): number => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setSeconds(0, 0);
    startDate.setMilliseconds(0);
    endDate.setSeconds(0, 0);
    endDate.setMilliseconds(0);
    return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 60000));
  };

  const getUnapprovedAbsenceDurationMinutes = (req: any): number => {
    if (req.type === 'permission_to_leave' || req.type === 'shift_interruption_review') {
      return getDurationMins(req.interruption_start_time, req.interruption_end_time);
    }
    if (req.type === 'early_leave_approval' || req.type === 'late_in_approval' || req.type === 'attendance_correction') {
      if (req.value && req.value > 0) return req.value;
      if (req.type === 'late_in_approval' && req.original_check_in && req.shift_start_time) {
        return getDurationMins(req.shift_start_time, req.original_check_in);
      }
    }
    return req.value || 0;
  };

  const getMaxDurationMins = (req: any): number => {
    let maxMins = req.value || 0;
    if (req.type === 'permission_to_leave' || req.type === 'shift_interruption_review') {
      if (req.interruption_start_time && req.interruption_end_time) {
        return getDurationMins(req.interruption_start_time, req.interruption_end_time);
      }
    }
    if (req.type === 'late_in_approval' && !maxMins) {
      if (req.original_check_in && req.shift_start_time) {
        return getDurationMins(req.shift_start_time, req.original_check_in);
      }
    }
    if (req.type === 'early_leave_approval' && !maxMins) {
      if (req.original_check_out && req.shift_end_time) {
        return getDurationMins(req.original_check_out, req.shift_end_time);
      }
    }
    if (req.type === 'overtime_approval' && !maxMins) {
      if (req.original_check_in && req.original_check_out) {
        if (req.shift_start_time && req.shift_end_time && !req.attendance_shift_id?.startsWith('US_')) {
          const startScheduled = new Date(req.shift_start_time);
          const endScheduled = new Date(req.shift_end_time);
          const checkInTime = new Date(req.original_check_in);
          const checkOutTime = new Date(req.original_check_out);
          let ot = 0;
          if (checkInTime < startScheduled) {
            ot += getDurationMins(req.original_check_in, req.shift_start_time);
          }
          if (checkOutTime > endScheduled) {
            ot += getDurationMins(req.shift_end_time, req.original_check_out);
          }
          return ot;
        } else {
          return getDurationMins(req.original_check_in, req.original_check_out);
        }
      }
    }
    return maxMins;
  };

  const parseHHMMToMinutes = (val: string): number => {
    const parts = val.split(':');
    if (parts.length === 2) {
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      return hours * 60 + minutes;
    }
    const mins = parseInt(val, 10);
    return isNaN(mins) ? 0 : mins;
  };

  const formatToHHMM = (isoString: string | null | undefined) => {
    if (!isoString) return '--:--';
    return formatDisplayTime(isoString, user?.display_timezone, 'HH:mm');
  };

  const getUnifiedRequest = (req: any, log: AttendanceLog): any => {
    const shiftInstanceId = log.shift_id && !log.shift_id.startsWith('US_') ? parseInt(log.shift_id, 10) : null;
    const interruption = req.shift_interruption_id 
      ? log.breaks?.find((b: any) => b.id === req.shift_interruption_id) 
      : null;

    return {
      ...req,
      user_name: log.user_name,
      original_check_in: log.check_in,
      original_check_out: log.check_out,
      attendance_shift_id: log.shift_id,
      attendance_date: log.date,
      shift_instance_id: shiftInstanceId,
      shift_start_time: log.shift_start_time,
      shift_end_time: log.shift_end_time,
      shift_logical_date: log.date,
      interruption_start_time: interruption?.start_time || null,
      interruption_end_time: interruption?.end_time || null,
    };
  };

  const handleApproveClick = (unifiedRequest: any) => {
    if (!unifiedRequest) return;
    if (!managerNote.trim()) {
      setError("A manager note is mandatory to approve or reject this request.");
      return;
    }
    const needsDuration = ['permission_to_leave', 'shift_interruption_review', 'overtime_approval', 'early_leave_approval', 'late_in_approval'].includes(unifiedRequest.type || '');
    if (needsDuration) {
      if (!/^\d+:[0-5]\d$/.test(acceptedDurationHHMM)) {
        setError("Accepted duration must be in HH:MM format (e.g., 01:30, 00:45).");
        return;
      }
      const maxMins = getMaxDurationMins(unifiedRequest);
      const inputMins = parseHHMMToMinutes(acceptedDurationHHMM);
      if (inputMins > maxMins) {
        setError(`Approved duration (${acceptedDurationHHMM}) cannot exceed the maximum allowed period of ${formatDuration(maxMins)}.`);
        return;
      }
    }
    setError(null);
    setConfirmActionType('approve');
    setShowConfirmStep(true);
  };

  const handleRejectClick = (unifiedRequest: any) => {
    if (!unifiedRequest) return;
    if (!managerNote.trim()) {
      setError("A manager note is mandatory to approve or reject this request.");
      return;
    }
    if (applyPenalty && !/^\d+:[0-5]\d$/.test(penaltyDurationHHMM)) {
      setError("Penalty duration must be in HH:MM format (e.g., 01:30, 00:45).");
      return;
    }
    setError(null);
    setConfirmActionType('reject');
    setShowConfirmStep(true);
  };

  const executeApprove = (unifiedRequest: any) => {
    if (!unifiedRequest) return;
    const durationMinutes = parseHHMMToMinutes(acceptedDurationHHMM);
    const isOvertime = unifiedRequest.type === 'overtime_approval';
    updateStatusMutation.mutate({
      id: unifiedRequest.id,
      status: 'approved',
      manager_note: managerNote,
      approved_minutes: isOvertime ? durationMinutes : undefined,
      paid_minutes: !isOvertime ? durationMinutes : 0
    });
  };

  const executeReject = (unifiedRequest: any) => {
    if (!unifiedRequest) return;
    const penaltyMinutes = applyPenalty ? parseHHMMToMinutes(penaltyDurationHHMM) : 0;
    updateStatusMutation.mutate({
      id: unifiedRequest.id,
      status: 'rejected',
      manager_note: managerNote,
      penalty_minutes: penaltyMinutes
    });
  };

  const filteredLogs = logs?.filter(log => {
    const localLogDate = formatDisplayDate(log.check_in, user?.display_timezone);
    if (filterStartDate && localLogDate < filterStartDate) return false;
    if (filterEndDate && localLogDate > filterEndDate) return false;
    const matchesStatus = filterStatus 
      ? getDisplayStatus(log) === filterStatus
      : true;
    const matchesSearch = searchQuery 
      ? log.user_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (log.job_title && log.job_title.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Attendance Logs</h2>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search employee or job..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm"
          />
        </div>
        <div className="flex flex-wrap md:flex-nowrap gap-4 items-center">
          <div className="relative flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">From:</span>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="date" 
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">To:</span>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="date" 
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm appearance-none"
            >
              <option value="">All Statuses</option>
              <option value="working">Working</option>
              <option value="away">Away</option>
              <option value="on_time">On Time</option>
              <option value="late_in">Late In</option>
              <option value="early_out">Early Out</option>
              <option value="incomplete">Incomplete</option>
              <option value="unscheduled">Unscheduled</option>
            </select>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 h-[38px] cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Search
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading attendance logs...</div>
        ) : filteredLogs?.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No attendance records found matching your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                <tr>
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Check In</th>
                  <th className="px-6 py-3 font-medium">Check Out</th>
                  <th className="px-6 py-3 font-medium">Breaks</th>
                  <th className="px-6 py-3 font-medium w-48">Timeline</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                 {filteredLogs?.map((log) => {
                   const displayStatus = getDisplayStatus(log);
                   return (
                      <tr 
                        key={log.id} 
                        onClick={() => setSelectedLogId(log.id)}
                        className="hover:bg-muted/70 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative w-8 h-8 shrink-0">
                              {log.profile_picture_url ? (
                                <img
                                  src={log.profile_picture_url.startsWith('http') ? log.profile_picture_url : `${window.location.origin}${log.profile_picture_url}`}
                                  alt={log.user_name}
                                  className="w-8 h-8 rounded-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                  }}
                                />
                              ) : null}
                              <div className={`w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs uppercase ${log.profile_picture_url ? 'hidden' : ''}`}>
                                {log.user_name.split(' ').map((n: string) => n[0]).join('')}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{log.user_name}</div>
                              <div className="text-xs text-muted-foreground">{log.job_title || 'No Job Assigned'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">{formatDisplayDate(log.check_in, user?.display_timezone)}</td>
                        <td className={`px-6 py-4 font-mono font-semibold ${
                          log.checkin_status === 'on_time' ? 'text-emerald-600 dark:text-emerald-400' :
                          log.checkin_status === 'late_in' ? 'text-amber-500 dark:text-amber-400' :
                          log.checkin_status === 'unscheduled' ? 'text-indigo-500 dark:text-indigo-400' :
                          'text-foreground'
                        }`}>
                          {formatTime(log.check_in)}
                        </td>
                        <td className={`px-6 py-4 font-mono font-semibold ${
                          log.check_out ? (
                            log.checkout_status === 'on_time' ? 'text-emerald-600 dark:text-emerald-400' :
                            log.checkout_status === 'early_out' ? 'text-orange-500 dark:text-orange-400' :
                            log.checkout_status === 'unscheduled' ? 'text-indigo-500 dark:text-indigo-400' :
                            'text-foreground'
                          ) : 'text-muted-foreground'
                        }`}>
                          {formatTime(log.check_out)}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">
                          {log.breaks && log.breaks.length > 0 ? (
                            <div className="space-y-1">
                              {log.breaks.slice(0, 2).map((b: any, idx: number) => (
                                <div key={idx} className="text-muted-foreground">
                                  {formatTime(b.start_time)} - {b.end_time ? formatTime(b.end_time) : 'Ongoing'}
                                </div>
                              ))}
                              {log.breaks.length > 2 && (
                                <div className="text-xs text-primary font-semibold">+{log.breaks.length - 2} more</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 w-48">
                          <AttendanceTimeline log={log} />
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold inline-block ${
                            displayStatus === 'on_time' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                            displayStatus === 'late_in' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' :
                            displayStatus === 'early_out' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                            displayStatus === 'incomplete' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                            displayStatus === 'unscheduled' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' :
                            'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400'
                          }`}>
                            {formatStatusLabel(displayStatus)}
                          </span>
                        </td>
                      </tr>
                   );
                 })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Side Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          {/* Slide-out Panel */}
          <div className="bg-card w-full max-w-2xl border-l border-border h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 overflow-hidden">
            
            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 shrink-0">
                  {selectedLog.profile_picture_url ? (
                    <img
                      src={selectedLog.profile_picture_url.startsWith('http') ? selectedLog.profile_picture_url : `${window.location.origin}${selectedLog.profile_picture_url}`}
                      alt={selectedLog.user_name}
                      className="w-10 h-10 rounded-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm uppercase ${selectedLog.profile_picture_url ? 'hidden' : ''}`}>
                    {selectedLog.user_name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight text-foreground">{selectedLog.user_name}</h3>
                  <p className="text-xs text-muted-foreground">{selectedLog.job_title || 'No Job Assigned'}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedLogId(null);
                  setSelectedRequestId(null);
                }} 
                className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inner Drawer Content */}
            {selectedRequestId !== null && selectedRequest ? (
              // REQUEST DETAIL & ACTION SCREEN
              (() => {
                const unifiedReq = getUnifiedRequest(selectedRequest, selectedLog);
                const parsedDetails = {
                  new_clock_in: unifiedReq.requested_check_in,
                  new_clock_out: unifiedReq.requested_check_out,
                  missing_minutes: unifiedReq.value,
                  early_leave_minutes: unifiedReq.value,
                  late_in_minutes: unifiedReq.value,
                  approved_minutes: unifiedReq.approved_overtime_minutes,
                  paid_permission_minutes: unifiedReq.paid_minutes,
                  penalty_hours: (unifiedReq.penalty_minutes || 0) / 60
                };
                const isPending = unifiedReq.status === 'pending';

                return (
                  <div className="flex-1 flex flex-col overflow-hidden bg-card">
                    {/* Back Button */}
                    <div className="p-3 border-b border-border bg-muted/10 shrink-0 flex items-center">
                      <button 
                        onClick={() => {
                          setSelectedRequestId(null);
                          setError(null);
                        }} 
                        className="text-muted-foreground hover:text-foreground transition-colors py-1 px-2.5 rounded-lg hover:bg-muted/80 flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                      >
                        &larr; Back to Details
                      </button>
                    </div>

                    {showConfirmStep ? (
                      // CONFIRM ACTION STEP
                      <div className="flex-1 overflow-y-auto flex flex-col justify-between">
                        <div className="p-6 space-y-4">
                          <div className="text-center space-y-2">
                            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${
                              confirmActionType === 'approve' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                            }`}>
                              {confirmActionType === 'approve' ? <Check className="w-6 h-6" /> : <X className="w-6 h-6" />}
                            </div>
                            <h3 className="text-base font-bold text-foreground">
                              Confirm Action Summary
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              Review the final payroll and attendance effects before saving.
                            </p>
                          </div>

                          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3 text-sm">
                            <div className="flex justify-between items-center py-1 border-b border-border/50">
                              <span className="text-xs text-muted-foreground">Employee:</span>
                              <span className="font-bold text-foreground">{unifiedReq.user_name}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-border/50">
                              <span className="text-xs text-muted-foreground">Request Type:</span>
                              <span className="font-semibold text-foreground capitalize">
                                {unifiedReq.type?.replace(/_/g, ' ') || 'Manual Clock'}
                              </span>
                            </div>

                            {confirmActionType === 'approve' ? (
                              unifiedReq.type === 'attendance_correction' ? (
                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-lg space-y-2 mt-2">
                                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                    Attendance Correction Summary
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    This request will be marked as approved. The shift check-in and check-out times will be updated to the proposed times.
                                  </p>
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">New Clock In:</span>
                                      <span className="font-mono font-semibold text-foreground">
                                        {formatToHHMM(unifiedReq.requested_check_in)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">New Clock Out:</span>
                                      <span className="font-mono font-semibold text-foreground">
                                        {formatToHHMM(unifiedReq.requested_check_out)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-emerald-500/10 pt-1.5 mt-1">
                                      <span className="font-bold text-emerald-800 dark:text-emerald-300">New Duration:</span>
                                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">
                                        {formatDuration(getDurationMins(unifiedReq.requested_check_in, unifiedReq.requested_check_out))}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-lg space-y-1 mt-2">
                                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                    Payroll Credit Impact
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    This request will be approved. The specified paid duration will be credited to the employee.
                                  </p>
                                  <div className="flex justify-between items-center pt-1">
                                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Paid Credit Duration:</span>
                                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">
                                      {acceptedDurationHHMM}
                                    </span>
                                  </div>
                                </div>
                              )
                            ) : (
                              unifiedReq.type === 'attendance_correction' ? (
                                <div className="bg-rose-500/5 border border-rose-500/20 p-3 rounded-lg space-y-2 mt-2">
                                  <div className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                                    Attendance Correction Rejection
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    This request will be rejected. The existing check-in/out times will remain unchanged.
                                  </p>
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Existing Clock In:</span>
                                      <span className="font-mono font-semibold text-foreground">
                                        {formatToHHMM(unifiedReq.original_check_in)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Existing Clock Out:</span>
                                      <span className="font-mono font-semibold text-foreground">
                                        {formatToHHMM(unifiedReq.original_check_out)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3 mt-2">
                                  <div className="bg-rose-500/5 border border-rose-500/20 p-3 rounded-lg space-y-1">
                                    <div className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                                      Payroll Absence Impact
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                      This request will be rejected. The corresponding duration will remain unpaid.
                                    </p>
                                    <div className="flex justify-between items-center pt-1">
                                      <span className="text-xs font-bold text-rose-800 dark:text-rose-300">Unpaid Duration:</span>
                                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-base">
                                        {formatDuration(getUnapprovedAbsenceDurationMinutes(unifiedReq))}
                                      </span>
                                    </div>
                                  </div>

                                  <div className={`p-3 rounded-lg border space-y-1 ${
                                    applyPenalty 
                                      ? 'bg-amber-500/5 border-amber-500/20' 
                                      : 'bg-muted/30 border-border/50'
                                  }`}>
                                    <div className={`text-xs font-bold uppercase tracking-wider ${
                                      applyPenalty ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                                    }`}>
                                      Extra Disciplinary Penalty
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                      {applyPenalty 
                                        ? 'An additional disciplinary deduction will be applied directly to the payroll ledger.'
                                        : 'No extra disciplinary penalty will be applied.'}
                                    </p>
                                    <div className="flex justify-between items-center pt-1">
                                      <span className="text-xs font-bold text-muted-foreground">Extra Penalty Duration:</span>
                                      <span className={`font-mono font-bold text-base ${
                                        applyPenalty ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                                      }`}>
                                        {applyPenalty ? penaltyDurationHHMM : 'None (00:00)'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}

                            <div className="pt-2 border-t border-border/50">
                              <span className="text-xs font-bold text-muted-foreground block mb-1">Audit Log Justification:</span>
                              <div className="p-3 bg-card rounded-lg text-xs text-foreground italic border border-border/50 max-h-24 overflow-y-auto">
                                "{managerNote}"
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-6 border-t border-border bg-muted/30 flex gap-3 shrink-0">
                          <button
                            onClick={() => {
                              setShowConfirmStep(false);
                              setConfirmActionType(null);
                            }}
                            className="flex-1 px-4 py-2.5 bg-muted text-muted-foreground text-sm font-semibold rounded-xl hover:bg-muted/85 transition-all border border-border cursor-pointer"
                          >
                            Back to Editing
                          </button>
                          <button
                            onClick={() => confirmActionType === 'approve' ? executeApprove(unifiedReq) : executeReject(unifiedReq)}
                            disabled={updateStatusMutation.isPending}
                            className={`flex-[2] px-4 py-2.5 text-white text-sm font-semibold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${
                              confirmActionType === 'approve' 
                                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20' 
                                : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                            }`}
                          >
                            <CheckCircle className="w-4 h-4" /> Confirm & Submit
                          </button>
                        </div>
                      </div>
                    ) : (
                      // STANDARD REVIEW FORM
                      <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div>
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Request Type</label>
                          <p className="capitalize font-semibold text-sm text-foreground">{unifiedReq.type?.replace(/_/g, ' ') || 'Manual Clock'}</p>
                        </div>

                        {/* Related Shift Section */}
                        <div className="pt-2 border-t border-border">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Related Shift</label>
                          {unifiedReq.attendance_shift_id?.startsWith('US_') ? (
                            <div className="bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">Shift Type:</span>
                                <span className="font-bold text-amber-700 dark:text-amber-300">Unscheduled Shift</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Shift ID:</span>
                                <span className="font-mono text-muted-foreground">{unifiedReq.attendance_shift_id}</span>
                              </div>
                            </div>
                          ) : unifiedReq.shift_instance_id ? (
                            <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Shift ID:</span>
                                <span className="font-medium text-foreground">{unifiedReq.shift_instance_id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Scheduled Time:</span>
                                <span className="font-mono font-medium text-foreground">
                                  {formatToHHMM(unifiedReq.shift_start_time)} - {formatToHHMM(unifiedReq.shift_end_time)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-muted/10 p-2 rounded-lg border border-border text-xs text-muted-foreground italic">
                              No related scheduled shift (Unscheduled)
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reason provided</label>
                          <p className="text-xs mt-1 bg-muted/30 p-3 rounded-lg border border-border text-foreground italic">"{unifiedReq.reason}"</p>
                        </div>

                        {/* Specific Request Detail Types */}
                        {unifiedReq.type === 'permission_to_leave' && (
                          <div className="space-y-3 pt-2 border-t border-border">
                            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Permission Details</h4>
                            <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Away Time:</span>
                                <span className="font-mono text-foreground">{formatToHHMM(unifiedReq.interruption_start_time)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Resume Time:</span>
                                <span className="font-mono text-foreground">{formatToHHMM(unifiedReq.interruption_end_time)}</span>
                              </div>
                              <div className="flex justify-between border-t border-border/50 pt-1 mt-1 font-semibold text-foreground">
                                <span className="text-muted-foreground">Total Period Duration:</span>
                                <span className="font-mono">
                                  {formatDuration(getDurationMins(unifiedReq.interruption_start_time, unifiedReq.interruption_end_time))}
                                </span>
                              </div>
                            </div>

                            {isPending && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-foreground block">Accepted Paid Duration (HH:MM)</label>
                                <input
                                  type="text"
                                  placeholder="HH:MM"
                                  value={acceptedDurationHHMM}
                                  onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                                  className="w-32 px-3 py-1.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground">Specify the paid duration of the permission.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {unifiedReq.type === 'shift_interruption_review' && (
                          <div className="space-y-3 pt-2 border-t border-border">
                            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Interruption Details</h4>
                            <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Start Gap:</span>
                                <span className="font-mono text-foreground">{formatToHHMM(unifiedReq.interruption_start_time)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">End Gap:</span>
                                <span className="font-mono text-foreground">{formatToHHMM(unifiedReq.interruption_end_time)}</span>
                              </div>
                              <div className="flex justify-between border-t border-border/50 pt-1 mt-1 font-semibold text-foreground">
                                <span className="text-muted-foreground">Gap Duration:</span>
                                <span className="font-mono">
                                  {formatDuration(getDurationMins(unifiedReq.interruption_start_time, unifiedReq.interruption_end_time))}
                                </span>
                              </div>
                            </div>

                            {isPending && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-foreground block">Accepted Paid Duration (HH:MM)</label>
                                <input
                                  type="text"
                                  placeholder="HH:MM"
                                  value={acceptedDurationHHMM}
                                  onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                                  className="w-32 px-3 py-1.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground">Specify the paid duration of the interruption.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {unifiedReq.type === 'overtime_approval' && (
                          <div className="space-y-3 pt-2 border-t border-border">
                            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Overtime Details</h4>
                            <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Actual Clock In:</span>
                                <span className="font-mono text-foreground">{formatToHHMM(unifiedReq.original_check_in)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Actual Clock Out:</span>
                                <span className="font-mono text-foreground">{formatToHHMM(unifiedReq.original_check_out)}</span>
                              </div>
                              <div className="flex justify-between border-t border-border/50 pt-1 mt-1 font-semibold text-foreground">
                                <span className="text-muted-foreground">Total Working Duration:</span>
                                <span className="font-mono">
                                  {formatDuration(getDurationMins(unifiedReq.original_check_in, unifiedReq.original_check_out))}
                                </span>
                              </div>
                            </div>

                            {isPending && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-foreground block">Accepted Overtime Duration (HH:MM)</label>
                                <input
                                  type="text"
                                  placeholder="HH:MM"
                                  value={acceptedDurationHHMM}
                                  onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                                  className="w-32 px-3 py-1.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground">Specify the approved overtime duration.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {unifiedReq.type === 'early_leave_approval' && (
                          <div className="space-y-3 pt-2 border-t border-border">
                            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Early Leave Details</h4>
                            <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Clock Out Time:</span>
                                <span className="font-mono text-foreground">{formatToHHMM(unifiedReq.original_check_out)}</span>
                              </div>
                              <div className="flex justify-between border-t border-border/50 pt-1 mt-1 font-semibold text-foreground">
                                <span className="text-muted-foreground">Missing Duration:</span>
                                <span className="font-mono">
                                  {formatDuration(parsedDetails.missing_minutes || parsedDetails.early_leave_minutes || 0)}
                                </span>
                              </div>
                            </div>

                            {isPending && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-foreground block">Accepted Paid Duration (HH:MM)</label>
                                <input
                                  type="text"
                                  placeholder="HH:MM"
                                  value={acceptedDurationHHMM}
                                  onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                                  className="w-32 px-3 py-1.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground">Specify the paid duration for early checkout.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {unifiedReq.type === 'late_in_approval' && (
                          <div className="space-y-3 pt-2 border-t border-border">
                            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Late In Details</h4>
                            <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Clock In Time:</span>
                                <span className="font-mono text-foreground">{formatToHHMM(unifiedReq.original_check_in)}</span>
                              </div>
                              <div className="flex justify-between border-t border-border/50 pt-1 mt-1 font-semibold text-foreground">
                                <span className="text-muted-foreground">Missing Duration:</span>
                                <span className="font-mono font-medium">
                                  {(() => {
                                    const mins = parsedDetails.missing_minutes || parsedDetails.late_in_minutes || 0;
                                    if (mins > 0) return formatDuration(mins);
                                    if (unifiedReq.original_check_in && unifiedReq.shift_start_time) {
                                      return formatDuration(getDurationMins(unifiedReq.shift_start_time, unifiedReq.original_check_in));
                                    }
                                    return '--:--';
                                  })()}
                                </span>
                              </div>
                            </div>

                            {isPending && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-foreground block">Accepted Paid Duration (HH:MM)</label>
                                <input
                                  type="text"
                                  placeholder="HH:MM"
                                  value={acceptedDurationHHMM}
                                  onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                                  className="w-32 px-3 py-1.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground">Specify the paid duration for late entry.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {unifiedReq.type === 'attendance_correction' && (
                          <div className="space-y-4 pt-2 border-t border-border">
                            <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Correction Details</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-muted/30 p-3 rounded-lg border border-border">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Original</label>
                                <div className="space-y-2">
                                  <div>
                                    <span className="text-[10px] text-muted-foreground">Clock In:</span>
                                    <p className="font-mono text-xs text-foreground">{formatToHHMM(unifiedReq.original_check_in)}</p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-muted-foreground">Clock Out:</span>
                                    <p className="font-mono text-xs text-foreground">{formatToHHMM(unifiedReq.original_check_out)}</p>
                                  </div>
                                  <div className="border-t border-border/50 pt-1 mt-1">
                                    <span className="text-[10px] text-muted-foreground">Duration:</span>
                                    <p className="font-mono text-xs text-foreground font-semibold">
                                      {formatDuration(getDurationMins(unifiedReq.original_check_in, unifiedReq.original_check_out))}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                                <label className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 block">Proposed</label>
                                <div className="space-y-2">
                                  <div>
                                    <span className="text-[10px] text-muted-foreground">Clock In:</span>
                                    <p className="font-mono text-xs font-semibold text-foreground">
                                      {formatToHHMM(parsedDetails.new_clock_in)}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-muted-foreground">Clock Out:</span>
                                    <p className="font-mono text-xs font-semibold text-foreground">
                                      {formatToHHMM(parsedDetails.new_clock_out)}
                                    </p>
                                  </div>
                                  <div className="border-t border-primary/20 pt-1 mt-1">
                                    <span className="text-[10px] text-muted-foreground">Duration:</span>
                                    <p className="font-mono text-xs text-primary font-bold">
                                      {formatDuration(getDurationMins(parsedDetails.new_clock_in, parsedDetails.new_clock_out))}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {!isPending && (
                          <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1.5 text-xs pt-2 border-t border-border mt-2">
                            <h4 className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Resolution Details</h4>
                            {unifiedReq.status === 'approved' && (
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Status:</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">Approved</span>
                              </div>
                            )}
                            {unifiedReq.status === 'rejected' && (
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Status:</span>
                                <span className="font-bold text-rose-600 dark:text-rose-400">Rejected</span>
                              </div>
                            )}
                            {unifiedReq.type === 'overtime_approval' && parsedDetails.approved_minutes !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Approved Overtime:</span>
                                <span className="font-mono font-semibold">{formatDuration(parsedDetails.approved_minutes)}</span>
                              </div>
                            )}
                            {['permission_to_leave', 'shift_interruption_review', 'early_leave_approval', 'late_in_approval'].includes(unifiedReq.type || '') && parsedDetails.paid_permission_minutes !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Approved Paid Duration:</span>
                                <span className="font-mono font-semibold">{formatDuration(parsedDetails.paid_permission_minutes)}</span>
                              </div>
                            )}
                            {unifiedReq.status === 'rejected' && parsedDetails.penalty_hours !== undefined && parsedDetails.penalty_hours > 0 && (
                              <div className="flex justify-between text-destructive">
                                <span>Disciplinary Penalty:</span>
                                <span className="font-mono font-bold">{parsedDetails.penalty_hours} Hours</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-2 pt-4 border-t border-border">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-foreground">Manager Justification <span className="text-destructive">*</span></label>
                            {isPending && (
                              <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 rounded uppercase">Required for Payroll Audit</span>
                            )}
                          </div>
                          <textarea
                            value={managerNote}
                            onChange={(e) => {
                              setManagerNote(e.target.value);
                              if (e.target.value.trim()) setError(null);
                            }}
                            disabled={!isPending}
                            placeholder="Provide justification for payroll audits..."
                            className={`w-full px-3 py-2 bg-amber-50/10 dark:bg-amber-500/5 border-2 rounded-xl min-h-[90px] text-xs focus:ring-4 focus:ring-primary/10 outline-none resize-none transition-all disabled:opacity-50 ${
                              error ? 'border-destructive' : 'border-amber-200 dark:border-amber-500/20'
                            }`}
                          />
                          {error && <p className="text-xs text-destructive font-bold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> {error}
                          </p>}
                          <p className="text-[10px] text-muted-foreground italic">
                            This note will be attached to the payroll transaction and visible to the employee.
                          </p>
                        </div>

                        {/* Actions Box */}
                        {isPending && user?.role === 'manager' && (
                          <div className="pt-4 border-t border-border space-y-3">
                            {isRejecting && ['permission_to_leave', 'shift_interruption_review', 'early_leave_approval', 'late_in_approval'].includes(unifiedReq.type || '') && (
                              <div className="bg-destructive/5 p-3 rounded-xl border border-destructive/20 space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={applyPenalty}
                                    onChange={(e) => {
                                      setApplyPenalty(e.target.checked);
                                      if (e.target.checked) {
                                        setPenaltyDurationHHMM('00:00');
                                      }
                                    }}
                                    className="w-3.5 h-3.5 rounded border-destructive/30 text-destructive focus:ring-destructive/20 bg-background"
                                  />
                                  <span className="text-xs font-bold text-destructive">
                                    Apply Extra Disciplinary Penalty?
                                  </span>
                                </label>
                                {applyPenalty && (
                                  <div className="space-y-1.5 pl-5">
                                    <label className="text-[10px] font-bold text-destructive/80 block">
                                      Extra Penalty Duration (HH:MM)
                                    </label>
                                    <input
                                      type="text"
                                      value={penaltyDurationHHMM}
                                      onChange={(e) => setPenaltyDurationHHMM(e.target.value)}
                                      placeholder="01:00"
                                      className="w-24 px-2 py-1 bg-background border border-destructive/30 rounded-lg focus:ring-2 focus:ring-destructive/20 outline-none font-mono text-xs text-destructive"
                                    />
                                    <p className="text-[9px] text-muted-foreground italic">
                                      Additional deduction on top of unpaid absence (e.g. 01:00 = 1 hr deduction).
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex gap-2">
                              {!isRejecting ? (
                                <>
                                  <button
                                    onClick={() => setIsRejecting(true)}
                                    className="flex-1 px-3 py-2 bg-destructive/10 text-destructive text-xs font-semibold rounded-xl hover:bg-destructive/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <XCircle className="w-4 h-4" /> Reject
                                  </button>
                                  <button
                                    onClick={() => handleApproveClick(unifiedReq)}
                                    disabled={updateStatusMutation.isPending || !managerNote.trim()}
                                    className="flex-1 px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/95 shadow-md shadow-primary/10 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    <CheckCircle className="w-4 h-4" /> Approve
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setIsRejecting(false)}
                                    className="px-3 py-2 bg-muted text-muted-foreground text-xs font-semibold rounded-xl hover:bg-muted/80 transition-all cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleRejectClick(unifiedReq)}
                                    disabled={updateStatusMutation.isPending || !managerNote.trim()}
                                    className="flex-1 px-3 py-2 bg-destructive text-white text-xs font-semibold rounded-xl hover:bg-destructive/95 shadow-md shadow-destructive/10 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    <XCircle className="w-4 h-4" /> Confirm Rejection
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              // ATTENDANCE LOG DETAILS VIEW
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Date & Overall Status Badge */}
                <div className="flex justify-between items-center bg-muted/20 border border-border p-3.5 rounded-xl">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Log Date</span>
                    <span className="text-sm font-semibold text-foreground">
                      {formatDisplayDate(selectedLog.check_in, user?.display_timezone)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block text-right">Overall Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold inline-block ${
                      getDisplayStatus(selectedLog) === 'on_time' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                      getDisplayStatus(selectedLog) === 'late_in' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' :
                      getDisplayStatus(selectedLog) === 'early_out' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                      getDisplayStatus(selectedLog) === 'incomplete' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                      getDisplayStatus(selectedLog) === 'unscheduled' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400'
                    }`}>
                      {formatStatusLabel(getDisplayStatus(selectedLog))}
                    </span>
                  </div>
                </div>

                {/* Visual Timeline Tracker */}
                <div className="p-4 bg-muted/20 border border-border rounded-xl">
                  <h4 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Shift Timeline Activity
                  </h4>
                  <AttendanceTimeline log={selectedLog} showLabels={true} showStats={true} />
                </div>

                {/* Shift Details Card */}
                <div className="p-4 bg-muted/20 border border-border rounded-xl">
                  <h4 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Shift Comparison
                  </h4>
                  {selectedLog.shift_id && !selectedLog.shift_id.startsWith('US_') && selectedLog.shift_start_time ? (
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="bg-card p-3 rounded-lg border border-border/50 space-y-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Scheduled Shift</span>
                        <div className="space-y-1 font-medium">
                          <p className="flex justify-between">
                            <span className="text-muted-foreground">Start:</span>
                            <span className="font-mono text-foreground">{formatToHHMM(selectedLog.shift_start_time)}</span>
                          </p>
                          <p className="flex justify-between">
                            <span className="text-muted-foreground">End:</span>
                            <span className="font-mono text-foreground">{formatToHHMM(selectedLog.shift_end_time)}</span>
                          </p>
                          <p className="flex justify-between border-t border-border/50 pt-1 mt-1 font-semibold">
                            <span className="text-muted-foreground">Duration:</span>
                            <span className="font-mono text-foreground">
                              {formatDuration(getDurationMins(selectedLog.shift_start_time, selectedLog.shift_end_time))}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="bg-card p-3 rounded-lg border border-border/50 space-y-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Actual Clocked</span>
                        <div className="space-y-1 font-medium">
                          <p className="flex justify-between">
                            <span className="text-muted-foreground">Check-in:</span>
                            <span className={`font-mono ${
                              selectedLog.checkin_status === 'late_in' ? 'text-amber-500' : 'text-foreground'
                            }`}>{formatToHHMM(selectedLog.check_in)}</span>
                          </p>
                          <p className="flex justify-between">
                            <span className="text-muted-foreground">Check-out:</span>
                            <span className={`font-mono ${
                              selectedLog.checkout_status === 'early_out' ? 'text-orange-500' : 'text-foreground'
                            }`}>{selectedLog.check_out ? formatToHHMM(selectedLog.check_out) : 'Ongoing'}</span>
                          </p>
                          <p className="flex justify-between border-t border-border/50 pt-1 mt-1 font-semibold">
                            <span className="text-muted-foreground">Duration:</span>
                            <span className="font-mono text-foreground">
                              {selectedLog.check_out 
                                ? formatDuration(getDurationMins(selectedLog.check_in, selectedLog.check_out))
                                : 'Active Session'}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-xs flex gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-800 dark:text-amber-400 block mb-0.5">Unscheduled Session</span>
                        <p className="text-amber-700 dark:text-amber-300 leading-normal">
                          This attendance session was clocked without an active, scheduled shift. All clocked hours will be processed as unscheduled overtime pending HR review.
                        </p>
                        {selectedLog.shift_id && (
                          <span className="text-[10px] font-mono text-muted-foreground block mt-1">Shift ID: {selectedLog.shift_id}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Breaks Section */}
                <div className="p-4 bg-muted/20 border border-border rounded-xl">
                  <h4 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                    <Coffee className="w-4 h-4 text-primary" /> Breaks & Interruptions
                  </h4>
                  {selectedLog.breaks && selectedLog.breaks.length > 0 ? (
                    <div className="space-y-2">
                      {selectedLog.breaks.map((b: any, index: number) => {
                        const duration = b.end_time ? getDurationMins(b.start_time, b.end_time) : 0;
                        return (
                          <div key={b.id || index} className="flex justify-between items-center bg-card p-3 rounded-lg border border-border/50 text-xs">
                            <div className="space-y-0.5">
                              <div className="font-mono font-medium text-foreground">
                                {formatToHHMM(b.start_time)} - {b.end_time ? formatToHHMM(b.end_time) : 'Ongoing'}
                              </div>
                              <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
                                {b.type === 'step_away' ? 'Step Away' : b.type?.replace(/_/g, ' ') || 'Break'}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-foreground">
                                {b.end_time ? formatDuration(duration) : 'In Progress'}
                              </span>
                              <div className="mt-0.5">
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                  b.status === 'manager_approved' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                                  b.status === 'manager_rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                                  'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                                }`}>
                                  {b.status === 'manager_approved' ? 'Approved' : b.status === 'manager_rejected' ? 'Rejected' : 'Pending'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No breaks recorded for this session.</p>
                  )}
                </div>

                {/* Geolocations Section */}
                <div className="p-4 bg-muted/20 border border-border rounded-xl">
                  <h4 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" /> GPS Location Checkpoints
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-card p-3 rounded-lg border border-border/50 space-y-1">
                      <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Check-in Location</span>
                      {selectedLog.check_in_lat !== null && selectedLog.check_in_lng !== null ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-mono truncate text-foreground">{selectedLog.check_in_lat.toFixed(5)}, {selectedLog.check_in_lng.toFixed(5)}</p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedLog.check_in_lat},${selectedLog.check_in_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                          >
                            View Map <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No coordinate data</p>
                      )}
                    </div>
                    <div className="bg-card p-3 rounded-lg border border-border/50 space-y-1">
                      <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Check-out Location</span>
                      {selectedLog.check_out_lat !== null && selectedLog.check_out_lng !== null ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-mono truncate text-foreground">{selectedLog.check_out_lat.toFixed(5)}, {selectedLog.check_out_lng.toFixed(5)}</p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedLog.check_out_lat},${selectedLog.check_out_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                          >
                            View Map <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No coordinate data</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Associated Requests Section */}
                <div className="p-4 bg-muted/20 border border-border rounded-xl">
                  <h4 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Shift & Payroll Requests
                  </h4>
                  {selectedLog.requests && selectedLog.requests.length > 0 ? (
                    <div className="space-y-2.5">
                      {selectedLog.requests.map((req: any) => {
                        const isPending = req.status === 'pending';
                        const showReviewButton = isPending && user?.role === 'manager';
                        return (
                          <div key={req.id} className="bg-card p-3 rounded-lg border border-border/50 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary">
                                  {req.type?.replace(/_/g, ' ') || 'Request'}
                                </span>
                                <p className="text-xs text-muted-foreground mt-1 font-medium italic">"{req.reason}"</p>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                                req.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                                req.status === 'canceled' ? 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400' :
                                'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                              }`}>
                                {req.status}
                              </span>
                            </div>
                            {req.manager_note && (
                              <div className="bg-muted/30 p-2 rounded text-xs text-muted-foreground border border-border/30">
                                <span className="font-bold text-[9px] block uppercase text-foreground/75 mb-0.5">Manager Justification:</span>
                                "{req.manager_note}"
                              </div>
                            )}
                            {showReviewButton ? (
                              <button
                                onClick={() => {
                                  const unifiedReq = getUnifiedRequest(req, selectedLog);
                                  setSelectedRequestId(req.id);
                                  setManagerNote('');
                                  setError(null);
                                  setPenaltyDurationHHMM('00:00');
                                  setApplyPenalty(false);
                                  setShowConfirmStep(false);
                                  setConfirmActionType(null);
                                  setIsRejecting(false);

                                  let initialMins = unifiedReq.value || 0;
                                  if ((unifiedReq.type === 'permission_to_leave' || unifiedReq.type === 'shift_interruption_review') && !initialMins) {
                                    initialMins = getDurationMins(unifiedReq.interruption_start_time, unifiedReq.interruption_end_time);
                                  } else if (unifiedReq.type === 'late_in_approval' && !initialMins && unifiedReq.original_check_in && unifiedReq.shift_start_time) {
                                    initialMins = getDurationMins(unifiedReq.shift_start_time, unifiedReq.original_check_in);
                                  }
                                  setAcceptedDurationHHMM(formatDuration(initialMins));
                                }}
                                className="w-full mt-1.5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Action Required: Review Request
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  const unifiedReq = getUnifiedRequest(req, selectedLog);
                                  setSelectedRequestId(req.id);
                                  setManagerNote(unifiedReq.manager_note || '');
                                  setError(null);
                                  setPenaltyDurationHHMM('00:00');
                                  setApplyPenalty(false);
                                  setShowConfirmStep(false);
                                  setConfirmActionType(null);
                                  setIsRejecting(false);

                                  let initialMins = unifiedReq.paid_minutes || unifiedReq.approved_minutes || unifiedReq.value || 0;
                                  setAcceptedDurationHHMM(formatDuration(initialMins));
                                }}
                                className="w-full mt-1.5 py-1.5 bg-muted text-muted-foreground text-xs font-semibold rounded-lg hover:bg-muted/80 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Info className="w-3.5 h-3.5" /> View Request Details
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No associated payroll or shift requests.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
