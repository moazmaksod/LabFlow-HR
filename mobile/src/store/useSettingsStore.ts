import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import api from '../lib/axios';

interface SettingsState {
  settings: any | null;
  fetchSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: null,
      fetchSettings: async () => {
        try {
          const response = await api.get('/settings');
          set({ settings: response.data });
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        }
      },
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
