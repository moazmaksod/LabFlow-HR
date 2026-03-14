export const getWebDeviceId = (): string => {
  let deviceId = localStorage.getItem('web_device_id');
  if (!deviceId) {
    deviceId = 'web-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('web_device_id', deviceId);
  }
  return deviceId;
};
