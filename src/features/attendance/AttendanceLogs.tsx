import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Search, Filter, Calendar as CalendarIcon } from 'lucide-react';
import { formatStatusLabel } from '../../lib/utils';

interface AttendanceLog {
  id: number;
  user_name: string;
  job_title: string | null;
  date: string;
  check_in: string;
  check_out: string | null;
  status: string;
  location_lat: number | null;
  location_lng: number | null;
  breaks?: any[];
}

export default function AttendanceLogs() {
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: logs, isLoading } = useQuery<AttendanceLog[]>({
    queryKey: ['attendance-logs'],
    queryFn: async () => {
      const res = await api.get('/attendance');
      return res.data;
    }
  });

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredLogs = logs?.filter(log => {
    const matchesDate = filterDate ? log.date === filterDate : true;
    const matchesStatus = filterStatus ? log.status === filterStatus : true;
    const matchesSearch = searchQuery 
      ? log.user_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (log.job_title && log.job_title.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    return matchesDate && matchesStatus && matchesSearch;
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
        <div className="flex gap-4">
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="date" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm appearance-none"
            >
              <option value="">All Statuses</option>
              <option value="on_time">On Time</option>
              <option value="late_in">Late In</option>
              <option value="early_out">Early Out</option>
              <option value="absent">Absent</option>
              <option value="half_day">Half Day</option>
            </select>
          </div>
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
                {filteredLogs?.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium">{log.user_name}</div>
                      <div className="text-xs text-muted-foreground">{log.job_title || 'No Job Assigned'}</div>
                    </td>
                    <td className="px-6 py-4">{log.date}</td>
                    <td className="px-6 py-4 font-mono">{formatTime(log.check_in)}</td>
                    <td className="px-6 py-4 font-mono">{formatTime(log.check_out)}</td>
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
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.status === 'on_time' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                        log.status === 'late_in' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' :
                        log.status === 'early_out' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                        log.status === 'absent' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                        log.status === 'half_day' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                      }`}>
                        {formatStatusLabel(log.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
