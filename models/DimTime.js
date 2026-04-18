const mongoose = require("mongoose");

const dimTimeSchema = new mongoose.Schema(
  {
    semester: {
      type: Number,
      required: true,
      unique: true
    },
    academicYear: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true,
    collection: "dim_time"
  }
);

module.exports = mongoose.model("DimTime", dimTimeSchema);
