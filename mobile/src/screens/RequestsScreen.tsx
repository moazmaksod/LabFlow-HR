import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, Calendar, CheckCircle, XCircle, AlertCircle, MessageSquare, X, ArrowRight, CornerDownRight } from 'lucide-react-native';
import api from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { saveOfflineRequest } from '../lib/db';
import { useSettingsStore } from '../store/useSettingsStore';
import { formatDisplayDate, formatDisplayTime, formatDuration } from '../lib/timeManager';

interface RequestItem {
  id: number;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  manager_note?: string;
  created_at: string;
  attendance_date?: string;
  original_check_in?: string;
  original_check_out?: string;
  requested_check_in?: string;
  requested_check_out?: string;
  value?: number;
  attendance_shift_id?: string;
  approved_overtime_minutes?: number;
  interruption_start_time?: string;
  interruption_end_time?: string;
  shift_instance_id?: number;
  shift_start_time?: string;
  shift_end_time?: string;
  shift_logical_date?: string;
  paid_minutes?: number;
  penalty_minutes?: number;
}

export default function RequestsScreen() {
  const { user } = useAuthStore();
  const userTimezone = useSettingsStore((state) => state.userTimezone);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Manager Action State
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [managerNote, setManagerNote] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'approved' | 'rejected' | null>(null);
  const [isPaidPermission, setIsPaidPermission] = useState(false);
  const [paidPermissionMinutes, setPaidPermissionMinutes] = useState('0');
  const [maxPaidMinutes, setMaxPaidMinutes] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const { isConnected } = useNetworkStore();

  const isManager = user?.role === 'manager' || user?.role === 'admin';

  const fetchRequests = async () => {
    if (!isConnected) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const response = await api.get('/requests');
      setRequests(response.data);
    } catch (error: any) {
      if (!error.isNetworkError) {
        console.error('Error fetching requests:', error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleAction = (request: RequestItem, type: 'approved' | 'rejected') => {
    setSelectedRequest(request);
    setActionType(type);
    setManagerNote('');
    
    let missing = request.value || 0;
    setMaxPaidMinutes(missing);
    setPaidPermissionMinutes(missing.toString());
    setIsPaidPermission(missing > 0);
    
    setModalVisible(true);
  };

  const submitAction = async () => {
    if (!selectedRequest || !actionType) return;
    
    if (!managerNote.trim()) {
      Alert.alert('Required Field', 'A manager note is mandatory to approve or reject this request.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        status: actionType,
        manager_note: managerNote,
        paid_minutes: isPaidPermission ? parseInt(paidPermissionMinutes) || 0 : 0
      };
      await api.put(`/requests/${selectedRequest.id}/status`, payload);
      Alert.alert('Success', `Request has been ${actionType}.`);
      setModalVisible(false);
      fetchRequests();
    } catch (error: any) {
      if (!error.response) {
        saveOfflineRequest('PUT', `/requests/${selectedRequest.id}/status`, {
          status: actionType,
          manager_note: managerNote,
          paid_minutes: isPaidPermission ? parseInt(paidPermissionMinutes) || 0 : 0
        });
        Alert.alert('Offline Mode', 'Network error. Your action was saved locally and will be synced later.');
        setModalVisible(false);
        // Optimistically update the UI
        setRequests(prev => prev.map(r => r.id === selectedRequest.id ? { ...r, status: actionType } : r));
      } else {
        Alert.alert('Error', error.response?.data?.error || 'Failed to update request status');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatRequestType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getRequestAnchorTimestamp = (item: RequestItem) => {
    return item.original_check_in || item.requested_check_in || item.shift_start_time || item.interruption_start_time || item.created_at;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return formatDisplayDate(dateString, userTimezone, 'EEE, MMM d');
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '';
    return formatDisplayTime(timeString, userTimezone, 'HH:mm');
  };

  const getStatusColors = (status: string) => {
    switch (status) {
      case 'approved':
        return { text: '#15803d', bg: '#dcfce7', border: '#bbf7d0' };
      case 'rejected':
        return { text: '#b91c1c', bg: '#fee2e2', border: '#fecaca' };
      case 'pending':
        return { text: '#b45309', bg: '#fef3c7', border: '#fde68a' };
      default:
        return { text: '#4b5563', bg: '#f3f4f6', border: '#e5e7eb' };
    }
  };

  const getRequestTypeColors = (type: string) => {
    switch (type) {
      case 'permission_to_leave':
        return { text: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' };
      case 'overtime_approval':
        return { text: '#7e22ce', bg: '#f3e8ff', border: '#e9d5ff' };
      case 'early_leave_approval':
        return { text: '#c2410c', bg: '#ffedd5', border: '#fed7aa' };
      case 'shift_interruption_review':
        return { text: '#b45309', bg: '#fef3c7', border: '#fde68a' };
      case 'late_in_approval':
        return { text: '#be123c', bg: '#ffe4e6', border: '#fecdd3' };
      case 'attendance_correction':
        return { text: '#0f766e', bg: '#ccfbf1', border: '#99f6e4' };
      default: // manual_clock
        return { text: '#374151', bg: '#f3f4f6', border: '#e5e7eb' };
    }
  };

  const getStatusIcon = (status: string, color: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={14} color={color} />;
      case 'rejected': return <XCircle size={14} color={color} />;
      case 'pending': return <Clock size={14} color={color} />;
      default: return <AlertCircle size={14} color={color} />;
    }
  };

  const getDurationMins = (start: string | null | undefined, end: string | null | undefined): number => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setSeconds(0, 0);
    startDate.setMilliseconds(0);
    endDate.setSeconds(0, 0);
    endDate.setMilliseconds(0);
    return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 60000));
  };

  const renderRequestDetails = (item: RequestItem) => {
    const duration = item.type === 'permission_to_leave' || item.type === 'shift_interruption_review'
      ? getDurationMins(item.interruption_start_time, item.interruption_end_time)
      : item.value || 0;

    switch (item.type) {
      case 'manual_clock':
        return (
          <View style={styles.detailsTable}>
            {item.requested_check_in && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Requested Check-In</Text>
                <Text style={styles.detailValue}>{formatTime(item.requested_check_in)}</Text>
              </View>
            )}
            {item.requested_check_out && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Requested Check-Out</Text>
                <Text style={styles.detailValue}>{formatTime(item.requested_check_out)}</Text>
              </View>
            )}
          </View>
        );

      case 'attendance_correction':
        const origDuration = getDurationMins(item.original_check_in, item.original_check_out);
        const propDuration = getDurationMins(item.requested_check_in, item.requested_check_out);
        return (
          <View style={styles.detailsTable}>
            <Text style={styles.detailsHeader}>Attendance Correction</Text>
            <View style={styles.cardCorrectionContainer}>
              <View style={[styles.correctionBox, styles.originalBox]}>
                <Text style={styles.correctionBoxTitle}>ORIGINAL (BEFORE)</Text>
                <View style={styles.correctionRow}>
                  <Text style={styles.correctionLabel}>In:</Text>
                  <Text style={styles.correctionTimeText}>{formatTime(item.original_check_in)}</Text>
                </View>
                <View style={styles.correctionRow}>
                  <Text style={styles.correctionLabel}>Out:</Text>
                  <Text style={styles.correctionTimeText}>{formatTime(item.original_check_out)}</Text>
                </View>
                <View style={[styles.correctionRow, styles.correctionBorderTop]}>
                  <Text style={styles.correctionLabel}>Dur:</Text>
                  <Text style={styles.correctionDurationText}>{formatDuration(origDuration)}</Text>
                </View>
              </View>

              <View style={styles.arrowContainer}>
                <ArrowRight size={16} color="#9ca3af" />
              </View>

              <View style={[styles.correctionBox, styles.proposedBox]}>
                <Text style={styles.correctionBoxTitle}>PROPOSED (AFTER)</Text>
                <View style={styles.correctionRow}>
                  <Text style={styles.correctionLabel}>In:</Text>
                  <Text style={styles.correctionTimeText}>{formatTime(item.requested_check_in)}</Text>
                </View>
                <View style={styles.correctionRow}>
                  <Text style={styles.correctionLabel}>Out:</Text>
                  <Text style={styles.correctionTimeText}>{formatTime(item.requested_check_out)}</Text>
                </View>
                <View style={[styles.correctionRow, styles.correctionBorderTop]}>
                  <Text style={styles.correctionLabel}>Dur:</Text>
                  <Text style={styles.correctionDurationText}>{formatDuration(propDuration)}</Text>
                </View>
              </View>
            </View>
          </View>
        );

      case 'late_in_approval':
        return (
          <View style={styles.detailsTable}>
            {item.shift_start_time && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Scheduled Shift Start</Text>
                <Text style={styles.detailValue}>{formatTime(item.shift_start_time)}</Text>
              </View>
            )}
            {item.original_check_in && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Actual Check-In Time</Text>
                <Text style={styles.detailValue}>{formatTime(item.original_check_in)}</Text>
              </View>
            )}
            <View style={[styles.detailRow, styles.detailBorderTop]}>
              <Text style={styles.detailLabel}>Late Duration</Text>
              <Text style={styles.detailValueHighlight}>{formatDuration(duration)}</Text>
            </View>
          </View>
        );

      case 'early_leave_approval':
        return (
          <View style={styles.detailsTable}>
            {item.original_check_out && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Actual Check-Out Time</Text>
                <Text style={styles.detailValue}>{formatTime(item.original_check_out)}</Text>
              </View>
            )}
            {item.shift_end_time && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Scheduled Shift End</Text>
                <Text style={styles.detailValue}>{formatTime(item.shift_end_time)}</Text>
              </View>
            )}
            <View style={[styles.detailRow, styles.detailBorderTop]}>
              <Text style={styles.detailLabel}>Early Leave Duration</Text>
              <Text style={styles.detailValueHighlight}>{formatDuration(duration)}</Text>
            </View>
          </View>
        );

      case 'permission_to_leave':
      case 'shift_interruption_review':
        return (
          <View style={styles.detailsTable}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Interruption Start</Text>
              <Text style={styles.detailValue}>{formatTime(item.interruption_start_time)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Interruption End</Text>
              <Text style={styles.detailValue}>{formatTime(item.interruption_end_time)}</Text>
            </View>
            <View style={[styles.detailRow, styles.detailBorderTop]}>
              <Text style={styles.detailLabel}>Total Interruption Duration</Text>
              <Text style={styles.detailValueHighlight}>{formatDuration(duration)}</Text>
            </View>
          </View>
        );

      case 'overtime_approval':
        const workingDuration = getDurationMins(item.original_check_in, item.original_check_out);
        return (
          <View style={styles.detailsTable}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Actual Clock-In</Text>
              <Text style={styles.detailValue}>{formatTime(item.original_check_in)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Actual Clock-Out</Text>
              <Text style={styles.detailValue}>{formatTime(item.original_check_out)}</Text>
            </View>
            {item.shift_start_time && item.shift_end_time && !item.attendance_shift_id?.startsWith('US_') && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Scheduled Shift</Text>
                <Text style={styles.detailValue}>{formatTime(item.shift_start_time)} - {formatTime(item.shift_end_time)}</Text>
              </View>
            )}
            <View style={[styles.detailRow, styles.detailBorderTop]}>
              <Text style={styles.detailLabel}>Total Work Duration</Text>
              <Text style={styles.detailValue}>{formatDuration(workingDuration)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Requested Overtime</Text>
              <Text style={styles.detailValueHighlight}>{formatDuration(duration)}</Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const renderProcessedOutcomes = (item: RequestItem) => {
    if (item.status === 'pending') return null;

    const isApproved = item.status === 'approved';
    const finalMins = item.paid_minutes !== undefined ? item.paid_minutes : (item.value || 0);

    return (
      <View style={[
        styles.outcomeContainer,
        {
          backgroundColor: isApproved ? '#f0fdf4' : '#fef2f2',
          borderColor: isApproved ? '#bbf7d0' : '#fecaca',
          borderWidth: 1
        }
      ]}>
        <View style={styles.outcomeHeader}>
          {isApproved ? (
            <CheckCircle size={14} color="#16a34a" />
          ) : (
            <XCircle size={14} color="#dc2626" />
          )}
          <Text style={[styles.outcomeTitle, { color: isApproved ? '#16a34a' : '#dc2626' }]}>
            {isApproved ? 'APPROVED OUTCOME' : 'REJECTED OUTCOME'}
          </Text>
        </View>

        {isApproved ? (
          item.type === 'attendance_correction' ? (
            <Text style={styles.outcomeText}>
              Shift check-in and check-out times updated to the proposed times.
            </Text>
          ) : item.type === 'overtime_approval' ? (
            <Text style={styles.outcomeText}>
              Overtime duration of <Text style={styles.outcomeTextBold}>{formatDuration(finalMins)}</Text> approved.
            </Text>
          ) : (
            <Text style={styles.outcomeText}>
              Paid credit of <Text style={styles.outcomeTextBold}>{formatDuration(finalMins)}</Text> approved.
            </Text>
          )
        ) : (
          <View>
            <Text style={styles.outcomeText}>
              This request was rejected. The duration remains unpaid.
            </Text>
            {item.penalty_minutes !== undefined && item.penalty_minutes > 0 && (
              <Text style={[styles.outcomeText, { color: '#b91c1c', marginTop: 4, fontWeight: '600' }]}>
                Disciplinary penalty applied: {(item.penalty_minutes / 60).toFixed(1)} Hours
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderRequestCard = ({ item }: { item: RequestItem }) => {
    const statusColors = getStatusColors(item.status);
    const typeColors = getRequestTypeColors(item.type);
    
    return (
      <View style={[styles.card, { borderLeftWidth: 5, borderLeftColor: statusColors.text }]}>
        <View style={styles.cardHeader}>
          <View style={styles.typeBadgeContainer}>
            <View style={[styles.typeBadge, { backgroundColor: typeColors.bg, borderColor: typeColors.border }]}>
              <Text style={[styles.typeText, { color: typeColors.text }]}>
                {formatRequestType(item.type || 'manual_clock')}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border, borderWidth: 1 }]}>
            {getStatusIcon(item.status, statusColors.text)}
            <Text style={[styles.statusText, { color: statusColors.text }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Calendar size={16} color="#6b7280" />
            <Text style={styles.infoText}>
              Shift Date: <Text style={styles.infoValue}>{formatDate(getRequestAnchorTimestamp(item))}</Text>
            </Text>
          </View>

          {renderRequestDetails(item)}
          
          <View style={styles.reasonContainer}>
            <Text style={styles.reasonLabel}>Reason:</Text>
            <Text style={styles.reasonText}>{item.reason}</Text>
          </View>

          {renderProcessedOutcomes(item)}

          {item.status !== 'pending' && item.manager_note && (
            <View style={styles.managerNoteContainer}>
              <View style={styles.managerNoteHeader}>
                <MessageSquare size={14} color="#4f46e5" />
                <Text style={styles.managerNoteLabel}>Manager Note</Text>
              </View>
              <Text style={styles.managerNoteText}>{item.manager_note}</Text>
            </View>
          )}
        </View>
        
        {isManager && item.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.rejectButton]} 
              onPress={() => handleAction(item, 'rejected')}
            >
              <XCircle size={16} color="#ef4444" />
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.approveButton]} 
              onPress={() => handleAction(item, 'approved')}
            >
              <CheckCircle size={16} color="#10b981" />
              <Text style={styles.approveButtonText}>Approve</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>Requested on {formatDate(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Requests</Text>
      </View>
      
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderRequestCard}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AlertCircle size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No requests found</Text>
            <Text style={styles.emptySubtext}>Your request history will appear here.</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {actionType === 'approved' ? 'Approve' : 'Reject'} Request
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#18181b" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.requestSummary}>
                <Text style={styles.summaryLabel}>Type:</Text>
                <Text style={styles.summaryValue}>{selectedRequest ? formatRequestType(selectedRequest.type) : ''}</Text>
                
                <Text style={styles.summaryLabel}>Reason:</Text>
                <Text style={styles.summaryValue}>{selectedRequest?.reason}</Text>

                {selectedRequest && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#e4e4e7', paddingTop: 12 }}>
                    {renderRequestDetails(selectedRequest)}
                  </View>
                )}
              </View>

              {actionType === 'approved' && (selectedRequest?.type === 'early_leave_approval' || selectedRequest?.type === 'attendance_correction') && (
                <View style={styles.paidPermissionContainer}>
                  <TouchableOpacity 
                    style={styles.checkboxRow} 
                    onPress={() => setIsPaidPermission(!isPaidPermission)}
                  >
                    <View style={[styles.checkbox, isPaidPermission && styles.checkboxChecked]}>
                      {isPaidPermission && <CheckCircle size={14} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkboxLabel}>Mark as Paid Permission</Text>
                      <Text style={styles.checkboxSubtext}>Specify how many minutes are paid.</Text>
                    </View>
                  </TouchableOpacity>

                  {isPaidPermission && (
                    <View style={styles.paidInputContainer}>
                      <Text style={styles.paidInputLabel}>Approved Paid Minutes (Max: {maxPaidMinutes})</Text>
                      <TextInput
                        style={styles.paidInput}
                        keyboardType="numeric"
                        value={paidPermissionMinutes}
                        onChangeText={(text) => {
                          const val = parseInt(text) || 0;
                          if (val <= maxPaidMinutes) {
                            setPaidPermissionMinutes(text);
                          } else {
                            setPaidPermissionMinutes(maxPaidMinutes.toString());
                          }
                        }}
                      />
                    </View>
                  )}
                </View>
              )}

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Manager Note <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <TextInput
                  style={styles.textInput}
                  multiline
                  numberOfLines={4}
                  value={managerNote}
                  onChangeText={setManagerNote}
                  placeholder="Enter reason for approval/rejection..."
                  placeholderTextColor="#a1a1aa"
                />
              </View>

              <TouchableOpacity 
                style={[
                  styles.submitButton, 
                  actionType === 'approved' ? styles.submitApprove : styles.submitReject
                ]}
                onPress={submitAction}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    Confirm {actionType === 'approved' ? 'Approval' : 'Rejection'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#18181b',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
  },
  typeContainer: {
    flex: 1,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardBody: {
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontWeight: '600',
    color: '#374151',
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  managerNoteContainer: {
    marginTop: 16,
    backgroundColor: '#eef2ff',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4f46e5',
  },
  managerNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  managerNoteLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
    textTransform: 'uppercase',
  },
  managerNoteText: {
    fontSize: 14,
    color: '#374151',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  cardFooter: {
    backgroundColor: '#fafafa',
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#f4f4f5',
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actionRow: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 0,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  approveButton: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  rejectButton: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  approveButtonText: {
    color: '#10b981',
    fontWeight: '700',
    fontSize: 14,
  },
  rejectButtonText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#18181b',
  },
  requestSummary: {
    backgroundColor: '#f4f4f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    color: '#18181b',
    fontWeight: '500',
    marginBottom: 12,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#18181b',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitApprove: {
    backgroundColor: '#10b981',
  },
  submitReject: {
    backgroundColor: '#ef4444',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  paidPermissionContainer: {
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#0ea5e9',
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369a1',
  },
  checkboxSubtext: {
    fontSize: 11,
    color: '#0ea5e9',
  },
  paidInputContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#bae6fd',
  },
  paidInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: 4,
  },
  paidInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: '#18181b',
  },
  typeBadgeContainer: {
    flex: 1,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  reasonContainer: {
    marginTop: 12,
  },
  detailsTable: {
    backgroundColor: '#fafafa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  detailsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71717a',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    marginTop: 4,
    paddingTop: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#71717a',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181b',
  },
  detailValueHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4f46e5',
  },
  cardCorrectionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  correctionBox: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
  originalBox: {
    backgroundColor: '#fafafa',
    borderColor: '#e4e4e7',
  },
  proposedBox: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  correctionBoxTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#71717a',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  correctionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  correctionBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    marginTop: 4,
    paddingTop: 6,
  },
  correctionLabel: {
    fontSize: 11,
    color: '#71717a',
  },
  correctionTimeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#18181b',
  },
  correctionDurationText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  arrowContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  outcomeContainer: {
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  outcomeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  outcomeTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  outcomeText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  outcomeTextBold: {
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4b5563',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
  },
});
