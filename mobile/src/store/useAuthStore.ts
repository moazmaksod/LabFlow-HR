import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => Promise<void>;
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: async () => {
        set({ user: null, token: null, isAuthenticated: false });
        try {
          await SecureStore.deleteItemAsync('labflow-mobile-auth');
        } catch (e) {
          console.error('Failed to clear SecureStore on logout', e);
        }
      },
    }),
    {
      name: 'labflow-mobile-auth',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);
