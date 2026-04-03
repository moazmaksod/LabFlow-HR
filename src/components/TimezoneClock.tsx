import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { Clock } from 'lucide-react';

export default function TimezoneClock() {

  const { token, serverTimeOffset } = useAuthStore();
  const [time, setTime] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const shadowTimeRef = useRef(Date.now() + (serverTimeOffset || 0));

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await axios.get('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });

      const serverDateStr = res.headers.date; // الوقت الفعلي للسيرفر لحظة الرد
      if (serverDateStr) {
        const serverTime = new Date(serverDateStr).getTime();
        const offset = serverTime - Date.now();
        shadowTimeRef.current = Date.now() + offset; // تحديث "ساعة الظل" فوراً
      }

      return res.data;
    }
  });

  useEffect(() => {

    const selectedTimezone = settings?.company_timezone || 'UTC';

    const updateTime = () => {
      try {
        shadowTimeRef.current += 1000;
        const now = new Date(shadowTimeRef.current);
        const timeFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: selectedTimezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: selectedTimezone,
          weekday: 'long',
          day: 'numeric',
          month: 'short'
        });
        setTime(timeFormatter.format(now));
        setDateStr(dateFormatter.format(now));
      } catch (error) {
        // Fallback if timezone is invalid
        setTime(new Date().toLocaleTimeString());
        setDateStr(new Date().toLocaleDateString());
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [settings?.company_timezone]);

  if (!time) return null;

  return (
    <div className="flex flex-col items-end gap-0.5 px-3 py-1.5 rounded-md bg-muted/50 text-sm font-medium text-muted-foreground border border-border">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span>{time}</span>
        <span className="text-xs opacity-70 ml-1">({settings?.company_timezone || 'UTC'})</span>
      </div>
      {dateStr && <span className="text-xs opacity-80">{dateStr}</span>}
    </div>
  );
}
