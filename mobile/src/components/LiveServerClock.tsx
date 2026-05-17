import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useNetworkStore } from '../store/useNetworkStore';
import { useAuthStore } from '../store/useAuthStore';
import { getMobileNow, resolveTimezone, formatDisplayTime, formatDisplayDate } from '../lib/timeManager';

export default function LiveServerClock() {
  const serverTimezone = useNetworkStore((state) => state.serverTimezone);
  const user = useAuthStore((state) => state.user);
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset); // just to trigger re-renders if it changes

  const [displayTime, setDisplayTime] = useState("");
  const [displayDate, setDisplayDate] = useState("");

  const displayTimezone = resolveTimezone(user?.display_timezone);

  useEffect(() => {
    const updateDisplay = () => {
      try {
        const now = new Date(getMobileNow());
        setDisplayTime(formatDisplayTime(now, user?.display_timezone, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }));
        setDisplayDate(formatDisplayDate(now, user?.display_timezone, { weekday: "long", day: "numeric", month: "short" }));
      } catch (error) {
        setDisplayTime(formatDisplayTime(new Date(), user?.display_timezone, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }));
      }
    };

    updateDisplay();

    const interval = setInterval(() => {
      updateDisplay();
    }, 1000);

    return () => clearInterval(interval);
  }, [displayTimezone, serverTimeOffset]); // re-run if timezone or offset explicitly updates

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
