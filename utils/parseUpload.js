const csv = require("csv-parser");
const xlsx = require("xlsx");
const { Readable } = require("stream");

/**
 * Parses an uploaded file buffer into an array of row objects.
 * Supports .csv and .xlsx files.
 *
 * @param {Buffer} buffer - The file buffer from multer memoryStorage.
 * @param {string} originalname - Original filename to detect extension.
 * @returns {Promise<Object[]>} Array of row objects (keys = column headers).
 */
function parseUploadedFile(buffer, originalname) {
  const ext = originalname.split(".").pop().toLowerCase();

  if (ext === "xlsx") {
    return parseXlsx(buffer);
  }

  return parseCsv(buffer);
}

function parseXlsx(buffer) {
  return new Promise((resolve, reject) => {
    try {
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
      // Trim all string values
      const cleaned = rows.map((row) => {
        const obj = {};
        for (const [key, value] of Object.entries(row)) {
          obj[key.trim()] = typeof value === "string" ? value.trim() : value;
        }
        return obj;
      });
      resolve(cleaned);
    } catch (err) {
      reject(new Error("Failed to parse Excel file: " + err.message));
    }
  });
}

function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer.toString("utf8"));

    stream
      .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
      .on("data", (row) => {
        const cleaned = {};
        for (const [key, value] of Object.entries(row)) {
          cleaned[key] = typeof value === "string" ? value.trim() : value;
        }
        rows.push(cleaned);
      })
      .on("end", () => resolve(rows))
      .on("error", (err) =>
        reject(new Error("Failed to parse CSV file: " + err.message))
      );
  });
}

module.exports = { parseUploadedFile };
