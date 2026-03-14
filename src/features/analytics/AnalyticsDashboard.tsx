import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Users, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatStatusLabel } from '../../lib/utils';

const STATUS_COLORS: Record<string, string> = {
  'on_time': '#10b981', // green
  'late_in': '#f59e0b', // yellow
  'early_out': '#f97316', // orange
  'absent': '#ef4444', // red
  'half_day': '#a855f7', // purple
  'default': '#6366f1' // indigo
};

interface StatsData {
  statusDistribution: { name: string, value: number }[];
  dailyHours: { date: string, hours: number }[];
  today: { present: number, late: number, absent: number };
}

export default function AnalyticsDashboard() {
  const { data: stats, isLoading } = useQuery<StatsData>({
    queryKey: ['attendance-stats'],
    queryFn: async () => {
      const res = await api.get('/attendance/stats');
      return res.data;
    }
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading analytics...</div>;
  }

  const totalToday = (stats?.today.present || 0) + (stats?.today.late || 0) + (stats?.today.absent || 0);

  const formattedStatusDistribution = stats?.statusDistribution?.map(item => ({
    ...item,
    originalName: item.name,
    name: formatStatusLabel(item.name)
  })) || [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Users className="w-5 h-5" />
            <h3 className="font-medium">Total Tracked Today</h3>
          </div>
          <p className="text-3xl font-bold">{totalToday}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 text-green-600 dark:text-green-400 mb-2">
            <CheckCircle className="w-5 h-5" />
            <h3 className="font-medium">Present</h3>
          </div>
          <p className="text-3xl font-bold">{stats?.today.present || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 text-yellow-600 dark:text-yellow-400 mb-2">
            <Clock className="w-5 h-5" />
            <h3 className="font-medium">Late</h3>
          </div>
          <p className="text-3xl font-bold">{stats?.today.late || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-medium">Absent</h3>
          </div>
          <p className="text-3xl font-bold">{stats?.today.absent || 0}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Hours Worked */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Total Hours Worked (Last 7 Days)</h3>
          <div className="h-80">
            {stats?.dailyHours && stats.dailyHours.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyHours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 'auto']} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Hours" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </div>
        </div>

        {/* Pie Chart - Status Distribution */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Overall Status Distribution</h3>
          <div className="h-80">
            {stats?.statusDistribution && stats.statusDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={formattedStatusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {formattedStatusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.originalName] || STATUS_COLORS['default']} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
