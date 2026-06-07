import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import api from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useAttendanceStore } from '../store/useAttendanceStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getUniqueDeviceId } from './device';

const BACKGROUND_HEARTBEAT_TASK = 'BACKGROUND_HEARTBEAT_TASK';

async function hydrateStoresFromSecureStore() {
  try {
    const authRaw = await SecureStore.getItemAsync('labflow-mobile-auth');
    if (authRaw) {
      const authData = JSON.parse(authRaw);
      if (authData?.state) {
        useAuthStore.setState({
          user: authData.state.user,
          token: authData.state.token,
          isAuthenticated: authData.state.isAuthenticated,
        });
      }
    }

    const attendanceRaw = await SecureStore.getItemAsync('labflow-attendance-state');
    if (attendanceRaw) {
      const attendanceData = JSON.parse(attendanceRaw);
      if (attendanceData?.state) {
        useAttendanceStore.setState({
          currentStatus: attendanceData.state.currentStatus,
          consumedBreakMinutes: attendanceData.state.consumedBreakMinutes,
          lastActionTimestamp: attendanceData.state.lastActionTimestamp,
          userProfile: attendanceData.state.userProfile,
          activeSession: attendanceData.state.activeSession,
        });
      }
    }

    const settingsRaw = await SecureStore.getItemAsync('labflow-settings-state');
    if (settingsRaw) {
      const settingsData = JSON.parse(settingsRaw);
      if (settingsData?.state) {
        useSettingsStore.setState({
          settings: settingsData.state.settings,
        });
      }
    }
  } catch (error) {
    // Silent Failure by Design
  }
}

// Define the task
TaskManager.defineTask(BACKGROUND_HEARTBEAT_TASK, async () => {
  try {
    // 1. Hydrate our Zustand stores from SecureStore
    await hydrateStoresFromSecureStore();

    const authState = useAuthStore.getState();
    const attendanceState = useAttendanceStore.getState();
    const settingsState = useSettingsStore.getState();

    // Check if the user is logged in and status is 'working'
    if (!authState.isAuthenticated || !authState.user || attendanceState.currentStatus !== 'working') {
      // Clear disconnect timestamp if not working
      await SecureStore.deleteItemAsync('labflow-wifi-disconnect-timestamp');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const settings = settingsState.settings;

    // Get current Wi-Fi SSID
    let currentSsid: string | null = null;
    let currentBssid: string | null = null;
    try {
      const networkState = await NetInfo.fetch();
      if (networkState.type === 'wifi') {
        const details = networkState.details as any;
        currentSsid = details?.ssid?.replace(/^"|"$/g, '') || null;
        currentBssid = details?.bssid || null;
      }
    } catch (e) {
      // Ignore network info query errors
    }

    // 2. Send Heartbeat Ping to backend
    let heartbeatStatus = 'success';
    try {
      const response = await api.post('/attendance/heartbeat', {
        timestamp: new Date().toISOString(),
        currentSsid: currentSsid,
      });
      heartbeatStatus = response.data.heartbeatStatus || 'success';
    } catch (e) {
      // If network fails, we don't treat it as a wifi validation failure
    }

    // 3. Wi-Fi validation logic
    if (settings && settings.wifi_validation_toggle) {
      const companySsid = settings.company_wifi_ssid;
      const companyBssid = settings.company_wifi_bssid;

      let isConnectedToCompanyWifi = true;
      if (companySsid && currentSsid !== companySsid) {
        isConnectedToCompanyWifi = false;
      }

      if (companyBssid && companyBssid.trim() !== '') {
        const requiredBssid = companyBssid.toLowerCase().trim();
        const deviceBssid = currentBssid?.toLowerCase().trim();
        if (deviceBssid !== requiredBssid) {
          isConnectedToCompanyWifi = false;
        }
      }

      if (!isConnectedToCompanyWifi) {
        // Disconnected from company Wi-Fi!
        const disconnectRaw = await SecureStore.getItemAsync('labflow-wifi-disconnect-timestamp');
        const now = Date.now();

        if (!disconnectRaw) {
          // First time detecting disconnection, record the timestamp
          await SecureStore.setItemAsync('labflow-wifi-disconnect-timestamp', now.toString());
        } else {
          // Disconnected before. Check if grace period (15 minutes) is exceeded.
          const disconnectTime = parseInt(disconnectRaw, 10);
          const elapsedMinutes = (now - disconnectTime) / 60000;

          if (elapsedMinutes >= 15) {
            // Exceeded grace period! Trigger automated check-out.
            let latitude: number | null = null;
            let longitude: number | null = null;

            try {
              const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              latitude = location.coords.latitude;
              longitude = location.coords.longitude;
            } catch (locErr) {
              // Fallback to active session check-in coordinates if location fetching fails
              const activeSession = attendanceState.activeSession;
              if (activeSession) {
                latitude = activeSession.check_in_lat || null;
                longitude = activeSession.check_in_lng || null;
              }
            }

            const deviceId = await getUniqueDeviceId();

            // POST automated checkout
            await api.post('/attendance/clock', {
              type: 'check_out',
              timestamp: new Date().toISOString(),
              lat: latitude,
              lng: longitude,
              deviceId: deviceId,
            });

            // Update local state and persist
            attendanceState.setStatus('none');
            attendanceState.setActiveSession(null);
            
            // Clean up disconnect timestamp
            await SecureStore.deleteItemAsync('labflow-wifi-disconnect-timestamp');
          }
        }
      } else {
        // Connected to company Wi-Fi, clear disconnect timestamp
        await SecureStore.deleteItemAsync('labflow-wifi-disconnect-timestamp');
      }
    } else {
      // WiFi validation is off, clear disconnect timestamp
      await SecureStore.deleteItemAsync('labflow-wifi-disconnect-timestamp');
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    // Silent Failure by Design
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundHeartbeat() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_HEARTBEAT_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_HEARTBEAT_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (err) {
    // Silent Failure by Design
  }
}
