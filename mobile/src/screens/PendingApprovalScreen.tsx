import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';
import api from '../lib/axios';

export default function PendingApprovalScreen() {
  const { logout, login, user, token } = useAuthStore();

  useFocusEffect(
    useCallback(() => {
      const checkStatus = async () => {
        try {
          const res = await api.get('/users/profile');
          // If the role changed to employee or manager, update the user state
          if (res.data && res.data.role !== 'pending' && user && token) {
            login({ ...user, role: res.data.role }, token);
          }
        } catch (error) {
          // If 401, the interceptor will handle the logout
          console.error('Error checking status:', error);
        }
      };
      checkStatus();
    }, [user, token, login])
  );

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>⏳</Text>
        <Text style={styles.title}>Account Pending</Text>
        <Text style={styles.message}>
          Your account has been created successfully, but it requires manager approval before you can access the system.
        </Text>
        <Text style={styles.message}>
          Please check back later or contact your HR administrator.
        </Text>
        
        <TouchableOpacity style={styles.button} onPress={() => logout()}>
          <Text style={styles.buttonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5', padding: 24, justifyContent: 'center' },
  card: { 
    backgroundColor: '#fff', 
    padding: 32, 
    borderRadius: 16, 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 8, 
    elevation: 4 
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#18181b', marginBottom: 16 },
  message: { fontSize: 16, color: '#71717a', textAlign: 'center', marginBottom: 16, lineHeight: 24 },
  button: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: '#e4e4e7' },
  buttonText: { color: '#18181b', fontSize: 16, fontWeight: '600' },
});
