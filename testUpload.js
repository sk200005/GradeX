const mongoose = require("mongoose");
const { processUnifiedUpload } = require("./utils/unifiedUpload");

async function run() {
  await mongoose.connect("mongodb://127.0.0.1:27017/student_result_analysis_system");
  
  const sampleRows = [
    {
      "Roll No": "CS101",
      "Student Name": "Test Student",
      "Subject": "Math",
      "Total Classes": "10",
      "Present": "8",
      "Internal": "20",
      "External": "70"
    }
  ];

  try {
    const result = await processUnifiedUpload(sampleRows);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
