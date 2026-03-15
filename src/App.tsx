/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const { i18n } = useTranslation();
  const { theme, language } = useAppStore();

  // Sync theme and language with DOM globally
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);

    i18n.changeLanguage(language);
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
    root.lang = language;
  }, [theme, language, i18n]);

  return (
    <QueryClientProvider client={queryClient}>
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
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
