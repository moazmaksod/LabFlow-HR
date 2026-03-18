const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'mobile/src/components/SmartAttendanceCard.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add useNetworkStore import
content = content.replace(
    /import \{ useAttendanceStore \} from '\.\.\/store\/useAttendanceStore';/,
    `import { useAttendanceStore } from '../store/useAttendanceStore';\nimport { useNetworkStore } from '../store/useNetworkStore';\nimport { AlertCircle } from 'lucide-react-native';`
);

// Inject true time and tampering state
content = content.replace(
    /const activeSession = useAttendanceStore\(\(state\) => state\.activeSession\);[\s\S]*?const \[now, setNow\] = useState\(\(\) => new Date\(\)\);[\s\S]*?useEffect\(\(\) => \{[\s\S]*?const interval = setInterval\(\(\) => \{[\s\S]*?setNow\(new Date\(\)\);[\s\S]*?\}, 30000\);[\s\S]*?return \(\) => clearInterval\(interval\);[\s\S]*?\}, \[\]\);/,
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
  const isTimeTampered = Math.abs(serverTimeOffset) > 120000 || Date.now() < lastLocalSyncTime;
`
);

// Disable buttons and show banner if tampered
const buttonRowRegex = /<View style=\{styles\.buttonRow\}>([\s\S]*?)<\/View>/g;
const replaceButtonRow = `<View style={styles.buttonRow}>
          {isTimeTampered ? (
            <View style={styles.tamperContainer}>
              <AlertCircle color="#ef4444" size={24} style={{ marginBottom: 8 }} />
              <Text style={styles.tamperTitle}>Device Time Out of Sync</Text>
              <Text style={styles.tamperText}>
                Please set your phone's Date & Time to 'Automatic' to log attendance.
              </Text>
            </View>
          ) : !isClockedIn ? (
            <TouchableOpacity
              style={[styles.clockButton, styles.clockInButton, loading && styles.disabledButton]}
              onPress={() => handleClock('check_in')}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock In</Text>}
            </TouchableOpacity>
          ) : (
            <>
              {currentStatus === 'working' ? (
                <TouchableOpacity
                  style={[styles.clockButton, styles.stepAwayButton, loading && styles.disabledButton]}
                  onPress={handleStepAway}
                  disabled={loading}
                >
                  <Pause color="#fff" size={20} style={{ marginRight: 8 }} />
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Step Away</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.clockButton, styles.resumeButton, loading && styles.disabledButton]}
                  onPress={handleResumeWork}
                  disabled={loading}
                >
                  <Play color="#fff" size={20} style={{ marginRight: 8 }} />
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Resume Work</Text>}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.clockButton, styles.clockOutButton, loading && styles.disabledButton]}
                onPress={() => handleClock('check_out')}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock Out</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>`;

content = content.replace(buttonRowRegex, replaceButtonRow);

// Same replacement for the "No Shift Today" state
const noShiftButtonRowRegex = /<View style=\{styles\.buttonRow\}>\s*<TouchableOpacity\s*style=\{\[styles\.clockButton, styles\.clockInButton\]\}\s*onPress=\{\(\) => handleClock\('check_in'\)\}\s*disabled=\{loading\}\s*>\s*\{loading \? <ActivityIndicator color="#fff" \/> : <Text style=\{styles\.buttonText\}>Clock In Anyway<\/Text>\}\s*<\/TouchableOpacity>\s*<\/View>/g;

const replaceNoShiftButtonRow = `<View style={styles.buttonRow}>
          {isTimeTampered ? (
            <View style={styles.tamperContainer}>
              <AlertCircle color="#ef4444" size={24} style={{ marginBottom: 8 }} />
              <Text style={styles.tamperTitle}>Device Time Out of Sync</Text>
              <Text style={styles.tamperText}>
                Please set your phone's Date & Time to 'Automatic' to log attendance.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.clockButton, styles.clockInButton]}
              onPress={() => handleClock('check_in')}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clock In Anyway</Text>}
            </TouchableOpacity>
          )}
          </View>`;

content = content.replace(noShiftButtonRowRegex, replaceNoShiftButtonRow);

// Add tamper styles
content = content.replace(
    /buttonRow: \{/,
    `tamperContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  tamperTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ef4444',
    marginBottom: 4,
  },
  tamperText: {
    fontSize: 13,
    color: '#991b1b',
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonRow: {`
);


fs.writeFileSync(file, content);
