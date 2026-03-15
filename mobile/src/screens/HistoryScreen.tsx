import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { Clock, Calendar, MapPin, X, FileText, CheckCircle, AlertCircle } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../lib/axios';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatStatusLabel } from '../lib/utils';

interface AttendanceLog {
  id: number;
  date: string;
  check_in: string;
  check_out: string | null;
  status: string;
  location_lat: number;
  location_lng: number;
  approved_overtime_minutes?: number;
  manager_note?: string;
  breaks?: any[];
  requests?: any[];
}

export default function HistoryScreen() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AttendanceLog | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState(new Date());
  const [newCheckOut, setNewCheckOut] = useState(new Date());
  const [reason, setReason] = useState('');

  const [showCheckInPicker, setShowCheckInPicker] = useState(false);
  const [showCheckOutPicker, setShowCheckOutPicker] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await api.get('/attendance/my-logs');
      setLogs(response.data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const handleCheckInChange = (event: any, date?: Date) => {
    setShowCheckInPicker(false);
    if (event.type === 'dismissed') return;
    if (date) setNewCheckIn(date);
  };

  const handleCheckOutChange = (event: any, date?: Date) => {
    setShowCheckOutPicker(false);
    if (event.type === 'dismissed') return;
    if (date) setNewCheckOut(date);
  };

  const handleRequestEdit = async () => {
    if (!selectedLog || !reason) {
      Alert.alert('Error', 'Please provide a reason for the edit.');
      return;
    }

    Alert.alert(
      'Confirm Correction',
      'Are you sure you want to submit this attendance correction? You can only submit one correction request per shift.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Submit',
          onPress: async () => {
            try {
              await api.post('/requests/attendance-correction', {
                attendance_id: selectedLog.id,
                new_clock_in: newCheckIn.toISOString(),
                new_clock_out: newCheckOut.toISOString(),
                reason
              });
              Alert.alert('Success', 'Attendance correction request submitted.');
              setModalVisible(false);
              setReason('');
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.error || 'Failed to submit request');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: AttendanceLog }) => {
    const hasPendingCorrection = item.requests?.some(r => r.type === 'attendance_correction' && r.status === 'pending');

    return (
      <TouchableOpacity style={styles.logCard} onPress={() => {
        setSelectedLog(item);
        setNewCheckIn(item.check_in ? new Date(item.check_in) : new Date());
        setNewCheckOut(item.check_out ? new Date(item.check_out) : new Date());
        setModalVisible(true);
      }}>
        <View style={styles.logHeader}>
          <View style={styles.dateContainer}>
            <Calendar size={16} color="#71717a" />
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          </View>
          <View style={[styles.statusBadge, 
            item.status === 'on_time' ? styles.onTimeBadge : 
            item.status === 'late_in' ? styles.lateInBadge : 
            item.status === 'early_out' ? styles.earlyOutBadge : 
            item.status === 'half_day' ? styles.halfDayBadge : 
            item.status === 'unscheduled' ? styles.unscheduledBadge :
            styles.absentBadge
          ]}>
            <Text style={[styles.statusText, 
              item.status === 'on_time' ? styles.onTimeText : 
              item.status === 'late_in' ? styles.lateInText : 
              item.status === 'early_out' ? styles.earlyOutText : 
              item.status === 'half_day' ? styles.halfDayText : 
              item.status === 'unscheduled' ? styles.unscheduledText :
              styles.absentText
            ]}>
              {formatStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={styles.logBody}>
          <View style={styles.timeColumn}>
            <Text style={styles.label}>Check In</Text>
            <View style={styles.timeRow}>
              <Clock size={14} color="#10b981" />
              <Text style={styles.timeValue}>{formatTime(item.check_in)}</Text>
            </View>
          </View>

          <View style={styles.timeColumn}>
            <Text style={styles.label}>Check Out</Text>
            <View style={styles.timeRow}>
              <Clock size={14} color="#f59e0b" />
              <Text style={styles.timeValue}>{formatTime(item.check_out)}</Text>
            </View>
          </View>
        </View>

        {/* Overtime and Notes Section */}
        {(item.approved_overtime_minutes > 0 || item.manager_note || hasPendingCorrection) && (
          <View style={styles.extraInfoContainer}>
            {hasPendingCorrection && (
              <View style={styles.pendingRow}>
                <AlertCircle size={14} color="#f59e0b" />
                <Text style={styles.pendingText}>Pending Managerial Approval</Text>
              </View>
            )}
            {item.approved_overtime_minutes > 0 && (
              <View style={styles.overtimeRow}>
                <CheckCircle size={14} color="#8b5cf6" />
                <Text style={styles.overtimeText}>
                  Approved Overtime: <Text style={styles.overtimeValue}>{item.approved_overtime_minutes} mins</Text>
                </Text>
              </View>
            )}
            {item.manager_note && (
              <View style={styles.noteRow}>
                <FileText size={14} color="#71717a" />
                <Text style={styles.noteText}>
                  Manager Note: <Text style={styles.noteValue}>{item.manager_note}</Text>
                </Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#18181b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#18181b" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No attendance records found.</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attendance Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#18181b" />
              </TouchableOpacity>
            </View>

            {selectedLog?.breaks && selectedLog.breaks.length > 0 && (
              <View style={styles.breakSection}>
                <Text style={styles.sectionTitle}>Breaks Taken</Text>
                {selectedLog.breaks.map((b, index) => (
                  <View key={index} style={styles.breakRow}>
                    <Clock size={14} color="#71717a" />
                    <Text style={styles.breakText}>
                      {formatTime(b.start_time)} - {b.end_time ? formatTime(b.end_time) : 'Ongoing'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Request Edit</Text>
            
            {selectedLog?.requests?.some(r => r.type === 'attendance_correction' && r.status === 'pending') ? (
              <View style={styles.pendingBadgeLarge}>
                <AlertCircle size={20} color="#f59e0b" />
                <Text style={styles.pendingBadgeLargeText}>Pending Managerial Approval</Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Proposed Check In</Text>
                <TouchableOpacity onPress={() => setShowCheckInPicker(true)} style={styles.timeButton}>
                  <Text style={styles.timeButtonText}>{formatTime(newCheckIn.toISOString())}</Text>
                </TouchableOpacity>
                {showCheckInPicker && (
                  <DateTimePicker value={newCheckIn} mode="time" onChange={handleCheckInChange} />
                )}
                
                <Text style={styles.label}>Proposed Check Out</Text>
                <TouchableOpacity onPress={() => setShowCheckOutPicker(true)} style={styles.timeButton}>
                  <Text style={styles.timeButtonText}>{formatTime(newCheckOut.toISOString())}</Text>
                </TouchableOpacity>
                {showCheckOutPicker && (
                  <DateTimePicker value={newCheckOut} mode="time" onChange={handleCheckOutChange} />
                )}
                
                <Text style={styles.label}>Reason</Text>
                <TextInput style={styles.input} value={reason} onChangeText={setReason} multiline placeholder="Enter reason for edit" />
                
                <TouchableOpacity style={styles.submitButton} onPress={handleRequestEdit}>
                  <Text style={styles.submitButtonText}>Submit Request</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5', paddingHorizontal: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#18181b', marginBottom: 20 },
  listContent: { paddingBottom: 100 },
  logCard: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 16, fontWeight: '600', color: '#18181b' },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  onTimeBadge: { backgroundColor: '#dcfce7' },
  lateInBadge: { backgroundColor: '#fef08a' },
  earlyOutBadge: { backgroundColor: '#ffedd5' },
  halfDayBadge: { backgroundColor: '#f3e8ff' },
  unscheduledBadge: { backgroundColor: '#dbeafe' },
  absentBadge: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  onTimeText: { color: '#166534' },
  lateInText: { color: '#854d0e' },
  earlyOutText: { color: '#c2410c' },
  halfDayText: { color: '#7e22ce' },
  unscheduledText: { color: '#1e40af' },
  absentText: { color: '#991b1b' },
  logBody: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f4f4f5' },
  timeColumn: { flex: 1 },
  label: { fontSize: 12, color: '#71717a', marginBottom: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeValue: { fontSize: 15, fontWeight: '600', color: '#18181b' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { fontSize: 12, color: '#a1a1aa' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: '#71717a', fontSize: 16 },
  modalContainer: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  timeButton: { backgroundColor: '#f4f4f5', padding: 12, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  timeButtonText: { fontSize: 16, fontWeight: '600', color: '#18181b' },
  input: { borderWidth: 1, borderColor: '#e4e4e7', borderRadius: 8, padding: 10, marginTop: 5, marginBottom: 15, height: 80 },
  submitButton: { backgroundColor: '#18181b', padding: 15, borderRadius: 8, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontWeight: 'bold' },
  extraInfoContainer: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f4f4f5', gap: 6 },
  overtimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  overtimeText: { fontSize: 12, color: '#71717a' },
  overtimeValue: { fontWeight: '600', color: '#8b5cf6' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  noteText: { fontSize: 12, color: '#71717a', flex: 1 },
  noteValue: { fontStyle: 'italic', color: '#3f3f46' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pendingText: { fontSize: 12, color: '#f59e0b', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#18181b', marginBottom: 12 },
  breakSection: { marginBottom: 16 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f4f4f5' },
  breakText: { fontSize: 14, color: '#3f3f46' },
  divider: { height: 1, backgroundColor: '#e4e4e7', marginVertical: 16 },
  pendingBadgeLarge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', padding: 16, borderRadius: 8, justifyContent: 'center' },
  pendingBadgeLargeText: { color: '#d97706', fontWeight: 'bold', fontSize: 14 },
});
