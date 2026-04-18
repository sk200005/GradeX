const express = require("express");

const SemesterResult = require("../models/SemesterResult");
const Student = require("../models/Student");
const { ensureAuthenticated } = require("../middleware/auth");
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
            { department: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const [results, students] = await Promise.all([
      SemesterResult.find(query).sort({ semester: 1, studentName: 1 }).lean(),
      Student.find().sort({ fullName: 1 }).lean()
    ]);

    res.render("results/index", {
      pageTitle: "Semester Results",
      results,
      students,
      search
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", ensureAuthenticated, async (req, res) => {
  try {
    const student = await Student.findById(req.body.student);

    if (!student) {
      req.flash("error", "Please select a valid student.");
      return res.redirect("/results");
    }

    const existingResult = await SemesterResult.findOne({
      student: student._id,
      semester: req.body.semester
    });

    if (existingResult) {
      req.flash(
        "error",
        "Semester result for this student already exists. Please edit the existing record."
      );
      return res.redirect("/results");
    }

    await SemesterResult.create({
      student: student._id,
      rollNumber: student.rollNumber,
      studentName: student.fullName,
      semester: req.body.semester,
      sgpa: req.body.sgpa,
      cgpa: req.body.cgpa,
      resultStatus: req.body.resultStatus,
      department: student.department
    });

    req.flash("success", "Semester result added successfully.");
    return res.redirect("/results");
  } catch (error) {
    req.flash(
      "error",
      getErrorMessage(error, "Unable to add semester result.")
    );
    return res.redirect("/results");
  }
});

router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const result = await SemesterResult.findById(req.params.id);

    if (!result) {
      req.flash("error", "Semester result not found.");
      return res.redirect("/results");
    }

    const student = await Student.findById(req.body.student || result.student);

    if (!student) {
      req.flash("error", "Please select a valid student.");
      return res.redirect("/results");
    }

    const duplicateResult = await SemesterResult.findOne({
      _id: { $ne: result._id },
      student: student._id,
      semester: req.body.semester
    });

    if (duplicateResult) {
      req.flash("error", "Duplicate semester result is not allowed.");
      return res.redirect("/results");
    }

    result.student = student._id;
    result.rollNumber = student.rollNumber;
    result.studentName = student.fullName;
    result.semester = req.body.semester;
    result.sgpa = req.body.sgpa;
    result.cgpa = req.body.cgpa;
    result.resultStatus = req.body.resultStatus;
    result.department = student.department;
    await result.save();

    req.flash("success", "Semester result updated successfully.");
    return res.redirect("/results");
  } catch (error) {
    req.flash(
      "error",
      getErrorMessage(error, "Unable to update semester result.")
    );
    return res.redirect("/results");
  }
});

router.delete("/:id", ensureAuthenticated, async (req, res) => {
  try {
    await SemesterResult.findByIdAndDelete(req.params.id);
    req.flash("success", "Semester result deleted successfully.");
    return res.redirect("/results");
  } catch (error) {
    req.flash(
      "error",
      getErrorMessage(error, "Unable to delete semester result.")
    );
    return res.redirect("/results");
  }
});

module.exports = router;
