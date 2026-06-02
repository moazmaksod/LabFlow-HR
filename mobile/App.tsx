import React, { useEffect } from 'react';
import { Buffer } from 'buffer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';
import OfflineBanner from './src/components/OfflineBanner';
import './src/store/useNetworkStore'; // Initialize network listener
import { registerBackgroundHeartbeat } from './src/utils/backgroundTaskManager';
import { useThemeColors } from './src/hooks/useTheme';

// Polyfill Buffer for libraries that depend on it (like react-native-svg)
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

export default function App() {
  useEffect(() => {
    registerBackgroundHeartbeat();
  }, []);

  const { isDark } = useThemeColors();

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
