import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { Pause, Play, LayoutDashboard, LogOut, RefreshCw, Calendar, DollarSign, Clock, Shield, Briefcase, Info } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';
import api from '../lib/axios';
import { initLocalDb, saveOfflineLog, getUnsyncedLogs, markLogsAsSynced, getUnsyncedRequests, saveOfflineRequest } from '../lib/db';
import { useNetworkStore } from '../store/useNetworkStore';
import { getUniqueDeviceId } from '../utils/device';
import { useAttendanceStore } from '../store/useAttendanceStore';
import SmartAttendanceCard from '../components/SmartAttendanceCard';
import LiveServerClock from '../components/LiveServerClock';
import NetInfo from '@react-native-community/netinfo';
import { useSettingsStore } from '../store/useSettingsStore';
import * as Linking from 'expo-linking';


export default function DashboardScreen() {
  const { user, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const { isSyncing, syncOfflineRecords, isConnected } = useNetworkStore();

  const {
    currentStatus,
    setStatus,
    userProfile,
    setUserProfile,
    consumedBreakMinutes,
    setConsumedBreakMinutes,
    setLastActionTimestamp,
    activeSession,
    setActiveSession
  } = useAttendanceStore();

  useEffect(() => {
    // Initialize local SQLite database
    initLocalDb();

    // سطر المزامنة الفورية الذي يقرأ الوقت والمنطقة الزمنية من السيرفر
    useNetworkStore.getState().syncServerTime();

  }, []);

  const fetchProfile = useCallback(async () => {
    if (!isConnected) return;
    try {
      const response = await api.get('/users/profile');
      setUserProfile(response.data);
    } catch (error: any) {
      if (!error.isNetworkError) {
        console.error('Error fetching profile:', error);
      }
    }
  }, [isConnected, setUserProfile]);

  const fetchStatus = useCallback(async () => {
    if (!isConnected) return;
    try {
      const response = await api.get('/attendance/my-logs');
      const logs = response.data;
      // Check if there is an active session (check_out is null)
      const session = logs.find((l: any) => !l.check_out);
      setActiveSession(session || null);
      if (session) {
        setStatus(session.current_status || 'working');

        let consumed = 0;
        if (session.breaks && Array.isArray(session.breaks)) {
          session.breaks.forEach((b: any) => {
            const start = new Date(b.start_time).getTime();
            const end = b.end_time ? new Date(b.end_time).getTime() : new Date().getTime();
            consumed += (end - start) / (1000 * 60);
          });
        }
        setConsumedBreakMinutes(Math.floor(consumed));
      } else {
        setStatus('none');
        setConsumedBreakMinutes(0);
      }
    } catch (error: any) {
      if (!error.isNetworkError) {
        console.error('Error fetching status:', error);
      }
    }
  }, [isConnected, setActiveSession, setStatus, setConsumedBreakMinutes]);

  const checkUnsyncedLogs = useCallback(() => {
    const logs = getUnsyncedLogs();
    const requests = getUnsyncedRequests();
    setUnsyncedCount(logs.length + requests.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkUnsyncedLogs();
      fetchStatus();
      fetchProfile();
      useNetworkStore.getState().syncServerTime();
    }, [checkUnsyncedLogs, fetchStatus, fetchProfile])
  );

const executeClock = async (type: 'check_in' | 'check_out') => {
    setLoading(true);
    try {
      // ==========================================
      // 1. Fetch live settings to bypass empty cache
      // ==========================================
      let latestSettings = useSettingsStore.getState().settings;
      if (isConnected) {
        try {
          const settingsResponse = await api.get('/settings');
          latestSettings = settingsResponse.data;
          // Update cache in the background
          useSettingsStore.getState().fetchSettings();
        } catch (e) {
          console.warn('[Clock] Failed to fetch live settings, using cache.');
        }
      }

      // ==========================================
      // 2. Strict Wi-Fi Check (Only for Check-In)
      // ==========================================
      if (type === 'check_in' && latestSettings?.wifi_validation_toggle) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission Denied', 
            'Location permission is strictly required to verify attendance network.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
          setLoading(false);
          return;
        }

        const networkState = await NetInfo.fetch();
        const details = networkState.details as any;
        
        // Clean up quotation marks from SSID
        const currentSsid = details?.ssid?.replace(/^"|"$/g, ''); 

        if (networkState.type !== 'wifi' || !currentSsid || currentSsid === '<unknown ssid>') {
          Alert.alert('Network Verification Failed', 'Cannot verify your network. Please ensure both Wi-Fi and Location/GPS are turned ON.');
          setLoading(false);
          return;
        }

        let isAuthorizedNetwork = true;

        // Validate SSID using latest settings
        if (latestSettings.company_wifi_ssid && currentSsid !== latestSettings.company_wifi_ssid) {
          isAuthorizedNetwork = false;
        }

        // Validate BSSID (Optional: only if admin entered it)
        if (latestSettings.company_wifi_bssid && latestSettings.company_wifi_bssid.trim() !== '') {
          // Convert both to lowercase to avoid case sensitivity issues
          const requiredBssid = latestSettings.company_wifi_bssid.toLowerCase().trim();
          const deviceBssid = details?.bssid?.toLowerCase().trim();

          // Note: Some Android devices return 02:00:00:00:00:00 as a security measure to hide the MAC address
          if (deviceBssid !== requiredBssid) {
            isAuthorizedNetwork = false;
          }
        }

        // Generic Error (No Data Leakage)
        if (!isAuthorizedNetwork) {
          Alert.alert('Access Denied', 'You are not connected to the authorized company Wi-Fi network. Please connect to the correct workplace network to clock in.');
          setLoading(false);
          return;
        }
      }

      const deviceId = await getUniqueDeviceId();
      // 1. Request Location Permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to clock in/out.');
        setLoading(false);
        return;
      }

      // 2. Get Current Location
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = location.coords;


      // 3. Calculate True Time using server offset
      const localNow = Date.now();
      const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();

      if (localNow < lastLocalSyncTime) {
        Alert.alert('Security Alert', 'Device clock tampering detected. Time appears to have moved backwards.');
        setLoading(false);
        return;
      }

      const timestamp = new Date(localNow + serverTimeOffset).toISOString();

      // Optimistic Update if offline
      if (!isConnected) {
        saveOfflineLog(type, timestamp, latitude, longitude, deviceId);
        setStatus(type === 'check_in' ? 'working' : 'none');
        setLastActionTimestamp(timestamp);
        checkUnsyncedLogs();
        Alert.alert(
          'Offline Mode',
          `Network error. Your ${type === 'check_in' ? 'check-in' : 'check-out'} was saved locally and will be synced later.`
        );
        setLoading(false);
        return;
      }

      // 3. Try to call the Backend API
      try {
        await api.post('/attendance/clock', {
          type,
          timestamp,
          lat: latitude,
          lng: longitude,
          deviceId,
        });
        Alert.alert('Success', `Successfully clocked ${type === 'check_in' ? 'in' : 'out'}!`);
        setStatus(type === 'check_in' ? 'working' : 'none');
        setLastActionTimestamp(timestamp);
        fetchStatus(); // Refresh to get the latest session data
      } catch (apiError: any) {
        const errorMessage = apiError.response?.data?.error || apiError.message;

        // If it's a server response error (e.g., 403 Out of Range), show the error
        if (apiError.response) {
          Alert.alert('Attendance Error', errorMessage);
        } else {
          // Network error, save to local SQLite for later sync
          saveOfflineLog(type, timestamp, latitude, longitude, deviceId);
          setStatus(type === 'check_in' ? 'working' : 'none');
          setLastActionTimestamp(timestamp);
          Alert.alert(
            'Offline Mode',
            `Network error. Your ${type === 'check_in' ? 'check-in' : 'check-out'} was saved locally and will be synced later.`
          );
          checkUnsyncedLogs();
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleClock = async (type: 'check_in' | 'check_out') => {
    const alertTitle = `Confirm Clock ${type === 'check_in' ? 'In' : 'Out'}`;
    const alertMessage = `Are you sure you want to clock ${type === 'check_in' ? 'in' : 'out'} now?`;

    Alert.alert(
      alertTitle,
      alertMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes/Proceed', onPress: () => executeClock(type) }
      ]
    );
  };

  const handleSync = async () => {
    await syncOfflineRecords();
    checkUnsyncedLogs();
  };

  const handleStepAway = async () => {
    const allowedBreak = userProfile?.lunch_break_minutes || 0;
    const remainingBreak = Math.max(0, allowedBreak - consumedBreakMinutes);

    Alert.alert(
      'Confirm Step Away',
      `Are you sure you want to step away?\n\nRemaining Break Time: ${remainingBreak} minutes`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Step Away', onPress: async () => {
          setLoading(true);
          try {
            const deviceId = await getUniqueDeviceId();

      // 3. Calculate True Time using server offset
      const localNow = Date.now();
      const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();

      if (localNow < lastLocalSyncTime) {
        Alert.alert('Security Alert', 'Device clock tampering detected. Time appears to have moved backwards.');
        setLoading(false);
        return;
      }

      const timestamp = new Date(localNow + serverTimeOffset).toISOString();

            // Optimistic Update if offline
            if (!isConnected) {
              saveOfflineRequest('POST', '/attendance/step-away', { timestamp, deviceId });
              setStatus('away');
              setLastActionTimestamp(timestamp);
              checkUnsyncedLogs();
              Alert.alert('Offline Mode', 'Network error. Your request was saved locally and will be synced later.');
              setLoading(false);
              return;
            }

            const response = await api.post('/attendance/step-away', { timestamp, deviceId });

            if (!response.data.hasBreakBalance) {
              Alert.alert('Notice', 'You have no break balance. A permission request has been sent to your manager.');
            } else {
              Alert.alert('Success', 'You have stepped away.');
            }

            setStatus('away');
            setLastActionTimestamp(timestamp);
            fetchStatus(); // Refresh to update consumed time
          } catch (error: any) {
            if (!error.response) {
              const deviceId = await getUniqueDeviceId();

      // 3. Calculate True Time using server offset
      const localNow = Date.now();
      const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();

      if (localNow < lastLocalSyncTime) {
        Alert.alert('Security Alert', 'Device clock tampering detected. Time appears to have moved backwards.');
        setLoading(false);
        return;
      }

      const timestamp = new Date(localNow + serverTimeOffset).toISOString();
              saveOfflineRequest('POST', '/attendance/step-away', { timestamp, deviceId });
              Alert.alert('Offline Mode', 'Network error. Your request was saved locally and will be synced later.');
              setStatus('away');
              setLastActionTimestamp(timestamp);
              checkUnsyncedLogs();
            } else {
              Alert.alert('Error', error.response?.data?.error || 'Failed to step away');
            }
          } finally {
            setLoading(false);
          }
        }}
      ]
    );
  };

  const handleResumeWork = async () => {
    setLoading(true);
    try {
      const deviceId = await getUniqueDeviceId();

      // 3. Calculate True Time using server offset
      const localNow = Date.now();
      const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();

      if (localNow < lastLocalSyncTime) {
        Alert.alert('Security Alert', 'Device clock tampering detected. Time appears to have moved backwards.');
        setLoading(false);
        return;
      }

      const timestamp = new Date(localNow + serverTimeOffset).toISOString();

      // Optimistic Update if offline
      if (!isConnected) {
        saveOfflineRequest('POST', '/attendance/resume-work', { timestamp, deviceId });
        setStatus('working');
        setLastActionTimestamp(timestamp);
        checkUnsyncedLogs();
        Alert.alert('Offline Mode', 'Network error. Your request was saved locally and will be synced later.');
        setLoading(false);
        return;
      }

      await api.post('/attendance/resume-work', { timestamp, deviceId });
      Alert.alert('Success', 'Welcome back! You have resumed work.');
      setStatus('working');
      setLastActionTimestamp(timestamp);
      fetchStatus(); // Refresh to update consumed time
    } catch (error: any) {
      if (!error.response) {
        const deviceId = await getUniqueDeviceId();

      // 3. Calculate True Time using server offset
      const localNow = Date.now();
      const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();

      if (localNow < lastLocalSyncTime) {
        Alert.alert('Security Alert', 'Device clock tampering detected. Time appears to have moved backwards.');
        setLoading(false);
        return;
      }

      const timestamp = new Date(localNow + serverTimeOffset).toISOString();
        saveOfflineRequest('POST', '/attendance/resume-work', { timestamp, deviceId });
        Alert.alert('Offline Mode', 'Network error. Your request was saved locally and will be synced later.');
        setStatus('working');
        setLastActionTimestamp(timestamp);
        checkUnsyncedLogs();
      } else {
        Alert.alert('Error', error.response?.data?.error || 'Failed to resume work');
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateTenure = (hireDate: string | null) => {
    if (!hireDate) return 'Not set';
    const start = new Date(hireDate);
    const now = new Date();

    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();

    if (months < 0) {
      years--;
      months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);

    return parts.length > 0 ? parts.join(', ') : 'Less than a month';
  };

  const formatSchedule = (scheduleStr: string | null) => {
    if (!scheduleStr) return 'Not set';
    try {
      const schedule = JSON.parse(scheduleStr);
      const activeDays = Object.keys(schedule).filter(day => schedule[day] && schedule[day].length > 0);
      if (activeDays.length === 0) return 'No active days';
      if (activeDays.length === 7) return 'Daily';
      if (activeDays.length === 5 && !activeDays.includes('saturday') && !activeDays.includes('sunday')) return 'Mon - Fri';
      return `${activeDays.length} days / week`;
    } catch (e) {
      return 'Invalid format';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.title}>{user?.name}</Text>
          <Text style={styles.subtitle}>Welcome back to your dashboard</Text>
        </View>
        <TouchableOpacity
          onPress={logout}
          style={styles.iconButton}
          accessibilityLabel="Logout"
          accessibilityRole="button"
        >
          <LogOut color="#ef4444" size={24} />
        </TouchableOpacity>
      </View>

      <LiveServerClock />

      {userProfile && (
        <SmartAttendanceCard
          currentShift={userProfile.current_shift}
          currentStatus={currentStatus}
          consumedBreakMinutes={consumedBreakMinutes}
          loading={loading}
          handleClock={handleClock}
          handleStepAway={handleStepAway}
          handleResumeWork={handleResumeWork}
          lunchBreakMinutes={userProfile.lunch_break_minutes || 0}
        />
      )}

      <View style={styles.syncCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Offline Sync</Text>
          <Text style={styles.cardText}>
            Unsynced Records: {unsyncedCount}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.syncButton, unsyncedCount === 0 && styles.syncButtonDisabled]}
          onPress={handleSync}
          disabled={isSyncing || unsyncedCount === 0}
          accessibilityLabel="Sync offline logs"
          accessibilityRole="button"
          accessibilityState={{ disabled: isSyncing || unsyncedCount === 0 }}
        >
          {isSyncing ? <ActivityIndicator color="#18181b" /> : <RefreshCw color="#18181b" size={20} />}
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5' },
  scrollContent: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerMain: { flex: 1 },
  title: { fontSize: 28, fontWeight: '900', color: '#18181b', marginBottom: 6, letterSpacing: -0.5 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  roleText: { fontSize: 14, fontWeight: '600', color: '#71717a' },
  tenureContainer: { flexDirection: 'row', alignItems: 'center' },
  tenureText: { fontSize: 12, color: '#a1a1aa', fontWeight: '500' },
  subtitle: { fontSize: 16, color: '#71717a' },
  iconButton: { padding: 8, borderRadius: 12, backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  card: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  detailsCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 16,
  },
  detailItem: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18181b',
  },
  scheduleSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f4f4f5',
    gap: 8,
  },
  scheduleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717a',
  },
  scheduleValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#18181b',
  },
  syncCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 20,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#18181b', textTransform: 'uppercase', letterSpacing: 1 },
  cardText: { fontSize: 13, color: '#71717a', lineHeight: 18, marginBottom: 16 },
  syncButton: { backgroundColor: '#f4f4f5', padding: 12, borderRadius: 12 },
  syncButtonDisabled: { opacity: 0.5 },
  syncButtonText: { color: '#18181b', fontWeight: '600' },
  logoutButton: { backgroundColor: '#ef4444', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24 },
});
