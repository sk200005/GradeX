const body = document.body;
const themeToggle = document.querySelector("[data-theme-toggle]");
const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
const sidebar = document.getElementById("sidebar");

function applySavedTheme() {
  const savedTheme = localStorage.getItem("sras-theme") || "light";
  body.setAttribute("data-theme", savedTheme);
}

function setupThemeToggle() {
  if (!themeToggle) return;

  themeToggle.addEventListener("click", () => {
    const currentTheme = body.getAttribute("data-theme") || "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    body.setAttribute("data-theme", nextTheme);
    localStorage.setItem("sras-theme", nextTheme);
  });
}

function setupSidebarToggle() {
  if (!sidebarToggle || !sidebar) return;

  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

function setupDeleteConfirmation() {
  document.querySelectorAll("[data-confirm]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const message = button.getAttribute("data-confirm");
      if (!window.confirm(message)) {
        event.preventDefault();
      }
    });
  });
}

function calculateGrade(total) {
  if (total >= 90) return { grade: "A+", status: "Pass" };
  if (total >= 80) return { grade: "A", status: "Pass" };
  if (total >= 70) return { grade: "B", status: "Pass" };
  if (total >= 60) return { grade: "C", status: "Pass" };
  if (total >= 40) return { grade: "D", status: "Pass" };
  return { grade: "Fail", status: "Fail" };
}

function setupMarkPreview() {
  const preview = document.querySelector("[data-mark-preview]");
  const markInputs = document.querySelectorAll("[data-mark-input]");

  if (!preview || !markInputs.length) return;

  const updatePreview = () => {
    const internal = Number(document.querySelector("[name='internalMarks']")?.value || 0);
    const external = Number(document.querySelector("[name='externalMarks']")?.value || 0);
    const total = Math.round((internal + external) / 2);
    const { grade, status } = calculateGrade(total);
    preview.textContent = `Total: ${total || 0} | Grade: ${grade} | Status: ${status}`;
  };

  markInputs.forEach((input) => input.addEventListener("input", updatePreview));
  updatePreview();
}

function setupAttendancePreview() {
  const preview = document.querySelector("[data-attendance-preview]");
  const attendanceInputs = document.querySelectorAll("[data-attendance-input]");

  if (!preview || !attendanceInputs.length) return;

  const updatePreview = () => {
    const total = Number(document.querySelector("[name='totalClasses']")?.value || 0);
    const present = Number(document.querySelector("[name='presentClasses']")?.value || 0);

    if (!total) {
      preview.textContent = "Attendance: 0%";
      return;
    }

    const percentage = ((present / total) * 100).toFixed(2);
    preview.textContent = `Attendance: ${percentage}%`;
  };

  attendanceInputs.forEach((input) => input.addEventListener("input", updatePreview));
  updatePreview();
}

function setupLiveFilter() {
  const liveTable = document.querySelector("[data-live-filter]");
  const searchInput = document.querySelector(".search-form input");

  if (!liveTable || !searchInput) return;

  const rows = Array.from(liveTable.querySelectorAll("tbody tr"));

  searchInput.addEventListener("input", () => {
    const value = searchInput.value.trim().toLowerCase();
    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(value) ? "" : "none";
    });
  });
}

function createChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === "undefined") return;
  new Chart(canvas, config);
}

function setupDashboardCharts() {
  const data = window.dashboardData;
  if (!data) return;

  createChart("topStudentsChart", {
    type: "bar",
    data: {
      labels: data.topStudents.map((item) => item.fullName || item._id),
      datasets: [
        {
          label: "Average Marks",
          data: data.topStudents.map((item) => Number(item.averageMarks.toFixed(2))),
          backgroundColor: ["#0b76d1", "#1c8ae1", "#48a6ef", "#7dbff7", "#a4d2fb"]
        }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const subjectMap = {};
  data.subjectPassFail.forEach((item) => {
    const subject = item._id.subject;
    if (!subjectMap[subject]) {
      subjectMap[subject] = { pass: 0, fail: 0 };
    }
    if (item._id.status === "Pass") subjectMap[subject].pass = item.count;
    if (item._id.status === "Fail") subjectMap[subject].fail = item.count;
  });

  createChart("subjectPassFailChart", {
    type: "bar",
    data: {
      labels: Object.keys(subjectMap),
      datasets: [
        {
          label: "Pass",
          data: Object.values(subjectMap).map((item) => item.pass),
          backgroundColor: "#0d9f6e"
        },
        {
          label: "Fail",
          data: Object.values(subjectMap).map((item) => item.fail),
          backgroundColor: "#d9485f"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });

  createChart("attendanceMarksChart", {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Students",
          data: data.attendanceVsMarks.map((item) => ({
            x: item.averageAttendance,
            y: item.averageMarks
          })),
          backgroundColor: "#f0a202"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Average Attendance %" } },
        y: { title: { display: true, text: "Average Marks" } }
      }
    }
  });

  createChart("departmentPerformanceChart", {
    type: "doughnut",
    data: {
      labels: data.departmentPerformance.map((item) => item._id),
      datasets: [
        {
          data: data.departmentPerformance.map((item) =>
            Number(item.averageMarks.toFixed(2))
          ),
          backgroundColor: ["#0b76d1", "#f0a202", "#0d9f6e", "#d9485f", "#8b5cf6"]
        }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  createChart("semesterResultChart", {
    type: "line",
    data: {
      labels: data.semesterResultAnalysis.map((item) => `Semester ${item._id}`),
      datasets: [
        {
          label: "Passed",
          data: data.semesterResultAnalysis.map((item) => item.passed),
          borderColor: "#0d9f6e",
          backgroundColor: "rgba(13, 159, 110, 0.18)",
          fill: true
        },
        {
          label: "Failed",
          data: data.semesterResultAnalysis.map((item) => item.failed),
          borderColor: "#d9485f",
          backgroundColor: "rgba(217, 72, 95, 0.15)",
          fill: true
        },
        {
          label: "Average SGPA",
          data: data.semesterResultAnalysis.map((item) =>
            Number((item.averageSgpa || 0).toFixed(2))
          ),
          borderColor: "#0b76d1",
          backgroundColor: "rgba(11, 118, 209, 0.12)",
          fill: false,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, position: "left" },
        y1: { beginAtZero: true, position: "right" }
      }
    }
  });
}

function setupResultEditModal() {
  const modal = document.getElementById("result-modal");
  const form = document.getElementById("result-edit-form");
  if (!modal || !form) return;

  const closeModal = () => modal.classList.remove("active");

  document.querySelectorAll(".edit-result-btn").forEach((button) => {
    button.addEventListener("click", () => {
      form.action = `/results/${button.dataset.id}?_method=PUT`;
      document.getElementById("edit-student").value = button.dataset.student;
      document.getElementById("edit-semester").value = button.dataset.semester;
      document.getElementById("edit-sgpa").value = button.dataset.sgpa;
      document.getElementById("edit-cgpa").value = button.dataset.cgpa;
      document.getElementById("edit-status").value = button.dataset.status;
      modal.classList.add("active");
    });
  });

  modal.querySelectorAll("[data-modal-close]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
}

applySavedTheme();
setupThemeToggle();
setupSidebarToggle();
setupDeleteConfirmation();
setupMarkPreview();
setupAttendancePreview();
setupLiveFilter();
setupDashboardCharts();
setupResultEditModal();
