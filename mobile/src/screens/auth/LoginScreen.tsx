import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Fingerprint } from 'lucide-react-native';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { getUniqueDeviceId } from '../../utils/device';
import { useThemeColors } from '../../hooks/useTheme';
import { useSettingsStore } from '../../store/useSettingsStore';

const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

  const login = useAuthStore((state) => state.login);
  const { colors } = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const settings = useSettingsStore((state) => state.settings);
  const companyName = settings?.company_name || 'LabFlow';

  const logoUri = useMemo(() => {
    if (!settings?.company_logo_url) return null;
    if (settings.company_logo_url.startsWith('http')) return settings.company_logo_url;
    const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://YOUR_LOCAL_IP:3000/api';
    const SERVER_URL = API_URL.replace('/api', '');
    return `${SERVER_URL}${settings.company_logo_url}`;
  }, [settings?.company_logo_url]);

  useEffect(() => {
    checkBiometrics();
    useSettingsStore.getState().fetchPublicSettings();
  }, []);

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const savedCredentials = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY);

    setIsBiometricAvailable(hasHardware && isEnrolled && !!savedCredentials);
  };

  const handleLogin = async (manualEmail?: string, manualPassword?: string) => {
    const loginEmail = manualEmail || email;
    const loginPassword = manualPassword || password;

    if (!loginEmail || !loginPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const deviceId = await getUniqueDeviceId();
      const response = await api.post('/auth/login', {
        email: loginEmail,
        password: loginPassword,
        deviceId
      });

      // Save credentials for future biometric login
      await SecureStore.setItemAsync(
        BIOMETRIC_CREDENTIALS_KEY,
        JSON.stringify({ email: loginEmail, password: loginPassword })
      );

      // Save user and token securely in Zustand
      login(response.data.user, response.data.token);
    } catch (error: any) {
      const errorData = error.response?.data;
      if (errorData?.error === 'Account suspended') {
        Alert.alert(
          'Account Suspended',
          `Reason: ${errorData.suspension_reason || 'No reason provided.'}`
        );
      } else {
        const message = error.isNetworkError
          ? 'Network unavailable. Please check your connection and try again.'
          : (errorData?.error || 'Invalid credentials');
        Alert.alert('Login Failed', message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Login with Biometrics',
        fallbackLabel: 'Enter Password',
      });

      if (result.success) {
        const savedCredentials = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY);
        if (savedCredentials) {
          const { email: savedEmail, password: savedPassword } = JSON.parse(savedCredentials);
          handleLogin(savedEmail, savedPassword);
        }
      }
    } catch (error) {
      Alert.alert('Biometric Error', 'Could not authenticate with biometrics');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={styles.logo} resizeMode="contain" />
        ) : null}
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to {companyName} HR</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={`employee@${companyName.toLowerCase().replace(/\s+/g, '')}.com`}
          placeholderTextColor={colors.subtext}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.subtext}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={() => handleLogin()} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>

        {isBiometricAvailable && (
          <TouchableOpacity style={styles.biometricButton} onPress={handleBiometricLogin} disabled={loading}>
            <Fingerprint color={colors.text} size={24} />
            <Text style={styles.biometricButtonText}>Login with Biometrics</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>Don't have an account? Register</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 220, height: 90, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 32, fontWeight: 'bold', color: colors.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: colors.subtext, marginBottom: 16, textAlign: 'center' },
  form: { gap: 16 },
  label: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: -8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: colors.surface, color: colors.text },
  button: { backgroundColor: colors.accent, padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    marginTop: 8
  },
  biometricButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', marginTop: 16 },
  linkText: { color: colors.subtext, fontSize: 14 },
});
