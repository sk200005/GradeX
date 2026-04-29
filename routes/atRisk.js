const express = require("express");

const AlertSettings = require("../models/AlertSettings");
const Attendance = require("../models/Attendance");
const Mark = require("../models/Mark");
const Student = require("../models/Student");
const { getDepartmentFromBranch } = require("../utils/branchFilter");
const { ensureAuthenticated } = require("../middleware/auth");
const { getErrorMessage } = require("../utils/errors");

const router = express.Router();

// ─── Core query: build the at-risk student list ──────────────────────────────
async function buildAtRiskList(settings, branch) {
  const {
    attendanceThreshold,
    internalMarksThreshold,
    externalMarksThreshold
  } = settings;

  // 1. Find all attendance docs below threshold, grouped by student id
  const lowAttendance = await Attendance.find({
    attendancePercentage: { $lt: attendanceThreshold }
  }).lean();

  // Build map: studentId → [{ subjectName, attendancePercentage }]
  const attendanceMap = new Map();
  for (const doc of lowAttendance) {
    const key = String(doc.student);
    if (!attendanceMap.has(key)) attendanceMap.set(key, []);
    attendanceMap.get(key).push({
      subjectName: doc.subjectName,
      attendancePercentage: doc.attendancePercentage
    });
  }

  // 2. Find all marks docs below either threshold
  const lowMarks = await Mark.find({
    $or: [
      { internalMarks: { $lt: internalMarksThreshold } },
      { externalMarks: { $lt: externalMarksThreshold } }
    ]
  }).lean();

  // Build map: studentId → [{ subjectName, internalMarks, externalMarks, internalLow, externalLow }]
  const marksMap = new Map();
  for (const doc of lowMarks) {
    const key = String(doc.student);
    if (!marksMap.has(key)) marksMap.set(key, []);
    marksMap.get(key).push({
      subjectName: doc.subjectName,
      internalMarks: doc.internalMarks,
      externalMarks: doc.externalMarks,
      internalLow: doc.internalMarks < internalMarksThreshold,
      externalLow: doc.externalMarks < externalMarksThreshold
    });
  }

  // 3. Union of all at-risk student ids
  const atRiskIds = new Set([...attendanceMap.keys(), ...marksMap.keys()]);

  if (atRiskIds.size === 0) return [];

  // 4. Fetch student documents for all at-risk ids
  let studentQuery = { _id: { $in: [...atRiskIds] } };
  const globalDept = getDepartmentFromBranch(branch);
  if (globalDept) {
    studentQuery.department = globalDept;
  }

  const students = await Student.find(studentQuery).lean();

  const studentById = new Map(students.map((s) => [String(s._id), s]));

  // 5. Build risk profiles
  const profiles = [];

  for (const studentId of atRiskIds) {
    const student = studentById.get(studentId);
    if (!student) continue;

    const hasAttendanceRisk = attendanceMap.has(studentId);
    const hasMarksRisk = marksMap.has(studentId);
    const riskLevel = hasAttendanceRisk && hasMarksRisk ? "critical" : "warning";

    const issues = [];

    // Attendance issues
    if (hasAttendanceRisk) {
      for (const a of attendanceMap.get(studentId)) {
        issues.push(`Low attendance in ${a.subjectName}: ${a.attendancePercentage}%`);
      }
    }

    // Marks issues
    if (hasMarksRisk) {
      for (const m of marksMap.get(studentId)) {
        if (m.internalLow) {
          issues.push(`Low internal marks in ${m.subjectName}: ${m.internalMarks}/${internalMarksThreshold}`);
        }
        if (m.externalLow) {
          issues.push(`Low external marks in ${m.subjectName}: ${m.externalMarks}/${externalMarksThreshold}`);
        }
      }
    }

    // Compute worst attendance % for display
    const attendanceEntries = attendanceMap.get(studentId) || [];
    const worstAttendance = attendanceEntries.length
      ? Math.min(...attendanceEntries.map((a) => a.attendancePercentage))
      : null;

    profiles.push({
      studentId,
      fullName: student.fullName,
      rollNumber: student.rollNumber,
      department: student.department,
      course: student.course,
      semester: student.semester,
      riskLevel,
      worstAttendance,
      issues
    });
  }

  // 6. Sort: critical first, then by name
  profiles.sort((a, b) => {
    if (a.riskLevel === b.riskLevel) return a.fullName.localeCompare(b.fullName);
    return a.riskLevel === "critical" ? -1 : 1;
  });

  return profiles;
}

// ─── GET /at-risk — full page ────────────────────────────────────────────────
router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const settings = await AlertSettings.getSingleton();
    const allProfiles = await buildAtRiskList(settings, req.globalBranch);

    // Derive filter options from data
    const departments = [...new Set(allProfiles.map((p) => p.department))].sort();
    const courses     = [...new Set(allProfiles.map((p) => p.course))].sort();

    // Apply filters from query
    const { department, course, riskLevel } = req.query;
    let profiles = allProfiles;
    if (department) profiles = profiles.filter((p) => p.department === department);
    if (course)     profiles = profiles.filter((p) => p.course === course);
    if (riskLevel)  profiles = profiles.filter((p) => p.riskLevel === riskLevel);

    const critical = allProfiles.filter((p) => p.riskLevel === "critical").length;
    const warning  = allProfiles.filter((p) => p.riskLevel === "warning").length;

    res.render("at-risk/index", {
      pageTitle: "At-Risk Students",
      profiles,
      settings,
      departments,
      courses,
      critical,
      warning,
      filterDepartment: department || "",
      filterCourse: course || "",
      filterRiskLevel: riskLevel || ""
    });
  } catch (error) {
    next(error);
  }
});

// ─── GET /at-risk/data — JSON API for dashboard widget & sidebar badge ────────
router.get("/data", ensureAuthenticated, async (req, res, next) => {
  try {
    const settings = await AlertSettings.getSingleton();
    const profiles = await buildAtRiskList(settings, req.globalBranch);

    const critical = profiles.filter((p) => p.riskLevel === "critical").length;
    const warning  = profiles.filter((p) => p.riskLevel === "warning").length;

    res.json({
      critical,
      warning,
      students: profiles.slice(0, 5)
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST /at-risk/settings — update singleton ───────────────────────────────
router.post("/settings", ensureAuthenticated, async (req, res) => {
  try {
    const { attendanceThreshold, internalMarksThreshold, externalMarksThreshold } = req.body;

    await AlertSettings.findOneAndUpdate(
      {},
      {
        $set: {
          attendanceThreshold: Number(attendanceThreshold),
          internalMarksThreshold: Number(internalMarksThreshold),
          externalMarksThreshold: Number(externalMarksThreshold)
        }
      },
      { upsert: true, new: true }
    );

    req.flash("success", "Alert thresholds updated successfully.");
    return res.redirect("/at-risk");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to update alert settings."));
    return res.redirect("/at-risk");
  }
});

// ─── GET /at-risk/export — CSV download ──────────────────────────────────────
router.get("/export", ensureAuthenticated, async (req, res, next) => {
  try {
    const settings = await AlertSettings.getSingleton();
    let profiles = await buildAtRiskList(settings, req.globalBranch);

    const { department, course, riskLevel } = req.query;
    if (department) profiles = profiles.filter((p) => p.department === department);
    if (course)     profiles = profiles.filter((p) => p.course === course);
    if (riskLevel)  profiles = profiles.filter((p) => p.riskLevel === riskLevel);

    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const header = ["Name", "Roll Number", "Department", "Course", "Semester", "Worst Attendance %", "Risk Level", "Issues"];
    const rows = profiles.map((p) => [
      escape(p.fullName),
      escape(p.rollNumber),
      escape(p.department),
      escape(p.course),
      escape(p.semester),
      escape(p.worstAttendance ?? "N/A"),
      escape(p.riskLevel),
      escape(p.issues.join("; "))
    ]);

    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"at-risk-students.csv\"");
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
