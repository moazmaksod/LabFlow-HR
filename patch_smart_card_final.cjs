const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'mobile/src/components/SmartAttendanceCard.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    /const activeSession = useAttendanceStore\(\(state\) => state\.activeSession\);/,
    `const activeSession = useAttendanceStore((state) => state.activeSession);
  const serverTimeOffset = useNetworkStore((state) => state.serverTimeOffset);
  const lastLocalSyncTime = useNetworkStore((state) => state.lastLocalSyncTime);

  const getTrueTime = () => new Date(Date.now() + serverTimeOffset);
  const [now, setNow] = useState(getTrueTime);

  useEffect(() => {
    // Real-Time Tick (The Engine) - update every 30 seconds
    const interval = setInterval(() => {
      setNow(getTrueTime());
    }, 30000);
    return () => clearInterval(interval);
  }, [serverTimeOffset]);

  // Check if clock is tampered
  // Threshold: If serverTimeOffset is more than 2 minutes, meaning the phone is not using Automatic Network Time.
  // Or if Date.now() moved backwards before the lastLocalSyncTime.
  const isTimeTampered = Math.abs(serverTimeOffset) > 120000 || Date.now() < lastLocalSyncTime;`
);

// We need to remove the duplicate imports/definitions we mistakenly added earlier
content = content.replace(
    /import \{ useAttendanceStore \} from '\.\.\/store\/useAttendanceStore';\nimport \{ useNetworkStore \} from '\.\.\/store\/useNetworkStore';\nimport \{ AlertCircle \} from 'lucide-react-native';/,
    `import { useAttendanceStore } from '../store/useAttendanceStore';\nimport { useNetworkStore } from '../store/useNetworkStore';\nimport { AlertCircle } from 'lucide-react-native';`
);

fs.writeFileSync(file, content);
