const mongoose = require("mongoose");

const dimDepartmentSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: true,
      unique: true
    },
    code: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true,
    collection: "dim_departments"
  }
);

module.exports = mongoose.model("DimDepartment", dimDepartmentSchema);
