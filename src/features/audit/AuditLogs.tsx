import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Shield, Search, Filter, User, Clock, ArrowRight, Database, LogIn, LogOut, UserPlus, Trash2, Edit3, PlusCircle, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../lib/axios';
import { motion, AnimatePresence } from 'motion/react';

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

const parseValues = (val: any) => {
    if (!val) return {};
    if (typeof val === 'string') {
        try {
            return JSON.parse(val);
        } catch (e) {
            return {};
        }
    }
    return val;
};

const InlineDiff: React.FC<{ log: AuditLog }> = ({ log }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const oldData = parseValues(log.old_values);
    const newData = parseValues(log.new_values);

    if (log.action === 'LOGIN' || log.action === 'LOGOUT') {
        return (
            <div className="flex items-center gap-2 text-muted-foreground italic text-xs">
                {log.action === 'LOGIN' ? <LogIn className="w-3 h-3 text-indigo-500" /> : <LogOut className="w-3 h-3 text-rose-500" />}
                <span>{log.action === 'LOGIN' ? 'User session initiated' : 'User session terminated'}</span>
                {newData?.deviceId && <span className="not-italic opacity-60 text-[10px] bg-muted px-1 rounded">ID: {newData.deviceId.substring(0, 8)}...</span>}
            </div>
        );
    }

    if (log.action === 'DELETE') {
        return (
            <div className="flex items-center gap-2 text-rose-600 font-medium text-xs">
                <Trash2 className="w-3 h-3" />
                <span>Record purged from {log.entity_name}</span>
            </div>
        );
    }

    const allKeys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
    const changes = allKeys.filter(key => {
        if (['id', 'created_at', 'updated_at', 'password_hash', 'user_id', 'last_login'].includes(key)) return false;
        const oldVal = oldData[key];
        const newVal = newData[key];
        return JSON.stringify(oldVal) !== JSON.stringify(newVal);
    });

    if (changes.length === 0) {
        return <span className="text-xs text-muted-foreground italic">No tracked field changes</span>;
    }

    const displayedChanges = isExpanded ? changes : changes.slice(0, 2);
    const hasMore = changes.length > 2;

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
                {displayedChanges.map(key => (
                    <div key={key} className="flex items-center gap-1.5 text-[11px]">
                        <span className="font-semibold text-muted-foreground">{key}:</span>
                        <div className="flex items-center gap-1">
                            {log.action !== 'CREATE' && log.action !== 'REGISTER' && (
                                <>
                                    <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded text-[10px] line-through opacity-70">
                                        {oldData[key] === null || oldData[key] === undefined ? 'null' : String(oldData[key])}
                                    </span>
                                    <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50" />
                                </>
                            )}
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-medium">
                                {newData[key] === null || newData[key] === undefined ? 'null' : String(newData[key])}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            {hasMore && (
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5"
                >
                    {isExpanded ? (
                        <><ChevronUp className="w-3 h-3" /> Show less</>
                    ) : (
                        <><ChevronDown className="w-3 h-3" /> +{changes.length - 2} more changes</>
                    )}
                </button>
            )}
        </div>
    );
};

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

    const getActionBadge = (action: string) => {
        const base = "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit";
        switch (action) {
            case 'CREATE':
            case 'REGISTER':
                return <span className={`${base} bg-emerald-100 text-emerald-700`}><PlusCircle className="w-3 h-3" /> {action}</span>;
            case 'UPDATE':
                return <span className={`${base} bg-blue-100 text-blue-700`}><Edit3 className="w-3 h-3" /> {action}</span>;
            case 'DELETE':
                return <span className={`${base} bg-rose-100 text-rose-700`}><Trash2 className="w-3 h-3" /> {action}</span>;
            case 'LOGIN':
            case 'LOGOUT':
                return <span className={`${base} bg-indigo-100 text-indigo-700`}><LogIn className="w-3 h-3" /> {action}</span>;
            default:
                return <span className={`${base} bg-muted text-muted-foreground`}>{action}</span>;
        }
    };

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
                            <option value="jobs">Jobs</option>
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
                            <option value="REGISTER">Register</option>
                            <option value="LOGIN">Login</option>
                            <option value="LOGOUT">Logout</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border">
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Log ID & Time</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actor</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Event</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Details / Changes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {logs?.map((log) => (
                                <tr key={log.id} className="hover:bg-muted/30 transition-colors group align-top">
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-mono font-bold text-muted-foreground">#{log.id.toString().padStart(6, '0')}</span>
                                            <span className="text-xs font-medium text-foreground">{format(new Date(log.created_at), 'MMM dd, HH:mm')}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                                                <User className="w-3.5 h-3.5 text-primary" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-foreground">
                                                    {log.actor_name || 'System Admin'}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                                    {log.actor_email || 'automated@system'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-1.5">
                                            {getActionBadge(log.action)}
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                                                <Database className="w-2.5 h-2.5" />
                                                {log.entity_name} <span className="opacity-60">#{log.entity_id}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <InlineDiff log={log} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
