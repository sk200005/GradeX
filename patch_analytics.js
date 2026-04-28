const fs = require('fs');

const file = '/Users/swayam/GradeX/GradeX/utils/analytics.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const SemesterResult = require("../models/SemesterResult");',
  `const SemesterResult = require("../models/SemesterResult");
const { getDepartmentFromBranch } = require("./branchFilter");

function getMatchStage(globalBranch) {
  const dept = getDepartmentFromBranch(globalBranch);
  return dept ? { department: dept } : {};
}

function getPipelineMatch(globalBranch) {
  const dept = getDepartmentFromBranch(globalBranch);
  return dept ? [{ $match: { department: dept } }] : [];
}

function getAttendanceMatch(globalBranch) {
  if (globalBranch === "CS") return { rollNumber: /^CS1/i };
  if (globalBranch === "IT") return { rollNumber: /^IT2/i };
  if (globalBranch === "ECE") return { rollNumber: /^EC3/i };
  return {};
}

function getAttendancePipelineMatch(globalBranch) {
  const match = getAttendanceMatch(globalBranch);
  return Object.keys(match).length ? [{ $match: match }] : [];
}
`
);

content = content.replace(
  'async function getDashboardSummary() {',
  'async function getDashboardSummary(globalBranch) {\n  const matchStage = getMatchStage(globalBranch);\n  const pipelineMatch = getPipelineMatch(globalBranch);\n  const attendancePipelineMatch = getAttendancePipelineMatch(globalBranch);'
);

content = content.replace('Student.countDocuments(),', 'Student.countDocuments(matchStage),');
content = content.replace('Subject.countDocuments(),', 'Subject.countDocuments(matchStage),');
content = content.replace('SemesterResult.aggregate([', 'SemesterResult.aggregate([\n        ...pipelineMatch,');
content = content.replace('Attendance.aggregate([', 'Attendance.aggregate([\n        ...attendancePipelineMatch,');

content = content.replace(
  'async function getDashboardCharts() {',
  'async function getDashboardCharts(globalBranch) {\n  const pipelineMatch = getPipelineMatch(globalBranch);\n  const attendancePipelineMatch = getAttendancePipelineMatch(globalBranch);'
);

content = content.replace(/Mark\.aggregate\(\[/g, 'Mark.aggregate([\n      ...pipelineMatch,');
content = content.replace(/SemesterResult\.aggregate\(\[/g, 'SemesterResult.aggregate([\n      ...pipelineMatch,');

content = content.replace(
  'async function getReportsData() {',
  'async function getReportsData(globalBranch) {\n  const pipelineMatch = getPipelineMatch(globalBranch);\n  const attendanceMatch = getAttendanceMatch(globalBranch);'
);

content = content.replace('Attendance.find({ attendancePercentage: { $lt: 75 } })', 'Attendance.find({ attendancePercentage: { $lt: 75 }, ...attendanceMatch })');

content = content.replace('{ $match: { resultStatus: "Fail" } },', '{ $match: { resultStatus: "Fail" } },'); // We already prepended pipelineMatch before this stage, so it's fine.

fs.writeFileSync(file, content, 'utf8');
console.log("analytics patched");
