import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
dotenv.config();

console.log("GEMINI_API_KEY present?", !!process.env.GEMINI_API_KEY);

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: path.join(__dirname, "uploads") });
const PORT = process.env.PORT || 3000;

// Gemini client – uses GEMINI_API_KEY env var (as in docs)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// ---------- Helper: call Gemini with JSON output ----------
async function generateJsonFromGemini({ contents, schema }) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    // Use structured output → JSON (from official docs) :contentReference[oaicite:1]{index=1}
    config: {
      responseMimeType: "application/json",
      ...(schema ? { responseJsonSchema: schema } : {}),
    },
  });

  const text = response.text;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", e.message, text);
    throw new Error("Gemini did not return valid JSON.");
  }
}

// ---------- Syllabus → structured JSON ----------
const syllabusSchema = {
  type: "object",
  properties: {
    course_title: { type: "string", description: "Course title" },
    instructor: { type: "string", description: "Instructor name", nullable: true },
    term: { type: "string", description: "Term or semester info", nullable: true },
    assessments: {
      type: "array",
      description: "List of graded items",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          weight_percent: { type: "number", nullable: true },
          due_date: { type: "string", description: "Due date in ISO format if possible", nullable: true },
          notes: { type: "string", nullable: true }
        },
        required: ["name"]
      }
    },
    weekly_topics: {
      type: "array",
      description: "List of week-by-week topics",
      items: {
        type: "object",
        properties: {
          week_number: { type: "integer" },
          title: { type: "string" },
          topics: { type: "string", nullable: true },
          readings: { type: "string", nullable: true }
        },
        required: ["week_number", "title"]
      }
    }
  },
  required: ["course_title", "assessments", "weekly_topics"]
};

// POST /api/syllabus/parse
app.post("/api/syllabus/parse", upload.single("syllabus"), async (req, res) => {
  try {
    const textInput = req.body.text || "";
    let base64Pdf = null;

    if (req.file) {
      const filePath = req.file.path;
      const bytes = fs.readFileSync(filePath);
      base64Pdf = Buffer.from(bytes).toString("base64");
      fs.unlink(filePath, () => {});
    }

    if (!textInput && !base64Pdf) {
      return res.status(400).json({ error: "No syllabus text or file provided." });
    }

    const prompt = `
You are a helpful university course assistant.

From this course syllabus, extract the following as structured data:

- course_title: full course title
- instructor: instructor name if present
- term: semester or term (e.g. "Fall 2025") if present
- assessments: each graded item
    - name (e.g. "Midterm 1", "Assignment 2")
    - type (e.g. exam, quiz, essay, lab, project)
    - weight_percent (number, if you can infer it)
    - due_date (ISO 8601 date string if an exact date is present, otherwise null)
    - notes (for extra details like "2% per day late up to 5 days")
- weekly_topics: week-by-week outline
    - week_number (integer, starting from 1)
    - title (short name for the week's topic)
    - topics (short description)
    - readings (chapter/page list if available)

IMPORTANT:
- Only use information that is clearly in the syllabus.
- If something is missing, set it to null or an empty string.
`;

    const contents = [{ text: prompt }];

    if (base64Pdf) {
      contents.push({
        inlineData: {
          mimeType: "application/pdf",
          data: base64Pdf,
        },
      });
    } else if (textInput) {
      contents.push({ text: textInput });
    }

    const json = await generateJsonFromGemini({
      contents,
      schema: syllabusSchema,
    });

    res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to parse syllabus", details: err.message });
  }
});

// ---------- Weekly Study Plan ----------
const planSchema = {
  type: "object",
  properties: {
    weeks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          week_number: { type: "integer" },
          date_range: { type: "string" },
          topics_to_cover: { type: "string" },
          tasks: { type: "array", items: { type: "string" } },
          estimated_time_hours: { type: "number" },
          focus: { type: "string" }
        },
        required: ["week_number", "topics_to_cover", "tasks", "estimated_time_hours"]
      }
    }
  },
  required: ["weeks"]
};

app.post("/api/syllabus/plan", async (req, res) => {
  try {
    const { syllabus, startDate, examDate, hoursPerWeek, difficulty } = req.body;

    if (!syllabus || !startDate || !examDate || !hoursPerWeek) {
      return res.status(400).json({ error: "Missing required fields (syllabus, startDate, examDate, hoursPerWeek)." });
    }

    const prompt = `
You are a personal study coach for a university student.

You are given:
- course syllabus (JSON)
- semester start date
- final exam date
- available study hours per week
- difficulty mode

Difficulties:
- "beginner": more review, smaller chunks, simpler tasks.
- "normal": balanced plan.
- "hardcore": more challenging tasks, extra practice, and exam-style questions.

Rules:
- Use the weekly_topics and assessments from the syllabus.
- Spread the work evenly from startDate to examDate.
- Keep each week within the student's hours_per_week budget.
- Make sure tasks align with upcoming assignments and exams.

Return JSON with:
{
  "weeks": [
    {
      "week_number": number,
      "date_range": "YYYY-MM-DD → YYYY-MM-DD",
      "topics_to_cover": "short description",
      "tasks": ["Read Ch 1", "Do 5 practice problems on recursion", ...],
      "estimated_time_hours": number,
      "focus": "e.g. Midterm prep / Final review / Project work"
    },
    ...
  ]
}
`;

    const contents = [
      {
        text: prompt,
      },
      {
        text:
          "Course syllabus JSON:\n" +
          JSON.stringify(syllabus, null, 2),
      },
      {
        text:
          "Student profile:\n" +
          JSON.stringify(
            {
              start_date: startDate,
              exam_date: examDate,
              hours_per_week: Number(hoursPerWeek),
              difficulty: difficulty || "normal",
            },
            null,
            2
          ),
      },
    ];

    const json = await generateJsonFromGemini({
      contents,
      schema: planSchema,
    });

    res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate plan", details: err.message });
  }
});

// ---------- Practice questions / flashcards ----------
const qaSchema = {
  type: "object",
  properties: {
    topic: { type: "string" },
    difficulty: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string", nullable: true }
        },
        required: ["question"]
      }
    },
    flashcards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" }
        },
        required: ["front", "back"]
      }
    }
  },
  required: ["topic", "questions", "flashcards"]
};

app.post("/api/questions", async (req, res) => {
  try {
    const { topic, difficulty } = req.body;
    if (!topic) {
      return res.status(400).json({ error: "Missing topic." });
    }

    const prompt = `
Generate practice material for the topic "${topic}" for a university-level course.

Difficulty: ${difficulty || "normal"}.

Output:
- 5 practice questions (with short answers if appropriate).
- 5 flashcards as (front, back) pairs.

Return JSON with:
{
  "topic": string,
  "difficulty": string,
  "questions": [
    { "question": "...", "answer": "..." },
    ...
  ],
  "flashcards": [
    { "front": "...", "back": "..." },
    ...
  ]
}
`;

    const contents = [{ text: prompt }];

    const json = await generateJsonFromGemini({
      contents,
      schema: qaSchema,
    });

    res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate questions", details: err.message });
  }
});

// ---------- Missing Assignment Tracker ----------
const trackerSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          course: { type: "string", nullable: true },
          name: { type: "string" },
          status: { type: "string", description: "missing | submitted | upcoming | late" },
          weight_percent: { type: "number", nullable: true },
          due_date: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
          priority_score: {
            type: "number",
            description: "Higher = more urgent/important",
            nullable: true
          },
          recommended_action: { type: "string", nullable: true }
        },
        required: ["name", "status"]
      }
    },
    today_focus: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["summary", "assignments"]
};

app.post("/api/tracker/analyze", async (req, res) => {
  try {
    const { rawText, hoursToday } = req.body;
    if (!rawText) {
      return res.status(400).json({ error: "Missing rawText with your assignment list / grade info." });
    }

    const prompt = `
You are a "Missing Assignment Tracker" assistant.

User provides messy text copied from:
- LMS gradebook
- syllabus
- to-do list

Your job:
1. Infer the list of assignments and their statuses.
2. Mark each as:
   - "submitted" (clearly done)
   - "missing" (past due, no submission or 0)
   - "upcoming" (due in future)
   - "late" (past due but maybe still can be submitted).
3. Estimate weight_percent if there is a percentage.
4. Prioritize by: (weight * lateness / days remaining), or similar.
5. Create human-style recommended_action for each assignment.
6. Suggest what to focus on TODAY given ~${hoursToday || 3} hours.

Return JSON like:
{
  "summary": "High level summary...",
  "assignments": [
    {
      "course": "EECS 2101",
      "name": "Assignment 2",
      "status": "missing",
      "weight_percent": 15,
      "due_date": "2025-10-12",
      "notes": "Worth 15%, 2% per day late",
      "priority_score": 0.93,
      "recommended_action": "Start this TODAY, even if late – still worth many marks."
    },
    ...
  ],
  "today_focus": [
    "Finish Assignment 2 for EECS 2101",
    "Email prof about late Lab 1"
  ]
}
IMPORTANT:
- Use today's date from the context in the text if given. If not, reason approximately and still classify.
- If you are unsure, add a note in "notes".
`;

    const contents = [
      { text: prompt },
      { text: "Raw text from student (LMS / syllabus / notes):\n\n" + rawText },
    ];

    const json = await generateJsonFromGemini({
      contents,
      schema: trackerSchema,
    });

    res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze assignments", details: err.message });
  }
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
