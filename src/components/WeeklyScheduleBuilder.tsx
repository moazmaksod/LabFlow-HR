import React from 'react';
import { Clock, Copy, Trash2, CheckCircle2, Circle, Info } from 'lucide-react';

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

export const WeeklyScheduleBuilder: React.FC<WeeklyScheduleBuilderProps> = ({ schedule, onChange }) => {
  
  const handleToggleDay = (day: string) => {
    const newSchedule = { ...schedule };
    if (newSchedule[day]?.length > 0) {
      newSchedule[day] = [];
    } else {
      newSchedule[day] = [{ start: '09:00', end: '17:00' }];
    }
    onChange(newSchedule);
  };

  const handleTimeChange = (day: string, field: 'start' | 'end', value: string) => {
    const newSchedule = { ...schedule };
    if (!newSchedule[day] || newSchedule[day].length === 0) {
      newSchedule[day] = [{ start: '09:00', end: '17:00' }];
    }
    newSchedule[day][0] = { ...newSchedule[day][0], [field]: value };
    onChange(newSchedule);
  };

  const copyMondayToAll = () => {
    const mondayShift = schedule['monday']?.[0];
    if (!mondayShift) return;

    const newSchedule = { ...schedule };
    DAYS.forEach(day => {
      if (day !== 'monday') {
        newSchedule[day] = [{ ...mondayShift }];
      }
    });
    onChange(newSchedule);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 space-y-2">
        {DAYS.map((day) => {
          const shift = schedule[day]?.[0];
          const isActive = !!shift;

          return (
            <div 
              key={day} 
              onClick={() => !isActive && handleToggleDay(day)}
              className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${
                isActive 
                  ? 'bg-primary/5 border-primary/20' 
                  : 'bg-muted/30 border-transparent opacity-60 hover:opacity-100 hover:bg-muted/50 cursor-pointer'
              }`}
            >
              {/* Day Label & Toggle */}
              <div 
                className="flex items-center gap-3 w-32 shrink-0 cursor-pointer"
                onClick={(e) => {
                  if (isActive) {
                    e.stopPropagation();
                    handleToggleDay(day);
                  }
                }}
              >
                <div className={`transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground/30'}`}>
                  {isActive ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </div>
                <span className={`text-xs font-black uppercase tracking-widest transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {day}
                </span>
              </div>

              {/* Time Inputs */}
              <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                {isActive ? (
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">Start Time</label>
                      <input 
                        type="time"
                        value={shift.start}
                        onChange={(e) => handleTimeChange(day, 'start', e.target.value)}
                        className="bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono font-bold text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    </div>
                    <div className="h-px w-4 bg-border mt-5" />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">End Time</label>
                      <input 
                        type="time"
                        value={shift.end}
                        onChange={(e) => handleTimeChange(day, 'end', e.target.value)}
                        className="bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono font-bold text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] italic ml-1">
                    Day Off
                  </span>
                )}
              </div>

              {/* Row Actions */}
              <div className="w-28 flex justify-end" onClick={(e) => e.stopPropagation()}>
                {day === 'monday' && isActive && (
                  <button 
                    onClick={copyMondayToAll}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy All
                  </button>
                )}
              </div>
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
