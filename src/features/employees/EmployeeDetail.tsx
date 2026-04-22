import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { X, Save, User, Phone, Mail, Clock, Shield, DollarSign, Calendar, FileText, ChevronRight, Plus, Smartphone, RefreshCcw, XCircle } from 'lucide-react';
import { WeeklyScheduleBuilder } from '../../components/WeeklyScheduleBuilder';
import { motion, AnimatePresence } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HrEmployeeDetailSchema } from '../../../shared/validations';

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

  const [isSaving, setIsSaving] = useState(false);
  const [hasScheduleError, setHasScheduleError] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }, watch, setValue, setError, clearErrors
  } = useForm<z.infer<typeof HrEmployeeDetailSchema>>({
    resolver: zodResolver(HrEmployeeDetailSchema),
    mode: 'onChange',
    defaultValues: {
      legal_name: '',
      personal_phone: '',
      date_of_birth: undefined,
      national_id: '',
      bio: '',
    }
  });


  const watchedData = watch() as any;


  useEffect(() => {
    const clamp = (val: any, min: number, max: number, field: any, message: string) => {
      const num = Number(val);
      if (!isNaN(num)) {
        if (num > max) {
          setValue(field, max, { shouldValidate: true });
          setError(field, { type: 'manual', message });
        } else if (num < min && val !== '') {
          setValue(field, min, { shouldValidate: true });
          setError(field, { type: 'manual', message });
        }
      }
    };

    clamp(watchedData.annual_leave_balance, 0, 365, 'annual_leave_balance', 'Max 365 days');
    clamp(watchedData.sick_leave_balance, 0, 365, 'sick_leave_balance', 'Max 365 days');
    if (watchedData.allow_overtime) {
      clamp(watchedData.max_overtime_hours, 1, 168, 'max_overtime_hours', 'Between 1 and 168 hours');
    }
  }, [watchedData.annual_leave_balance, watchedData.sick_leave_balance, watchedData.max_overtime_hours, watchedData.allow_overtime, setValue, setError]);


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

      reset({
        ...employee,
        weekly_schedule: fullSchedule,
        hourly_rate: employee.hourly_rate || 0,
        annual_leave_balance: employee.annual_leave_balance ?? 21,
        sick_leave_balance: employee.sick_leave_balance ?? 7,
        lunch_break_minutes: employee.lunch_break_minutes || 0,
        emergency_contact_name: employee.emergency_contact_name || '',
        emergency_contact_phone: employee.emergency_contact_phone || '',
        emergency_contact_relationship: employee.emergency_contact_relationship || '',
        full_address: employee.full_address || '',
        national_id: employee.national_id || '',
        bank_name: employee.bank_name || '',
        bank_account_iban: employee.bank_account_iban || '',
        legal_name: employee.legal_name || '',
        id_photo_url: employee.id_photo_url || '',
        hire_date: employee.hire_date || '',
        date_of_birth: employee.date_of_birth || '',
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

  const resetDeviceMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/users/${userId}/reset-device`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      alert('Device binding reset successfully');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Failed to reset device binding');
    }
  });

  const handleSave = handleSubmit((data: any) => {
    if (data.status === 'suspended' && !data.suspension_reason?.trim()) {
      alert('Suspension reason is required when status is suspended.');
      return;
    }
    setIsSaving(true);
    const finalData = { ...watchedData, ...data };
    if (finalData.date_of_birth instanceof Date) {
      finalData.date_of_birth = finalData.date_of_birth.toISOString().split('T')[0];
    }
    if (finalData.hire_date instanceof Date) {
      finalData.hire_date = finalData.hire_date.toISOString().split('T')[0];
    }
    updateMutation.mutate(finalData, {
      onSettled: () => setIsSaving(false)
    });
  }, (errors) => {
    console.error('Form validation failed:', errors); alert('Validation Error: ' + Object.keys(errors).join(', '));
    alert('Please fix the errors in the form before saving.');
  });

  if (isLoading || !watchedData) {
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
            {watchedData.profile_picture_url ? (
              <img 
                src={watchedData.profile_picture_url.startsWith('http') ? watchedData.profile_picture_url : `${window.location.origin}${watchedData.profile_picture_url}`}
                alt={watchedData.name}
                className="w-full h-full rounded-2xl object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              watchedData?.name?.charAt(0) || 'U'
            )}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-black tracking-tight">{watchedData.name}</h3>
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                watchedData.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                watchedData.status === 'suspended' ? 'bg-rose-100 text-rose-700' : 'bg-muted text-muted-foreground'
              }`}>
                {watchedData.status}
              </span>
            </div>
            <div className="flex flex-col gap-1 mt-1">
              <p className="text-sm text-muted-foreground font-medium">{watchedData.email} • ID: #{watchedData.id}</p>
              {watchedData.status === 'suspended' && watchedData.suspension_reason && (
                <p className="text-rose-600 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Reason: {watchedData.suspension_reason}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button type="button" onClick={handleSave}
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
                <User className="w-4 h-4" /> Personal Information (Read-Only)
              </h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Display Name</label>
                  <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                    {watchedData.name}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bio</label>
                  <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground min-h-[60px]">
                    {watchedData.bio || 'No bio provided'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date of Birth</label>
                    <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">{watchedData.date_of_birth ? (watchedData.date_of_birth instanceof Date ? watchedData.date_of_birth.toISOString().split('T')[0] : String(watchedData.date_of_birth).split('T')[0]) : "-"}</div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gender</label>
                    <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground capitalize">
                      {watchedData.gender || '-'}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Full Address</label>
                  <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground min-h-[60px]">
                    {watchedData.full_address || '-'}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Personal Phone</label>
                  <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                    {watchedData.personal_phone || '-'}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Emergency Contact</label>
                      <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                        {watchedData.emergency_contact_name || '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Emergency Phone</label>
                      <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                        {watchedData.emergency_contact_phone || '-'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Relationship</label>
                    <div className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                      {watchedData.emergency_contact_relationship || '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* HR Administration */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <h4 className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-muted-foreground">
                <Shield className="w-4 h-4" /> HR Administration
              </h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">National ID</label>
                  <input type="text" {...register("national_id")} placeholder="National Identification Number" className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${errors.national_id ? "border-red-500" : "border-border"}`} />
{errors.national_id && <p className="text-xs text-red-500 mt-1">{errors.national_id.message as string}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Legal Name</label>
                  <input 
                    type="text" 
                    {...register("legal_name")}

                    placeholder="Official legal name"
                    className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${errors.legal_name ? "border-red-500" : "border-border"}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hire Date</label>
                  <input 
                    type="date" 
                    {...register("hire_date")}
                    className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${errors.hire_date ? "border-red-500" : "border-border"}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">ID Photo</label>
                  <div className="flex items-center gap-4">
                    {watchedData.id_photo_url && (
                      <img 
                        src={watchedData.id_photo_url.startsWith('http') ? watchedData.id_photo_url : `${window.location.origin}${watchedData.id_photo_url}`}
                        alt="ID Photo"
                        className="w-12 h-12 rounded-lg object-cover border border-border"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const uploadData = new FormData();
                          uploadData.append('avatar', file);
                          try {
                            const res = await api.post('/users/upload-avatar', uploadData);
                            reset({ ...watchedData, id_photo_url: res.data.url });
                          } catch (err) {
                            alert('Failed to upload ID photo');
                          }
                        }
                      }}
                      className="text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    />
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
                    {...register("job_id")}
                    className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${errors.job_id ? "border-red-500" : "border-border"}`}
                  >
                    {(!employee.job_id || watchedData.job_id === null) && <option value="">Unassigned</option>}
                    {jobs?.map((job: any) => (
                      <option key={job.id} value={job.id}>{job.title}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hourly Rate ($)</label>
                    <input
                      type="number"
                      {...register("hourly_rate")}
                      className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${errors.hourly_rate ? "border-red-500" : "border-border"}`}
                    />
                    {errors.hourly_rate && <p className="text-xs text-red-500 mt-1">{errors.hourly_rate.message as string}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Annual Leave</label>
                    <input
                      type="number"
                      {...register("annual_leave_balance")}
                      className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${errors.annual_leave_balance ? "border-red-500" : "border-border"}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sick Leave</label>
                    <input
                      type="number"
                      {...register("sick_leave_balance")}
                      className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${errors.sick_leave_balance ? "border-red-500" : "border-border"}`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bank Name</label>
                    <input
                      type="text"
                      {...register("bank_name")}
                      placeholder="e.g. Chase"
                      className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all border-border`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account / IBAN</label>
                    <input
                      type="text"
                      {...register("bank_account_iban")}
                      placeholder="Account Number"
                      className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all border-border`}
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
                    {...register("allow_overtime")}
                    className="w-5 h-5 rounded-lg border-border text-primary focus:ring-primary transition-all"
                  />
                </div>
                {watchedData.allow_overtime && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Max OT Hours / Week</label>
                    <input 
                      type="number" 
                      step="0.5"
                      {...register("max_overtime_hours")}
                      className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${errors.max_overtime_hours ? "border-red-500" : "border-border"}`}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Employment Status</label>
                  <select 
                    {...register("status")}
                    className={`w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${
                      watchedData.status === 'active' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>

                {watchedData.status === 'suspended' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Suspension Reason</label>
                    <textarea 
                      {...register("suspension_reason")}
                      placeholder="Enter reason for suspension..."
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all min-h-[80px] resize-none"
                    />
                  </div>
                )}
                
                {/* Device Binding Section */}
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${watchedData.device_id ? 'bg-emerald-100 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Device Binding</span>
                        <p className="text-xs font-medium">{watchedData.device_id ? 'Device Bound' : 'No Device Linked'}</p>
                      </div>
                    </div>
                    {watchedData.device_id && (
                      <button 
                        onClick={() => {
                          if (window.confirm('Are you sure you want to reset this employee\'s device binding? They will be able to clock in from a new device.')) {
                            resetDeviceMutation.mutate();
                          }
                        }}
                        disabled={resetDeviceMutation.isPending}
                        className="p-2 hover:bg-rose-100 text-rose-500 rounded-lg transition-all"
                        title="Reset Device Binding"
                      >
                        <RefreshCcw className={`w-4 h-4 ${resetDeviceMutation.isPending ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                  {watchedData.device_id && (
                    <p className="text-[9px] text-muted-foreground mt-2 px-1">
                      ID: <span className="font-mono">{watchedData.device_id}</span>
                    </p>
                  )}
                </div>
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
                    onClick={() => reset({ ...watchedData, weekly_schedule: {} })}
                    className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500 hover:text-rose-600 transition-colors"
                  >
                    Reset All
                  </button>
                  <div className="flex items-center gap-4 bg-muted/50 p-2 rounded-2xl border border-border">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Lunch Break</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        {...register("lunch_break_minutes")}
                        className="w-16 px-3 py-1.5 bg-background border border-border rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <span className="text-[10px] font-bold text-muted-foreground mr-2">MIN</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="min-h-[400px]">
                <WeeklyScheduleBuilder 
                  schedule={watchedData.weekly_schedule || {}}
                  onChange={(newSchedule) => reset({ ...watchedData, weekly_schedule: newSchedule })}
                  onError={setHasScheduleError}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
