const express = require("express");
const PDFDocument = require("pdfkit");

const FactResult = require("../models/FactResult");
const DimStudent = require("../models/DimStudent");
const DimSubject = require("../models/DimSubject");
const DimTime = require("../models/DimTime");
const DimDepartment = require("../models/DimDepartment");
const { ensureAuthenticated } = require("../middleware/auth");
const { getReportsData } = require("../utils/analytics");
const { syncWarehouseCollections } = require("../utils/warehouse");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const [reports, warehouseStats] = await Promise.all([
      getReportsData(),
      Promise.all([
        FactResult.countDocuments(),
        DimStudent.countDocuments(),
        DimSubject.countDocuments(),
        DimTime.countDocuments(),
        DimDepartment.countDocuments()
      ])
    ]);

    res.render("reports/index", {
      pageTitle: "Reports",
      reports,
      warehouseSummary: {
        factResults: warehouseStats[0],
        dimStudents: warehouseStats[1],
        dimSubjects: warehouseStats[2],
        dimTime: warehouseStats[3],
        dimDepartments: warehouseStats[4]
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/sync-warehouse", ensureAuthenticated, async (req, res) => {
  try {
    const summary = await syncWarehouseCollections();
    req.flash(
      "success",
      `Warehouse synced successfully. Fact rows: ${summary.factRows}, Student dimensions: ${summary.studentDimensions}.`
    );
    return res.redirect("/reports");
  } catch (error) {
    req.flash("error", error.message || "Unable to sync warehouse.");
    return res.redirect("/reports");
  }
});

router.get("/top-students/pdf", ensureAuthenticated, async (req, res, next) => {
  try {
    const reports = await getReportsData();
    const document = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="top-students-report.pdf"'
    );

    document.pipe(res);
    document.fontSize(20).text("Top 10 Students Report", { underline: true });
    document.moveDown();
    document.fontSize(12).text("Student Result Analysis System");
    document.moveDown();

    reports.topTenStudents.forEach((student, index) => {
      document.text(
        `${index + 1}. ${student.fullName} (${student._id}) - ${student.department} - Average Marks: ${student.averageMarks.toFixed(2)}`
      );
    });

    document.moveDown();
    document.text(`Generated on: ${new Date().toLocaleString()}`);
    document.end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
