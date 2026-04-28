const getDepartmentFromBranch = (branch) => {
  if (branch === "CS") return "Computer Science";
  if (branch === "IT") return "Information Technology";
  if (branch === "ECE") return "Electronics";
  return null;
};

module.exports = { getDepartmentFromBranch };
