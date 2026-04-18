const Department = require("../models/Department");
const Course = require("../models/Course");
const City = require("../models/City");
const State = require("../models/State");
const Student = require("../models/Student");
const Subject = require("../models/Subject");

async function getAcademicReferenceData() {
  const [departments, courses, cities, states] = await Promise.all([
    Department.find().sort({ name: 1 }).lean(),
    Course.find().sort({ name: 1 }).lean(),
    City.find().sort({ name: 1 }).lean(),
    State.find().sort({ name: 1 }).lean()
  ]);

  return {
    departments,
    courses,
    cities,
    states
  };
}

async function getStudentAndSubjectReferenceData() {
  const [students, subjects] = await Promise.all([
    Student.find().sort({ fullName: 1 }).lean(),
    Subject.find().sort({ subjectName: 1 }).lean()
  ]);

  return {
    students,
    subjects
  };
}

module.exports = {
  getAcademicReferenceData,
  getStudentAndSubjectReferenceData
};
