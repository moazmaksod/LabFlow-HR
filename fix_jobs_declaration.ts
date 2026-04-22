import * as fs from 'fs';

const file = 'src/features/employees/EmployeeDetail.tsx';
let content = fs.readFileSync(file, 'utf8');

// Move activeJob below jobs declaration
content = content.replace(
  "  const watchedData = watch() as any;\n  const activeJob = jobs?.find((j: any) => j.id === watchedData.job_id);",
  "  const watchedData = watch() as any;"
);

content = content.replace(
  "      return res.data;\n    }\n  });",
  "      return res.data;\n    }\n  });\n\n  const activeJob = jobs?.find((j: any) => j.id === watchedData.job_id);"
);

fs.writeFileSync(file, content, 'utf8');
