import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface RequestLog {
  id: number;
  user_name: string;
  reason: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  status: string;
  created_at: string;
}

export default function RequestManagement() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('pending');

  const { data: requests, isLoading } = useQuery<RequestLog[]>({
    queryKey: ['requests'],
    queryFn: async () => {
      const res = await api.get('/requests');
      return res.data;
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      const res = await api.put(`/requests/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-stats'] });
    }
  });

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString([], { 
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  };

  const filteredRequests = requests?.filter(req => {
    if (filterStatus === 'all') return true;
    return req.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Requests & Approvals</h2>
        <select 
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium shadow-sm"
        >
          <option value="pending">Pending Only</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All Requests</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading requests...</div>
        ) : filteredRequests?.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
            <Clock className="w-12 h-12 mb-3 opacity-20" />
            <p>No requests found for the selected filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                <tr>
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Reason</th>
                  <th className="px-6 py-3 font-medium">Requested In</th>
                  <th className="px-6 py-3 font-medium">Requested Out</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRequests?.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{req.user_name}</td>
                    <td className="px-6 py-4 max-w-xs truncate" title={req.reason}>{req.reason}</td>
                    <td className="px-6 py-4 font-mono text-xs">{formatTime(req.requested_check_in)}</td>
                    <td className="px-6 py-4 font-mono text-xs">{formatTime(req.requested_check_out)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                        req.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                      }`}>
                        {req.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'approved' })}
                            disabled={updateStatusMutation.isPending}
                            className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-md transition-colors"
                            title="Approve"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'rejected' })}
                            disabled={updateStatusMutation.isPending}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
                            title="Reject"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Processed</span>
                      )}
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
