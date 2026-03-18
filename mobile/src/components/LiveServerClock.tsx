import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe } from 'lucide-react-native';
import { useNetworkStore } from '../store/useNetworkStore';
import { useAttendanceStore } from '../store/useAttendanceStore';

export default function LiveServerClock() {
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset);
  const userProfile = useAttendanceStore((state) => state.userProfile);
  // Assuming timezone comes from userProfile or a default like UTC
  const timezone = userProfile?.timezone || 'UTC';

  const [displayTime, setDisplayTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const trueTime = new Date(Date.now() + serverTimeOffset);

      // Format to hh:mm:ss A
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      setDisplayTime(formatter.format(trueTime));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
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
