import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Alert, ScrollView, RefreshControl } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';
import api from '../lib/axios';
import { initLocalDb, saveOfflineLog, getUnsyncedLogs, getUnsyncedRequests, saveOfflineRequest } from '../lib/db';
import { useNetworkStore } from '../store/useNetworkStore';
import { getUniqueDeviceId } from '../utils/device';
import { useAttendanceStore } from '../store/useAttendanceStore';
import SmartAttendanceCard from '../components/SmartAttendanceCard';
import LiveServerClock from '../components/LiveServerClock';
import NetInfo from '@react-native-community/netinfo';
import { useSettingsStore } from '../store/useSettingsStore';
import * as Linking from 'expo-linking';
import { getMobileNow, getSystemNow, getTimestamp } from '../lib/timeManager';

// Import refactored components
import DashboardHeader from '../components/DashboardHeader';
import UpcomingShiftCard from '../components/UpcomingShiftCard';
import OfflineSyncCard from '../components/OfflineSyncCard';

export default function DashboardScreen() {
  const { user, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
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
    setActiveSession,
    setTodayLogs
  } = useAttendanceStore();
  const userTimezone = useSettingsStore((state) => state.userTimezone);

  useEffect(() => {
    // Initialize local SQLite database
    initLocalDb();

    // Sync server time on load
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

      const resolvedTimezone = userTimezone || user?.display_timezone || 'UTC';
      const localTodayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: resolvedTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(getMobileNow()));

      const todayLogs = logs.filter((l: any) => l.date === localTodayStr);
      setTodayLogs(todayLogs);

      // Check if there is an active session (check_out is null)
      const session = logs.find((l: any) => !l.check_out);
      setActiveSession(session || null);
      if (session) {
        setStatus(session.working_status || 'working');

        let consumed = 0;
        if (session.breaks && Array.isArray(session.breaks)) {
          session.breaks.forEach((b: any) => {
            const start = getTimestamp(b.start_time);
            const end = b.end_time ? getTimestamp(b.end_time) : getTimestamp(getSystemNow());
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
  }, [isConnected, setActiveSession, setStatus, setConsumedBreakMinutes, setTodayLogs, userTimezone, user?.display_timezone]);

  const checkUnsyncedLogs = useCallback(() => {
    const logs = getUnsyncedLogs();
    const requests = getUnsyncedRequests();
    setUnsyncedCount(logs.length + requests.length);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchStatus(),
        fetchProfile(),
        useNetworkStore.getState().syncServerTime()
      ]);
      checkUnsyncedLogs();
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStatus, fetchProfile, checkUnsyncedLogs]);

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
      let latestSettings = useSettingsStore.getState().settings;
      if (isConnected) {
        try {
          const settingsResponse = await api.get('/settings');
          latestSettings = settingsResponse.data;
          useSettingsStore.getState().fetchSettings();
        } catch (e) {
          // Silent skip
        }
      }

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
        const currentSsid = details?.ssid?.replace(/^"|"$/g, '');

        if (networkState.type !== 'wifi' || !currentSsid || currentSsid === '<unknown ssid>') {
          Alert.alert('Network Verification Failed', 'Cannot verify your network. Please ensure both Wi-Fi and Location/GPS are turned ON.');
          setLoading(false);
          return;
        }

        let isAuthorizedNetwork = true;
        if (latestSettings.company_wifi_ssid && currentSsid !== latestSettings.company_wifi_ssid) {
          isAuthorizedNetwork = false;
        }

        if (latestSettings.company_wifi_bssid && latestSettings.company_wifi_bssid.trim() !== '') {
          const requiredBssid = latestSettings.company_wifi_bssid.toLowerCase().trim();
          const deviceBssid = details?.bssid?.toLowerCase().trim();
          if (deviceBssid !== requiredBssid) {
            isAuthorizedNetwork = false;
          }
        }

        if (!isAuthorizedNetwork) {
          Alert.alert('Access Denied', 'You are not connected to the authorized company Wi-Fi network. Please connect to the correct workplace network to clock in.');
          setLoading(false);
          return;
        }
      }

      const deviceId = await getUniqueDeviceId();
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to clock in/out.');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = location.coords;

      const timestamp = getMobileNow();
      const localNow = Date.now();
      const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();
      const monotonicTime = getTimestamp(timestamp);
      const expectedOsTime = localNow + serverTimeOffset;

      if (Math.abs(expectedOsTime - monotonicTime) > 60000 || localNow < lastLocalSyncTime) {
        Alert.alert('Security Alert', 'Device clock tampering detected.');
        setLoading(false);
        return;
      }

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
        fetchStatus();
      } catch (apiError: any) {
        const errorMessage = apiError.response?.data?.error || apiError.message;
        if (apiError.response) {
          Alert.alert('Attendance Error', errorMessage);
        } else {
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
    let totalDailyMinutes = 0;
    if (userProfile?.today_shifts) {
      userProfile.today_shifts.forEach((shift: any) => {
        const start = getTimestamp(shift.start_time);
        const end = getTimestamp(shift.end_time);
        totalDailyMinutes += (end - start) / 60000;
      });
    } else if (userProfile?.current_shift) {
      const start = getTimestamp(userProfile.current_shift.start_time || userProfile.current_shift.start);
      const end = getTimestamp(userProfile.current_shift.end_time || userProfile.current_shift.end);
      totalDailyMinutes += (end - start) / 60000;
    }

    const maxAllowed = Math.floor(totalDailyMinutes * 0.1);
    const finalAllowedBreak = Math.min(allowedBreak, maxAllowed);
    const remainingBreak = Math.max(0, finalAllowedBreak - consumedBreakMinutes);

    Alert.alert(
      'Confirm Step Away',
      `Are you sure you want to step away?\n\nRemaining Break Time: ${remainingBreak} minutes\n(Capped at 10% of daily shifts)`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Step Away', onPress: async () => {
          setLoading(true);
          try {
            const deviceId = await getUniqueDeviceId();
            const timestamp = getMobileNow();
            const localNow = Date.now();
            const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();
            const monotonicTime = getTimestamp(timestamp);
            const expectedOsTime = localNow + serverTimeOffset;

            if (Math.abs(expectedOsTime - monotonicTime) > 60000 || localNow < lastLocalSyncTime) {
              Alert.alert('Security Alert', 'Device clock tampering detected.');
              setLoading(false);
              return;
            }

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
            fetchStatus();
          } catch (error: any) {
            if (!error.response) {
              const deviceId = await getUniqueDeviceId();
              const timestamp = getMobileNow();
              const localNow = Date.now();
              const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();
              const monotonicTime = getTimestamp(timestamp);
              const expectedOsTime = localNow + serverTimeOffset;

              if (Math.abs(expectedOsTime - monotonicTime) > 60000 || localNow < lastLocalSyncTime) {
                Alert.alert('Security Alert', 'Device clock tampering detected.');
                setLoading(false);
                return;
              }
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
      const timestamp = getMobileNow();
      const localNow = Date.now();
      const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();
      const monotonicTime = getTimestamp(timestamp);
      const expectedOsTime = localNow + serverTimeOffset;

      if (Math.abs(expectedOsTime - monotonicTime) > 60000 || localNow < lastLocalSyncTime) {
        Alert.alert('Security Alert', 'Device clock tampering detected.');
        setLoading(false);
        return;
      }

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
      fetchStatus();
    } catch (error: any) {
      if (!error.response) {
        const deviceId = await getUniqueDeviceId();
        const timestamp = getMobileNow();
        const localNow = Date.now();
        const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();
        const monotonicTime = getTimestamp(timestamp);
        const expectedOsTime = localNow + serverTimeOffset;

        if (Math.abs(expectedOsTime - monotonicTime) > 60000 || localNow < lastLocalSyncTime) {
          Alert.alert('Security Alert', 'Device clock tampering detected.');
          setLoading(false);
          return;
        }
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#10b981']}
          tintColor="#10b981"
        />
      }
    >
      {/* Redesigned Dashboard Header */}
      <DashboardHeader userProfile={userProfile} logout={logout} />

      {/* Live Server Clock */}
      <LiveServerClock />

      {/* Modular Upcoming Shift Card */}
      <UpcomingShiftCard upcomingShift={userProfile?.next_shift} userTimezone={userTimezone} />

      {/* Modular Smart Attendance Card */}
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

      {/* Modular Offline Sync Card */}
      <OfflineSyncCard
        unsyncedCount={unsyncedCount}
        isSyncing={isSyncing}
        handleSync={handleSync}
      />

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5' },
  scrollContent: { padding: 24, paddingTop: 60, paddingBottom: 40 },
});
