function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  req.flash("error", "Please log in to continue.");
  return res.redirect("/login");
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect("/dashboard");
  }

  return next();
}

module.exports = {
  ensureAuthenticated,
  redirectIfAuthenticated
};
