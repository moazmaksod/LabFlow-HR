import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Clock, Copy, Trash2, AlertCircle, Info, ChevronRight, ChevronLeft } from 'lucide-react';
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
const HOURS = Array.from({ length: 37 }, (_, i) => i); // 0 to 36 hours for overflow
const HOUR_WIDTH = 80; // pixels per hour
const SNAP_INTERVAL = 15; // minutes
const SNAP_PIXELS = (SNAP_INTERVAL / 60) * HOUR_WIDTH;

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
  const [isMoving, setIsMoving] = useState<{ day: string, index: number, startOffset: number } | null>(null);
  const [isResizing, setIsResizing] = useState<{ day: string, index: number, type: 'start' | 'end' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!scrollRef.current) return;

    if (isMoving) {
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      const currentMinutes = Math.floor((x - isMoving.startOffset) / SNAP_PIXELS) * SNAP_INTERVAL;
      
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

    if (isResizing) {
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      const currentMinutes = Math.floor(x / SNAP_PIXELS) * SNAP_INTERVAL;
      
      const newSchedule = { ...schedule };
      const shift = newSchedule[isResizing.day][isResizing.index];
      
      if (isResizing.type === 'start') {
        shift.start = minutesToTime(Math.max(0, Math.min(1440 - 15, currentMinutes)));
      } else {
        shift.end = minutesToTime(currentMinutes % 1440);
      }
      
      onChange(newSchedule);
    }
  }, [isMoving, isResizing, schedule, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsMoving(null);
    setIsResizing(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const addShift = (day: string, startMinutes: number = 480) => { // Default 08:00
    const newSchedule = { ...schedule };
    newSchedule[day] = [
      ...newSchedule[day],
      { start: minutesToTime(startMinutes), end: minutesToTime((startMinutes + 480) % 1440) }
    ];
    onChange(newSchedule);
  };

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
    <div className="flex flex-col h-full bg-background border border-border rounded-2xl overflow-hidden shadow-xl" ref={containerRef}>
      {/* Header Controls */}
      <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-lg tracking-tight">Weekly Timeline Builder</h3>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Gantt-Style Shift Management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={clearWeek}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-rose-100"
          >
            <Trash2 className="w-4 h-4" /> Clear Entire Week
          </button>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto custom-scrollbar relative" ref={scrollRef}>
          <div className="min-w-max">
            {/* Time Header */}
            <div className="flex sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
              <div className="w-40 flex-shrink-0 border-r border-border bg-muted/20 p-4 flex items-center justify-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Day / Time</span>
              </div>
              <div className="flex">
                {HOURS.map(hour => (
                  <div 
                    key={hour} 
                    className={`w-[80px] h-12 flex flex-col items-center justify-center border-r border-border/50 relative ${hour >= 24 ? 'bg-indigo-500/5' : ''}`}
                  >
                    <span className={`text-[11px] font-mono font-bold ${hour >= 24 ? 'text-indigo-600' : 'text-muted-foreground'}`}>
                      {(hour % 24).toString().padStart(2, '0')}:00
                    </span>
                    {hour === 24 && (
                      <div className="absolute -top-1 px-1.5 py-0.5 bg-indigo-600 text-white text-[8px] font-black rounded-full uppercase tracking-tighter">
                        Midnight
                      </div>
                    )}
                    {hour > 24 && (
                      <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter mt-0.5">+1 Day</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Days Rows */}
            <div className="divide-y divide-border">
              {DAYS.map(day => (
                <div key={day} className="flex group/row">
                  {/* Day Label */}
                  <div className="w-40 flex-shrink-0 border-r border-border bg-muted/10 p-4 flex flex-col justify-center gap-2 sticky left-0 z-20 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black uppercase tracking-widest text-foreground">{day.substring(0, 3)}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button 
                          onClick={() => copySchedule(day)}
                          title="Apply to all days"
                          className="p-1.5 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-lg transition-all"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => clearDay(day)}
                          title="Clear day"
                          className="p-1.5 hover:bg-rose-100 text-muted-foreground hover:text-rose-600 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row Content */}
                  <div 
                    className="flex-1 relative h-24 bg-grid-slate-100/[0.03] cursor-pointer"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const minutes = Math.floor(x / SNAP_PIXELS) * SNAP_INTERVAL;
                        addShift(day, minutes);
                      }
                    }}
                  >
                    {/* Hour Vertical Lines */}
                    {HOURS.map(hour => (
                      <div 
                        key={hour} 
                        className={`absolute top-0 bottom-0 border-r border-border/30 pointer-events-none ${hour % 6 === 0 ? 'border-border/60' : ''}`}
                        style={{ left: hour * HOUR_WIDTH }}
                      />
                    ))}

                    {/* Shift Bars */}
                    {schedule[day].map((shift, index) => {
                      const startMin = timeToMinutes(shift.start);
                      const endMin = timeToMinutes(shift.end);
                      const isNightShift = endMin < startMin;
                      const duration = isNightShift ? (1440 - startMin + endMin) : (endMin - startMin);
                      
                      return (
                        <div
                          key={index}
                          className={`absolute top-4 bottom-4 rounded-xl border shadow-lg group/shift transition-all hover:scale-[1.02] active:scale-[0.98] z-10 flex flex-col justify-center px-4 overflow-hidden ${
                            isNightShift 
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-400 text-white' 
                              : 'bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-400 text-white'
                          }`}
                          style={{ 
                            left: (startMin / 60) * HOUR_WIDTH, 
                            width: (duration / 60) * HOUR_WIDTH,
                            cursor: isMoving ? 'grabbing' : 'grab'
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setIsMoving({ day, index, startOffset: e.clientX - rect.left });
                          }}
                        >
                          {/* Resize Handles */}
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/20 z-20"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setIsResizing({ day, index, type: 'start' });
                            }}
                          />
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/20 z-20"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setIsResizing({ day, index, type: 'end' });
                            }}
                          />

                          {/* Shift Info */}
                          <div className="flex items-center justify-between gap-2 pointer-events-none">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-black uppercase tracking-tighter leading-none">
                                {shift.start} — {shift.end}
                              </span>
                              <span className="text-[9px] font-bold opacity-80 uppercase tracking-widest mt-1">
                                {isNightShift ? 'Night Shift (+1d)' : 'Standard Shift'}
                              </span>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeShift(day, index);
                              }}
                              className="pointer-events-auto p-1.5 hover:bg-white/20 rounded-lg transition-all opacity-0 group-hover/shift:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Legend */}
      <div className="p-4 border-t border-border bg-muted/30 flex flex-wrap items-center gap-8 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-md" />
          <span>Standard Shift</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-md" />
          <span>Night Shift (Cross-Midnight)</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Info className="w-4 h-4 text-primary" />
          <span>Click row to add • Drag to move • Edges to resize • Snaps to 15m</span>
        </div>
      </div>
    </div>
  );
};
