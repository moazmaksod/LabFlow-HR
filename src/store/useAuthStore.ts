import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  serverTimeOffset: number;
  login: (user: User, token: string, serverTime?: string | number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      serverTimeOffset: 0,
      login: (user, token, serverTime) => {
        let offset = 0;
        if (serverTime) {
          offset = new Date(serverTime).getTime() - Date.now();
        }
        set({ user, token, isAuthenticated: true, serverTimeOffset: offset });
      },
      logout: () => set({ user: null, token: null, isAuthenticated: false, serverTimeOffset: 0 }),
    }),
    {
      name: 'labflow-auth-storage',
    }
  )
);
