const express = require("express");

const Mark = require("../models/Mark");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const SemesterResult = require("../models/SemesterResult");
const Attendance = require("../models/Attendance");
const { ensureAuthenticated } = require("../middleware/auth");
const { getStudentAndSubjectReferenceData } = require("../utils/referenceData");
const { getErrorMessage } = require("../utils/errors");
const upload = require("../middleware/upload");
const { parseUploadedFile } = require("../utils/parseUpload");
const { processUnifiedUpload } = require("../utils/unifiedUpload");
const { calculateMarkSummary } = require("../utils/calculations");

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
        queryConditions.push({ semester: semNum });
      }
    }

    if (subjectFilter) {
      queryConditions.push({ subject: subjectFilter });
    }

    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};

    const marks = await Mark.find(query).sort({ createdAt: -1 }).lean();

    res.render("marks/index", {
      pageTitle: "Marks Management",
      marks,
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

    res.render("marks/form", {
      pageTitle: "Add Marks",
      mark: {},
      formAction: "/marks",
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
      return res.redirect("/marks/new");
    }

    const existingMark = await Mark.findOne({
      student: student._id,
      subject: subject._id
    });

    if (existingMark) {
      req.flash(
        "error",
        "Marks for this student and subject already exist. Please edit the existing record."
      );
      return res.redirect("/marks");
    }

    await Mark.create({
      student: student._id,
      rollNumber: student.rollNumber,
      studentName: student.fullName,
      subject: subject._id,
      subjectName: subject.subjectName,
      internalMarks: req.body.internalMarks,
      externalMarks: req.body.externalMarks,
      semester: student.semester,
      department: student.department
    });

    req.flash("success", "Marks saved successfully.");
    return res.redirect("/marks");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to save marks."));
    return res.redirect("/marks/new");
  }
});

router.get("/:id/edit", ensureAuthenticated, async (req, res, next) => {
  try {
    const [mark, referenceData] = await Promise.all([
      Mark.findById(req.params.id).lean(),
      getStudentAndSubjectReferenceData()
    ]);

    if (!mark) {
      req.flash("error", "Mark record not found.");
      return res.redirect("/marks");
    }

    return res.render("marks/form", {
      pageTitle: "Edit Marks",
      mark,
      formAction: `/marks/${mark._id}?_method=PUT`,
      formMethod: "POST",
      ...referenceData
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const mark = await Mark.findById(req.params.id);

    if (!mark) {
      req.flash("error", "Mark record not found.");
      return res.redirect("/marks");
    }

    const student = await Student.findById(req.body.student || mark.student);
    const subject = await Subject.findById(req.body.subject || mark.subject);

    if (!student || !subject) {
      req.flash("error", "Please select a valid student and subject.");
      return res.redirect(`/marks/${req.params.id}/edit`);
    }

    const duplicateMark = await Mark.findOne({
      _id: { $ne: mark._id },
      student: student._id,
      subject: subject._id
    });

    if (duplicateMark) {
      req.flash("error", "Duplicate mark record is not allowed.");
      return res.redirect(`/marks/${req.params.id}/edit`);
    }

    mark.student = student._id;
    mark.rollNumber = student.rollNumber;
    mark.studentName = student.fullName;
    mark.subject = subject._id;
    mark.subjectName = subject.subjectName;
    mark.internalMarks = req.body.internalMarks;
    mark.externalMarks = req.body.externalMarks;
    mark.semester = student.semester;
    mark.department = student.department;
    await mark.save();

    req.flash("success", "Marks updated successfully.");
    return res.redirect("/marks");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to update marks."));
    return res.redirect(`/marks/${req.params.id}/edit`);
  }
});

router.delete("/:id", ensureAuthenticated, async (req, res) => {
  try {
    await Mark.findByIdAndDelete(req.params.id);
    req.flash("success", "Marks record deleted successfully.");
    return res.redirect("/marks");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to delete marks."));
    return res.redirect("/marks");
  }
});

router.get("/marksheet/:studentId", ensureAuthenticated, async (req, res, next) => {
  try {
    const [student, marks, semesterResult] = await Promise.all([
      Student.findById(req.params.studentId).lean(),
      Mark.find({ student: req.params.studentId }).sort({ subjectName: 1 }).lean(),
      SemesterResult.findOne({ student: req.params.studentId }).lean()
    ]);

    if (!student) {
      req.flash("error", "Student not found.");
      return res.redirect("/students");
    }

    const averageMarks = marks.length
      ? Number(
          (
            marks.reduce((sum, item) => sum + item.totalMarks, 0) / marks.length
          ).toFixed(2)
        )
      : 0;

    return res.render("marks/marksheet", {
      pageTitle: "Printable Marksheet",
      student,
      marks,
      semesterResult,
      averageMarks
    });
  } catch (error) {
    return next(error);
  }
});

// ─── Bulk Upload (Unified — updates both Marks & Attendance) ─────────────────

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
