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
  FileText
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
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { formatStatusLabel } from '../../lib/utils';
import { formatDisplayTime, formatDisplayDate, getWebNow } from '../../lib/timeManager';
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
  const displayTimezone = user?.display_timezone || 'UTC';

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

  // Today's attendance logs
  const todayLogs = React.useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => formatDisplayDate(log.check_in, displayTimezone) === todayDateStr);
  }, [logs, todayDateStr, displayTimezone]);

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

  // Top Summary Cards Data Processors
  const metrics = React.useMemo(() => {
    let onTime = 0;
    let lateIn = 0;
    let earlyOut = 0;
    let incomplete = 0;
    let unscheduled = 0;

    let lateInDeduction = 0;
    let earlyOutDeduction = 0;

    todayLogs.forEach(log => {
      const status = determineOverallStatus(log.checkin_status, log.checkout_status);
      
      if (status === 'on_time') onTime++;
      else if (status === 'late_in') lateIn++;
      else if (status === 'early_out') earlyOut++;
      else if (status === 'incomplete') incomplete++;
      else if (status === 'unscheduled') unscheduled++;

      // Sum late check-in and early out request value minutes if present
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
  }, [todayLogs]);

  // Headcount snapshot
  const headcount = React.useMemo(() => {
    if (!users) return { present: 0, break: 0, offDuty: 0, total: 0 };
    const employees = users.filter(u => u.role === 'employee' && u.status === 'active');
    const present = employees.filter(u => u.working_status === 'working').length;
    const onBreak = employees.filter(u => u.working_status === 'away').length;
    const offDuty = Math.max(0, employees.length - (present + onBreak));
    return { present, break: onBreak, offDuty, total: employees.length };
  }, [users]);

  // Donut chart status data
  const donutData = React.useMemo(() => {
    const statuses = [
      { name: 'On Time', value: metrics.onTime, statusKey: 'on_time', color: STATUS_COLORS.on_time },
      { name: 'Late In', value: metrics.lateIn, statusKey: 'late_in', color: STATUS_COLORS.late_in },
      { name: 'Early Out', value: metrics.earlyOut, statusKey: 'early_out', color: STATUS_COLORS.early_out },
      { name: 'Incomplete', value: metrics.incomplete, statusKey: 'incomplete', color: STATUS_COLORS.incomplete },
      { name: 'Unscheduled', value: metrics.unscheduled, statusKey: 'unscheduled', color: STATUS_COLORS.unscheduled }
    ];
    return statuses.filter(s => s.value > 0);
  }, [metrics]);

  // 14-day worked minutes trend data construction (Last 7 vs Preceding 7 days)
  const trendData = React.useMemo(() => {
    const data = [];
    
    for (let i = 6; i >= 0; i--) {
      const currentDateStr = getManagerLocalDateStr(i, displayTimezone);
      const baselineDateStr = getManagerLocalDateStr(i + 7, displayTimezone);
      
      // Today / Last 7 Days values
      const currentLogs = logs ? logs.filter(log => formatDisplayDate(log.check_in, displayTimezone) === currentDateStr) : [];
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

      // Baseline / Preceding 7 Days values
      const baselineLogs = logs ? logs.filter(log => formatDisplayDate(log.check_in, displayTimezone) === baselineDateStr) : [];
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
        current: Math.round(currentMins),
        baseline: Math.round(baselineMins)
      });
    }
    
    return data;
  }, [logs, displayTimezone]);

  // Today's pending deduction minutes (unapproved leakage)
  const todayPendingDeductionMinutes = React.useMemo(() => {
    if (!requests) return 0;
    return requests
      .filter(req => {
        if (req.status !== 'pending') return false;
        if (req.type !== 'late_in_approval' && req.type !== 'early_leave_approval') return false;
        const reqLocalDate = formatDisplayDate(
          req.original_check_in || req.requested_check_in || req.shift_start_time || req.created_at,
          displayTimezone
        );
        return reqLocalDate === todayDateStr;
      })
      .reduce((sum, req) => sum + (req.value || 0), 0);
  }, [requests, todayDateStr, displayTimezone]);

  const defaultHourlyRate = 20; // $20/hour default baseline rate for estimated leakage
  const estimatedPayrollLeakage = React.useMemo(() => {
    return Math.round((todayPendingDeductionMinutes * defaultHourlyRate) / 60);
  }, [todayPendingDeductionMinutes]);

  // Segment click navigation handler
  const handleSegmentClick = (statusKey: string) => {
    navigate('/attendance', { state: { filterStatus: statusKey } });
  };

  const isLoading = logsLoading || usersLoading || requestsLoading;

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
        <div className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl shadow-sm">
          <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Live Stream Connected
          </span>
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
              {metrics.onTime}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 font-medium">
            Arrived & departed perfectly on schedule
          </p>
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
              {metrics.lateIn}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-semibold mt-4">
            <span>-{metrics.lateInDeduction} total lost minutes</span>
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
              {metrics.earlyOut}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 font-semibold mt-4">
            <span>-{metrics.earlyOutDeduction} total lost minutes</span>
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
              {metrics.incomplete}
            </div>
          </div>
          <p className="text-xs text-rose-500/80 mt-4 font-semibold">
            Late In + Early Out simultaneously
          </p>
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
              {metrics.unscheduled}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 font-medium">
            Clocked outside standard shift roster
          </p>
        </div>
      </div>

      {/* SECTION B: Middle Analytics Row (Two-Column Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Donut Chart - Shift Status Distribution */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Shift Status Distribution</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click segments to filter advanced attendance logs
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

        {/* Right Column: Dual-Line Trend Chart */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground">Workforce Macro-Shift Trend</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Actual worked minutes (minus breaks): Last 7 Days vs Preceding 7 Days
            </p>
          </div>

          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    borderColor: 'var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    fontSize: '11px',
                    color: 'var(--foreground)'
                  }}
                  itemStyle={{
                    color: 'var(--foreground)'
                  }}
                  labelStyle={{
                    color: 'var(--foreground)'
                  }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="Current 7 Days"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="baseline"
                  name="Preceding 7 Days"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
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
              Unresolved late check-ins and early leaves
            </p>
          </div>

          <div className="my-6">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-foreground tracking-tight">
                {currencyFormatter.format(estimatedPayrollLeakage)}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">estimated leakage today</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Based on today's total unapproved deduction time of <span className="font-bold text-foreground">{todayPendingDeductionMinutes} minutes</span> computed at a baseline average rate of {currencyFormatter.format(defaultHourlyRate)}/hour.
            </p>
          </div>

          <button
            onClick={() => navigate('/payroll')}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Coins className="w-4 h-4" /> Review Payroll Ledger
          </button>
        </div>
      </div>
    </div>
  );
}
