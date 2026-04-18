const mongoose = require("mongoose");

const citySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true,
    collection: "cities"
  }
);

module.exports = mongoose.model("City", citySchema);
