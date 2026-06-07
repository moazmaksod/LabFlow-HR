import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { RefreshCw, Database } from 'lucide-react-native';
import { useThemeColors } from '../hooks/useTheme';

interface OfflineSyncCardProps {
  unsyncedCount: number;
  isSyncing: boolean;
  handleSync: () => void;
}

export default function OfflineSyncCard({
  unsyncedCount,
  isSyncing,
  handleSync,
}: OfflineSyncCardProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (unsyncedCount === 0) return null;

  return (
    <View style={styles.syncCard}>
      <View style={styles.iconContainer}>
        <Database size={24} color={colors.warning} />
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.cardTitle}>Offline Records</Text>
        <Text style={styles.cardText}>
          You have {unsyncedCount} offline record{unsyncedCount > 1 ? 's' : ''} ready to sync with the server.
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
        onPress={handleSync}
        disabled={isSyncing}
        accessibilityLabel="Sync offline logs"
        accessibilityRole="button"
        accessibilityState={{ disabled: isSyncing }}
      >
        {isSyncing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <RefreshCw color="#ffffff" size={18} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  syncCard: {
    backgroundColor: colors.warningBg,
    padding: 20,
    borderRadius: 24,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warningBorder,
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  contentContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.warning,
    letterSpacing: 0.3,
  },
  cardText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
    marginTop: 2,
    fontWeight: '500',
  },
  syncButton: {
    backgroundColor: colors.warning,
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
});
