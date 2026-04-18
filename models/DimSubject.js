const mongoose = require("mongoose");

const dimSubjectSchema = new mongoose.Schema(
  {
    subject_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true
    },
    subjectCode: {
      type: String,
      required: true
    },
    subjectName: {
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
    collection: "dim_subjects"
  }
);

module.exports = mongoose.model("DimSubject", dimSubjectSchema);
