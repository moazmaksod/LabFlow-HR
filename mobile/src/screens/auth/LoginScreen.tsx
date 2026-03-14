import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Fingerprint } from 'lucide-react-native';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { getUniqueDeviceId } from '../../utils/device';

const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  
  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    checkBiometrics();
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
      Alert.alert('Login Failed', error.response?.data?.error || 'Invalid credentials');
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
      <Text style={styles.title}>Welcome Back</Text>
      <Text style={styles.subtitle}>Sign in to LabFlow HR</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="employee@labflow.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={() => handleLogin()} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>

        {isBiometricAvailable && (
          <TouchableOpacity style={styles.biometricButton} onPress={handleBiometricLogin} disabled={loading}>
            <Fingerprint color="#18181b" size={24} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#18181b', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#71717a', marginBottom: 32 },
  form: { gap: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#18181b', marginBottom: -8 },
  input: { borderWidth: 1, borderColor: '#e4e4e7', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fafafa' },
  button: { backgroundColor: '#18181b', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  biometricButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 16, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#e4e4e7',
    gap: 8,
    marginTop: 8
  },
  biometricButtonText: { color: '#18181b', fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#71717a', fontSize: 14 },
});
