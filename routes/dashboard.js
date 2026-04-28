const express = require("express");

const { ensureAuthenticated } = require("../middleware/auth");
const {
  getDashboardSummary,
  getDashboardCharts
} = require("../utils/analytics");

const router = express.Router();

router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    const [summary, charts] = await Promise.all([
      getDashboardSummary(req.globalBranch),
      getDashboardCharts(req.globalBranch)
    ]);

    res.render("dashboard", {
      pageTitle: "Dashboard",
      summary,
      charts
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
