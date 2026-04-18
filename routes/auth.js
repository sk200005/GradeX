const express = require("express");
const bcrypt = require("bcryptjs");

const Admin = require("../models/Admin");
const { redirectIfAuthenticated } = require("../middleware/auth");

const router = express.Router();

router.get("/login", redirectIfAuthenticated, (req, res) => {
  res.render("login", {
    pageTitle: "Admin Login"
  });
});

router.post("/login", redirectIfAuthenticated, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.flash("error", "Username and password are required.");
    return res.redirect("/login");
  }

  const admin = await Admin.findOne({ username: username.trim() });

  if (!admin) {
    req.flash("error", "Invalid username or password.");
    return res.redirect("/login");
  }

  const passwordMatches = await bcrypt.compare(password, admin.password);

  if (!passwordMatches) {
    req.flash("error", "Invalid username or password.");
    return res.redirect("/login");
  }

  req.session.admin = {
    id: admin._id,
    username: admin.username,
    fullName: admin.fullName
  };

  req.flash("success", "Login successful. Welcome back!");
  return res.redirect("/dashboard");
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

module.exports = router;
