import * as fs from 'fs';

const file = 'mobile/src/screens/ProfileScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix remaining compilation errors
content = content.replace(/setName\(data\.name\);[\s\S]*?setAvatar\(data\.profile_picture_url \|\| null\);/m, 'setAvatar(data.profile_picture_url || null);');

content = content.replace(/\{errors\.legal_name\.message as string\}/g, '{String(errors.legal_name.message)}');
content = content.replace(/\{errors\.personal_phone\.message as string\}/g, '{String(errors.personal_phone.message)}');
content = content.replace(/\{errors\.date_of_birth\.message as string\}/g, '{String(errors.date_of_birth.message)}');
content = content.replace(/\{errors\.national_id\.message as string\}/g, '{String(errors.national_id.message)}');
content = content.replace(/\{errors\.bio\.message as string\}/g, '{String(errors.bio.message)}');

// Fix missing imports
content = content.replace(/import \{ User, Camera, Save, LogOut, Mail, UserCircle, Lock, Info, DollarSign, Calendar, Clock, Shield, LayoutDashboard, MapPin, Landmark, HeartHandshake \} from 'lucide-react-native';/, "import { User, Camera, Save, LogOut, Mail, UserCircle, Lock, Info, DollarSign, Calendar, Clock, Shield, LayoutDashboard, MapPin, Landmark, HeartHandshake, Phone, FileText } from 'lucide-react-native';");

// Fix missing styles
content = content.replace(/inputWrapper: \{/g, 'inputError: { borderColor: "red", borderWidth: 1 },\n  errorText: { color: "red", fontSize: 12, marginTop: 4, marginLeft: 4 },\n  inputWrapper: {');

fs.writeFileSync(file, content, 'utf8');
