const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    department: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true,
    collection: "courses"
  }
);

module.exports = mongoose.model("Course", courseSchema);
