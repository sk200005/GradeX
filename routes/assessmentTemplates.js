const express = require("express");

const AssessmentTemplate = require("../models/AssessmentTemplate");
const { getDepartmentFromBranch } = require("../utils/branchFilter");
const InternalAssessment = require("../models/InternalAssessment");
const Subject = require("../models/Subject");
const { ensureAuthenticated } = require("../middleware/auth");
const { getErrorMessage } = require("../utils/errors");

const router = express.Router();

// ─── GET / — list all templates (also acts as JSON API when ?subjectId= is sent) ──
router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const { subjectId } = req.query;

    // JSON API mode: called from internal-assessment form via fetch
    if (subjectId) {
      const template = await AssessmentTemplate.findOne({ subject: subjectId }).lean();
      return res.json({ template: template || null });
    }

    const templates = await AssessmentTemplate.find()
      .populate("subject", "subjectCode subjectName")
      .sort({ createdAt: -1 })
      .lean();

    res.render("assessment-templates/index", {
      pageTitle: "Assessment Templates",
      templates
    });
  } catch (error) {
    next(error);
  }
});

// ─── GET /new — create form ─────────────────────────────────────────────────
router.get("/new", ensureAuthenticated, async (req, res, next) => {
  try {
    const subjects = await Subject.find().sort({ subjectName: 1 }).lean();

    res.render("assessment-templates/form", {
      pageTitle: "New Assessment Template",
      template: {},
      subjects,
      formAction: "/assessment-templates",
      formMethod: "POST"
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST / — create ────────────────────────────────────────────────────────
router.post("/", ensureAuthenticated, async (req, res) => {
  try {
    const { name, subject, course, outOf, componentNames, componentMaxMarks, componentWeightages } = req.body;

    // Build components array from parallel arrays in form
    const names = [].concat(componentNames || []);
    const maxMarks = [].concat(componentMaxMarks || []);
    const weightages = [].concat(componentWeightages || []);

    const components = names.map((n, i) => ({
      name: n,
      maxMarks: Number(maxMarks[i] || 0),
      weightage: Number(weightages[i] || 0)
    }));

    await AssessmentTemplate.create({ name, subject, course, outOf: Number(outOf), components });

    req.flash("success", "Assessment template created successfully.");
    return res.redirect("/assessment-templates");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to create assessment template."));
    return res.redirect("/assessment-templates/new");
  }
});

// ─── GET /:id/edit — edit form ───────────────────────────────────────────────
router.get("/:id/edit", ensureAuthenticated, async (req, res, next) => {
  try {
    const [template, subjects] = await Promise.all([
      AssessmentTemplate.findById(req.params.id).lean(),
      Subject.find().sort({ subjectName: 1 }).lean()
    ]);

    if (!template) {
      req.flash("error", "Assessment template not found.");
      return res.redirect("/assessment-templates");
    }

    res.render("assessment-templates/form", {
      pageTitle: "Edit Assessment Template",
      template,
      subjects,
      formAction: `/assessment-templates/${template._id}?_method=PUT`,
      formMethod: "POST"
    });
  } catch (error) {
    next(error);
  }
});

// ─── PUT /:id — update ───────────────────────────────────────────────────────
router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const template = await AssessmentTemplate.findById(req.params.id);

    if (!template) {
      req.flash("error", "Assessment template not found.");
      return res.redirect("/assessment-templates");
    }

    const { name, subject, course, outOf, componentNames, componentMaxMarks, componentWeightages } = req.body;

    const names = [].concat(componentNames || []);
    const maxMarks = [].concat(componentMaxMarks || []);
    const weightages = [].concat(componentWeightages || []);

    template.name = name;
    template.subject = subject;
    template.course = course;
    template.outOf = Number(outOf);
    template.components = names.map((n, i) => ({
      name: n,
      maxMarks: Number(maxMarks[i] || 0),
      weightage: Number(weightages[i] || 0)
    }));

    await template.save();

    req.flash("success", "Assessment template updated successfully.");
    return res.redirect("/assessment-templates");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to update assessment template."));
    return res.redirect(`/assessment-templates/${req.params.id}/edit`);
  }
});

// ─── DELETE /:id — delete (blocked if in use) ───────────────────────────────
router.delete("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const inUse = await InternalAssessment.exists({ template: req.params.id });

    if (inUse) {
      req.flash(
        "error",
        "Cannot delete this template — it is used by one or more internal assessments."
      );
      return res.redirect("/assessment-templates");
    }

    await AssessmentTemplate.findByIdAndDelete(req.params.id);
    req.flash("success", "Assessment template deleted.");
    return res.redirect("/assessment-templates");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to delete assessment template."));
    return res.redirect("/assessment-templates");
  }
});

module.exports = router;
