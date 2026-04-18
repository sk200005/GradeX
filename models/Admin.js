const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true,
    collection: "admins"
  }
);

module.exports = mongoose.model("Admin", adminSchema);
