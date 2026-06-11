// ============================================================
//  CONTENT FILE  —  this is the ONLY file you edit to make a quiz.
//  Copy this whole _template folder, rename it, and edit below.
// ============================================================

// ---- 1) Quiz settings -------------------------------------------------
//  id    : unique short name, letters/numbers/underscores only.
//          (used to save YOUR progress separately for each quiz)
//  title : shown in the header
//  emoji : shown next to the title
const QUIZ_CONFIG = { id: "my_quiz", title: "My New Quiz", emoji: "📘" };


// ---- 2) Pathology / figure images (optional) --------------------------
//  Leave as {} if you have no images.
//  To add one: "myKey": "data:image/jpeg;base64,....."
//  then reference "myKey" as the 6th item of a question (see below).
const IMAGES = {};


// ---- 3) The questions -------------------------------------------------
//  Structure (nesting):  Lecture -> Learning Objective (LO) -> Questions
//
//  Lecture  = [ number, "Lecture title", [ ...LOs... ] ]
//  LO       = [ number, "LO text", [ ...questions... ] ]
//  Question = [ "stem", ["opt A","opt B","opt C","opt D"], correctIndex,
//               "explanation", "basic" | "advanced", "imageKey"(optional) ]
//
//  correctIndex is 0-based: 0 = first option, 1 = second, etc.
//  The app shuffles the options automatically, so the correct answer
//  does NOT have to be listed first.
//
//  Keep the // QUIZ_START and // QUIZ_END comment lines exactly as they
//  are — the in-app "Download Changes" button relies on them.

// QUIZ_START
const QUIZ = [
  [1, "Example Lecture One", [
    [1, "Describe the first learning objective", [
      ["What is 2 + 2?",
       ["4", "3", "5", "22"],
       0,
       "2 + 2 = 4. This explanation appears after the user answers.",
       "basic"],
      ["Which option is labeled 'advanced' difficulty?",
       ["This one", "The first one", "None of them", "All of them"],
       0,
       "This question is tagged 'advanced' (the 5th item). Use 'basic' for foundational recall and 'advanced' for multi-step reasoning.",
       "advanced"]
    ]],
    [2, "Describe the second learning objective", [
      ["The capital of France is ___.",
       ["Paris", "London", "Rome", "Berlin"],
       0,
       "Paris is the capital of France.",
       "basic"]
    ]]
  ]],
  [2, "Example Lecture Two", [
    [1, "Describe another objective", [
      ["Pick the correct answer (it is option C here).",
       ["Wrong", "Wrong", "Correct", "Wrong"],
       2,
       "correctIndex was set to 2, so the third option is correct.",
       "basic"]
    ]]
  ]]
];
// QUIZ_END


// ---- 4) "Teach Me This" explanations (optional) -----------------------
//  Key format: "lectureNumber_loNumber"  (e.g. "1_2" = Lecture 1, LO 2)
//  Each value: { answer: "...", why: "..." }
//  In the text you can use **bold**, blank lines for paragraphs, and
//  lines starting with "- " for bullet points.
const LO_ANSWERS = {
  "1_1": {
    answer: "This is the long teaching explanation for Lecture 1, LO 1.\n\nUse a blank line to start a new paragraph.\n\n- bullet one\n- bullet two",
    why: "This 'Why this matters' note appears below the main explanation."
  }
};


// ---- 5) Lecture reference cards (optional) ----------------------------
//  Big reference tables shown at the top of a lecture. Key = lecture number.
//  Leave as {} if unused.
const LECTURE_REFERENCES = {};
