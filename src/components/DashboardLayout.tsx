import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { Moon, Sun, Globe, LayoutDashboard, Users, Calendar, FileText, Settings, LogOut, Briefcase, DollarSign } from 'lucide-react';
import { cn } from '../lib/utils';
import TimezoneClock from './TimezoneClock';

export default function DashboardLayout() {
  const { t } = useTranslation();
  const { theme, language, toggleTheme, setLanguage } = useAppStore();
  const { user, logout } = useAuthStore();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'app.dashboard', path: '/' },
    { icon: Users, label: 'app.employees', path: '/employees' },
    { icon: Briefcase, label: 'Job Roles', path: '/jobs' },
    { icon: Calendar, label: 'app.attendance', path: '/attendance' },
    { icon: FileText, label: 'app.requests', path: '/requests' },
    { icon: DollarSign, label: 'Payroll', path: '/payroll' },
    { icon: Settings, label: 'app.settings', path: '/settings' },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col transition-all duration-300 rtl:border-r-0 rtl:border-l">
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            {t('app.title')}
          </h1>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item, index) => (
              <li key={index}>
                <NavLink 
                  to={item.path}
                  className={({ isActive }) => cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label === 'Job Roles' ? item.label : t(item.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-border">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {t('app.logout')}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold">
            {t('app.welcome')}, {user?.name || 'User'}
          </h2>
          
          <div className="flex items-center gap-4">
            <TimezoneClock />
            
            {/* Language Toggle */}
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted transition-colors text-sm font-medium"
            >
              <Globe className="w-4 h-4" />
              {language === 'en' ? 'عربي' : 'English'}
            </button>

            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>
            
            {/* User Avatar Placeholder */}
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm uppercase">
              {user?.name?.charAt(0) || 'M'}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 bg-muted/30">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
