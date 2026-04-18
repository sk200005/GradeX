const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

async function ensureDefaultAdmin() {
  const existingAdmin = await Admin.findOne({ username: "admin" });

  if (existingAdmin) {
    return existingAdmin;
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);

  return Admin.create({
    username: "admin",
    password: hashedPassword,
    fullName: "System Administrator"
  });
}

module.exports = {
  ensureDefaultAdmin
};
