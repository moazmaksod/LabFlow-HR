import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';

export const colors = {
  light: {
    background: '#ffffff',
    surface: '#fafafa',
    card: '#f4f4f5',
    text: '#18181b',
    subtext: '#71717a',
    border: '#e4e4e7',
    primary: '#18181b',
    primaryForeground: '#ffffff',
    danger: '#ef4444',
    dangerBg: '#fee2e2',
    dangerBorder: '#fecaca',
    success: '#10b981',
    successBg: '#dcfce7',
    successBorder: '#bbf7d0',
    warning: '#f59e0b',
    warningBg: '#fef3c7',
    warningBorder: '#fde68a',
    accent: '#4f46e5',
    accentBg: '#eef2ff',
    timelineRemaining: '#e2e8f0',
    timelineNone: '#f1f5f9',
    timelineMissed: '#f59e0b',
    timelineTrackBg: '#f1f5f9',
    timelineMarker: '#cbd5e1',
    shadow: '#000000',
  },
  dark: {
    background: '#09090b',
    surface: '#18181b',
    card: '#27272a',
    text: '#fafafa',
    subtext: '#a1a1aa',
    border: '#27272a',
    primary: '#fafafa',
    primaryForeground: '#18181b',
    danger: '#f87171',
    dangerBg: '#451a1a',
    dangerBorder: '#7f1d1d',
    success: '#34d399',
    successBg: '#064e3b',
    successBorder: '#065f46',
    warning: '#fbbf24',
    warningBg: '#78350f',
    warningBorder: '#92400e',
    accent: '#818cf8',
    accentBg: '#1e1b4b',
    timelineRemaining: '#3f3f46',
    timelineNone: '#27272a',
    timelineMissed: '#d97706',
    timelineTrackBg: '#27272a',
    timelineMarker: '#52525b',
    shadow: '#000000',
  }
};

export type ThemeColors = typeof colors.light;

export function useThemeColors() {
  const systemScheme = useColorScheme();
  const themeSetting = useSettingsStore((state) => state.theme) || 'system';
  const settings = useSettingsStore((state) => state.settings);
  
  const isDark = themeSetting === 'system' 
    ? systemScheme === 'dark' 
    : themeSetting === 'dark';
    
  const baseColors = isDark ? colors.dark : colors.light;
  const brandPrimary = settings?.brand_primary_color || (isDark ? '#818cf8' : '#4f46e5');
  const accentBg = brandPrimary.startsWith('#') && brandPrimary.length === 7
    ? `${brandPrimary}${isDark ? '20' : '15'}`
    : (isDark ? '#1e1b4b' : '#eef2ff');
    
  return {
    colors: {
      ...baseColors,
      accent: brandPrimary,
      accentBg: accentBg,
    },
    isDark,
    theme: themeSetting,
  };
}
