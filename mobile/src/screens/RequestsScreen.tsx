import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, Calendar, CheckCircle, XCircle, AlertCircle, MessageSquare, X, ArrowRight, CornerDownRight, Filter, RotateCcw, Plus } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { toDate, formatInTimeZone } from 'date-fns-tz';
import api from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { saveOfflineRequest } from '../lib/db';
import { useSettingsStore } from '../store/useSettingsStore';
import { formatDisplayDate, formatDisplayTime, formatDuration, getMobileNow, is12HourSystem, resolveTimezone } from '../lib/timeManager';
import { useThemeColors } from '../hooks/useTheme';

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

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

const TYPE_OPTIONS = [
  { label: 'All Types', value: 'all' },
  { label: 'Manual Clock', value: 'manual_clock' },
  { label: 'Overtime', value: 'overtime_approval' },
  { label: 'Early Leave', value: 'early_leave_approval' },
  { label: 'Late In', value: 'late_in_approval' },
  { label: 'Permission', value: 'permission_to_leave' },
  { label: 'Correction', value: 'attendance_correction' },
  { label: 'Interruption', value: 'shift_interruption_review' },
];

const getRequestAnchorTimestamp = (item: RequestItem) => {
  return item.original_check_in || item.requested_check_in || item.shift_start_time || item.interruption_start_time || item.created_at;
};

export default function RequestsScreen() {
  const { user } = useAuthStore();
  const userTimezone = useSettingsStore((state) => state.userTimezone);
  const { colors, isDark } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

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

  const filteredRequests = requests.filter(req => {
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;
    if (typeFilter !== 'all' && req.type !== typeFilter) return false;

    const anchorTime = getRequestAnchorTimestamp(req);
    const reqLocalDate = formatDisplayDate(anchorTime, userTimezone, 'yyyy-MM-dd');

    if (filterStartDate && reqLocalDate < filterStartDate) return false;
    if (filterEndDate && reqLocalDate > filterEndDate) return false;

    return true;
  });
  
  // Manager Action State
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [managerNote, setManagerNote] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'approved' | 'rejected' | null>(null);
  const [isPaidPermission, setIsPaidPermission] = useState(false);
  const [paidPermissionMinutes, setPaidPermissionMinutes] = useState('0');
  const [maxPaidMinutes, setMaxPaidMinutes] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // New Request Form State
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newRequestDate, setNewRequestDate] = useState<Date>(new Date());
  const [newRequestCheckIn, setNewRequestCheckIn] = useState<Date>(new Date());
  const [newRequestCheckOut, setNewRequestCheckOut] = useState<Date>(new Date());
  const [newRequestReason, setNewRequestReason] = useState('');
  const [showNewDatePicker, setShowNewDatePicker] = useState(false);
  const [showNewCheckInPicker, setShowNewCheckInPicker] = useState(false);
  const [showNewCheckOutPicker, setShowNewCheckOutPicker] = useState(false);
  const [submittingNewRequest, setSubmittingNewRequest] = useState(false);

  const openNewRequestModal = () => {
    let initialZonedDate = new Date();
    try {
      const tz = resolveTimezone(userTimezone);
      const zonedNowStr = formatInTimeZone(new Date(getMobileNow()), tz, 'yyyy-MM-ddTHH:mm:ss');
      const parts = zonedNowStr.split(/[T:-]/).map(Number);
      if (parts.length >= 5) {
        const parsedDate = new Date(
          parts[0],
          parts[1] - 1, // month index
          parts[2],
          parts[3],
          parts[4],
          parts[5] || 0
        );
        if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() >= 2020) {
          initialZonedDate = parsedDate;
        }
      }
    } catch (e) {
      console.error('Error initializing openNewRequestModal date:', e);
    }

    setNewRequestDate(initialZonedDate);
    setNewRequestCheckIn(initialZonedDate);
    const initialZonedCheckOut = new Date(initialZonedDate.getTime() + 60 * 60 * 1000);
    setNewRequestCheckOut(initialZonedCheckOut);

    setNewRequestReason('');
    setCreateModalVisible(true);
  };

  const formatPickerTime = (date: Date) => {
    if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) {
      date = new Date();
    }
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    if (is12HourSystem()) {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    } else {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  };

  const formatPickerDate = (date: Date) => {
    if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) {
      date = new Date();
    }
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

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

  const submitNewRequest = async () => {
    if (!newRequestReason.trim()) {
      Alert.alert('Required Field', 'A reason is required to submit a manual clock request.');
      return;
    }

    setSubmittingNewRequest(true);
    
    const year = newRequestDate.getFullYear();
    const month = (newRequestDate.getMonth() + 1).toString().padStart(2, '0');
    const day = newRequestDate.getDate().toString().padStart(2, '0');

    const checkInHours = newRequestCheckIn.getHours().toString().padStart(2, '0');
    const checkInMinutes = newRequestCheckIn.getMinutes().toString().padStart(2, '0');

    const checkOutHours = newRequestCheckOut.getHours().toString().padStart(2, '0');
    const checkOutMinutes = newRequestCheckOut.getMinutes().toString().padStart(2, '0');

    const checkInLocalStr = `${year}-${month}-${day}T${checkInHours}:${checkInMinutes}:00`;
    const checkOutLocalStr = `${year}-${month}-${day}T${checkOutHours}:${checkOutMinutes}:00`;

    const checkInDate = toDate(checkInLocalStr, { timeZone: userTimezone });
    let checkOutDate = toDate(checkOutLocalStr, { timeZone: userTimezone });

    if (checkOutDate <= checkInDate) {
      checkOutDate = new Date(checkOutDate.getTime() + 24 * 60 * 60 * 1000);
    }

    const payload = {
      type: 'manual_clock',
      requested_check_in: checkInDate.toISOString(),
      requested_check_out: checkOutDate.toISOString(),
      reason: newRequestReason,
    };

    try {
      if (!isConnected) {
        await saveOfflineRequest('POST', '/requests', payload);
        Alert.alert('Offline Mode', 'Network error. Your request was saved locally and will be synced later.');
        setCreateModalVisible(false);
        setNewRequestReason('');
        return;
      }

      await api.post('/requests', payload);
      Alert.alert('Success', 'Manual clock request(s) submitted successfully.');
      setCreateModalVisible(false);
      setNewRequestReason('');
      fetchRequests();
    } catch (error: any) {
      if (!error.response) {
        await saveOfflineRequest('POST', '/requests', payload);
        Alert.alert('Offline Mode', 'Network error. Your request was saved locally and will be synced later.');
        setCreateModalVisible(false);
        setNewRequestReason('');
      } else {
        Alert.alert('Error', error.response?.data?.error || 'Failed to submit manual clock request.');
      }
    } finally {
      setSubmittingNewRequest(false);
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
    return formatDisplayDate(dateString, userTimezone, 'EEE, MMM d');
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '';
    return formatDisplayTime(timeString, userTimezone, 'HH:mm');
  };

  const getStatusColors = (status: string) => {
    switch (status) {
      case 'approved':
        return { text: colors.success, bg: colors.successBg, border: colors.successBorder };
      case 'rejected':
        return { text: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder };
      case 'pending':
        return { text: colors.warning, bg: colors.warningBg, border: colors.warningBorder };
      default:
        return { text: colors.subtext, bg: colors.card, border: colors.border };
    }
  };

  const getRequestTypeColors = (type: string) => {
    if (isDark) {
      switch (type) {
        case 'permission_to_leave':
          return { text: '#2dd4bf', bg: '#115e59', border: '#134e4a' }; // Teal
        case 'overtime_approval':
          return { text: '#c084fc', bg: '#3b0764', border: '#581c87' };
        case 'early_leave_approval':
          return { text: '#f97316', bg: '#431407', border: '#7c2d12' };
        case 'shift_interruption_review':
          return { text: '#22d3ee', bg: '#083344', border: '#155e75' }; // Cyan
        case 'late_in_approval':
          return { text: '#f43f5e', bg: '#4c0519', border: '#881337' };
        case 'attendance_correction':
          return { text: '#60a5fa', bg: '#1e3a8a', border: '#1e40af' }; // Blue
        default:
          return { text: colors.text, bg: colors.card, border: colors.border };
      }
    } else {
      switch (type) {
        case 'permission_to_leave':
          return { text: '#0f766e', bg: '#ccfbf1', border: '#99f6e4' }; // Teal
        case 'overtime_approval':
          return { text: '#7e22ce', bg: '#f3e8ff', border: '#e9d5ff' };
        case 'early_leave_approval':
          return { text: '#c2410c', bg: '#ffedd5', border: '#fed7aa' };
        case 'shift_interruption_review':
          return { text: '#0891b2', bg: '#ecfeff', border: '#cffafe' }; // Cyan
        case 'late_in_approval':
          return { text: '#be123c', bg: '#ffe4e6', border: '#fecdd3' };
        case 'attendance_correction':
          return { text: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' }; // Blue
        default: // manual_clock
          return { text: '#374151', bg: '#f3f4f6', border: '#e5e7eb' };
      }
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
        const propIn = item.requested_check_in || item.original_check_in;
        const propOut = item.requested_check_out || item.original_check_out;
        const origDuration = getDurationMins(item.original_check_in, item.original_check_out);
        const propDuration = getDurationMins(propIn, propOut);
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
                  <Text style={styles.correctionTimeText}>{formatTime(propIn)}</Text>
                </View>
                <View style={styles.correctionRow}>
                  <Text style={styles.correctionLabel}>Out:</Text>
                  <Text style={styles.correctionTimeText}>{formatTime(propOut)}</Text>
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
          backgroundColor: isApproved ? colors.successBg : colors.dangerBg,
          borderColor: isApproved ? colors.successBorder : colors.dangerBorder,
          borderWidth: 1
        }
      ]}>
        <View style={styles.outcomeHeader}>
          {isApproved ? (
            <CheckCircle size={14} color={colors.success} />
          ) : (
            <XCircle size={14} color={colors.danger} />
          )}
          <Text style={[styles.outcomeTitle, { color: isApproved ? colors.success : colors.danger }]}>
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
              <Text style={[styles.outcomeText, { color: colors.danger, marginTop: 4, fontWeight: '600' }]}>
                Disciplinary penalty applied: {formatDuration(item.penalty_minutes)}
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
            <Calendar size={16} color={colors.subtext} />
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
                <MessageSquare size={14} color={colors.accent} />
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
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.headerTitle}>My Requests</Text>
          <TouchableOpacity 
            style={[
              styles.filterToggleBtn,
              (statusFilter !== 'all' || typeFilter !== 'all' || filterStartDate !== getTodayStr() || filterEndDate !== getTodayStr()) && styles.filterToggleActive
            ]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} color={showFilters ? colors.accent : colors.subtext} />
            <Text style={[styles.filterToggleText, showFilters && { color: colors.accent }]}>Filters</Text>
            {(statusFilter !== 'all' || typeFilter !== 'all' || filterStartDate !== getTodayStr() || filterEndDate !== getTodayStr()) && (
              <View style={styles.activeFilterBadge} />
            )}
          </TouchableOpacity>
        </View>
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
                  onPress={() => setStatusFilter(opt.value as any)}
                >
                  <Text style={[styles.chipText, statusFilter === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Type Filters */}
            <Text style={styles.filterSectionTitle}>Request Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>
              {TYPE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, typeFilter === opt.value && styles.chipActive]}
                  onPress={() => setTypeFilter(opt.value)}
                >
                  <Text style={[styles.chipText, typeFilter === opt.value && styles.chipTextActive]}>
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
                  setTypeFilter('all');
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
                  setTypeFilter('all');
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
        data={filteredRequests}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderRequestCard}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AlertCircle size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No requests found</Text>
            <Text style={styles.emptySubtext}>
              {statusFilter !== 'all' || typeFilter !== 'all' || filterStartDate || filterEndDate
                ? 'Try adjusting your filters.'
                : 'Your request history will appear here.'}
            </Text>
            {(statusFilter !== 'all' || typeFilter !== 'all' || filterStartDate || filterEndDate) && (
              <TouchableOpacity
                style={styles.emptyResetBtn}
                onPress={() => {
                  setStatusFilter('all');
                  setTypeFilter('all');
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {actionType === 'approved' ? 'Approve' : 'Reject'} Request
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.requestSummary}>
                <Text style={styles.summaryLabel}>Type:</Text>
                <Text style={styles.summaryValue}>{selectedRequest ? formatRequestType(selectedRequest.type) : ''}</Text>
                
                <Text style={styles.summaryLabel}>Reason:</Text>
                <Text style={styles.summaryValue}>{selectedRequest?.reason}</Text>

                {selectedRequest && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
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

      {/* New Request Modal */}
      <Modal visible={createModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Manual Clock Request</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Shift Date</Text>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowNewDatePicker(true)}
                >
                  <Text style={styles.pickerButtonText}>
                    {formatPickerDate(newRequestDate)}
                  </Text>
                  <Calendar size={18} color={colors.subtext} />
                </TouchableOpacity>
              </View>

              <View style={styles.dateFilterRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Check-In Time</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowNewCheckInPicker(true)}
                  >
                    <Text style={styles.pickerButtonText}>
                      {formatPickerTime(newRequestCheckIn)}
                    </Text>
                    <Clock size={18} color={colors.subtext} />
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Check-Out Time</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowNewCheckOutPicker(true)}
                  >
                    <Text style={styles.pickerButtonText}>
                      {formatPickerTime(newRequestCheckOut)}
                    </Text>
                    <Clock size={18} color={colors.subtext} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.inputContainer, { marginTop: 16 }]}>
                <Text style={styles.inputLabel}>Reason <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <TextInput
                  style={styles.textInput}
                  multiline
                  numberOfLines={4}
                  value={newRequestReason}
                  onChangeText={setNewRequestReason}
                  placeholder="Explain why you are requesting manual clock-in/out..."
                  placeholderTextColor="#a1a1aa"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.primary }]}
                onPress={submitNewRequest}
                disabled={submittingNewRequest}
              >
                {submittingNewRequest ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Date & Time Pickers for New Request */}
      {showNewDatePicker && (
        <DateTimePicker
          value={newRequestDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowNewDatePicker(false);
            if (date) {
              setNewRequestDate(date);
            }
          }}
        />
      )}
      {showNewCheckInPicker && (
        <DateTimePicker
          value={newRequestCheckIn}
          mode="time"
          display="default"
          is24Hour={!is12HourSystem()}
          onChange={(event, date) => {
            setShowNewCheckInPicker(false);
            if (date) {
              setNewRequestCheckIn(date);
            }
          }}
        />
      )}
      {showNewCheckOutPicker && (
        <DateTimePicker
          value={newRequestCheckOut}
          mode="time"
          display="default"
          is24Hour={!is12HourSystem()}
          onChange={(event, date) => {
            setShowNewCheckOutPicker(false);
            if (date) {
              setNewRequestCheckOut(date);
            }
          }}
        />
      )}

      {/* FAB Button for Employees */}
      {!isManager && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openNewRequestModal}
          activeOpacity={0.8}
        >
          <Plus size={24} color={colors.primaryForeground} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: colors.shadow,
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
    borderBottomColor: colors.border,
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
    color: colors.subtext,
  },
  infoValue: {
    fontWeight: '600',
    color: colors.text,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.subtext,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  managerNoteContainer: {
    marginTop: 16,
    backgroundColor: colors.accentBg,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
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
    color: colors.accent,
    textTransform: 'uppercase',
  },
  managerNoteText: {
    fontSize: 14,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  cardFooter: {
    backgroundColor: colors.card,
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: 12,
    color: colors.subtext,
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
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  rejectButton: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  approveButtonText: {
    color: colors.success,
    fontWeight: '700',
    fontSize: 14,
  },
  rejectButtonText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
  },
  requestSummary: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.subtext,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    marginBottom: 12,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
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
    backgroundColor: colors.success,
  },
  submitReject: {
    backgroundColor: colors.danger,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  paidPermissionContainer: {
    backgroundColor: colors.accentBg,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  checkboxSubtext: {
    fontSize: 11,
    color: colors.accent,
  },
  paidInputContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  paidInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  paidInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: colors.text,
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
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  detailsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.subtext,
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
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.subtext,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  detailValueHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
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
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  proposedBox: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
  },
  correctionBoxTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.subtext,
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
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 6,
  },
  correctionLabel: {
    fontSize: 11,
    color: colors.subtext,
  },
  correctionTimeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text,
  },
  correctionDurationText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
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
    color: colors.text,
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
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 8,
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
  },
  emptyResetBtnText: {
    color: colors.primaryForeground,
    fontWeight: '600',
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  formGroup: {
    marginBottom: 16,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.card,
  },
  pickerButtonText: {
    fontSize: 16,
    color: colors.text,
  },
});
