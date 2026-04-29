const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Mark = require("../models/Mark");
const Attendance = require("../models/Attendance");
const { calculateMarkSummary, calculateAttendancePercentage } = require("./calculations");

/**
 * Process a unified CSV upload and upsert both Attendance and Marks.
 *
 * Expected CSV columns (case-insensitive, trimmed):
 *   Roll No, Student Name, Subject, Total Classes, Present, Internal, External
 *
 * The function normalises header names so the CSV the teacher fills out
 * (with space-separated, human-readable headers) maps correctly.
 *
 * @param {Object[]} rows - Parsed rows from parseUploadedFile.
 * @returns {Promise<{success:boolean, successCount:number, errorCount:number, errors:Array}>}
 */
async function processUnifiedUpload(rows) {
  if (!rows.length) {
    return { success: true, successCount: 0, errorCount: 0, errors: [] };
  }

  // Build a header-key mapping so we accept both camelCase and human-readable headers
  const normalisedRows = rows.map(normaliseRowKeys);

  // Pre-load reference data
  const [allStudents, allSubjects] = await Promise.all([
    Student.find().lean(),
    Subject.find().lean()
  ]);

  const studentByRoll = new Map(allStudents.map((s) => [s.rollNumber.toLowerCase(), s]));
  const subjectByName = new Map(allSubjects.map((s) => [s.subjectName.toLowerCase(), s]));
  const subjectByCode = new Map(allSubjects.map((s) => [s.subjectCode.toLowerCase(), s]));

  const attendanceDocs = [];
  const markDocs = [];
  const rowErrors = [];

  for (let idx = 0; idx < normalisedRows.length; idx++) {
    const row = normalisedRows[idx];
    const rowNum = idx + 1;

    // --- Validate required fields ---
    const required = ["rollNo", "subject", "totalClasses", "present", "internal", "external"];
    const missing = required.filter((f) => row[f] === undefined || row[f] === "");
    if (missing.length) {
      rowErrors.push({
        row: rowNum,
        identifier: row.rollNo || `Row ${rowNum}`,
        message: `Missing required columns: ${missing.join(", ")}`
      });
      continue;
    }

    // --- Resolve student ---
    const student = studentByRoll.get(String(row.rollNo).toLowerCase());
    if (!student) {
      rowErrors.push({
        row: rowNum,
        identifier: row.rollNo,
        message: `Student with roll number "${row.rollNo}" not found.`
      });
      continue;
    }

    // --- Resolve subject (try name first, then code) ---
    let subject = subjectByName.get(String(row.subject).toLowerCase());
    if (!subject) {
      subject = subjectByCode.get(String(row.subject).toLowerCase());
    }
    if (!subject) {
      rowErrors.push({
        row: rowNum,
        identifier: row.rollNo,
        message: `Subject "${row.subject}" not found.`
      });
      continue;
    }

    // --- Validate numbers ---
    const totalClasses = Number(row.totalClasses);
    const present = Number(row.present);
    const internal = Number(row.internal);
    const external = Number(row.external);

    if (isNaN(totalClasses) || totalClasses < 1) {
      rowErrors.push({ row: rowNum, identifier: row.rollNo, message: "Total Classes must be a positive number." });
      continue;
    }
    if (isNaN(present) || present < 0) {
      rowErrors.push({ row: rowNum, identifier: row.rollNo, message: "Present must be 0 or greater." });
      continue;
    }
    if (present > totalClasses) {
      rowErrors.push({ row: rowNum, identifier: row.rollNo, message: "Present cannot be greater than Total Classes." });
      continue;
    }
    if (isNaN(internal) || internal < 0 || internal > 100) {
      rowErrors.push({ row: rowNum, identifier: row.rollNo, message: "Internal must be between 0 and 100." });
      continue;
    }
    if (isNaN(external) || external < 0 || external > 100) {
      rowErrors.push({ row: rowNum, identifier: row.rollNo, message: "External must be between 0 and 100." });
      continue;
    }

    // --- Compute derived values ---
    const attendancePercentage = calculateAttendancePercentage(totalClasses, present);
    const { totalMarks, grade, resultStatus } = calculateMarkSummary(internal, external);

    // --- Build attendance doc ---
    attendanceDocs.push({
      student: student._id,
      rollNumber: student.rollNumber,
      studentName: student.fullName,
      subject: subject._id,
      subjectName: subject.subjectName,
      totalClasses,
      presentClasses: present,
      attendancePercentage
    });

    // --- Build marks doc ---
    markDocs.push({
      student: student._id,
      rollNumber: student.rollNumber,
      studentName: student.fullName,
      subject: subject._id,
      subjectName: subject.subjectName,
      internalMarks: internal,
      externalMarks: external,
      totalMarks,
      grade,
      resultStatus,
      semester: student.semester,
      department: student.department
    });
  }

  // --- Upsert into both collections ---
  let attendanceSuccess = 0;
  let marksSuccess = 0;
  const dbErrors = [];

  // Process each row individually with upsert to handle both insert & update
  for (let i = 0; i < attendanceDocs.length; i++) {
    const attDoc = attendanceDocs[i];
    const mrkDoc = markDocs[i];

    try {
      await Attendance.findOneAndUpdate(
        { student: attDoc.student, subject: attDoc.subject },
        { $set: attDoc },
        { upsert: true, new: true, runValidators: true }
      );
      attendanceSuccess++;
    } catch (err) {
      dbErrors.push({
        row: i + 1,
        identifier: attDoc.rollNumber,
        message: `Attendance error: ${err.message}`
      });
    }

    try {
      await Mark.findOneAndUpdate(
        { student: mrkDoc.student, subject: mrkDoc.subject },
        { $set: mrkDoc },
        { upsert: true, new: true, runValidators: true }
      );
      marksSuccess++;
    } catch (err) {
      dbErrors.push({
        row: i + 1,
        identifier: mrkDoc.rollNumber,
        message: `Marks error: ${err.message}`
      });
    }
  }

  const successCount = Math.min(attendanceSuccess, marksSuccess);
  const allErrors = [...rowErrors, ...dbErrors];

  return {
    success: true,
    successCount,
    attendanceCount: attendanceSuccess,
    marksCount: marksSuccess,
    errorCount: allErrors.length,
    errors: allErrors
  };
}

/**
 * Normalise row keys from human-readable CSV headers to internal keys.
 *
 * Accepts variations like:
 *   "Roll No" / "rollNo" / "rollNumber" / "roll_no"
 *   "Student Name" / "studentName" / "student_name"
 *   "Subject" / "subjectName" / "subject_name" / "subjectCode"
 *   "Total Classes" / "totalClasses" / "total_classes"
 *   "Present" / "presentClasses" / "present_classes"
 *   "Internal" / "internalMarks" / "internal_marks"
 *   "External" / "externalMarks" / "external_marks"
 */
function normaliseRowKeys(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const k = key.toLowerCase().replace(/[_\s]+/g, "");
    if (["rollno", "rollnumber"].includes(k)) {
      out.rollNo = value;
    } else if (["studentname", "student"].includes(k)) {
      out.studentName = value;
    } else if (["subject", "subjectname", "subjectcode"].includes(k)) {
      out.subject = value;
    } else if (["totalclasses"].includes(k)) {
      out.totalClasses = value;
    } else if (["present", "presentclasses"].includes(k)) {
      out.present = value;
    } else if (["internal", "internalmarks"].includes(k)) {
      out.internal = value;
    } else if (["external", "externalmarks"].includes(k)) {
      out.external = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

module.exports = { processUnifiedUpload };
