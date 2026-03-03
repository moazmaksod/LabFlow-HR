import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { CheckCircle, XCircle, UserCheck } from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string | null;
  job_id: number | null;
  job_title: string | null;
}

interface Job {
  id: number;
  title: string;
}

export default function EmployeeList() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    }
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await api.get('/jobs');
      return res.data;
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role, job_id }: { id: number, role: string, job_id?: number }) => {
      const res = await api.put(`/users/${id}/role`, { role, job_id });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSelectedUserId(null);
      setSelectedJobId('');
    }
  });

  const handleApprove = (userId: number) => {
    if (!selectedJobId) {
      alert('Please select a job role first');
      return;
    }
    updateRoleMutation.mutate({ id: userId, role: 'employee', job_id: Number(selectedJobId) });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Employee Management</h2>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {usersLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading employees...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Job Title</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users?.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{user.name}</td>
                    <td className="px-6 py-4">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'manager' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' :
                        user.role === 'employee' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{user.job_title || '-'}</td>
                    <td className="px-6 py-4">
                      {user.status === 'active' ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle className="w-4 h-4"/> Active</span>
                      ) : user.status === 'inactive' ? (
                         <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="w-4 h-4"/> Inactive</span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 'pending' && (
                        <div className="flex items-center gap-2">
                          {selectedUserId === user.id ? (
                            <div className="flex items-center gap-2">
                              <select 
                                className="px-2 py-1 text-sm bg-background border border-border rounded"
                                value={selectedJobId}
                                onChange={(e) => setSelectedJobId(e.target.value)}
                              >
                                <option value="">Select Job...</option>
                                {jobs?.map(job => (
                                  <option key={job.id} value={job.id}>{job.title}</option>
                                ))}
                              </select>
                              <button 
                                onClick={() => handleApprove(user.id)}
                                disabled={updateRoleMutation.isPending}
                                className="text-green-600 hover:text-green-700 font-medium text-sm"
                              >
                                Confirm
                              </button>
                              <button 
                                onClick={() => setSelectedUserId(null)}
                                className="text-muted-foreground hover:text-foreground font-medium text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setSelectedUserId(user.id)}
                              className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                            >
                              <UserCheck className="w-4 h-4" />
                              Approve
                            </button>
                          )}
                        </div>
                      )}
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
