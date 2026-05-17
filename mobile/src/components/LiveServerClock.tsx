import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useNetworkStore } from '../store/useNetworkStore';
import { useAuthStore } from '../store/useAuthStore';
import { getMobileNow, resolveTimezone, formatDisplayTime, formatDisplayDate } from '../lib/timeManager';

export default function LiveServerClock() {
  const user = useAuthStore((state) => state.user);
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset); // just to trigger re-renders if it changes

  const [displayTime, setDisplayTime] = useState("");
  const [displayDate, setDisplayDate] = useState("");

  const displayTimezone = resolveTimezone(user?.display_timezone);

  useEffect(() => {
    const updateDisplay = () => {
      const nowIso = getMobileNow();

      // Configuration option hashes (Deterministic Cache Keys inside timeManager)
      const timeOptions: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true };
      const dateOptions: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "short" };

      // 1. Primary formatting attempt using server-synchronized monotonic time
      let timeStr = formatDisplayTime(nowIso, user?.display_timezone, timeOptions);
      let dateStr = formatDisplayDate(nowIso, user?.display_timezone, dateOptions);

      // 2. Defensive Check: If baseline strings return default failure placeholders, shift atomic sync to local fallback
      if (timeStr === '--:--' || dateStr === '--/--/----') {
        const localFallback = new Date();
        timeStr = formatDisplayTime(localFallback, user?.display_timezone, timeOptions);
        dateStr = formatDisplayDate(localFallback, user?.display_timezone, dateOptions);
      }

      // 3. Safely commit sanitized strings to high-frequency state hooks
      setDisplayTime(timeStr);
      setDisplayDate(dateStr);
    };

    updateDisplay();

    // High-frequency 1-second ticks for live tracking
    const interval = setInterval(updateDisplay, 1000);

    return () => clearInterval(interval);
  }, [displayTimezone, serverTimeOffset]);

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.timeRow}>
          <Globe size={14} color="#71717a" style={styles.icon} />
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

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    backgroundColor: "#f4f4f5",
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
    color: "#71717a",
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  dateText: {
    fontSize: 11,
    color: "#a1a1aa",
    marginTop: 2,
    fontWeight: "500",
  },
});
