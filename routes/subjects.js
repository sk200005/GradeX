const express = require("express");

const Subject = require("../models/Subject");
const Mark = require("../models/Mark");
const Attendance = require("../models/Attendance");
const { ensureAuthenticated } = require("../middleware/auth");
const { getAcademicReferenceData } = require("../utils/referenceData");
const { getErrorMessage } = require("../utils/errors");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = 8;
    const search = (req.query.search || "").trim();
    const query = search
      ? {
          $or: [
            { subjectCode: { $regex: search, $options: "i" } },
            { subjectName: { $regex: search, $options: "i" } },
            { department: { $regex: search, $options: "i" } },
            { course: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const [subjects, totalSubjects] = await Promise.all([
      Subject.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Subject.countDocuments(query)
    ]);

    res.render("subjects/index", {
      pageTitle: "Subjects",
      subjects,
      search,
      pagination: {
        page,
        limit,
        totalPages: Math.max(Math.ceil(totalSubjects / limit), 1),
        totalItems: totalSubjects
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/new", ensureAuthenticated, async (req, res, next) => {
  try {
    const referenceData = await getAcademicReferenceData();

    res.render("subjects/form", {
      pageTitle: "Add Subject",
      subject: {},
      formAction: "/subjects",
      formMethod: "POST",
      ...referenceData
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", ensureAuthenticated, async (req, res) => {
  try {
    await Subject.create(req.body);
    req.flash("success", "Subject added successfully.");
    res.redirect("/subjects");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to add subject."));
    res.redirect("/subjects/new");
  }
});

router.get("/:id/edit", ensureAuthenticated, async (req, res, next) => {
  try {
    const [subject, referenceData] = await Promise.all([
      Subject.findById(req.params.id).lean(),
      getAcademicReferenceData()
    ]);

    if (!subject) {
      req.flash("error", "Subject not found.");
      return res.redirect("/subjects");
    }

    return res.render("subjects/form", {
      pageTitle: "Edit Subject",
      subject,
      formAction: `/subjects/${subject._id}?_method=PUT`,
      formMethod: "POST",
      ...referenceData
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!subject) {
      req.flash("error", "Subject not found.");
      return res.redirect("/subjects");
    }

    await Promise.all([
      Mark.updateMany(
        { subject: subject._id },
        {
          subjectName: subject.subjectName,
          semester: subject.semester,
          department: subject.department
        }
      ),
      Attendance.updateMany(
        { subject: subject._id },
        {
          subjectName: subject.subjectName
        }
      )
    ]);

    req.flash("success", "Subject updated successfully.");
    return res.redirect("/subjects");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to update subject."));
    return res.redirect(`/subjects/${req.params.id}/edit`);
  }
});

router.delete("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);

    if (!subject) {
      req.flash("error", "Subject not found.");
      return res.redirect("/subjects");
    }

    await Promise.all([
      Mark.deleteMany({ subject: subject._id }),
      Attendance.deleteMany({ subject: subject._id })
    ]);

    req.flash("success", "Subject deleted successfully.");
    return res.redirect("/subjects");
  } catch (error) {
    req.flash("error", getErrorMessage(error, "Unable to delete subject."));
    return res.redirect("/subjects");
  }
});

module.exports = router;
