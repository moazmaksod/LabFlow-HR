import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Clock, Calendar, MapPin } from 'lucide-react-native';
import api from '../lib/axios';

interface AttendanceLog {
  id: number;
  date: string;
  check_in: string;
  check_out: string | null;
  status: string;
  location_lat: number;
  location_lng: number;
}

export default function HistoryScreen() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const renderItem = ({ item }: { item: AttendanceLog }) => (
    <View style={styles.logCard}>
      <View style={styles.logHeader}>
        <View style={styles.dateContainer}>
          <Calendar size={16} color="#71717a" />
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
        </View>
        <View style={[styles.statusBadge, item.status === 'present' ? styles.presentBadge : styles.absentBadge]}>
          <Text style={[styles.statusText, item.status === 'present' ? styles.presentText : styles.absentText]}>
            {item.status.toUpperCase()}
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

      <View style={styles.locationRow}>
        <MapPin size={14} color="#71717a" />
        <Text style={styles.locationText}>
          {item.location_lat.toFixed(4)}, {item.location_lng.toFixed(4)}
        </Text>
      </View>
    </View>
  );

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
  presentBadge: { backgroundColor: '#dcfce7' },
  absentBadge: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  presentText: { color: '#166534' },
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
});
