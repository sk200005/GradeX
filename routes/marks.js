const express = require("express");

const Mark = require("../models/Mark");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const SemesterResult = require("../models/SemesterResult");
const { ensureAuthenticated } = require("../middleware/auth");
const { getStudentAndSubjectReferenceData } = require("../utils/referenceData");
const { getErrorMessage } = require("../utils/errors");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const search = (req.query.search || "").trim();
    const query = search
      ? {
          $or: [
            { rollNumber: { $regex: search, $options: "i" } },
            { studentName: { $regex: search, $options: "i" } },
            { subjectName: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const marks = await Mark.find(query).sort({ createdAt: -1 }).lean();

    res.render("marks/index", {
      pageTitle: "Marks Management",
      marks,
      search
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

module.exports = router;
