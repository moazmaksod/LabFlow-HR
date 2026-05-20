import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { formatDisplayTime, getWebNow as getSystemNow, calculateHoursBetween, getTimestamp, formatDuration } from '../../lib/timeManager';
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
  interruption_start_time?: string | null;
  interruption_end_time?: string | null;
  shift_instance_id?: number | null;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
  shift_logical_date?: string | null;
  status: string;
  created_at: string;
  details?: string;
  manager_note?: string;
}

export default function RequestManagement() {
  const queryClient = useQueryClient();
  const user = useAuthStore(state => state.user);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<RequestLog | null>(null);
  const [managerNote, setManagerNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [acceptedDurationHHMM, setAcceptedDurationHHMM] = useState('00:00');
  const [penaltyHours, setPenaltyHours] = useState<number>(0);
  const [isRejecting, setIsRejecting] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<number>>(new Set());
  const [bulkManagerNote, setBulkManagerNote] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkRejecting, setIsBulkRejecting] = useState(false);

  const formatToHHMM = (isoString: string | null | undefined) => {
    if (!isoString) return '--:--';
    return formatDisplayTime(isoString, user?.display_timezone, 'HH:mm');
  };

  const getDurationMins = (start: string | null | undefined, end: string | null | undefined): number => {
    if (!start || !end) return 0;
    return Math.max(0, Math.floor((getTimestamp(end) - getTimestamp(start)) / 60000));
  };

  const parseHHMMToMinutes = (val: string): number => {
    const parts = val.split(':');
    if (parts.length === 2) {
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      return hours * 60 + minutes;
    }
    const mins = parseInt(val, 10);
    return isNaN(mins) ? 0 : mins;
  };

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
    return formatDisplayTime(isoString, user?.display_timezone, 'MMM dd, HH:mm');
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    return formatDisplayTime(isoString, user?.display_timezone, 'MMM dd, HH:mm');
  };

  const filteredRequests = requests?.filter(req => {
    if (filterStatus !== 'all' && req.status !== filterStatus) return false;

    if (filterEmployee && !req.user_name.toLowerCase().includes(filterEmployee.toLowerCase())) return false;

    if (filterType !== 'all') {
      const typeStr = req.type || 'manual_clock';
      if (typeStr !== filterType) return false;
    }

    const reqDate = getTimestamp(req.created_at);

    if (filterStartDate) {
      const startTimestamp = getTimestamp(filterStartDate);
      if (reqDate < startTimestamp) return false;
    }

    if (filterEndDate) {
      const endTimestamp = getTimestamp(filterEndDate) + (24 * 60 * 60 * 1000) - 1;
      if (reqDate > endTimestamp) return false;
    }

    return true;
  });

  const openModal = (req: RequestLog) => {
    setSelectedRequest(req);
    setManagerNote(req.manager_note || '');
    setPenaltyHours(0);
    setIsRejecting(false);
    setError(null);

    let initialMins = 0;
    if (req.type === 'overtime_approval') {
      try {
        const details = JSON.parse(req.details || '{}');
        initialMins = details.requested_overtime_minutes || details.raw_overtime_minutes || 0;
      } catch (e) {}
    } else if (req.type === 'permission_to_leave' || req.type === 'shift_interruption_review') {
      initialMins = getDurationMins(req.interruption_start_time, req.interruption_end_time);
    } else if (req.type === 'early_leave_approval') {
      try {
        const details = JSON.parse(req.details || '{}');
        initialMins = details.missing_minutes || details.early_leave_minutes || 0;
      } catch (e) {}
    } else if (req.type === 'late_in_approval') {
      try {
        const details = JSON.parse(req.details || '{}');
        initialMins = details.missing_minutes || details.late_in_minutes || 0;
      } catch (e) {}
      if (!initialMins && req.original_check_in && req.shift_start_time) {
        initialMins = getDurationMins(req.shift_start_time, req.original_check_in);
      }
    }
    setAcceptedDurationHHMM(formatDuration(initialMins));
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setManagerNote('');
    setError(null);
    setAcceptedDurationHHMM('00:00');
  };

  const handleApprove = () => {
    if (!selectedRequest) return;
    if (!managerNote.trim()) {
      setError("A manager note is mandatory to approve or reject this request.");
      return;
    }
    const durationMinutes = parseHHMMToMinutes(acceptedDurationHHMM);
    const isOvertime = selectedRequest.type === 'overtime_approval';
    updateStatusMutation.mutate({
      id: selectedRequest.id,
      status: 'approved',
      manager_note: managerNote,
      approved_minutes: isOvertime ? durationMinutes : undefined,
      is_paid_permission: !isOvertime,
      paid_permission_minutes: !isOvertime ? durationMinutes : 0
    });
  };

  const handleReject = () => {
    if (!selectedRequest) return;
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
      } else if (req?.type === 'permission_to_leave' || req?.type === 'shift_interruption_review') {
        const duration = getDurationMins(req.interruption_start_time, req.interruption_end_time);
        payload.is_paid_permission = true;
        payload.paid_permission_minutes = duration;
      } else if (req?.type === 'late_in_approval') {
        let missing = 0;
        try {
          const details = JSON.parse(req.details || '{}');
          missing = details.missing_minutes || details.late_in_minutes || 0;
        } catch (e) {}
        if (!missing && req.original_check_in && req.shift_start_time) {
          missing = getDurationMins(req.shift_start_time, req.original_check_in);
        }
        payload.is_paid_permission = true;
        payload.paid_permission_minutes = missing;
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
              <option value="shift_interruption_review">Shift Interruption Review</option>
              <option value="overtime_approval">Overtime</option>
              <option value="early_leave_approval">Early Leave</option>
              <option value="late_in_approval">Late In</option>
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
                      checked={filteredRequests?.length > 0 && Array.from(selectedRequestIds).length === filteredRequests?.filter(req => req.status === 'pending').length && filteredRequests?.filter(req => req.status === 'pending').length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const newSet = new Set<number>();
                          filteredRequests?.forEach(req => {
                            if (req.status === 'pending') {
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
                      {req.status === 'pending' ? (
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
                        req.type === 'shift_interruption_review' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                        req.type === 'late_in_approval' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                        req.type === 'attendance_correction' ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400' :
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
              {(() => {
                const parsedDetails = (() => {
                  try {
                    return JSON.parse(selectedRequest.details || '{}');
                  } catch {
                    return {};
                  }
                })();
                
                return (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Employee</label>
                      <p className="font-medium">{selectedRequest.user_name}</p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                      <p className="capitalize font-medium">{selectedRequest.type?.replace(/_/g, ' ') || 'Manual Clock'}</p>
                    </div>

                    {/* Related Shift Section */}
                    <div className="pt-2 border-t border-border">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Related Shift</label>
                      {selectedRequest.shift_instance_id ? (
                        <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Shift ID:</span>
                            <span className="font-medium">{selectedRequest.shift_instance_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Logical Date:</span>
                            <span className="font-medium">{selectedRequest.shift_logical_date}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Scheduled Time:</span>
                            <span className="font-mono text-xs">
                              {formatToHHMM(selectedRequest.shift_start_time)} - {formatToHHMM(selectedRequest.shift_end_time)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-muted/10 p-2 rounded-lg border border-border text-xs text-muted-foreground italic">
                          No related scheduled shift (Unscheduled)
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason provided</label>
                      <p className="text-sm mt-1 bg-muted/50 p-3 rounded-lg border border-border">{selectedRequest.reason}</p>
                    </div>

                    {/* Specific Request Detail Types */}
                    {selectedRequest.type === 'permission_to_leave' && (
                      <div className="space-y-3 pt-2 border-t border-border">
                        <h4 className="font-semibold text-sm text-primary">Permission Details</h4>
                        <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Away Time:</span>
                            <span className="font-mono">{formatToHHMM(selectedRequest.interruption_start_time)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Resume Time:</span>
                            <span className="font-mono">{formatToHHMM(selectedRequest.interruption_end_time)}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/50 pt-1 mt-1 font-medium">
                            <span className="text-xs text-muted-foreground">Total Period Duration:</span>
                            <span className="font-mono">
                              {formatDuration(getDurationMins(selectedRequest.interruption_start_time, selectedRequest.interruption_end_time))}
                            </span>
                          </div>
                        </div>

                        {selectedRequest.status === 'pending' && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium block">Accepted Paid Duration (HH:MM)</label>
                            <input
                              type="text"
                              placeholder="HH:MM"
                              value={acceptedDurationHHMM}
                              onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono"
                            />
                            <p className="text-xs text-muted-foreground">Specify the accepted duration of the permission.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedRequest.type === 'shift_interruption_review' && (
                      <div className="space-y-3 pt-2 border-t border-border">
                        <h4 className="font-semibold text-sm text-primary">Interruption Details</h4>
                        <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Start Gap Time:</span>
                            <span className="font-mono">{formatToHHMM(selectedRequest.interruption_start_time)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">End Gap Time:</span>
                            <span className="font-mono">{formatToHHMM(selectedRequest.interruption_end_time)}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/50 pt-1 mt-1 font-medium">
                            <span className="text-xs text-muted-foreground">Gap Duration:</span>
                            <span className="font-mono">
                              {formatDuration(getDurationMins(selectedRequest.interruption_start_time, selectedRequest.interruption_end_time))}
                            </span>
                          </div>
                        </div>

                        {selectedRequest.status === 'pending' && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium block">Accepted Paid Duration (HH:MM)</label>
                            <input
                              type="text"
                              placeholder="HH:MM"
                              value={acceptedDurationHHMM}
                              onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono"
                            />
                            <p className="text-xs text-muted-foreground">Specify the accepted duration of the interruption.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedRequest.type === 'overtime_approval' && (
                      <div className="space-y-3 pt-2 border-t border-border">
                        <h4 className="font-semibold text-sm text-primary">Overtime Details</h4>
                        <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Clock In Time:</span>
                            <span className="font-mono">{formatToHHMM(selectedRequest.original_check_in)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Clock Out Time:</span>
                            <span className="font-mono">{formatToHHMM(selectedRequest.original_check_out)}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/50 pt-1 mt-1 font-medium">
                            <span className="text-xs text-muted-foreground">Total Working Duration:</span>
                            <span className="font-mono">
                              {formatDuration(getDurationMins(selectedRequest.original_check_in, selectedRequest.original_check_out))}
                            </span>
                          </div>
                        </div>

                        {selectedRequest.status === 'pending' && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium block">Accepted Overtime Duration (HH:MM)</label>
                            <input
                              type="text"
                              placeholder="HH:MM"
                              value={acceptedDurationHHMM}
                              onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono"
                            />
                            <p className="text-xs text-muted-foreground">Specify the approved overtime duration.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedRequest.type === 'early_leave_approval' && (
                      <div className="space-y-3 pt-2 border-t border-border">
                        <h4 className="font-semibold text-sm text-primary">Early Leave Details</h4>
                        <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Leave Time:</span>
                            <span className="font-mono">{formatToHHMM(selectedRequest.original_check_out)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Missing Duration:</span>
                            <span className="font-mono">
                              {formatDuration(parsedDetails.missing_minutes || parsedDetails.early_leave_minutes || 0)}
                            </span>
                          </div>
                        </div>

                        {selectedRequest.status === 'pending' && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium block">Accepted Paid Duration (HH:MM)</label>
                            <input
                              type="text"
                              placeholder="HH:MM"
                              value={acceptedDurationHHMM}
                              onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono"
                            />
                            <p className="text-xs text-muted-foreground">Specify the accepted paid duration for the missing early leave time.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedRequest.type === 'late_in_approval' && (
                      <div className="space-y-3 pt-2 border-t border-border">
                        <h4 className="font-semibold text-sm text-primary">Late In Details</h4>
                        <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Login Time:</span>
                            <span className="font-mono">{formatToHHMM(selectedRequest.original_check_in)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Missing Duration:</span>
                            <span className="font-mono">
                              {(() => {
                                const mins = parsedDetails.missing_minutes || parsedDetails.late_in_minutes || 0;
                                if (mins > 0) return formatDuration(mins);
                                if (selectedRequest.original_check_in && selectedRequest.shift_start_time) {
                                  return formatDuration(getDurationMins(selectedRequest.shift_start_time, selectedRequest.original_check_in));
                                }
                                return '--:--';
                              })()}
                            </span>
                          </div>
                        </div>

                        {selectedRequest.status === 'pending' && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium block">Accepted Paid Duration (HH:MM)</label>
                            <input
                              type="text"
                              placeholder="HH:MM"
                              value={acceptedDurationHHMM}
                              onChange={(e) => setAcceptedDurationHHMM(e.target.value)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono"
                            />
                            <p className="text-xs text-muted-foreground">Specify the accepted paid duration for the late check-in.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedRequest.type === 'attendance_correction' && (
                      <div className="space-y-4 pt-2 border-t border-border">
                        <h4 className="font-semibold text-sm text-primary">Attendance Correction Details</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-muted/30 p-3 rounded-lg border border-border">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Original (Before)</label>
                            <div className="space-y-2">
                              <div>
                                <span className="text-xs text-muted-foreground">Clock In:</span>
                                <p className="font-mono text-xs">{formatTime(selectedRequest.original_check_in || null)}</p>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground">Clock Out:</span>
                                <p className="font-mono text-xs">{formatTime(selectedRequest.original_check_out || null)}</p>
                              </div>
                              <div className="border-t border-border/50 pt-1 mt-1">
                                <span className="text-xs text-muted-foreground">Duration:</span>
                                <p className="font-mono text-xs font-medium">
                                  {formatDuration(getDurationMins(selectedRequest.original_check_in, selectedRequest.original_check_out))}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                            <label className="text-xs font-bold text-primary uppercase tracking-wider mb-2 block">Proposed (After)</label>
                            <div className="space-y-2">
                              <div>
                                <span className="text-xs text-muted-foreground">Clock In:</span>
                                <p className="font-mono text-xs font-medium font-mono font-medium">
                                  {formatTime(parsedDetails.new_clock_in || null)}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground">Clock Out:</span>
                                <p className="font-mono text-xs font-medium font-mono font-medium">
                                  {formatTime(parsedDetails.new_clock_out || null)}
                                </p>
                              </div>
                              <div className="border-t border-primary/20 pt-1 mt-1">
                                <span className="text-xs text-muted-foreground">Duration:</span>
                                <p className="font-mono text-xs font-medium">
                                  {formatDuration(getDurationMins(parsedDetails.new_clock_in, parsedDetails.new_clock_out))}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedRequest.status !== 'pending' && (
                      <div className="bg-muted/20 p-3 rounded-lg border border-border space-y-1.5 text-sm pt-2 border-t border-border">
                        <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Processed Details</h4>
                        {selectedRequest.type === 'overtime_approval' && parsedDetails.approved_minutes !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Approved Overtime:</span>
                            <span className="font-mono font-medium">{formatDuration(parsedDetails.approved_minutes)}</span>
                          </div>
                        )}
                        {['permission_to_leave', 'shift_interruption_review', 'early_leave_approval', 'late_in_approval'].includes(selectedRequest.type || '') && parsedDetails.paid_permission_minutes !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Approved Paid Duration:</span>
                            <span className="font-mono font-medium">{formatDuration(parsedDetails.paid_permission_minutes)}</span>
                          </div>
                        )}
                        {selectedRequest.status === 'rejected' && parsedDetails.penalty_hours !== undefined && parsedDetails.penalty_hours > 0 && (
                          <div className="flex justify-between text-destructive">
                            <span className="text-xs">Disciplinary Penalty Applied:</span>
                            <span className="font-mono font-bold">{parsedDetails.penalty_hours} Hours</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

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
                {isRejecting && ['permission_to_leave', 'shift_interruption_review', 'early_leave_approval', 'late_in_approval'].includes(selectedRequest.type || '') && (
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
                      className="w-full px-3 py-2 bg-background border border-destructive/20 rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground mt-2 italic">
                      Did this unauthorized action disrupt operations? You can apply an additional penalty deduction here.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  {!isRejecting ? (
                    <>
                      <button
                        onClick={() => setIsRejecting(true)}
                        className="flex-1 px-4 py-3 bg-destructive/10 text-destructive font-bold rounded-xl hover:bg-destructive/20 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <XCircle className="w-5 h-5" /> Reject
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={updateStatusMutation.isPending || !managerNote.trim()}
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
                        disabled={updateStatusMutation.isPending || !managerNote.trim()}
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
