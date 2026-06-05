import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Landmark, Clock, CalendarRange } from 'lucide-react-native';
import { useThemeColors } from '../hooks/useTheme';

interface SalaryEstimateCardProps {
  estimate: {
    start_date: string;
    end_date: string;
    estimated_net_salary: number;
    base_salary: number;
    overtime_minutes: number;
    deduction_minutes: number;
    total_deductions: number;
    attendance_bonus: number;
    actual_worked_hours: number;
  } | null;
}

export default function SalaryEstimateCard({ estimate }: SalaryEstimateCardProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!estimate) return null;

  // Formatting dates for display
  const formatDateString = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'T00:00:00Z');
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  return (
    <View style={styles.card}>
      {/* Decorative vertical colored stripe */}
      <View style={styles.stripe} />
      
      <View style={styles.mainContent}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Landmark size={16} color={colors.accent} style={styles.icon} />
            <Text style={styles.label}>Salary Estimate</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Current Period</Text>
          </View>
        </View>

        <Text style={styles.salaryText}>
          ${estimate.estimated_net_salary.toFixed(2)}
        </Text>
        
        <View style={styles.rangeRow}>
          <CalendarRange size={14} color={colors.subtext} style={styles.timeIcon} />
          <Text style={styles.rangeText}>
            {formatDateString(estimate.start_date)} - {formatDateString(estimate.end_date)}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Clock size={12} color={colors.subtext} style={styles.statIcon} />
            <Text style={styles.statLabel}>Worked Hours</Text>
            <Text style={styles.statValue}>{estimate.actual_worked_hours}h</Text>
          </View>
          <View style={styles.statItem}>
            <View style={styles.statIconPlaceholder} />
            <Text style={styles.statLabel}>Est. Base Pay</Text>
            <Text style={styles.statValue}>${estimate.base_salary.toFixed(2)}</Text>
          </View>
          <View style={styles.statItem}>
            <View style={styles.statIconPlaceholder} />
            <Text style={styles.statLabel}>Deductions</Text>
            <Text style={[styles.statValue, estimate.total_deductions > 0 ? styles.deductionText : null]}>
              -${estimate.total_deductions.toFixed(2)}
            </Text>
          </View>
        </View>

        {estimate.attendance_bonus > 0 && (
          <Text style={styles.bonusText}>
            Includes On-Time Attendance Bonus: +${estimate.attendance_bonus.toFixed(2)}
          </Text>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 16,
    elevation: 2,
  },
  stripe: {
    width: 6,
    backgroundColor: colors.accent, // Premium accent color (e.g. Indigo/Blue)
  },
  mainContent: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    backgroundColor: colors.accentBg || '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accent,
    textTransform: 'uppercase',
  },
  salaryText: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 4,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeIcon: {
    marginRight: 6,
  },
  rangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.subtext,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
  },
  statIcon: {
    marginBottom: 4,
  },
  statIconPlaceholder: {
    height: 16,
  },
  statLabel: {
    fontSize: 10,
    color: colors.subtext,
    fontWeight: '600',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  deductionText: {
    color: '#ef4444',
  },
  bonusText: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 8,
  },
});
