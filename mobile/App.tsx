import React from 'react';
import { Buffer } from 'buffer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import OfflineBanner from './src/components/OfflineBanner';
import './src/store/useNetworkStore'; // Initialize network listener

// Polyfill Buffer for libraries that depend on it (like react-native-svg)
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <OfflineBanner />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
