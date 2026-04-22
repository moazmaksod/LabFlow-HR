import * as fs from 'fs';

const file = 'mobile/src/screens/ProfileScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

// Rather than trying to regex the entire massive mobile file, we should keep ONLY the fields that are in the EmployeeProfileSchema, and strip the others out or leave them read-only if they exist in the schema, per instructions: "use our established validation architecture (react-hook-form + @hookform/resolvers/zod + EmployeeProfileSchema)."
// The schema is: legal_name, personal_phone, date_of_birth, national_id, bio.

// Let's replace the entire `form` section inside the return() with the new Controller based ones.
const matchStart = '<View style={styles.section}>\\s*<Text style={styles.sectionTitle}>Personal Information</Text>';
const matchEnd = '<View style={styles.section}>\\s*<Text style={styles.sectionTitle}>Job Details</Text>';

const regex = new RegExp(`${matchStart}[\\s\\S]*?(?=${matchEnd})`);

const newFormSection = `
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <View style={styles.inputGroup}>
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
          </View>

          <View style={styles.inputGroup}>
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
          </View>

          <View style={styles.inputGroup}>
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
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>National ID</Text>
            <View style={[styles.inputWrapper, errors.national_id && styles.inputError]}>
              <Shield size={18} color="#71717a" style={styles.inputIcon} />
              <Controller
                control={control}
                name="national_id"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={styles.input}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="National Identification Number"
                  />
                )}
              />
            </View>
            {errors.national_id && <Text style={styles.errorText}>{errors.national_id.message as string}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio</Text>
            <View style={[styles.inputWrapper, errors.bio && styles.inputError]}>
              <FileText size={18} color="#71717a" style={styles.inputIcon} />
              <Controller
                control={control}
                name="bio"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="Tell us about yourself..."
                    multiline
                    numberOfLines={4}
                  />
                )}
              />
            </View>
            {errors.bio && <Text style={styles.errorText}>{errors.bio.message as string}</Text>}
          </View>
        </View>

`;

content = content.replace(regex, newFormSection);

// Update Save button
content = content.replace(
  /<TouchableOpacity style=\{styles\.saveButton\} onPress=\{handleUpdateProfile\}>/,
  '<TouchableOpacity style={styles.saveButton} onPress={handleUpdateProfile}>'
);

fs.writeFileSync(file, content, 'utf8');
