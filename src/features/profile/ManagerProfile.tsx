import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { User, Image as ImageIcon, Camera } from 'lucide-react';
import { EmployeeProfileSchema } from '../../../shared/validations';
import { formatForDateInput, parseFromDateInput, getDeviceTimezone, getSupportedTimezones } from '../../lib/timeManager';

type ProfileUpdateData = z.infer<typeof EmployeeProfileSchema>;

export default function ManagerProfile() {
  const { user, login } = useAuthStore();
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof EmployeeProfileSchema>>({
    resolver: zodResolver(EmployeeProfileSchema),
    defaultValues: {
      legal_name: '',
      personal_phone: '',
      date_of_birth: undefined,
      national_id: '',
      bio: '',
      display_timezone: '',
    },
  });

  const watchLegalName = watch('legal_name');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['manager-profile'],
    queryFn: async () => {
      const res = await api.get('/users/profile');
      return res.data;
    }
  });

  useEffect(() => {
    if (profile) {
      reset({
        legal_name: profile.legal_name || profile.name || '',
        personal_phone: profile.personal_phone || '',
        date_of_birth: formatForDateInput(profile.date_of_birth, user?.display_timezone) || '',
        national_id: profile.national_id || '',
        bio: profile.bio || '',
        display_timezone: profile.display_timezone || '',
      });
      setAvatarUrl(profile.profile_picture_url || '');
      setPreviewUrl(profile.profile_picture_url || '');
    }
  }, [profile, reset, user?.display_timezone]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.put('/users/profile', data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
      setSuccessMsg('Profile updated successfully!');
      if (user) {
        login({ ...user, name: data.name, display_timezone: data.display_timezone }, useAuthStore.getState().token!);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const onSubmit = (data: z.infer<typeof EmployeeProfileSchema>) => {
    const payload = {
      name: data.legal_name || null,
      legal_name: data.legal_name || null,
      personal_phone: data.personal_phone || null,
      date_of_birth: data.date_of_birth
        ? (data.date_of_birth instanceof Date
            ? data.date_of_birth.toISOString().split('T')[0]
            : new Date(data.date_of_birth).toISOString().split('T')[0])
        : null,
      national_id: data.national_id || null,
      bio: data.bio || null,
      display_timezone: data.display_timezone || null,
      profile_picture_url: avatarUrl || null,
    };

    updateMutation.mutate(payload);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading profile...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <User className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">My Profile</h2>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {successMsg && (
            <div className="p-3 text-sm text-green-600 bg-green-500/10 border border-green-500/20 rounded-lg">
              {successMsg}
            </div>
          )}
          {updateMutation.isError && (
            <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg">
              Failed to update profile.
            </div>
          )}

          <div className="space-y-4">
            <div className="flex justify-center mb-6">
              <div className="relative group cursor-pointer">
                <img
                  src={previewUrl ? (previewUrl.startsWith('http') ? previewUrl : `${window.location.origin}${previewUrl}`) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(watchLegalName || 'User')}
                  alt="Profile Preview"
                  className="w-24 h-24 rounded-full object-cover border-2 border-border group-hover:opacity-50 transition-opacity"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(watchLegalName || 'User');
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-8 h-8 text-white drop-shadow-md" />
                </div>
                <input
                  type="file"
                  id="avatar-upload"
                  accept="image/*"
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setIsUploading(true);
                      const uploadData = new FormData();
                      uploadData.append('avatar', file);
                      try {
                        const res = await api.post('/users/upload-avatar', uploadData, {
                          headers: {
                            'Content-Type': 'multipart/form-data',
                          },
                        });
                        setAvatarUrl(res.data.url);
                        setPreviewUrl(res.data.url);
                      } catch (err) {
                        alert('Failed to upload profile image');
                      } finally {
                        setIsUploading(false);
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <input
                type="text"
                {...register('legal_name')}
                className={`w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 ${errors.legal_name ? 'border-red-500' : 'border-border'}`}
              />
              {errors.legal_name && <p className="text-xs text-red-500">{errors.legal_name.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email Address (Read Only)</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Role (Read Only)</label>
              <input
                type="text"
                value={profile?.role || ''}
                disabled
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-muted-foreground cursor-not-allowed capitalize"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Phone Number</label>
              <input
                type="tel"
                {...register('personal_phone')}
                className={`w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 ${errors.personal_phone ? 'border-red-500' : 'border-border'}`}
                placeholder="+1 234 567 8900"
              />
              {errors.personal_phone && <p className="text-xs text-red-500">{errors.personal_phone.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Date of Birth</label>
              <input
                type="date"
                {...register('date_of_birth')}
                className={`w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 ${errors.date_of_birth ? 'border-red-500' : 'border-border'}`}
              />
              {errors.date_of_birth && <p className="text-xs text-red-500">{errors.date_of_birth.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">National ID</label>
              <input
                type="text"
                {...register('national_id')}
                className={`w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 ${errors.national_id ? 'border-red-500' : 'border-border'}`}
              />
              {errors.national_id && <p className="text-xs text-red-500">{errors.national_id.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Bio</label>
              <textarea
                {...register('bio')}
                className={`w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 ${errors.bio ? 'border-red-500' : 'border-border'}`}
                rows={3}
              />
              {errors.bio && <p className="text-xs text-red-500">{errors.bio.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Display Timezone</label>
              <select
                {...register('display_timezone')}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Device Default ({getDeviceTimezone()})</option>
                {getSupportedTimezones().map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

          </div>

          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || updateMutation.isPending || isUploading}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isUploading ? 'Uploading image...' : (isSubmitting || updateMutation.isPending ? 'Saving...' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}