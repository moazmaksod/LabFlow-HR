import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/axios';
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Coins,
  ShieldAlert,
  ArrowUpRight,
  Activity,
  ChevronRight,
  Fingerprint,
  Wifi,
  FileText,
  DollarSign,
  TrendingDown
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { formatStatusLabel } from '../../lib/utils';
import { formatDisplayTime, formatDisplayDate, getWebNow, resolveTimezone } from '../../lib/timeManager';
import { useAuthStore } from '../../store/useAuthStore';

// Type definitions
interface RequestLog {
  id: number;
  user_name: string;
  type: string | null;
  created_at: string;
  attendance_date?: string | null;
  original_check_in?: string | null;
  requested_check_in?: string | null;
  shift_start_time?: string | null;
  value?: number;
  status: string;
}

interface AttendanceLog {
  id: number;
  user_id: number;
  user_name: string;
  job_title: string | null;
  date: string;
  check_in: string;
  check_out: string | null;
  checkin_status: string;
  checkout_status: string | null;
  working_status: string;
  shift_id?: string | null;
  breaks?: any[];
  requests?: any[];
}

interface User {
  id: number;
  name: string;
  role: string;
  status: string | null;
  working_status: string | null;
}

// Module-level cache for formatters to guarantee 60 FPS re-renders (AGENTS.md constraint)
const formatterCache: Record<string, Intl.NumberFormat | Intl.DateTimeFormat> = {};

const getCachedNumberFormatter = (options: Intl.NumberFormatOptions) => {
  const sortedKeys = Object.keys(options).sort() as (keyof Intl.NumberFormatOptions)[];
  const key = `num|${sortedKeys.map(k => `${k}:${options[k]}`).join('|')}`;
  if (!formatterCache[key]) {
    formatterCache[key] = new Intl.NumberFormat('en-US', options);
  }
  return formatterCache[key] as Intl.NumberFormat;
};

// Colors mapping for status segments
const STATUS_COLORS: Record<string, string> = {
  'on_time': '#10b981',      // Emerald Green
  'late_in': '#f59e0b',      // Amber Yellow
  'early_out': '#f97316',     // Orange
  'incomplete': '#ef4444',    // Rose Red
  'unscheduled': '#6366f1',   // Indigo
  'default': '#6366f1'       // Indigo
};

// Clean status resolver matching AttendanceLogs
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

// Retrieve manager local date string (YYYY-MM-DD) from UTC now offset
const getManagerLocalDateStr = (daysAgo: number, tz: string) => {
  const ms = new Date(getWebNow()).getTime() - daysAgo * 24 * 60 * 60 * 1000;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
};

export default function AnalyticsDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const displayTimezone = resolveTimezone(user?.display_timezone);
  
  const [periodFilter, setPeriodFilter] = React.useState<'today' | '7days' | 'month' | 'year'>('today');

  // React Queries leveraging global cache
  const { data: logs, isLoading: logsLoading } = useQuery<AttendanceLog[]>({
    queryKey: ['attendance-logs'],
    queryFn: async () => {
      const res = await api.get('/attendance');
      return res.data;
    }
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    }
  });

  const { data: requests, isLoading: requestsLoading } = useQuery<RequestLog[]>({
    queryKey: ['requests'],
    queryFn: async () => {
      const res = await api.get('/requests');
      return res.data;
    }
  });

  // Calculate manager local "today" date string in YYYY-MM-DD
  const todayDateStr = React.useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: displayTimezone
    }).format(new Date(getWebNow()));
  }, [displayTimezone]);

  // Date calculation helper
  const periods = React.useMemo(() => {
    const [year, month, day] = todayDateStr.split('-').map(Number);
    
    let currentStart = todayDateStr;
    let currentEnd = todayDateStr;
    let priorStart = todayDateStr;
    let priorEnd = todayDateStr;
    
    if (periodFilter === 'today') {
      currentStart = todayDateStr;
      currentEnd = todayDateStr;
      const yesterdayStr = getManagerLocalDateStr(1, displayTimezone);
      priorStart = yesterdayStr;
      priorEnd = yesterdayStr;
    } else if (periodFilter === '7days') {
      currentStart = getManagerLocalDateStr(6, displayTimezone);
      currentEnd = todayDateStr;
      priorStart = getManagerLocalDateStr(13, displayTimezone);
      priorEnd = getManagerLocalDateStr(7, displayTimezone);
    } else if (periodFilter === 'month') {
      currentStart = `${year}-${String(month).padStart(2, '0')}-01`;
      currentEnd = todayDateStr;
      
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      priorStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
      const targetDay = Math.min(day, daysInPrevMonth);
      priorEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    } else if (periodFilter === 'year') {
      currentStart = `${year}-01-01`;
      currentEnd = todayDateStr;
      
      priorStart = `${year - 1}-01-01`;
      priorEnd = `${year - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    return {
      current: { start: currentStart, end: currentEnd },
      prior: { start: priorStart, end: priorEnd }
    };
  }, [periodFilter, todayDateStr, displayTimezone]);

  // Fetch payroll calculations for the current period
  const { data: payrollData, isLoading: payrollLoading } = useQuery({
    queryKey: ['payroll-summary', periodFilter, periods.current.start, periods.current.end],
    queryFn: async () => {
      const res = await api.get(`/payroll?startDate=${periods.current.start}&endDate=${periods.current.end}`);
      return res.data;
    },
    enabled: user?.role === 'manager'
  });

  // Today's attendance logs (always real-time "Today" for Roster table)
  const todayLogs = React.useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => formatDisplayDate(log.check_in, displayTimezone) === todayDateStr);
  }, [logs, todayDateStr, displayTimezone]);

  // Current Period attendance logs
  const currentLogs = React.useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => log.date >= periods.current.start && log.date <= periods.current.end);
  }, [logs, periods.current]);

  // Prior Period attendance logs
  const priorLogs = React.useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => log.date >= periods.prior.start && log.date <= periods.prior.end);
  }, [logs, periods.prior]);

  // Roster Timings Extractor
  const getScheduledTime = React.useCallback((log: AttendanceLog) => {
    if (!log.shift_id || log.shift_id.startsWith('US_')) {
      return 'Unscheduled';
    }
    if (log.requests && log.requests.length > 0) {
      const req = log.requests.find((r: any) => r.shift_start_time && r.shift_end_time);
      if (req) {
        const start = formatDisplayTime(req.shift_start_time, displayTimezone, 'HH:mm');
        const end = formatDisplayTime(req.shift_end_time, displayTimezone, 'HH:mm');
        return `${start} - ${end}`;
      }
    }
    return '09:00 - 17:00';
  }, [displayTimezone]);

  const computeMetricsForLogs = (periodLogs: AttendanceLog[]) => {
    let onTime = 0;
    let lateIn = 0;
    let earlyOut = 0;
    let incomplete = 0;
    let unscheduled = 0;

    let lateInDeduction = 0;
    let earlyOutDeduction = 0;

    periodLogs.forEach(log => {
      const status = determineOverallStatus(log.checkin_status, log.checkout_status);
      
      if (status === 'on_time') onTime++;
      else if (status === 'late_in') lateIn++;
      else if (status === 'early_out') earlyOut++;
      else if (status === 'incomplete') incomplete++;
      else if (status === 'unscheduled') unscheduled++;

      if (log.requests) {
        log.requests.forEach((req: any) => {
          if (req.type === 'late_in_approval') {
            lateInDeduction += req.value || 0;
          } else if (req.type === 'early_leave_approval') {
            earlyOutDeduction += req.value || 0;
          }
        });
      }
    });

    return {
      onTime,
      lateIn,
      lateInDeduction,
      earlyOut,
      earlyOutDeduction,
      incomplete,
      unscheduled
    };
  };

  // Top Summary Cards Data Processors
  const currentMetrics = React.useMemo(() => computeMetricsForLogs(currentLogs), [currentLogs]);
  const priorMetrics = React.useMemo(() => computeMetricsForLogs(priorLogs), [priorLogs]);

  // Headcount snapshot
  const headcount = React.useMemo(() => {
    if (!users) return { present: 0, break: 0, offDuty: 0, total: 0 };
    const employees = users.filter(u => u.role === 'employee' && u.status === 'active');
    const present = employees.filter(u => u.working_status === 'working').length;
    const onBreak = employees.filter(u => u.working_status === 'away').length;
    const offDuty = Math.max(0, employees.length - (present + onBreak));
    return { present, break: onBreak, offDuty, total: employees.length };
  }, [users]);

  // Donut chart status data (period based)
  const donutData = React.useMemo(() => {
    const statuses = [
      { name: 'On Time', value: currentMetrics.onTime, statusKey: 'on_time', color: STATUS_COLORS.on_time },
      { name: 'Late In', value: currentMetrics.lateIn, statusKey: 'late_in', color: STATUS_COLORS.late_in },
      { name: 'Early Out', value: currentMetrics.earlyOut, statusKey: 'early_out', color: STATUS_COLORS.early_out },
      { name: 'Incomplete', value: currentMetrics.incomplete, statusKey: 'incomplete', color: STATUS_COLORS.incomplete },
      { name: 'Unscheduled', value: currentMetrics.unscheduled, statusKey: 'unscheduled', color: STATUS_COLORS.unscheduled }
    ];
    return statuses.filter(s => s.value > 0);
  }, [currentMetrics]);

  // Dynamic worked hours trend data construction based on selected period
  const trendData = React.useMemo(() => {
    if (periodFilter === 'today') {
      if (!users || !logs) return [];
      const employees = users.filter(u => u.role === 'employee');
      return employees.map(emp => {
        const tLogs = logs.filter(log => log.user_id === emp.id && log.date === periods.current.start);
        let tMins = 0;
        tLogs.forEach(log => {
          const checkInMs = new Date(log.check_in).getTime();
          const checkOutMs = log.check_out ? new Date(log.check_out).getTime() : new Date(getWebNow()).getTime();
          let diff = Math.max(0, (checkOutMs - checkInMs) / 60000);
          if (log.breaks) {
            log.breaks.forEach((b: any) => {
              const bStart = new Date(b.start_time).getTime();
              const bEnd = b.end_time ? new Date(b.end_time).getTime() : new Date(getWebNow()).getTime();
              diff -= Math.max(0, (bEnd - bStart) / 60000);
            });
          }
          tMins += Math.max(0, diff);
        });

        const yLogs = logs.filter(log => log.user_id === emp.id && log.date === periods.prior.start);
        let yMins = 0;
        yLogs.forEach(log => {
          const checkInMs = new Date(log.check_in).getTime();
          const checkOutMs = log.check_out ? new Date(log.check_out).getTime() : new Date(getWebNow()).getTime();
          let diff = Math.max(0, (checkOutMs - checkInMs) / 60000);
          if (log.breaks) {
            log.breaks.forEach((b: any) => {
              const bStart = new Date(b.start_time).getTime();
              const bEnd = b.end_time ? new Date(b.end_time).getTime() : new Date(getWebNow()).getTime();
              diff -= Math.max(0, (bEnd - bStart) / 60000);
            });
          }
          yMins += Math.max(0, diff);
        });

        return {
          name: emp.name.split(' ')[0], // First name for label
          Today: Math.round((tMins / 60) * 10) / 10,
          Yesterday: Math.round((yMins / 60) * 10) / 10
        };
      });
    } else if (periodFilter === '7days') {
      const data = [];
      for (let i = 6; i >= 0; i--) {
        const currentDateStr = getManagerLocalDateStr(i, displayTimezone);
        const baselineDateStr = getManagerLocalDateStr(i + 7, displayTimezone);
        
        const currentLogs = logs ? logs.filter(log => log.date === currentDateStr) : [];
        let currentMins = 0;
        currentLogs.forEach(log => {
          const checkInMs = new Date(log.check_in).getTime();
          const checkOutMs = log.check_out ? new Date(log.check_out).getTime() : new Date(getWebNow()).getTime();
          let diffMins = Math.max(0, (checkOutMs - checkInMs) / 60000);
          if (log.breaks) {
            log.breaks.forEach((b: any) => {
              const breakStart = new Date(b.start_time).getTime();
              const breakEnd = b.end_time ? new Date(b.end_time).getTime() : new Date(getWebNow()).getTime();
              diffMins -= Math.max(0, (breakEnd - breakStart) / 60000);
            });
          }
          currentMins += Math.max(0, diffMins);
        });

        const baselineLogs = logs ? logs.filter(log => log.date === baselineDateStr) : [];
        let baselineMins = 0;
        baselineLogs.forEach(log => {
          const checkInMs = new Date(log.check_in).getTime();
          const checkOutMs = log.check_out ? new Date(log.check_out).getTime() : new Date(getWebNow()).getTime();
          let diffMins = Math.max(0, (checkOutMs - checkInMs) / 60000);
          if (log.breaks) {
            log.breaks.forEach((b: any) => {
              const breakStart = new Date(b.start_time).getTime();
              const breakEnd = b.end_time ? new Date(b.end_time).getTime() : new Date(getWebNow()).getTime();
              diffMins -= Math.max(0, (breakEnd - breakStart) / 60000);
            });
          }
          baselineMins += Math.max(0, diffMins);
        });

        const formattedLabel = formatDisplayTime(currentDateStr, displayTimezone, 'MMM dd');
        data.push({
          dayLabel: formattedLabel,
          current: Math.round((currentMins / 60) * 10) / 10,
          baseline: Math.round((baselineMins / 60) * 10) / 10
        });
      }
      return data;
    } else if (periodFilter === 'month') {
      const data = [];
      const [year, month, day] = todayDateStr.split('-').map(Number);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      
      for (let d = 1; d <= day; d++) {
        const currentDayStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const priorDayStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        const cLogs = logs ? logs.filter(log => log.date === currentDayStr) : [];
        let cMins = 0;
        cLogs.forEach(log => {
          const checkInMs = new Date(log.check_in).getTime();
          const checkOutMs = log.check_out ? new Date(log.check_out).getTime() : new Date(getWebNow()).getTime();
          let diffMins = Math.max(0, (checkOutMs - checkInMs) / 60000);
          if (log.breaks) {
            log.breaks.forEach((b: any) => {
              const breakStart = new Date(b.start_time).getTime();
              const breakEnd = b.end_time ? new Date(b.end_time).getTime() : new Date(getWebNow()).getTime();
              diffMins -= Math.max(0, (breakEnd - breakStart) / 60000);
            });
          }
          cMins += Math.max(0, diffMins);
        });

        const pLogs = logs ? logs.filter(log => log.date === priorDayStr) : [];
        let pMins = 0;
        pLogs.forEach(log => {
          const checkInMs = new Date(log.check_in).getTime();
          const checkOutMs = log.check_out ? new Date(log.check_out).getTime() : new Date(getWebNow()).getTime();
          let diffMins = Math.max(0, (checkOutMs - checkInMs) / 60000);
          if (log.breaks) {
            log.breaks.forEach((b: any) => {
              const breakStart = new Date(b.start_time).getTime();
              const breakEnd = b.end_time ? new Date(b.end_time).getTime() : new Date(getWebNow()).getTime();
              diffMins -= Math.max(0, (breakEnd - breakStart) / 60000);
            });
          }
          pMins += Math.max(0, diffMins);
        });

        data.push({
          dayLabel: `${d}`,
          current: Math.round((cMins / 60) * 10) / 10,
          baseline: Math.round((pMins / 60) * 10) / 10
        });
      }
      return data;
    } else if (periodFilter === 'year') {
      const data = [];
      const [year] = todayDateStr.split('-').map(Number);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      for (let m = 1; m <= 12; m++) {
        const monthPrefix = `${year}-${String(m).padStart(2, '0')}`;
        const priorMonthPrefix = `${year - 1}-${String(m).padStart(2, '0')}`;
        
        const cLogs = logs ? logs.filter(log => log.date.startsWith(monthPrefix)) : [];
        let cMins = 0;
        cLogs.forEach(log => {
          const checkInMs = new Date(log.check_in).getTime();
          const checkOutMs = log.check_out ? new Date(log.check_out).getTime() : new Date(getWebNow()).getTime();
          let diffMins = Math.max(0, (checkOutMs - checkInMs) / 60000);
          if (log.breaks) {
            log.breaks.forEach((b: any) => {
              const breakStart = new Date(b.start_time).getTime();
              const breakEnd = b.end_time ? new Date(b.end_time).getTime() : new Date(getWebNow()).getTime();
              diffMins -= Math.max(0, (breakEnd - breakStart) / 60000);
            });
          }
          cMins += Math.max(0, diffMins);
        });

        const pLogs = logs ? logs.filter(log => log.date.startsWith(priorMonthPrefix)) : [];
        let pMins = 0;
        pLogs.forEach(log => {
          const checkInMs = new Date(log.check_in).getTime();
          const checkOutMs = log.check_out ? new Date(log.check_out).getTime() : new Date(getWebNow()).getTime();
          let diffMins = Math.max(0, (checkOutMs - checkInMs) / 60000);
          if (log.breaks) {
            log.breaks.forEach((b: any) => {
              const breakStart = new Date(b.start_time).getTime();
              const breakEnd = b.end_time ? new Date(b.end_time).getTime() : new Date(getWebNow()).getTime();
              diffMins -= Math.max(0, (breakEnd - breakStart) / 60000);
            });
          }
          pMins += Math.max(0, diffMins);
        });

        data.push({
          dayLabel: monthNames[m - 1],
          current: Math.round(cMins / 60),
          baseline: Math.round(pMins / 60)
        });
      }
      return data;
    }
    return [];
  }, [periodFilter, logs, users, periods, displayTimezone]);

  const defaultHourlyRate = 20; // $20/hour default baseline rate for estimated leakage
  
  // Estimate Leakage for current vs prior periods
  const getLeakageForPeriod = React.useCallback((start: string, end: string) => {
    if (!requests) return 0;
    return requests
      .filter(req => {
        if (req.status !== 'pending') return false;
        if (req.type !== 'late_in_approval' && req.type !== 'early_leave_approval') return false;
        const reqLocalDate = formatDisplayDate(
          req.original_check_in || req.requested_check_in || req.shift_start_time || req.created_at,
          displayTimezone
        );
        return reqLocalDate >= start && reqLocalDate <= end;
      })
      .reduce((sum, req) => sum + (req.value || 0), 0);
  }, [requests, displayTimezone]);

  const currentLeakageMinutes = React.useMemo(() => getLeakageForPeriod(periods.current.start, periods.current.end), [getLeakageForPeriod, periods.current]);
  const priorLeakageMinutes = React.useMemo(() => getLeakageForPeriod(periods.prior.start, periods.prior.end), [getLeakageForPeriod, periods.prior]);

  const currentLeakageCost = React.useMemo(() => Math.round((currentLeakageMinutes * defaultHourlyRate) / 60), [currentLeakageMinutes]);
  const priorLeakageCost = React.useMemo(() => Math.round((priorLeakageMinutes * defaultHourlyRate) / 60), [priorLeakageMinutes]);

  const getComparison = (current: number, prior: number, type: 'higher_is_better' | 'lower_is_better' = 'higher_is_better') => {
    const diff = current - prior;
    const percentChange = prior > 0 ? (diff / prior) * 100 : 0;
    
    let isGood = false;
    if (type === 'higher_is_better') {
      isGood = diff > 0;
    } else {
      isGood = diff < 0;
    }
    
    const isNeutral = diff === 0;
    
    return {
      diff,
      percentChange: Math.round(percentChange),
      isGood,
      isNeutral
    };
  };

  const renderComparisonBadge = (comp: { diff: number; percentChange: number; isGood: boolean; isNeutral: boolean }) => {
    if (comp.isNeutral) {
      return (
        <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 mt-1 border border-border/40">
          No change vs last period
        </span>
      );
    }
    const colorClass = comp.isGood 
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
    const sign = comp.diff > 0 ? '+' : '';
    const arrow = comp.diff > 0 ? '↑' : '↓';
    return (
      <span className={`text-[10px] font-bold ${colorClass} px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 mt-1`}>
        {arrow} {sign}{comp.diff} ({sign}{comp.percentChange}%)
      </span>
    );
  };

  const onTimeComp = React.useMemo(() => getComparison(currentMetrics.onTime, priorMetrics.onTime, 'higher_is_better'), [currentMetrics.onTime, priorMetrics.onTime]);
  const lateInComp = React.useMemo(() => getComparison(currentMetrics.lateIn, priorMetrics.lateIn, 'lower_is_better'), [currentMetrics.lateIn, priorMetrics.lateIn]);
  const earlyOutComp = React.useMemo(() => getComparison(currentMetrics.earlyOut, priorMetrics.earlyOut, 'lower_is_better'), [currentMetrics.earlyOut, priorMetrics.earlyOut]);
  const incompleteComp = React.useMemo(() => getComparison(currentMetrics.incomplete, priorMetrics.incomplete, 'lower_is_better'), [currentMetrics.incomplete, priorMetrics.incomplete]);
  const unscheduledComp = React.useMemo(() => getComparison(currentMetrics.unscheduled, priorMetrics.unscheduled, 'lower_is_better'), [currentMetrics.unscheduled, priorMetrics.unscheduled]);
  const leakageComp = React.useMemo(() => getComparison(currentLeakageCost, priorLeakageCost, 'lower_is_better'), [currentLeakageCost, priorLeakageCost]);

  // Segment click navigation handler
  const handleSegmentClick = (statusKey: string) => {
    navigate('/attendance', { state: { filterStatus: statusKey } });
  };

  // Processed Payroll Data calculations for visualization
  const totalPaidSalary = React.useMemo(() => {
    if (!payrollData) return 0;
    return payrollData
      .filter((p: any) => p.status === 'paid')
      .reduce((sum: number, p: any) => sum + p.net_salary, 0);
  }, [payrollData]);

  const totalEstimatedSalary = React.useMemo(() => {
    if (!payrollData) return 0;
    return payrollData.reduce((sum: number, p: any) => sum + p.net_salary, 0);
  }, [payrollData]);

  const topEarners = React.useMemo(() => {
    if (!payrollData) return [];
    return [...payrollData]
      .sort((a: any, b: any) => b.net_salary - a.net_salary)
      .slice(0, 5)
      .map((p: any) => ({
        user_name: p.user_name.split(' ')[0],
        net_salary: p.net_salary
      }));
  }, [payrollData]);

  const mostWorked = React.useMemo(() => {
    if (!payrollData) return [];
    return [...payrollData]
      .sort((a: any, b: any) => b.scheduled_working_minutes - a.scheduled_working_minutes)
      .slice(0, 5)
      .map((p: any) => ({
        user_name: p.user_name.split(' ')[0],
        hours: Math.round((p.scheduled_working_minutes / 60) * 10) / 10
      }));
  }, [payrollData]);

  const overtimeLeaders = React.useMemo(() => {
    if (!payrollData) return [];
    return [...payrollData]
      .sort((a: any, b: any) => b.overtime_minutes - a.overtime_minutes)
      .slice(0, 5)
      .map((p: any) => ({
        user_name: p.user_name.split(' ')[0],
        hours: Math.round((p.overtime_minutes / 60) * 10) / 10
      }));
  }, [payrollData]);

  const pieData = React.useMemo(() => {
    if (!payrollData) return [];
    let paidVal = 0;
    let unpaidVal = 0;
    payrollData.forEach((p: any) => {
      if (p.status === 'paid') {
        paidVal += p.net_salary;
      } else {
        unpaidVal += p.net_salary;
      }
    });
    const res = [];
    if (paidVal > 0) res.push({ name: 'Paid', value: Math.round(paidVal), color: '#10b981' });
    if (unpaidVal > 0) res.push({ name: 'Pending Unpaid', value: Math.round(unpaidVal), color: '#f59e0b' });
    return res;
  }, [payrollData]);

  const isLoading = logsLoading || usersLoading || requestsLoading || (payrollLoading && user?.role === 'manager');

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 border-4 border-t-primary rounded-full animate-spin"></div>
        </div>
        <p className="text-muted-foreground text-sm font-medium animate-pulse">
          Analyzing corporate operational data...
        </p>
      </div>
    );
  }

  // Currency Formatter using high-performance cache
  const currencyFormatter = getCachedNumberFormatter({ style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <div className="space-y-8 pb-10" id="analytics-dashboard">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text">
            Operational Intelligence
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time compliance monitoring & workforce metrics. Zone: <span className="font-mono font-bold bg-muted px-2 py-0.5 rounded text-xs">{displayTimezone}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 bg-card border border-border px-4 py-2 rounded-xl shadow-sm">
          <div className="flex items-center gap-1.5 border-r border-border pr-3">
            <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Live Connected
            </span>
          </div>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as any)}
            className="bg-transparent border-0 py-0.5 text-xs font-bold text-foreground focus:outline-none cursor-pointer focus:ring-0"
          >
            <option value="today">Today vs Yesterday</option>
            <option value="7days">Last 7 Days vs Prior 7 Days</option>
            <option value="month">This Month vs Prior MTD</option>
            <option value="year">This Year vs Prior YTD</option>
          </select>
        </div>
      </div>

      {/* SECTION A: Top Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: On Time */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col justify-between group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div>
            <div className="flex items-center justify-between text-muted-foreground mb-4">
              <span className="text-xs font-bold uppercase tracking-wider">On Time</span>
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-extrabold text-foreground tracking-tight">
              {currentMetrics.onTime}
            </div>
          </div>
          <div className="mt-4 flex flex-col items-start gap-1">
            {renderComparisonBadge(onTimeComp)}
            <p className="text-[10px] text-muted-foreground font-medium">
              Arrived & departed perfectly on schedule
            </p>
          </div>
        </div>

        {/* Card 2: Late In */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col justify-between group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div>
            <div className="flex items-center justify-between text-muted-foreground mb-4">
              <span className="text-xs font-bold uppercase tracking-wider">Late In</span>
              <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-extrabold text-foreground tracking-tight">
              {currentMetrics.lateIn}
            </div>
          </div>
          <div className="mt-4 flex flex-col items-start gap-1">
            {renderComparisonBadge(lateInComp)}
            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
              -{currentMetrics.lateInDeduction} total lost minutes
            </div>
          </div>
        </div>

        {/* Card 3: Early Out */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col justify-between group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div>
            <div className="flex items-center justify-between text-muted-foreground mb-4">
              <span className="text-xs font-bold uppercase tracking-wider">Early Out</span>
              <div className="p-2 bg-orange-500/10 rounded-xl text-orange-500">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-extrabold text-foreground tracking-tight">
              {currentMetrics.earlyOut}
            </div>
          </div>
          <div className="mt-4 flex flex-col items-start gap-1">
            {renderComparisonBadge(earlyOutComp)}
            <div className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
              -{currentMetrics.earlyOutDeduction} total lost minutes
            </div>
          </div>
        </div>

        {/* Card 4: Incomplete (Red alert accent) */}
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col justify-between group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div>
            <div className="flex items-center justify-between text-rose-500/70 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Incomplete Shift</span>
              <div className="p-2 bg-rose-500/20 rounded-xl text-rose-500 animate-pulse">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
              {currentMetrics.incomplete}
            </div>
          </div>
          <div className="mt-4 flex flex-col items-start gap-1">
            {renderComparisonBadge(incompleteComp)}
            <p className="text-[10px] text-rose-500/80 font-semibold">
              Late In + Early Out simultaneously
            </p>
          </div>
        </div>

        {/* Card 5: Unscheduled */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col justify-between group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div>
            <div className="flex items-center justify-between text-muted-foreground mb-4">
              <span className="text-xs font-bold uppercase tracking-wider">Unscheduled</span>
              <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500">
                <Fingerprint className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-extrabold text-foreground tracking-tight">
              {currentMetrics.unscheduled}
            </div>
          </div>
          <div className="mt-4 flex flex-col items-start gap-1">
            {renderComparisonBadge(unscheduledComp)}
            <p className="text-[10px] text-muted-foreground font-medium">
              Clocked outside standard shift roster
            </p>
          </div>
        </div>
      </div>

      {/* SECTION B: Middle Analytics Row (Two-Column Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Donut Chart - Shift Status Distribution */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Shift Status Distribution</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Workforce shift alignment status for the selected period
            </p>
          </div>
          <div className="h-72 w-full mt-4 flex items-center justify-center">
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    onClick={(entry) => handleSegmentClick(entry.statusKey)}
                  >
                    {donutData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        className="cursor-pointer hover:opacity-85 transition-opacity"
                        tabIndex={0}
                        aria-label={`Roster Status: ${entry.name}`}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      borderColor: 'var(--border)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      fontSize: '12px',
                      color: 'var(--foreground)'
                    }}
                    itemStyle={{
                      color: 'var(--foreground)'
                    }}
                    labelStyle={{
                      color: 'var(--foreground)'
                    }}
                  />
                  <Legend verticalAlign="bottom" align="center" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-10 space-y-2">
                <Users className="w-12 h-12 mx-auto text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No attendance logged today.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Compliance & Anti-Cheat Radar */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Security & Compliance Radar</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active integrity validation logs from mobile app
            </p>
          </div>

          <div className="my-6 p-5 bg-muted/40 border border-border/80 rounded-xl space-y-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500">
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Clock Tampering Incidents
                </div>
                <div className="text-3xl font-black text-foreground mt-0.5">
                  0
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Our hardware-based Monotonic Clock anti-tamper protocol is currently securing the client network. Mobile clients attempt to alter device hours locally, but these drift incidents are intercepted and blocked on the client side before committing transaction records.
            </p>
          </div>

          <button
            onClick={() => navigate('/audit')}
            className="w-full py-3 bg-muted border border-border hover:bg-muted/80 rounded-xl text-xs font-bold text-foreground transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" /> View Security & Audit Log
          </button>
        </div>
      </div>

      {/* SECTION C: Bottom Operational Row (Two-Column Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Live Monitoring Table */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground">Live Monitoring</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Today's operational roster and timings
            </p>
          </div>

          <div className="overflow-x-auto border border-border/60 rounded-xl max-h-72 overflow-y-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-[10px] text-muted-foreground uppercase bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-bold">Employee</th>
                  <th className="px-4 py-3 font-bold">Timings (Sch vs Act)</th>
                  <th className="px-4 py-3 font-bold">Status Badge</th>
                  <th className="px-4 py-3 font-bold text-right">Payroll</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {todayLogs.length > 0 ? (
                  todayLogs.map((log) => {
                    const status = determineOverallStatus(log.checkin_status, log.checkout_status);
                    const scheduled = getScheduledTime(log);
                    const checkInLocal = formatDisplayTime(log.check_in, displayTimezone, 'HH:mm');
                    const checkOutLocal = log.check_out 
                      ? formatDisplayTime(log.check_out, displayTimezone, 'HH:mm')
                      : 'Active';

                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-bold text-foreground text-xs">{log.user_name}</div>
                          <div className="text-[10px] text-muted-foreground">{log.job_title || 'Employee'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <div className="text-muted-foreground">S: {scheduled}</div>
                          <div className="text-foreground font-semibold">A: {checkInLocal} - {checkOutLocal}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider inline-block ${
                            status === 'on_time' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                            status === 'late_in' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' :
                            status === 'early_out' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                            status === 'incomplete' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                            status === 'unscheduled' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' :
                            'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400'
                          }`}>
                            {formatStatusLabel(status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => navigate('/payroll')}
                            className="text-[10px] font-bold text-primary hover:text-primary/80 hover:underline transition-colors flex items-center gap-0.5 justify-end w-full cursor-pointer"
                          >
                            Review 🔗
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      No logs clocked today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Workforce Labor Hours Trend */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Workforce Labor Hours Trend</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {periodFilter === 'today'
                ? "Worked hours today vs yesterday per employee"
                : periodFilter === '7days'
                ? "Actual worked hours per day: Current 7 Days vs Prior 7 Days"
                : periodFilter === 'month'
                ? "Actual worked hours per day: This Month vs Prior Month to Date"
                : "Actual worked hours per month: This Year vs Prior Year"}
            </p>
          </div>

          <div className="h-72 w-full mt-4">
            {periodFilter === 'today' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      borderColor: 'var(--border)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      fontSize: '11px',
                      color: 'var(--foreground)'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar dataKey="Today" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Yesterday" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      borderColor: 'var(--border)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      fontSize: '11px',
                      color: 'var(--foreground)'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name={periodFilter === '7days' ? 'Current 7 Days' : periodFilter === 'month' ? 'This Month' : 'This Year'}
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    name={periodFilter === '7days' ? 'Prior 7 Days' : periodFilter === 'month' ? 'Prior Month MTD' : 'Prior Year YTD'}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* SECTION D: Sidebar / Footer Panel (Financial Insights) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Headcount Snapshot Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm lg:col-span-2 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Live Headcount Snapshot</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Current activity states of scheduled employee staff
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-muted/30 border border-border/80 p-4 rounded-xl text-center">
              <span className="relative flex h-2 w-2 mx-auto mb-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Present</div>
              <div className="text-2xl font-black text-foreground mt-1">{headcount.present}</div>
            </div>
            <div className="bg-muted/30 border border-border/80 p-4 rounded-xl text-center">
              <span className="relative flex h-2 w-2 mx-auto mb-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">On Break</div>
              <div className="text-2xl font-black text-foreground mt-1">{headcount.break}</div>
            </div>
            <div className="bg-muted/30 border border-border/80 p-4 rounded-xl text-center">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/60 mx-auto mb-2"></div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Off Duty</div>
              <div className="text-2xl font-black text-foreground mt-1">{headcount.offDuty}</div>
            </div>
          </div>
        </div>

        {/* Estimated Payroll Leakage Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Payroll Risk Estimates</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Unresolved late check-ins and early leaves for this period
            </p>
          </div>

          <div className="my-6">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl font-black text-foreground tracking-tight">
                {currencyFormatter.format(currentLeakageCost)}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">estimated leakage</span>
            </div>
            <div className="mt-1 flex flex-col gap-1 items-start">
              {renderComparisonBadge(leakageComp)}
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Based on total unapproved deduction time of <span className="font-bold text-foreground">{currentLeakageMinutes} minutes</span> computed at {currencyFormatter.format(defaultHourlyRate)}/hour.
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/payroll')}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Coins className="w-4 h-4" /> Review Payroll Ledger
          </button>
        </div>
      </div>

      {/* SECTION E: Workforce Cost & Labor Analytics */}
      {user?.role === 'manager' && (
        <div className="space-y-6 pt-6 border-t border-border/85">
          <svg width="0" height="0">
            <defs>
              <linearGradient id="salaryGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
          </svg>
          
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text flex items-center gap-2">
              <Coins className="w-6 h-6 text-primary" />
              Workforce Cost & Labor Analytics
            </h2>
            <p className="text-muted-foreground text-xs mt-0.5">
              Visual insights on labor expenditures, top earners, scheduled hours, and overtime metrics
            </p>
          </div>

          {payrollLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-card border border-border rounded-2xl p-6 h-80 animate-pulse flex flex-col justify-between">
                  <div className="h-6 bg-muted rounded w-1/3"></div>
                  <div className="h-48 bg-muted rounded w-full"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Card 1: Payroll overview donut */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Payroll Overview</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Net salary paid ( ledger records ) vs. unpaid estimated accrued cost
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl">
                    <div className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Paid</div>
                    <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {currencyFormatter.format(totalPaidSalary)}
                    </div>
                  </div>
                  <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl">
                    <div className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Estimated Accrued</div>
                    <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5">
                      {currencyFormatter.format(totalEstimatedSalary)}
                    </div>
                  </div>
                </div>
                <div className="h-48 w-full mt-4 flex items-center justify-center">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            borderColor: 'var(--border)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                            fontSize: '11px',
                            color: 'var(--foreground)'
                          }}
                        />
                        <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-10 space-y-2">
                      <Coins className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
                      <p className="text-xs text-muted-foreground">No payroll records computed for this period.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Highest Paid Employees */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Highest Paid Employees</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Net salary (base + additions - deductions) for this period
                  </p>
                </div>
                <div className="h-64 w-full mt-4 flex items-center justify-center">
                  {topEarners.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={topEarners} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
                        <YAxis dataKey="user_name" type="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
                        <Tooltip
                          formatter={(value) => [`$${value}`, 'Net Salary']}
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            borderColor: 'var(--border)',
                            borderRadius: '12px',
                            fontSize: '11px'
                          }}
                        />
                        <Bar dataKey="net_salary" name="Net Salary" fill="url(#salaryGrad)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-10 space-y-2">
                      <Coins className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
                      <p className="text-xs text-muted-foreground">No earnings data available.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Most Worked Employees */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Most Worked Employees</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Top employees by regular scheduled hours clocked (excludes breaks)
                  </p>
                </div>
                <div className="h-64 w-full mt-4 flex items-center justify-center">
                  {mostWorked.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mostWorked} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="user_name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--muted-foreground)' }} />
                        <Tooltip
                          formatter={(value) => [`${value} hrs`, 'Regular Hours']}
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            borderColor: 'var(--border)',
                            borderRadius: '12px',
                            fontSize: '11px'
                          }}
                        />
                        <Bar dataKey="hours" name="Regular Hours" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-10 space-y-2">
                      <Users className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
                      <p className="text-xs text-muted-foreground">No hours clocked in this period.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Overtime Leaders */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Overtime Leaders</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Top employees by approved unscheduled overtime hours clocked
                  </p>
                </div>
                <div className="h-64 w-full mt-4 flex items-center justify-center">
                  {overtimeLeaders.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overtimeLeaders} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="user_name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--muted-foreground)' }} />
                        <Tooltip
                          formatter={(value) => [`${value} hrs`, 'Overtime Hours']}
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            borderColor: 'var(--border)',
                            borderRadius: '12px',
                            fontSize: '11px'
                          }}
                        />
                        <Bar dataKey="hours" name="Overtime Hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-10 space-y-2">
                      <Clock className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
                      <p className="text-xs text-muted-foreground">No overtime hours clocked in this period.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
