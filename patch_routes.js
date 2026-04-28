const fs = require('fs');

// Patch dashboard.js
let dash = fs.readFileSync('routes/dashboard.js', 'utf8');
dash = dash.replace('getDashboardSummary()', 'getDashboardSummary(req.globalBranch)');
dash = dash.replace('getDashboardCharts()', 'getDashboardCharts(req.globalBranch)');
fs.writeFileSync('routes/dashboard.js', dash, 'utf8');

// Patch reports.js
let rep = fs.readFileSync('routes/reports.js', 'utf8');
rep = rep.replace('getReportsData()', 'getReportsData(req.globalBranch)');
rep = rep.replace('getReportsData()', 'getReportsData(req.globalBranch)'); // For the PDF route as well
fs.writeFileSync('routes/reports.js', rep, 'utf8');

// Patch atRisk.js
let atRisk = fs.readFileSync('routes/atRisk.js', 'utf8');
if (!atRisk.includes('const { getDepartmentFromBranch }')) {
  atRisk = atRisk.replace('const Student = require("../models/Student");', 'const Student = require("../models/Student");\nconst { getDepartmentFromBranch } = require("../utils/branchFilter");');
}
atRisk = atRisk.replace(
  'const students = await Student.find().lean();',
  `const branch = req.globalBranch;
    const dept = getDepartmentFromBranch(branch);
    const query = dept ? { department: dept } : {};
    const students = await Student.find(query).lean();`
);
fs.writeFileSync('routes/atRisk.js', atRisk, 'utf8');

// Patch internalAssessment.js
let intAss = fs.readFileSync('routes/internalAssessment.js', 'utf8');
if (!intAss.includes('const { getDepartmentFromBranch }')) {
  intAss = intAss.replace('const Student = require("../models/Student");', 'const Student = require("../models/Student");\nconst { getDepartmentFromBranch } = require("../utils/branchFilter");');
}
intAss = intAss.replace(
  'const query = search',
  `const branch = req.globalBranch;
    const dept = getDepartmentFromBranch(branch);
    const branchQuery = dept ? { department: dept } : {};
    let query = search`
);
intAss = intAss.replace(
  '      : {};',
  '      : {};\n    query = { ...query, ...branchQuery };'
);
fs.writeFileSync('routes/internalAssessment.js', intAss, 'utf8');

// Patch assessmentTemplates.js
let assTemp = fs.readFileSync('routes/assessmentTemplates.js', 'utf8');
if (!assTemp.includes('const { getDepartmentFromBranch }')) {
  assTemp = assTemp.replace('const AssessmentTemplate = require("../models/AssessmentTemplate");', 'const AssessmentTemplate = require("../models/AssessmentTemplate");\nconst { getDepartmentFromBranch } = require("../utils/branchFilter");');
}
assTemp = assTemp.replace(
  'const query = search',
  `const branch = req.globalBranch;
    const dept = getDepartmentFromBranch(branch);
    const branchQuery = dept ? { department: dept } : {};
    let query = search`
);
assTemp = assTemp.replace(
  '      : {};',
  '      : {};\n    query = { ...query, ...branchQuery };'
);
fs.writeFileSync('routes/assessmentTemplates.js', assTemp, 'utf8');

console.log("routes patched");
