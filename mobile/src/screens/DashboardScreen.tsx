import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

export default function DashboardScreen() {
  const { user, logout } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Welcome back, {user?.name}</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Role: {user?.role}</Text>
        <Text style={styles.cardText}>
          You have full access to the employee features. Clock-in and Clock-out functionality will be available here.
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f5', padding: 24, paddingTop: 60 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#18181b', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#71717a', marginBottom: 32 },
  card: { 
    backgroundColor: '#fff', 
    padding: 24, 
    borderRadius: 16, 
    marginBottom: 24, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 8, 
    elevation: 4 
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#18181b', marginBottom: 8 },
  cardText: { fontSize: 14, color: '#71717a', lineHeight: 20 },
  button: { backgroundColor: '#ef4444', padding: 16, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
