const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'mobile/src/screens/DashboardScreen.tsx');
let content = fs.readFileSync(file, 'utf8');

const replacement = `
      // 3. Calculate True Time using server offset
      const localNow = Date.now();
      const { serverTimeOffset, lastLocalSyncTime } = useNetworkStore.getState();

      if (localNow < lastLocalSyncTime) {
        Alert.alert('Security Alert', 'Device clock tampering detected. Time appears to have moved backwards.');
        setLoading(false);
        return;
      }

      const timestamp = new Date(localNow + serverTimeOffset).toISOString();`;

content = content.replace(/const timestamp = new Date\(\)\.toISOString\(\);/g, replacement);

fs.writeFileSync(file, content);
