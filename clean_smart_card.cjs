const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'mobile/src/components/SmartAttendanceCard.tsx');
let content = fs.readFileSync(file, 'utf8');

// The file has duplicates. Let's fix it by completely replacing the top section until `const todayShift = currentShift;`

const topSectionRegex = /^[\s\S]*?(?=const todayShift = currentShift;)/;

const newTopSection = `import React, { useState, useEffect } from 'react';
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
  return \`\${h}h \${m}m\`;
};

const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return \`\${h12}:\${m.toString().padStart(2, '0')} \${ampm}\`;
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

  const getTrueTime = () => new Date(Date.now() + serverTimeOffset);
  const [now, setNow] = useState(getTrueTime);

  useEffect(() => {
    // Real-Time Tick (The Engine) - update every 30 seconds
    const interval = setInterval(() => {
      setNow(getTrueTime());
    }, 30000);
    return () => clearInterval(interval);
  }, [serverTimeOffset]);

  // Check if clock is tampered
  // Threshold: If serverTimeOffset is more than 2 minutes, meaning the phone is not using Automatic Network Time.
  // Or if Date.now() moved backwards before the lastLocalSyncTime.
  const isTimeTampered = Math.abs(serverTimeOffset) > 120000 || Date.now() < lastLocalSyncTime;

  `;

content = content.replace(topSectionRegex, newTopSection);
fs.writeFileSync(file, content);
