import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { CheckCircle, XCircle, Clock, FileText, X, AlertCircle } from 'lucide-react';

interface RequestLog {
  id: number;
  user_name: string;
  reason: string;
  type: string | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  original_check_in?: string | null;
  original_check_out?: string | null;
  interruption_end_time?: string | null;
  status: string;
  created_at: string;
  details?: string;
  manager_note?: string;
}

export default function RequestManagement() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<RequestLog | null>(null);
  const [managerNote, setManagerNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [approvedMinutes, setApprovedMinutes] = useState<number>(0);
  const [isPaidPermission, setIsPaidPermission] = useState(false);
  const [paidPermissionMinutes, setPaidPermissionMinutes] = useState<number>(0);
  const [maxPaidMinutes, setMaxPaidMinutes] = useState<number>(0);
  const [penaltyHours, setPenaltyHours] = useState<number>(0);
  const [isRejecting, setIsRejecting] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<number>>(new Set());
  const [bulkManagerNote, setBulkManagerNote] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkRejecting, setIsBulkRejecting] = useState(false);

  const { data: requests, isLoading } = useQuery<RequestLog[]>({
    queryKey: ['requests'],
    queryFn: async () => {
      const res = await api.get('/requests');
      return res.data;
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, manager_note, approved_minutes, is_paid_permission, paid_permission_minutes, penalty_hours }: { id: number, status: string, manager_note?: string, approved_minutes?: number, is_paid_permission?: boolean, paid_permission_minutes?: number, penalty_hours?: number }) => {
      const res = await api.put(`/requests/${id}/status`, { status, manager_note, approved_minutes, is_paid_permission, paid_permission_minutes, penalty_hours });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-stats'] });
      closeModal();
    }
  });


  const formatRequestedAt = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const filteredRequests = requests?.filter(req => {
    if (filterStatus !== 'all' && req.status !== filterStatus) return false;

    if (filterEmployee && !req.user_name.toLowerCase().includes(filterEmployee.toLowerCase())) return false;

    if (filterType !== 'all') {
      const typeStr = req.type || 'manual_clock';
      if (typeStr !== filterType) return false;
    }

    const reqDate = new Date(req.created_at).getTime();

    if (filterStartDate) {
      const start = new Date(filterStartDate);
      start.setHours(0, 0, 0, 0);
      if (reqDate < start.getTime()) return false;
    }

    if (filterEndDate) {
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      if (reqDate > end.getTime()) return false;
    }

    return true;
  });

  const openModal = (req: RequestLog) => {
    setSelectedRequest(req);
    setManagerNote(req.manager_note || '');
    setIsPaidPermission(false);
    setPaidPermissionMinutes(0);
    setMaxPaidMinutes(0);
    setPenaltyHours(0);
    setIsRejecting(false);
    setError(null);

    if (req.type === 'overtime_approval' && req.details) {
      try {
        const details = JSON.parse(req.details);
        setApprovedMinutes(details.requested_overtime_minutes || details.raw_overtime_minutes || 0);
      } catch (e) {
        setApprovedMinutes(0);
      }
    } else if (req.type === 'early_leave_approval' || req.type === 'attendance_correction') {
      try {
        const details = JSON.parse(req.details || '{}');
        const missing = details.missing_minutes || details.early_leave_minutes || 0;
        setMaxPaidMinutes(missing);
        setPaidPermissionMinutes(missing);
        setIsPaidPermission(missing > 0);
      } catch (e) {
        setMaxPaidMinutes(0);
        setPaidPermissionMinutes(0);
      }
    } else {
      setApprovedMinutes(0);
    }
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setManagerNote('');
    setError(null);
    setApprovedMinutes(0);
  };

  let isFrozen = false;
  let frozenTooltip = '';

  if (selectedRequest && selectedRequest.status === 'pending') {
    if (selectedRequest.type === 'overtime_approval') {
        const hasClockedOut = !!selectedRequest.original_check_out || !!selectedRequest.requested_check_out;
        let hoursPassed = 0;
        if (selectedRequest.original_check_in) {
            hoursPassed = (Date.now() - new Date(selectedRequest.original_check_in).getTime()) / (1000 * 60 * 60);
        }
        if (!hasClockedOut || hoursPassed < 3) {
            isFrozen = true;
            frozenTooltip = "Wait for 3 hours and Clock-out to finalize.";
        }
    } else if (selectedRequest.type === 'permission_to_leave') {
        if (!selectedRequest.interruption_end_time) {
            isFrozen = true;
            frozenTooltip = "Wait for the employee to Resume work.";
        }
    }
  }

  const handleApprove = () => {
    if (!selectedRequest || isFrozen) return;
    if (!managerNote.trim()) {
      setError("A manager note is mandatory to approve or reject this request.");
      return;
    }
    updateStatusMutation.mutate({
      id: selectedRequest.id,
      status: 'approved',
      manager_note: managerNote,
      approved_minutes: selectedRequest.type === 'overtime_approval' ? approvedMinutes : undefined,
      is_paid_permission: isPaidPermission,
      paid_permission_minutes: isPaidPermission ? paidPermissionMinutes : 0
    });
  };

  const handleReject = () => {
    if (!selectedRequest || isFrozen) return;
    if (!managerNote.trim()) {
      setError("A manager note is mandatory to approve or reject this request.");
      return;
    }
    updateStatusMutation.mutate({
      id: selectedRequest.id,
      status: 'rejected',
      manager_note: managerNote,
      penalty_hours: penaltyHours
    });
  };

  const checkIsFrozen = (req: RequestLog) => {
    if (req.status !== 'pending') return true;
    if (req.type === 'overtime_approval') {
        const hasClockedOut = !!req.original_check_out || !!req.requested_check_out;
        let hoursPassed = 0;
        if (req.original_check_in) {
            hoursPassed = (Date.now() - new Date(req.original_check_in).getTime()) / (1000 * 60 * 60);
        }
        if (!hasClockedOut || hoursPassed < 3) {
            return true;
        }
    } else if (req.type === 'permission_to_leave') {
        if (!req.interruption_end_time) {
            return true;
        }
    }
    return false;
  };

  const handleBulkApprove = async () => {
    if (selectedRequestIds.size === 0) return;
    if (!bulkManagerNote.trim()) {
      setBulkError("A manager note is mandatory to approve these requests.");
      return;
    }
    setBulkError(null);
    for (const id of Array.from(selectedRequestIds)) {
      const req = requests?.find(r => r.id === id);
      let payload: any = { id: id as number, status: 'approved', manager_note: bulkManagerNote };

      if (req?.type === 'overtime_approval' && req.details) {
        try {
          const details = JSON.parse(req.details);
          payload.approved_minutes = details.requested_overtime_minutes || details.raw_overtime_minutes || 0;
        } catch (e) {}
      } else if ((req?.type === 'early_leave_approval' || req?.type === 'attendance_correction') && req.details) {
        try {
          const details = JSON.parse(req.details);
          const missing = details.missing_minutes || details.early_leave_minutes || 0;
          if (missing > 0) {
              payload.is_paid_permission = true;
              payload.paid_permission_minutes = missing;
          }
        } catch (e) {}
      }
      await updateStatusMutation.mutateAsync(payload);
    }
    setSelectedRequestIds(new Set());
    setBulkManagerNote('');
  };

  const handleBulkReject = async () => {
    if (selectedRequestIds.size === 0) return;
    if (!bulkManagerNote.trim()) {
      setBulkError("A manager note is mandatory to reject these requests.");
      return;
    }
    setBulkError(null);
    for (const id of Array.from(selectedRequestIds)) {
      const req = requests?.find(r => r.id === id);
      let payload: any = { id: id as number, status: 'rejected', manager_note: bulkManagerNote };

      if (req?.type === 'overtime_approval' && req.details) {
        try {
          const details = JSON.parse(req.details);
          payload.approved_minutes = details.requested_overtime_minutes || details.raw_overtime_minutes || 0;
        } catch (e) {}
      }
      await updateStatusMutation.mutateAsync(payload);
    }
    setSelectedRequestIds(new Set());
    setBulkManagerNote('');
    setIsBulkRejecting(false);
  };


  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Requests & Approvals</h2>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 space-y-4">
        {selectedRequestIds.size > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex-1 w-full">
              <label className="text-sm font-bold text-foreground mb-1 block">Bulk Justification <span className="text-destructive">*</span></label>
              <input
                type="text"
                placeholder="Manager note for all selected requests..."
                value={bulkManagerNote}
                onChange={(e) => {
                  setBulkManagerNote(e.target.value);
                  if (e.target.value.trim()) setBulkError(null);
                }}
                className={`w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 ${bulkError ? 'border-destructive' : 'border-border'}`}
              />
              {bulkError && <p className="text-xs text-destructive mt-1 font-medium">{bulkError}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-6 md:pt-0">
              {!isBulkRejecting ? (
                <>
                  <button
                    onClick={() => setIsBulkRejecting(true)}
                    className="px-4 py-2 bg-destructive/10 text-destructive text-sm font-medium rounded-lg hover:bg-destructive/20 transition-colors"
                  >
                    Reject Selected ({selectedRequestIds.size})
                  </button>
                  <button
                    onClick={handleBulkApprove}
                    disabled={updateStatusMutation.isPending}
                    className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Approve Selected ({selectedRequestIds.size})
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsBulkRejecting(false)}
                    className="px-4 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-lg hover:bg-muted/80 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkReject}
                    disabled={updateStatusMutation.isPending}
                    className="px-4 py-2 bg-destructive text-white text-sm font-medium rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50"
                  >
                    Confirm Reject ({selectedRequestIds.size})
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Employee</label>
            <input
              type="text"
              placeholder="Search..."
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All</option>
              <option value="manual_clock">Manual Clock</option>
              <option value="permission_to_leave">Permission to Leave</option>
              <option value="overtime_approval">Overtime</option>
              <option value="early_leave_approval">Early Leave</option>
              <option value="attendance_correction">Attendance Correction</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1">From Date</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1">To Date</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="pending">Pending Only</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
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
                  <th className="px-6 py-3 font-medium w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      checked={filteredRequests?.length > 0 && Array.from(selectedRequestIds).length === filteredRequests?.filter(req => !checkIsFrozen(req) && req.status === 'pending').length && filteredRequests?.filter(req => !checkIsFrozen(req) && req.status === 'pending').length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const newSet = new Set<number>();
                          filteredRequests?.forEach(req => {
                            if (!checkIsFrozen(req) && req.status === 'pending') {
                              newSet.add(req.id);
                            }
                          });
                          setSelectedRequestIds(newSet);
                        } else {
                          setSelectedRequestIds(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Reason</th>
                  <th className="px-6 py-3 font-medium">Requested At</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRequests?.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4">
                      {req.status === 'pending' && !checkIsFrozen(req) ? (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                          checked={selectedRequestIds.has(req.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedRequestIds);
                            if (e.target.checked) {
                              newSet.add(req.id);
                            } else {
                              newSet.delete(req.id);
                            }
                            setSelectedRequestIds(newSet);
                          }}
                        />
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                    </td>
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
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{formatRequestedAt(req.created_at)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                        req.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                        req.status === 'canceled' ? 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400' :
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

              {selectedRequest.type === 'attendance_correction' && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <h4 className="font-semibold text-sm text-primary">Attendance Correction Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/30 p-3 rounded-lg border border-border">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Original (Before)</label>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-muted-foreground">Clock In:</span>
                          <p className="font-mono text-sm">{formatTime(selectedRequest.original_check_in || null)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Clock Out:</span>
                          <p className="font-mono text-sm">{formatTime(selectedRequest.original_check_out || null)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                      <label className="text-xs font-bold text-primary uppercase tracking-wider mb-2 block">Proposed (After)</label>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-muted-foreground">Clock In:</span>
                          <p className="font-mono text-sm font-medium">
                            {(() => {
                              try {
                                const details = JSON.parse(selectedRequest.details || '{}');
                                return formatTime(details.new_clock_in || null);
                              } catch (e) { return '-'; }
                            })()}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Clock Out:</span>
                          <p className="font-mono text-sm font-medium">
                            {(() => {
                              try {
                                const details = JSON.parse(selectedRequest.details || '{}');
                                return formatTime(details.new_clock_out || null);
                              } catch (e) { return '-'; }
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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

              {(selectedRequest.type === 'early_leave_approval' || selectedRequest.type === 'attendance_correction') && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
                    <input
                      type="checkbox"
                      id="paid-permission"
                      checked={isPaidPermission}
                      onChange={(e) => setIsPaidPermission(e.target.checked)}
                      disabled={selectedRequest.status !== 'pending'}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div>
                      <label htmlFor="paid-permission" className="text-sm font-semibold block">Mark as Paid Permission</label>
                      <p className="text-xs text-muted-foreground">If enabled, you can specify how many minutes are paid.</p>
                    </div>
                  </div>

                  {isPaidPermission && (
                    <div className="space-y-2 pl-7">
                      <label className="text-sm font-medium">Approved Paid Minutes</label>
                      <input
                        type="number"
                        value={paidPermissionMinutes}
                        max={maxPaidMinutes}
                        onChange={(e) => {
                          const val = Math.min(maxPaidMinutes, Math.max(0, Number(e.target.value)));
                          setPaidPermissionMinutes(val);
                        }}
                        disabled={selectedRequest.status !== 'pending'}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                      />
                      <p className="text-xs text-muted-foreground">
                        Max allowed: {maxPaidMinutes} minutes.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-foreground">Manager Justification <span className="text-destructive">*</span></label>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded uppercase">Required for Payroll Audit</span>
                </div>
                <textarea
                  value={managerNote}
                  onChange={(e) => {
                    setManagerNote(e.target.value);
                    if (e.target.value.trim()) setError(null);
                  }}
                  disabled={selectedRequest.status !== 'pending'}
                  placeholder="Explain why this request is being approved or rejected..."
                  className={`w-full px-4 py-3 bg-amber-50/30 dark:bg-amber-500/5 border-2 rounded-xl min-h-[100px] focus:ring-4 focus:ring-primary/10 outline-none resize-none transition-all disabled:opacity-50 ${
                    error ? 'border-destructive' : 'border-amber-200 dark:border-amber-500/20'
                  }`}
                />
                {error && <p className="text-xs text-destructive font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {error}
                </p>}
                <p className="text-[11px] text-muted-foreground italic">
                  This note will be permanently attached to the payroll transaction and visible to the employee.
                </p>
              </div>
            </div>

            {selectedRequest.status === 'pending' && (
              <div className="p-6 border-t border-border bg-muted/30 space-y-4">
                {isRejecting && (
                  <div className="bg-destructive/5 p-4 rounded-xl border border-destructive/20 animate-in fade-in slide-in-from-top-2">
                    <label className="text-sm font-bold text-destructive block mb-2">
                      Apply Disciplinary Penalty (Hours)
                    </label>
                    <input
                      type="number"
                      value={penaltyHours}
                      onChange={(e) => setPenaltyHours(Math.max(0, Number(e.target.value)))}
                      placeholder="0.0"
                      step="0.5"
                      className="w-full px-3 py-2 bg-background border border-destructive/20 rounded-lg focus:ring-2 focus:ring-destructive/20 outline-none font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground mt-2 italic">
                      Did this unauthorized action disrupt operations? You can apply an additional penalty deduction here.
                    </p>
                  </div>
                )}

                <div className="flex gap-3" title={isFrozen ? frozenTooltip : undefined}>
                  {!isRejecting ? (
                    <>
                      <button
                        onClick={() => setIsRejecting(true)}
                        disabled={isFrozen}
                        className="flex-1 px-4 py-3 bg-destructive/10 text-destructive font-bold rounded-xl hover:bg-destructive/20 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <XCircle className="w-5 h-5" /> Reject
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={updateStatusMutation.isPending || !managerNote.trim() || isFrozen}
                        className="flex-1 px-4 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
                      >
                        <CheckCircle className="w-5 h-5" /> Approve
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsRejecting(false)}
                        className="px-4 py-3 bg-muted text-muted-foreground font-bold rounded-xl hover:bg-muted/80 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={updateStatusMutation.isPending || !managerNote.trim() || isFrozen}
                        className="flex-1 px-4 py-3 bg-destructive text-white font-bold rounded-xl hover:bg-destructive/90 shadow-lg shadow-destructive/20 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <XCircle className="w-5 h-5" /> Confirm Rejection
                      </button>
                    </>
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
