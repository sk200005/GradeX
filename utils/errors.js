function getErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyValue || {})[0] || "field";
    return `Duplicate value found for ${duplicateField}. Please use a unique value.`;
  }

  if (error.errors) {
    return Object.values(error.errors)
      .map((item) => item.message)
      .join(" ");
  }

  return error.message || fallbackMessage;
}

module.exports = {
  getErrorMessage
};
