import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CalendarDays, Clock } from 'lucide-react-native';
import { formatDisplayDate, formatDisplayTime, resolveTimezone } from '../lib/timeManager';

interface UpcomingShiftCardProps {
  upcomingShift: any | null;
  userTimezone: string | null;
}

export default function UpcomingShiftCard({ upcomingShift, userTimezone }: UpcomingShiftCardProps) {
  if (!upcomingShift) return null;

  const displayTimezone = resolveTimezone(userTimezone);

  return (
    <View style={styles.card}>
      {/* Decorative vertical colored stripe */}
      <View style={styles.stripe} />
      
      <View style={styles.mainContent}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <CalendarDays size={16} color="#10b981" style={styles.icon} />
            <Text style={styles.label}>Next Scheduled Shift</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Upcoming</Text>
          </View>
        </View>

        <Text style={styles.dateText}>
          {formatDisplayDate(upcomingShift.start_utc, displayTimezone, 'EEEE, d MMMM yyyy')}
        </Text>
        
        <View style={styles.timeRow}>
          <Clock size={14} color="#64748b" style={styles.timeIcon} />
          <Text style={styles.hoursText}>
            {formatDisplayTime(upcomingShift.start_utc, displayTimezone, 'HH:mm')} - {formatDisplayTime(upcomingShift.end_utc, displayTimezone, 'HH:mm')}
          </Text>
          <Text style={styles.timezoneLabel}>({displayTimezone})</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 16,
    elevation: 2,
  },
  stripe: {
    width: 6,
    backgroundColor: '#10b981', // Premium green accent
  },
  mainContent: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10b981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10b981',
    textTransform: 'uppercase',
  },
  dateText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeIcon: {
    marginRight: 6,
  },
  hoursText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  timezoneLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 6,
    fontWeight: '500',
  },
});
