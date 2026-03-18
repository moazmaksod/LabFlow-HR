import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

export type AttendanceStatus = 'working' | 'away' | 'none';

interface AttendanceState {
  currentStatus: AttendanceStatus;
  consumedBreakMinutes: number;
  lastActionTimestamp: string | null;
  userProfile: any | null;
  
  // Actions
  setStatus: (status: AttendanceStatus) => void;
  setConsumedBreakMinutes: (minutes: number) => void;
  setLastActionTimestamp: (timestamp: string | null) => void;
  setUserProfile: (profile: any) => void;
  reset: () => void;
}

// Custom storage engine for Zustand using Expo SecureStore
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return (await SecureStore.getItemAsync(name)) || null;
    } catch (e) {
      console.error('SecureStore getItem error:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (e) {
      console.error('SecureStore setItem error:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (e) {
      console.error('SecureStore removeItem error:', e);
    }
  },
};

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set) => ({
      currentStatus: 'none',
      consumedBreakMinutes: 0,
      lastActionTimestamp: null,
      userProfile: null,

      setStatus: (status) => set({ currentStatus: status }),
      setConsumedBreakMinutes: (minutes) => set({ consumedBreakMinutes: minutes }),
      setLastActionTimestamp: (timestamp) => set({ lastActionTimestamp: timestamp }),
      setUserProfile: (profile) => set({ userProfile: profile }),
      reset: () => set({ currentStatus: 'none', consumedBreakMinutes: 0, lastActionTimestamp: null, userProfile: null }),
    }),
    {
      name: 'labflow-attendance-state',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);
