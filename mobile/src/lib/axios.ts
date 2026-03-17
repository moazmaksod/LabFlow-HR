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
    } else if (!error.response || error.message === 'Network Error') {
      // Network error - suppress raw error and provide a clean message
      // We don't show an alert here anymore to avoid spamming on background fetches
      const cleanError = new Error('Network unavailable. Using cached data.');
      (cleanError as any).isNetworkError = true;
      return Promise.reject(cleanError);
    }
    
    // For other errors, provide a clean fallback if needed
    if (error.response?.data?.error) {
      error.message = error.response.data.error;
    } else if (error.message && error.message.includes('timeout')) {
      error.message = 'Request timed out. Please try again.';
    }

    return Promise.reject(error);
  }
);

export default api;
