const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Mark = require("../models/Mark");
const Attendance = require("../models/Attendance");
const SemesterResult = require("../models/SemesterResult");
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


async function getDashboardSummary(globalBranch) {
  const matchStage = getMatchStage(globalBranch);
  const pipelineMatch = getPipelineMatch(globalBranch);
  const attendancePipelineMatch = getAttendancePipelineMatch(globalBranch);
  const [totalStudents, totalSubjects, resultStats, attendanceStats] =
    await Promise.all([
      Student.countDocuments(matchStage),
      Subject.countDocuments(matchStage),
      Mark.aggregate([
        ...pipelineMatch,
        {
          $group: {
            _id: "$student",
            hasFail: {
              $max: {
                $cond: [{ $eq: ["$resultStatus", "Fail"] }, 1, 0]
              }
            }
          }
        },
        {
          $group: {
            _id: "$hasFail",
            count: { $sum: 1 }
          }
        }
      ]),
      Attendance.aggregate([
        ...attendancePipelineMatch,
        {
          $group: {
            _id: null,
            averageAttendance: { $avg: "$attendancePercentage" }
          }
        }
      ])
    ]);

  const dept = getDepartmentFromBranch(globalBranch) || "All Departments";
  const subjectsList = await Subject.find(matchStage).select('subjectName').lean();
  const subjectNames = subjectsList.map(s => s.subjectName).join(", ");

  const failedStudents =
    resultStats.find((item) => item._id === 1)?.count || 0;
  const passedStudents =
    resultStats.find((item) => item._id === 0)?.count || 0;
  const averageAttendance = Number(
    (attendanceStats[0]?.averageAttendance || 0).toFixed(2)
  );

  return {
    departmentName: dept,
    subjectNames,
    totalStudents,
    totalSubjects,
    passedStudents,
    failedStudents,
    averageAttendance
  };
}

async function getDashboardCharts(globalBranch) {
  const pipelineMatch = getPipelineMatch(globalBranch);
  const [
    topThreeStudents,
    subjectToppers
  ] = await Promise.all([
    Mark.aggregate([
      ...pipelineMatch,
      {
        $group: {
          _id: "$rollNumber",
          fullName: { $first: "$studentName" },
          averageMarks: { $avg: "$totalMarks" }
        }
      },
      { $sort: { averageMarks: -1 } },
      { $limit: 3 }
    ]),
    Mark.aggregate([
      ...pipelineMatch,
      {
        $sort: { subjectName: 1, totalMarks: -1 }
      },
      {
        $group: {
          _id: "$subjectName",
          studentName: { $first: "$studentName" },
          rollNumber: { $first: "$rollNumber" },
          marks: { $first: "$totalMarks" }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  return {
    topThreeStudents,
    subjectToppers
  };
}

async function getReportsData(globalBranch) {
  const pipelineMatch = getPipelineMatch(globalBranch);
  const attendanceMatch = getAttendanceMatch(globalBranch);
  const [
    topTenStudents,
    failedStudentsBySubject,
    lowAttendanceStudents,
    departmentToppers,
    averageMarksBySubject,
    semesterWiseResults
  ] = await Promise.all([
    Mark.aggregate([
      ...pipelineMatch,
      {
        $group: {
          _id: "$rollNumber",
          fullName: { $first: "$studentName" },
          department: { $first: "$department" },
          averageMarks: { $avg: "$totalMarks" }
        }
      },
      { $sort: { averageMarks: -1 } },
      { $limit: 10 }
    ]),
    Mark.aggregate([
      ...pipelineMatch,
      { $match: { resultStatus: "Fail" } },
      {
        $group: {
          _id: "$subjectName",
          students: {
            $push: {
              rollNumber: "$rollNumber",
              studentName: "$studentName",
              marks: "$totalMarks"
            }
          },
          failCount: { $sum: 1 }
        }
      },
      { $sort: { failCount: -1 } }
    ]),
    Attendance.find({ attendancePercentage: { $lt: 75 }, ...attendanceMatch })
      .sort({ attendancePercentage: 1 })
      .lean(),
    Mark.aggregate([
      ...pipelineMatch,
      {
        $sort: {
          department: 1,
          totalMarks: -1
        }
      },
      {
        $group: {
          _id: "$department",
          studentName: { $first: "$studentName" },
          rollNumber: { $first: "$rollNumber" },
          highestMarks: { $first: "$totalMarks" }
        }
      }
    ]),
    Mark.aggregate([
      ...pipelineMatch,
      {
        $group: {
          _id: "$subjectName",
          averageMarks: { $avg: "$totalMarks" }
        }
      },
      { $sort: { averageMarks: -1 } }
    ]),
    SemesterResult.aggregate([
      ...pipelineMatch,
      {
        $group: {
          _id: "$semester",
          totalStudents: { $sum: 1 },
          passCount: {
            $sum: {
              $cond: [{ $eq: ["$resultStatus", "Pass"] }, 1, 0]
            }
          },
          failCount: {
            $sum: {
              $cond: [{ $eq: ["$resultStatus", "Fail"] }, 1, 0]
            }
          },
          averageCgpa: { $avg: "$cgpa" }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  return {
    topTenStudents,
    failedStudentsBySubject,
    lowAttendanceStudents,
    departmentToppers,
    averageMarksBySubject,
    semesterWiseResults
  };
}

module.exports = {
  getDashboardSummary,
  getDashboardCharts,
  getReportsData
};
