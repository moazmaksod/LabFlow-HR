import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { Clock } from 'lucide-react';
import { getWebNow, resolveTimezone, formatDisplayTime } from '../lib/timeManager';

export default function TimezoneClock() {
  const { token, serverTimeOffset, user } = useAuthStore();
  const [time, setTime] = useState<string>('');

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await axios.get('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    }
  });

  useEffect(() => {
    const updateTime = () => {
      try {
        const nowIso = getWebNow();
        const timeStr = formatDisplayTime(nowIso, user?.display_timezone, 'hh:mm:ss a');
        const dateStr = formatDisplayTime(nowIso, user?.display_timezone, 'EEEE, d MMM');

        setTime(`${timeStr}\n${dateStr}`);
      } catch (error) {
        // Fallback if formatting fails
        setTime(new Date().toLocaleTimeString());
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [user?.display_timezone, settings?.company_timezone, serverTimeOffset]);

  if (!time) return null;

  const [timeStr, dateStr] = time.includes('\n') ? time.split('\n') : [time, ''];
  const resolvedTimezoneStr = resolveTimezone(user?.display_timezone);

  return (
    <div className="flex flex-col px-3 py-1.5 rounded-md bg-muted/50 text-sm font-medium text-muted-foreground border border-border items-center justify-center">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span>{timeStr}</span>
        <span className="text-xs opacity-70 ml-1">({resolvedTimezoneStr})</span>
      </div>
      {dateStr && (
        <span className="text-xs opacity-80 mt-0.5">{dateStr}</span>
      )}
    </div>
  );
}
