import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { User, Camera, Save, LogOut, Mail, UserCircle, Lock } from 'lucide-react-native';
import api from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useNetworkStore } from '../store/useNetworkStore';

// Base URL for images derived from API URL
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ais-dev-dt5wflxz22iihcij747x5r-137896224739.europe-west1.run.app/api';
const BASE_URL = API_URL.replace('/api', '');

export default function ProfileScreen() {
  const { user, logout, login } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const { isConnected } = useNetworkStore();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    if (!isConnected) {
      setFetching(false);
      return;
    }
    try {
      const response = await api.get('/users/profile');
      const data = response.data;
      setName(data.name);
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
  };

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
      await api.put('/users/profile', { profile_picture_url: newAvatarUrl });
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
        age: age ? parseInt(age) : null,
        gender: gender || null,
      });

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
        <Text style={styles.userRole}>{user?.role.toUpperCase()}</Text>
      </View>

      <View style={styles.form}>
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
  form: { gap: 20 },
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
});
