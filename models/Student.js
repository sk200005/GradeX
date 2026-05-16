const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    rollNumber: {
      
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: true
    },
    department: {
      type: String,
      required: true,
      trim: true
    },
    course: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
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
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address."]
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d+$/, "Phone must contain only numeric characters."]
    }
  },
  {
    timestamps: true,
    collection: "students"
  }
);

module.exports = mongoose.model("Student", studentSchema);
