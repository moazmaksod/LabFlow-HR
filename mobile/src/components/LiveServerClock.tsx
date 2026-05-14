import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useNetworkStore } from '../store/useNetworkStore';
import { useAuthStore } from '../store/useAuthStore';
import { getMobileNow } from '../lib/timeManager';

export default function LiveServerClock() {
  const serverTimezone = useNetworkStore((state) => state.serverTimezone);
  const user = useAuthStore((state) => state.user);
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset); // just to trigger re-renders if it changes

  const [displayTime, setDisplayTime] = useState("");
  const [displayDate, setDisplayDate] = useState("");

  const displayTimezone = user?.display_timezone ? user.display_timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: displayTimezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });

    const dateFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: displayTimezone,
      weekday: "long",
      day: "numeric",
      month: "short"
    });

    const updateDisplay = () => {
      try {
        const now = new Date(getMobileNow());
        setDisplayTime(formatter.format(now));
        setDisplayDate(dateFormatter.format(now));
      } catch (error) {
        setDisplayTime(new Date().toLocaleTimeString());
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
