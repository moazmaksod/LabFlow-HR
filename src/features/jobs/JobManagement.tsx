import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Plus, Briefcase, Trash2, Edit2, AlertCircle, X, Clock } from 'lucide-react';
import { WeeklyScheduleBuilder } from '../../components/WeeklyScheduleBuilder';
import { motion } from 'motion/react';

interface Shift {
  start: string;
  end: string;
}

interface WeeklySchedule {
  [key: string]: Shift[];
}

interface Job {
  id: number;
  title: string;
  hourly_rate: number;
  required_hours_per_week: number;
  grace_period: number;
  default_annual_leave_days: number;
  default_sick_leave_days: number;
  allow_overtime: boolean;
  employment_type: string;
}

const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export default function JobManagement() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [hasScheduleError, setHasScheduleError] = useState(false);
  
  const defaultSchedule: WeeklySchedule = {};
  DAYS.forEach(day => {
    defaultSchedule[day] = [];
  });

  const [formData, setFormData] = useState({
    title: '',
    hourly_rate: '',
    required_hours_per_week: '40',
    grace_period: '15',
    default_annual_leave_days: '21',
    default_sick_leave_days: '7',
    allow_overtime: true,
    employment_type: 'full-time'
  });

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await api.get('/jobs');
      return res.data;
    }
  });

  const createJobMutation = useMutation({
    mutationFn: async (newJob: any) => {
      const res = await api.post('/jobs', newJob);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      resetForm();
    }
  });

  const updateJobMutation = useMutation({
    mutationFn: async (updatedJob: any) => {
      const res = await api.put(`/jobs/${editingJobId}`, updatedJob);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      resetForm();
    }
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/jobs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to delete job role';
      alert(message);
    }
  });

  const resetForm = () => {
    setIsFormOpen(false);
    setEditingJobId(null);
    setFormData({
      title: '',
      hourly_rate: '',
      required_hours_per_week: '40',
      grace_period: '15',
      default_annual_leave_days: '21',
      default_sick_leave_days: '7',
      allow_overtime: true,
      employment_type: 'full-time'
    });
  };

  const handleEdit = (job: Job) => {
    setEditingJobId(job.id);

    setFormData({
      title: job.title,
      hourly_rate: job.hourly_rate.toString(),
      required_hours_per_week: job.required_hours_per_week ? job.required_hours_per_week.toString() : '40',
      grace_period: job.grace_period.toString(),
      default_annual_leave_days: job.default_annual_leave_days !== null && job.default_annual_leave_days !== undefined ? job.default_annual_leave_days.toString() : '21',
      default_sick_leave_days: job.default_sick_leave_days !== null && job.default_sick_leave_days !== undefined ? job.default_sick_leave_days.toString() : '7',
      allow_overtime: job.allow_overtime === false ? false : true,
      employment_type: job.employment_type || 'full-time'
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      hourly_rate: Number(formData.hourly_rate),
      grace_period: Number(formData.grace_period),
      default_annual_leave_days: Number(formData.default_annual_leave_days),
      default_sick_leave_days: Number(formData.default_sick_leave_days)
    };

    if (editingJobId) {
      updateJobMutation.mutate(payload);
    } else {
      createJobMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number, title: string) => {
    if (window.confirm(`Are you sure you want to delete the "${title}" job role?`)) {
      deleteJobMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Job Roles & Templates</h2>
          <p className="text-muted-foreground font-medium mt-1">Configure default settings and schedules for different positions.</p>
        </div>
        <button 
          onClick={() => {
            if (isFormOpen) {
              resetForm();
            } else {
              setIsFormOpen(true);
            }
          }}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg ${
            isFormOpen 
              ? 'bg-muted text-muted-foreground hover:bg-muted/80' 
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20'
          }`}
        >
          {isFormOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isFormOpen ? 'Cancel' : 'Create New Role'}
        </button>
      </div>

      {isFormOpen && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-3xl p-8 shadow-xl space-y-8"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Briefcase className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-black tracking-tight">{editingJobId ? 'Edit Job Role' : 'New Job Role'}</h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              {/* Basic Config */}
              <div className="xl:col-span-8 space-y-6">
                <div className="bg-muted/30 p-6 rounded-2xl border border-border space-y-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">General Configuration</h4>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Job Title</label>
                      <input
                        required
                        value={formData.title}
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        placeholder="e.g. Senior Developer"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hourly Rate ($)</label>
                        <input
                          required
                          type="number"
                          step="0.01"
                          value={formData.hourly_rate}
                          onChange={e => setFormData({...formData, hourly_rate: e.target.value})}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Weekly Hours</label>
                        <input
                          required
                          type="number"
                          value={formData.required_hours_per_week}
                          onChange={e => setFormData({...formData, required_hours_per_week: e.target.value})}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Grace Period (min)</label>
                        <input
                          required
                          type="number"
                          value={formData.grace_period}
                          onChange={e => setFormData({...formData, grace_period: e.target.value})}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="xl:col-span-4 space-y-6">
                <div className="bg-muted/30 p-6 rounded-2xl border border-border space-y-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Default Settings</h4>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Employment Type</label>
                      <select
                        value={formData.employment_type}
                        onChange={e => setFormData({...formData, employment_type: e.target.value})}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      >
                        <option value="full-time">Full Time</option>
                        <option value="part-time">Part Time</option>
                        <option value="contract">Contract</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Annual Leave (Days)</label>
                        <input type="number" value={formData.default_annual_leave_days} onChange={e => setFormData({...formData, default_annual_leave_days: e.target.value})} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="21" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sick Leave (Days)</label>
                        <input type="number" value={formData.default_sick_leave_days} onChange={e => setFormData({...formData, default_sick_leave_days: e.target.value})} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="7" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-background border border-border rounded-xl">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Overtime Policy</span>
                        <p className="text-xs font-medium">Allow Overtime</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.allow_overtime}
                        onChange={(e) => setFormData({...formData, allow_overtime: e.target.checked})}
                        className="w-5 h-5 rounded-lg border-border text-primary focus:ring-primary transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t border-border">
              <button type="button" onClick={resetForm} className="px-8 py-2.5 text-sm font-bold hover:bg-muted rounded-xl transition-colors">Cancel</button>
              <button 
                type="submit" 
                disabled={createJobMutation.isPending || updateJobMutation.isPending} 
                className="px-8 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {createJobMutation.isPending || updateJobMutation.isPending ? 'Saving...' : (editingJobId ? 'Update Job Role' : 'Create Job Role')}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground font-medium mt-4">Loading job roles...</p>
          </div>
        ) : jobs?.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground flex flex-col items-center">
            <div className="p-6 bg-muted rounded-full mb-6">
              <Briefcase className="w-12 h-12 opacity-20" />
            </div>
            <h3 className="text-xl font-bold text-foreground">No job roles found</h3>
            <p className="mt-2 max-w-xs mx-auto">Start by creating a job role to define positions, rates, and default schedules.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-muted-foreground uppercase tracking-widest bg-muted/30">
                <tr>
                  <th className="px-8 py-5 font-black">Job Title</th>
                  <th className="px-8 py-5 font-black">Hourly Rate</th>
                  <th className="px-8 py-5 font-black">Weekly Hours</th>
                  <th className="px-8 py-5 font-black">Employment Type</th>
                  <th className="px-8 py-5 font-black">Leave (Annual/Sick)</th>
                  <th className="px-8 py-5 font-black">Grace Period</th>
                  <th className="px-8 py-5 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs?.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/20 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="font-bold text-foreground">{job.title}</div>
                      <div className="text-[10px] text-muted-foreground font-medium mt-0.5 uppercase tracking-tighter">ID: #{job.id}</div>
                    </td>
                    <td className="px-8 py-5 font-black text-primary">${job.hourly_rate.toFixed(2)}</td>
                    <td className="px-8 py-5 font-medium">{job.required_hours_per_week}h / week</td>
                    <td className="px-8 py-5">
                      <span className="px-2 py-0.5 bg-muted rounded text-[10px] font-bold uppercase tracking-tighter capitalize">{job.employment_type || 'full-time'}</span>
                    </td>
                    <td className="px-8 py-5 font-medium">{job.default_annual_leave_days ?? 21} / {job.default_sick_leave_days ?? 7} days</td>
                    <td className="px-8 py-5 font-medium">{job.grace_period}m</td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(job)}
                          className="p-2.5 bg-background border border-border rounded-xl text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                          title="Edit Job Role"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(job.id, job.title)}
                          className="p-2.5 bg-background border border-border rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all"
                          title="Delete Job Role"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
