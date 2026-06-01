import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';

// Base URL for images derived from API URL
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ais-dev-dt5wflxz22iihcij747x5r-137896224739.europe-west1.run.app/api';
const BASE_URL = API_URL.replace('/api', '');

interface DashboardHeaderProps {
  userProfile: any | null;
  logout: () => void;
}

export default function DashboardHeader({ userProfile, logout }: DashboardHeaderProps) {
  const { user } = useAuthStore();
  const userName = user?.name || 'Employee';
  const roleText = userProfile?.job_title || user?.role?.toUpperCase() || 'Staff';

  const avatarUri = userProfile?.profile_picture_url
    ? (userProfile.profile_picture_url.startsWith('http')
        ? userProfile.profile_picture_url
        : `${BASE_URL}${userProfile.profile_picture_url}`)
    : null;

  // Initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <View style={styles.headerContainer}>
      <View style={styles.profileSection}>
        <View style={styles.avatarOuterRing}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{getInitials(userName)}</Text>
            </View>
          )}
        </View>
        <View style={styles.userMeta}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userNameText} numberOfLines={1}>{userName}</Text>
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{roleText}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        onPress={logout}
        style={styles.logoutButton}
        accessibilityLabel="Logout"
        accessibilityRole="button"
      >
        <LogOut color="#ef4444" size={20} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 16,
    elevation: 2,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarOuterRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 2,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f1f5f9',
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  userMeta: {
    marginLeft: 14,
    flex: 1,
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  badgeContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logoutButton: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
