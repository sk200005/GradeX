function calculateMarkSummary(internalMarks, externalMarks) {
  const internal = Number(internalMarks);
  const external = Number(externalMarks);
  const totalMarks = Math.round((internal + external) / 2);

  let grade = "Fail";
  let resultStatus = "Fail";

  if (totalMarks >= 90) {
    grade = "A+";
    resultStatus = "Pass";
  } else if (totalMarks >= 80) {
    grade = "A";
    resultStatus = "Pass";
  } else if (totalMarks >= 70) {
    grade = "B";
    resultStatus = "Pass";
  } else if (totalMarks >= 60) {
    grade = "C";
    resultStatus = "Pass";
  } else if (totalMarks >= 40) {
    grade = "D";
    resultStatus = "Pass";
  }

  return {
    totalMarks,
    grade,
    resultStatus
  };
}

function calculateAttendancePercentage(totalClasses, presentClasses) {
  const total = Number(totalClasses);
  const present = Number(presentClasses);

  if (!total) {
    return 0;
  }

  return Number(((present / total) * 100).toFixed(2));
}

module.exports = {
  calculateMarkSummary,
  calculateAttendancePercentage
};
