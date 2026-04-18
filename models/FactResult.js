const mongoose = require("mongoose");

const factResultSchema = new mongoose.Schema(
  {
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    subject_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    semester: {
      type: Number,
      required: true
    },
    department: {
      type: String,
      required: true,
      trim: true
    },
    marks: {
      type: Number,
      required: true
    },
    attendance: {
      type: Number,
      required: true
    },
    pass_fail: {
      type: String,
      enum: ["Pass", "Fail"],
      required: true
    }
  },
  {
    timestamps: true,
    collection: "fact_results"
  }
);

module.exports = mongoose.model("FactResult", factResultSchema);
