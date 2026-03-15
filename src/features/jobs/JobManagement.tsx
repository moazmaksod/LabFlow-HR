import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Plus, Briefcase, Trash2, Edit2, AlertCircle, X } from 'lucide-react';

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
  preferred_gender: string;
  min_age: number | null;
  max_age: number | null;
  weekly_schedule?: string;
}

const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export default function JobManagement() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  
  const defaultSchedule: WeeklySchedule = {};
  DAYS.forEach(day => {
    defaultSchedule[day] = [];
  });

  const [formData, setFormData] = useState({
    title: '',
    hourly_rate: '',
    required_hours_per_week: '40',
    grace_period: '15',
    preferred_gender: 'any',
    min_age: '',
    max_age: '',
    weekly_schedule: defaultSchedule
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
      preferred_gender: 'any',
      min_age: '',
      max_age: '',
      weekly_schedule: defaultSchedule
    });
  };

  const handleEdit = (job: Job) => {
    setEditingJobId(job.id);
    
    let parsedSchedule = defaultSchedule;
    if (job.weekly_schedule) {
      try {
        const parsed = JSON.parse(job.weekly_schedule);
        const fullSchedule: WeeklySchedule = {};
        DAYS.forEach(day => {
          const daySchedule = parsed[day];
          if (Array.isArray(daySchedule)) {
            fullSchedule[day] = daySchedule;
          } else if (daySchedule && !daySchedule.isOff) {
            fullSchedule[day] = [{ start: daySchedule.start || '09:00', end: daySchedule.end || '17:00' }];
          } else {
            fullSchedule[day] = [];
          }
        });
        parsedSchedule = fullSchedule;
      } catch (e) {
        console.error('Failed to parse schedule', e);
      }
    }

    setFormData({
      title: job.title,
      hourly_rate: job.hourly_rate.toString(),
      required_hours_per_week: job.required_hours_per_week.toString(),
      grace_period: job.grace_period.toString(),
      preferred_gender: job.preferred_gender,
      min_age: job.min_age ? job.min_age.toString() : '',
      max_age: job.max_age ? job.max_age.toString() : '',
      weekly_schedule: parsedSchedule
    });
    setIsFormOpen(true);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      hourly_rate: Number(formData.hourly_rate),
      required_hours_per_week: Number(formData.required_hours_per_week),
      grace_period: Number(formData.grace_period),
      min_age: formData.min_age ? Number(formData.min_age) : null,
      max_age: formData.max_age ? Number(formData.max_age) : null,
      weekly_schedule: JSON.stringify(formData.weekly_schedule)
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Job Roles</h2>
        <button 
          onClick={() => {
            if (isFormOpen) {
              resetForm();
            } else {
              setIsFormOpen(true);
            }
          }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isFormOpen ? 'Cancel' : 'Add Job'}
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">{editingJobId ? 'Edit Job Role' : 'Create New Job Role'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2 lg:col-span-1">
              <label className="text-sm font-medium">Job Title</label>
              <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. Senior Developer" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Hourly Rate ($)</label>
              <input required type="number" step="0.01" value={formData.hourly_rate} onChange={e => setFormData({...formData, hourly_rate: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. 25.50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Weekly Required Hours</label>
              <input required type="number" step="0.5" value={formData.required_hours_per_week} onChange={e => setFormData({...formData, required_hours_per_week: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. 40" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Grace Period (minutes)</label>
              <input required type="number" value={formData.grace_period} onChange={e => setFormData({...formData, grace_period: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. 15" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred Gender</label>
              <select 
                value={formData.preferred_gender} 
                onChange={e => setFormData({...formData, preferred_gender: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
              >
                <option value="any">Any</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Min Age (Optional)</label>
              <input type="number" value={formData.min_age} onChange={e => setFormData({...formData, min_age: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. 18" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Age (Optional)</label>
              <input type="number" value={formData.max_age} onChange={e => setFormData({...formData, max_age: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. 65" />
            </div>

            <div className="md:col-span-2 lg:col-span-3 mt-4">
              <h4 className="text-sm font-medium mb-3">Default Weekly Schedule</h4>
              <div className="space-y-2 border border-border rounded-lg overflow-hidden">
                {DAYS.map((day) => (
                  <div key={day} className={`flex flex-col p-3 text-sm ${formData.weekly_schedule[day].length === 0 ? 'bg-muted/30' : 'bg-background'} border-b border-border last:border-0`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 w-32">
                        <span className="capitalize font-medium">{day}</span>
                      </div>
                      <button 
                        type="button"
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
                              type="button"
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
            </div>

            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-3 mt-4">
              <button type="button" onClick={resetForm} className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors">Cancel</button>
              <button type="submit" disabled={createJobMutation.isPending || updateJobMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
                {createJobMutation.isPending || updateJobMutation.isPending ? 'Saving...' : (editingJobId ? 'Update Job' : 'Save Job')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading jobs...</div>
        ) : jobs?.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
            <Briefcase className="w-12 h-12 mb-3 opacity-20" />
            <p>No job roles configured yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                <tr>
                  <th className="px-6 py-3 font-medium">Title</th>
                  <th className="px-6 py-3 font-medium">Rate / Hr</th>
                  <th className="px-6 py-3 font-medium">Weekly Hours</th>
                  <th className="px-6 py-3 font-medium">Gender</th>
                  <th className="px-6 py-3 font-medium">Age Range</th>
                  <th className="px-6 py-3 font-medium">Grace</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs?.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{job.title}</td>
                    <td className="px-6 py-4">${job.hourly_rate.toFixed(2)}</td>
                    <td className="px-6 py-4">{job.required_hours_per_week}h</td>
                    <td className="px-6 py-4 capitalize">{job.preferred_gender}</td>
                    <td className="px-6 py-4">
                      {job.min_age || 'Any'} - {job.max_age || 'Any'}
                    </td>
                    <td className="px-6 py-4">{job.grace_period}m</td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(job)}
                        className="p-2 text-muted-foreground hover:text-primary transition-colors"
                        title="Edit Job Role"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(job.id, job.title)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete Job Role"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
