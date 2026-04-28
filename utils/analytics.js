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
      SemesterResult.aggregate([
      ...pipelineMatch,
        ...pipelineMatch,
        {
          $group: {
            _id: "$resultStatus",
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

  const passedStudents =
    resultStats.find((item) => item._id === "Pass")?.count || 0;
  const failedStudents =
    resultStats.find((item) => item._id === "Fail")?.count || 0;
  const averageAttendance = Number(
    (attendanceStats[0]?.averageAttendance || 0).toFixed(2)
  );

  return {
    totalStudents,
    totalSubjects,
    passedStudents,
    failedStudents,
    averageAttendance
  };
}

async function getDashboardCharts(globalBranch) {
  const pipelineMatch = getPipelineMatch(globalBranch);
  const attendancePipelineMatch = getAttendancePipelineMatch(globalBranch);
  const [
    topStudents,
    subjectPassFail,
    attendanceVsMarks,
    departmentPerformance,
    semesterResultAnalysis
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
      { $limit: 5 }
    ]),
    Mark.aggregate([
      ...pipelineMatch,
      {
        $group: {
          _id: {
            subject: "$subjectName",
            status: "$resultStatus"
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.subject": 1 } }
    ]),
    Mark.aggregate([
      ...pipelineMatch,
      {
        $group: {
          _id: "$rollNumber",
          studentName: { $first: "$studentName" },
          averageMarks: { $avg: "$totalMarks" }
        }
      },
      {
        $lookup: {
          from: "attendance",
          localField: "_id",
          foreignField: "rollNumber",
          as: "attendanceRecords"
        }
      },
      {
        $addFields: {
          averageAttendance: {
            $ifNull: [{ $avg: "$attendanceRecords.attendancePercentage" }, 0]
          }
        }
      },
      {
        $project: {
          _id: 0,
          studentName: 1,
          averageMarks: { $round: ["$averageMarks", 2] },
          averageAttendance: { $round: ["$averageAttendance", 2] }
        }
      },
      { $sort: { averageMarks: -1 } },
      { $limit: 8 }
    ]),
    Mark.aggregate([
      ...pipelineMatch,
      {
        $group: {
          _id: "$department",
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
          passed: {
            $sum: {
              $cond: [{ $eq: ["$resultStatus", "Pass"] }, 1, 0]
            }
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ["$resultStatus", "Fail"] }, 1, 0]
            }
          },
          averageSgpa: { $avg: "$sgpa" }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  return {
    topStudents,
    subjectPassFail,
    attendanceVsMarks,
    departmentPerformance,
    semesterResultAnalysis
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
