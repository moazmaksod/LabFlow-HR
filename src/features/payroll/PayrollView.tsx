import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Download, Calendar as CalendarIcon, DollarSign, Play } from 'lucide-react';
import { format } from 'date-fns';

interface PayrollRecord {
  id: number;
  user_id: number;
  user_name: string;
  start_date: string;
  end_date: string;
  base_salary: number;
  total_additions: number;
  total_deductions: number;
  net_salary: number;
  status: 'draft' | 'finalized' | 'paid';
  created_at: string;
}

interface PayrollTransaction {
  id: number;
  payroll_id: number;
  reference_id: number | null;
  type: string;
  hours: number | null;
  amount: number;
  status: string;
  manager_notes: string | null;
  created_at: string;
}

export default function PayrollView() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedPayrollId, setSelectedPayrollId] = useState<number | null>(null);

  const { data: payrolls, isLoading } = useQuery<PayrollRecord[]>({
    queryKey: ['payrolls', selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await api.get(`/payroll/records?month=${selectedMonth}&year=${selectedYear}`);
      return res.data;
    },
  });

  const { data: transactions, isLoading: isLoadingTransactions } = useQuery<PayrollTransaction[]>({
    queryKey: ['payrollTransactions', selectedPayrollId],
    queryFn: async () => {
      if (!selectedPayrollId) return [];
      const res = await api.get(`/payroll/records/${selectedPayrollId}/transactions`);
      return res.data;
    },
    enabled: !!selectedPayrollId,
  });

  const generateDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/payroll/generate?month=${selectedMonth}&year=${selectedYear}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrolls'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await api.put(`/payroll/records/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrolls'] });
    },
  });

  const handleExportCSV = () => {
    if (!Array.isArray(payrolls) || payrolls.length === 0) return;

    const headers = ['Employee Name', 'Start Date', 'End Date', 'Base Salary ($)', 'Additions ($)', 'Deductions ($)', 'Net Salary ($)', 'Status'];
    const csvRows = [headers.join(',')];

    for (const row of payrolls) {
      csvRows.push([
        `"${row.user_name}"`,
        row.start_date,
        row.end_date,
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
    link.setAttribute('download', `payroll_${selectedYear}_${selectedMonth}.csv`);
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
        <h2 className="text-2xl font-bold tracking-tight">Payroll Ledger</h2>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => generateDraftMutation.mutate()}
            disabled={generateDraftMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {generateDraftMutation.isPending ? 'Generating...' : 'Generate Drafts'}
          </button>
          <button 
            onClick={handleExportCSV}
            disabled={!Array.isArray(payrolls) || payrolls.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export to CSV
          </button>
        </div>
      </div>

      {/* Filters & Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <CalendarIcon className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">Period:</span>
          </div>
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="w-full sm:w-auto px-3 py-2 bg-background border border-border rounded-lg text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{format(new Date(2000, m - 1), 'MMMM')}</option>
            ))}
          </select>
          <input 
            type="number" 
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-full sm:w-auto px-3 py-2 bg-background border border-border rounded-lg text-sm"
            min="2000"
            max="2100"
          />
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Total Net Payroll</p>
            <p className="text-2xl font-bold text-primary mt-1">
              ${totalPayroll.toFixed(2)}
            </p>
          </div>
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-primary" />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Employee</th>
                <th className="px-6 py-4 font-medium">Period</th>
                <th className="px-6 py-4 font-medium">Base Salary</th>
                <th className="px-6 py-4 font-medium text-green-600">Additions</th>
                <th className="px-6 py-4 font-medium text-red-600">Deductions</th>
                <th className="px-6 py-4 font-medium">Net Salary</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    Loading payroll data...
                  </td>
                </tr>
              ) : !Array.isArray(payrolls) || payrolls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    No payroll records found for this period. Click "Generate Drafts" to create them.
                  </td>
                </tr>
              ) : (
                payrolls.map((record) => (
                  <React.Fragment key={record.id}>
                    <tr className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium">{record.user_name}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {record.start_date} to {record.end_date}
                      </td>
                      <td className="px-6 py-4">${record.base_salary.toFixed(2)}</td>
                      <td className="px-6 py-4 text-green-600">+${record.total_additions.toFixed(2)}</td>
                      <td className="px-6 py-4 text-red-600">-${record.total_deductions.toFixed(2)}</td>
                      <td className="px-6 py-4 font-bold">${record.net_salary.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase ${
                          record.status === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          record.status === 'finalized' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => setSelectedPayrollId(selectedPayrollId === record.id ? null : record.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                              selectedPayrollId === record.id 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                            }`}
                          >
                            {selectedPayrollId === record.id ? 'Hide Details' : 'View Ledger'}
                          </button>
                          {record.status === 'draft' && (
                            <button 
                              onClick={() => updateStatusMutation.mutate({ id: record.id, status: 'finalized' })}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase rounded-lg transition-all"
                            >
                              Finalize
                            </button>
                          )}
                          {record.status === 'finalized' && (
                            <button 
                              onClick={() => updateStatusMutation.mutate({ id: record.id, status: 'paid' })}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded-lg transition-all"
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {selectedPayrollId === record.id && (
                      <tr className="bg-muted/30">
                        <td colSpan={8} className="px-6 py-6">
                          <div className="bg-background border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="px-4 py-3 bg-muted/50 border-b border-border flex justify-between items-center">
                              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Detailed Transaction Ledger</h4>
                              <span className="text-[10px] font-mono text-muted-foreground">ID: {record.id}</span>
                            </div>
                            {isLoadingTransactions ? (
                              <div className="p-8 text-center text-muted-foreground text-xs italic">Loading ledger entries...</div>
                            ) : transactions?.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground text-xs italic">No ledger entries found.</div>
                            ) : (
                              <table className="w-full text-[11px] text-left">
                                <thead className="bg-muted/30 text-muted-foreground uppercase tracking-tighter font-bold border-b border-border">
                                  <tr>
                                    <th className="px-4 py-2">Entry Type</th>
                                    <th className="px-4 py-2">Amount</th>
                                    <th className="px-4 py-2">Units (Hrs)</th>
                                    <th className="px-4 py-2">Status</th>
                                    <th className="px-4 py-2">Manager Audit Note</th>
                                    <th className="px-4 py-2">Timestamp</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {transactions?.map(tx => (
                                    <tr key={tx.id} className="hover:bg-muted/10 transition-colors">
                                      <td className="px-4 py-2 font-bold text-foreground">{tx.type}</td>
                                      <td className={`px-4 py-2 font-mono font-bold ${tx.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                                      </td>
                                      <td className="px-4 py-2 font-mono">{tx.hours !== null ? tx.hours.toFixed(2) : '-'}</td>
                                      <td className="px-4 py-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                          tx.status === 'applied' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                        }`}>
                                          {tx.status}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 italic text-muted-foreground max-w-[200px] truncate" title={tx.manager_notes || ''}>
                                        {tx.manager_notes || <span className="opacity-30">No note provided</span>}
                                      </td>
                                      <td className="px-4 py-2 text-muted-foreground font-mono">
                                        {format(new Date(tx.created_at), 'yyyy-MM-dd HH:mm')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
