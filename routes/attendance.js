const express = require("express");

const Attendance = require("../models/Attendance");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Mark = require("../models/Mark");
const { ensureAuthenticated } = require("../middleware/auth");
const { getStudentAndSubjectReferenceData } = require("../utils/referenceData");
const { getErrorMessage } = require("../utils/errors");
const upload = require("../middleware/upload");
const { parseUploadedFile } = require("../utils/parseUpload");
const { processUnifiedUpload } = require("../utils/unifiedUpload");
const { calculateAttendancePercentage } = require("../utils/calculations");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const search = (req.query.search || "").trim();
    const branch = req.globalBranch;
    const semester = (req.query.semester || "").trim();
    const subjectFilter = req.globalSubject;

    let queryConditions = [];

    let subjectQuery = {};
    if (branch === 'CS') subjectQuery.department = "Computer Science";
    if (branch === 'IT') subjectQuery.department = "Information Technology";
    if (branch === 'ECE') subjectQuery.department = "Electronics";

    if (semester) {
      const semNum = Number(semester);
      if (!isNaN(semNum)) subjectQuery.semester = semNum;
    }

    const filterSubjects = await Subject.find(subjectQuery).select('_id subjectName').sort({ subjectName: 1 }).lean();

    if (search) {
      queryConditions.push({
        $or: [
          { rollNumber: { $regex: search, $options: "i" } },
          { studentName: { $regex: search, $options: "i" } },
          { subjectName: { $regex: search, $options: "i" } }
        ]
      });
    }

    if (branch === 'CS') {
      queryConditions.push({ rollNumber: { $regex: '^CS1', $options: 'i' } });
    } else if (branch === 'IT') {
      queryConditions.push({ rollNumber: { $regex: '^IT2', $options: 'i' } });
    } else if (branch === 'ECE') {
      queryConditions.push({ rollNumber: { $regex: '^EC3', $options: 'i' } });
    }

    if (semester) {
      const semNum = Number(semester);
      if (!isNaN(semNum)) {
        const studentsInSem = await Student.find({ semester: semNum }).select('_id').lean();
        const studentIds = studentsInSem.map(s => s._id);
        queryConditions.push({ student: { $in: studentIds } });
      }
    }

    if (subjectFilter) {
      queryConditions.push({ subject: subjectFilter });
    }

    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};

    const attendanceRecords = await Attendance.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.render("attendance/index", {
      pageTitle: "Attendance Management",
      attendanceRecords,
      search,
      semester,
      subjectFilter,
      filterSubjects
    });
  } catch (error) {
    next(error);
  }
});

router.get("/export", ensureAuthenticated, async (req, res, next) => {
  try {
    const branch = req.globalBranch;
    const semester = (req.query.semester || "").trim();
    const subjectFilter = req.globalSubject;

    // --- Build student query for current category ---
    let studentQuery = {};
    if (branch === 'CS') studentQuery.department = "Computer Science";
    if (branch === 'IT') studentQuery.department = "Information Technology";
    if (branch === 'ECE') studentQuery.department = "Electronics";
    if (semester) {
      const semNum = Number(semester);
      if (!isNaN(semNum)) studentQuery.semester = semNum;
    }

    // --- Build subject query for current category ---
    let subjectQuery = {};
    if (branch === 'CS') subjectQuery.department = "Computer Science";
    if (branch === 'IT') subjectQuery.department = "Information Technology";
    if (branch === 'ECE') subjectQuery.department = "Electronics";
    if (semester) {
      const semNum = Number(semester);
      if (!isNaN(semNum)) subjectQuery.semester = semNum;
    }
    if (subjectFilter) {
      subjectQuery._id = subjectFilter;
    }

    const [students, subjects] = await Promise.all([
      Student.find(studentQuery).sort({ rollNumber: 1 }).lean(),
      Subject.find(subjectQuery).sort({ subjectName: 1 }).lean()
    ]);

    const studentIds = students.map(s => s._id);
    const subjectIds = subjects.map(s => s._id);

    const [marks, attendances] = await Promise.all([
      Mark.find({ student: { $in: studentIds }, subject: { $in: subjectIds } }).lean(),
      Attendance.find({ student: { $in: studentIds }, subject: { $in: subjectIds } }).lean()
    ]);

    const marksMap = new Map();
    marks.forEach(m => marksMap.set(`${m.student}_${m.subject}`, m));

    const attMap = new Map();
    attendances.forEach(a => attMap.set(`${a.student}_${a.subject}`, a));

    // --- Generate template rows: one per student-subject pair ---
    const header = ["Roll No", "Student Name", "Subject", "Total Classes", "Present", "Internal", "External"];
    const rows = [];
    for (const student of students) {
      for (const subject of subjects) {
        const key = `${student._id}_${subject._id}`;
        const mark = marksMap.get(key);
        const att = attMap.get(key);

        rows.push([
          student.rollNumber,
          `"${student.fullName}"`,
          `"${subject.subjectName}"`,
          att && att.totalClasses !== undefined ? att.totalClasses : "",
          att && att.presentClasses !== undefined ? att.presentClasses : "",
          mark && mark.internalMarks !== undefined ? mark.internalMarks : "",
          mark && mark.externalMarks !== undefined ? mark.externalMarks : ""
        ]);
      }
    }

    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"upload-template.csv\"");
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.get("/new", ensureAuthenticated, async (req, res, next) => {
  try {
    const referenceData = await getStudentAndSubjectReferenceData();

    res.render("attendance/form", {
      pageTitle: "Add Attendance",
      attendance: {},
      formAction: "/attendance",
      formMethod: "POST",
      ...referenceData
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", ensureAuthenticated, async (req, res) => {
  try {
    const student = await Student.findById(req.body.student);
    const subject = await Subject.findById(req.body.subject);

    if (!student || !subject) {
      req.flash("error", "Please select a valid student and subject.");
      return res.redirect("/attendance/new");
    }

    const existingAttendance = await Attendance.findOne({
      student: student._id,
      subject: subject._id
    });

    if (existingAttendance) {
      req.flash(
        "error",
        "Attendance for this student and subject already exists. Please edit it instead."
      );
      return res.redirect("/attendance");
    }

    await Attendance.create({
      student: student._id,
      rollNumber: student.rollNumber,
      studentName: student.fullName,
      subject: subject._id,
      subjectName: subject.subjectName,
      totalClasses: req.body.totalClasses,
      presentClasses: req.body.presentClasses
    });

    req.flash("success", "Attendance record saved successfully.");
    return res.redirect("/attendance");
  } catch (error) {
    req.flash(
      "error",
      getErrorMessage(error, "Unable to save attendance record.")
    );
    return res.redirect("/attendance/new");
  }
});

router.get("/:id/edit", ensureAuthenticated, async (req, res, next) => {
  try {
    const [attendance, referenceData] = await Promise.all([
      Attendance.findById(req.params.id).lean(),
      getStudentAndSubjectReferenceData()
    ]);

    if (!attendance) {
      req.flash("error", "Attendance record not found.");
      return res.redirect("/attendance");
    }

    return res.render("attendance/form", {
      pageTitle: "Edit Attendance",
      attendance,
      formAction: `/attendance/${attendance._id}?_method=PUT`,
      formMethod: "POST",
      ...referenceData
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);

    if (!attendance) {
      req.flash("error", "Attendance record not found.");
      return res.redirect("/attendance");
    }

    const student = await Student.findById(req.body.student || attendance.student);
    const subject = await Subject.findById(req.body.subject || attendance.subject);

    if (!student || !subject) {
      req.flash("error", "Please select a valid student and subject.");
      return res.redirect(`/attendance/${req.params.id}/edit`);
    }

    const duplicateAttendance = await Attendance.findOne({
      _id: { $ne: attendance._id },
      student: student._id,
      subject: subject._id
    });

    if (duplicateAttendance) {
      req.flash("error", "Duplicate attendance record is not allowed.");
      return res.redirect(`/attendance/${req.params.id}/edit`);
    }

    attendance.student = student._id;
    attendance.rollNumber = student.rollNumber;
    attendance.studentName = student.fullName;
    attendance.subject = subject._id;
    attendance.subjectName = subject.subjectName;
    attendance.totalClasses = req.body.totalClasses;
    attendance.presentClasses = req.body.presentClasses;
    await attendance.save();

    req.flash("success", "Attendance updated successfully.");
    return res.redirect("/attendance");
  } catch (error) {
    req.flash(
      "error",
      getErrorMessage(error, "Unable to update attendance record.")
    );
    return res.redirect(`/attendance/${req.params.id}/edit`);
  }
});

router.delete("/:id", ensureAuthenticated, async (req, res) => {
  try {
    await Attendance.findByIdAndDelete(req.params.id);
    req.flash("success", "Attendance record deleted successfully.");
    return res.redirect("/attendance");
  } catch (error) {
    req.flash(
      "error",
      getErrorMessage(error, "Unable to delete attendance record.")
    );
    return res.redirect("/attendance");
  }
});

// ─── Bulk Upload (Unified — updates both Attendance & Marks) ─────────────────

router.post(
  "/upload",
  ensureAuthenticated,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    let rows;
    try {
      rows = await parseUploadedFile(req.file.buffer, req.file.originalname);
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: parseErr.message });
    }

    const result = await processUnifiedUpload(rows);
    return res.json(result);
  }
);

module.exports = router;
