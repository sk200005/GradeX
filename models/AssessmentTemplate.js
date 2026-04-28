const mongoose = require("mongoose");

const componentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    maxMarks: {
      type: Number,
      required: true,
      min: 1
    },
    weightage: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    }
  },
  { _id: false }
);

const assessmentTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },
    // course is stored as String on Subject/Student models, so match that here
    course: {
      type: String,
      required: true,
      trim: true
    },
    components: {
      type: [componentSchema],
      validate: {
        validator: function (arr) {
          return arr && arr.length > 0;
        },
        message: "At least one component is required."
      }
    },
    outOf: {
      type: Number,
      required: true,
      min: 1
    }
  },
  {
    timestamps: true,
    collection: "assessment_templates"
  }
);

// Pre-validate: sum of all component weightages must equal 100
assessmentTemplateSchema.pre("validate", function checkWeightageSum(next) {
  if (!this.components || this.components.length === 0) {
    return next();
  }
  const total = this.components.reduce((sum, c) => sum + (c.weightage || 0), 0);
  if (Math.abs(total - 100) > 0.01) {
    return next(
      new Error(
        `Component weightages must sum to 100%. Current sum: ${total.toFixed(2)}%.`
      )
    );
  }
  return next();
});

module.exports = mongoose.model("AssessmentTemplate", assessmentTemplateSchema);
