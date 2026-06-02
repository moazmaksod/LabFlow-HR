import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useNetworkStore } from '../store/useNetworkStore';
import { WifiOff } from 'lucide-react-native';
import { useThemeColors } from '../hooks/useTheme';

export default function OfflineBanner() {
  const { isConnected } = useNetworkStore();
  const { colors } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isConnected) {
    return null;
  }

  return (
    <View style={styles.container}>
      <WifiOff color="#fff" size={16} />
      <Text style={styles.text}>You are offline. Actions will be saved locally.</Text>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: Platform.OS === 'ios' ? 40 : 8, // Adjust for safe area if placed at the very top
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
