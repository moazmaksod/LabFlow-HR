import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { 
    Shield, Search, Filter, User, Clock, ArrowRight, Database, 
    LogIn, LogOut, UserPlus, Trash2, Edit3, PlusCircle, 
    ChevronDown, ChevronUp, Info, DollarSign, Calendar
} from 'lucide-react';
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

const formatCurrency = (val: any) => {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        minimumFractionDigits: 2 
    }).format(Number(val));
};

const getChangedKeys = (log: AuditLog) => {
    const oldData = parseValues(log.old_values);
    const newData = parseValues(log.new_values);
    const allKeys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
    return allKeys.filter(key => {
        if (['id', 'created_at', 'updated_at', 'password_hash', 'user_id', 'last_login', 'token_version'].includes(key)) return false;
        const oldVal = oldData[key];
        const newVal = newData[key];
        return JSON.stringify(oldVal) !== JSON.stringify(newVal);
    });
};

const ScheduleRenderer: React.FC<{ schedule: any }> = ({ schedule }) => {
    const data = typeof schedule === 'string' ? parseValues(schedule) : schedule;
    if (!data || typeof data !== 'object') return <span className="text-muted-foreground italic">Invalid schedule data</span>;

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
            {days.map(day => {
                const shifts = data[day] || [];
                return (
                    <div key={day} className="bg-muted/30 p-2 rounded-lg border border-border/50">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">{day}</div>
                        {shifts.length > 0 ? (
                            shifts.map((s: any, i: number) => (
                                <div key={i} className="text-[11px] font-medium flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-primary/60" />
                                    {s.start} - {s.end}
                                </div>
                            ))
                        ) : (
                            <div className="text-[10px] text-muted-foreground italic">Off</div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const ValueRenderer: React.FC<{ field: string; value: any }> = ({ field, value }) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground italic">null</span>;

    // Financial fields
    if (['base_salary', 'net_salary', 'hourly_rate', 'total_amount', 'bonus', 'deductions'].includes(field)) {
        return <span className="font-mono text-indigo-600 font-bold">{formatCurrency(value)}</span>;
    }

    // Schedule
    if (field === 'weekly_schedule') {
        return <ScheduleRenderer schedule={value} />;
    }

    // Status/Role
    if (field === 'status' || field === 'role') {
        const colors: Record<string, string> = {
            active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            inactive: 'bg-rose-100 text-rose-700 border-rose-200',
            pending: 'bg-amber-100 text-amber-700 border-amber-200',
            admin: 'bg-indigo-100 text-indigo-700 border-indigo-200',
            manager: 'bg-blue-100 text-blue-700 border-blue-200',
            employee: 'bg-slate-100 text-slate-700 border-slate-200',
        };
        const valStr = String(value).toLowerCase();
        return (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${colors[valStr] || 'bg-muted text-muted-foreground border-border'}`}>
                {String(value)}
            </span>
        );
    }

    // Boolean
    if (typeof value === 'boolean') {
        return (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${value ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {value ? 'Yes' : 'No'}
            </span>
        );
    }

    return <span className="text-foreground">{String(value)}</span>;
};

const LogSummary: React.FC<{ log: AuditLog }> = ({ log }) => {
    const changes = getChangedKeys(log);
    const newData = parseValues(log.new_values);

    if (log.action === 'LOGIN') return <span>User session initiated</span>;
    if (log.action === 'LOGOUT') return <span>User session terminated</span>;
    if (log.action === 'DELETE') return <span>Purged record from <span className="font-bold">{log.entity_name}</span></span>;

    if (log.action === 'CREATE' || log.action === 'REGISTER') {
        if (log.entity_name === 'payrolls') {
            return <span>Generated Draft Payroll for <span className="font-bold">{newData.month || 'N/A'}</span></span>;
        }
        if (log.entity_name === 'users') {
            return <span>Registered new user: <span className="font-bold">{newData.name || newData.email}</span></span>;
        }
        return <span>Created new <span className="font-bold">{log.entity_name}</span> entry</span>;
    }

    if (log.action === 'UPDATE') {
        if (changes.includes('weekly_schedule')) return <span>Modified Employee Weekly Schedule</span>;
        if (changes.includes('role') || changes.includes('status')) return <span>Updated Role and Status</span>;
        if (changes.includes('base_salary') || changes.includes('net_salary')) return <span>Adjusted Financial Compensation</span>;
        
        const fieldList = changes.slice(0, 2).join(', ');
        const moreCount = changes.length - 2;
        return (
            <span>
                Updated <span className="font-medium text-primary">{fieldList}</span>
                {moreCount > 0 && <span className="text-muted-foreground"> and {moreCount} other fields</span>}
            </span>
        );
    }

    return <span className="italic text-muted-foreground">System action performed</span>;
};

const AuditLogRow: React.FC<{ log: AuditLog }> = ({ log }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const changes = getChangedKeys(log);
    const oldData = parseValues(log.old_values);
    const newData = parseValues(log.new_values);

    const hasNoChanges = changes.length === 0 && !['LOGIN', 'LOGOUT', 'DELETE'].includes(log.action);

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

    return (
        <>
            <tr 
                className={`hover:bg-muted/30 transition-colors group align-top cursor-pointer ${isExpanded ? 'bg-muted/20' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                        <div className={`p-1 rounded-md transition-colors ${isExpanded ? 'bg-primary text-white' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}`}>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-mono font-bold text-muted-foreground">#{log.id.toString().padStart(6, '0')}</span>
                            <span className="text-xs font-medium text-foreground">{format(new Date(log.created_at), 'MMM dd, HH:mm')}</span>
                        </div>
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
                    <div className="text-xs font-medium text-foreground flex items-center gap-2">
                        {hasNoChanges ? (
                            <span className="text-muted-foreground/50 italic flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                System Update (No data changed)
                            </span>
                        ) : (
                            <LogSummary log={log} />
                        )}
                    </div>
                </td>
            </tr>
            <AnimatePresence>
                {isExpanded && !hasNoChanges && (
                    <tr>
                        <td colSpan={4} className="px-4 py-0 border-none">
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="overflow-hidden"
                            >
                                <div className="pb-6 pt-2 pl-12 pr-4">
                                    <div className="bg-muted/40 rounded-xl border border-border p-4 space-y-4">
                                        {log.action === 'CREATE' || log.action === 'REGISTER' ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {Object.entries(newData).map(([key, value]) => {
                                                    if (['id', 'created_at', 'updated_at', 'password_hash', 'token_version'].includes(key)) return null;
                                                    return (
                                                        <div key={key} className="space-y-1">
                                                            <div className="text-[10px] font-bold uppercase text-muted-foreground">{key}</div>
                                                            <div className="text-xs">
                                                                <ValueRenderer field={key} value={value} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {changes.map(key => (
                                                    <div key={key} className="flex flex-col gap-1 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                                                        <div className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                                                            <Edit3 className="w-3 h-3" />
                                                            {key}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[9px] uppercase text-rose-500 font-bold tracking-tighter">Previous</span>
                                                                <div className="text-xs opacity-70 line-through decoration-rose-300">
                                                                    <ValueRenderer field={key} value={oldData[key]} />
                                                                </div>
                                                            </div>
                                                            <ArrowRight className="w-4 h-4 text-muted-foreground/30 mt-3" />
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[9px] uppercase text-emerald-600 font-bold tracking-tighter">New Value</span>
                                                                <div className="text-xs font-medium">
                                                                    <ValueRenderer field={key} value={newData[key]} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {(log.action === 'LOGIN' || log.action === 'LOGOUT') && (
                                            <div className="flex items-center gap-4 text-xs">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Device Info</span>
                                                    <span className="font-mono bg-muted px-2 py-1 rounded border border-border">
                                                        {newData.deviceId || 'Unknown Device'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-bold uppercase text-muted-foreground">IP Address</span>
                                                    <span className="font-mono bg-muted px-2 py-1 rounded border border-border">
                                                        {newData.ip || '0.0.0.0'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </td>
                    </tr>
                )}
            </AnimatePresence>
        </>
    );
};

export const AuditLogs: React.FC = () => {
    const { t } = useTranslation();
    const [entityName, setEntityName] = useState('');
    const [action, setAction] = useState('');

    const { data: rawLogs, isLoading, error } = useQuery<AuditLog[]>({
        queryKey: ['auditLogs', entityName, action],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (entityName) params.append('entity_name', entityName);
            if (action) params.append('action', action);
            const response = await api.get(`/audit?${params.toString()}`);
            return response.data;
        }
    });

    // Filter out truly empty system updates if needed, or keep them for the "muted" view
    const logs = useMemo(() => {
        if (!rawLogs) return [];
        // Optional: Filter out logs that have no changes and are just "UPDATE"
        // return rawLogs.filter(log => {
        //     if (log.action !== 'UPDATE') return true;
        //     return getChangedKeys(log).length > 0;
        // });
        return rawLogs;
    }, [rawLogs]);

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
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Summary</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {logs?.map((log) => (
                                <AuditLogRow key={log.id} log={log} />
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
