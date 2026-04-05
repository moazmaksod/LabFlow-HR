import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useNetworkStore } from '../store/useNetworkStore';


export default function LiveServerClock() {
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset);
  const timezone = useNetworkStore((state) => state.serverTimezone);

  const [displayTime, setDisplayTime] = useState("");
  const [displayDate, setDisplayDate] = useState("");

  const shadowTimeRef = useRef(Date.now() + serverTimeOffset);

  useEffect(() => {
    shadowTimeRef.current = Date.now() + serverTimeOffset;

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });

    const dateFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "short"
    });

    const updateDisplay = () => {
      const now = new Date(shadowTimeRef.current);
      setDisplayTime(formatter.format(now));
      setDisplayDate(dateFormatter.format(now));
    };

    updateDisplay();

    const interval = setInterval(() => {
      shadowTimeRef.current += 1000;
      updateDisplay();
    }, 1000);
    return () => clearInterval(interval);
  }, [serverTimeOffset, timezone]);

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.timeRow}>
          <Globe size={14} color="#71717a" style={styles.icon} />
          <Text style={styles.text}>
            {displayTime} ({timezone})
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
