const express = require("express");

const InternalAssessment = require("../models/InternalAssessment");
const AssessmentTemplate = require("../models/AssessmentTemplate");
const Student = require("../models/Student");
const { getDepartmentFromBranch } = require("../utils/branchFilter");
const Subject = require("../models/Subject");
const Mark = require("../models/Mark");
const { ensureAuthenticated } = require("../middleware/auth");
const { getErrorMessage } = require("../utils/errors");
const upload = require("../middleware/upload");
const { parseUploadedFile } = require("../utils/parseUpload");

const router = express.Router();

// ─── Helper: load subjects & students for forms ──────────────────────────────
async function getFormReferenceData() {
  const [students, subjects] = await Promise.all([
    Student.find().sort({ fullName: 1 }).lean(),
    Subject.find().sort({ subjectName: 1 }).lean()
  ]);
  return { students, subjects };
}

// ─── GET / — list with optional filters ─────────────────────────────────────
router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const { subjectId, semester } = req.query;
    const filter = {};
    if (subjectId) filter.subject = subjectId;
    if (semester) filter.semester = Number(semester);

    const [assessments, subjects] = await Promise.all([
      InternalAssessment.find(filter)
        .populate("student", "fullName rollNumber")
        .populate("subject", "subjectCode subjectName")
        .populate("template", "name components outOf")
        .sort({ createdAt: -1 })
        .lean(),
      Subject.find().sort({ subjectName: 1 }).lean()
    ]);

    res.render("internal-assessment/index", {
      pageTitle: "Internal Assessment",
      assessments,
      subjects,
      filterSubjectId: subjectId || "",
      filterSemester: semester || ""
    });
  } catch (error) {
    next(error);
  }
});

// ─── GET /bulk-upload — CSV upload page (BEFORE /:id) ───────────────────────
router.get("/bulk-upload", ensureAuthenticated, async (req, res, next) => {
  try {
    res.render("internal-assessment/bulk-upload", {
      pageTitle: "Bulk Upload Internal Assessments"
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST /bulk-upload — parse CSV & bulk create ─────────────────────────────
router.post(
  "/bulk-upload",
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

    // Pre-load lookup maps
    const [allStudents, allSubjects, allTemplates] = await Promise.all([
      Student.find().lean(),
      Subject.find().lean(),
      AssessmentTemplate.find().lean()
    ]);

    const studentMap = new Map(allStudents.map((s) => [s.rollNumber.toLowerCase(), s]));
    const subjectMap = new Map(allSubjects.map((s) => [s.subjectCode.toLowerCase(), s]));
    // template lookup by subjectId string
    const templateBySubject = new Map(allTemplates.map((t) => [String(t.subject), t]));

    const rowErrors = [];
    let successCount = 0;

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 1;

      const requiredBase = ["rollNumber", "subjectCode", "semester"];
      const missingBase = requiredBase.filter((f) => !row[f] && row[f] !== 0);
      if (missingBase.length) {
        rowErrors.push({
          row: rowNum,
          identifier: row.rollNumber || `Row ${rowNum}`,
          message: `Missing required columns: ${missingBase.join(", ")}`
        });
        continue;
      }

      const student = studentMap.get(String(row.rollNumber).toLowerCase());
      if (!student) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `Student with roll number "${row.rollNumber}" not found.` });
        continue;
      }

      const subject = subjectMap.get(String(row.subjectCode).toLowerCase());
      if (!subject) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `Subject with code "${row.subjectCode}" not found.` });
        continue;
      }

      const template = templateBySubject.get(String(subject._id));
      if (!template) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: `No assessment template found for subject "${row.subjectCode}".` });
        continue;
      }

      // Build componentMarks from template components
      const componentMarks = [];
      let componentError = null;

      for (const comp of template.components) {
        const colVal = row[comp.name];
        if (colVal === undefined || colVal === "") {
          componentError = `Missing column "${comp.name}" for component marks.`;
          break;
        }
        const marks = Number(colVal);
        if (isNaN(marks) || marks < 0 || marks > comp.maxMarks) {
          componentError = `Invalid marks for "${comp.name}": must be 0–${comp.maxMarks}.`;
          break;
        }
        componentMarks.push({ componentName: comp.name, marksObtained: marks });
      }

      if (componentError) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: componentError });
        continue;
      }

      try {
        // Use findOneAndUpdate to handle duplicates gracefully (upsert = update existing)
        const existing = await InternalAssessment.findOne({
          student: student._id,
          subject: subject._id,
          semester: Number(row.semester)
        });

        if (existing) {
          existing.componentMarks = componentMarks;
          existing.template = template._id;
          existing.pushedToMarks = false;
          await existing.save();
        } else {
          const doc = new InternalAssessment({
            student: student._id,
            subject: subject._id,
            template: template._id,
            semester: Number(row.semester),
            componentMarks
          });
          await doc.save();
        }
        successCount++;
      } catch (dbErr) {
        rowErrors.push({ row: rowNum, identifier: row.rollNumber, message: dbErr.message });
      }
    }

    return res.json({
      success: true,
      successCount,
      errorCount: rowErrors.length,
      errors: rowErrors
    });
  }
);

// ─── POST /push-all — push all unpushed for current filter ──────────────────
router.post("/push-all", ensureAuthenticated, async (req, res) => {
  try {
    const { subjectId, semester } = req.body;
    const filter = { pushedToMarks: false };
    if (subjectId) filter.subject = subjectId;
    if (semester) filter.semester = Number(semester);

    const unpushed = await InternalAssessment.find(filter)
      .populate("student", "fullName rollNumber department")
      .populate("subject", "subjectCode subjectName")
      .lean();

    let pushed = 0;
    const errors = [];

    for (const ia of unpushed) {
      try {
        await pushToMarks(ia);
        await InternalAssessment.findByIdAndUpdate(ia._id, { pushedToMarks: true });
        pushed++;
      } catch (err) {
        errors.push(`${ia.student.rollNumber}: ${err.message}`);
      }
    }

    if (errors.length) {
      req.flash("error", `Pushed ${pushed} records. ${errors.length} failed: ${errors.slice(0, 3).join("; ")}`);
    } else {
      req.flash("success", `Successfully pushed ${pushed} internal assessment records to Marks.`);
    }

    const qs = [];
    if (subjectId) qs.push(`subjectId=${subjectId}`);
    if (semester) qs.push(`semester=${semester}`);
    return res.redirect(`/internal-assessment${qs.length ? "?" + qs.join("&") : ""}`);
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to push all records."));
    return res.redirect("/internal-assessment");
  }
});

// ─── GET /new — create form ──────────────────────────────────────────────────
router.get("/new", ensureAuthenticated, async (req, res, next) => {
  try {
    const { students, subjects } = await getFormReferenceData();

    res.render("internal-assessment/form", {
      pageTitle: "New Internal Assessment",
      assessment: {},
      students,
      subjects,
      template: null,
      formAction: "/internal-assessment",
      formMethod: "POST"
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST / — create ─────────────────────────────────────────────────────────
router.post("/", ensureAuthenticated, async (req, res) => {
  try {
    const { student, subject, template, semester, componentNames, componentMarks: marksArr } = req.body;

    const names = [].concat(componentNames || []);
    const marks = [].concat(marksArr || []);

    const componentMarks = names.map((n, i) => ({
      componentName: n,
      marksObtained: Number(marks[i] || 0)
    }));

    const doc = new InternalAssessment({
      student,
      subject,
      template,
      semester: Number(semester),
      componentMarks
    });
    await doc.save();

    req.flash("success", "Internal assessment created and calculated successfully.");
    return res.redirect("/internal-assessment");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to create internal assessment."));
    return res.redirect("/internal-assessment/new");
  }
});

// ─── GET /:id/edit — edit form ───────────────────────────────────────────────
router.get("/:id/edit", ensureAuthenticated, async (req, res, next) => {
  try {
    const [assessment, { students, subjects }] = await Promise.all([
      InternalAssessment.findById(req.params.id)
        .populate("template")
        .lean(),
      getFormReferenceData()
    ]);

    if (!assessment) {
      req.flash("error", "Internal assessment not found.");
      return res.redirect("/internal-assessment");
    }

    res.render("internal-assessment/form", {
      pageTitle: "Edit Internal Assessment",
      assessment,
      students,
      subjects,
      template: assessment.template,
      formAction: `/internal-assessment/${assessment._id}?_method=PUT`,
      formMethod: "POST"
    });
  } catch (error) {
    next(error);
  }
});

// ─── PUT /:id — update & recalculate ────────────────────────────────────────
router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const ia = await InternalAssessment.findById(req.params.id);

    if (!ia) {
      req.flash("error", "Internal assessment not found.");
      return res.redirect("/internal-assessment");
    }

    const { componentNames, componentMarks: marksArr } = req.body;

    const names = [].concat(componentNames || []);
    const marks = [].concat(marksArr || []);

    ia.componentMarks = names.map((n, i) => ({
      componentName: n,
      marksObtained: Number(marks[i] || 0)
    }));
    ia.pushedToMarks = false; // reset push status on re-calculation
    await ia.save(); // triggers pre-save hook

    req.flash("success", "Internal assessment updated and recalculated.");
    return res.redirect("/internal-assessment");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to update internal assessment."));
    return res.redirect(`/internal-assessment/${req.params.id}/edit`);
  }
});

// ─── POST /:id/push — push single record to Marks ───────────────────────────
router.post("/:id/push", ensureAuthenticated, async (req, res) => {
  try {
    const ia = await InternalAssessment.findById(req.params.id)
      .populate("student", "fullName rollNumber department semester")
      .populate("subject", "subjectCode subjectName");

    if (!ia) {
      req.flash("error", "Internal assessment not found.");
      return res.redirect("/internal-assessment");
    }

    await pushToMarks(ia.toObject ? ia.toObject() : ia);
    ia.pushedToMarks = true;
    // Use updateOne to skip pre-save recalculation
    await InternalAssessment.updateOne({ _id: ia._id }, { pushedToMarks: true });

    req.flash("success", `Internal marks pushed to Marks record for ${ia.student.fullName}.`);
    return res.redirect("/internal-assessment");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to push internal marks."));
    return res.redirect("/internal-assessment");
  }
});

// ─── Helper: write calculatedInternal into Marks ────────────────────────────
async function pushToMarks(ia) {
  const student = ia.student;
  const subject = ia.subject;

  // Try to find existing Mark doc
  const existingMark = await Mark.findOne({
    student: student._id,
    subject: subject._id
  });

  if (existingMark) {
    // Update internalMarks; pre-validate hook recalculates total/grade/resultStatus
    existingMark.internalMarks = ia.calculatedInternal;
    await existingMark.save();
  } else {
    // Create a new Mark with a placeholder externalMarks of 0
    // so the unique index and required fields are satisfied
    await Mark.create({
      student: student._id,
      rollNumber: student.rollNumber,
      studentName: student.fullName,
      subject: subject._id,
      subjectName: subject.subjectName,
      internalMarks: ia.calculatedInternal,
      externalMarks: 0,
      semester: ia.semester || student.semester,
      department: student.department
    });
  }
}

module.exports = router;
