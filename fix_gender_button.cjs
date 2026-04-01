const fs = require('fs');

let regScreen = fs.readFileSync('mobile/src/screens/auth/RegisterScreen.tsx', 'utf8');

regScreen = regScreen.replace(/  genderButton: \{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e4e4e7', alignItems: 'center', backgroundColor: '#fafafa' \},/,
`  genderButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 8, borderWidth: 1, borderColor: '#e4e4e7', alignItems: 'center', backgroundColor: '#fafafa' },`);

fs.writeFileSync('mobile/src/screens/auth/RegisterScreen.tsx', regScreen);
