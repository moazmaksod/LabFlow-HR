import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../../store/useAuthStore';

interface Settings {
  id: number;
  office_lat: number;
  office_lng: number;
  radius_meters: number;
  timezone: string;
}

const TIMEZONE_GROUPS = {
  "UTC": ["UTC"],
  "Africa": ["Africa/Cairo", "Africa/Casablanca", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi"],
  "America": ["America/Chicago", "America/Los_Angeles", "America/Mexico_City", "America/New_York", "America/Sao_Paulo", "America/Toronto"],
  "Asia": ["Asia/Bangkok", "Asia/Dubai", "Asia/Hong_Kong", "Asia/Jakarta", "Asia/Karachi", "Asia/Kolkata", "Asia/Riyadh", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo"],
  "Australia": ["Australia/Brisbane", "Australia/Melbourne", "Australia/Perth", "Australia/Sydney"],
  "Europe": ["Europe/Amsterdam", "Europe/Berlin", "Europe/Istanbul", "Europe/London", "Europe/Madrid", "Europe/Moscow", "Europe/Paris", "Europe/Rome"],
  "Pacific": ["Pacific/Auckland", "Pacific/Fiji", "Pacific/Honolulu"]
};

export default function SettingsView() {
  const { t } = useTranslation();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [radius, setRadius] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

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
      setLat(settings.office_lat.toString());
      setLng(settings.office_lng.toString());
      setRadius(settings.radius_meters.toString());
      setTimezone(settings.timezone || 'UTC');
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (newSettings: { office_lat: number, office_lng: number, radius_meters: number, timezone: string }) => {
      const res = await axios.put('/api/settings', newSettings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSuccessMsg('Settings updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: (error: any) => {
      setErrorMsg(error.response?.data?.error || 'Failed to update settings');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseInt(radius, 10);

    if (isNaN(parsedLat) || isNaN(parsedLng) || isNaN(parsedRadius)) {
      setErrorMsg('Please enter valid numbers for all fields.');
      return;
    }

    if (!timezone.trim()) {
      setErrorMsg('Please enter a valid timezone.');
      return;
    }

    updateMutation.mutate({
      office_lat: parsedLat,
      office_lng: parsedLng,
      radius_meters: parsedRadius,
      timezone: timezone.trim()
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MapPin className="text-indigo-600 dark:text-indigo-400" />
          Company Settings & Geofence
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Configure the central office location and the allowed radius for employees to clock in/out.
        </p>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center gap-3 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle className="w-5 h-5" />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-xl flex items-center gap-3 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5" />
          {errorMsg}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Geofence Configuration</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Office Latitude
              </label>
              <input
                type="number"
                step="any"
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:text-white"
                placeholder="e.g., 37.7749"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Office Longitude
              </label>
              <input
                type="number"
                step="any"
                required
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:text-white"
                placeholder="e.g., -122.4194"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Allowed Radius (meters)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                required
                min="10"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-full md:w-1/2 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:text-white"
                placeholder="e.g., 50"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Employees must be within this distance to clock in/out.
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Company Timezone (IANA Format)
            </label>
            <div className="flex items-center gap-4">
              <select
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full md:w-1/2 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:text-white"
              >
                {Object.entries(TIMEZONE_GROUPS).map(([region, zones]) => (
                  <optgroup key={region} label={region}>
                    {zones.map(zone => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Used for attendance date calculation.
              </span>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
