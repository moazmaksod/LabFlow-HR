import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, Calendar, CheckCircle, XCircle, AlertCircle, MessageSquare } from 'lucide-react-native';
import api from '../lib/axios';

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
}

export default function RequestsScreen() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = async () => {
    try {
      const response = await api.get('/requests');
      setRequests(response.data);
    } catch (error) {
      console.error('Error fetching requests:', error);
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
