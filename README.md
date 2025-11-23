# smart-study-planner
Gemini-powered syllabus parser + study planner + assignment tracker
full-stack web app that:
Extracts structured syllabus information
Creates weekly study plans
Generates flashcards & practice questions
Tracks missing or late assignments
Powered by Google Gemini 2.5 Flash.
Features
1. Syllabus → Structured JSON
Upload a syllabus PDF or paste the text — the backend extracts:
course title
instructor
grading breakdown
weekly topics
assessments
2. AI Study Plan Generator
Given:
semester start date
final exam date
hours/week
difficulty mode
The app produces a complete weekly plan.
3. Flashcards + Practice Question
Choose any topic → get:
5 practice questions
5 flashcards
4. Missing Assignment Tracker
Paste LMS gradebook text → AI detects:
missing work
late items
priority
recommended actions

How to Run Locally:
Install Dependencies
Add API Key
  Inside backend/.env:
Start Backend
  npm start
Server runs at:
  http://localhost:3000
  Frontend loads automatically.

Tech Stack
  Frontend
  HTML, CSS, JavaScript
  Fetch API
  Responsive UI
  Backend
  Node.js
  Express.js
  Multer
  @google/genai SDK

<img width="1704" height="938" alt="5" src="https://github.com/user-attachments/assets/0d778774-d7bf-483c-b07a-70204fa52aab" />
<img width="1704" height="938" alt="4" src="https://github.com/user-attachments/assets/1d1b23a1-152a-47d1-a0f2-7931ba68215d" />
<img width="1704" height="938" alt="3" src="https://github.com/user-attachments/assets/69559699-4975-4cda-9d61-41f6c1220973" />
<img width="1704" height="938" alt="2" src="https://github.com/user-attachments/assets/f7467e37-965e-473b-b061-869ee08e1d0c" />
<img width="1704" height="938" alt="1" src="https://github.com/user-attachments/assets/05586efa-bcd1-4dab-bc2a-061699deb1fb" />
