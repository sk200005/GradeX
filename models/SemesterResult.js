const mongoose = require("mongoose");

const semesterResultSchema = new mongoose.Schema(
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
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8
    },
    sgpa: {
      type: Number,
      required: true,
      min: 0,
      max: 10
    },
    cgpa: {
      type: Number,
      required: true,
      min: 0,
      max: 10
    },
    resultStatus: {
      type: String,
      required: true,
      enum: ["Pass", "Fail"]
    },
    department: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true,
    collection: "semesterresults"
  }
);

semesterResultSchema.index({ student: 1, semester: 1 }, { unique: true });

module.exports = mongoose.model("SemesterResult", semesterResultSchema);
