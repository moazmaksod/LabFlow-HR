import React from 'react';
import { Clock, Copy, Trash2, CheckCircle2, Circle, Info, Plus } from 'lucide-react';

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
  onError?: (hasError: boolean) => void;
}

const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

const timeToMinutes = (time: string) => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const checkOverlap = (shifts: Shift[]) => {
  if (shifts.length <= 1) return [];
  
  const overlapIndices = new Set<number>();
  
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      const s1 = { start: timeToMinutes(shifts[i].start), end: timeToMinutes(shifts[i].end) };
      const s2 = { start: timeToMinutes(shifts[j].start), end: timeToMinutes(shifts[j].end) };
      
      // Handle night shifts for overlap check within the same day
      // If end < start, it occupies [start, 1440] on this day
      const s1End = s1.end < s1.start ? 1440 : s1.end;
      const s2End = s2.end < s2.start ? 1440 : s2.end;
      
      if (Math.max(s1.start, s2.start) < Math.min(s1End, s2End)) {
        overlapIndices.add(i);
        overlapIndices.add(j);
      }
    }
  }
  
  return Array.from(overlapIndices);
};


const calculateDuration = (start: string, end: string) => {
  const startMins = timeToMinutes(start);
  const endMins = timeToMinutes(end);
  if (endMins < startMins) {
    return (1440 - startMins) + endMins; // Crosses midnight
  }
  return endMins - startMins;
};

const formatDuration = (totalMins: number) => {
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins} M`;
  return `${hours} H - ${mins} M`;
};

export const WeeklyScheduleBuilder: React.FC<WeeklyScheduleBuilderProps> = ({ schedule, onChange, onError }) => {

  const totalWeeklyMinutes = React.useMemo(() => {
    let total = 0;
    DAYS.forEach(day => {
      (schedule[day] || []).forEach(shift => {
        total += calculateDuration(shift.start, shift.end);
      });
    });
    return total;
  }, [schedule]);
  
  // Validate all days and notify parent
  React.useEffect(() => {
    const hasAnyOverlap = DAYS.some(day => checkOverlap(schedule[day] || []).length > 0);
    onError?.(hasAnyOverlap);
  }, [schedule, onError]);

  const handleAddShift = (day: string) => {
    const newSchedule = { ...schedule };
    const currentShifts = newSchedule[day] || [];
    newSchedule[day] = [...currentShifts, { start: '09:00', end: '17:00' }];
    onChange(newSchedule);
  };

  const handleRemoveShift = (day: string, index: number) => {
    const newSchedule = { ...schedule };
    newSchedule[day] = newSchedule[day].filter((_, i) => i !== index);
    onChange(newSchedule);
  };

  const handleTimeChange = (day: string, index: number, field: 'start' | 'end', value: string) => {
    const newSchedule = { ...schedule };
    const newShifts = [...(newSchedule[day] || [])];
    newShifts[index] = { ...newShifts[index], [field]: value };
    newSchedule[day] = newShifts;
    onChange(newSchedule);
  };

  const copySaturdayToAll = () => {
    const saturdayShifts = schedule['saturday'] || [];
    if (saturdayShifts.length === 0) return;

    const newSchedule = { ...schedule };
    DAYS.forEach(day => {
      if (day !== 'saturday') {
        newSchedule[day] = saturdayShifts.map(s => ({ ...s }));
      }
    });
    onChange(newSchedule);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center bg-primary/10 border border-primary/20 px-4 py-3 rounded-xl mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-primary">Total Weekly Working Hours</span>
          <span className="text-sm font-black text-primary">{formatDuration(totalWeeklyMinutes)}</span>
        </div>
        {DAYS.map((day) => {
          const shifts = schedule[day] || [];
          const isActive = shifts.length > 0;
          const overlapIndices = checkOverlap(shifts);
          const dailyMinutes = shifts.reduce((acc, shift) => acc + calculateDuration(shift.start, shift.end), 0);

          return (
            <div 
              key={day} 
              className={`p-4 rounded-xl border transition-all ${
                isActive 
                  ? 'bg-primary/5 border-primary/20' 
                  : 'bg-muted/30 border-transparent opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground/30'}`}>
                    {isActive ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </div>
                  <span className={`text-xs font-black uppercase tracking-widest transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {day}
                  </span>
                  {isActive && (
                    <span className="text-[10px] font-bold text-muted-foreground ml-2">
                      ({formatDuration(dailyMinutes)})
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {day === 'saturday' && isActive && (
                    <button 
                      onClick={copySaturdayToAll}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy All
                    </button>
                  )}
                  <button 
                    onClick={() => handleAddShift(day)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all"
                  >
                    <Plus className="w-3 h-3" /> Add Shift
                  </button>
                </div>
              </div>

              {isActive ? (
                <div className="space-y-3">
                  {shifts.map((shift, index) => {
                    const isOverlapping = overlapIndices.includes(index);
                    return (
                      <div key={index} className="flex items-center gap-4 group">
                        <div className="flex items-center gap-6 flex-1">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Start Time</label>
                            <input 
                              type="time"
                              value={shift.start}
                              onChange={(e) => handleTimeChange(day, index, 'start', e.target.value)}
                              className={`bg-background border rounded-xl px-3 py-2 text-xs font-mono font-bold text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                                isOverlapping ? 'border-red-500 ring-1 ring-red-500/20' : 'border-border focus:border-primary'
                              }`}
                            />
                          </div>
                          <div className="h-px w-4 bg-border mt-5" />
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">End Time</label>
                            <input 
                              type="time"
                              value={shift.end}
                              onChange={(e) => handleTimeChange(day, index, 'end', e.target.value)}
                              className={`bg-background border rounded-xl px-3 py-2 text-xs font-mono font-bold text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                                isOverlapping ? 'border-red-500 ring-1 ring-red-500/20' : 'border-border focus:border-primary'
                              }`}
                            />
                          </div>
                        </div>

                        <button 
                          onClick={() => handleRemoveShift(day, index)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                  {overlapIndices.length > 0 && (
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-2 flex items-center gap-1.5">
                      <Info className="w-3 h-3" /> Shifts cannot overlap
                    </p>
                  )}
                </div>
              ) : (
                <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] italic ml-8">
                  Day Off
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-muted/30 border-t border-border px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
          <Info className="w-4 h-4 text-primary" />
          <span>Night shifts (e.g. 22:00 - 06:00) are automatically handled.</span>
        </div>
      </div>
    </div>
  );
};


