sed -i 's/const currentServerTime = Date.now();/\/\/ We now trust the timestamp since it is securely calculated against server time on device/' server/controllers/attendanceController.ts
sed -i 's/const { type, delay_in_milliseconds, lat, lng, deviceId } = log;/const { type, timestamp, lat, lng, deviceId } = log;/g' server/controllers/attendanceController.ts
sed -i 's/const delay = typeof delay_in_milliseconds === .number. ? delay_in_milliseconds : 0;/\/\/ Use raw timestamp/g' server/controllers/attendanceController.ts
sed -i 's/const timestamp = new Date(currentServerTime - delay).toISOString();/\/\/ Timestamp is extracted from log above/g' server/controllers/attendanceController.ts
