const fs = require('fs');

const files = [
  'views/students/index.ejs',
  'views/marks/index.ejs',
  'views/attendance/index.ejs',
  'views/results/index.ejs'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Remove hidden branch input
  content = content.replace(/<input type="hidden" name="branch".*?\/>\n?/g, '');

  // Remove branch-filters div
  const regex = /<div class="branch-filters"[^>]*>[\s\S]*?<\/div>\s*<div class="semester-filters"/g;
  content = content.replace(regex, '<div class="semester-filters"');

  fs.writeFileSync(file, content, 'utf8');
});

console.log("ejs patched");
