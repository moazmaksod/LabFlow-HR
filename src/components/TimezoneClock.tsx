import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { Clock } from 'lucide-react';

export default function TimezoneClock() {

  const { token, serverTimeOffset } = useAuthStore();
  const [time, setTime] = useState<string>('');
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
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: selectedTimezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });

        const dateFormatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: selectedTimezone,
          weekday: 'long',
          day: 'numeric',
          month: 'short'
        });

        setTime(`${formatter.format(now)}\n${dateFormatter.format(now)}`);
      } catch (error) {
        // Fallback if timezone is invalid
        setTime(new Date().toLocaleTimeString());
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, [settings?.company_timezone]);

  if (!time) return null;

  const [timeStr, dateStr] = time.includes('\n') ? time.split('\n') : [time, ''];

  return (
    <div className="flex flex-col px-3 py-1.5 rounded-md bg-muted/50 text-sm font-medium text-muted-foreground border border-border items-center justify-center">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span>{timeStr}</span>
        <span className="text-xs opacity-70 ml-1">({settings?.company_timezone || 'UTC'})</span>
      </div>
      {dateStr && (
        <span className="text-xs opacity-80 mt-0.5">{dateStr}</span>
      )}
    </div>
  );
}
