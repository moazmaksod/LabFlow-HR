export const getWebDeviceId = (): string => {
  let deviceId = localStorage.getItem('web_device_id');
  if (!deviceId) {
    const array = new Uint32Array(4);
    window.crypto.getRandomValues(array);
    deviceId = 'web-' + Array.from(array).map(b => b.toString(36)).join('').substring(0, 26);
    localStorage.setItem('web_device_id', deviceId);
  }
  return deviceId;
};
