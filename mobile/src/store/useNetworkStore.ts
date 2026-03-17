import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { getUnsyncedLogs, markLogsAsSynced, getUnsyncedRequests, markRequestsAsSynced } from '../lib/db';
import api from '../lib/axios';

interface NetworkState {
  isConnected: boolean;
  isSyncing: boolean;
  setConnected: (connected: boolean) => void;
  syncOfflineRecords: () => Promise<void>;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: true,
  isSyncing: false,
  setConnected: (connected) => set({ isConnected: connected }),
  syncOfflineRecords: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true });
    try {
      // Sync Attendance Logs
      const logs = getUnsyncedLogs() as any[];
      if (logs.length > 0) {
        const currentTimestamp = Date.now();
        const logsWithDelay = logs.map(log => ({
          ...log,
          delay_in_milliseconds: currentTimestamp - new Date(log.timestamp).getTime()
        }));

        const response = await api.post('/attendance/sync', { logs: logsWithDelay });
        const syncedIds = response.data.results.map((r: any) => r.logId);
        
        if (syncedIds.length > 0) {
          markLogsAsSynced(syncedIds);
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
          } catch (err: any) {
            // If it's a server error (e.g., 400 Bad Request), we should still mark it as synced so it doesn't block
            if (err.response) {
              syncedRequestIds.push(req.id);
            }
          }
        }
        if (syncedRequestIds.length > 0) {
          markRequestsAsSynced(syncedRequestIds);
        }
      }
    } catch (error) {
      console.error('Auto-sync failed:', error);
    } finally {
      set({ isSyncing: false });
    }
  }
}));

// Initialize network listener
NetInfo.addEventListener(state => {
  const isConnected = !!state.isConnected && !!state.isInternetReachable;
  const wasConnected = useNetworkStore.getState().isConnected;
  
  useNetworkStore.getState().setConnected(isConnected);
  
  // Trigger sync when coming back online
  if (isConnected && !wasConnected) {
    useNetworkStore.getState().syncOfflineRecords();
  }
});
