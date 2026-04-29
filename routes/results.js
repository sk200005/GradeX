const express = require("express");

const SemesterResult = require("../models/SemesterResult");
const Student = require("../models/Student");
const { ensureAuthenticated } = require("../middleware/auth");
const { getErrorMessage } = require("../utils/errors");
const upload = require("../middleware/upload");
const { parseUploadedFile } = require("../utils/parseUpload");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const search = (req.query.search || "").trim();
    const branch = req.globalBranch;
    const semester = (req.query.semester || "").trim();
    const subjectFilter = req.globalSubject;

    const Subject = require("../models/Subject");
    const Mark = require("../models/Mark");

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
          { department: { $regex: search, $options: "i" } }
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
      queryConditions.push({ student: { $in: studentIds } });
    }

    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};

    const [results, students] = await Promise.all([
      SemesterResult.find(query).sort({ semester: 1, studentName: 1 }).lean(),
      Student.find().sort({ fullName: 1 }).lean()
    ]);

    res.render("results/index", {
      pageTitle: "Semester Results",
      results,
      students,
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

    let studentQuery = {};
    if (branch === 'CS') studentQuery.department = "Computer Science";
    if (branch === 'IT') studentQuery.department = "Information Technology";
    if (branch === 'ECE') studentQuery.department = "Electronics";
    if (semester) {
      const semNum = Number(semester);
      if (!isNaN(semNum)) studentQuery.semester = semNum;
    }

    const students = await Student.find(studentQuery).sort({ rollNumber: 1 }).lean();

    const header = ["Roll No", "Student Name", "Semester", "SGPA", "CGPA", "Pass"];
    const rows = students.map((s) => [
      s.rollNumber,
      `"${s.fullName}"`,
      s.semester || "",
      "",
      "",
      ""
    ]);

    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"results-upload-template.csv\"");
    return res.send(csv);
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

router.post("/upload", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      req.flash("error", "No file uploaded.");
      return res.redirect("/results");
    }

    const rows = await parseUploadedFile(req.file.buffer, req.file.originalname);
    let successCount = 0;
    
    for (const row of rows) {
      const rollNumber = row["Roll No"] || row.rollNumber;
      const semester = Number(row["Semester"] || row.semester);
      const sgpa = Number(row["SGPA"] || row.sgpa);
      const cgpa = Number(row["CGPA"] || row.cgpa);
      const resultStatus = row["Pass"] || row["Status"] || row.resultStatus;

      if (!rollNumber || isNaN(semester) || isNaN(sgpa) || isNaN(cgpa) || !resultStatus) {
        continue;
      }

      const student = await Student.findOne({ rollNumber });
      if (!student) continue;

      const filter = { student: student._id, semester };
      const update = {
        rollNumber: student.rollNumber,
        studentName: student.fullName,
        department: student.department,
        sgpa,
        cgpa,
        resultStatus
      };

      await SemesterResult.findOneAndUpdate(filter, update, { upsert: true, new: true });
      successCount++;
    }

    req.flash("success", `Successfully processed ${successCount} semester results.`);
    return res.redirect("/results");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Failed to process upload."));
    return res.redirect("/results");
  }
});

module.exports = router;
