import * as fs from 'fs';

const file = 'mobile/src/screens/ProfileScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

const imports = `import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { User, Camera, Save, LogOut, Mail, UserCircle, Lock, Info, DollarSign, Calendar, Clock, Shield, LayoutDashboard, MapPin, Landmark, HeartHandshake } from 'lucide-react-native';
import api from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { useAttendanceStore } from '../store/useAttendanceStore';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EmployeeProfileSchema } from '../../../shared/validations';
import DateTimePicker from '@react-native-community/datetimepicker';`;

content = content.replace(/import React, \{.*?\} from 'react';[\s\S]*?import \{ useAttendanceStore \} from '\.\.\/store\/useAttendanceStore';/m, imports);

// We need to alter the component to use react-hook-form.
// To do this reliably, we'll rewrite the component shell down to the return statement.
const componentStart = `
export default function ProfileScreen() {
  const { user, logout, login } = useAuthStore();
  const { userProfile, setUserProfile } = useAttendanceStore();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const { isConnected } = useNetworkStore();

  // Extend the schema with extra HR fields visible on mobile for now since it renders them all
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(EmployeeProfileSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      legal_name: user?.name || '',
      personal_phone: '',
      date_of_birth: undefined,
      national_id: '',
      bio: '',
    }
  });

  const watchDateOfBirth = watch('date_of_birth');
`;

content = content.replace(
  /export default function ProfileScreen\(\) \{[\s\S]*?const \{ isConnected \} = useNetworkStore\(\);/m,
  componentStart
);

// Modify the useEffect logic
content = content.replace(
  /  useEffect\(\(\) => \{[\s\S]*?  \}, \[userProfile, user\]\);/m,
  `  useEffect(() => {
    if (userProfile) {
      reset({
        legal_name: userProfile.legal_name || userProfile.name || user?.name || '',
        personal_phone: userProfile.personal_phone || '',
        date_of_birth: userProfile.date_of_birth ? new Date(userProfile.date_of_birth) : undefined,
        national_id: userProfile.national_id || '',
        bio: userProfile.bio || '',
      });
      setAvatar(userProfile.profile_picture_url || null);
    }
  }, [userProfile, user, reset]);`
);

// We need to rewrite handleUpdateProfile
const handleUpdateProfile = `
  const onInvalid = (errors: any) => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleUpdateProfile = handleSubmit(async (data: any) => {
    if (!isConnected) {
      Alert.alert('Offline', 'Cannot update profile while offline');
      return;
    }

    setLoading(true);
    try {
      const finalData = {
        name: data.legal_name,
        bio: data.bio,
        personal_phone: data.personal_phone,
        date_of_birth: data.date_of_birth ? data.date_of_birth.toISOString().split('T')[0] : null,
        national_id: data.national_id,
      };

      const response = await api.put('/users/profile', finalData);

      setUserProfile(response.data);
      if (user) {
        login({ ...user, name: response.data.name }, useAuthStore.getState().token!);
      }

      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      const message = error.isNetworkError
        ? 'Network unavailable. Please try again when online.'
        : (error.response?.data?.error || 'Failed to update profile');
      Alert.alert('Update Failed', message);
    } finally {
      setLoading(false);
    }
  }, onInvalid);
`;

content = content.replace(
  /  const handleUpdateProfile = async \(\) => \{[\s\S]*?  \};/m,
  handleUpdateProfile
);

content = content.replace(
  /<ScrollView style=\{styles.container\} contentContainerStyle=\{styles.contentContainer\}>/,
  '<ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.contentContainer}>'
);

fs.writeFileSync(file, content, 'utf8');
