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
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Weekly Schedule</h3>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Standard Shift Entry</p>
          </div>
        </div>
        <button 
          onClick={() => onChange({})}
          className="text-[10px] font-bold uppercase tracking-widest text-rose-600 hover:text-rose-700 transition-colors"
        >
          Reset All
        </button>
      </div>

      <div className="p-4 space-y-2">
        {DAYS.map((day) => {
          const shift = schedule[day]?.[0];
          const isActive = !!shift;

          return (
            <div 
              key={day} 
              className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${
                isActive ? 'bg-indigo-50/30 border-indigo-100' : 'bg-slate-50/50 border-slate-100 opacity-60'
              }`}
            >
              {/* Day Label & Toggle */}
              <div className="flex items-center gap-3 w-32 shrink-0">
                <button
                  onClick={() => handleToggleDay(day)}
                  className={`transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-300'}`}
                >
                  {isActive ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </button>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 capitalize">
                  {day}
                </span>
              </div>

              {/* Time Inputs */}
              <div className="flex items-center gap-2 flex-1">
                {isActive ? (
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter ml-1">Start</label>
                      <input 
                        type="time"
                        value={shift.start}
                        onChange={(e) => handleTimeChange(day, 'start', e.target.value)}
                        className="bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs font-mono font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="h-px w-3 bg-slate-300 mt-4" />
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter ml-1">End</label>
                      <input 
                        type="time"
                        value={shift.end}
                        onChange={(e) => handleTimeChange(day, 'end', e.target.value)}
                        className="bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs font-mono font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic ml-1">
                    Day Off
                  </span>
                )}
              </div>

              {/* Row Actions */}
              <div className="w-24 flex justify-end">
                {day === 'monday' && isActive && (
                  <button 
                    onClick={copyMondayToAll}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-600 text-white text-[9px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-sm"
                  >
                    <Copy className="w-3 h-3" /> Copy All
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <Info className="w-3.5 h-3.5 text-indigo-500" />
          <span>Night shifts (e.g. 22:00 - 06:00) are automatically handled.</span>
        </div>
      </div>
    </div>
  );
};
