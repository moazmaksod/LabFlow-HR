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
      return res.data;
    }
  });

  useEffect(() => {

    const selectedTimezone = settings?.company_timezone || 'UTC';
    shadowTimeRef.current = Date.now() + (serverTimeOffset || 0);
    
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
        setTime(formatter.format(now));
      } catch (error) {
        // Fallback if timezone is invalid
        setTime(new Date().toLocaleTimeString());
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, [settings?.company_timezone, serverTimeOffset]);

  if (!time) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 text-sm font-medium text-muted-foreground border border-border">
      <Clock className="w-4 h-4" />
      <span>{time}</span>
      <span className="text-xs opacity-70 ml-1">({settings?.company_timezone || 'UTC'})</span>
    </div>
  );
}
