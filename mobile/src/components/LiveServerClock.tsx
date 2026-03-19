import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useNetworkStore } from '../store/useNetworkStore';


export default function LiveServerClock() {
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset);
  const timezone = useNetworkStore((state) => state.serverTimezone);

  const [displayTime, setDisplayTime] = useState('');

  const shadowTimeRef = useRef(Date.now() + serverTimeOffset);

  useEffect(() => {
    // Re-sync shadow ref when dependency updates (e.g. app wakes up and syncs)
    shadowTimeRef.current = Date.now() + serverTimeOffset;

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    // Initial setting
    setDisplayTime(formatter.format(new Date(shadowTimeRef.current)));

    const interval = setInterval(() => {
      shadowTimeRef.current += 1000;
      setDisplayTime(formatter.format(new Date(shadowTimeRef.current)));
    }, 1000);
    return () => clearInterval(interval);
  }, [serverTimeOffset, timezone]);

  return (
    <View style={styles.container}>
      <Globe size={14} color="#71717a" style={styles.icon} />
      <Text style={styles.text}>
        {displayTime} ({timezone})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#f4f4f5',
    borderRadius: 8,
    marginBottom: 16,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: 13,
    color: '#71717a',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
