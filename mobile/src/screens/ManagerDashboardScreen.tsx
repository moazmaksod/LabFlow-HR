import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LayoutDashboard, Users, Clock, AlertTriangle, CheckCircle, UserCircle } from 'lucide-react-native';
import api from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { useThemeColors } from '../hooks/useTheme';

export default function ManagerDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { colors } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { isConnected } = useNetworkStore();

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [isConnected])
  );

  const fetchStats = async () => {
    if (!isConnected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get('/attendance/stats');
      setStats(response.data);
    } catch (error: any) {
      if (!error.isNetworkError) {
        console.error('Error fetching manager stats:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  const totalToday = (stats?.today?.present || 0) + (stats?.today?.late || 0) + (stats?.today?.absent || 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <LayoutDashboard color={colors.accent} size={32} />
          <Text style={styles.title}>Manager Dashboard</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.profileButton}>
          <UserCircle color={colors.subtext} size={28} />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Today's Attendance Summary</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Users color={colors.subtext} size={20} />
            <Text style={styles.statLabel}>Total Tracked</Text>
          </View>
          <Text style={styles.statValue}>{totalToday}</Text>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <CheckCircle color={colors.success} size={20} />
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <Text style={styles.statValue}>{stats?.today?.present || 0}</Text>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Clock color={colors.warning} size={20} />
            <Text style={styles.statLabel}>Late</Text>
          </View>
          <Text style={styles.statValue}>{stats?.today?.late || 0}</Text>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <AlertTriangle color={colors.danger} size={20} />
            <Text style={styles.statLabel}>Absent</Text>
          </View>
          <Text style={styles.statValue}>{stats?.today?.absent || 0}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: colors.subtext,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileButton: {
    padding: 8,
    backgroundColor: colors.card,
    borderRadius: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginLeft: 12,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.subtext,
    marginLeft: 8,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
});
