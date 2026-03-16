import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Clock, Copy, Trash2, AlertCircle, Info, Plus, Minus, MousePointer2 } from 'lucide-react';
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
const SNAP_INTERVAL = 15; // minutes

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

// Helper to check if two shifts overlap
const isOverlapping = (s1: { start: number, end: number }, s2: { start: number, end: number }) => {
  return s1.start < s2.end && s2.start < s1.end;
};

export const WeeklyScheduleBuilder: React.FC<WeeklyScheduleBuilderProps> = ({ schedule, onChange }) => {
  const [zoomLevel, setZoomLevel] = useState(1); // 1: Fit, 2: Mid, 3: In
  const [isMoving, setIsMoving] = useState<{ day: string, index: number, startOffset: number, originalStart: number, originalEnd: number } | null>(null);
  const [isResizing, setIsResizing] = useState<{ day: string, index: number, type: 'start' | 'end', originalStart: number, originalEnd: number } | null>(null);
  const [collision, setCollision] = useState<{ day: string, index: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth - 120); // Subtract day label width
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Calculate hour width based on zoom level
  const hourWidth = useMemo(() => {
    const baseWidth = containerWidth / 30; // Fit 30 hours
    if (zoomLevel === 1) return baseWidth;
    if (zoomLevel === 2) return baseWidth * 2.5;
    return baseWidth * 6;
  }, [containerWidth, zoomLevel]);

  const snapPixels = (SNAP_INTERVAL / 60) * hourWidth;

  const getShiftRange = (shift: Shift) => {
    const start = timeToMinutes(shift.start);
    let end = timeToMinutes(shift.end);
    if (end <= start) end += 1440; // Handle night shift
    return { start, end };
  };

  const checkCollision = (day: string, start: number, end: number, excludeIndex: number) => {
    const dayShifts = schedule[day];
    return dayShifts.some((s, i) => {
      if (i === excludeIndex) return false;
      return isOverlapping({ start, end }, getShiftRange(s));
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!scrollRef.current) return;

    if (isMoving) {
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      const currentMinutes = Math.floor((x - isMoving.startOffset) / snapPixels) * SNAP_INTERVAL;
      
      const newSchedule = { ...schedule };
      const shift = newSchedule[isMoving.day][isMoving.index];
      const duration = isMoving.originalEnd - isMoving.originalStart;
      
      const newStart = Math.max(0, currentMinutes);
      const newEnd = newStart + duration;
      
      if (checkCollision(isMoving.day, newStart, newEnd, isMoving.index)) {
        setCollision({ day: isMoving.day, index: isMoving.index });
      } else {
        setCollision(null);
        newSchedule[isMoving.day][isMoving.index] = {
          start: minutesToTime(newStart),
          end: minutesToTime(newEnd % 1440)
        };
        onChange(newSchedule);
      }
    }

    if (isResizing) {
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      const currentMinutes = Math.floor(x / snapPixels) * SNAP_INTERVAL;
      
      const newSchedule = { ...schedule };
      const shift = newSchedule[isResizing.day][isResizing.index];
      const range = getShiftRange(shift);
      
      let newStart = range.start;
      let newEnd = range.end;

      if (isResizing.type === 'start') {
        newStart = Math.max(0, Math.min(range.end - 15, currentMinutes));
      } else {
        newEnd = Math.max(range.start + 15, currentMinutes);
      }
      
      if (checkCollision(isResizing.day, newStart, newEnd, isResizing.index)) {
        setCollision({ day: isResizing.day, index: isResizing.index });
      } else {
        setCollision(null);
        shift.start = minutesToTime(newStart);
        shift.end = minutesToTime(newEnd % 1440);
        onChange(newSchedule);
      }
    }
  }, [isMoving, isResizing, schedule, onChange, snapPixels]);

  const handleMouseUp = useCallback(() => {
    if (collision && isMoving) {
      // Revert on collision
      const newSchedule = { ...schedule };
      newSchedule[isMoving.day][isMoving.index] = {
        start: minutesToTime(isMoving.originalStart),
        end: minutesToTime(isMoving.originalEnd % 1440)
      };
      onChange(newSchedule);
    }
    if (collision && isResizing) {
      const newSchedule = { ...schedule };
      newSchedule[isResizing.day][isResizing.index] = {
        start: minutesToTime(isResizing.originalStart),
        end: minutesToTime(isResizing.originalEnd % 1440)
      };
      onChange(newSchedule);
    }
    setIsMoving(null);
    setIsResizing(null);
    setCollision(null);
  }, [collision, isMoving, isResizing, schedule, onChange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Handle Ctrl + Wheel Zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) setZoomLevel(prev => Math.min(3, prev + 1));
        else setZoomLevel(prev => Math.max(1, prev - 1));
      }
    };
    const el = containerRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el?.removeEventListener('wheel', handleWheel);
  }, []);

  const addShift = (day: string, startMinutes: number) => {
    const duration = 480; // 8 hours
    if (checkCollision(day, startMinutes, startMinutes + duration, -1)) return;
    
    const newSchedule = { ...schedule };
    newSchedule[day] = [
      ...newSchedule[day],
      { start: minutesToTime(startMinutes), end: minutesToTime((startMinutes + duration) % 1440) }
    ];
    onChange(newSchedule);
  };

  const removeShift = (day: string, index: number) => {
    const newSchedule = { ...schedule };
    newSchedule[day] = newSchedule[day].filter((_, i) => i !== index);
    onChange(newSchedule);
  };

  const clearWeek = () => {
    const empty: WeeklySchedule = {};
    DAYS.forEach(day => empty[day] = []);
    onChange(empty);
  };

  // Dynamic Ticks
  const ticks = useMemo(() => {
    const interval = zoomLevel === 1 ? 6 : zoomLevel === 2 ? 3 : 1;
    return Array.from({ length: Math.floor(31 / interval) }, (_, i) => i * interval);
  }, [zoomLevel]);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl text-slate-200" ref={containerRef}>
      {/* Header Controls */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <Clock className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-bold text-base tracking-tight text-white">Weekly Schedule Builder</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.15em]">Enterprise Gantt Timeline</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button 
              onClick={() => setZoomLevel(prev => Math.max(1, prev - 1))}
              className="p-1.5 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-30"
              disabled={zoomLevel === 1}
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 min-w-[80px] text-center">
              Zoom {zoomLevel === 1 ? 'Fit' : zoomLevel === 2 ? 'Mid' : 'In'}
            </div>
            <button 
              onClick={() => setZoomLevel(prev => Math.min(3, prev + 1))}
              className="p-1.5 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-30"
              disabled={zoomLevel === 3}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={clearWeek}
            className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all border border-rose-500/20"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Week
          </button>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Time Header */}
        <div className="flex sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
          <div className="w-[120px] flex-shrink-0 border-r border-slate-800 bg-slate-900/30 p-3 flex items-center justify-center">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Day / Time</span>
          </div>
          <div className="flex-1 relative h-10" style={{ width: 30 * hourWidth }}>
            {ticks.map(hour => (
              <div 
                key={hour} 
                className="absolute top-0 bottom-0 flex flex-col items-center justify-center border-r border-slate-800/30"
                style={{ left: hour * hourWidth, width: hourWidth }}
              >
                <span className={`text-[10px] font-mono font-bold ${hour >= 24 ? 'text-indigo-400' : 'text-slate-400'}`}>
                  {(hour % 24).toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar" ref={scrollRef}>
          <div className="flex flex-col h-full" style={{ width: 30 * hourWidth + 120 }}>
            {DAYS.map(day => (
              <div key={day} className="flex flex-1 group/row border-b border-slate-800/50 last:border-0">
                {/* Day Label - Fixed on X scroll */}
                <div className="w-[120px] flex-shrink-0 border-r border-slate-800 bg-slate-900/20 p-3 flex items-center justify-between sticky left-0 z-20 backdrop-blur-md">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-300">{day.substring(0, 3)}</span>
                  <button 
                    onClick={() => onChange({ ...schedule, [day]: [] })}
                    className="p-1 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 rounded transition-all opacity-0 group-hover/row:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Row Content */}
                <div 
                  className="flex-1 relative bg-slate-950/50 cursor-crosshair"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const minutes = Math.floor(x / snapPixels) * SNAP_INTERVAL;
                      addShift(day, minutes);
                    }
                  }}
                >
                  {/* Grid Ticks */}
                  {ticks.map(hour => (
                    <div 
                      key={hour} 
                      className="absolute top-0 bottom-0 border-r border-slate-800/20 pointer-events-none"
                      style={{ left: hour * hourWidth }}
                    />
                  ))}

                  {/* Shift Bars */}
                  {schedule[day].map((shift, index) => {
                    const range = getShiftRange(shift);
                    const isNightShift = range.end > 1440;
                    const duration = range.end - range.start;
                    const isActiveCollision = collision?.day === day && collision?.index === index;
                    
                    return (
                      <motion.div
                        key={index}
                        layoutId={`${day}-${index}`}
                        className={`absolute top-1/2 -translate-y-1/2 h-8 rounded-lg border shadow-lg group/shift flex items-center px-3 overflow-hidden transition-shadow ${
                          isActiveCollision ? 'border-rose-500 ring-2 ring-rose-500/50 z-50 animate-shake' : ''
                        } ${
                          isNightShift 
                            ? 'bg-indigo-600/90 border-indigo-400 text-white' 
                            : 'bg-emerald-600/90 border-emerald-400 text-white'
                        }`}
                        style={{ 
                          left: (range.start / 60) * hourWidth, 
                          width: (duration / 60) * hourWidth,
                          cursor: isMoving ? 'grabbing' : 'grab'
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setIsMoving({ 
                            day, 
                            index, 
                            startOffset: e.clientX - rect.left,
                            originalStart: range.start,
                            originalEnd: range.end
                          });
                        }}
                      >
                        {/* Resize Handles */}
                        <div 
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-20"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsResizing({ 
                              day, 
                              index, 
                              type: 'start',
                              originalStart: range.start,
                              originalEnd: range.end
                            });
                          }}
                        />
                        <div 
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-20"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsResizing({ 
                              day, 
                              index, 
                              type: 'end',
                              originalStart: range.start,
                              originalEnd: range.end
                            });
                          }}
                        />

                        {/* Shift Info */}
                        <div className="flex items-center justify-between w-full gap-2 pointer-events-none">
                          <span className="text-[10px] font-black tracking-tighter whitespace-nowrap">
                            {shift.start} — {shift.end}
                            {isNightShift && <span className="ml-1 opacity-60 text-[8px]">+1d</span>}
                          </span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeShift(day, index);
                            }}
                            className="pointer-events-auto p-1 hover:bg-white/20 rounded transition-all opacity-0 group-hover/shift:opacity-100"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Legend */}
      <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
            <span>Standard</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-indigo-600 rounded-sm" />
            <span>Night Shift</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border border-rose-500 ring-1 ring-rose-500/50 rounded-sm" />
            <span className="text-rose-400">Collision Blocked</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <MousePointer2 className="w-3 h-3 text-indigo-400" />
            <span>Click to Add</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Info className="w-3 h-3 text-indigo-400" />
            <span>Ctrl + Wheel to Zoom</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translate(-50%, -2px); }
          25% { transform: translate(-50.5%, -2px); }
          75% { transform: translate(-49.5%, -2px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
