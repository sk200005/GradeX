const express = require("express");
const Student = require("../models/Student");
const Mark = require("../models/Mark");
const Attendance = require("../models/Attendance");
const SemesterResult = require("../models/SemesterResult");
const { ensureAuthenticated } = require("../middleware/auth");
const { getDepartmentFromBranch } = require("../utils/branchFilter");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const search = (req.query.search || "").trim();
    const branch = req.globalBranch;
    const subjectFilter = req.globalSubject;
    
    let queryConditions = [];
    
    const dept = getDepartmentFromBranch(branch);
    if (dept) {
      queryConditions.push({ department: dept });
    }
    
    if (search) {
      queryConditions.push({
        $or: [
          { rollNumber: { $regex: search, $options: "i" } },
          { fullName: { $regex: search, $options: "i" } }
        ]
      });
    }

    if (subjectFilter) {
      const marksForSubject = await Mark.find({ subject: subjectFilter }).select('student').lean();
      const studentIds = marksForSubject.map(m => m.student);
      queryConditions.push({ _id: { $in: studentIds } });
    }
    
    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};
    
    const students = await Student.find(query).sort({ rollNumber: 1 }).lean();
    
    res.render("student-profiles/index", {
      pageTitle: "Student Profiles",
      students,
      search
    });
  } catch (error) {
    next(error);
  }
});

router.get("/export", ensureAuthenticated, async (req, res, next) => {
  try {
    const search = (req.query.search || "").trim();
    const branch = req.globalBranch;
    const subjectFilter = req.globalSubject;
    
    let queryConditions = [];
    
    const dept = getDepartmentFromBranch(branch);
    if (dept) {
      queryConditions.push({ department: dept });
    }
    
    if (search) {
      queryConditions.push({
        $or: [
          { rollNumber: { $regex: search, $options: "i" } },
          { fullName: { $regex: search, $options: "i" } }
        ]
      });
    }

    if (subjectFilter) {
      const marksForSubject = await Mark.find({ subject: subjectFilter }).select('student').lean();
      const studentIds = marksForSubject.map(m => m.student);
      queryConditions.push({ _id: { $in: studentIds } });
    }
    
    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};
    
    const students = await Student.find(query).sort({ rollNumber: 1 }).lean();
    
    const header = ["Roll Number", "Full Name", "Gender", "Email", "Phone", "Department", "Course", "City", "State", "Semester"];
    const rows = students.map((s) => [
      s.rollNumber,
      `"${s.fullName}"`,
      s.gender || "",
      s.email || "",
      s.phone || "",
      `"${s.department}"`,
      `"${s.course}"`,
      `"${s.city || ""}"`,
      `"${s.state || ""}"`,
      s.semester
    ]);

    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"students-export.csv\"");
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", ensureAuthenticated, async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id).lean();
    if (!student) {
      req.flash("error", "Student not found.");
      return res.redirect("/student-profiles");
    }
    
    const [marks, attendance, semesterResult] = await Promise.all([
      Mark.find({ student: student._id }).sort({ semester: -1, subjectName: 1 }).lean(),
      Attendance.find({ student: student._id }).lean(),
      SemesterResult.findOne({ student: student._id, semester: student.semester }).lean()
    ]);
    
    // Combine marks and attendance by subject
    const subjectData = marks.map(mark => {
      const att = attendance.find(a => a.subject.toString() === mark.subject.toString());
      return {
        subjectName: mark.subjectName,
        internalMarks: mark.internalMarks,
        externalMarks: mark.externalMarks,
        totalMarks: mark.totalMarks,
        grade: mark.grade,
        attendancePercentage: att ? att.attendancePercentage : 0
      };
    });
    
    res.render("student-profiles/show", {
      pageTitle: "Student Profile Details",
      student,
      subjectData,
      semesterResult
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
