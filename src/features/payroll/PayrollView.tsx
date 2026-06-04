import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Download, Calendar as CalendarIcon, DollarSign, Eye, CreditCard, AlertTriangle, X, CheckCircle, Clock } from 'lucide-react';
import { formatDuration, formatDisplayTime, getLocalDateParts, DateFormats } from '../../lib/timeManager';
import { useAuthStore } from '../../store/useAuthStore';

interface PayrollRecord {
  user_id: number;
  user_name: string;
  job_title: string;
  hourly_rate: number;
  overtime_rate_percent: number;
  scheduled_working_minutes: number;
  scheduled_non_working_minutes: number;
  overtime_minutes: number;
  deduction_minutes: number;
  base_salary: number;
  total_additions: number;
  total_deductions: number;
  net_salary: number;
  status: 'paid' | 'unpaid';
  paid_by_name: string | null;
  paid_at: string | null;
  pending_requests_count: number;
}

interface RequestItem {
  id: number;
  type: string;
  reason: string;
  value: number;
  status: 'pending' | 'approved' | 'rejected';
  paid_minutes: number;
  penalty_minutes: number;
  manager_note: string | null;
  created_at: string;
  attendance_date: string | null;
}

interface MissedShift {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

interface DailyRecord {
  id: number;
  date: string;
  scheduled_working_minutes: number;
  scheduled_non_working_minutes: number;
  unscheduled_working_minutes: number;
  deduction_minutes: number;
}

interface PayrollDetails {
  summary: PayrollRecord;
  daily_records: DailyRecord[];
  pending_requests: RequestItem[];
  processed_requests: RequestItem[];
  missed_shifts: MissedShift[];
}

export default function PayrollView() {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  
  const { month: defaultMonth, year: defaultYear } = getLocalDateParts(user?.display_timezone);
  const initialStart = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-01`;
  const initialEnd = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-${String(new Date(defaultYear, defaultMonth, 0).getDate()).padStart(2, '0')}`;
  
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  
  const [detailUserId, setDetailUserId] = useState<number | null>(null);

  // Query all payroll calculations dynamically
  const { data: payrolls, isLoading } = useQuery<PayrollRecord[]>({
    queryKey: ['payrolls', startDate, endDate],
    queryFn: async () => {
      const res = await api.get(`/payroll?startDate=${startDate}&endDate=${endDate}`);
      return res.data;
    },
  });

  // Query specific details for selected employee
  const { data: details, isLoading: isLoadingDetails } = useQuery<PayrollDetails>({
    queryKey: ['payrollDetails', detailUserId, startDate, endDate],
    queryFn: async () => {
      if (!detailUserId) return null;
      const res = await api.get(`/payroll/records/${detailUserId}/details?startDate=${startDate}&endDate=${endDate}`);
      return res.data;
    },
    enabled: !!detailUserId,
  });

  // Record payment mutation
  const recordPaymentMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await api.post('/payroll/records/pay', {
        user_id: userId,
        startDate,
        endDate
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrolls'] });
      queryClient.invalidateQueries({ queryKey: ['payrollDetails', detailUserId] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Failed to record payment';
      alert(msg);
    }
  });

  const handleExportCSV = () => {
    if (!Array.isArray(payrolls) || payrolls.length === 0) return;

    const headers = [
      'Employee Name', 'Job Title', 'Hourly Rate ($)', 'Overtime Rate (%)',
      'Worked Time (HH:MM)', 'Paid Leaves (HH:MM)', 'Overtime (HH:MM)', 'Deductions (HH:MM)',
      'Base Salary ($)', 'Additions ($)', 'Deductions ($)', 'Net Salary ($)', 'Status'
    ];
    
    const csvRows = [headers.join(',')];

    for (const row of payrolls) {
      csvRows.push([
        `"${row.user_name}"`,
        `"${row.job_title}"`,
        row.hourly_rate,
        row.overtime_rate_percent,
        formatDuration(row.scheduled_working_minutes),
        formatDuration(row.scheduled_non_working_minutes),
        formatDuration(row.overtime_minutes),
        formatDuration(row.deduction_minutes),
        row.base_salary,
        row.total_additions,
        row.total_deductions,
        row.net_salary,
        row.status
      ].join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payroll_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPayroll = Array.isArray(payrolls) 
    ? payrolls.reduce((sum, record) => sum + record.net_salary, 0) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">Payroll Ledger</h2>
          <p className="text-sm text-muted-foreground mt-1">Dynamically calculate periods, overtime, leaves, penalties, and salaries.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportCSV}
            disabled={!Array.isArray(payrolls) || payrolls.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            Export to CSV
          </button>
        </div>
      </div>

      {/* Filters & Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <CalendarIcon className="w-5 h-5 text-indigo-500" />
            <span className="text-sm font-semibold">Start Date:</span>
          </div>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-4">
            <span className="text-sm font-semibold">End Date:</span>
          </div>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-semibold">Total Estimated Payroll</p>
            <p className="text-3xl font-extrabold text-indigo-600 mt-1">
              ${totalPayroll.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center">
            <DollarSign className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
              <tr>
                <th className="px-6 py-4.5 font-bold">Employee</th>
                <th className="px-6 py-4.5 font-bold">Worked Time</th>
                <th className="px-6 py-4.5 font-bold">Paid Leaves</th>
                <th className="px-6 py-4.5 font-bold text-green-600">Overtime</th>
                <th className="px-6 py-4.5 font-bold text-red-500">Deductions</th>
                <th className="px-6 py-4.5 font-bold">Net Salary</th>
                <th className="px-6 py-4.5 font-bold">Status</th>
                <th className="px-6 py-4.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-semibold text-xs">Computing payroll metrics...</span>
                    </div>
                  </td>
                </tr>
              ) : !Array.isArray(payrolls) || payrolls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground font-semibold">
                    No active employees or attendance records found in this range.
                  </td>
                </tr>
              ) : (
                payrolls.map((record) => (
                  <tr key={record.user_id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-6 py-4.5">
                      <div className="font-bold text-foreground">{record.user_name}</div>
                      <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{record.job_title} · ${record.hourly_rate}/hr</div>
                    </td>
                    <td className="px-6 py-4.5 font-mono font-medium text-foreground">
                      {formatDuration(record.scheduled_working_minutes)}
                    </td>
                    <td className="px-6 py-4.5 font-mono font-medium text-muted-foreground">
                      {formatDuration(record.scheduled_non_working_minutes)}
                    </td>
                    <td className="px-6 py-4.5 font-mono font-bold text-green-600">
                      {formatDuration(record.overtime_minutes)}
                    </td>
                    <td className="px-6 py-4.5 font-mono font-bold text-rose-500">
                      {formatDuration(record.deduction_minutes)}
                    </td>
                    <td className="px-6 py-4.5 font-extrabold text-foreground text-[15px]">
                      ${record.net_salary.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4.5">
                      {record.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Paid
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 w-fit">
                            <Clock className="w-3.5 h-3.5" />
                            Unpaid
                          </span>
                          {record.pending_requests_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500" title="Pending requests will affect calculation once resolved">
                              <AlertTriangle className="w-3 h-3 animate-pulse" />
                              {record.pending_requests_count} pending request(s)
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => setDetailUserId(record.user_id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-muted text-muted-foreground hover:bg-indigo-500 hover:text-white rounded-xl text-xs font-bold uppercase transition-all shadow-sm group-hover:shadow-md"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Details
                        </button>
                        {record.status === 'unpaid' && (
                          <button 
                            onClick={() => {
                              if (record.pending_requests_count > 0) {
                                if (!confirm(`WARNING: This employee has ${record.pending_requests_count} pending request(s) in this period. Recording payment now will lock in current calculations. Proceed?`)) {
                                  return;
                                }
                              } else {
                                if (!confirm(`Are you sure you want to record a payment of $${record.net_salary} for ${record.user_name} for the period ${startDate} to ${endDate}?`)) {
                                  return;
                                }
                              }
                              recordPaymentMutation.mutate(record.user_id);
                            }}
                            disabled={recordPaymentMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal / Sidebar */}
      {detailUserId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end animate-in fade-in duration-200">
          <div className="bg-background w-full max-w-4xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-muted/40 border-b border-border flex justify-between items-center">
              <div>
                <h3 className="text-xl font-extrabold text-foreground">Employee Ledger Details</h3>
                <p className="text-xs text-muted-foreground mt-1">Period: {startDate} to {endDate}</p>
              </div>
              <button 
                onClick={() => setDetailUserId(null)}
                className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingDetails || !details ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-semibold text-xs text-muted-foreground">Fetching detailed history...</span>
                </div>
              ) : (
                <>
                  {/* Summary Card */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 border border-border rounded-2xl p-5">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Employee Name</span>
                      <p className="text-base font-bold text-foreground mt-0.5">{details.summary.user_name}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hourly Wage Rate</span>
                      <p className="text-base font-bold text-foreground mt-0.5">${details.summary.hourly_rate}/hr</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Calculated Salary</span>
                      <p className="text-base font-extrabold text-indigo-600 mt-0.5">${details.summary.net_salary.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment Status</span>
                      <div className="mt-1">
                        {details.summary.status === 'paid' ? (
                          <div className="text-[11px] font-bold text-emerald-600">
                            <span className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">PAID</span>
                            <div className="text-[9px] text-muted-foreground font-medium mt-0.5">By {details.summary.paid_by_name}</div>
                          </div>
                        ) : (
                          <span className="bg-amber-500/10 border border-amber-500/20 text-amber-600 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">UNPAID</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Warning for Pending Requests */}
                  {details.pending_requests.length > 0 && (
                    <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-rose-600">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-extrabold text-sm">Action Required: Unresolved Requests</h4>
                        <p className="text-xs text-rose-500/90 mt-0.5">
                          There are {details.pending_requests.length} pending request(s) in this period. Approving or rejecting them will recalculate and update this employee's payroll.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Daily Records Breakdown */}
                  <div className="space-y-3">
                    <h4 className="font-extrabold text-sm text-foreground uppercase tracking-wider">Daily Breakdown logs</h4>
                    <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted text-muted-foreground font-bold uppercase">
                          <tr>
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Worked Time</th>
                            <th className="px-4 py-2.5">Paid Leaves</th>
                            <th className="px-4 py-2.5">Overtime</th>
                            <th className="px-4 py-2.5 text-red-500">Deductions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {details.daily_records.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground italic">No daily attendance logged.</td>
                            </tr>
                          ) : (
                            details.daily_records.map(row => (
                              <tr key={row.id} className="hover:bg-muted/10">
                                <td className="px-4 py-2.5 font-bold">{row.date}</td>
                                <td className="px-4 py-2.5 font-mono">{formatDuration(row.scheduled_working_minutes)}</td>
                                <td className="px-4 py-2.5 font-mono">{formatDuration(row.scheduled_non_working_minutes)}</td>
                                <td className="px-4 py-2.5 font-mono text-green-600 font-semibold">{formatDuration(row.unscheduled_working_minutes)}</td>
                                <td className="px-4 py-2.5 font-mono text-rose-500 font-semibold">{formatDuration(row.deduction_minutes)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Missed Shifts Section */}
                  <div className="space-y-3">
                    <h4 className="font-extrabold text-sm text-foreground uppercase tracking-wider">Missed Scheduled Shifts (Unpaid)</h4>
                    <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted text-muted-foreground font-bold uppercase">
                          <tr>
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Scheduled Start</th>
                            <th className="px-4 py-2.5">Scheduled End</th>
                            <th className="px-4 py-2.5">Duration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {details.missed_shifts.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground italic">No missed shifts in this period.</td>
                            </tr>
                          ) : (
                            details.missed_shifts.map(shift => (
                              <tr key={shift.id} className="hover:bg-muted/10 bg-rose-500/5">
                                <td className="px-4 py-2.5 font-bold text-rose-600">{shift.date}</td>
                                <td className="px-4 py-2.5 font-mono">{formatDisplayTime(shift.start_time, user?.display_timezone, DateFormats.PAYROLL_VIEW)}</td>
                                <td className="px-4 py-2.5 font-mono">{formatDisplayTime(shift.end_time, user?.display_timezone, DateFormats.PAYROLL_VIEW)}</td>
                                <td className="px-4 py-2.5 font-mono text-rose-600 font-bold">{formatDuration(shift.duration_minutes)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pending Requests list */}
                  <div className="space-y-3">
                    <h4 className="font-extrabold text-sm text-foreground uppercase tracking-wider text-amber-600">Pending Requests</h4>
                    <div className="space-y-2">
                      {details.pending_requests.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic pl-1">No pending requests for this period.</p>
                      ) : (
                        details.pending_requests.map(req => (
                          <div key={req.id} className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3 flex justify-between items-start">
                            <div>
                              <div className="font-bold text-amber-700 capitalize text-xs">{req.type.replace(/_/g, ' ')}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{req.reason}</div>
                              {req.attendance_date && <div className="text-[10px] text-muted-foreground/80 mt-1">Shift Date: {req.attendance_date}</div>}
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-xs font-bold text-amber-700">{req.value} mins</span>
                              <div className="text-[9px] text-muted-foreground mt-1">Created: {formatDisplayTime(req.created_at, user?.display_timezone, DateFormats.AUDIT_LOG)}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Processed Requests list */}
                  <div className="space-y-3">
                    <h4 className="font-extrabold text-sm text-foreground uppercase tracking-wider text-muted-foreground">Processed Requests History</h4>
                    <div className="space-y-2">
                      {details.processed_requests.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic pl-1">No processed requests for this period.</p>
                      ) : (
                        details.processed_requests.map(req => (
                          <div key={req.id} className="border border-border rounded-xl p-3 flex justify-between items-start bg-muted/20">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground capitalize text-xs">{req.type.replace(/_/g, ' ')}</span>
                                <span className={`px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wide border ${
                                  req.status === 'approved' 
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                                    : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                                }`}>
                                  {req.status}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-1"><strong>Reason:</strong> {req.reason}</div>
                              {req.manager_note && <div className="text-[11px] text-muted-foreground italic mt-0.5"><strong>HR Note:</strong> {req.manager_note}</div>}
                              {req.attendance_date && <div className="text-[10px] text-muted-foreground/80 mt-1">Shift Date: {req.attendance_date}</div>}
                            </div>
                            <div className="text-right">
                              {req.status === 'approved' ? (
                                <span className="font-mono text-xs font-bold text-emerald-600">Paid: {req.paid_minutes} mins</span>
                              ) : (
                                <span className="font-mono text-xs font-bold text-rose-600">Penalty: {req.penalty_minutes} mins</span>
                              )}
                              <div className="text-[9px] text-muted-foreground mt-1">Updated: {formatDisplayTime(req.created_at, user?.display_timezone, DateFormats.AUDIT_LOG)}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-muted/20 border-t border-border flex justify-end gap-2">
              <button 
                onClick={() => setDetailUserId(null)}
                className="px-4 py-2 bg-muted text-muted-foreground font-bold rounded-xl text-xs uppercase hover:bg-muted/80 transition-all"
              >
                Close
              </button>
              {details && details.summary.status === 'unpaid' && (
                <button 
                  onClick={() => {
                    if (details.pending_requests.length > 0) {
                      if (!confirm(`WARNING: This employee has ${details.pending_requests.length} pending request(s) in this period. Recording payment now will lock in current calculations. Proceed?`)) {
                        return;
                      }
                    } else {
                      if (!confirm(`Are you sure you want to record a payment of $${details.summary.net_salary} for ${details.summary.user_name} for the period ${startDate} to ${endDate}?`)) {
                        return;
                      }
                    }
                    recordPaymentMutation.mutate(details.summary.user_id);
                  }}
                  disabled={recordPaymentMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  Record Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
