const express = require("express");

const Student = require("../models/Student");
const Mark = require("../models/Mark");
const Attendance = require("../models/Attendance");
const SemesterResult = require("../models/SemesterResult");
const Department = require("../models/Department");
const Course = require("../models/Course");
const City = require("../models/City");
const State = require("../models/State");
const Subject = require("../models/Subject");
const { ensureAuthenticated } = require("../middleware/auth");
const { getAcademicReferenceData } = require("../utils/referenceData");
const { getErrorMessage } = require("../utils/errors");
const upload = require("../middleware/upload");
const { parseUploadedFile } = require("../utils/parseUpload");
const { bulkInsert } = require("../utils/bulkUpload");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = 8;
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
          { fullName: { $regex: search, $options: "i" } },
          { department: { $regex: search, $options: "i" } },
          { course: { $regex: search, $options: "i" } }
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
      const marksForSubject = await Mark.find({ subject: subjectFilter }).select('student').lean();
      const studentIds = marksForSubject.map(m => m.student);
      queryConditions.push({ _id: { $in: studentIds } });
    }

    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};

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
      semester,
      subjectFilter,
      filterSubjects,
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

    // Load all reference data once for fast name-lookup
    const [departments, courses, cities, states] = await Promise.all([
      Department.find().lean(),
      Course.find().lean(),
      City.find().lean(),
      State.find().lean()
    ]);

    const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.name]));
    const courseMap = new Map(courses.map((c) => [c.name.toLowerCase(), c.name]));
    const cityMap = new Map(cities.map((c) => [c.name.toLowerCase(), c.name]));
    const stateMap = new Map(states.map((s) => [s.name.toLowerCase(), s.name]));

    const docs = [];
    const rowErrors = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const required = ["rollNumber", "fullName", "gender", "email", "phone", "department", "course", "city", "state", "semester"];
      const missing = required.filter((f) => !row[f] && row[f] !== 0);

      if (missing.length) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber || `Row ${rowNum}`, message: `Missing required columns: ${missing.join(", ")}` });
        return;
      }

      const deptName = deptMap.get(row.department.toLowerCase());
      const courseName = courseMap.get(row.course.toLowerCase());
      const cityName = cityMap.get(row.city.toLowerCase());
      const stateName = stateMap.get(row.state.toLowerCase());

      if (!deptName) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `Department not found: "${row.department}"` });
        return;
      }
      if (!courseName) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `Course not found: "${row.course}"` });
        return;
      }
      if (!cityName) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `City not found: "${row.city}"` });
        return;
      }
      if (!stateName) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `State not found: "${row.state}"` });
        return;
      }

      const semester = Number(row.semester);
      if (!semester || semester < 1 || semester > 8) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: "Semester must be a number between 1 and 8." });
        return;
      }

      docs.push({
        rollNumber: row.rollNumber,
        fullName: row.fullName,
        gender: row.gender,
        email: row.email,
        phone: row.phone,
        department: deptName,
        course: courseName,
        city: cityName,
        state: stateName,
        semester
      });
    });

    const { successCount, errors: dbErrors } = await bulkInsert(Student, docs);
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
