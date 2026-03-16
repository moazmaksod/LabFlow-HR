import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { X, Save, User, Phone, Mail, Clock, Shield, DollarSign, Calendar, FileText, ChevronRight, Plus } from 'lucide-react';
import { WeeklyScheduleBuilder } from '../../components/WeeklyScheduleBuilder';
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

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function EmployeeDetail({ userId, onClose }: EmployeeDetailProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasScheduleError, setHasScheduleError] = useState(false);

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
    if (formData.status === 'suspended' && !formData.suspension_reason?.trim()) {
      alert('Suspension reason is required when status is suspended.');
      return;
    }
    setIsSaving(true);
    updateMutation.mutate(formData, {
      onSettled: () => setIsSaving(false)
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="h-full flex flex-col bg-background rounded-3xl shadow-2xl overflow-hidden border border-border"
    >
      {/* Header */}
      <div className="p-8 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shadow-inner border border-primary/20">
            {formData.profile_picture_url ? (
              <img 
                src={formData.profile_picture_url.startsWith('http') ? formData.profile_picture_url : `${window.location.origin}${formData.profile_picture_url}`} 
                alt={formData.name}
                className="w-full h-full rounded-2xl object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              formData.name.charAt(0)
            )}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-black tracking-tight">{formData.name}</h3>
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                formData.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                formData.status === 'suspended' ? 'bg-rose-100 text-rose-700' : 'bg-muted text-muted-foreground'
              }`}>
                {formData.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-medium mt-1">{formData.email} • ID: #{formData.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleSave}
            disabled={isSaving || hasScheduleError}
            className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {isSaving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
          <button
            onClick={onClose}
            className="p-2.5 hover:bg-muted rounded-xl transition-colors border border-border"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Left Column: Info & Settings */}
          <div className="xl:col-span-4 space-y-8">
            {/* Personal Info */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <h4 className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-muted-foreground">
                <User className="w-4 h-4" /> Personal Information
              </h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Full Name</label>
                  <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                    {formData.name}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Age</label>
                    <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                      {formData.age || '-'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gender</label>
                    <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground capitalize">
                      {formData.gender || '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* HR Settings */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <h4 className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-muted-foreground">
                <Shield className="w-4 h-4" /> HR & Payroll Settings
              </h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Job Role</label>
                  <select 
                    value={formData.job_id || ''} 
                    onChange={(e) => setFormData({...formData, job_id: e.target.value ? Number(e.target.value) : null})}
                    className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  >
                    {(!employee.job_id || formData.job_id === null) && <option value="">Unassigned</option>}
                    {jobs?.map((job: any) => (
                      <option key={job.id} value={job.id}>{job.title}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hourly Rate ($)</label>
                    <input 
                      type="number" 
                      value={formData.hourly_rate} 
                      onChange={(e) => setFormData({...formData, hourly_rate: Number(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Leave Balance</label>
                    <input 
                      type="number" 
                      value={formData.leave_balance} 
                      onChange={(e) => setFormData({...formData, leave_balance: Number(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-xl">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Overtime Policy</span>
                    <p className="text-xs font-medium">Allow extra hours</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={formData.allow_overtime} 
                    onChange={(e) => setFormData({...formData, allow_overtime: e.target.checked})}
                    className="w-5 h-5 rounded-lg border-border text-primary focus:ring-primary transition-all"
                  />
                </div>
                {formData.allow_overtime && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Max OT Hours / Week</label>
                    <input 
                      type="number" 
                      step="0.5"
                      value={formData.max_overtime_hours} 
                      onChange={(e) => setFormData({...formData, max_overtime_hours: Number(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Schedule & Documents */}
          <div className="xl:col-span-8 space-y-8">
            {/* Schedule Section */}
            <div className="bg-card border border-border rounded-3xl p-8 space-y-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="flex items-center gap-2 font-black text-sm uppercase tracking-[0.2em] text-muted-foreground">
                    <Clock className="w-5 h-5" /> Weekly Work Schedule
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">Define the standard weekly timeline for this employee.</p>
                </div>
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => setFormData({ ...formData, weekly_schedule: {} })}
                    className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500 hover:text-rose-600 transition-colors"
                  >
                    Reset All
                  </button>
                  <div className="flex items-center gap-4 bg-muted/50 p-2 rounded-2xl border border-border">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Lunch Break</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        value={formData.lunch_break_minutes} 
                        onChange={(e) => setFormData({...formData, lunch_break_minutes: Number(e.target.value)})}
                        className="w-16 px-3 py-1.5 bg-background border border-border rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <span className="text-[10px] font-bold text-muted-foreground mr-2">MIN</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="min-h-[400px]">
                <WeeklyScheduleBuilder 
                  schedule={formData.weekly_schedule}
                  onChange={(newSchedule) => setFormData({ ...formData, weekly_schedule: newSchedule })}
                  onError={setHasScheduleError}
                />
              </div>
            </div>

            {/* Bottom Row: Emergency & Documents */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
                <h4 className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-muted-foreground">
                  <Phone className="w-4 h-4" /> Emergency Contact
                </h4>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contact Name</label>
                    <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                      {formData.emergency_contact_name || 'Not provided'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Phone Number</label>
                    <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                      {formData.emergency_contact_phone || 'Not provided'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
                <h4 className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-muted-foreground">
                  <FileText className="w-4 h-4" /> Compliance Documents
                </h4>
                <div className="space-y-3">
                  {['Employment Contract', 'ID Verification'].map((doc) => (
                    <div key={doc} className="flex items-center justify-between p-3 border border-border rounded-xl bg-muted/10 group hover:bg-muted/20 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded-lg border border-border">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-xs font-bold">{doc}</span>
                      </div>
                      <button className="text-[10px] font-black uppercase tracking-tighter text-primary hover:underline">View</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
