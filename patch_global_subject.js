const fs = require('fs');

const routeFiles = [
  'routes/students.js',
  'routes/marks.js',
  'routes/attendance.js',
  'routes/results.js'
];

routeFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Replace subjectFilter extraction
  content = content.replace(/const subjectFilter = \(req\.query\.subject \|\| ""\)\.trim\(\);/g, 'const subjectFilter = req.globalSubject;');
  
  // Note: the view logic inside these routes passes `subjectFilter` and `filterSubjects` to res.render, 
  // which is fine but not strictly necessary anymore. I'll leave it or we can ignore it since res.locals covers it.

  fs.writeFileSync(file, content, 'utf8');
});

const viewFiles = [
  'views/students/index.ejs',
  'views/marks/index.ejs',
  'views/attendance/index.ejs',
  'views/results/index.ejs'
];

viewFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Remove the old subject select dropdown block
  const selectRegex = /<select name="subject"[\s\S]*?<\/select>/g;
  content = content.replace(selectRegex, '');

  fs.writeFileSync(file, content, 'utf8');
});

console.log("global subject patched");
