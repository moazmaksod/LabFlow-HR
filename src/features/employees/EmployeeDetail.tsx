import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { X, Save, User, Phone, Mail, Clock, Shield, DollarSign, Calendar, FileText, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EmployeeDetailProps {
  userId: number;
  onClose: () => void;
}

interface Shift {
  start: string;
  end: string;
}

interface WeeklySchedule {
  [key: string]: Shift[];
}

const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export default function EmployeeDetail({ userId, onClose }: EmployeeDetailProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: employee, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const res = await api.get(`/users/${userId}`);
      return res.data;
    }
  });

  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await api.get('/jobs');
      return res.data;
    }
  });

  useEffect(() => {
    if (employee) {
      let schedule = {};
      try {
        schedule = employee.weekly_schedule ? JSON.parse(employee.weekly_schedule) : {};
      } catch (e) {
        schedule = {};
      }

      // Ensure all days exist in schedule
      const fullSchedule: WeeklySchedule = {};
      DAYS.forEach(day => {
        const daySchedule = (schedule as any)[day];
        if (Array.isArray(daySchedule)) {
          fullSchedule[day] = daySchedule;
        } else if (daySchedule && !daySchedule.isOff) {
          // Migrate old format
          fullSchedule[day] = [{ start: daySchedule.start || '09:00', end: daySchedule.end || '17:00' }];
        } else {
          fullSchedule[day] = [];
        }
      });

      setFormData({
        ...employee,
        weekly_schedule: fullSchedule,
        hourly_rate: employee.hourly_rate || 0,
        leave_balance: employee.leave_balance || 21,
        lunch_break_minutes: employee.lunch_break_minutes || 0,
        emergency_contact_name: employee.emergency_contact_name || '',
        emergency_contact_phone: employee.emergency_contact_phone || '',
        age: employee.age || '',
        gender: employee.gender || '',
        allow_overtime: employee.allow_overtime || false,
        max_overtime_hours: employee.max_overtime_hours || 0
      });
    }
  }, [employee]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.put(`/users/${userId}/profile`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      alert('Employee profile updated successfully');
    }
  });

  const handleSave = () => {
    setIsSaving(true);
    updateMutation.mutate(formData, {
      onSettled: () => setIsSaving(false)
    });
  };

  const addShift = (day: string) => {
    setFormData((prev: any) => ({
      ...prev,
      weekly_schedule: {
        ...prev.weekly_schedule,
        [day]: [...prev.weekly_schedule[day], { start: '09:00', end: '17:00' }]
      }
    }));
  };

  const removeShift = (day: string, index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      weekly_schedule: {
        ...prev.weekly_schedule,
        [day]: prev.weekly_schedule[day].filter((_: any, i: number) => i !== index)
      }
    }));
  };

  const updateShift = (day: string, index: number, field: keyof Shift, value: string) => {
    setFormData((prev: any) => {
      const newShifts = [...prev.weekly_schedule[day]];
      newShifts[index] = { ...newShifts[index], [field]: value };
      return {
        ...prev,
        weekly_schedule: {
          ...prev.weekly_schedule,
          [day]: newShifts
        }
      };
    });
  };

  if (isLoading || !formData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col bg-background border-l border-border shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
            {formData.profile_picture_url ? (
              <img 
                src={formData.profile_picture_url.startsWith('http') ? formData.profile_picture_url : `${window.location.origin}${formData.profile_picture_url}`} 
                alt={formData.name}
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              formData.name.charAt(0)
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold leading-none">{formData.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{formData.email}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Personal Info */}
        <section className="space-y-4">
          <h4 className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            <User className="w-4 h-4" /> Personal Information (Read-Only)
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Full Name</label>
              <input 
                type="text" 
                value={formData.name} 
                disabled
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email Address</label>
              <input 
                type="email" 
                value={formData.email} 
                disabled
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Age</label>
              <input 
                type="number" 
                value={formData.age} 
                disabled
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Gender</label>
              <select 
                value={formData.gender} 
                disabled
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed"
              >
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </section>

        {/* HR Settings */}
        <section className="space-y-4">
          <h4 className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            <Shield className="w-4 h-4" /> HR Settings
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Job Role</label>
              <select 
                value={formData.job_id || ''} 
                onChange={(e) => setFormData({...formData, job_id: e.target.value ? Number(e.target.value) : null})}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="">Unassigned</option>
                {jobs?.map((job: any) => (
                  <option key={job.id} value={job.id}>{job.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role Type</label>
              <select 
                value={formData.role} 
                onChange={(e) => setFormData({...formData, role: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Hourly Rate
              </label>
              <input 
                type="number" 
                value={formData.hourly_rate} 
                onChange={(e) => setFormData({...formData, hourly_rate: Number(e.target.value)})}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Leave Balance (Days)
              </label>
              <input 
                type="number" 
                value={formData.leave_balance} 
                onChange={(e) => setFormData({...formData, leave_balance: Number(e.target.value)})}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Allow Overtime
              </label>
              <div className="flex items-center h-9">
                <input 
                  type="checkbox" 
                  checked={formData.allow_overtime} 
                  onChange={(e) => setFormData({...formData, allow_overtime: e.target.checked})}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="ml-2 text-sm text-muted-foreground">Enable OT</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Max OT Hours
              </label>
              <input 
                type="number" 
                step="0.5"
                value={formData.max_overtime_hours} 
                onChange={(e) => setFormData({...formData, max_overtime_hours: Number(e.target.value)})}
                disabled={!formData.allow_overtime}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Device Binding</label>
              <button 
                onClick={async () => {
                  if (confirm('Are you sure you want to reset the device binding for this employee?')) {
                    await api.put(`/users/${userId}/reset-device`);
                    alert('Device binding reset successfully');
                    queryClient.invalidateQueries({ queryKey: ['user', userId] });
                  }
                }}
                className="w-full px-3 py-2 bg-amber-100 text-amber-700 border border-amber-200 rounded-md text-sm font-medium hover:bg-amber-200 transition-colors"
              >
                Reset Device Binding
              </button>
            </div>
          </div>
        </section>

        {/* Schedule Manager */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
              <Clock className="w-4 h-4" /> Weekly Schedule
            </h4>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Lunch Break (min)</label>
              <input 
                type="number" 
                value={formData.lunch_break_minutes} 
                onChange={(e) => setFormData({...formData, lunch_break_minutes: Number(e.target.value)})}
                className="w-16 px-2 py-1 bg-background border border-border rounded-md text-xs focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
          
          <div className="space-y-2 border border-border rounded-lg overflow-hidden">
            {DAYS.map((day) => (
              <div key={day} className={`flex flex-col p-3 text-sm ${formData.weekly_schedule[day].length === 0 ? 'bg-muted/30' : 'bg-background'} border-b border-border last:border-0`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3 w-32">
                    <span className="capitalize font-medium">{day}</span>
                  </div>
                  <button 
                    onClick={() => addShift(day)}
                    className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                  >
                    + Add Shift
                  </button>
                </div>
                
                {formData.weekly_schedule[day].length > 0 ? (
                  <div className="space-y-2">
                    {formData.weekly_schedule[day].map((shift: Shift, index: number) => (
                      <div key={index} className="flex items-center gap-2 pl-4">
                        <input 
                          type="time" 
                          value={shift.start}
                          onChange={(e) => updateShift(day, index, 'start', e.target.value)}
                          className="px-2 py-1 bg-background border border-border rounded text-xs outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span className="text-muted-foreground">to</span>
                        <input 
                          type="time" 
                          value={shift.end}
                          onChange={(e) => updateShift(day, index, 'end', e.target.value)}
                          className="px-2 py-1 bg-background border border-border rounded text-xs outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button 
                          onClick={() => removeShift(day, index)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic pl-4">Day Off</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Emergency Contact */}
        <section className="space-y-4">
          <h4 className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            <Phone className="w-4 h-4" /> Emergency Contact (Read-Only)
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Contact Name</label>
              <input 
                type="text" 
                value={formData.emergency_contact_name} 
                disabled
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed"
                placeholder="Name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <input 
                type="text" 
                value={formData.emergency_contact_phone} 
                disabled
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed"
                placeholder="+1 234 567 890"
              />
            </div>
          </div>
        </section>

        {/* Documents Placeholder */}
        <section className="space-y-4">
          <h4 className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            <FileText className="w-4 h-4" /> Employee Documents
          </h4>
          <div className="grid grid-cols-1 gap-3">
            {['National ID / Passport', 'Employment Contract', 'Training Certificates'].map((doc) => (
              <div key={doc} className="flex items-center justify-between p-3 border border-dashed border-border rounded-lg bg-muted/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium">{doc}</span>
                </div>
                <button className="text-xs text-primary font-medium hover:underline">Upload</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-border bg-muted/30">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
