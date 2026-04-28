const mongoose = require("mongoose");

const componentMarkSchema = new mongoose.Schema(
  {
    componentName: {
      type: String,
      required: true,
      trim: true
    },
    marksObtained: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const internalAssessmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssessmentTemplate",
      required: true
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8
    },
    componentMarks: {
      type: [componentMarkSchema],
      default: []
    },
    calculatedInternal: {
      type: Number,
      default: 0
    },
    pushedToMarks: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    collection: "internal_assessments"
  }
);

// Compound index: one assessment per student per subject per semester
internalAssessmentSchema.index(
  { student: 1, subject: 1, semester: 1 },
  { unique: true }
);

/**
 * Pre-save hook: populate template, compute calculatedInternal from componentMarks,
 * then depopulate before writing to DB.
 */
internalAssessmentSchema.pre("save", async function calculateInternal() {
  // Populate template if not already populated
  if (!this.template || typeof this.template === "object" && this.template.components) {
    // already populated — do nothing extra
  } else {
    await this.populate("template");
  }

  const template = this.template;

  if (!template || !template.components || template.components.length === 0) {
    this.calculatedInternal = 0;
    return;
  }

  let total = 0;

  for (const cm of this.componentMarks) {
    const component = template.components.find(
      (c) => c.name.trim().toLowerCase() === cm.componentName.trim().toLowerCase()
    );
    if (!component || component.maxMarks === 0) continue;

    const contribution =
      (cm.marksObtained / component.maxMarks) *
      (component.weightage / 100) *
      template.outOf;

    total += contribution;
  }

  this.calculatedInternal = Math.round(total);

  // Depopulate so only the ObjectId is stored
  this.depopulate("template");
});

module.exports = mongoose.model("InternalAssessment", internalAssessmentSchema);
