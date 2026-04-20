import * as fs from 'fs';

const file = 'src/features/employees/EmployeeDetail.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldHandleSave = `  const handleSave = handleSubmit((data: any) => {`;
const newHandleSave = `  const handleSave = handleSubmit((data: any) => {
    if (data.status === 'suspended' && !data.suspension_reason?.trim()) {
      alert('Suspension reason is required when status is suspended.');
      return;
    }
    setIsSaving(true);
    const finalData = { ...watchedData, ...data };
    if (finalData.date_of_birth instanceof Date) {
      finalData.date_of_birth = finalData.date_of_birth.toISOString().split('T')[0];
    }
    if (finalData.hire_date instanceof Date) {
      finalData.hire_date = finalData.hire_date.toISOString().split('T')[0];
    }
    updateMutation.mutate(finalData, {
      onSettled: () => setIsSaving(false)
    });
  }, (errors) => {
    console.error('Form validation failed:', errors);
    alert('Please fix the errors in the form before saving.');
  });`;

content = content.replace(
  /  const handleSave = handleSubmit\(\(data: any\) => \{\n\s*if \(data\.status === 'suspended' && !data\.suspension_reason\?\.trim\(\)\) \{\n\s*alert\('Suspension reason is required when status is suspended\.'\);\n\s*return;\n\s*\}\n\s*setIsSaving\(true\);\n\s*const finalData = \{ \.\.\.watchedData, \.\.\.data \};\n\s*if \(finalData\.date_of_birth instanceof Date\) \{\n\s*finalData\.date_of_birth = finalData\.date_of_birth\.toISOString\(\)\.split\('T'\)\[0\];\n\s*\}\n\s*if \(finalData\.hire_date instanceof Date\) \{\n\s*finalData\.hire_date = finalData\.hire_date\.toISOString\(\)\.split\('T'\)\[0\];\n\s*\}\n\s*updateMutation\.mutate\(finalData, \{\n\s*onSettled: \(\) => setIsSaving\(false\)\n\s*\}\);\n\s*\}\);/g,
  newHandleSave
);

fs.writeFileSync(file, content, 'utf8');
