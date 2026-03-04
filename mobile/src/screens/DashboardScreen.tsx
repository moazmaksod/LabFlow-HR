import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { useAuthStore } from '../store/useAuthStore';
import api from '../lib/axios';
import { initLocalDb, saveOfflineLog, getUnsyncedLogs, markLogsAsSynced } from '../lib/db';

export default function DashboardScreen() {
  const { user, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);

  useEffect(() => {
    // Initialize local SQLite database
    initLocalDb();
    checkUnsyncedLogs();
  }, []);

  const checkUnsyncedLogs = () => {
    const logs = getUnsyncedLogs();
    setUnsyncedCount(logs.length);
  };

  const handleClock = async (type: 'check_in' | 'check_out') => {
    setLoading(true);
    try {
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
        });
        Alert.alert('Success', `Successfully clocked ${type === 'check_in' ? 'in' : 'out'}!`);
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Welcome back, {user?.name}</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendance</Text>
        <Text style={styles.cardText}>
          Make sure you are within the workplace radius before clocking in or out.
        </Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.clockButton, styles.clockInButton]} 
            onPress={() => handleClock('check_in')}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock In</Text>}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.clockButton, styles.clockOutButton]} 
            onPress={() => handleClock('check_out')}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock Out</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.syncCard}>
        <Text style={styles.cardTitle}>Offline Sync</Text>
        <Text style={styles.cardText}>
          Unsynced Records: {unsyncedCount}
        </Text>
        <TouchableOpacity 
          style={[styles.syncButton, unsyncedCount === 0 && styles.syncButtonDisabled]} 
          onPress={handleSync}
          disabled={syncing || unsyncedCount === 0}
        >
          {syncing ? <ActivityIndicator color="#18181b" /> : <Text style={styles.syncButtonText}>Sync Now</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5', padding: 24, paddingTop: 60 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#18181b', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#71717a', marginBottom: 24 },
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
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#18181b', marginBottom: 8 },
  cardText: { fontSize: 14, color: '#71717a', lineHeight: 20, marginBottom: 16 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  clockButton: { flex: 1, padding: 16, borderRadius: 8, alignItems: 'center' },
  clockInButton: { backgroundColor: '#10b981' }, // Emerald green
  clockOutButton: { backgroundColor: '#f59e0b' }, // Amber
  syncButton: { backgroundColor: '#e4e4e7', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  syncButtonDisabled: { opacity: 0.5 },
  syncButtonText: { color: '#18181b', fontWeight: '600' },
  logoutButton: { backgroundColor: '#ef4444', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 'auto' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
