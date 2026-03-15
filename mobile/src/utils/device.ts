import * as Application from 'expo-application';
import { Platform } from 'react-native';

export async function getUniqueDeviceId(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      return await Application.getAndroidId();
    } else if (Platform.OS === 'ios') {
      return await Application.getIosIdForVendorAsync();
    }
    return null;
  } catch (error) {
    console.error('Error getting device ID:', error);
    return null;
  }
}
