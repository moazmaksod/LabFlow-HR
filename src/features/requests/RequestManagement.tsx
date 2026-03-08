import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { CheckCircle, XCircle, Clock, FileText, X } from 'lucide-react';

interface RequestLog {
  id: number;
  user_name: string;
  reason: string;
  type: string | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  status: string;
  created_at: string;
  details?: string;
  manager_note?: string;
}

export default function RequestManagement() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('pending');
  const [selectedRequest, setSelectedRequest] = useState<RequestLog | null>(null);
  const [managerNote, setManagerNote] = useState('');
  const [approvedMinutes, setApprovedMinutes] = useState<number>(0);

  const { data: requests, isLoading } = useQuery<RequestLog[]>({
    queryKey: ['requests'],
    queryFn: async () => {
      const res = await api.get('/requests');
      return res.data;
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, manager_note, approved_minutes }: { id: number, status: string, manager_note?: string, approved_minutes?: number }) => {
      const res = await api.put(`/requests/${id}/status`, { status, manager_note, approved_minutes });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-stats'] });
      closeModal();
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

  const openModal = (req: RequestLog) => {
    setSelectedRequest(req);
    setManagerNote(req.manager_note || '');
    if (req.type === 'overtime_approval' && req.details) {
      try {
        const details = JSON.parse(req.details);
        setApprovedMinutes(details.requested_overtime_minutes || details.raw_overtime_minutes || 0);
      } catch (e) {
        setApprovedMinutes(0);
      }
    } else {
      setApprovedMinutes(0);
    }
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setManagerNote('');
    setApprovedMinutes(0);
  };

  const handleApprove = () => {
    if (!selectedRequest) return;
    updateStatusMutation.mutate({ 
      id: selectedRequest.id, 
      status: 'approved',
      manager_note: managerNote,
      approved_minutes: selectedRequest.type === 'overtime_approval' ? approvedMinutes : undefined
    });
  };

  const handleReject = () => {
    if (!selectedRequest) return;
    updateStatusMutation.mutate({ 
      id: selectedRequest.id, 
      status: 'rejected',
      manager_note: managerNote
    });
  };

  return (
    <div className="space-y-6 relative">
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
                  <th className="px-6 py-3 font-medium">Type</th>
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
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        req.type === 'permission_to_leave' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' : 
                        req.type === 'overtime_approval' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' :
                        req.type === 'early_leave_approval' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400'
                      }`}>
                        {req.type?.replace(/_/g, ' ') || 'Manual Clock'}
                      </span>
                    </td>
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
                        <button 
                          onClick={() => openModal(req)}
                          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors flex items-center gap-1 ml-auto"
                        >
                          <FileText className="w-3 h-3" /> Review
                        </button>
                      ) : (
                        <button 
                          onClick={() => openModal(req)}
                          className="px-3 py-1.5 bg-muted text-muted-foreground text-xs font-medium rounded-md hover:bg-muted/80 transition-colors flex items-center gap-1 ml-auto"
                        >
                          View Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
              <h3 className="font-semibold text-lg">Review Request</h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Employee</label>
                <p className="font-medium">{selectedRequest.user_name}</p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                <p className="capitalize">{selectedRequest.type?.replace(/_/g, ' ') || 'Manual Clock'}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason provided</label>
                <p className="text-sm mt-1 bg-muted/50 p-3 rounded-lg border border-border">{selectedRequest.reason}</p>
              </div>

              {selectedRequest.type === 'overtime_approval' && (
                <div className="space-y-2 pt-2">
                  <label className="text-sm font-medium">Approved Overtime (Minutes)</label>
                  <input 
                    type="number" 
                    value={approvedMinutes}
                    onChange={(e) => setApprovedMinutes(Number(e.target.value))}
                    disabled={selectedRequest.status !== 'pending'}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                  />
                  <p className="text-xs text-muted-foreground">Adjust the minutes if necessary before approving.</p>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <label className="text-sm font-medium">Manager Note (Optional)</label>
                <textarea 
                  value={managerNote}
                  onChange={(e) => setManagerNote(e.target.value)}
                  disabled={selectedRequest.status !== 'pending'}
                  placeholder="Add a note for the employee..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg min-h-[80px] focus:ring-2 focus:ring-primary/20 outline-none resize-none disabled:opacity-50"
                />
              </div>
            </div>

            {selectedRequest.status === 'pending' && (
              <div className="p-4 border-t border-border bg-muted/30 flex justify-end gap-3">
                <button 
                  onClick={handleReject}
                  disabled={updateStatusMutation.isPending}
                  className="px-4 py-2 bg-destructive/10 text-destructive font-medium rounded-lg hover:bg-destructive/20 transition-colors flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button 
                  onClick={handleApprove}
                  disabled={updateStatusMutation.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
