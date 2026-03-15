import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Download, Calendar as CalendarIcon, DollarSign } from 'lucide-react';

interface PayrollRecord {
  user_id: number;
  user_name: string;
  job_title: string;
  hourly_rate: number;
  total_hours: number;
  total_pay: number;
}

export default function PayrollView() {
  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const { data: payrollData, isLoading } = useQuery<PayrollRecord[]>({
    queryKey: ['payroll', startDate, endDate],
    queryFn: async () => {
      const res = await api.get(`/payroll?startDate=${startDate}&endDate=${endDate}`);
      return res.data;
    },
    enabled: !!startDate && !!endDate,
  });

  const handleExportCSV = () => {
    if (!Array.isArray(payrollData) || payrollData.length === 0) return;

    const headers = ['Employee Name', 'Job Title', 'Hourly Rate ($)', 'Total Hours', 'Total Pay ($)'];
    const csvRows = [headers.join(',')];

    for (const row of payrollData) {
      csvRows.push([
        `"${row.user_name}"`,
        `"${row.job_title}"`,
        row.hourly_rate,
        row.total_hours,
        row.total_pay
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

  const totalPayroll = Array.isArray(payrollData) 
    ? payrollData.reduce((sum, record) => sum + record.total_pay, 0) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Payroll Export</h2>
        
        <button 
          onClick={handleExportCSV}
          disabled={!Array.isArray(payrollData) || payrollData.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Export to CSV
        </button>
      </div>

      {/* Filters & Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <CalendarIcon className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">Period:</span>
          </div>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-background border border-border rounded-lg text-sm"
          />
          <span className="text-muted-foreground">to</span>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-background border border-border rounded-lg text-sm"
          />
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Total Payroll</p>
            <p className="text-2xl font-bold text-primary">${totalPayroll.toFixed(2)}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Calculating payroll...</div>
        ) : !Array.isArray(payrollData) || payrollData.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No attendance records found for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                <tr>
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Job Title</th>
                  <th className="px-6 py-3 font-medium text-right">Hourly Rate</th>
                  <th className="px-6 py-3 font-medium text-right">Total Hours</th>
                  <th className="px-6 py-3 font-medium text-right">Total Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payrollData.map((row) => (
                  <tr key={row.user_id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{row.user_name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{row.job_title}</td>
                    <td className="px-6 py-4 text-right font-mono">${row.hourly_rate.toFixed(2)}/hr</td>
                    <td className="px-6 py-4 text-right font-mono">{row.total_hours.toFixed(2)}h</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-primary">
                      ${row.total_pay.toFixed(2)}
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
