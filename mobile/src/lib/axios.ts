import axios from 'axios';
import { Alert, Platform, ToastAndroid } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

// Use the local IP address defined in mobile/.env
// e.g., EXPO_PUBLIC_API_URL=http://192.168.1.x:3000/api
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://YOUR_LOCAL_IP:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthorized and Network Errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear auth state and redirect to login
      useAuthStore.getState().logout();
    } else if (!error.response) {
      // Network error
      const message = 'Network unavailable. Please check your connection.';
      if (Platform.OS === 'android') {
        ToastAndroid.show(message, ToastAndroid.SHORT);
      } else {
        // For iOS, we don't want to spam alerts, but we can show one if needed.
        Alert.alert('Offline', message);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
