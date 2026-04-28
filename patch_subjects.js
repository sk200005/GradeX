const fs = require('fs');

let subj = fs.readFileSync('routes/subjects.js', 'utf8');
if (!subj.includes('const { getDepartmentFromBranch }')) {
  subj = subj.replace('const Subject = require("../models/Subject");', 'const Subject = require("../models/Subject");\nconst { getDepartmentFromBranch } = require("../utils/branchFilter");');
}
subj = subj.replace(
  'const query = search',
  `const branch = req.globalBranch;
    const dept = getDepartmentFromBranch(branch);
    const branchQuery = dept ? { department: dept } : {};
    let query = search`
);
subj = subj.replace(
  '      : {};',
  '      : {};\n    query = { ...query, ...branchQuery };'
);
fs.writeFileSync('routes/subjects.js', subj, 'utf8');

console.log("subjects patched");
