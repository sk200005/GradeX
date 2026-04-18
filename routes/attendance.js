const express = require("express");

const Attendance = require("../models/Attendance");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
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

    const attendanceRecords = await Attendance.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.render("attendance/index", {
      pageTitle: "Attendance Management",
      attendanceRecords,
      search
    });
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

module.exports = router;
