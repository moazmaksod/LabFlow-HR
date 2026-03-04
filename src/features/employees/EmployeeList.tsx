import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { CheckCircle, XCircle, UserCheck, Search, Filter, MoreVertical, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import EmployeeDetail from './EmployeeDetail';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string | null;
  job_id: number | null;
  job_title: string | null;
  is_clocked_in: number;
}

interface Job {
  id: number;
  title: string;
}

export default function EmployeeList() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [viewingEmployeeId, setViewingEmployeeId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleApprove = (e: React.MouseEvent, userId: number) => {
    e.stopPropagation();
    if (!selectedJobId) {
      alert('Please select a job role first');
      return;
    }
    updateRoleMutation.mutate({ id: userId, role: 'employee', job_id: Number(selectedJobId) });
  };

  const filteredUsers = users?.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.job_title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Employee Management</h2>
          <p className="text-muted-foreground text-sm">Manage your workforce, schedules, and roles.</p>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search employees..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
          <button className="p-2 border border-border rounded-lg hover:bg-muted transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex-1">
        {usersLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span>Loading employees...</span>
          </div>
        ) : (
          <div className="overflow-x-auto h-full">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-semibold border-b border-border">Status</th>
                  <th className="px-6 py-4 font-semibold border-b border-border">Name</th>
                  <th className="px-6 py-4 font-semibold border-b border-border">Email</th>
                  <th className="px-6 py-4 font-semibold border-b border-border">Role</th>
                  <th className="px-6 py-4 font-semibold border-b border-border">Job Title</th>
                  <th className="px-6 py-4 font-semibold border-b border-border text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers?.map((user) => (
                  <tr 
                    key={user.id} 
                    onClick={() => setViewingEmployeeId(user.id)}
                    className={`group cursor-pointer transition-colors ${viewingEmployeeId === user.id ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {user.is_clocked_in ? (
                          <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            <span className="text-[10px] font-bold uppercase text-green-600 dark:text-green-400">Working</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Circle className="w-2 h-2 fill-muted-foreground text-muted-foreground" />
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Off</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {user.name.charAt(0)}
                        </div>
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        user.role === 'manager' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' :
                        user.role === 'employee' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{user.job_title || '-'}</span>
                        {user.status === 'active' && (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {user.role === 'pending' ? (
                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                          {selectedUserId === user.id ? (
                            <div className="flex items-center gap-2">
                              <select 
                                className="px-2 py-1 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-primary"
                                value={selectedJobId}
                                onChange={(e) => setSelectedJobId(e.target.value)}
                              >
                                <option value="">Select Job...</option>
                                {jobs?.map(job => (
                                  <option key={job.id} value={job.id}>{job.title}</option>
                                ))}
                              </select>
                              <button 
                                onClick={(e) => handleApprove(e, user.id)}
                                disabled={updateRoleMutation.isPending}
                                className="text-green-600 hover:text-green-700 font-bold text-xs"
                              >
                                Confirm
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedUserId(null); }}
                                className="text-muted-foreground hover:text-foreground font-bold text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedUserId(user.id); }}
                              className="flex items-center gap-1 text-primary hover:text-primary/80 font-bold text-xs transition-colors"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Approve
                            </button>
                          )}
                        </div>
                      ) : (
                        <button className="p-1 hover:bg-muted rounded transition-colors opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      No employees found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail View Overlay */}
      <AnimatePresence>
        {viewingEmployeeId && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingEmployeeId(null)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <div className="fixed inset-y-0 right-0 w-full max-w-xl z-50">
              <EmployeeDetail 
                userId={viewingEmployeeId} 
                onClose={() => setViewingEmployeeId(null)} 
              />
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
