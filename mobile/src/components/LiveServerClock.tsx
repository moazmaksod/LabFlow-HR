import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useNetworkStore } from '../store/useNetworkStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getMobileNow, resolveTimezone, formatDisplayTime, formatDisplayDate, is12HourSystem } from '../lib/timeManager';
import { useThemeColors } from '../hooks/useTheme';

export default function LiveServerClock() {
  const userTimezone = useSettingsStore((state) => state.userTimezone);
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset); // just to trigger re-renders if it changes
  const { colors } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [displayTime, setDisplayTime] = useState("");
  const [displayDate, setDisplayDate] = useState("");

  const displayTimezone = resolveTimezone(userTimezone);

  useEffect(() => {
    const updateDisplay = () => {
      const nowIso = getMobileNow();

      const timeFormat = is12HourSystem() ? 'hh:mm:ss a' : 'HH:mm:ss';
      const dateFormat = 'EEEE, MMM d';

      // 1. Primary formatting attempt using server-synchronized monotonic time
      let timeStr = formatDisplayTime(nowIso, userTimezone, timeFormat);
      let dateStr = formatDisplayDate(nowIso, userTimezone, dateFormat);

      // 2. Defensive Check: If baseline strings return default failure placeholders, shift atomic sync to local fallback
      if (timeStr === '-' || dateStr === '-') {
        const localFallback = new Date();
        timeStr = formatDisplayTime(localFallback, userTimezone, timeFormat);
        dateStr = formatDisplayDate(localFallback, userTimezone, dateFormat);
      }

      // 3. Safely commit sanitized strings to high-frequency state hooks
      setDisplayTime(timeStr);
      setDisplayDate(dateStr);
    };

    updateDisplay();

    // High-frequency 1-second ticks for live tracking
    const interval = setInterval(updateDisplay, 1000);

    return () => clearInterval(interval);
  }, [displayTimezone, serverTimeOffset, userTimezone]);

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.timeRow}>
          <Globe size={14} color={colors.subtext} style={styles.icon} />
          <Text style={styles.text}>
            {displayTime} ({displayTimezone})
          </Text>
        </View>
        {displayDate ? (
          <Text style={styles.dateText}>{displayDate}</Text>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  innerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: 13,
    color: colors.subtext,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  dateText: {
    fontSize: 11,
    color: colors.subtext,
    marginTop: 2,
    fontWeight: "500",
  },
});
