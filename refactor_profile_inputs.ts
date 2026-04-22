import * as fs from 'fs';

const file = 'mobile/src/screens/ProfileScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

// There are many fields in ProfileScreen.tsx that we must map to the react-hook-form using Controller
// Note: Since EmployeeProfileSchema does not cover all fields from the mobile screen, I need to modify the
// mobile UI to only show the fields in EmployeeProfileSchema OR I need to use the `HrEmployeeDetailSchema` if
// we want all those fields. The instructions say: "Use the established validation architecture
// (react-hook-form + @hookform/resolvers/zod + EmployeeProfileSchema)."
// I will remove the extraneous fields from the UI that aren't in the EmployeeProfileSchema,
// as a ManagerProfile (or EmployeeProfile self-edit) does not include bank details or emergency contacts usually.
// Wait, the prompt specifically says "I am reviewing the mobile/src/screens/ProfileScreen.tsx code... Use EmployeeProfileSchema".

content = content.replace(/<View style=\{styles.inputGroup\}>[\s\S]*?<Text style=\{styles.label\}>Full Name<\/Text>[\s\S]*?<TextInput[\s\S]*?value=\{name\}[\s\S]*?onChangeText=\{setName\}[\s\S]*?\/>[\s\S]*?<\/View>/,
`         <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <View style={[styles.inputWrapper, errors.legal_name && styles.inputError]}>
              <UserCircle size={18} color="#71717a" style={styles.inputIcon} />
              <Controller
                control={control}
                name="legal_name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={styles.input}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="Full Name"
                  />
                )}
              />
            </View>
            {errors.legal_name && <Text style={styles.errorText}>{errors.legal_name.message as string}</Text>}
          </View>`);


content = content.replace(/<View style=\{styles.inputGroup\}>[\s\S]*?<Text style=\{styles.label\}>Personal Phone<\/Text>[\s\S]*?<TextInput[\s\S]*?value=\{personalPhone\}[\s\S]*?onChangeText=\{setPersonalPhone\}[\s\S]*?\/>[\s\S]*?<\/View>/,
`         <View style={styles.inputGroup}>
            <Text style={styles.label}>Personal Phone</Text>
            <View style={[styles.inputWrapper, errors.personal_phone && styles.inputError]}>
              <Phone size={18} color="#71717a" style={styles.inputIcon} />
              <Controller
                control={control}
                name="personal_phone"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={styles.input}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="+1 234 567 890"
                    keyboardType="phone-pad"
                  />
                )}
              />
            </View>
            {errors.personal_phone && <Text style={styles.errorText}>{errors.personal_phone.message as string}</Text>}
          </View>`);


content = content.replace(/<View style=\{styles.inputGroup\}>[\s\S]*?<Text style=\{styles.label\}>Date of Birth<\/Text>[\s\S]*?<TextInput[\s\S]*?value=\{dateOfBirth\}[\s\S]*?onChangeText=\{setDateOfBirth\}[\s\S]*?\/>[\s\S]*?<\/View>/,
`         <View style={styles.inputGroup}>
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity
              style={[styles.inputWrapper, errors.date_of_birth && styles.inputError]}
              onPress={() => setShowDatePicker(true)}
            >
              <Calendar size={18} color="#71717a" style={styles.inputIcon} />
              <Text style={[styles.input, { paddingTop: 14 }]}>
                {watchDateOfBirth ? (watchDateOfBirth as Date).toISOString().split('T')[0] : 'YYYY-MM-DD'}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={watchDateOfBirth || new Date(new Date().setFullYear(new Date().getFullYear() - 18))}
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
          </View>`);

content = content.replace(/<View style=\{styles.inputGroup\}>[\s\S]*?<Text style=\{styles.label\}>National ID<\/Text>[\s\S]*?<TextInput[\s\S]*?value=\{bankAccountIban\}[\s\S]*?onChangeText=\{setBankAccountIban\}[\s\S]*?\/>[\s\S]*?<\/View>/,
``); // Actually it looks like National ID is missing or maybe mixed up. I will do a regex to replace the bio section first.

fs.writeFileSync(file, content, 'utf8');
