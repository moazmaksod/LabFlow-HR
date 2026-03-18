import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Clock, Calendar, ArrowRight, Play, Pause } from 'lucide-react-native';

interface ShiftTimelineWidgetProps {
  schedule: any;
  currentStatus: 'working' | 'away' | 'none';
  consumedBreakMinutes: number;
  activeSession: any | null;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const timeToMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const formatDuration = (mins: number) => {
  if (mins <= 0) return '0h 0m';
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}h ${m}m`;
};

const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
};

export default function ShiftTimelineWidget({
  schedule,
  currentStatus,
  consumedBreakMinutes,
  activeSession
}: ShiftTimelineWidgetProps) {
  const [nowMins, setNowMins] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setNowMins(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const parsedSchedule = typeof schedule === 'string' ? JSON.parse(schedule) : schedule;

  const getTodayShift = () => {
    if (!parsedSchedule) return null;
    const todayName = DAYS[new Date().getDay()];
    const shift = parsedSchedule[todayName];
    if (shift && shift.length === 2) {
      return { start: shift[0], end: shift[1] };
    }
    return null;
  };

  const getNextShift = () => {
    if (!parsedSchedule) return null;
    const todayIdx = new Date().getDay();
    for (let i = 1; i <= 7; i++) {
      const nextIdx = (todayIdx + i) % 7;
      const dayName = DAYS[nextIdx];
      const shift = parsedSchedule[dayName];
      if (shift && shift.length === 2) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + i);
        return {
          dayName,
          date: nextDate,
          start: shift[0],
          end: shift[1]
        };
      }
    }
    return null;
  };

  const todayShift = getTodayShift();
  const nextShift = getNextShift();

  if (!todayShift) {
    return (
      <View style={styles.container}>
        <View style={styles.noShiftCard}>
          <Calendar color="#64748b" size={24} />
          <Text style={styles.noShiftTitle}>No Shift Today</Text>
          <Text style={styles.noShiftText}>Enjoy your day off!</Text>
        </View>
        {nextShift && (
          <View style={styles.nextShiftCard}>
            <View style={styles.nextShiftIconBg}>
              <Calendar color="#3b82f6" size={20} />
            </View>
            <View style={styles.nextShiftContent}>
              <Text style={styles.nextShiftLabel}>Next Shift • {nextShift.dayName.charAt(0).toUpperCase() + nextShift.dayName.slice(1)}</Text>
              <Text style={styles.nextShiftDate}>{nextShift.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
            </View>
            <View style={styles.nextShiftTime}>
              <Text style={styles.nextShiftTimeText}>{formatTime(nextShift.start)}</Text>
              <ArrowRight color="#94a3b8" size={14} style={{ marginHorizontal: 4 }} />
              <Text style={styles.nextShiftTimeText}>{formatTime(nextShift.end)}</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  const startMins = timeToMinutes(todayShift.start);
  const endMins = timeToMinutes(todayShift.end);
  const totalMins = endMins - startMins;

  // Calculations
  let workedMins = 0;
  let remainingMins = 0;
  let breakMins = consumedBreakMinutes;

  if (nowMins < startMins) {
    remainingMins = totalMins;
  } else if (nowMins > endMins) {
    workedMins = totalMins - breakMins;
    remainingMins = 0;
  } else {
    workedMins = Math.max(0, (nowMins - startMins) - breakMins);
    remainingMins = Math.max(0, endMins - nowMins);
  }

  // Percentages for the bar
  const workedPct = Math.min(100, Math.max(0, (workedMins / totalMins) * 100));
  const breakPct = Math.min(100, Math.max(0, (breakMins / totalMins) * 100));
  const remainingPct = Math.min(100, Math.max(0, (remainingMins / totalMins) * 100));
  
  // "Now" indicator position
  let nowPct = ((nowMins - startMins) / totalMins) * 100;
  if (nowPct < 0) nowPct = 0;
  if (nowPct > 100) nowPct = 100;

  return (
    <View style={styles.container}>
      {/* Main Timeline Card */}
      <View style={styles.timelineCard}>
        <View style={styles.timelineHeader}>
          <View>
            <Text style={styles.timelineTitle}>Today's Shift</Text>
            <Text style={styles.timelineSubtitle}>{formatTime(todayShift.start)} - {formatTime(todayShift.end)}</Text>
          </View>
          <View style={[styles.statusBadge, currentStatus === 'working' ? styles.statusWorking : currentStatus === 'away' ? styles.statusAway : styles.statusNone]}>
            {currentStatus === 'working' && <Play size={12} color="#10b981" style={{ marginRight: 4 }} />}
            {currentStatus === 'away' && <Pause size={12} color="#f59e0b" style={{ marginRight: 4 }} />}
            <Text style={[styles.statusText, currentStatus === 'working' ? styles.statusTextWorking : currentStatus === 'away' ? styles.statusTextAway : styles.statusTextNone]}>
              {currentStatus === 'working' ? 'Active' : currentStatus === 'away' ? 'On Break' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* The Visual Timeline */}
        <View style={styles.timelineWrapper}>
          <View style={styles.timelineTrack}>
            {/* Worked Segment */}
            <View style={[styles.timelineSegment, styles.segmentWorked, { width: `${workedPct}%` }]} />
            {/* Break Segment */}
            <View style={[styles.timelineSegment, styles.segmentBreak, { width: `${breakPct}%` }]} />
            {/* Remaining Segment */}
            <View style={[styles.timelineSegment, styles.segmentRemaining, { width: `${remainingPct}%` }]} />
          </View>
          
          {/* "Now" Indicator */}
          <View style={[styles.nowIndicator, { left: `${nowPct}%` }]}>
            <View style={styles.nowIndicatorLine} />
            <View style={styles.nowIndicatorDot} />
          </View>
        </View>

        {/* Timeline Labels */}
        <View style={styles.timelineLabels}>
          <Text style={styles.timelineLabelText}>{formatTime(todayShift.start)}</Text>
          <Text style={styles.timelineLabelText}>{formatTime(todayShift.end)}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <View style={[styles.statDot, { backgroundColor: '#10b981' }]} />
            <View>
              <Text style={styles.statLabel}>Worked</Text>
              <Text style={styles.statValue}>{formatDuration(workedMins)}</Text>
            </View>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statDot, { backgroundColor: '#f59e0b' }]} />
            <View>
              <Text style={styles.statLabel}>Break</Text>
              <Text style={styles.statValue}>{formatDuration(breakMins)}</Text>
            </View>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statDot, { backgroundColor: '#e2e8f0' }]} />
            <View>
              <Text style={styles.statLabel}>Remaining</Text>
              <Text style={styles.statValue}>{formatDuration(remainingMins)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Next Shift Predictor */}
      {nextShift && (
        <View style={styles.nextShiftCard}>
          <View style={styles.nextShiftIconBg}>
            <Calendar color="#3b82f6" size={20} />
          </View>
          <View style={styles.nextShiftContent}>
            <Text style={styles.nextShiftLabel}>Next Shift • {nextShift.dayName.charAt(0).toUpperCase() + nextShift.dayName.slice(1)}</Text>
            <Text style={styles.nextShiftDate}>{nextShift.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
          </View>
          <View style={styles.nextShiftTime}>
            <Text style={styles.nextShiftTimeText}>{formatTime(nextShift.start)}</Text>
            <ArrowRight color="#94a3b8" size={14} style={{ marginHorizontal: 4 }} />
            <Text style={styles.nextShiftTimeText}>{formatTime(nextShift.end)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  timelineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  timelineSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusWorking: {
    backgroundColor: '#ecfdf5',
  },
  statusAway: {
    backgroundColor: '#fffbeb',
  },
  statusNone: {
    backgroundColor: '#f1f5f9',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusTextWorking: {
    color: '#10b981',
  },
  statusTextAway: {
    color: '#f59e0b',
  },
  statusTextNone: {
    color: '#64748b',
  },
  timelineWrapper: {
    position: 'relative',
    height: 32,
    marginBottom: 8,
  },
  timelineTrack: {
    flexDirection: 'row',
    height: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 10,
  },
  timelineSegment: {
    height: '100%',
  },
  segmentWorked: {
    backgroundColor: '#10b981',
  },
  segmentBreak: {
    backgroundColor: '#f59e0b',
  },
  segmentRemaining: {
    backgroundColor: '#e2e8f0',
  },
  nowIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    alignItems: 'center',
  },
  nowIndicatorLine: {
    width: 2,
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 1,
  },
  nowIndicatorDot: {
    position: 'absolute',
    top: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  timelineLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  statBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  nextShiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nextShiftIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  nextShiftContent: {
    flex: 1,
  },
  nextShiftLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  nextShiftDate: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  nextShiftTime: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nextShiftTimeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  noShiftCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  noShiftTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 12,
    marginBottom: 4,
  },
  noShiftText: {
    fontSize: 14,
    color: '#64748b',
  },
});
