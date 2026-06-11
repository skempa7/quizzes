# Quiz App

A self-contained study quiz app (multiple-choice questions, "Teach Me This"
explanations, Fast Mode, progress tracking, flagging, dark mode). Built to be
**hosted free on GitHub Pages** and **edited without touching any code**.

## How it's organized

```
index.html              ← homepage that lists your quizzes
shared/
  engine.js             ← the app logic (shared by every quiz — don't edit)
  styles.css            ← the styling (shared by every quiz — don't edit)
quizzes/
  gi-exam-1/
    index.html          ← tiny page that loads the engine + this quiz's content
    content.js          ← ★ THE ONLY FILE YOU EDIT: settings + questions
  template/
    index.html
    content.js          ← blank example to copy when making a new quiz
```

The idea: **all questions live in `content.js`.** The engine and styling are
shared, so a fix or improvement applies to every quiz at once, and you never
edit code to change content.

---

## Editing questions

Open the quiz's `content.js` (e.g. `quizzes/gi-exam-1/content.js`) — on the
GitHub website just click the file, then the pencil ✏️ icon. Each question is:

```js
["The question stem goes here?",
 ["option A", "option B", "option C", "option D"],
 0,                          // correctIndex: 0 = option A, 1 = B, 2 = C, 3 = D
 "Explanation shown after answering.",
 "basic",                    // "basic" or "advanced" (difficulty tag)
 "imageKey"]                 // OPTIONAL 6th item — only if showing a figure
```

The options are **shuffled automatically**, so the correct answer does not need
to be listed first — just set `correctIndex` to point at it.

Questions are nested: **Lecture → Learning Objective (LO) → Questions**.
`content.js` has comments walking through the exact format.

> ⚠️ Keep the `// QUIZ_START` and `// QUIZ_END` comment lines exactly as they
> are. The in-app **Download Changes** button looks for them.

### "Teach Me This" explanations

The long explanations behind each LO's "Teach Me This" button live in the
`LO_ANSWERS` object, keyed `"lecture_LO"` (e.g. `"1_2"` = Lecture 1, LO 2).

---

## Adding a brand-new quiz (e.g. a different exam)

1. **Copy** the `quizzes/template` folder and rename the copy
   (e.g. `quizzes/cardio-exam`).
2. Edit that folder's **`content.js`**: set `QUIZ_CONFIG` (give it a unique
   `id`), then replace the example questions with yours.
3. Add a link to it on the homepage `index.html` (copy the existing quiz-card
   block, change the `href` and name).

That's it. No code, no setup — the engine and styling come along for free.

---

## Putting it online (GitHub Pages) — one time

1. Create a new **public** repository on github.com (any name, e.g. `quizzes`).
2. Push this folder to it (see the publishing steps you were given, or use
   GitHub's "upload files" on the website).
3. In the repo: **Settings → Pages → Source: `main` branch / `(root)` → Save**.
4. Wait ~1 minute. Your site is live at
   `https://YOUR-USERNAME.github.io/REPO-NAME/`.

After that, **edit `content.js` right on the GitHub website**, commit, and the
live site updates within a minute. You can bookmark the URL on your phone and
laptop — progress is saved per-device in the browser.

---

## Running it locally

Because the quiz loads `content.js` as a normal script, you can just
double-click `quizzes/gi-exam-1/index.html` to open it in your browser — no
server needed.

## Credits

Engine and content originally built as a single-file study app; restructured
into this shared-engine + per-quiz-content layout.
