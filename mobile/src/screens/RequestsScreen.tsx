import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, Calendar, CheckCircle, XCircle, AlertCircle, MessageSquare, X } from 'lucide-react-native';
import api from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useNetworkStore } from '../store/useNetworkStore';

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
  details?: string;
}

export default function RequestsScreen() {
  const { user } = useAuthStore();
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
    
    let missing = 0;
    if (request.type === 'early_leave_approval' || request.type === 'attendance_correction') {
      try {
        const details = JSON.parse(request.details || '{}');
        missing = details.missing_minutes || details.early_leave_minutes || 0;
      } catch (e) {}
    }
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
        is_paid_permission: isPaidPermission,
        paid_permission_minutes: isPaidPermission ? parseInt(paidPermissionMinutes) || 0 : 0
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
          is_paid_permission: isPaidPermission,
          paid_permission_minutes: isPaidPermission ? parseInt(paidPermissionMinutes) || 0 : 0
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

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '';
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#10b981'; // Green
      case 'rejected': return '#ef4444'; // Red
      case 'pending': return '#f59e0b'; // Yellow
      default: return '#6b7280'; // Gray
    }
  };

  const getStatusIcon = (status: string, color: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={16} color={color} />;
      case 'rejected': return <XCircle size={16} color={color} />;
      case 'pending': return <Clock size={16} color={color} />;
      default: return <AlertCircle size={16} color={color} />;
    }
  };

  const renderRequestCard = ({ item }: { item: RequestItem }) => {
    const statusColor = getStatusColor(item.status);
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.typeContainer}>
            <Text style={styles.typeText}>{formatRequestType(item.type)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
            {getStatusIcon(item.status, statusColor)}
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Calendar size={16} color="#6b7280" />
            <Text style={styles.infoText}>
              Shift Date: <Text style={styles.infoValue}>{formatDate(item.attendance_date || item.created_at)}</Text>
            </Text>
          </View>
          
          <Text style={styles.reasonLabel}>Reason:</Text>
          <Text style={styles.reasonText}>{item.reason}</Text>

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
    fontSize: 16,
    fontWeight: '700',
    color: '#18181b',
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
