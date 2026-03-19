import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';
import { getUnsyncedLogs, markLogsAsSynced, getUnsyncedRequests, markRequestsAsSynced } from '../lib/db';
import api from '../lib/axios';

import { useAttendanceStore } from './useAttendanceStore';
import { useAuthStore } from './useAuthStore';

interface NetworkState {
  serverTimezone: string;
  serverTimeOffset: number;
  lastLocalSyncTime: number;
  setServerTimeOffset: (offset: number) => void;
  setLastLocalSyncTime: (time: number) => void;
  syncServerTime: () => Promise<void>;
  isConnected: boolean;
  isSyncing: boolean;
  setConnected: (connected: boolean) => void;
  syncOfflineRecords: () => Promise<void>;
}

import * as SecureStore from 'expo-secure-store';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set, get) => ({
      serverTimeOffset: 0,
      serverTimezone: 'UTC',
      lastLocalSyncTime: 0,
      isConnected: true,
      isSyncing: false,
      setServerTimeOffset: (offset) => set({ serverTimeOffset: offset }),
      setLastLocalSyncTime: (time) => set({ lastLocalSyncTime: time }),
      syncServerTime: async () => {
        if (!get().isConnected) return;
        try {
          const response = await api.get('/attendance/server-time');
          const serverTime = new Date(response.data.serverTime).getTime();
          const localTime = Date.now();
          set({
            serverTimeOffset: serverTime - localTime,
            lastLocalSyncTime: localTime,
            serverTimezone: response.data.timezone || 'UTC'
          });
        } catch (error) {
          console.error('Failed to sync server time:', error);
        }
      },
      setConnected: (connected) => set({ isConnected: connected }),
      syncOfflineRecords: async () => {
        if (get().isSyncing) return;
    set({ isSyncing: true });
    try {
      let hasSyncedAny = false;
      // Sync Attendance Logs
      const logs = getUnsyncedLogs() as any[];
      if (logs.length > 0) {
        const logsToSend = logs.map(log => ({
          ...log,
          // We no longer send delay_in_milliseconds. We just send the calculated offline timestamp.
        }));

        const response = await api.post('/attendance/sync', { logs: logsToSend });
        const results = response.data.results as any[];
        
        // Mark all processed logs as synced (even if skipped due to business logic)
        const processedIds = results.map((r: any) => r.logId);
        if (processedIds.length > 0) {
          markLogsAsSynced(processedIds);
          hasSyncedAny = true;
        }

        // Handle specific rejections
        const suspendedResult = results.find((r: any) => r.reason === 'REASON: SUSPENDED');
        const inactiveResult = results.find((r: any) => r.reason === 'REASON: INACTIVE');
        const otherSkipped = results.filter((r: any) => r.status === 'skipped' && r.reason !== 'REASON: SUSPENDED' && r.reason !== 'REASON: INACTIVE');

        if (suspendedResult) {
          Alert.alert('Account Suspended', 'Your account has been suspended. Please contact HR.');
          await useAuthStore.getState().logout();
          set({ isSyncing: false });
          return; // Stop further syncing
        } 
        
        if (inactiveResult) {
          Alert.alert('Sync Rejected', 'Offline attendance rejected. Your account is currently inactive.');
        }

        if (otherSkipped.length > 0) {
          // Optional: Show a generic alert for other skipped reasons if needed
          // For now, we just log them as they are likely business logic rejections (e.g. already clocked in)
          console.log('Some offline logs were skipped by server:', otherSkipped);
        }
      }

      // Sync Requests
      const requests = getUnsyncedRequests() as any[];
      if (requests.length > 0) {
        const syncedRequestIds: number[] = [];
        for (const req of requests) {
          try {
            const payload = JSON.parse(req.payload);
            const method = req.method?.toLowerCase() || 'post';
            
            if (method === 'put') {
              await api.put(req.endpoint, payload);
            } else if (method === 'delete') {
              await api.delete(req.endpoint, { data: payload });
            } else {
              await api.post(req.endpoint, payload);
            }
            
            syncedRequestIds.push(req.id);
            hasSyncedAny = true;
          } catch (err: any) {
            // If it's a server error (e.g., 400 Bad Request), we should still mark it as synced so it doesn't block
            if (err.response) {
              syncedRequestIds.push(req.id);
              hasSyncedAny = true;
            }
          }
        }
        if (syncedRequestIds.length > 0) {
          markRequestsAsSynced(syncedRequestIds);
        }
      }

      // If we synced anything, fetch authoritative state
      if (hasSyncedAny) {
        try {
          const [profileRes, logsRes] = await Promise.all([
            api.get('/users/profile'),
            api.get('/attendance/my-logs')
          ]);

          const attendanceStore = useAttendanceStore.getState();
          attendanceStore.setUserProfile(profileRes.data);

          const logs = logsRes.data;
          const today = new Date().toISOString().split('T')[0];
          const activeSession = logs.find((l: any) => l.date === today && !l.check_out);
          
          if (activeSession) {
            attendanceStore.setStatus(activeSession.current_status || 'working');
            
            let consumed = 0;
            if (activeSession.breaks && Array.isArray(activeSession.breaks)) {
              activeSession.breaks.forEach((b: any) => {
                const start = new Date(b.start_time).getTime();
                const end = b.end_time ? new Date(b.end_time).getTime() : new Date().getTime();
                consumed += (end - start) / (1000 * 60);
              });
            }
            attendanceStore.setConsumedBreakMinutes(Math.floor(consumed));
          } else {
            attendanceStore.setStatus('none');
            attendanceStore.setConsumedBreakMinutes(0);
          }
        } catch (fetchError) {
          console.error('Failed to fetch authoritative state after sync:', fetchError);
        }
      }
    } catch (error) {
      console.error('Auto-sync failed:', error);
    } finally {
      set({ isSyncing: false });
    }
  }
}),
    {
      name: 'labflow-network-state',
      storage: createJSONStorage(() => ({
        getItem: async (name) => (await SecureStore.getItemAsync(name)) || null,
        setItem: async (name, value) => await SecureStore.setItemAsync(name, value),
        removeItem: async (name) => await SecureStore.deleteItemAsync(name),
      })),
      partialize: (state) => ({
        serverTimeOffset: state.serverTimeOffset,
        lastLocalSyncTime: state.lastLocalSyncTime,
        serverTimezone: state.serverTimezone
      }), // only persist time offsets
    }
  )
);

// Initialize network listener
NetInfo.addEventListener(state => {
  const isConnected = !!state.isConnected && !!state.isInternetReachable;
  const wasConnected = useNetworkStore.getState().isConnected;
  
  useNetworkStore.getState().setConnected(isConnected);
  
  // Trigger sync when coming back online
  if (isConnected && !wasConnected) {
    useNetworkStore.getState().syncServerTime();
    useNetworkStore.getState().syncOfflineRecords();
  }
});
