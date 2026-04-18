const mongoose = require("mongoose");
const { calculateAttendancePercentage } = require("../utils/calculations");

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true
    },
    studentName: {
      type: String,
      required: true,
      trim: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },
    subjectName: {
      type: String,
      required: true,
      trim: true
    },
    totalClasses: {
      type: Number,
      required: true,
      min: 1
    },
    presentClasses: {
      type: Number,
      required: true,
      min: 0
    },
    attendancePercentage: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  {
    timestamps: true,
    collection: "attendance"
  }
);

attendanceSchema.pre("validate", function updateAttendancePercentage(next) {
  if (this.presentClasses > this.totalClasses) {
    return next(
      new Error("Present classes cannot be greater than total classes.")
    );
  }

  this.attendancePercentage = calculateAttendancePercentage(
    this.totalClasses,
    this.presentClasses
  );

  return next();
});

attendanceSchema.index({ student: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
