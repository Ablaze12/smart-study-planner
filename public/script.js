// --- Tab switching ---
const tabButtons = document.querySelectorAll(".tab-button");
const tabs = document.querySelectorAll(".tab");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabs.forEach((t) => t.classList.remove("active"));

    btn.classList.add("active");
    const id = btn.dataset.tab;
    document.getElementById(id).classList.add("active");
  });
});

let currentSyllabus = null;
let currentPlan = null;

// --- Study Planner ---
const syllabusForm = document.getElementById("syllabusForm");
const plannerStatus = document.getElementById("plannerStatus");
const syllabusJsonEl = document.getElementById("syllabusJson");
const planWeeksEl = document.getElementById("planWeeks");

// Handle syllabus + plan generation
syllabusForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  plannerStatus.textContent = "Calling Gemini… extracting syllabus and building plan…";

  try {
    // 1) Upload syllabus (PDF or text) and parse
    const fd = new FormData();
    const fileInput = document.getElementById("syllabusFile");
    const text = document.getElementById("syllabusText").value.trim();

    if (fileInput.files[0]) {
      fd.append("syllabus", fileInput.files[0]);
    }
    if (text) {
      fd.append("text", text);
    }

    if (!fileInput.files[0] && !text) {
      plannerStatus.textContent = "Please upload a PDF or paste syllabus text.";
      return;
    }

    const startDate = document.getElementById("startDate").value;
    const examDate = document.getElementById("examDate").value;
    const hoursPerWeek = document.getElementById("hoursPerWeek").value;
    const difficulty = document.getElementById("difficulty").value;

    if (!startDate || !examDate) {
      plannerStatus.textContent = "Please select start & exam dates.";
      return;
    }

    // Parse syllabus
    const parseRes = await fetch("/api/syllabus/parse", {
      method: "POST",
      body: fd,
    });

    if (!parseRes.ok) {
      const err = await parseRes.json().catch(() => ({}));
      throw new Error(err.error || "Failed to parse syllabus.");
    }

    const syllabusJson = await parseRes.json();
    currentSyllabus = syllabusJson;
    syllabusJsonEl.textContent = JSON.stringify(syllabusJson, null, 2);

    // 2) Generate weekly plan
    const planRes = await fetch("/api/syllabus/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        syllabus: syllabusJson,
        startDate,
        examDate,
        hoursPerWeek,
        difficulty,
      }),
    });

    if (!planRes.ok) {
      const err = await planRes.json().catch(() => ({}));
      throw new Error(err.error || "Failed to generate plan.");
    }

    const planJson = await planRes.json();
    currentPlan = planJson;

    renderPlan(planJson);
    plannerStatus.textContent = "✅ Plan generated with Gemini!";
  } catch (err) {
    console.error(err);
    plannerStatus.textContent = "❌ " + err.message;
  }
});

function renderPlan(plan) {
  planWeeksEl.innerHTML = "";
  if (!plan || !plan.weeks || !plan.weeks.length) {
    planWeeksEl.textContent = "No plan weeks generated.";
    return;
  }

  plan.weeks.forEach((w) => {
    const div = document.createElement("div");
    div.className = "week-card";

    const title = document.createElement("h4");
    title.textContent = `Week ${w.week_number}: ${w.focus || ""}`;
    div.appendChild(title);

    if (w.date_range) {
      const dateSpan = document.createElement("div");
      dateSpan.className = "week-date";
      dateSpan.textContent = w.date_range;
      div.appendChild(dateSpan);
    }

    const topics = document.createElement("p");
    topics.textContent = w.topics_to_cover;
    div.appendChild(topics);

    const time = document.createElement("p");
    time.textContent = `Estimated time: ${w.estimated_time_hours}h`;
    div.appendChild(time);

    if (Array.isArray(w.tasks)) {
      const ul = document.createElement("ul");
      w.tasks.forEach((t) => {
        const li = document.createElement("li");
        li.textContent = "• " + t;
        ul.appendChild(li);
      });
      div.appendChild(ul);
    }

    planWeeksEl.appendChild(div);
  });
}

// --- Questions / Flashcards ---
const generateQuestionsBtn = document.getElementById("generateQuestionsBtn");
const questionsStatus = document.getElementById("questionsStatus");
const questionsList = document.getElementById("questionsList");
const flashcardsList = document.getElementById("flashcardsList");

generateQuestionsBtn.addEventListener("click", async () => {
  const topic = document.getElementById("topicInput").value.trim();
  const difficulty = document.getElementById("topicDifficulty").value;

  if (!topic) {
    questionsStatus.textContent = "Please enter a topic.";
    return;
  }

  questionsStatus.textContent = "Generating questions and flashcards with Gemini…";

  try {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, difficulty }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to generate questions.");
    }

    const data = await res.json();
    questionsList.innerHTML = "";
    flashcardsList.innerHTML = "";

    (data.questions || []).forEach((q, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>Q${idx + 1}:</strong> ${q.question}${
        q.answer ? `<br/><span style="opacity:.8;">Ans: ${q.answer}</span>` : ""
      }`;
      questionsList.appendChild(li);
    });

    (data.flashcards || []).forEach((f, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>Card ${idx + 1}</strong><br/>Front: ${f.front}<br/>Back: ${f.back}`;
      flashcardsList.appendChild(li);
    });

    questionsStatus.textContent = "✅ Practice generated.";
  } catch (err) {
    console.error(err);
    questionsStatus.textContent = "❌ " + err.message;
  }
});

// --- Missing Assignment Tracker ---
const trackerForm = document.getElementById("trackerForm");
const trackerStatus = document.getElementById("trackerStatus");
const trackerSummary = document.getElementById("trackerSummary");
const assignmentsTableBody = document.querySelector("#assignmentsTable tbody");
const todayFocusList = document.getElementById("todayFocusList");

trackerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const rawText = document.getElementById("trackerRawText").value.trim();
  const hoursToday = document.getElementById("hoursToday").value;

  if (!rawText) {
    trackerStatus.textContent = "Please paste some LMS / grade text.";
    return;
  }

  trackerStatus.textContent = "Analyzing with Gemini…";

  try {
    const res = await fetch("/api/tracker/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText, hoursToday }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to analyze assignments.");
    }

    const data = await res.json();

    trackerSummary.textContent = data.summary || "No summary.";
    renderAssignments(data.assignments || []);
    renderTodayFocus(data.today_focus || []);

    trackerStatus.textContent = "✅ Analysis complete.";
  } catch (err) {
    console.error(err);
    trackerStatus.textContent = "❌ " + err.message;
  }
});

function renderAssignments(assignments) {
  assignmentsTableBody.innerHTML = "";

  if (!assignments.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "No assignments detected.";
    tr.appendChild(td);
    assignmentsTableBody.appendChild(tr);
    return;
  }

  assignments.forEach((a) => {
    const tr = document.createElement("tr");

    const tdCourse = document.createElement("td");
    tdCourse.textContent = a.course || "-";
    tr.appendChild(tdCourse);

    const tdName = document.createElement("td");
    tdName.textContent = a.name;
    tr.appendChild(tdName);

    const tdStatus = document.createElement("td");
    tdStatus.textContent = a.status;
    if (a.status === "missing") tdStatus.classList.add("badge-missing");
    if (a.status === "upcoming") tdStatus.classList.add("badge-upcoming");
    if (a.status === "late") tdStatus.classList.add("badge-late");
    tr.appendChild(tdStatus);

    const tdWeight = document.createElement("td");
    tdWeight.textContent = a.weight_percent != null ? `${a.weight_percent}%` : "-";
    tr.appendChild(tdWeight);

    const tdDue = document.createElement("td");
    tdDue.textContent = a.due_date || "-";
    tr.appendChild(tdDue);

    const tdPriority = document.createElement("td");
    tdPriority.textContent =
      a.priority_score != null ? a.priority_score.toFixed(2) : "-";
    tr.appendChild(tdPriority);

    const tdAction = document.createElement("td");
    tdAction.textContent = a.recommended_action || "";
    tr.appendChild(tdAction);

    assignmentsTableBody.appendChild(tr);
  });
}

function renderTodayFocus(list) {
  todayFocusList.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.textContent = "No specific focus items detected.";
    todayFocusList.appendChild(li);
    return;
  }

  list.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    todayFocusList.appendChild(li);
  });
}
