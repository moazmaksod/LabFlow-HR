import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import api from '../../lib/axios';

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('male'); // Default to male
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password || !dateOfBirth || !gender) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', { name, email, password, date_of_birth: dateOfBirth, gender });
      Alert.alert(
        'Registration Successful',
        'Your account has been created. Please wait for a manager to approve your account and assign your role.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } catch (error: any) {
      const message = error.isNetworkError 
        ? 'Network unavailable. Please check your connection and try again.' 
        : (error.response?.data?.error || 'An error occurred');
      Alert.alert('Registration Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join LabFlow HR</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="John Doe"
          autoCapitalize="words"
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="25"
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderContainer}>
              <TouchableOpacity 
                style={[styles.genderButton, gender === 'male' && styles.genderButtonActive]} 
                onPress={() => setGender('male')}
              >
                <Text style={[styles.genderButtonText, gender === 'male' && styles.genderButtonTextActive]}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.genderButton, gender === 'female' && styles.genderButtonActive]} 
                onPress={() => setGender('female')}
              >
                <Text style={[styles.genderButtonText, gender === 'female' && styles.genderButtonTextActive]}>Female</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

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

        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>Already have an account? Log in</Text>
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
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  label: { fontSize: 14, fontWeight: '500', color: '#18181b', marginBottom: -8 },
  input: { borderWidth: 1, borderColor: '#e4e4e7', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fafafa' },
  genderContainer: { flexDirection: 'row', gap: 8, marginTop: 8 },
  genderButton: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e4e4e7', alignItems: 'center', backgroundColor: '#fafafa' },
  genderButtonActive: { backgroundColor: '#18181b', borderColor: '#18181b' },
  genderButtonText: { fontSize: 14, color: '#18181b', fontWeight: '500' },
  genderButtonTextActive: { color: '#fff' },
  button: { backgroundColor: '#18181b', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#71717a', fontSize: 14 },
});
