const express = require("express");

const Mark = require("../models/Mark");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const SemesterResult = require("../models/SemesterResult");
const { ensureAuthenticated } = require("../middleware/auth");
const { getStudentAndSubjectReferenceData } = require("../utils/referenceData");
const { getErrorMessage } = require("../utils/errors");
const upload = require("../middleware/upload");
const { parseUploadedFile } = require("../utils/parseUpload");
const { bulkInsert } = require("../utils/bulkUpload");
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

// ─── Bulk Upload ─────────────────────────────────────────────────────────────

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

    if (!rows.length) {
      return res.json({ success: true, successCount: 0, errorCount: 0, errors: [] });
    }

    // Pre-load all students and subjects for lookup
    const [allStudents, allSubjects] = await Promise.all([
      Student.find().lean(),
      Subject.find().lean()
    ]);

    const studentMap = new Map(allStudents.map((s) => [s.rollNumber.toLowerCase(), s]));
    const subjectMap = new Map(allSubjects.map((s) => [s.subjectCode.toLowerCase(), s]));

    const docs = [];
    const rowErrors = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const required = ["rollNumber", "subjectCode", "internalMarks", "externalMarks"];
      const missing = required.filter((f) => !row[f] && row[f] !== 0);

      if (missing.length) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber || `Row ${rowNum}`, message: `Missing required columns: ${missing.join(", ")}` });
        return;
      }

      const student = studentMap.get(row.rollNumber.toLowerCase());
      if (!student) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `Student with roll number "${row.rollNumber}" not found.` });
        return;
      }

      const subject = subjectMap.get(row.subjectCode.toLowerCase());
      if (!subject) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `Subject with code "${row.subjectCode}" not found.` });
        return;
      }

      const internalMarks = Number(row.internalMarks);
      const externalMarks = Number(row.externalMarks);

      if (isNaN(internalMarks) || internalMarks < 0 || internalMarks > 100) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: "internalMarks must be between 0 and 100." });
        return;
      }
      if (isNaN(externalMarks) || externalMarks < 0 || externalMarks > 100) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: "externalMarks must be between 0 and 100." });
        return;
      }

      // Compute derived fields inline (insertMany bypasses pre-validate hooks)
      const { totalMarks, grade, resultStatus } = calculateMarkSummary(internalMarks, externalMarks);

      docs.push({
        student: student._id,
        rollNumber: student.rollNumber,
        studentName: student.fullName,
        subject: subject._id,
        subjectName: subject.subjectName,
        internalMarks,
        externalMarks,
        totalMarks,
        grade,
        resultStatus,
        semester: student.semester,
        department: student.department
      });
    });

    const { successCount, errors: dbErrors } = await bulkInsert(Mark, docs);
    const allErrors = [...rowErrors, ...dbErrors];

    return res.json({
      success: true,
      successCount,
      errorCount: allErrors.length,
      errors: allErrors
    });
  }
);

module.exports = router;
