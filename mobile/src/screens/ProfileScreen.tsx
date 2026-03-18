import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { User, Camera, Save, LogOut, Mail, UserCircle, Lock, Info, DollarSign, Calendar, Clock, Shield, LayoutDashboard } from 'lucide-react-native';
import api from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { useAttendanceStore } from '../store/useAttendanceStore';

// Base URL for images derived from API URL
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ais-dev-dt5wflxz22iihcij747x5r-137896224739.europe-west1.run.app/api';
const BASE_URL = API_URL.replace('/api', '');

export default function ProfileScreen() {
  const { user, logout, login } = useAuthStore();
  const { userProfile, setUserProfile } = useAttendanceStore();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState('');
  const [personalPhone, setPersonalPhone] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const { isConnected } = useNetworkStore();

  const fetchProfile = useCallback(async () => {
    if (!isConnected) {
      setFetching(false);
      return;
    }
    try {
      const response = await api.get('/users/profile');
      const data = response.data;
      setUserProfile(data);
      setName(data.name);
      setBio(data.bio || '');
      setPersonalPhone(data.personal_phone || '');
      setEmergencyContactName(data.emergency_contact_name || '');
      setEmergencyContactPhone(data.emergency_contact_phone || '');
      setAge(data.age?.toString() || '');
      setGender(data.gender || '');
      setAvatar(data.profile_picture_url || null);
    } catch (error: any) {
      if (!error.isNetworkError) {
        console.error('Error fetching profile:', error);
        Alert.alert('Error', 'Failed to load profile data');
      }
    } finally {
      setFetching(false);
    }
  }, [isConnected, setUserProfile]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile])
  );

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name || user?.name || '');
      setBio(userProfile.bio || '');
      setPersonalPhone(userProfile.personal_phone || '');
      setEmergencyContactName(userProfile.emergency_contact_name || '');
      setEmergencyContactPhone(userProfile.emergency_contact_phone || '');
      setAge(userProfile.age?.toString() || '');
      setGender(userProfile.gender || '');
      setAvatar(userProfile.profile_picture_url || null);
    }
  }, [userProfile, user]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera roll permissions to change your avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      uploadAvatar(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!isConnected) {
      Alert.alert('Offline', 'Cannot update profile picture while offline');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename || '');
      const type = match ? `image/${match[1]}` : `image`;

      formData.append('avatar', {
        uri,
        name: filename,
        type,
      } as any);

      const response = await api.post('/users/upload-avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newAvatarUrl = response.data.url;
      setAvatar(newAvatarUrl);
      
      // Update profile with new avatar URL
      const updateRes = await api.put('/users/profile', { profile_picture_url: newAvatarUrl });
      setUserProfile(updateRes.data);
      Alert.alert('Success', 'Avatar updated successfully');
    } catch (error: any) {
      // Graceful error catching to avoid redbox
      const message = error.isNetworkError 
        ? 'Network unavailable. Please try again when online.' 
        : (error.response?.data?.error || 'Failed to upload avatar');
      Alert.alert('Avatar Update', message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!isConnected) {
      Alert.alert('Offline', 'Cannot update profile while offline');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setLoading(true);
    try {
      const response = await api.put('/users/profile', {
        name,
        bio,
        personal_phone: personalPhone,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
        age: age ? parseInt(age) : null,
        gender: gender || null,
      });

      setUserProfile(response.data);
      // Update local user state if name changed
      if (user) {
        login({ ...user, name: response.data.name }, useAuthStore.getState().token!);
      }

      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      // Graceful error catching to avoid redbox
      const message = error.isNetworkError 
        ? 'Network unavailable. Please try again when online.' 
        : (error.response?.data?.error || 'Failed to update profile');
      Alert.alert('Profile Update', message);
    } finally {
      setLoading(false);
    }
  };

  const calculateTenure = (hireDate: string | null) => {
    if (!hireDate) return 'Not set';
    const start = new Date(hireDate);
    const now = new Date();
    
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    
    if (months < 0) {
      years--;
      months += 12;
    }
    
    const parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
    
    return parts.length > 0 ? parts.join(', ') : 'Less than a month';
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const renderScheduleTable = (scheduleStr: string | null) => {
    if (!scheduleStr) return <Text style={styles.noData}>No schedule set</Text>;
    try {
      const schedule = JSON.parse(scheduleStr);
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      
      return (
        <View style={styles.scheduleTable}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Day</Text>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Working Hours</Text>
          </View>
          {days.map((day) => {
            const shifts = schedule[day];
            const isActive = Array.isArray(shifts) && shifts.length > 0;
            
            let shiftText = 'Off';
            if (isActive) {
              shiftText = shifts.map((s: any) => {
                if (typeof s === 'string') return s;
                return `${formatTime(s.start)} - ${formatTime(s.end)}`;
              }).join('\n');
            }

            return (
              <View key={day} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1, textTransform: 'capitalize', fontWeight: isActive ? '600' : '400' }]}>
                  {day.substring(0, 3)}
                </Text>
                <Text style={[styles.tableCell, { flex: 2, color: isActive ? '#18181b' : '#a1a1aa' }]}>
                  {shiftText}
                </Text>
              </View>
            );
          })}
        </View>
      );
    } catch (e) {
      return <Text style={styles.noData}>Invalid schedule format</Text>;
    }
  };

  if (fetching) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#18181b" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={pickImage}
          style={styles.avatarContainer}
          accessibilityLabel="Change profile picture"
          accessibilityRole="button"
        >
          {avatar ? (
            <Image 
              source={{ uri: avatar.startsWith('http') ? avatar : `${BASE_URL}${avatar}` }} 
              style={styles.avatar} 
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <UserCircle size={80} color="#a1a1aa" />
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Camera size={16} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.userName}>{name}</Text>
        <Text style={styles.userRole}>{userProfile?.job_title || user?.role.toUpperCase()}</Text>
        <View style={styles.tenureHeader}>
          <Calendar size={12} color="#71717a" style={{ marginRight: 4 }} />
          <Text style={styles.tenureHeaderText}>Tenure: {calculateTenure(userProfile?.hire_date)}</Text>
        </View>
      </View>

      <View style={styles.form}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputWrapper}>
              <User size={18} color="#71717a" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="John Doe"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio</Text>
            <View style={[styles.inputWrapper, { alignItems: 'flex-start' }]}>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself..."
                multiline
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Personal Phone</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={personalPhone}
                onChangeText={setPersonalPhone}
                placeholder="+1 234 567 890"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <View style={[styles.inputWrapper, styles.disabledInput]}>
              <Mail size={18} color="#a1a1aa" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: '#a1a1aa' }]}
                value={user?.email}
                editable={false}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                placeholder="e.g. 25"
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Gender</Text>
              <TextInput
                style={styles.input}
                value={gender}
                onChangeText={setGender}
                placeholder="e.g. Male"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Emergency Contact Name</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={emergencyContactName}
                onChangeText={setEmergencyContactName}
                placeholder="Full Name"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Emergency Contact Phone</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={emergencyContactPhone}
                onChangeText={setEmergencyContactPhone}
                placeholder="+1 234 567 890"
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Job Details</Text>
          
          <View style={styles.detailsCard}>
            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <DollarSign size={16} color="#71717a" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Hourly Rate</Text>
                  <Text style={styles.detailValue}>${userProfile?.hourly_rate || 0}/hr</Text>
                </View>
              </View>
              
              <View style={styles.detailItem}>
                <Calendar size={16} color="#71717a" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Leave Balance</Text>
                  <Text style={styles.detailValue}>{userProfile?.leave_balance || 0} days</Text>
                </View>
              </View>

              <View style={styles.detailItem}>
                <Clock size={16} color="#71717a" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Max OT Hours</Text>
                  <Text style={styles.detailValue}>{userProfile?.max_overtime_hours || 0}h/wk</Text>
                </View>
              </View>

              <View style={styles.detailItem}>
                <Shield size={16} color="#71717a" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Lunch Break</Text>
                  <Text style={styles.detailValue}>{userProfile?.lunch_break_minutes || 0} mins</Text>
                </View>
              </View>
            </View>

            <View style={styles.scheduleSection}>
              <View style={styles.scheduleHeader}>
                <LayoutDashboard size={16} color="#71717a" style={{ marginRight: 8 }} />
                <Text style={styles.scheduleTitle}>Working Hours Schedule</Text>
              </View>
              {renderScheduleTable(userProfile?.weekly_schedule)}
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.saveButton, !isConnected && styles.disabledButton]} 
          onPress={handleUpdateProfile} 
          disabled={loading || !isConnected}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              {isConnected ? (
                <>
                  <Save size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              ) : (
                <>
                  <Lock size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Offline</Text>
                </>
              )}
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <LogOut size={20} color="#ef4444" />
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  avatarContainer: { position: 'relative', marginBottom: 16 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#f4f4f5' },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#f4f4f5', justifyContent: 'center', alignItems: 'center' },
  cameraIcon: { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#18181b', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#fff' },
  userName: { fontSize: 24, fontWeight: 'bold', color: '#18181b' },
  userRole: { fontSize: 14, color: '#71717a', marginTop: 4, letterSpacing: 1 },
  tenureHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  tenureHeaderText: { fontSize: 12, color: '#a1a1aa', fontWeight: '500' },
  section: { gap: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#71717a', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  form: { gap: 24 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#18181b' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e4e4e7', borderRadius: 8, backgroundColor: '#fafafa' },
  inputIcon: { marginLeft: 12 },
  input: { flex: 1, padding: 12, fontSize: 16, color: '#18181b' },
  disabledInput: { backgroundColor: '#f4f4f5' },
  row: { flexDirection: 'row' },
  disabledButton: { opacity: 0.5, backgroundColor: '#71717a' },
  saveButton: { backgroundColor: '#18181b', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 8, gap: 8, marginTop: 12 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 8, gap: 8, marginTop: 8, borderWidth: 1, borderColor: '#fee2e2' },
  logoutButtonText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  noData: { color: '#71717a', fontSize: 14, fontStyle: 'italic' },
  detailsCard: { backgroundColor: '#fafafa', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e4e4e7' },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '45%' },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 10, color: '#71717a', fontWeight: '600', textTransform: 'uppercase' },
  detailValue: { fontSize: 14, color: '#18181b', fontWeight: '500' },
  scheduleSection: { borderTopWidth: 1, borderTopColor: '#e4e4e7', paddingTop: 16 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  scheduleTitle: { fontSize: 14, fontWeight: '600', color: '#18181b' },
  scheduleTable: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e4e4e7', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f4f4f5', padding: 8, borderBottomWidth: 1, borderBottomColor: '#e4e4e7' },
  tableHeaderText: { fontSize: 12, fontWeight: '700', color: '#71717a' },
  tableRow: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: '#f4f4f5' },
  tableCell: { fontSize: 12, color: '#18181b' },
});
