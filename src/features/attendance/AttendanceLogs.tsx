import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Search, Filter, Calendar as CalendarIcon, RefreshCw } from 'lucide-react';
import { formatStatusLabel } from '../../lib/utils';
import { useAuthStore } from '../../store/useAuthStore';
import { formatDisplayTime, getWebNow } from '../../lib/timeManager';

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
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  breaks?: any[];
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

export default function AttendanceLogs() {
  const user = useAuthStore(state => state.user);
  const [filterStartDate, setFilterStartDate] = useState(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: user?.display_timezone || 'UTC'
    }).format(new Date(getWebNow()));
  });
  const [filterEndDate, setFilterEndDate] = useState(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: user?.display_timezone || 'UTC'
    }).format(new Date(getWebNow()));
  });
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: logs, isLoading, refetch, isFetching } = useQuery<AttendanceLog[]>({
    queryKey: ['attendance-logs'],
    queryFn: async () => {
      const res = await api.get('/attendance');
      return res.data;
    }
  });

  const formatTime = (isoString: string | null) => formatDisplayTime(isoString, user?.display_timezone, 'HH:mm');

  const filteredLogs = logs?.filter(log => {
    if (filterStartDate && log.date < filterStartDate) return false;
    if (filterEndDate && log.date > filterEndDate) return false;
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
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                 {filteredLogs?.map((log) => {
                   const displayStatus = getDisplayStatus(log);
                   return (
                     <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                       <td className="px-6 py-4">
                         <div className="font-medium">{log.user_name}</div>
                         <div className="text-xs text-muted-foreground">{log.job_title || 'No Job Assigned'}</div>
                       </td>
                       <td className="px-6 py-4">{log.date}</td>
                       <td className={`px-6 py-4 font-mono font-semibold ${
                         log.checkin_status === 'on_time' ? 'text-emerald-600 dark:text-emerald-400' :
                         log.checkin_status === 'late_in' ? 'text-amber-500 dark:text-amber-400' :
                         log.checkin_status === 'unscheduled' ? 'text-blue-500 dark:text-blue-400' :
                         'text-foreground'
                       }`}>
                         {formatTime(log.check_in)}
                       </td>
                       <td className={`px-6 py-4 font-mono font-semibold ${
                         log.check_out ? (
                           log.checkout_status === 'on_time' ? 'text-emerald-600 dark:text-emerald-400' :
                           log.checkout_status === 'early_out' ? 'text-orange-500 dark:text-orange-400' :
                           log.checkout_status === 'unscheduled' ? 'text-blue-500 dark:text-blue-400' :
                           'text-foreground'
                         ) : 'text-muted-foreground'
                       }`}>
                         {formatTime(log.check_out)}
                       </td>
                       <td className="px-6 py-4 font-mono text-xs">
                         {log.breaks && log.breaks.length > 0 ? (
                           <div className="space-y-1">
                             {log.breaks.map((b: any, idx: number) => (
                               <div key={idx} className="text-muted-foreground">
                                 {formatTime(b.start_time)} - {b.end_time ? formatTime(b.end_time) : 'Ongoing'}
                               </div>
                             ))}
                           </div>
                         ) : (
                           <span className="text-muted-foreground">-</span>
                         )}
                       </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold inline-block ${
                            displayStatus === 'on_time' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                            displayStatus === 'late_in' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' :
                            displayStatus === 'early_out' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                            displayStatus === 'incomplete' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                            displayStatus === 'unscheduled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
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
    </div>
  );
}
