import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

// In a real device/emulator, localhost (127.0.0.1) points to the device itself.
// Use your computer's local IP address (e.g., 192.168.1.x) or 10.0.2.2 for Android Emulator.
// For this preview environment, we'll use a placeholder that you can replace.
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.42:3000/api';

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

// Response Interceptor: Handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear auth state and redirect to login
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default api;
