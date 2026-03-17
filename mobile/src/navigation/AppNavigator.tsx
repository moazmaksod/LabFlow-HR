import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, History, User, FileText, DollarSign } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import PendingApprovalScreen from '../screens/PendingApprovalScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ManagerDashboardScreen from '../screens/ManagerDashboardScreen';
import HistoryScreen from '../screens/HistoryScreen';
import RequestsScreen from '../screens/RequestsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PayslipScreen from '../screens/PayslipScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { user } = useAuthStore();
  
  return (
    <Tab.Navigator 
      id="MainTabs"
      screenOptions={{ 
        headerShown: false,
        tabBarActiveTintColor: '#18181b',
        tabBarInactiveTintColor: '#a1a1aa',
        tabBarStyle: {
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        }
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={user?.role === 'manager' ? ManagerDashboardScreen : DashboardScreen} 
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen} 
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      />
      {user?.role === 'employee' && (
        <Tab.Screen 
          name="Payroll" 
          component={PayslipScreen} 
          options={{
            tabBarLabel: 'Payroll',
            tabBarIcon: ({ color, size }) => <DollarSign color={color} size={size} />,
          }}
        />
      )}
      <Tab.Screen 
        name="Requests" 
        component={RequestsScreen} 
        options={{
          tabBarLabel: 'Requests',
          tabBarIcon: ({ color, size }) => <FileText color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <NavigationContainer>
      <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          // 1. Auth Stack (Public)
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user?.role === 'pending' ? (
          // 2. Pending Stack (Authenticated, but not approved)
          <Stack.Screen name="Pending" component={PendingApprovalScreen} />
        ) : (
          // 3. Main App Stack (Authenticated and Approved)
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
