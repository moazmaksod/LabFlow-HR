import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Plus, Briefcase } from 'lucide-react';

interface Job {
  id: number;
  title: string;
  hourly_rate: number;
  required_hours: number;
  shift_start: string;
  shift_end: string;
  grace_period: number;
}

export default function JobManagement() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    hourly_rate: '',
    required_hours: '',
    shift_start: '09:00',
    shift_end: '17:00',
    grace_period: '15'
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
      setIsFormOpen(false);
      setFormData({
        title: '',
        hourly_rate: '',
        required_hours: '',
        shift_start: '09:00',
        shift_end: '17:00',
        grace_period: '15'
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createJobMutation.mutate({
      ...formData,
      hourly_rate: Number(formData.hourly_rate),
      required_hours: Number(formData.required_hours),
      grace_period: Number(formData.grace_period)
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Job Roles</h2>
        <button 
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Job
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Create New Job Role</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Job Title</label>
              <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. Senior Developer" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Hourly Rate ($)</label>
              <input required type="number" step="0.01" value={formData.hourly_rate} onChange={e => setFormData({...formData, hourly_rate: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. 25.50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Required Hours (per week)</label>
              <input required type="number" step="0.5" value={formData.required_hours} onChange={e => setFormData({...formData, required_hours: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. 40" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Grace Period (minutes)</label>
              <input required type="number" value={formData.grace_period} onChange={e => setFormData({...formData, grace_period: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" placeholder="e.g. 15" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift Start</label>
              <input required type="time" value={formData.shift_start} onChange={e => setFormData({...formData, shift_start: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift End</label>
              <input required type="time" value={formData.shift_end} onChange={e => setFormData({...formData, shift_end: e.target.value})} className="w-full px-3 py-2 bg-background border border-border rounded-lg" />
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors">Cancel</button>
              <button type="submit" disabled={createJobMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
                {createJobMutation.isPending ? 'Saving...' : 'Save Job'}
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
                  <th className="px-6 py-3 font-medium">Req. Hours</th>
                  <th className="px-6 py-3 font-medium">Shift</th>
                  <th className="px-6 py-3 font-medium">Grace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs?.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{job.title}</td>
                    <td className="px-6 py-4">${job.hourly_rate.toFixed(2)}</td>
                    <td className="px-6 py-4">{job.required_hours}h</td>
                    <td className="px-6 py-4">{job.shift_start} - {job.shift_end}</td>
                    <td className="px-6 py-4">{job.grace_period}m</td>
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
