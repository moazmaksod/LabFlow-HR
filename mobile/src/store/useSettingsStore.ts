import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import api from '../lib/axios';

interface SettingsState {
  settings: any | null;
  userTimezone: string | null;
  theme: 'light' | 'dark' | 'system';
  fetchSettings: () => Promise<void>;
  fetchPublicSettings: () => Promise<void>;
  setUserTimezone: (tz: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: null,
      userTimezone: null,
      theme: 'system',
      fetchSettings: async () => {
        try {
          const response = await api.get('/settings');
          set({ settings: response.data });
        } catch (error: any) {
          if (!error.isNetworkError) {
            console.error('Failed to fetch settings:', error);
          }
        }
      },
      fetchPublicSettings: async () => {
        try {
          const response = await api.get('/settings/public');
          set((state) => ({
            settings: { ...(state.settings || {}), ...response.data }
          }));
        } catch (error: any) {
          if (!error.isNetworkError) {
            console.error('Failed to fetch public settings:', error);
          }
        }
      },
      setUserTimezone: (tz) => set({ userTimezone: tz }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'labflow-settings-state',
      storage: createJSONStorage(() => ({
        getItem: async (name) => (await SecureStore.getItemAsync(name)) || null,
        setItem: async (name, value) => await SecureStore.setItemAsync(name, value),
        removeItem: async (name) => await SecureStore.deleteItemAsync(name),
      })),
    }
  )
);
