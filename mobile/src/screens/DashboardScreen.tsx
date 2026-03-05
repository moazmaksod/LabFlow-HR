import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { Pause, Play, LayoutDashboard, LogOut, RefreshCw } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';
import api from '../lib/axios';
import { initLocalDb, saveOfflineLog, getUnsyncedLogs, markLogsAsSynced } from '../lib/db';
import { getUniqueDeviceId } from '../utils/device';

export default function DashboardScreen() {
  const { user, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [currentStatus, setCurrentStatus] = useState<'working' | 'away' | 'none'>('none');

  useEffect(() => {
    // Initialize local SQLite database
    initLocalDb();
    checkUnsyncedLogs();
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await api.get('/attendance/my-logs');
      const logs = response.data;
      const today = new Date().toISOString().split('T')[0];
      const todayLog = logs.find((l: any) => l.date === today && !l.check_out);
      if (todayLog) {
        setCurrentStatus(todayLog.current_status || 'working');
      } else {
        setCurrentStatus('none');
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  const checkUnsyncedLogs = () => {
    const logs = getUnsyncedLogs();
    setUnsyncedCount(logs.length);
  };

  const handleClock = async (type: 'check_in' | 'check_out') => {
    setLoading(true);
    try {
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

      const timestamp = new Date().toISOString();

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
        setCurrentStatus(type === 'check_in' ? 'working' : 'none');
      } catch (apiError: any) {
        const errorMessage = apiError.response?.data?.error || apiError.message;

        // If it's a server response error (e.g., 403 Out of Range), show the error
        if (apiError.response) {
          Alert.alert('Attendance Error', errorMessage);
        } else {
          // Network error, save to local SQLite for later sync
          console.log('Network Error, saving offline:', apiError.message);
          saveOfflineLog(type, timestamp, latitude, longitude);
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

  const handleSync = async () => {
    const logs = getUnsyncedLogs() as any[];
    if (logs.length === 0) {
      Alert.alert('Sync', 'No offline logs to sync.');
      return;
    }

    setSyncing(true);
    try {
      const response = await api.post('/attendance/sync', { logs });
      
      // Mark successfully processed logs as synced
      const syncedIds = response.data.results.map((r: any) => r.logId);
      if (syncedIds.length > 0) {
        markLogsAsSynced(syncedIds);
      }
      
      Alert.alert('Sync Complete', `Successfully synced ${syncedIds.length} logs.`);
      checkUnsyncedLogs();
    } catch (error: any) {
      Alert.alert('Sync Failed', error.response?.data?.error || 'Could not reach the server.');
    } finally {
      setSyncing(false);
    }
  };

  const handleStepAway = async () => {
    setLoading(true);
    try {
      const deviceId = await getUniqueDeviceId();
      const timestamp = new Date().toISOString();
      const response = await api.post('/attendance/step-away', { timestamp, deviceId });
      
      if (!response.data.hasBreakBalance) {
        Alert.alert('Notice', 'You have no break balance. A permission request has been sent to your manager.');
      } else {
        Alert.alert('Success', 'You have stepped away.');
      }
      
      setCurrentStatus('away');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to step away');
    } finally {
      setLoading(false);
    }
  };

  const handleResumeWork = async () => {
    setLoading(true);
    try {
      const deviceId = await getUniqueDeviceId();
      const timestamp = new Date().toISOString();
      await api.post('/attendance/resume-work', { timestamp, deviceId });
      Alert.alert('Success', 'Welcome back! You have resumed work.');
      setCurrentStatus('working');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to resume work');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Welcome back, {user?.name}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.iconButton}>
          <LogOut color="#ef4444" size={24} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Attendance</Text>
          {currentStatus !== 'none' && (
            <View style={[styles.statusBadge, currentStatus === 'working' ? styles.workingBadge : styles.awayBadge]}>
              <Text style={styles.statusBadgeText}>{currentStatus === 'working' ? 'Working' : 'Away'}</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardText}>
          Make sure you are within the workplace radius before clocking in or out.
        </Text>

        <View style={styles.buttonRow}>
          {currentStatus === 'none' ? (
            <TouchableOpacity 
              style={[styles.clockButton, styles.clockInButton]} 
              onPress={() => handleClock('check_in')}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock In</Text>}
            </TouchableOpacity>
          ) : (
            <>
              {currentStatus === 'working' ? (
                <TouchableOpacity 
                  style={[styles.clockButton, styles.stepAwayButton]} 
                  onPress={handleStepAway}
                  disabled={loading}
                >
                  <Pause color="#fff" size={20} style={{ marginRight: 8 }} />
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Step Away</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={[styles.clockButton, styles.resumeButton]} 
                  onPress={handleResumeWork}
                  disabled={loading}
                >
                  <Play color="#fff" size={20} style={{ marginRight: 8 }} />
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Resume Work</Text>}
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[styles.clockButton, styles.clockOutButton]} 
                onPress={() => handleClock('check_out')}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock Out</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

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
          disabled={syncing || unsyncedCount === 0}
        >
          {syncing ? <ActivityIndicator color="#18181b" /> : <RefreshCw color="#18181b" size={20} />}
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5', padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#18181b', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#71717a' },
  iconButton: { padding: 8, borderRadius: 12, backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  card: { 
    backgroundColor: '#fff', 
    padding: 24, 
    borderRadius: 16, 
    marginBottom: 16, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 8, 
    elevation: 4 
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  workingBadge: { backgroundColor: '#dcfce7' },
  awayBadge: { backgroundColor: '#fef3c7' },
  statusBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#166534' },
  syncCard: {
    backgroundColor: '#fff', 
    padding: 24, 
    borderRadius: 16, 
    marginBottom: 24, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 8, 
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#18181b' },
  cardText: { fontSize: 14, color: '#71717a', lineHeight: 20, marginBottom: 16 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  clockButton: { flex: 1, padding: 16, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  clockInButton: { backgroundColor: '#10b981' }, // Emerald green
  clockOutButton: { backgroundColor: '#ef4444' }, // Red
  stepAwayButton: { backgroundColor: '#f59e0b' }, // Amber/Yellow
  resumeButton: { backgroundColor: '#3b82f6' }, // Blue
  syncButton: { backgroundColor: '#f4f4f5', padding: 12, borderRadius: 12 },
  syncButtonDisabled: { opacity: 0.5 },
  syncButtonText: { color: '#18181b', fontWeight: '600' },
  logoutButton: { backgroundColor: '#ef4444', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
