const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Mark = require("../models/Mark");
const Attendance = require("../models/Attendance");
const Department = require("../models/Department");
const FactResult = require("../models/FactResult");
const DimStudent = require("../models/DimStudent");
const DimSubject = require("../models/DimSubject");
const DimTime = require("../models/DimTime");
const DimDepartment = require("../models/DimDepartment");

async function syncWarehouseCollections() {
  const [students, subjects, marks, attendanceRecords, departments] =
    await Promise.all([
      Student.find().lean(),
      Subject.find().lean(),
      Mark.find().lean(),
      Attendance.find().lean(),
      Department.find().lean()
    ]);

  await Promise.all([
    FactResult.deleteMany({}),
    DimStudent.deleteMany({}),
    DimSubject.deleteMany({}),
    DimTime.deleteMany({}),
    DimDepartment.deleteMany({})
  ]);

  if (students.length) {
    await DimStudent.insertMany(
      students.map((student) => ({
        student_id: student._id,
        rollNumber: student.rollNumber,
        fullName: student.fullName,
        gender: student.gender,
        city: student.city,
        state: student.state,
        department: student.department,
        course: student.course,
        semester: student.semester
      }))
    );
  }

  if (subjects.length) {
    await DimSubject.insertMany(
      subjects.map((subject) => ({
        subject_id: subject._id,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        department: subject.department,
        course: subject.course,
        semester: subject.semester
      }))
    );
  }

  if (departments.length) {
    await DimDepartment.insertMany(
      departments.map((department) => ({
        department: department.name,
        code: department.code
      }))
    );
  }

  const semesters = [...new Set(marks.map((mark) => mark.semester))];
  if (semesters.length) {
    await DimTime.insertMany(
      semesters.map((semester) => ({
        semester,
        academicYear: "2025-2026",
        label: `Semester ${semester}`
      }))
    );
  }

  if (marks.length) {
    const attendanceMap = new Map(
      attendanceRecords.map((record) => [
        `${record.rollNumber}-${record.subjectName}`,
        record.attendancePercentage
      ])
    );

    await FactResult.insertMany(
      marks.map((mark) => ({
        student_id: mark.student,
        subject_id: mark.subject,
        semester: mark.semester,
        department: mark.department,
        marks: mark.totalMarks,
        attendance:
          attendanceMap.get(`${mark.rollNumber}-${mark.subjectName}`) || 0,
        pass_fail: mark.resultStatus
      }))
    );
  }

  return {
    studentDimensions: students.length,
    subjectDimensions: subjects.length,
    factRows: marks.length,
    timeDimensions: semesters.length,
    departmentDimensions: departments.length
  };
}

module.exports = {
  syncWarehouseCollections
};
