import * as fs from 'fs';

const file = 'mobile/src/screens/auth/RegisterScreen.tsx';

const content = `import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import api from '../../lib/axios';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EmployeeRegistrationSchema } from '../../../../shared/validations';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function RegisterScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(EmployeeRegistrationSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      name: '',
      email: '',
      password: '',
      date_of_birth: new Date(new Date().setFullYear(new Date().getFullYear() - 18)),
      gender: 'male',
    }
  });

  const watchGender = watch('gender');
  const watchDateOfBirth = watch('date_of_birth');

  const onInvalid = (errors: any) => {
      // Find the first error and ideally scroll to it
      scrollViewRef.current?.scrollTo({ y: 0, animated: true }); // Simplest approach for now
  };

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      await api.post('/auth/register', data);
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

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  return (
    <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join LabFlow HR</Text>

      <View style={styles.form}>
        <View>
          <Text style={styles.label}>Full Name</Text>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                placeholder="John Doe"
                autoCapitalize="words"
              />
            )}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name.message as string}</Text>}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1.2 }}>
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity
              style={[styles.input, errors.date_of_birth && styles.inputError, { justifyContent: 'center' }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16 }}>{formatDate(watchDateOfBirth)}</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={watchDateOfBirth}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) {
                    setValue('date_of_birth', selectedDate, { shouldValidate: true });
                  }
                }}
              />
            )}
            {errors.date_of_birth && <Text style={styles.errorText}>{errors.date_of_birth.message as string}</Text>}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderContainer}>
              <TouchableOpacity
                style={[styles.genderButton, watchGender === 'male' && styles.genderButtonActive]}
                onPress={() => setValue('gender', 'male', { shouldValidate: true })}
              >
                <Text style={[styles.genderButtonText, watchGender === 'male' && styles.genderButtonTextActive]}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genderButton, watchGender === 'female' && styles.genderButtonActive]}
                onPress={() => setValue('gender', 'female', { shouldValidate: true })}
              >
                <Text style={[styles.genderButtonText, watchGender === 'female' && styles.genderButtonTextActive]}>Female</Text>
              </TouchableOpacity>
            </View>
            {errors.gender && <Text style={styles.errorText}>{errors.gender.message as string}</Text>}
          </View>
        </View>

        <View>
          <Text style={styles.label}>Email Address</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                placeholder="employee@labflow.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}
          />
          {errors.email && <Text style={styles.errorText}>{errors.email.message as string}</Text>}
        </View>

        <View>
          <Text style={styles.label}>Password</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.password && styles.inputError]}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                placeholder="••••••••"
                secureTextEntry
              />
            )}
          />
          {errors.password && <Text style={styles.errorText}>{errors.password.message as string}</Text>}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleSubmit(onSubmit, onInvalid)} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>Already have an account? Log in</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#18181b', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#71717a', marginBottom: 32 },
  form: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  label: { fontSize: 14, fontWeight: '500', color: '#18181b', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#e4e4e7', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fafafa', minHeight: 50 },
  inputError: { borderColor: 'red' },
  errorText: { color: 'red', fontSize: 12, marginTop: 4 },
  genderContainer: { flexDirection: 'row', gap: 8 },
  genderButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 8, borderWidth: 1, borderColor: '#e4e4e7', alignItems: 'center', backgroundColor: '#fafafa', minHeight: 50, justifyContent: 'center' },
  genderButtonActive: { backgroundColor: '#18181b', borderColor: '#18181b' },
  genderButtonText: { fontSize: 14, color: '#18181b', fontWeight: '500' },
  genderButtonTextActive: { color: '#fff' },
  button: { backgroundColor: '#18181b', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#71717a', fontSize: 14 },
});
`;

fs.writeFileSync(file, content, 'utf8');
