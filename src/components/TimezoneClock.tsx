import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { Clock } from 'lucide-react';

export default function TimezoneClock() {
  const { token } = useAuthStore();
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
    const timezone = settings?.timezone || 'UTC';
    
    const updateTime = () => {
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
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
  }, [settings?.timezone]);

  if (!time) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 text-sm font-medium text-muted-foreground border border-border">
      <Clock className="w-4 h-4" />
      <span>{time}</span>
      <span className="text-xs opacity-70 ml-1">({settings?.timezone || 'UTC'})</span>
    </div>
  );
}
