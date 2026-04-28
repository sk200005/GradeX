const mongoose = require("mongoose");

const alertSettingsSchema = new mongoose.Schema(
  {
    attendanceThreshold: {
      type: Number,
      default: 75,
      min: 0,
      max: 100
    },
    internalMarksThreshold: {
      type: Number,
      default: 40,
      min: 0,
      max: 100
    },
    externalMarksThreshold: {
      type: Number,
      default: 40,
      min: 0,
      max: 100
    }
  },
  {
    timestamps: true,
    collection: "alert_settings"
  }
);

/**
 * Singleton accessor — always returns the single settings document,
 * creating it with defaults if it doesn't yet exist.
 */
alertSettingsSchema.statics.getSingleton = async function () {
  return this.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model("AlertSettings", alertSettingsSchema);
