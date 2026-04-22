import * as fs from 'fs';

const file = 'mobile/src/screens/ProfileScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace {name} with a watch value
content = content.replace(
  /<Text style=\{styles\.userName\}>\{name\}<\/Text>/,
  '<Text style={styles.userName}>{watch("legal_name")}</Text>'
);

fs.writeFileSync(file, content, 'utf8');
