import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
