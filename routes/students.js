const express = require("express");

const Student = require("../models/Student");
const Mark = require("../models/Mark");
const Attendance = require("../models/Attendance");
const SemesterResult = require("../models/SemesterResult");
const { ensureAuthenticated } = require("../middleware/auth");
const { getAcademicReferenceData } = require("../utils/referenceData");
const { getErrorMessage } = require("../utils/errors");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = 8;
    const search = (req.query.search || "").trim();
    const query = search
      ? {
          $or: [
            { rollNumber: { $regex: search, $options: "i" } },
            { fullName: { $regex: search, $options: "i" } },
            { department: { $regex: search, $options: "i" } },
            { course: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const [students, totalStudents] = await Promise.all([
      Student.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(query)
    ]);

    res.render("students/index", {
      pageTitle: "Students",
      students,
      search,
      pagination: {
        page,
        limit,
        totalPages: Math.max(Math.ceil(totalStudents / limit), 1),
        totalItems: totalStudents
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/new", ensureAuthenticated, async (req, res, next) => {
  try {
    const referenceData = await getAcademicReferenceData();

    res.render("students/form", {
      pageTitle: "Add Student",
      student: {},
      formAction: "/students",
      formMethod: "POST",
      ...referenceData
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", ensureAuthenticated, async (req, res) => {
  try {
    await Student.create(req.body);
    req.flash("success", "Student added successfully.");
    res.redirect("/students");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to add student."));
    res.redirect("/students/new");
  }
});

router.get("/:id", ensureAuthenticated, async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id).lean();

    if (!student) {
      req.flash("error", "Student not found.");
      return res.redirect("/students");
    }

    const [marks, attendanceRecords, semesterResults] = await Promise.all([
      Mark.find({ student: student._id }).sort({ subjectName: 1 }).lean(),
      Attendance.find({ student: student._id }).sort({ subjectName: 1 }).lean(),
      SemesterResult.find({ student: student._id })
        .sort({ semester: 1 })
        .lean()
    ]);

    return res.render("students/view", {
      pageTitle: "Student Details",
      student,
      marks,
      attendanceRecords,
      semesterResults
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/edit", ensureAuthenticated, async (req, res, next) => {
  try {
    const [student, referenceData] = await Promise.all([
      Student.findById(req.params.id).lean(),
      getAcademicReferenceData()
    ]);

    if (!student) {
      req.flash("error", "Student not found.");
      return res.redirect("/students");
    }

    return res.render("students/form", {
      pageTitle: "Edit Student",
      student,
      formAction: `/students/${student._id}?_method=PUT`,
      formMethod: "POST",
      ...referenceData
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!student) {
      req.flash("error", "Student not found.");
      return res.redirect("/students");
    }

    await Promise.all([
      Mark.updateMany(
        { student: student._id },
        {
          rollNumber: student.rollNumber,
          studentName: student.fullName,
          department: student.department,
          semester: student.semester
        }
      ),
      Attendance.updateMany(
        { student: student._id },
        {
          rollNumber: student.rollNumber,
          studentName: student.fullName
        }
      ),
      SemesterResult.updateMany(
        { student: student._id },
        {
          rollNumber: student.rollNumber,
          studentName: student.fullName,
          department: student.department
        }
      )
    ]);

    req.flash("success", "Student updated successfully.");
    return res.redirect("/students");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to update student."));
    return res.redirect(`/students/${req.params.id}/edit`);
  }
});

router.delete("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);

    if (!student) {
      req.flash("error", "Student not found.");
      return res.redirect("/students");
    }

    await Promise.all([
      Mark.deleteMany({ student: student._id }),
      Attendance.deleteMany({ student: student._id }),
      SemesterResult.deleteMany({ student: student._id })
    ]);

    req.flash("success", "Student deleted successfully.");
    return res.redirect("/students");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to delete student."));
    return res.redirect("/students");
  }
});

module.exports = router;
