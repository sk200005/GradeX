const mongoose = require("mongoose");

const dimStudentSchema = new mongoose.Schema(
  {
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true
    },
    rollNumber: {
      type: String,
      required: true
    },
    fullName: {
      type: String,
      required: true
    },
    gender: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    department: {
      type: String,
      required: true
    },
    course: {
      type: String,
      required: true
    },
    semester: {
      type: Number,
      required: true
    }
  },
  {
    timestamps: true,
    collection: "dim_students"
  }
);

module.exports = mongoose.model("DimStudent", dimStudentSchema);
