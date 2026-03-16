import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Clock, Copy, Trash2, ChevronRight, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Shift {
  start: string;
  end: string;
}

interface WeeklySchedule {
  [key: string]: Shift[];
}

interface WeeklyScheduleBuilderProps {
  schedule: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60; // pixels per hour
const SNAP_INTERVAL = 15; // minutes
const SNAP_PIXELS = (SNAP_INTERVAL / 60) * HOUR_HEIGHT;

// Helper to convert time string (HH:mm) to minutes from midnight
const timeToMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Helper to convert minutes from midnight to time string (HH:mm)
const minutesToTime = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const WeeklyScheduleBuilder: React.FC<WeeklyScheduleBuilderProps> = ({ schedule, onChange }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMoving, setIsMoving] = useState<{ day: string, index: number, startOffset: number } | null>(null);
  const [isResizing, setIsResizing] = useState<{ day: string, index: number, type: 'start' | 'end' } | null>(null);
  const [drawStart, setDrawStart] = useState<{ day: string, minutes: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<number | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (day: string, e: React.MouseEvent) => {
    if (isMoving || isResizing) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.floor(y / SNAP_PIXELS) * SNAP_INTERVAL;
    
    setIsDrawing(true);
    setDrawStart({ day, minutes });
    setDrawEnd(minutes + 60); // Default 1 hour
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDrawing && drawStart && containerRef.current) {
      const dayColumn = document.getElementById(`col-${drawStart.day}`);
      if (dayColumn) {
        const rect = dayColumn.getBoundingClientRect();
        const y = e.clientY - rect.top;
        // Allow drawing up to 24 hours from start
        const currentMinutes = Math.floor(y / SNAP_PIXELS) * SNAP_INTERVAL;
        setDrawEnd(Math.max(0, Math.min(drawStart.minutes + 1439, currentMinutes)));
      }
    }

    if (isMoving && containerRef.current) {
      const dayColumn = document.getElementById(`col-${isMoving.day}`);
      if (dayColumn) {
        const rect = dayColumn.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const currentMinutes = Math.floor((y - isMoving.startOffset) / SNAP_PIXELS) * SNAP_INTERVAL;
        
        const newSchedule = { ...schedule };
        const shift = newSchedule[isMoving.day][isMoving.index];
        const startMin = timeToMinutes(shift.start);
        const endMin = timeToMinutes(shift.end);
        const duration = endMin < startMin ? (1440 - startMin + endMin) : (endMin - startMin);
        
        const newStart = Math.max(0, Math.min(1440 - 15, currentMinutes));
        const newEnd = (newStart + duration) % 1440;
        
        newSchedule[isMoving.day][isMoving.index] = {
          start: minutesToTime(newStart),
          end: minutesToTime(newEnd)
        };
        onChange(newSchedule);
      }
    }

    if (isResizing && containerRef.current) {
      const dayColumn = document.getElementById(`col-${isResizing.day}`);
      if (dayColumn) {
        const rect = dayColumn.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const currentMinutes = Math.floor(y / SNAP_PIXELS) * SNAP_INTERVAL;
        
        const newSchedule = { ...schedule };
        const shift = newSchedule[isResizing.day][isResizing.index];
        const startMin = timeToMinutes(shift.start);
        const endMin = timeToMinutes(shift.end);
        
        if (isResizing.type === 'start') {
          // Start can't go past end (unless it's a night shift, but resizing is tricky)
          // For simplicity, we'll allow it and the UI will handle the "Night Shift" toggle
          shift.start = minutesToTime(Math.max(0, Math.min(1440 - 15, currentMinutes)));
        } else {
          // End can go past midnight
          shift.end = minutesToTime(currentMinutes % 1440);
        }
        
        onChange(newSchedule);
      }
    }
  }, [isDrawing, drawStart, isMoving, isResizing, schedule, onChange]);

  const handleMouseUp = useCallback(() => {
    if (isDrawing && drawStart && drawEnd !== null) {
      const start = Math.min(drawStart.minutes, drawEnd);
      const end = Math.max(drawStart.minutes, drawEnd);
      
      if (end - start >= 15) {
        const newSchedule = { ...schedule };
        newSchedule[drawStart.day] = [
          ...newSchedule[drawStart.day],
          { start: minutesToTime(start), end: minutesToTime(end) }
        ];
        onChange(newSchedule);
      }
    }
    
    setIsDrawing(false);
    setDrawStart(null);
    setDrawEnd(null);
    setIsMoving(null);
    setIsResizing(null);
  }, [isDrawing, drawStart, drawEnd, schedule, onChange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const removeShift = (day: string, index: number) => {
    const newSchedule = { ...schedule };
    newSchedule[day] = newSchedule[day].filter((_, i) => i !== index);
    onChange(newSchedule);
  };

  const copySchedule = (fromDay: string) => {
    const shiftsToCopy = schedule[fromDay];
    const newSchedule = { ...schedule };
    DAYS.forEach(day => {
      if (day !== fromDay) {
        newSchedule[day] = [...shiftsToCopy];
      }
    });
    onChange(newSchedule);
  };

  const clearDay = (day: string) => {
    onChange({ ...schedule, [day]: [] });
  };

  const clearWeek = () => {
    const empty: WeeklySchedule = {};
    DAYS.forEach(day => empty[day] = []);
    onChange(empty);
  };

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header Controls */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-wider">Visual Schedule Builder</h3>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={clearWeek}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Week
          </button>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex flex-1 overflow-hidden relative" ref={containerRef}>
        {/* Time Labels */}
        <div className="w-16 border-right border-border bg-muted/10 flex-shrink-0 select-none">
          <div className="h-10 border-b border-border" /> {/* Header spacer */}
          <div className="relative" style={{ height: 1440 }}>
            {HOURS.map(hour => (
              <div 
                key={hour} 
                className="absolute w-full text-[10px] font-mono text-muted-foreground text-right pr-2"
                style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {/* Days Grid */}
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div className="flex min-w-[800px]">
            {DAYS.map(day => (
              <div key={day} className="flex-1 border-r border-border last:border-0 min-w-[120px]">
                {/* Day Header */}
                <div className="h-10 border-b border-border bg-muted/20 flex items-center justify-between px-2 sticky top-0 z-20">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">{day.substring(0, 3)}</span>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => copySchedule(day)}
                      title="Copy to all days"
                      className="p-1 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded transition-all"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => clearDay(day)}
                      title="Clear day"
                      className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Day Column Content */}
                <div 
                  id={`col-${day}`}
                  className="relative bg-grid-slate-100/[0.03] cursor-crosshair select-none"
                  style={{ height: 1440 }}
                  onMouseDown={(e) => handleMouseDown(day, e)}
                >
                  {/* Hour Lines */}
                  {HOURS.map(hour => (
                    <div 
                      key={hour} 
                      className="absolute w-full border-b border-border/30 pointer-events-none"
                      style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Existing Shifts */}
                  {schedule[day].map((shift, index) => {
                    const startMin = timeToMinutes(shift.start);
                    const endMin = timeToMinutes(shift.end);
                    const isNightShift = endMin < startMin;
                    const duration = isNightShift ? (1440 - startMin + endMin) : (endMin - startMin);
                    
                    return (
                      <div
                        key={index}
                        className={`absolute left-1 right-1 rounded-md border shadow-sm group transition-shadow hover:shadow-md z-10 ${
                          isNightShift ? 'bg-indigo-500/20 border-indigo-500/40' : 'bg-primary/10 border-primary/30'
                        }`}
                        style={{ 
                          top: (startMin / 60) * HOUR_HEIGHT, 
                          height: (duration / 60) * HOUR_HEIGHT,
                          cursor: isMoving ? 'grabbing' : 'grab'
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setIsMoving({ day, index, startOffset: e.clientY - rect.top });
                        }}
                      >
                        {/* Resize Handles */}
                        <div 
                          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/30 rounded-t-md z-20"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsResizing({ day, index, type: 'start' });
                          }}
                        />
                        <div 
                          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/30 rounded-b-md z-20"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsResizing({ day, index, type: 'end' });
                          }}
                        />

                        {/* Shift Info */}
                        <div className="p-1.5 overflow-hidden h-full flex flex-col justify-between pointer-events-none">
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-bold uppercase ${isNightShift ? 'text-indigo-700' : 'text-primary'}`}>
                              {shift.start} - {shift.end}
                            </span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeShift(day, index);
                              }}
                              className="pointer-events-auto p-0.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {isNightShift && (
                            <div className="flex items-center gap-1 text-[8px] font-bold text-indigo-600 uppercase">
                              <Info className="w-2 h-2" /> Night Shift (+1 Day)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Drawing Preview */}
                  {isDrawing && drawStart && drawStart.day === day && drawEnd !== null && (
                    <div 
                      className="absolute left-1 right-1 bg-primary/20 border border-primary/40 rounded-md pointer-events-none z-10"
                      style={{ 
                        top: (Math.min(drawStart.minutes, drawEnd) / 60) * HOUR_HEIGHT, 
                        height: (Math.abs(drawEnd - drawStart.minutes) / 60) * HOUR_HEIGHT 
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Legend */}
      <div className="p-3 border-t border-border bg-muted/10 flex items-center gap-6 text-[10px] font-medium text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-primary/10 border border-primary/30 rounded" />
          <span>Standard Shift</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-indigo-500/20 border border-indigo-500/40 rounded" />
          <span>Night Shift (Crosses Midnight)</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3 h-3" />
          <span>Click & Drag to draw shifts. Grab to move. Edges to resize.</span>
        </div>
      </div>
    </div>
  );
};
