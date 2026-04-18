require("dotenv").config();
const mongoose = require("mongoose");

const State = require("../models/State");
const City = require("../models/City");
const Department = require("../models/Department");
const Course = require("../models/Course");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Mark = require("../models/Mark");
const Attendance = require("../models/Attendance");
const SemesterResult = require("../models/SemesterResult");
const FactResult = require("../models/FactResult");
const DimStudent = require("../models/DimStudent");
const DimSubject = require("../models/DimSubject");
const DimTime = require("../models/DimTime");
const DimDepartment = require("../models/DimDepartment");
const { ensureDefaultAdmin } = require("../utils/bootstrap");
const { syncWarehouseCollections } = require("../utils/warehouse");

const states = [
  { name: "Tamil Nadu" },
  { name: "Karnataka" },
  { name: "Maharashtra" }
];

const cities = [
  { name: "Chennai", state: "Tamil Nadu" },
  { name: "Coimbatore", state: "Tamil Nadu" },
  { name: "Bengaluru", state: "Karnataka" },
  { name: "Mysuru", state: "Karnataka" },
  { name: "Pune", state: "Maharashtra" },
  { name: "Mumbai", state: "Maharashtra" }
];

const departments = [
  {
    name: "Computer Science",
    code: "CSE",
    description: "Focuses on software development, data structures, and system design."
  },
  {
    name: "Information Technology",
    code: "IT",
    description: "Covers applications, networking, and enterprise systems."
  },
  {
    name: "Electronics",
    code: "ECE",
    description: "Builds strong fundamentals in digital systems and communication."
  }
];

const courses = [
  { name: "B.Sc Computer Science", code: "BSCS", department: "Computer Science" },
  { name: "BCA", code: "BCA", department: "Information Technology" },
  { name: "B.Tech ECE", code: "BTECE", department: "Electronics" }
];

const students = [
  ["CS101", "Aarav Kumar", "Male", "Computer Science", "B.Sc Computer Science", "Chennai", "Tamil Nadu", 3, "aarav@example.com", "9876500001"],
  ["CS102", "Diya Raman", "Female", "Computer Science", "B.Sc Computer Science", "Coimbatore", "Tamil Nadu", 3, "diya@example.com", "9876500002"],
  ["CS103", "Kiran Joseph", "Male", "Computer Science", "B.Sc Computer Science", "Bengaluru", "Karnataka", 3, "kiran@example.com", "9876500003"],
  ["IT201", "Meera Iyer", "Female", "Information Technology", "BCA", "Pune", "Maharashtra", 4, "meera@example.com", "9876500004"],
  ["IT202", "Rohit Sen", "Male", "Information Technology", "BCA", "Mumbai", "Maharashtra", 4, "rohit@example.com", "9876500005"],
  ["IT203", "Nila Thomas", "Female", "Information Technology", "BCA", "Bengaluru", "Karnataka", 4, "nila@example.com", "9876500006"],
  ["EC301", "Sanjay Das", "Male", "Electronics", "B.Tech ECE", "Mysuru", "Karnataka", 5, "sanjay@example.com", "9876500007"],
  ["EC302", "Priya Shah", "Female", "Electronics", "B.Tech ECE", "Chennai", "Tamil Nadu", 5, "priya@example.com", "9876500008"],
  ["EC303", "Vikram Rao", "Male", "Electronics", "B.Tech ECE", "Pune", "Maharashtra", 5, "vikram@example.com", "9876500009"],
  ["CS104", "Ishita Bose", "Female", "Computer Science", "B.Sc Computer Science", "Mumbai", "Maharashtra", 3, "ishita@example.com", "9876500010"],
  ["IT204", "Aditya Nair", "Male", "Information Technology", "BCA", "Coimbatore", "Tamil Nadu", 4, "aditya@example.com", "9876500011"],
  ["EC304", "Sara Mathew", "Female", "Electronics", "B.Tech ECE", "Chennai", "Tamil Nadu", 5, "sara@example.com", "9876500012"]
];

const subjectSeed = [
  ["CS301", "Database Management Systems", "Computer Science", "B.Sc Computer Science", 3],
  ["CS302", "Web Technology", "Computer Science", "B.Sc Computer Science", 3],
  ["IT401", "Cloud Fundamentals", "Information Technology", "BCA", 4],
  ["IT402", "Software Engineering", "Information Technology", "BCA", 4],
  ["EC501", "Digital Signal Processing", "Electronics", "B.Tech ECE", 5],
  ["EC502", "Embedded Systems", "Electronics", "B.Tech ECE", 5]
];

function findDepartmentSubjects(studentDepartment, allSubjects) {
  return allSubjects.filter((subject) => subject.department === studentDepartment);
}

function buildMarkValues(studentIndex, subjectIndex) {
  const internal = 55 + ((studentIndex * 7 + subjectIndex * 5) % 40);
  const external = 48 + ((studentIndex * 9 + subjectIndex * 11) % 45);
  return {
    internalMarks: Math.min(internal, 100),
    externalMarks: Math.min(external, 100)
  };
}

function buildAttendanceValues(studentIndex, subjectIndex) {
  const totalClasses = 40 + ((studentIndex + subjectIndex) % 10);
  const presentClasses = totalClasses - ((studentIndex * 2 + subjectIndex * 3) % 12);
  return {
    totalClasses,
    presentClasses
  };
}

async function seedDatabase() {
  await mongoose.connect(process.env.MONGODB_URI);

  await Promise.all([
    State.deleteMany({}),
    City.deleteMany({}),
    Department.deleteMany({}),
    Course.deleteMany({}),
    Student.deleteMany({}),
    Subject.deleteMany({}),
    Mark.deleteMany({}),
    Attendance.deleteMany({}),
    SemesterResult.deleteMany({}),
    FactResult.deleteMany({}),
    DimStudent.deleteMany({}),
    DimSubject.deleteMany({}),
    DimTime.deleteMany({}),
    DimDepartment.deleteMany({})
  ]);

  await ensureDefaultAdmin();
  await State.insertMany(states);
  await City.insertMany(cities);
  await Department.insertMany(departments);
  await Course.insertMany(courses);

  const createdStudents = await Student.insertMany(
    students.map((student) => ({
      rollNumber: student[0],
      fullName: student[1],
      gender: student[2],
      department: student[3],
      course: student[4],
      city: student[5],
      state: student[6],
      semester: student[7],
      email: student[8],
      phone: student[9]
    }))
  );

  const createdSubjects = await Subject.insertMany(
    subjectSeed.map((subject) => ({
      subjectCode: subject[0],
      subjectName: subject[1],
      department: subject[2],
      course: subject[3],
      semester: subject[4]
    }))
  );

  const marksToCreate = [];
  const attendanceToCreate = [];
  const resultsToCreate = [];

  createdStudents.forEach((student, studentIndex) => {
    const matchingSubjects = findDepartmentSubjects(
      student.department,
      createdSubjects
    );

    let totalScore = 0;

    matchingSubjects.forEach((subject, subjectIndex) => {
      const markValues = buildMarkValues(studentIndex, subjectIndex);
      const attendanceValues = buildAttendanceValues(studentIndex, subjectIndex);

      marksToCreate.push({
        student: student._id,
        rollNumber: student.rollNumber,
        studentName: student.fullName,
        subject: subject._id,
        subjectName: subject.subjectName,
        internalMarks: markValues.internalMarks,
        externalMarks: markValues.externalMarks,
        semester: student.semester,
        department: student.department
      });

      attendanceToCreate.push({
        student: student._id,
        rollNumber: student.rollNumber,
        studentName: student.fullName,
        subject: subject._id,
        subjectName: subject.subjectName,
        totalClasses: attendanceValues.totalClasses,
        presentClasses: attendanceValues.presentClasses
      });

      totalScore += Math.round(
        (markValues.internalMarks + markValues.externalMarks) / 2
      );
    });

    const averageMark = totalScore / Math.max(matchingSubjects.length, 1);
    const sgpa = Number(Math.min((averageMark / 10).toFixed(2), 10));
    const cgpa = Number(Math.min((sgpa - 0.2 + (studentIndex % 4) * 0.15).toFixed(2), 10));

    resultsToCreate.push({
      student: student._id,
      rollNumber: student.rollNumber,
      studentName: student.fullName,
      semester: student.semester,
      sgpa,
      cgpa: cgpa > 0 ? cgpa : sgpa,
      resultStatus: averageMark >= 40 ? "Pass" : "Fail",
      department: student.department
    });
  });

  await Mark.insertMany(marksToCreate);
  await Attendance.insertMany(attendanceToCreate);
  await SemesterResult.insertMany(resultsToCreate);
  await syncWarehouseCollections();

  console.log("Sample data inserted successfully.");
  console.log("Default admin credentials -> username: admin, password: admin123");
  await mongoose.disconnect();
}

seedDatabase().catch(async (error) => {
  console.error("Seed failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
