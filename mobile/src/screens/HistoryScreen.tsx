import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { Clock, Calendar, MapPin, X, FileText, CheckCircle, AlertCircle, Filter, RotateCcw } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../lib/axios';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatStatusLabel } from '../lib/utils';
import { useNetworkStore } from '../store/useNetworkStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { formatDisplayTime, formatDisplayDate, formatDuration, getMobileNow } from '../lib/timeManager';
import { saveOfflineRequest } from '../lib/db';
import { useThemeColors } from '../hooks/useTheme';

interface AttendanceLog {
  id: number;
  date: string;
  check_in: string;
  check_out: string | null;
  checkin_status: string;
  checkout_status: string | null;
  working_status: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  approved_overtime_minutes?: number;
  manager_note?: string;
  breaks?: any[];
  requests?: any[];
}

const determineOverallStatus = (checkinStatus: string, checkoutStatus: string | null): string => {
  const inStatus = checkinStatus;
  const outStatus = checkoutStatus || 'on_time';

  if (inStatus === 'unscheduled' || outStatus === 'unscheduled') {
    return 'unscheduled';
  }
  if (inStatus === 'on_time' && outStatus === 'on_time') {
    return 'on_time';
  }
  if (inStatus === 'late_in' && outStatus === 'early_out') {
    return 'incomplete';
  }
  if (inStatus === 'late_in') {
    return 'late_in';
  }
  if (outStatus === 'early_out') {
    return 'early_out';
  }
  return 'unknown';
};

const getDisplayStatus = (log: AttendanceLog): string => {
  if (log.check_out === null) {
    return log.working_status;
  }
  return determineOverallStatus(log.checkin_status, log.checkout_status);
};

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Working', value: 'working' },
  { label: 'Away', value: 'away' },
  { label: 'On Time', value: 'on_time' },
  { label: 'Late In', value: 'late_in' },
  { label: 'Early Out', value: 'early_out' },
  { label: 'Incomplete', value: 'incomplete' },
  { label: 'Unscheduled', value: 'unscheduled' },
];

export default function HistoryScreen() {
  const user = useAuthStore((state) => state.user);
  const userTimezone = useSettingsStore((state) => state.userTimezone);
  const { colors } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AttendanceLog | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState(new Date());
  const [newCheckOut, setNewCheckOut] = useState(new Date());
  const [reason, setReason] = useState('');

  // Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const getTodayStr = useCallback(() => {
    return formatDisplayDate(getMobileNow(), userTimezone, 'yyyy-MM-dd');
  }, [userTimezone]);

  const [filterStartDate, setFilterStartDate] = useState<string>(() => {
    return formatDisplayDate(getMobileNow(), userTimezone, 'yyyy-MM-dd');
  });
  const [filterEndDate, setFilterEndDate] = useState<string>(() => {
    return formatDisplayDate(getMobileNow(), userTimezone, 'yyyy-MM-dd');
  });
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const filteredLogs = logs.filter(log => {
    const displayStatus = getDisplayStatus(log);
    if (statusFilter !== 'all' && displayStatus !== statusFilter) return false;

    const logLocalDate = formatDisplayDate(log.check_in, userTimezone, 'yyyy-MM-dd');

    if (filterStartDate && logLocalDate < filterStartDate) return false;
    if (filterEndDate && logLocalDate > filterEndDate) return false;

    return true;
  });

  const [showCheckInPicker, setShowCheckInPicker] = useState(false);
  const [showCheckOutPicker, setShowCheckOutPicker] = useState(false);

  const { isConnected } = useNetworkStore();

  const fetchLogs = useCallback(async () => {
    if (!isConnected) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const response = await api.get('/attendance/my-logs');
      setLogs(response.data);
    } catch (error: any) {
      if (!error.isNetworkError) {
        console.error('Error fetching logs:', error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isConnected]);

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
    return formatDisplayTime(isoString, userTimezone, 'HH:mm');
  };

  const formatDate = (dateString: string) => {
    return formatDisplayDate(dateString, userTimezone, 'EEE, MMM d');
  };

  const formatRequestType = (type: string) => {
    if (!type) return '';
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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
              const payload = {
                attendance_id: selectedLog.id,
                new_clock_in: newCheckIn.toISOString(),
                new_clock_out: newCheckOut.toISOString(),
                reason
              };
              await api.post('/requests/attendance-correction', payload);
              Alert.alert('Success', 'Attendance correction request submitted.');
              setModalVisible(false);
              setReason('');
            } catch (error: any) {
              if (!error.response) {
                // Network error, save offline
                saveOfflineRequest('POST', '/requests/attendance-correction', {
                  attendance_id: selectedLog.id,
                  new_clock_in: newCheckIn.toISOString(),
                  new_clock_out: newCheckOut.toISOString(),
                  reason
                });
                Alert.alert('Offline Mode', 'Network error. Your request was saved locally and will be synced later.');
                setModalVisible(false);
                setReason('');
              } else {
                Alert.alert('Error', error.response?.data?.error || 'Failed to submit request');
              }
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
            <Calendar size={16} color={colors.subtext} />
            <Text style={styles.dateText}>{formatDisplayDate(item.check_in, userTimezone, 'EEE, MMM d')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
            {(() => {
              const displayStatus = getDisplayStatus(item);
              return (
                <View style={[styles.statusBadge, 
                  displayStatus === 'on_time' ? styles.onTimeBadge : 
                  displayStatus === 'late_in' ? styles.lateInBadge : 
                  displayStatus === 'early_out' ? styles.earlyOutBadge : 
                  displayStatus === 'incomplete' ? styles.incompleteBadge :
                  displayStatus === 'unscheduled' ? styles.unscheduledBadge :
                  displayStatus === 'working' ? styles.workingBadge :
                  displayStatus === 'away' ? styles.awayBadge :
                  styles.unknownBadge
                ]}>
                  <Text style={[styles.statusText, 
                    displayStatus === 'on_time' ? styles.onTimeText : 
                    displayStatus === 'late_in' ? styles.lateInText : 
                    displayStatus === 'early_out' ? styles.earlyOutText : 
                    displayStatus === 'incomplete' ? styles.incompleteText :
                    displayStatus === 'unscheduled' ? styles.unscheduledText :
                    displayStatus === 'working' ? styles.workingText :
                    displayStatus === 'away' ? styles.awayText :
                    styles.unknownText
                  ]}>
                    {formatStatusLabel(displayStatus)}
                  </Text>
                </View>
              );
            })()}
          </View>
        </View>

        <View style={styles.logBody}>
          <View style={styles.timeColumn}>
            <Text style={styles.label}>Check In</Text>
            <View style={styles.timeRow}>
              <Clock 
                size={14} 
                color={
                  item.checkin_status === 'on_time' ? colors.success :
                  item.checkin_status === 'late_in' ? colors.warning :
                  item.checkin_status === 'unscheduled' ? colors.accent :
                  colors.success
                } 
              />
              <Text style={[styles.timeValue, 
                item.checkin_status === 'on_time' ? { color: colors.success } : 
                item.checkin_status === 'late_in' ? { color: colors.warning } : 
                item.checkin_status === 'unscheduled' ? { color: colors.accent } : 
                styles.timeValue
              ]}>
                {formatTime(item.check_in)}
              </Text>
            </View>
          </View>

          <View style={styles.timeColumn}>
            <Text style={styles.label}>Check Out</Text>
            <View style={styles.timeRow}>
              <Clock 
                size={14} 
                color={
                  item.check_out ? (
                    item.checkout_status === 'on_time' ? colors.success :
                    item.checkout_status === 'early_out' ? colors.warning : 
                    item.checkout_status === 'unscheduled' ? colors.accent :
                    colors.warning
                  ) : colors.subtext
                } 
              />
              <Text style={[styles.timeValue, 
                item.check_out ? (
                  item.checkout_status === 'on_time' ? { color: colors.success } :
                  item.checkout_status === 'early_out' ? { color: colors.warning } :
                  item.checkout_status === 'unscheduled' ? { color: colors.accent } :
                  styles.timeValue
                ) : { color: colors.subtext }
              ]}>
                {formatTime(item.check_out)}
              </Text>
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={styles.title}>Attendance History</Text>
        <TouchableOpacity 
          style={[
            styles.filterToggleBtn,
            (statusFilter !== 'all' || filterStartDate !== getTodayStr() || filterEndDate !== getTodayStr()) && styles.filterToggleActive
          ]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Filter size={18} color={showFilters ? colors.accent : colors.subtext} />
          <Text style={[styles.filterToggleText, showFilters && { color: colors.accent }]}>Filters</Text>
          {(statusFilter !== 'all' || filterStartDate !== getTodayStr() || filterEndDate !== getTodayStr()) && (
            <View style={styles.activeFilterBadge} />
          )}
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.filterPanel}>
          <ScrollView nestedScrollEnabled={true}>
            {/* Status Filters */}
            <Text style={styles.filterSectionTitle}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>
              {STATUS_OPTIONS.map(opt => (
                <TouchableOpacity
                   key={opt.value}
                   style={[styles.chip, statusFilter === opt.value && styles.chipActive]}
                   onPress={() => setStatusFilter(opt.value)}
                >
                  <Text style={[styles.chipText, statusFilter === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Date Filters */}
            <Text style={styles.filterSectionTitle}>Date Range</Text>
            <View style={styles.dateFilterRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>From</Text>
                <TouchableOpacity 
                  style={styles.dateInputBtn} 
                  onPress={() => setShowStartDatePicker(true)}
                >
                  <Calendar size={14} color={colors.subtext} />
                  <Text style={styles.dateInputText}>{filterStartDate || 'Select Date'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>To</Text>
                <TouchableOpacity 
                  style={styles.dateInputBtn} 
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <Calendar size={14} color={colors.subtext} />
                  <Text style={styles.dateInputText}>{filterEndDate || 'Select Date'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reset Filters */}
            <View style={styles.filterActionsRow}>
              <TouchableOpacity 
                style={styles.resetFiltersBtn}
                onPress={() => {
                  setStatusFilter('all');
                  setFilterStartDate(getTodayStr());
                  setFilterEndDate(getTodayStr());
                }}
              >
                <RotateCcw size={14} color={colors.danger} />
                <Text style={styles.resetFiltersText}>Reset to Today</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.clearAllBtn}
                onPress={() => {
                  setStatusFilter('all');
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
              >
                <X size={14} color={colors.subtext} />
                <Text style={styles.clearAllText}>Clear All Dates</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}

      {showStartDatePicker && (
        <DateTimePicker
          value={filterStartDate ? new Date(filterStartDate + 'T12:00:00') : new Date(getMobileNow())}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowStartDatePicker(false);
            if (date) {
              setFilterStartDate(formatDisplayDate(date, userTimezone, 'yyyy-MM-dd'));
            }
          }}
        />
      )}
      {showEndDatePicker && (
        <DateTimePicker
          value={filterEndDate ? new Date(filterEndDate + 'T12:00:00') : new Date(getMobileNow())}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowEndDatePicker(false);
            if (date) {
              setFilterEndDate(formatDisplayDate(date, userTimezone, 'yyyy-MM-dd'));
            }
          }}
        />
      )}

      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {statusFilter !== 'all' || filterStartDate || filterEndDate
                ? 'No attendance records match the selected filters.'
                : 'No attendance records found.'}
            </Text>
            {(statusFilter !== 'all' || filterStartDate || filterEndDate) && (
              <TouchableOpacity
                style={styles.emptyResetBtn}
                onPress={() => {
                  setStatusFilter('all');
                  setFilterStartDate(getTodayStr());
                  setFilterEndDate(getTodayStr());
                }}
              >
                <Text style={styles.emptyResetBtnText}>Reset Filters to Today</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attendance Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {selectedLog?.breaks && selectedLog.breaks.length > 0 && (
              <View style={styles.breakSection}>
                <Text style={styles.sectionTitle}>Breaks Taken</Text>
                {selectedLog.breaks.map((b, index) => (
                  <View key={index} style={styles.breakRow}>
                    <Clock size={14} color={colors.subtext} />
                    <Text style={styles.breakText}>
                      {formatTime(b.start_time)} - {b.end_time ? formatTime(b.end_time) : 'Ongoing'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {selectedLog?.requests && selectedLog.requests.length > 0 && (
              <View style={styles.requestSection}>
                <Text style={styles.sectionTitle}>Associated Requests</Text>
                {selectedLog.requests.map((r, index) => {
                  const statusColor = r.status === 'approved' ? colors.success : r.status === 'rejected' ? colors.danger : colors.warning;
                  const statusBg = r.status === 'approved' ? colors.successBg : r.status === 'rejected' ? colors.dangerBg : colors.warningBg;
                  return (
                    <View key={r.id || index} style={styles.requestCard}>
                      <View style={styles.requestHeader}>
                        <Text style={styles.requestType}>{formatRequestType(r.type)}</Text>
                        <View style={[styles.statusBadgeInline, { backgroundColor: statusBg }]}>
                          <Text style={[styles.statusTextInline, { color: statusColor }]}>
                            {r.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.requestReason}>
                        <Text style={{ fontWeight: '600', color: colors.text }}>Reason:</Text> {r.reason}
                      </Text>
                      {r.type === 'attendance_correction' && (
                        <Text style={styles.requestDetailsText}>
                          Proposed: {formatTime(r.requested_check_in)} - {formatTime(r.requested_check_out)}
                        </Text>
                      )}
                      {r.type === 'permission_to_leave' && r.shift_interruption_id && (() => {
                        const brk = selectedLog.breaks?.find((b: any) => b.id === r.shift_interruption_id);
                        if (brk) {
                          return (
                            <Text style={styles.requestDetailsText}>
                              Away: {formatTime(brk.start_time)} - {brk.end_time ? formatTime(brk.end_time) : 'Ongoing'}
                            </Text>
                          );
                        }
                        return null;
                      })()}
                      {r.value > 0 && r.type !== 'attendance_correction' && (
                        <Text style={styles.requestDetailsText}>
                          Value: {r.type === 'overtime_approval' ? formatDuration(r.value) : `${r.value} mins`}
                        </Text>
                      )}
                      {r.manager_note ? (
                        <View style={styles.managerNoteInline}>
                          <Text style={styles.managerNoteInlineText}>
                            Manager Note: {r.manager_note}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Request Edit</Text>
            
            {selectedLog?.requests?.some(r => r.type === 'attendance_correction' && r.status === 'pending') ? (
              <View style={styles.pendingBadgeLarge}>
                <AlertCircle size={20} color={colors.warning} />
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
                <TextInput 
                  style={styles.input} 
                  value={reason} 
                  onChangeText={setReason} 
                  multiline 
                  placeholder="Enter reason for edit" 
                  placeholderTextColor={colors.subtext}
                />
                
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

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginBottom: 0 },
  listContent: { paddingBottom: 100 },
  logCard: { 
    backgroundColor: colors.surface, 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 16, fontWeight: '600', color: colors.text },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  onTimeBadge: { backgroundColor: colors.successBg },
  lateInBadge: { backgroundColor: colors.warningBg },
  earlyOutBadge: { backgroundColor: colors.warningBg },
  halfDayBadge: { backgroundColor: colors.accentBg },
  unscheduledBadge: { backgroundColor: colors.accentBg },
  absentBadge: { backgroundColor: colors.dangerBg },
  incompleteBadge: { backgroundColor: colors.dangerBg },
  incompleteText: { color: colors.danger },
  workingBadge: { backgroundColor: colors.successBg },
  workingText: { color: colors.success },
  awayBadge: { backgroundColor: colors.warningBg },
  awayText: { color: colors.warning },
  unknownBadge: { backgroundColor: colors.card },
  unknownText: { color: colors.subtext },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  onTimeText: { color: colors.success },
  lateInText: { color: colors.warning },
  earlyOutText: { color: colors.warning },
  halfDayText: { color: colors.accent },
  unscheduledText: { color: colors.accent },
  absentText: { color: colors.danger },
  logBody: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeColumn: { flex: 1 },
  label: { fontSize: 12, color: colors.subtext, marginBottom: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { fontSize: 12, color: colors.subtext },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: colors.subtext, fontSize: 16 },
  modalContainer: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 20 },
  modalContent: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  timeButton: { backgroundColor: colors.card, padding: 12, borderRadius: 8, marginBottom: 15, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  timeButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, marginTop: 5, marginBottom: 15, height: 80, backgroundColor: colors.card, color: colors.text },
  submitButton: { backgroundColor: colors.primary, padding: 15, borderRadius: 8, alignItems: 'center' },
  submitButtonText: { color: colors.primaryForeground, fontWeight: 'bold' },
  extraInfoContainer: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 },
  overtimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  overtimeText: { fontSize: 12, color: colors.subtext },
  overtimeValue: { fontWeight: '600', color: colors.accent },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  noteText: { fontSize: 12, color: colors.subtext, flex: 1 },
  noteValue: { fontStyle: 'italic', color: colors.text },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pendingText: { fontSize: 12, color: colors.warning, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 12 },
  breakSection: { marginBottom: 16 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  breakText: { fontSize: 14, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  pendingBadgeLarge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.warningBg, padding: 16, borderRadius: 8, justifyContent: 'center', borderWidth: 1, borderColor: colors.warningBorder },
  pendingBadgeLargeText: { color: colors.warning, fontWeight: 'bold', fontSize: 14 },
  requestSection: { marginBottom: 16 },
  requestCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  requestType: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadgeInline: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTextInline: {
    fontSize: 9,
    fontWeight: '700',
  },
  requestReason: {
    fontSize: 12,
    color: colors.subtext,
    marginBottom: 4,
  },
  requestDetailsText: {
    fontSize: 12,
    color: colors.subtext,
    fontWeight: '500',
    marginBottom: 4,
  },
  managerNoteInline: {
    marginTop: 6,
    backgroundColor: colors.surface,
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  managerNoteInlineText: {
    fontSize: 11,
    color: colors.subtext,
    fontStyle: 'italic',
  },
  filterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    gap: 6,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterToggleActive: {
    backgroundColor: colors.border,
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  activeFilterBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  filterPanel: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.subtext,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  chipsContainer: {
    paddingVertical: 4,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: colors.subtext,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  dateFilterRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  dateLabel: {
    fontSize: 11,
    color: colors.subtext,
    marginBottom: 4,
  },
  dateInputBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  dateInputText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  filterActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resetFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  resetFiltersText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '600',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  clearAllText: {
    fontSize: 13,
    color: colors.subtext,
    fontWeight: '600',
  },
  emptyResetBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'center',
  },
  emptyResetBtnText: {
    color: colors.primaryForeground,
    fontWeight: '600',
    fontSize: 14,
  },
});
