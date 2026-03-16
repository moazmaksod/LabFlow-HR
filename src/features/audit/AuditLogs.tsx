import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Shield, Search, Filter, User, Clock, ArrowRight, Database } from 'lucide-react';
import api from '../../lib/axios';

interface AuditLog {
    id: number;
    entity_name: string;
    entity_id: number;
    action: string;
    actor_id: number | null;
    actor_name: string | null;
    actor_email: string | null;
    old_values: any;
    new_values: any;
    created_at: string;
}

export const AuditLogs: React.FC = () => {
    const { t } = useTranslation();
    const [entityName, setEntityName] = useState('');
    const [action, setAction] = useState('');

    const { data: logs, isLoading, error } = useQuery<AuditLog[]>({
        queryKey: ['auditLogs', entityName, action],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (entityName) params.append('entity_name', entityName);
            if (action) params.append('action', action);
            const response = await api.get(`/audit?${params.toString()}`);
            return response.data;
        }
    });

    if (isLoading) return (
        <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-muted-foreground animate-pulse">Retrieving secure audit logs...</p>
        </div>
    );
    
    if (error) return (
        <div className="p-8 text-center bg-destructive/5 border border-destructive/20 rounded-xl">
            <p className="text-sm font-bold text-destructive">Security Error: Failed to load audit trail.</p>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Shield className="w-6 h-6 text-primary" />
                        Global Audit Trail
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">Immutable record of all system modifications and administrative actions.</p>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <select
                            value={entityName}
                            onChange={(e) => setEntityName(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none min-w-[160px]"
                        >
                            <option value="">All Entities</option>
                            <option value="users">Users</option>
                            <option value="profiles">Profiles</option>
                            <option value="attendance">Attendance</option>
                            <option value="requests">Requests</option>
                            <option value="payrolls">Payrolls</option>
                            <option value="settings">Settings</option>
                        </select>
                    </div>
                    
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <select
                            value={action}
                            onChange={(e) => setAction(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none min-w-[160px]"
                        >
                            <option value="">All Actions</option>
                            <option value="CREATE">Create</option>
                            <option value="UPDATE">Update</option>
                            <option value="DELETE">Delete</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="divide-y divide-border">
                    {logs?.map((log) => (
                        <div key={log.id} className="p-5 hover:bg-muted/30 transition-colors group">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                            log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800' :
                                            log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                                            'bg-rose-100 text-rose-800'
                                        }`}>
                                            {log.action}
                                        </span>
                                        <span className="text-sm font-bold text-foreground">
                                            {log.entity_name} <span className="text-muted-foreground font-normal">#{log.entity_id}</span>
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <User className="w-3 h-3" />
                                            <span className="font-medium">
                                                {log.actor_name ? `${log.actor_name}` : <span className="italic opacity-50">System Process</span>}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="w-3 h-3" />
                                            <span className="font-mono">
                                                {format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                                    LOG_ID: {log.id.toString().padStart(6, '0')}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground px-1">
                                        <Database className="w-3 h-3" />
                                        Previous State
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 border border-border/50 overflow-x-auto">
                                        <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                                            {log.old_values ? JSON.stringify(log.old_values, null, 2) : '// No previous data'}
                                        </pre>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-primary px-1">
                                        <ArrowRight className="w-3 h-3" />
                                        New State
                                    </div>
                                    <div className="bg-primary/[0.02] rounded-lg p-3 border border-primary/10 overflow-x-auto">
                                        <pre className="text-[11px] font-mono text-foreground leading-relaxed">
                                            {log.new_values ? JSON.stringify(log.new_values, null, 2) : '// No new data'}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {logs?.length === 0 && (
                        <div className="p-12 text-center flex flex-col items-center">
                            <Shield className="w-12 h-12 text-muted-foreground opacity-20 mb-3" />
                            <p className="text-sm text-muted-foreground font-medium italic">No audit entries match the current filters.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
