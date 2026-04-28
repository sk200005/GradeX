const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");
require("dotenv").config();

const { ensureDefaultAdmin } = require("./utils/bootstrap");
const { getDepartmentFromBranch } = require("./utils/branchFilter");
const Subject = require("./models/Subject");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const studentRoutes = require("./routes/students");
const studentProfileRoutes = require("./routes/studentProfiles");
const subjectRoutes = require("./routes/subjects");
const markRoutes = require("./routes/marks");
const attendanceRoutes = require("./routes/attendance");
const resultRoutes = require("./routes/results");
const reportRoutes = require("./routes/reports");
const assessmentTemplateRoutes = require("./routes/assessmentTemplates");
const internalAssessmentRoutes = require("./routes/internalAssessment");
const atRiskRoutes = require("./routes/atRisk");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/student_result_analysis_system";

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("MongoDB connected successfully.");
    await ensureDefaultAdmin();
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "student_result_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 4
    }
  })
);
app.use(flash());

app.use(async (req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.currentUser = req.session.admin || null;
  res.locals.globalBranch = req.session.globalBranch || "";
  req.globalBranch = req.session.globalBranch || "";

  res.locals.globalSubject = req.session.globalSubject || "";
  req.globalSubject = req.session.globalSubject || "";

  let globalSubjects = [];
  if (req.globalBranch) {
    const dept = getDepartmentFromBranch(req.globalBranch);
    if (dept) {
      globalSubjects = await Subject.find({ department: dept }).select('_id subjectName').sort({ subjectName: 1 }).lean();
    }
  } else {
    globalSubjects = await Subject.find().select('_id subjectName').sort({ subjectName: 1 }).lean();
  }
  res.locals.globalSubjects = globalSubjects;

  res.locals.successMessages = req.flash("success");
  res.locals.errorMessages = req.flash("error");
  next();
});

app.post("/set-global-branch", (req, res) => {
  req.session.globalBranch = req.body.branch;
  req.session.globalSubject = ""; // Reset subject when branch changes
  res.json({ success: true });
});

app.post("/set-global-subject", (req, res) => {
  req.session.globalSubject = req.body.subject;
  res.json({ success: true });
});

app.get("/", (req, res) => {
  if (req.session.admin) {
    return res.redirect("/dashboard");
  }

  return res.redirect("/login");
});

app.use("/", authRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/student-profiles", studentProfileRoutes);
app.use("/students", studentRoutes);
app.use("/subjects", subjectRoutes);
app.use("/marks", markRoutes);
app.use("/attendance", attendanceRoutes);
app.use("/results", resultRoutes);
app.use("/reports", reportRoutes);
app.use("/assessment-templates", assessmentTemplateRoutes);
app.use("/internal-assessment", internalAssessmentRoutes);
app.use("/at-risk", atRiskRoutes);

app.use((req, res) => {
  res.status(404).render("error", {
    pageTitle: "Page Not Found",
    message: "The page you are looking for does not exist.",
    details: "Please use the sidebar menu to continue browsing the system."
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).render("error", {
    pageTitle: "Something Went Wrong",
    message: error.message || "An unexpected error occurred.",
    details:
      "Please check your input and try again. If the issue continues, review the server logs."
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
