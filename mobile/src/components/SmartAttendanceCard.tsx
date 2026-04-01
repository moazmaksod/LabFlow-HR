import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Clock, Calendar, Play, Pause, AlertCircle } from 'lucide-react-native';
import { useAttendanceStore } from '../store/useAttendanceStore';
import { useNetworkStore } from '../store/useNetworkStore';

interface SmartAttendanceCardProps {
  currentShift: any | null;
  currentStatus: 'working' | 'away' | 'none';
  consumedBreakMinutes: number;
  loading: boolean;
  handleClock: (type: 'check_in' | 'check_out') => void;
  handleStepAway: () => void;
  handleResumeWork: () => void;
  lunchBreakMinutes: number;
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

export default function SmartAttendanceCard({
  currentShift,
  currentStatus,
  consumedBreakMinutes,
  loading,
  handleClock,
  handleStepAway,
  handleResumeWork,
  lunchBreakMinutes
}: SmartAttendanceCardProps) {
  const activeSession = useAttendanceStore((state) => state.activeSession);
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset);
  const lastLocalSyncTime = useNetworkStore((state) => state.lastLocalSyncTime);

  const shadowTimeRef = useRef(Date.now() + serverTimeOffset);
  const [now, setNow] = useState(new Date(shadowTimeRef.current));
  const [isTampered, setIsTampered] = useState(false);

  useEffect(() => {
    // Re-sync shadow ref when dependency updates (e.g. app wakes up and syncs)
    shadowTimeRef.current = Date.now() + serverTimeOffset;

    const interval = setInterval(() => {
      // A) The Shadow Tick
      shadowTimeRef.current += 1000;
      setNow(new Date(shadowTimeRef.current));

      // B) The Drift Check
      const expectedOsTime = Date.now() + serverTimeOffset;
      if (Math.abs(expectedOsTime - shadowTimeRef.current) > 60000 || Date.now() < lastLocalSyncTime) {
        setIsTampered(true);
      } else {
        setIsTampered(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [serverTimeOffset, lastLocalSyncTime]);

  const todayShift = currentShift;
  const isClockedIn = currentStatus === 'working' || currentStatus === 'away';

  if (!todayShift) {
    return (
      <View style={styles.container}>
        <View style={styles.timelineCard}>
          <View style={styles.timelineHeader}>
            <View>
              <Text style={styles.timelineTitle}>No Shift Today</Text>
              <Text style={styles.timelineSubtitle}>Enjoy your day off!</Text>
            </View>
            <View style={[styles.statusBadge, styles.statusNone]}>
              <Text style={[styles.statusText, styles.statusTextNone]}>Off Duty</Text>
            </View>
          </View>
          <View style={styles.buttonRow}>
          {isTampered ? (
            <View style={styles.tamperContainer}>
              <AlertCircle color="#ef4444" size={24} style={{ marginBottom: 8 }} />
              <Text style={styles.tamperTitle}>Device Time Out of Sync</Text>
              <Text style={styles.tamperText}>
                Please set your phone's Date & Time to 'Automatic' to log attendance.
              </Text>
            </View>
          ) : !isClockedIn ? (
            <TouchableOpacity 
              style={[styles.clockButton, styles.clockInButton, loading && styles.disabledButton]}
              onPress={() => handleClock('check_in')}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock In</Text>}
            </TouchableOpacity>
          ) : (
            <>
              {currentStatus === 'working' ? (
                <TouchableOpacity
                  style={[styles.clockButton, styles.stepAwayButton, loading && styles.disabledButton]}
                  onPress={handleStepAway}
                  disabled={loading}
                >
                  <Pause color="#fff" size={20} style={{ marginRight: 8 }} />
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Step Away</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.clockButton, styles.resumeButton, loading && styles.disabledButton]}
                  onPress={handleResumeWork}
                  disabled={loading}
                >
                  <Play color="#fff" size={20} style={{ marginRight: 8 }} />
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Resume Work</Text>}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.clockButton, styles.clockOutButton, loading && styles.disabledButton]}
                onPress={() => handleClock('check_out')}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock Out</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
        </View>
      </View>
    );
  }




  const shiftStartUtc = new Date(todayShift.start_utc);
  const shiftEndUtc = new Date(todayShift.end_utc);
  const totalMins = (shiftEndUtc.getTime() - shiftStartUtc.getTime()) / (1000 * 60);
  const currentNowMins = (now.getTime() - shiftStartUtc.getTime()) / (1000 * 60);

  const dayDiff = now.getDate() !== shiftStartUtc.getDate() ? 1 : 0; // Simplified for display logic
  const shiftDate = shiftStartUtc;
  const startMins = 0; // Everything is relative to start now

  // Calculations
  let workedMins = 0;
  let remainingMins = 0;
  let breakMins = consumedBreakMinutes;

  if (isClockedIn && activeSession && currentStatus === 'away' && activeSession.breaks && Array.isArray(activeSession.breaks)) {
    const openBreak = activeSession.breaks.find((b: any) => !b.end_time);
    if (openBreak) {
      const openBreakStart = new Date(openBreak.start_time).getTime();
      breakMins += (now.getTime() - openBreakStart) / (1000 * 60);
    }
  }
  breakMins = Math.floor(breakMins);

  type SegmentType = 'work' | 'break' | 'missed' | 'remaining';
  const segments: { type: SegmentType, widthPct: number }[] = [];

  if (isClockedIn && activeSession) {
    const checkInDate = new Date(activeSession.check_in);
    const totalElapsed = (now.getTime() - checkInDate.getTime()) / (1000 * 60);
    workedMins = Math.max(0, totalElapsed - breakMins);
    
    remainingMins = Math.max(0, (shiftEndUtc.getTime() - now.getTime()) / (1000 * 60));

    const getMinsFromShiftStart = (dateStr: string | Date) => {
      const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
      return (d.getTime() - shiftStartUtc.getTime()) / (1000 * 60);
    };

    let checkInMins = getMinsFromShiftStart(activeSession.check_in);
    let lastEnd = 0;

    // If clocked in late, add a missed segment
    if (checkInMins > 0) {
      const missedWidth = Math.min(checkInMins, totalMins);
      segments.push({ type: 'missed', widthPct: (missedWidth / totalMins) * 100 });
      lastEnd = missedWidth;
    } else if (checkInMins < 0) {
      // Clocked in early, start from 0 for the timeline
      checkInMins = 0;
    }

    if (activeSession.breaks && Array.isArray(activeSession.breaks)) {
      activeSession.breaks.forEach((b: any) => {
        const breakStartMins = Math.max(0, getMinsFromShiftStart(b.start_time));
        const breakEndMins = b.end_time ? Math.max(0, getMinsFromShiftStart(b.end_time)) : Math.max(0, getMinsFromShiftStart(now));

        // Add work segment before break
        if (breakStartMins > lastEnd) {
          const workWidth = Math.min(breakStartMins - lastEnd, totalMins - lastEnd);
          if (workWidth > 0) {
            segments.push({ type: 'work', widthPct: (workWidth / totalMins) * 100 });
          }
        }
        
        // Add break segment
        const breakWidth = Math.min(breakEndMins - Math.max(lastEnd, breakStartMins), totalMins - Math.max(lastEnd, breakStartMins));
        if (breakWidth > 0) {
          segments.push({ type: 'break', widthPct: (breakWidth / totalMins) * 100 });
        }
        
        lastEnd = Math.max(lastEnd, breakEndMins);
      });
    }

    // Add final work segment if currently working
    const nowMinsFromStart = Math.max(0, getMinsFromShiftStart(now));
    if (currentStatus === 'working' && nowMinsFromStart > lastEnd) {
      const workWidth = Math.min(nowMinsFromStart - lastEnd, totalMins - lastEnd);
      if (workWidth > 0) {
        segments.push({ type: 'work', widthPct: (workWidth / totalMins) * 100 });
      }
      lastEnd = Math.max(lastEnd, nowMinsFromStart);
    }

    // Add remaining segment
    if (lastEnd < totalMins) {
      segments.push({ type: 'remaining', widthPct: ((totalMins - lastEnd) / totalMins) * 100 });
    }
  } else {
    remainingMins = totalMins;
    segments.push({ type: 'remaining', widthPct: 100 });
  }

  // "Now" indicator position
  let nowPct = (currentNowMins / totalMins) * 100;
  if (nowPct < 0) nowPct = 0;
  if (nowPct > 100) nowPct = 100;

  return (
    <View style={styles.container}>
      <View style={styles.timelineCard}>
        <View style={styles.timelineHeader}>
          <View>
            <Text style={styles.timelineTitle}>
              {isClockedIn ? 'Active Shift' : 'Target Shift'}
            </Text>
            <Text style={styles.timelineSubtitle}>
              {shiftDate.toLocaleDateString('en-GB', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'short' 
              }).replace(/,/g, '')} {'\n'} {formatTime(todayShift.start)} - {formatTime(todayShift.end)}
            </Text>
          </View>
          <View style={[styles.statusBadge, currentStatus === 'working' ? styles.statusWorking : currentStatus === 'away' ? styles.statusAway : styles.statusNone]}>
            {currentStatus === 'working' && <Play size={12} color="#10b981" style={{ marginRight: 4 }} />}
            {currentStatus === 'away' && <Pause size={12} color="#f59e0b" style={{ marginRight: 4 }} />}
            <Text style={[styles.statusText, currentStatus === 'working' ? styles.statusTextWorking : currentStatus === 'away' ? styles.statusTextAway : styles.statusTextNone]}>
              {currentStatus === 'working' ? 'Working' : currentStatus === 'away' ? 'Away' : 'Off Duty'}
            </Text>
          </View>
        </View>

        {isClockedIn && (
          <>
            {/* The Visual Timeline */}
            <View style={styles.timelineWrapper}>
              <View style={styles.timelineTrack}>
                {segments.map((seg, idx) => {
                  let segStyle = {};
                  if (seg.type === 'work') segStyle = styles.segmentWorked;
                  else if (seg.type === 'break') segStyle = styles.segmentBreak;
                  else if (seg.type === 'missed') segStyle = styles.segmentMissed;
                  else if (seg.type === 'remaining') segStyle = styles.segmentRemaining;

                  return (
                    <View 
                      key={idx} 
                      style={[styles.timelineSegment, segStyle, { width: `${seg.widthPct}%` }]} 
                    />
                  );
                })}
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

            {/* Break Info */}
            <View style={styles.breakInfoContainer}>
              {lunchBreakMinutes - breakMins > 0 ? (
                <Text style={styles.breakInfoText}>
                  Remaining Break Time: {Math.floor(lunchBreakMinutes - breakMins)} min
                </Text>
              ) : (
                <Text style={styles.breakWarningText}>
                  Over Break Limit by: {Math.abs(Math.floor(lunchBreakMinutes - breakMins))} min
                </Text>
              )}
            </View>
          </>
        )}

        <Text style={styles.radiusWarning}>
          Make sure you are within the workplace radius before clocking in or out.
        </Text>

        <View style={styles.buttonRow}>
          {isTampered ? (
            <View style={styles.tamperContainer}>
              <AlertCircle color="#ef4444" size={24} style={{ marginBottom: 8 }} />
              <Text style={styles.tamperTitle}>Device Time Out of Sync</Text>
              <Text style={styles.tamperText}>
                Please set your phone's Date & Time to 'Automatic' to log attendance.
              </Text>
            </View>
          ) : !isClockedIn ? (
            <TouchableOpacity 
              style={[styles.clockButton, styles.clockInButton, loading && styles.disabledButton]}
              onPress={() => handleClock('check_in')}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock In</Text>}
            </TouchableOpacity>
          ) : (
            <>
              {currentStatus === 'working' ? (
                <TouchableOpacity 
                  style={[styles.clockButton, styles.stepAwayButton, loading && styles.disabledButton]}
                  onPress={handleStepAway}
                  disabled={loading}
                >
                  <Pause color="#fff" size={20} style={{ marginRight: 8 }} />
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Step Away</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={[styles.clockButton, styles.resumeButton, loading && styles.disabledButton]}
                  onPress={handleResumeWork}
                  disabled={loading}
                >
                  <Play color="#fff" size={20} style={{ marginRight: 8 }} />
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Resume Work</Text>}
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[styles.clockButton, styles.clockOutButton, loading && styles.disabledButton]}
                onPress={() => handleClock('check_out')}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock Out</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
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
  segmentMissed: {
    backgroundColor: '#cbd5e1', // Distinct gray for missed time
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
  breakInfoContainer: {
    backgroundColor: '#f4f4f5',
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  breakInfoText: {
    fontSize: 13,
    color: '#3f3f46',
    fontWeight: '600',
  },
  breakWarningText: {
    fontSize: 11,
    color: '#ef4444',
    marginTop: 4,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  radiusWarning: {
    fontSize: 12,
    color: '#71717a',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  tamperContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  tamperTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ef4444',
    marginBottom: 4,
  },
  tamperText: {
    fontSize: 13,
    color: '#991b1b',
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  clockButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  clockInButton: {
    backgroundColor: '#10b981',
  },
  clockOutButton: {
    backgroundColor: '#ef4444',
  },
  stepAwayButton: {
    backgroundColor: '#f59e0b',
  },
  resumeButton: {
    backgroundColor: '#3b82f6',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
