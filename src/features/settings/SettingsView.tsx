import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon, Save, AlertCircle, CheckCircle, ShieldAlert, Building2, CreditCard, Shield, FileText } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../../store/useAuthStore';
import { useLocation } from 'react-router-dom';

interface Settings {
  id: number;
  company_name: string;
  company_logo_url: string;
  brand_primary_color: string;
  support_contact: string;
  payroll_cycle_type: string;
  custom_payroll_cycle_days: number;
  overtime_rate_percent: number;
  weekend_rate_percent: number;
  attendance_bonus_amount: number;
  show_salary_estimate: number;
  geofence_toggle: number;
  office_lat: number;
  office_lng: number;
  geofence_radius: number;
  time_sync_interval: number;
  max_drift_threshold: number;
  accuracy_meters: number;
  device_binding_enforced: number;
  auto_checkout: number;
  step_away_grace_period: number;
  late_grace_period: number;
  max_monthly_permissions: number;
  enable_reminders: number;
  send_daily_report: number;
  maintenance_mode: number;
}

export default function SettingsView() {
  const { t } = useTranslation();
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();
  const location = useLocation();

  const tabQuery = new URLSearchParams(location.search).get('tab') as 'identity' | 'payroll' | 'security' | 'policy';
  const [activeTab, setActiveTab] = useState<'identity' | 'payroll' | 'security' | 'policy'>('identity');

  useEffect(() => {
    if (tabQuery) setActiveTab(tabQuery);
  }, [tabQuery]);

  const [formData, setFormData] = useState<Partial<Settings>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await axios.get<Settings>('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    }
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('logo', file);
      const res = await axios.post('/api/settings/logo', form, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setFormData(data.settings);
      setSuccessMsg('Logo uploaded successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (error: any) => {
      setErrorMsg(error.response?.data?.error || 'Failed to upload logo');
      setTimeout(() => setErrorMsg(''), 3000);
    },
    onSettled: () => {
      setUploadingLogo(false);
    }
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadingLogo(true);
      uploadLogoMutation.mutate(e.target.files[0]);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (newSettings: Partial<Settings>) => {
      const res = await axios.put('/api/settings', newSettings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setFormData(data); // Sync local form state with updated backend response
      setSuccessMsg('Settings updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (error: any) => {
      setErrorMsg(error.response?.data?.error || 'Failed to update settings');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  });

  const resetDeviceMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post('/api/auth/reset-device', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    },
    onSuccess: (data) => {
      setSuccessMsg(data.message);
      setTimeout(() => setSuccessMsg(''), 5000);
    },
    onError: (error: any) => {
      setErrorMsg(error.response?.data?.error || 'Failed to reset device binding');
      setTimeout(() => setErrorMsg(''), 5000);
    }
  });

  const handleResetDevice = () => {
    if (window.confirm('Are you sure? This will unbind your current mobile device. You will need to log in again from your phone to pair a new device.')) {
      resetDeviceMutation.mutate();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;

    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked ? 1 : 0;
    } else if (type === 'number') {
      finalValue = value === '' ? '' : parseFloat(value);
    }

    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Ensure numeric fields are actually numbers before submission
    const dataToSubmit = { ...formData };

    // Convert to float/int where necessary to ensure type safety in backend
    const numericFields = [
      'custom_payroll_cycle_days', 'overtime_rate_percent', 'weekend_rate_percent', 'attendance_bonus_amount',
      'office_lat', 'office_lng', 'geofence_radius', 'time_sync_interval',
      'max_drift_threshold', 'accuracy_meters', 'step_away_grace_period',
      'late_grace_period', 'max_monthly_permissions'
    ];

    for (const field of numericFields) {
      if (dataToSubmit[field as keyof Settings] !== undefined) {
         dataToSubmit[field as keyof Settings] = Number(dataToSubmit[field as keyof Settings]) as never;
      }
    }

    updateMutation.mutate(dataToSubmit);
  };

  if (isLoading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4 mb-6"></div>
        <div className="h-64 bg-muted rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center gap-3 border border-emerald-500/20">
          <CheckCircle className="w-5 h-5" />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 border border-red-500/20">
          <AlertCircle className="w-5 h-5" />
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        {/* Content Area */}
        <div className="flex-1 bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-6">

              {/* --- IDENTITY TAB --- */}
              {activeTab === 'identity' && (
                <>
                  <h2 className="text-lg font-semibold text-foreground mb-4 border-b border-border pb-2">Company Identity</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Company Name</label>
                      <input
                        type="text"
                        name="company_name"
                        value={formData.company_name || ''}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Company Logo</label>
                      <div className="flex items-center gap-4">
                        {formData.company_logo_url && (
                          <img src={formData.company_logo_url} alt="Company Logo" className="h-12 w-12 object-contain bg-background rounded" />
                        )}
                        <label className="cursor-pointer px-4 py-2 bg-muted text-muted-foreground border border-input rounded-xl hover:bg-accent transition-colors text-sm font-medium">
                          {uploadingLogo ? 'Uploading...' : 'Choose File'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoUpload}
                            disabled={uploadingLogo}
                          />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Brand Primary Color</label>
                      <div className="flex items-center gap-4">
                        <input
                          type="color"
                          name="brand_primary_color"
                          value={formData.brand_primary_color || '#4f46e5'}
                          onChange={handleChange}
                          className="h-10 w-20 rounded cursor-pointer border-0 p-0"
                        />
                        <span className="text-gray-500 font-mono">{formData.brand_primary_color || '#4f46e5'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Support Contact</label>
                      <input
                        type="text"
                        name="support_contact"
                        value={formData.support_contact || ''}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                        placeholder="Email or Phone"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* --- PAYROLL TAB --- */}
              {activeTab === 'payroll' && (
                <>
                  <h2 className="text-lg font-semibold text-foreground mb-4 border-b border-border pb-2">Payroll Settings</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Payroll Cycle Type</label>
                      <select
                        name="payroll_cycle_type"
                        value={formData.payroll_cycle_type || 'calendar_month'}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      >
                        <option value="calendar_month">Calendar Month</option>
                        <option value="fixed_30">Fixed 30 Days</option>
                        <option value="custom">Custom</option>
                      </select>
                      {formData.payroll_cycle_type === 'custom' && (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-muted-foreground mb-2">Custom Cycle Days</label>
                          <input
                            type="number"
                            name="custom_payroll_cycle_days"
                            value={formData.custom_payroll_cycle_days ?? 0}
                            onChange={handleChange}
                            className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Overtime Rate (%)</label>
                      <input
                        type="number"
                        name="overtime_rate_percent"
                        value={formData.overtime_rate_percent ?? 150}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Weekend Rate (%)</label>
                      <input
                        type="number"
                        name="weekend_rate_percent"
                        value={formData.weekend_rate_percent ?? 200}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Attendance Bonus Amount</label>
                      <input
                        type="number"
                        name="attendance_bonus_amount"
                        value={formData.attendance_bonus_amount ?? 0}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="show_salary_estimate"
                        name="show_salary_estimate"
                        checked={!!formData.show_salary_estimate}
                        onChange={handleChange}
                        className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
                      />
                      <label htmlFor="show_salary_estimate" className="text-sm font-medium text-muted-foreground">
                        Show Salary Estimate to Employees
                      </label>
                    </div>
                  </div>

                </>
              )}

              {/* --- SECURITY TAB --- */}
              {activeTab === 'security' && (
                <>
                  <h2 className="text-lg font-semibold text-foreground mb-4 border-b border-border pb-2">Security & Geofence</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2 flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="geofence_toggle"
                        name="geofence_toggle"
                        checked={!!formData.geofence_toggle}
                        onChange={handleChange}
                        className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
                      />
                      <label htmlFor="geofence_toggle" className="text-sm font-medium text-muted-foreground">
                        Enable Geofencing
                      </label>
                    </div>

                    {!!formData.geofence_toggle && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">Office Latitude</label>
                          <input
                            type="number"
                            step="any"
                            name="office_lat"
                            value={formData.office_lat ?? 0}
                            onChange={handleChange}
                            className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">Office Longitude</label>
                          <input
                            type="number"
                            step="any"
                            name="office_lng"
                            value={formData.office_lng ?? 0}
                            onChange={handleChange}
                            className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">Allowed Radius (meters)</label>
                          <input
                            type="number"
                            name="geofence_radius"
                            value={formData.geofence_radius ?? 50}
                            onChange={handleChange}
                            className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">Min Accuracy (meters)</label>
                          <input
                            type="number"
                            name="accuracy_meters"
                            value={formData.accuracy_meters ?? 100}
                            onChange={handleChange}
                            className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Time Sync Interval (seconds)</label>
                      <input
                        type="number"
                        name="time_sync_interval"
                        value={formData.time_sync_interval ?? 300}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Max Time Drift Threshold (s)</label>
                      <input
                        type="number"
                        name="max_drift_threshold"
                        value={formData.max_drift_threshold ?? 10}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>

                    <div className="md:col-span-2 flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="device_binding_enforced"
                        name="device_binding_enforced"
                        checked={!!formData.device_binding_enforced}
                        onChange={handleChange}
                        className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
                      />
                      <label htmlFor="device_binding_enforced" className="text-sm font-medium text-muted-foreground">
                        Enforce Mobile Device Binding (One device per user)
                      </label>
                    </div>
                  </div>

                  {user?.role === 'manager' && (
                    <div className="mt-8 bg-red-50 dark:bg-red-900/10 rounded-2xl shadow-sm border border-red-200 dark:border-red-900/30 overflow-hidden">
                      <div className="p-6 border-b border-red-200 dark:border-red-900/20">
                        <h2 className="text-lg font-semibold text-red-900 dark:text-red-400 flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5" />
                          Admin Actions
                        </h2>
                      </div>
                      <div className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-medium text-red-900 dark:text-red-300">Reset My Mobile Device Binding</h3>
                            <p className="text-sm text-red-700/80 dark:text-red-400/80 mt-1">
                              If you have lost your phone or need to switch to a new mobile device, use this to clear your current binding.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleResetDevice}
                            disabled={resetDeviceMutation.isPending}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {resetDeviceMutation.isPending ? 'Resetting...' : 'Reset Device Binding'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                
                </>
              )}

              {/* --- POLICY TAB --- */}
              {activeTab === 'policy' && (
                <>
                  <h2 className="text-lg font-semibold text-foreground mb-4 border-b border-border pb-2">Company Policies</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Global Late Grace Period (mins)</label>
                      <input
                        type="number"
                        name="late_grace_period"
                        value={formData.late_grace_period ?? 15}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Step Away Grace Period (mins)</label>
                      <input
                        type="number"
                        name="step_away_grace_period"
                        value={formData.step_away_grace_period ?? 5}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Max Monthly Permissions</label>
                      <input
                        type="number"
                        name="max_monthly_permissions"
                        value={formData.max_monthly_permissions ?? 3}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary "
                      />
                    </div>

                    <div className="md:col-span-2 space-y-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="auto_checkout"
                          name="auto_checkout"
                          checked={!!formData.auto_checkout}
                          onChange={handleChange}
                          className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
                        />
                        <label htmlFor="auto_checkout" className="text-sm font-medium text-muted-foreground">
                          Enable Auto-Checkout at end of shift
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="enable_reminders"
                          name="enable_reminders"
                          checked={!!formData.enable_reminders}
                          onChange={handleChange}
                          className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
                        />
                        <label htmlFor="enable_reminders" className="text-sm font-medium text-muted-foreground">
                          Enable Push Notifications/Reminders
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="send_daily_report"
                          name="send_daily_report"
                          checked={!!formData.send_daily_report}
                          onChange={handleChange}
                          className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
                        />
                        <label htmlFor="send_daily_report" className="text-sm font-medium text-muted-foreground">
                          Send Daily Report to Managers
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="maintenance_mode"
                          name="maintenance_mode"
                          checked={!!formData.maintenance_mode}
                          onChange={handleChange}
                          className="w-5 h-5 rounded border-input text-red-600 focus:ring-red-500"
                        />
                        <label htmlFor="maintenance_mode" className="text-sm font-medium text-red-700 dark:text-red-400">
                          Enable Maintenance Mode (System Offline)
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}

            </div>

            <div className="p-6 bg-background border-t border-border flex justify-end">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
