import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { Play, Pause, AlertCircle, Clock } from 'lucide-react-native';
import { useAttendanceStore } from '../store/useAttendanceStore';
import { formatDisplayDate, formatDisplayTime, formatTimeString, formatDuration, getMobileNow, resolveTimezone, getTimestamp } from '../lib/timeManager';
import { toDate } from 'date-fns-tz';
import { useAuthStore } from '../store/useAuthStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useThemeColors } from '../hooks/useTheme';

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
  const user = useAuthStore((state) => state.user);
  const userTimezone = useSettingsStore((state) => state.userTimezone);
  const settings = useSettingsStore((state) => state.settings);
  const { colors } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const formatShiftTime = (timeStr: string, utcTimeStr?: string) => {
    if (utcTimeStr) {
      return formatDisplayTime(utcTimeStr, userTimezone, 'HH:mm');
    }
    return formatTimeString(timeStr, userTimezone);
  };

  const activeSession = useAttendanceStore((state) => state.activeSession);
  const todayLogs = useAttendanceStore((state) => state.todayLogs);
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset);
  const lastLocalSyncTime = useNetworkStore((state) => state.lastLocalSyncTime);

  const [now, setNow] = useState(new Date(getMobileNow()));
  const [isTampered, setIsTampered] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const updateTime = () => {
      const nowIso = getMobileNow();
      const nowObj = new Date(nowIso);
      setNow(nowObj);

      // Monotonic time drift check
      const expectedOsTime = Date.now() + serverTimeOffset;
      const monotonicTime = nowObj.getTime();
      if (Math.abs(expectedOsTime - monotonicTime) > 60000 || Date.now() < lastLocalSyncTime) {
        setIsTampered(true);
      } else {
        setIsTampered(false);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [serverTimeOffset, lastLocalSyncTime]);

  const isClockedIn = currentStatus === 'working' || currentStatus === 'away';
  const isUnscheduledSession = activeSession?.checkin_status === 'unscheduled';

  // Live indicator pulsing effect
  useEffect(() => {
    if (isClockedIn) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0.4);
    }
  }, [isClockedIn]);

  const runningShift = (() => {
    if (!currentShift) return null;
    const resolvedTz = resolveTimezone(userTimezone || user?.display_timezone);
    const localTodayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: resolvedTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const shiftStartMs = currentShift.start_utc
      ? new Date(currentShift.start_utc).getTime()
      : toDate(`${currentShift.date}T${currentShift.start}:00`, { timeZone: resolvedTz }).getTime();
    const shiftEndMs = currentShift.end_utc
      ? new Date(currentShift.end_utc).getTime()
      : toDate(`${currentShift.date}T${currentShift.end}:00`, { timeZone: resolvedTz }).getTime();

    const gracePeriod = settings?.late_grace_period !== undefined ? settings.late_grace_period : 15;
    const gracePeriodMs = gracePeriod * 60000;
    const currentNowMs = now.getTime();
    const isShiftRunning = currentNowMs >= (shiftStartMs - gracePeriodMs) && currentNowMs <= shiftEndMs;

    const isToday = currentShift.date === localTodayStr;
    const isClockedIntoShift = isClockedIn && activeSession?.shift_id && !activeSession.shift_id.startsWith('US_');
    return (isToday || isClockedIntoShift || isShiftRunning) ? currentShift : null;
  })();

  const todayShift = runningShift;
  const resolvedTimezone = resolveTimezone(userTimezone || user?.display_timezone);

  const isTimelineScheduled = todayShift && !isUnscheduledSession;

  // --- VISUAL TIMELINE CALCULATIONS ---
  const currentNowMs = now.getTime();

  let shiftStartMs = 0;
  let shiftEndMs = 0;
  if (todayShift) {
    shiftStartMs = todayShift.start_utc
      ? new Date(todayShift.start_utc).getTime()
      : toDate(`${todayShift.date}T${todayShift.start}:00`, { timeZone: resolvedTimezone }).getTime();
    shiftEndMs = todayShift.end_utc
      ? new Date(todayShift.end_utc).getTime()
      : toDate(`${todayShift.date}T${todayShift.end}:00`, { timeZone: resolvedTimezone }).getTime();
  }

  const logsToProcess = isTimelineScheduled
    ? todayLogs.filter((log: any) => todayShift?.id && String(log.shift_id) === String(todayShift.id))
    : (activeSession ? [activeSession] : []);
  const startMsList: number[] = [];
  const endMsList: number[] = [];

  logsToProcess.forEach((log: any) => {
    const checkInStr = log.check_in.endsWith('Z') ? log.check_in : log.check_in.replace(' ', 'T') + 'Z';
    startMsList.push(new Date(checkInStr).getTime());

    if (log.check_out) {
      const checkOutStr = log.check_out.endsWith('Z') ? log.check_out : log.check_out.replace(' ', 'T') + 'Z';
      endMsList.push(new Date(checkOutStr).getTime());
    } else {
      endMsList.push(currentNowMs);
    }
  });

  // Calculate timeline start and end boundaries
  let timelineStartMs = isTimelineScheduled ? shiftStartMs : currentNowMs;
  if (!isTimelineScheduled) {
    if (startMsList.length > 0) {
      timelineStartMs = Math.min(timelineStartMs, ...startMsList);
    }
  }

  let timelineEndMs = isTimelineScheduled ? shiftEndMs : currentNowMs;
  if (!isTimelineScheduled) {
    if (endMsList.length > 0) {
      timelineEndMs = Math.max(timelineEndMs, ...endMsList);
    }
    if (currentNowMs > timelineEndMs) {
      timelineEndMs = currentNowMs;
    }
  }

  const activeDurationRaw = currentNowMs - timelineStartMs;

  if (!isTimelineScheduled) {
    const minDurationMs = 60000; // 1 minute
    const activeDuration = Math.max(activeDurationRaw, minDurationMs);
    timelineEndMs = timelineStartMs + activeDuration * 1.1;
  }

  const totalDuration = timelineEndMs - timelineStartMs;
  const showLeftLabel = isTimelineScheduled || (activeDurationRaw >= 60000);

  // Collect all boundary points to partition the timeline
  const boundaryPointsSet = new Set<number>();
  if (isTimelineScheduled) {
    boundaryPointsSet.add(shiftStartMs);
    boundaryPointsSet.add(shiftEndMs);
  }
  boundaryPointsSet.add(currentNowMs);
  boundaryPointsSet.add(timelineStartMs);
  boundaryPointsSet.add(timelineEndMs);

  logsToProcess.forEach((log: any) => {
    const checkInStr = log.check_in.endsWith('Z') ? log.check_in : log.check_in.replace(' ', 'T') + 'Z';
    const logStart = new Date(checkInStr).getTime();
    boundaryPointsSet.add(logStart);

    let logEnd = currentNowMs;
    if (log.check_out) {
      const checkOutStr = log.check_out.endsWith('Z') ? log.check_out : log.check_out.replace(' ', 'T') + 'Z';
      logEnd = new Date(checkOutStr).getTime();
    }
    boundaryPointsSet.add(logEnd);

    const sessionBreaks = log.breaks || [];
    sessionBreaks.forEach((b: any) => {
      const bStart = getTimestamp(b.start_time);
      const bEnd = b.end_time ? getTimestamp(b.end_time) : (log.check_out ? getTimestamp(log.check_out) : currentNowMs);
      boundaryPointsSet.add(bStart);
      boundaryPointsSet.add(bEnd);
    });
  });

  const sortedPoints = Array.from(boundaryPointsSet)
    .filter(t => t >= timelineStartMs && t <= timelineEndMs)
    .sort((a, b) => a - b);

  // Helper check functions
  const isInsideBreak = (t: number) => {
    return logsToProcess.some((log: any) => {
      const sessionBreaks = log.breaks || [];
      return sessionBreaks.some((b: any) => {
        const bStart = getTimestamp(b.start_time);
        const bEnd = b.end_time ? getTimestamp(b.end_time) : (log.check_out ? getTimestamp(log.check_out) : currentNowMs);
        return t >= bStart && t <= bEnd;
      });
    });
  };

  const isInsideWork = (t: number) => {
    return logsToProcess.some((log: any) => {
      const checkInStr = log.check_in.endsWith('Z') ? log.check_in : log.check_in.replace(' ', 'T') + 'Z';
      const logStart = new Date(checkInStr).getTime();
      let logEnd = currentNowMs;
      if (log.check_out) {
        const checkOutStr = log.check_out.endsWith('Z') ? log.check_out : log.check_out.replace(' ', 'T') + 'Z';
        logEnd = new Date(checkOutStr).getTime();
      }
      return t >= logStart && t <= logEnd;
    });
  };

  type SegmentType = 'work' | 'break' | 'missed' | 'remaining' | 'overtime' | 'none';

  const classifyInterval = (t: number): SegmentType => {
    if (isInsideBreak(t)) return 'break';

    if (isInsideWork(t)) {
      if (isTimelineScheduled) {
        if (t >= shiftStartMs && t <= shiftEndMs) {
          return 'work';
        }
        return 'overtime';
      }
      return 'overtime';
    }

    // Not working/break
    if (isTimelineScheduled) {
      if (t >= shiftStartMs && t <= shiftEndMs) {
        return t < currentNowMs ? 'missed' : 'remaining';
      }
    }
    return 'none';
  };

  // Generate segments
  const segments: { type: SegmentType; widthPct: number }[] = [];
  let workedMins = 0;
  let breakMins = 0;
  let remainingMins = 0;

  sortedPoints.forEach((t2, idx) => {
    if (idx === 0) return;
    const t1 = sortedPoints[idx - 1];
    const duration = t2 - t1;
    if (duration <= 0) return;

    const t_mid = (t1 + t2) / 2;
    const type = classifyInterval(t_mid);

    const widthPct = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
    segments.push({ type, widthPct });

    // Calculate stats
    const durationMins = duration / 60000;
    if (type === 'work' || type === 'overtime') {
      workedMins += durationMins;
    } else if (type === 'break') {
      breakMins += durationMins;
    } else if (type === 'remaining') {
      remainingMins += durationMins;
    }
  });

  const nowPctRaw = totalDuration > 0 ? ((currentNowMs - timelineStartMs) / totalDuration) * 100 : 0;
  const nowPct = Math.max(0, Math.min(100, nowPctRaw));
  const startMarkerPct = totalDuration > 0 && isTimelineScheduled ? ((shiftStartMs - timelineStartMs) / totalDuration) * 100 : 0;
  const endMarkerPct = totalDuration > 0 && isTimelineScheduled ? ((shiftEndMs - timelineStartMs) / totalDuration) * 100 : 0;

  const gracePeriod = settings?.late_grace_period !== undefined ? settings.late_grace_period : 15;
  const gracePeriodMs = gracePeriod * 60000;
  const isShiftRunningNow = todayShift && currentNowMs >= (shiftStartMs - gracePeriodMs) && currentNowMs <= shiftEndMs;
  const shouldShowTimeline = isClockedIn || isShiftRunningNow;

  let targetShiftType: 'scheduled' | 'unscheduled' = 'unscheduled';
  let targetShiftTimes = '';
  let targetShiftNotice = '';

  if (!isClockedIn) {
    if (isShiftRunningNow) {
      targetShiftType = 'scheduled';
      targetShiftTimes = `${formatShiftTime(todayShift.start, todayShift.start_utc)} - ${formatShiftTime(todayShift.end, todayShift.end_utc)}`;
      targetShiftNotice = 'Clocking in now will record hours under your rostered shift.';
    } else {
      targetShiftType = 'unscheduled';
      targetShiftTimes = 'Unscheduled Overtime';
      targetShiftNotice = 'Clocking in now will start an unscheduled overtime session.';
    }
  } else {
    // Clocked in
    if (isUnscheduledSession || !todayShift) {
      targetShiftType = 'unscheduled';
      targetShiftTimes = 'Unscheduled Overtime';
      targetShiftNotice = 'You are currently working an unscheduled overtime shift.';
    } else {
      targetShiftType = 'scheduled';
      targetShiftTimes = `${formatShiftTime(todayShift.start, todayShift.start_utc)} - ${formatShiftTime(todayShift.end, todayShift.end_utc)}`;
      targetShiftNotice = 'You are currently working your scheduled shift.';
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.timelineCard}>
        {/* Status Header */}
        <View style={styles.timelineHeader}>
          <View>
            <Text style={styles.timelineTitle}>Daily Attendance</Text>
          </View>
          <View style={[styles.statusBadge, currentStatus === 'working' ? styles.statusWorking : currentStatus === 'away' ? styles.statusAway : styles.statusNone]}>
            {currentStatus === 'working' && <Play size={12} color={colors.success} style={{ marginRight: 4 }} />}
            {currentStatus === 'away' && <Pause size={12} color={colors.warning} style={{ marginRight: 4 }} />}
            <Text style={[styles.statusText, currentStatus === 'working' ? styles.statusTextWorking : currentStatus === 'away' ? styles.statusTextAway : styles.statusTextNone]}>
              {currentStatus === 'working' ? 'Working' : currentStatus === 'away' ? 'Away' : 'Not Working'}
            </Text>
          </View>
        </View>

        {/* Active Shift Info */}
        <View style={styles.shiftInfoCard}>
          <View style={styles.shiftInfoRow}>
            <Text style={styles.shiftInfoLabel}>
              {isClockedIn ? 'Active Shift' : 'Target Shift'}
            </Text>
            <View style={[styles.shiftInfoBadge, targetShiftType === 'scheduled' ? styles.badgeScheduled : styles.badgeUnscheduled]}>
              <Text style={[styles.shiftInfoBadgeText, targetShiftType === 'scheduled' ? styles.badgeTextScheduled : styles.badgeTextUnscheduled]}>
                {targetShiftType === 'scheduled' ? 'Scheduled' : 'Unscheduled'}
              </Text>
            </View>
          </View>
          <Text style={styles.shiftInfoValue}>
            {targetShiftTimes}
          </Text>
          <Text style={styles.shiftInfoNotice}>
            {targetShiftNotice}
          </Text>
        </View>

        {shouldShowTimeline && (
          <>
            {/* The Visual Timeline */}
            {totalDuration > 0 ? (
              <>
                <View style={styles.timelineWrapper}>
                  <View style={styles.timelineTrack}>
                    {segments.map((seg, idx) => {
                      let segStyle = {};
                      if (seg.type === 'work') segStyle = styles.segmentWorked;
                      else if (seg.type === 'break') segStyle = styles.segmentBreak;
                      else if (seg.type === 'missed') segStyle = styles.segmentMissed;
                      else if (seg.type === 'remaining') segStyle = styles.segmentRemaining;
                      else if (seg.type === 'overtime') segStyle = styles.segmentOvertime;
                      else if (seg.type === 'none') segStyle = styles.segmentNone;

                      return (
                        <View
                          key={idx}
                          style={[styles.timelineSegment, segStyle, { width: `${seg.widthPct}%` }]}
                        />
                      );
                    })}
                  </View>

                  {/* Visual Shift Markers (Only for scheduled shift) */}
                  {isTimelineScheduled && (
                    <>
                      {timelineStartMs < shiftStartMs && (
                        <View style={[styles.shiftMarker, { left: `${startMarkerPct}%` }]} />
                      )}
                      {timelineEndMs > shiftEndMs && (
                        <View style={[styles.shiftMarker, { left: `${endMarkerPct}%` }]} />
                      )}
                    </>
                  )}

                  {/* "Now" Indicator (Minimalist arrow pointer) */}
                  <View style={[styles.nowIndicator, { left: `${nowPct}%` }]}>
                    <Animated.View style={[styles.nowIndicatorArrow, { opacity: pulseAnim }]} />
                    <Text style={styles.nowTimeLabel}>
                      {formatDisplayTime(currentNowMs, userTimezone, 'HH:mm')}
                    </Text>
                  </View>
                </View>

                {/* Timeline Labels */}
                <View style={styles.timelineLabels}>
                  <Text style={styles.timelineLabelText}>
                    {showLeftLabel && (startMsList.length > 0 || isTimelineScheduled) ? formatDisplayTime(timelineStartMs, userTimezone, 'HH:mm') : ''}
                  </Text>
                  <Text style={styles.timelineLabelText}>
                    {isTimelineScheduled ? formatDisplayTime(timelineEndMs, userTimezone, 'HH:mm') : ''}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.emptyTimelineContainer}>
                <Clock size={18} color={colors.subtext} />
                <Text style={styles.emptyTimelineText}>Clock in to start tracking your daily progress.</Text>
              </View>
            )}

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <View style={[styles.statDot, { backgroundColor: isTimelineScheduled ? colors.success : colors.unscheduled }]} />
                <View>
                  <Text style={styles.statLabel}>{isTimelineScheduled ? 'Worked' : 'Overtime'}</Text>
                  <Text style={styles.statValue}>{formatDuration(Math.floor(workedMins))}</Text>
                </View>
              </View>
              {isTimelineScheduled && (
                <>
                  <View style={styles.statBox}>
                    <View style={[styles.statDot, { backgroundColor: colors.warning }]} />
                    <View>
                      <Text style={styles.statLabel}>Break</Text>
                      <Text style={styles.statValue}>{formatDuration(Math.floor(breakMins))}</Text>
                    </View>
                  </View>
                  <View style={styles.statBox}>
                    <View style={[styles.statDot, { backgroundColor: colors.timelineRemaining }]} />
                    <View>
                      <Text style={styles.statLabel}>Remaining</Text>
                      <Text style={styles.statValue}>{formatDuration(Math.floor(remainingMins))}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Break Info */}
            {isTimelineScheduled && (
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
            )}

            {currentStatus === 'away' && currentShift && isTimelineScheduled && (
              <View style={styles.breakInfoContainer}>
                <Text style={styles.breakWarningText}>
                  Your break will end automatically at {formatShiftTime(currentShift.end_time || currentShift.end, currentShift.end_utc)}.
                </Text>
              </View>
            )}
          </>
        )}

        <Text style={styles.radiusWarning}>
          Make sure you are within the workplace radius before clocking in or out.
        </Text>

        <View style={styles.buttonRow}>
          {isTampered ? (
            <View style={styles.tamperContainer}>
              <AlertCircle color={colors.danger} size={24} style={{ marginBottom: 8 }} />
              <Text style={styles.tamperTitle}>Device Time Out of Sync</Text>
              <Text style={styles.tamperText}>
                Please set your phone's Date & Time to 'Automatic' to log attendance.
              </Text>
            </View>
          ) : (
            <>
              {!isClockedIn ? (
                <TouchableOpacity
                  style={[styles.clockButton, styles.clockInButton, loading && styles.disabledButton]}
                  onPress={() => handleClock('check_in')}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock In</Text>}
                </TouchableOpacity>
              ) : (
                <>
                  {currentStatus === 'working' && !isUnscheduledSession && (
                    <TouchableOpacity
                      style={[styles.clockButton, styles.stepAwayButton, loading && styles.disabledButton]}
                      onPress={handleStepAway}
                      disabled={loading}
                    >
                      <Pause color="#fff" size={20} style={{ marginRight: 8 }} />
                      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Step Away</Text>}
                    </TouchableOpacity>
                  )}
                  {currentStatus === 'away' && !isUnscheduledSession && (
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
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  timelineSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.subtext,
    lineHeight: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusWorking: {
    backgroundColor: colors.successBg,
  },
  statusAway: {
    backgroundColor: colors.warningBg,
  },
  statusNone: {
    backgroundColor: colors.card,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusTextWorking: {
    color: colors.success,
  },
  statusTextAway: {
    color: colors.warning,
  },
  statusTextNone: {
    color: colors.subtext,
  },
  shiftInfoCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shiftInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  shiftInfoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shiftInfoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeScheduled: {
    backgroundColor: colors.successBg,
  },
  badgeUnscheduled: {
    backgroundColor: colors.unscheduledBg,
  },
  shiftInfoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  badgeTextScheduled: {
    color: colors.success,
  },
  badgeTextUnscheduled: {
    color: colors.unscheduled,
  },
  shiftInfoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  shiftInfoNotice: {
    fontSize: 11,
    color: colors.subtext,
    marginTop: 8,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  emptyTimelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: 20,
    gap: 8,
  },
  emptyTimelineText: {
    fontSize: 13,
    color: colors.subtext,
    fontWeight: '500',
  },
  timelineWrapper: {
    position: 'relative',
    height: 42,
    marginBottom: 4,
  },
  timelineTrack: {
    flexDirection: 'row',
    height: 12,
    backgroundColor: colors.timelineTrackBg,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 10,
  },
  timelineSegment: {
    height: '100%',
  },
  segmentWorked: {
    backgroundColor: colors.success,
  },
  segmentBreak: {
    backgroundColor: colors.warning,
  },
  segmentMissed: {
    backgroundColor: colors.timelineMissed,
  },
  segmentRemaining: {
    backgroundColor: colors.timelineRemaining,
  },
  segmentOvertime: {
    backgroundColor: colors.unscheduled,
  },
  segmentNone: {
    backgroundColor: colors.timelineNone,
  },
  shiftMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.timelineMarker,
    marginTop: 10,
    height: 12,
    zIndex: 5,
  },
  nowIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    alignItems: 'center',
    zIndex: 15,
  },
  nowIndicatorArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 0,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ef4444',
    position: 'absolute',
    top: 22,
    zIndex: 20,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 16,
  },
  nowTimeLabel: {
    position: 'absolute',
    top: 30,
    fontSize: 11,
    fontWeight: '800',
    color: '#ef4444',
    width: 60,
    textAlign: 'center',
  },
  timelineLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.subtext,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    color: colors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  breakInfoContainer: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  breakInfoText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  breakWarningText: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 4,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  radiusWarning: {
    fontSize: 12,
    color: colors.subtext,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  tamperContainer: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  tamperTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.danger,
    marginBottom: 4,
  },
  tamperText: {
    fontSize: 13,
    color: colors.danger,
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
    backgroundColor: colors.success,
  },
  clockOutButton: {
    backgroundColor: colors.danger,
  },
  stepAwayButton: {
    backgroundColor: colors.warning,
  },
  resumeButton: {
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
