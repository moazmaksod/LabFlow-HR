/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAppStore } from './store/useAppStore';
import { useAuthStore } from './store/useAuthStore';
import DashboardLayout from './components/DashboardLayout';
import Login from './features/auth/Login';
import ProtectedRoute from './components/ProtectedRoute';
import JobManagement from './features/jobs/JobManagement';
import EmployeeList from './features/employees/EmployeeList';
import AttendanceLogs from './features/attendance/AttendanceLogs';
import AnalyticsDashboard from './features/analytics/AnalyticsDashboard';
import RequestManagement from './features/requests/RequestManagement';
import PayrollView from './features/payroll/PayrollView';
import SettingsView from './features/settings/SettingsView';
import ManagerProfile from './features/profile/ManagerProfile';
import { AuditLogs } from './features/audit/AuditLogs';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const { i18n } = useTranslation();
  const { theme, language } = useAppStore();
  const token = useAuthStore((state) => state.token);

  // Sync theme and language with DOM globally
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);

    i18n.changeLanguage(language);
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
    root.lang = language;
  }, [theme, language, i18n]);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await axios.get('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    }
  });

  useEffect(() => {
    if (settings) {
      document.title = settings.company_name || 'LabFlow';
      if (settings.company_favicon_url) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = settings.company_favicon_url;
      }
    }
  }, [settings]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AnalyticsDashboard />} />
          <Route path="jobs" element={<JobManagement />} />
          <Route path="employees" element={<EmployeeList />} />
          <Route path="attendance" element={<AttendanceLogs />} />
          <Route path="requests" element={<RequestManagement />} />
          <Route path="payroll" element={<PayrollView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="profile" element={<ManagerProfile />} />
          <Route path="audit" element={<AuditLogs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
