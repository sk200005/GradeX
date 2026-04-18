const mongoose = require("mongoose");
const { calculateMarkSummary } = require("../utils/calculations");

const markSchema = new mongoose.Schema(
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
    internalMarks: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    externalMarks: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    totalMarks: {
      type: Number,
      min: 0,
      max: 100
    },
    grade: {
      type: String
    },
    resultStatus: {
      type: String,
      enum: ["Pass", "Fail"]
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8
    },
    department: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true,
    collection: "marks"
  }
);

markSchema.pre("validate", function updateComputedMarkFields(next) {
  const summary = calculateMarkSummary(this.internalMarks, this.externalMarks);
  this.totalMarks = summary.totalMarks;
  this.grade = summary.grade;
  this.resultStatus = summary.resultStatus;
  next();
});

markSchema.index({ student: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model("Mark", markSchema);
