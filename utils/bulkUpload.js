/**
 * Generic bulk insert helper for Mongoose models.
 *
 * Accepts an array of plain document objects and inserts them using
 * insertMany with ordered:false so valid rows succeed even if some fail.
 *
 * @param {mongoose.Model} Model - The Mongoose model to insert into.
 * @param {Object[]} docs - Array of plain document objects to insert.
 * @returns {Promise<{ successCount: number, errors: Array<{row, message}> }>}
 */
async function bulkInsert(Model, docs) {
  if (!docs || docs.length === 0) {
    return { successCount: 0, errors: [] };
  }

  try {
    const result = await Model.insertMany(docs, {
      ordered: false,
      rawResult: true
    });

    const successCount = result.insertedCount ?? docs.length;
    return { successCount, errors: [] };
  } catch (err) {
    // insertMany with ordered:false throws a BulkWriteError when some docs fail.
    // err.result contains details about successes and failures.
    if (err.name === "MongoBulkWriteError" || err.writeErrors) {
      const writeErrors = err.writeErrors || [];
      const successCount =
        (err.result && err.result.nInserted) ||
        docs.length - writeErrors.length;

      const errors = writeErrors.map((we) => {
        const rowIndex = we.index; // 0-based index in the docs array
        const doc = docs[rowIndex] || {};
        return {
          row: rowIndex + 1,
          identifier:
            doc.rollNumber ||
            doc.studentName ||
            `Row ${rowIndex + 1}`,
          message: normaliseMongoBulkError(we)
        };
      });

      return { successCount, errors };
    }

    // Unknown / connection-level error — rethrow
    throw err;
  }
}

/**
 * Normalises a MongoDB BulkWriteError entry into a human-readable message.
 */
function normaliseMongoBulkError(writeError) {
  const code = writeError.code || writeError.err?.code;
  const msg = writeError.errmsg || writeError.err?.errmsg || writeError.message || "";

  // E11000 = duplicate key
  if (code === 11000 || msg.includes("E11000")) {
    if (msg.includes("rollNumber")) return "Duplicate roll number — student already exists.";
    if (msg.includes("student") && msg.includes("subject")) {
      return "Duplicate record — marks/attendance already exist for this student-subject pair.";
    }
    if (msg.includes("email")) return "Duplicate email address — student already exists.";
    return "Duplicate record — this entry already exists.";
  }

  return msg || "Unknown database error.";
}

module.exports = { bulkInsert };
