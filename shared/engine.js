// Shared quiz engine. Do NOT edit per-quiz content here.
// All questions/answers live in each quiz's content.js.

// =============================================================
// STATE
// =============================================================
const SUBJ = (typeof QUIZ_CONFIG !== "undefined" && QUIZ_CONFIG.id) ? QUIZ_CONFIG.id : "quiz";
const KEYS = {
  answers: SUBJ + "_quiz_v1",
  edits: SUBJ + "_edits_v1",
  deleted: SUBJ + "_deleted_v1",
  added: SUBJ + "_added_v1",
  editmode: SUBJ + "_editmode_v1",
  rsidebar: SUBJ + "_rsidebar_v1",
  committed: SUBJ + "_committed_v1",
  flagged: SUBJ + "_flagged_v1",
  darkmode: SUBJ + "_darkmode_v1",
  daily: SUBJ + "_daily_v1",
  streak: SUBJ + "_streak_v1",
  currentLec: SUBJ + "_curlec_v1",
  reviewIncorrect: SUBJ + "_rev_inc_v1",
  reviewFlagged: SUBJ + "_rev_flag_v1",
  xp: SUBJ + "_xp_v1",
  read: SUBJ + "_read_v1",
  badges: SUBJ + "_badges_v1",
  conceptDone: SUBJ + "_cdone_v1",
  conceptFlag: SUBJ + "_cflag_v1",
  recall: SUBJ + "_recall_v1",
  cqReveal: SUBJ + "_cqreveal_v1",   // { revealKey: true } — drives reading progress
  hl: SUBJ + "_hl_v1",               // { lec: [ {ch, text, color} ] } highlights
  markReview: SUBJ + "_markrev_v1",  // { anchorKey: {lec, ch, text} } ⚠️ review-more tags
  markStar: SUBJ + "_markstar_v1",   // { anchorKey: {lec, ch, text} } ⭐ important tags
  bookmarks: SUBJ + "_bookmarks_v1", // { lec: {ci, label, ts} } 🔖 resume points
  notes: SUBJ + "_notes_v1",         // { lec: [ {id, text, ts} ] } freeform notes
  railCollapsed: SUBJ + "_rail_v1",
  notesOpen: SUBJ + "_notesopen_v1"
};

const state = {
  answers: load(KEYS.answers, {}),       // { "lec_lo_qidx": { picked: idx, correct: bool } }
  edits: load(KEYS.edits, {}),           // { "lec_lo_qidx": [stem, opts, idx, exp, diff] }
  deleted: load(KEYS.deleted, {}),       // { "lec_lo_qidx": true }
  added: load(KEYS.added, {}),           // { "lec_lo": [ [stem, opts, idx, exp, diff], ... ] }
  flagged: load(KEYS.flagged, {}),       // { "lec_lo_qidx": true }
  daily: load(KEYS.daily, { date: null, count: 0 }),
  streakData: load(KEYS.streak, { current: 0, highest: 0 }),
  currentLec: load(KEYS.currentLec, 1),
  editMode: load(KEYS.editmode, false),
  rsidebarHidden: load(KEYS.rsidebar, false),
  darkMode: load(KEYS.darkmode, true),
  reviewIncorrectMode: false,
  reviewFlaggedMode: false,
  reviewSnapshot: null,
  shuffleCache: {},
  xp: load(KEYS.xp, 0),
  read: load(KEYS.read, {}),       // { lecNum: true }
  badges: load(KEYS.badges, {}),   // { badgeId: true }
  conceptDone: load(KEYS.conceptDone, {}),  // { "lec_lo_bi": true }
  conceptFlag: load(KEYS.conceptFlag, {}),  // { "lec_lo_bi": true }
  recallMode: load(KEYS.recall, false),
  cqReveal: load(KEYS.cqReveal, {}),   // { revealKey: true }
  hl: load(KEYS.hl, {}),               // { lec: [ {ch, text, color} ] }
  markReview: load(KEYS.markReview, {}),
  markStar: load(KEYS.markStar, {}),
  bookmarks: load(KEYS.bookmarks, {}), // { lec: {ci, label, ts} }
  notes: load(KEYS.notes, {}),         // { lec: [ {id, text, ts} ] }
  railCollapsed: load(KEYS.railCollapsed, false),
  notesOpen: load(KEYS.notesOpen, false),
  notesTab: "notes",
  viewMode: "dashboard",           // "dashboard" | "learn" | "practice"
  reviewConceptsMode: false,
  markupsMode: null                // null | "highlight" | "review" | "important" | "bookmark"
};

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function bumpDaily() {
  const today = todayStr();
  if (state.daily.date !== today) {
    state.daily = { date: today, count: 0 };
  }
  state.daily.count += 1;
  save(KEYS.daily, state.daily);
}
function dailyCount() {
  if (state.daily.date !== todayStr()) return 0;
  return state.daily.count || 0;
}

// =============================================================
// DETERMINISTIC SHUFFLE (FNV-style hash + LCG)
// =============================================================
function hashKey(k) {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}
function shuffleOptions(opts, key) {
  if (state.shuffleCache[key]) return state.shuffleCache[key];
  let seed = hashKey(key);
  const order = opts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  state.shuffleCache[key] = order;
  return order;
}

// =============================================================
// QUIZ DATA HELPERS
// =============================================================
function getLecture(lecNum) {
  return QUIZ.find(L => L[0] === lecNum);
}
function getEffectiveQuestions(lecNum, loNum) {
  const lec = getLecture(lecNum);
  if (!lec) return [];
  const lo = lec[2].find(L => L[0] === loNum);
  if (!lo) return [];
  const orig = lo[2] || [];
  const result = [];
  orig.forEach((q, qi) => {
    const k = `${lecNum}_${loNum}_${qi}`;
    if (state.deleted[k]) return;
    result.push({ key: k, q: state.edits[k] || q, isOrig: true, idx: qi });
  });
  const addKey = `${lecNum}_${loNum}`;
  const added = state.added[addKey] || [];
  added.forEach((q, ai) => {
    const k = `${lecNum}_${loNum}_a${ai}`;
    result.push({ key: k, q: q, isOrig: false, idx: ai });
  });
  return result;
}
function lectureStats(lecNum) {
  const lec = getLecture(lecNum);
  if (!lec) return { total: 0, answered: 0, correct: 0 };
  let total = 0, answered = 0, correct = 0;
  lec[2].forEach(lo => {
    const qs = getEffectiveQuestions(lecNum, lo[0]);
    total += qs.length;
    qs.forEach(({ key }) => {
      if (state.answers[key]) {
        answered += 1;
        if (state.answers[key].correct) correct += 1;
      }
    });
  });
  return { total, answered, correct };
}
function overallStats() {
  let t = 0, a = 0, c = 0;
  QUIZ.forEach(L => {
    const s = lectureStats(L[0]);
    t += s.total; a += s.answered; c += s.correct;
  });
  return { total: t, answered: a, correct: c };
}

// =============================================================
// RENDER: SIDEBAR
// =============================================================
function renderSidebar() {
  const el = document.getElementById("sidebar");
  const onDash = state.viewMode === "dashboard" && !state.reviewIncorrectMode && !state.reviewFlaggedMode && !state.reviewConceptsMode;
  let html = `<div class="lec-item home-item ${onDash?'active':''}" onclick="goHome()"><span class="lec-name">🏠 Dashboard</span></div><h3>Lectures</h3>`;
  QUIZ.forEach(([n, title, los]) => {
    const s = lectureStats(n);
    const active = (!onDash && n === state.currentLec) ? "active" : "";
    const shortTitle = title.length > 26 ? title.substring(0, 24) + "…" : title;
    const mastered = lectureMastered(n);
    const status = mastered ? `<span class="lec-status master" title="Mastered">★</span>`
                 : state.read[n] ? `<span class="lec-status read" title="Read">✓</span>` : "";
    html += `<div class="lec-item ${active}" onclick="goToLec(${n})">
      <span class="lec-name">${status}<strong>${n}.</strong> ${shortTitle}</span>
      <span class="count">${s.answered}/${s.total}</span>
    </div>`;
  });
  el.innerHTML = html;
}

// =============================================================
// RENDER: RIGHT SIDEBAR (STATS)
// =============================================================
function renderRSidebar() {
  const el = document.getElementById("rsidebar");
  const overall = overallStats();
  const curStats = lectureStats(state.currentLec);
  const overallPct = overall.answered === 0 ? 0 : Math.round(100 * overall.correct / overall.answered);
  const curPct = curStats.answered === 0 ? 0 : Math.round(100 * curStats.correct / curStats.answered);
  const flaggedCount = Object.keys(state.flagged).filter(k => state.flagged[k]).length;
  const streakHot = state.streakData.current >= 3 ? "hot" : "";

  let lecListHtml = "";
  QUIZ.forEach(([n, title]) => {
    const s = lectureStats(n);
    if (s.answered === 0) {
      lecListHtml += `<div class="lec-stat" onclick="goToLec(${n})">
        <div class="lec-stat-top">
          <span class="name">${n}. ${title}</span>
          <span class="pct empty">—</span>
        </div>
        <div class="lec-stat-bar"><div class="lec-stat-bar-fill" style="width:0%"></div></div>
      </div>`;
    } else {
      const pct = Math.round(100 * s.correct / s.answered);
      lecListHtml += `<div class="lec-stat" onclick="goToLec(${n})">
        <div class="lec-stat-top">
          <span class="name">${n}. ${title}</span>
          <span class="pct">${pct}%</span>
        </div>
        <div class="lec-stat-bar"><div class="lec-stat-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    }
  });

  const rk = rankFor(state.xp);
  const readCount = Object.keys(state.read).filter(k => state.read[k]).length;
  const masterCount = QUIZ.filter(L => lectureMastered(L[0])).length;
  const earned = Object.keys(BADGES).filter(b => state.badges[b]);
  const badgesHtml = Object.keys(BADGES).map(b => {
    const got = !!state.badges[b];
    const icon = BADGES[b].split(" ")[0];
    return `<span class="badge ${got ? "got" : "locked"}" title="${BADGES[b]}">${got ? icon : "🔒"}</span>`;
  }).join("");

  el.innerHTML = `
    <div class="rank-card">
      <div class="rank-top">
        <span class="rank-icon">${rk.cur.icon}</span>
        <div>
          <div class="rank-name">${rk.cur.name}</div>
          <div class="rank-xp">${state.xp} XP${rk.next ? ` · ${rk.next.min - state.xp} to ${rk.next.name}` : " · max rank!"}</div>
        </div>
      </div>
      <div class="rank-bar"><div class="rank-bar-fill" style="width:${rk.pct}%"></div></div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Progress</div>
      <div class="stat-row"><span class="label">📖 Lectures read</span><span class="val">${readCount}/30</span></div>
      <div class="stat-row"><span class="label">★ Lectures mastered</span><span class="val">${masterCount}/30</span></div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Badges · ${earned.length}/${Object.keys(BADGES).length}</div>
      <div class="badge-grid">${badgesHtml}</div>
    </div>

    <h3>Your Stats</h3>

    <div class="stat-card gradient">
      <div class="stat-label">This Lecture · % Correct</div>
      <div class="stat-big">${curStats.answered === 0 ? "—" : curPct + "%"}</div>
      <div class="stat-sub">${curStats.correct} of ${curStats.answered} answered</div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Overall · % Correct</div>
      <div class="stat-big">${overall.answered === 0 ? "—" : overallPct + "%"}</div>
      <div class="stat-sub">${overall.correct} of ${overall.answered} · ${overall.total} total</div>
    </div>

    <div class="stat-card streak-card ${streakHot}">
      <div class="flame">🔥</div>
      <div class="streak-info">
        <div class="stat-label">Current Streak</div>
        <div class="num">${state.streakData.current}</div>
        <div class="stat-sub">Highest: <strong>${state.streakData.highest}</strong></div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Today</div>
      <div class="stat-row"><span class="label">Questions done</span><span class="val">${dailyCount()}</span></div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Flagged Questions</div>
      <div class="stat-row"><span class="label">Total flagged</span><span class="val">${flaggedCount}</span></div>
    </div>

    <h3>Accuracy by Lecture</h3>
    <div class="lec-stat-list">
      ${lecListHtml}
    </div>
  `;
}

// =============================================================
// RENDER: MAIN
// =============================================================
function renderMain() {
  if (state.markupsMode) return renderMarkups();
  if (state.reviewIncorrectMode) return renderReviewIncorrect();
  if (state.reviewFlaggedMode) return renderReviewFlagged();
  if (state.reviewConceptsMode) return renderReviewConcepts();
  if (state.viewMode === "dashboard") return renderDashboard();
  if (state.viewMode === "learn") return renderLearnView();
  if (state.viewMode === "master") return renderMasterView();
  return renderLecture();
}

// =============================================================
// GAMIFICATION
// =============================================================
const RANKS = [
  { name: "Pre-Med", min: 0, icon: "🧬" },
  { name: "MS-1", min: 60, icon: "📋" },
  { name: "MS-2", min: 180, icon: "🩻" },
  { name: "MS-3", min: 400, icon: "🩺" },
  { name: "MS-4", min: 750, icon: "💉" },
  { name: "Intern", min: 1200, icon: "🧑‍⚕️" },
  { name: "Resident", min: 1800, icon: "🏥" },
  { name: "Senior Resident", min: 2600, icon: "📈" },
  { name: "Chief Resident", min: 3500, icon: "⭐" },
  { name: "Fellow", min: 4600, icon: "🔬" },
  { name: "Attending", min: 6000, icon: "👨‍⚕️" },
  { name: "Chief of Medicine", min: 7800, icon: "👑" }
];
function rankFor(xp) {
  let cur = RANKS[0], next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].min) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  const span = next ? next.min - cur.min : 1;
  const into = next ? xp - cur.min : 1;
  const pct = next ? Math.min(100, Math.round(100 * into / span)) : 100;
  return { cur, next, pct };
}
function addXP(amount, msg) {
  const before = rankFor(state.xp).cur.name;
  state.xp += amount;
  save(KEYS.xp, state.xp);
  const after = rankFor(state.xp).cur;
  if (after.name !== before) {
    burstXP(`${after.icon} RANK UP! ${after.name}`);
  }
  if (typeof updateRankChip === "function") updateRankChip();
}
const BADGES = {
  first_correct: "🩸 First Blood — your first correct answer",
  bookworm:      "📖 Bookworm — read your first lecture",
  on_fire:       "🔥 On Fire — a 10-answer streak",
  sharpshooter:  "🎯 Sharpshooter — 100% on a lecture",
  lecture_master:"🏅 Lecture Master — mastered a lecture",
  half_read:     "📚 Halfway There — read 15 lectures",
  well_read:     "🎓 Well Read — read all 30 lectures",
  completionist: "👑 Completionist — mastered all 30 lectures",
  speed_demon:   "⚡ Speed Demon — finished a Fast Mode round"
};
function awardBadge(id) {
  if (state.badges[id]) return;
  state.badges[id] = true;
  save(KEYS.badges, state.badges);
  showToast("🏅 Badge unlocked! " + (BADGES[id] || id));
  renderRSidebar();
}
function lectureMastered(n) {
  const s = lectureStats(n);
  return state.read[n] && s.total > 0 && s.answered === s.total && (s.correct / s.answered) >= 0.8;
}
function checkMastery(n) {
  if (lectureMastered(n) && !state.badges["_master_" + n]) {
    state.badges["_master_" + n] = true;
    save(KEYS.badges, state.badges);
    addXP(50);
    awardBadge("lecture_master");
    burstXP("🏅 Lecture " + n + " Mastered! +50 XP");
    // all mastered?
    if (QUIZ.every(L => lectureMastered(L[0]))) awardBadge("completionist");
  }
}
function markRead(n) {
  if (!state.read[n]) {
    state.read[n] = true;
    save(KEYS.read, state.read);
    addXP(20);
    awardBadge("bookworm");
    const readCount = Object.keys(state.read).filter(k => state.read[k]).length;
    if (readCount >= 15) awardBadge("half_read");
    if (readCount >= 30) awardBadge("well_read");
  }
}
function setView(mode) {
  if (typeof stopTTS === "function") stopTTS();
  state.viewMode = mode;
  if (mode === "practice") markRead(state.currentLec);
  renderMain(); renderSidebar(); renderRSidebar();
  refreshNotesIfOpen();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function burstXP(text) {
  const el = document.createElement("div");
  el.className = "fast-burst";
  el.style.color = "var(--primary)";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function esc(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function lectureModeBar(n) {
  const learnActive = state.viewMode === "learn" ? "active" : "";
  const practiceActive = state.viewMode === "practice" ? "active" : "";
  const masterActive = state.viewMode === "master" ? "active" : "";
  const weak = masterWeakCount(n);
  const tools = state.viewMode === "learn" ? `
    <div class="mode-tools">
      <button class="tool-btn" id="tts-btn" onclick="toggleTTS()" title="Listen">🔊 Listen</button>
    </div>` : `<div class="mode-status">${lectureMastered(n)?'<span class="mode-dot master">★ mastered</span>':(state.read[n]?'<span class="mode-dot done">✓ read</span>':'')}</div>`;
  return `<div class="mode-bar">
    <button class="mode-btn ${learnActive}" onclick="setView('learn')">📖 Learn</button>
    <button class="mode-btn ${practiceActive}" onclick="setView('practice')">✍️ Practice</button>
    <button class="mode-btn ${masterActive}" onclick="setView('master')">🎯 Master${weak?`<span class="mode-badge">${weak}</span>`:""}</button>
    ${tools}
  </div>`;
}

function splitLead(t){
  const m = t.match(/^(.{3,64}?[.:])\s+(.+)$/s);
  if (m && m[1].length < t.length*0.7) return [m[1].replace(/[.:]\s*$/,""), m[2]];
  return [null, t];
}

const CC_META = {
  cq:    {tag:"✓ Key fact", cls:"cc-cq"},
  key:   {tag:"🔑 Key",      cls:"cc-key"},
  pearl: {tag:"💎 Pearl",    cls:"cc-pearl"},
  cue:   {tag:"👁 Cue",      cls:"cc-cue"},
  q:     {tag:"🤔 Think",    cls:"cc-think"},
  p:     {tag:"",            cls:"cc-p"}
};

function ccFoot(key){
  return `<div class="cc-foot">
    <button class="cc-btn cc-flag${state.conceptFlag[key]?' on':''}" onclick="toggleConceptFlag('${key}',this)" title="Flag for review">🚩</button>
    <button class="cc-btn cc-check${state.conceptDone[key]?' on':''}" onclick="toggleConceptDone('${key}',this)">✓ Got it</button>
  </div>`;
}

function conceptCardHTML(b, key){
  const done = state.conceptDone[key] ? " cc-done" : "";
  const flag = state.conceptFlag[key] ? " cc-flagged" : "";
  if (b.t === "trap" || b.t === "confusion"){
    const tag = b.t === "trap" ? "⚠️ Trap" : "🔀 Don't confuse";
    return `<div class="cc cc-flip ${b.t==='trap'?'cc-trap':'cc-confusion'}${done}${flag}" data-key="${key}">
      <div class="cc-flip-inner" onclick="this.parentElement.classList.toggle('flipped')">
        <div class="cc-flip-face cc-flip-front"><span class="cc-tag">${tag}</span><span class="cc-flip-hint">tap to reveal ⟲</span></div>
        <div class="cc-flip-face cc-flip-back">${esc(b.x)}</div>
      </div>${ccFoot(key)}</div>`;
  }
  const meta = CC_META[b.t] || CC_META.p;
  const [lead, body] = splitLead(b.x);
  const tagHtml = meta.tag ? `<span class="cc-tag">${meta.tag}</span>` : "";
  const head = (lead || meta.tag) ? `<div class="cc-head">${tagHtml}${lead?`<span class="cc-title">${esc(lead)}</span>`:""}</div>` : "";
  return `<div class="cc ${meta.cls}${done}${flag}" data-key="${key}">
    ${head}
    <div class="cc-body" onclick="this.parentElement.classList.add('revealed')"><span class="cc-text">${esc(body)}</span><span class="cc-reveal-hint">👁 tap to reveal</span></div>
    ${ccFoot(key)}</div>`;
}

function mustKnowCardHTML(text, key, i){
  const done = state.conceptDone[key] ? " cc-done" : "";
  const flag = state.conceptFlag[key] ? " cc-flagged" : "";
  return `<div class="cc cc-must${done}${flag}" data-key="${key}">
    <div class="cc-body" onclick="this.parentElement.classList.add('revealed')"><span class="cc-must-num">${i+1}</span><span class="cc-text">${esc(text)}</span><span class="cc-reveal-hint">👁 tap to reveal</span></div>
    ${ccFoot(key)}</div>`;
}

// =============================================================
// ARTICLE READING MODEL — flowing chapters, inline callouts,
// ClaudeCompares drills, ReClaude reflect prompts (reveal = progress)
// =============================================================

// Optional curated chapter grouping per lecture. Each entry groups LO ids
// under a friendly title. Lectures without an entry fall back to one
// chapter per LO (title derived from the LO statement).
const LECTURE_CHAPTERS = {
  1: [
    { icon:"🔌", title:"How the gut is wired", los:[1] },
    { icon:"🔬", title:"How GI disease gets started", los:[2] },
    { icon:"🩺", title:"Diseases you'll actually see", los:[3] }
  ]
};

const NOTE_META = {
  key:       { tag:"🔑 Key",          cls:"key" },
  pearl:     { tag:"💎 Pearl",        cls:"pearl" },
  trap:      { tag:"⚠️ Trap",         cls:"trap" },
  confusion: { tag:"🔀 Don't confuse", cls:"confusion" },
  cue:       { tag:"🎯 Stem cue",     cls:"cue" }
};

function cleanStmt(s){
  s = String(s || "").trim();
  s = s.replace(/^[\s●○•◐◑▪◦·\-–—|]+/, "");          // strip leaked tier dots / bullets
  s = s.replace(/^LO\s*[A-Za-z]*\.?\d*\s*[:.\-]?\s*/i, ""); // strip stray LO id
  return s.trim();
}
function chapterTitleFromLO(lo){
  let s = cleanStmt(lo.statement);
  if (!s) return "";
  s = s.replace(/^(Describe|Identify|Explain|List|Define|Discuss|Outline|Understand|Recognize|Compare|Review|Apply|Analyze|Summari[sz]e|State|Interpret)\s+/i, "");
  s = s.replace(/^and\s+contrast\s+/i, "");
  s = s.replace(/^the\s+(?=[a-z])/i, "");
  s = s.replace(/\s+from a clinical perspective$/i, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length > 72) s = s.slice(0, 70).replace(/\s+\S*$/, "") + "…";
  return s;
}
function getChapters(n){
  const c = (typeof LECTURE_CONTENT !== "undefined") ? LECTURE_CONTENT[n] : null;
  if (!c) return [];
  // prefer generated section clustering when available
  if (typeof FLASHCARDS !== "undefined" && FLASHCARDS[n] && FLASHCARDS[n].sections && FLASHCARDS[n].sections.length)
    return FLASHCARDS[n].sections.map(s => ({ icon:"", title:s.title, los:s.los }));
  if (LECTURE_CHAPTERS[n]) return LECTURE_CHAPTERS[n];
  // fallback: one chapter per LO that has a usable title; fold title-less LOs
  // into the previous chapter so we never spam "Overview".
  const chapters = [];
  (c.los || []).forEach(lo => {
    const t = chapterTitleFromLO(lo);
    if (t || chapters.length === 0) chapters.push({ icon:"", title: t || "Overview", los:[lo.id] });
    else chapters[chapters.length - 1].los.push(lo.id);
  });
  return chapters;
}
function loById(n, id){
  const c = (typeof LECTURE_CONTENT !== "undefined") ? LECTURE_CONTENT[n] : null;
  return (c && (c.los||[]).find(l => l.id === id)) || null;
}

// split a comparison block into individual items (parser leaves internal " CQ ")
function cqItems(text){ return String(text).split(/\s+CQ\s+/).map(s => s.trim()).filter(Boolean); }
// split a recall item into [prompt, answer] on its leading "Term: ..." colon
function splitRecall(text){
  const m = String(text).match(/^(.{3,70}?):\s+([\s\S]+)$/);
  if (m) return [m[1].trim(), m[2].trim()];
  const w = String(text).split(/\s+/);
  if (w.length > 12) return [w.slice(0,8).join(" ") + "…", text];
  return [null, text];
}

function recallRowHTML(item, key){
  const [prompt, ans] = splitRecall(item);
  const on = state.cqReveal[key] ? " revealed" : "";
  const q = prompt ? esc(prompt) : "Recall this";
  return `<div class="rc-recall${on}" data-key="${key}" onclick="revealItem('${key}',this)">
    <span class="rc-recall-q">${q}</span>
    <span class="rc-recall-a">${esc(ans)}</span>
    <span class="rc-recall-hint">tap to reveal</span></div>`;
}
function reflectHTML(n, loId, qtext, key){
  const on = state.cqReveal[key] ? " revealed" : "";
  const qs = getEffectiveQuestions(n, loId);
  const drill = qs.length ? `<button class="rc-drill" onclick="event.stopPropagation(); startReflectDrill(${n},${loId})">✍️ Drill ${qs.length} related question${qs.length===1?"":"s"} →</button>` : "";
  return `<div class="rc-reflect${on}" data-key="${key}" onclick="revealItem('${key}',this)">
    <div class="rc-reflect-q"><span class="rc-reflect-tag">🤔 Test yourself</span>${esc(qtext)}</div>
    <div class="rc-reflect-a">Could you answer that from memory? The reasoning is in this section.${drill}</div>
    <span class="rc-recall-hint">tap to check</span></div>`;
}

// strategic, sparse bolding: high-yield possessive eponyms (Barrett's, Meissner's…)
function emphEponyms(escaped){
  return String(escaped).replace(/\b([A-Z][a-zA-Z]+(?:[-’'][A-Z][a-zA-Z]+)?[’']s)\b/g, '<strong>$1</strong>');
}
// split a must-know into [leadTerm, rest, separator] for strategic bolding
function splitMustLead(s){
  let m = s.match(/^(.{3,62}?)\s+[—–]\s+([\s\S]+)$/);          // "Term — explanation"
  if (m) return [m[1].trim(), m[2].trim(), " — "];
  m = s.match(/^(.{3,62}?[.:])\s+([\s\S]+)$/);                  // "Term. explanation"
  if (m) return [m[1].replace(/[.:]\s*$/, "").trim(), m[2].trim(), ". "];
  return [null, s, ""];
}
function proseHTML(text, pid, extra){
  const a = pid ? ` data-pb="${pid}"` : "";
  const [lead, body] = splitLead(text);
  if (lead) return `<p class="rc-p"${a}><strong class="rc-lead">${esc(lead)}.</strong> ${emphEponyms(esc(body))}${extra||""}</p>`;
  return `<p class="rc-p"${a}>${emphEponyms(esc(text))}${extra||""}</p>`;
}
// terse "point of information" lines (slide-caption style) vs flowing prose
function isPoint(text){
  const t = String(text).trim();
  if (t.length > 140) return false;
  if ((t.match(/[.!?]/g) || []).length > 1) return false;     // more than one sentence = prose
  if (/^[A-Z]{3,}\b/.test(t)) return false;                   // ALL-CAPS lead = prose section
  return /\s[—–]\s/.test(t.slice(0, 80))                      // "Topic — detail"
      || /^[A-Z][^.!?]{3,55}:\s+\S/.test(t)                   // "Topic: detail"
      || t.split(/\s+/).length <= 13;                         // very short clause
}
function pointHTML(text, pid, extra){
  const a = pid ? ` data-pb="${pid}"` : "";
  const [lead, body] = splitLead(text);
  const inner = lead ? `<strong>${esc(lead)}:</strong> ${emphEponyms(esc(body))}` : emphEponyms(esc(text));
  return `<p class="rc-point"${a}>${inner}${extra||""}</p>`;
}
function noteHTML(b, extra, pid){
  const m = NOTE_META[b.t];   // cls: key | pearl | trap | confusion | cue
  const a = pid ? ` data-pb="${pid}"` : "";
  return `<p class="rc-p rc-c-${m.cls}"${a}>${emphEponyms(esc(b.x))}${extra||""}</p>`;
}
// small "jump to the matching slide" button (broad coverage)
function slideJumpBtn(n, jkey){
  const sj = (typeof SLIDE_JUMPS !== "undefined") ? SLIDE_JUMPS[n] : null;
  const s  = (typeof SLIDES !== "undefined") ? SLIDES[n] : null;
  if (!sj || !s || !sj[jkey]) return "";
  const pg = sj[jkey];
  return ` <button class="slide-jump" onclick="event.stopPropagation(); openLightbox('${s.dir}',${s.count},${pg})" title="Show the matching lecture slide">📑 Slide ${pg}</button>`;
}
// strict embed tier → page number for an inline thumbnail (highest-yield only)
function slideEmbedPage(n, jkey){
  return (typeof SLIDE_EMBED !== "undefined" && SLIDE_EMBED[n] && SLIDE_EMBED[n][jkey]) || null;
}

// ---- flashcards (generated Q&A; fall back to label/fact cues) ----
function fcLookup(n){
  if (typeof FLASHCARDS === "undefined" || !FLASHCARDS[n]) return null;
  if (!FLASHCARDS[n]._idx){
    const m = {}; (FLASHCARDS[n].cards || []).forEach(c => m[c.key] = c);
    try { Object.defineProperty(FLASHCARDS[n], "_idx", { value:m, enumerable:false }); } catch(e){ FLASHCARDS[n]._idx = m; }
  }
  return FLASHCARDS[n]._idx;
}
function flashcardHTML(n, key, fbFront, fbBack, backOverride){
  const idx = fcLookup(n); const c = idx && idx[key];
  const front = c ? c.front : fbFront;
  const back  = backOverride || (c ? c.back : fbBack);   // doc's ReClaude A wins when provided
  const on = state.cqReveal[key] ? " flipped" : "";
  return `<div class="fc${on}" data-key="${key}" onclick="flipCard('${key}',this)">
    <div class="fc-inner">
      <div class="fc-face fc-front"><span class="fc-q">${esc(front)}</span><span class="fc-hint">tap to flip ⟲</span></div>
      <div class="fc-face fc-back"><span class="fc-a">${esc(back)}</span></div>
    </div></div>`;
}
function flipCard(key, el){
  el.classList.toggle("flipped");
  if (!state.cqReveal[key]){ state.cqReveal[key] = true; save(KEYS.cqReveal, state.cqReveal); addXP(1); }
  updateReadingProgress();
  const n = state.currentLec, rs = lectureReadingStats(n);
  if (rs.total > 0 && rs.done === rs.total && !state.read[n]){ burstXP("📖 Lecture complete! +20 XP"); markRead(n); checkMastery(n); renderSidebar(); }
}
function slidePageFor(n, jkey){ return (typeof SLIDE_JUMPS !== "undefined" && SLIDE_JUMPS[n] && SLIDE_JUMPS[n][jkey]) || null; }
function inlineSlideHTML(n, pg){
  const s = (typeof SLIDES !== "undefined") ? SLIDES[n] : null; if (!s) return "";
  const num = String(pg).padStart(2, "0");
  return `<figure class="rc-inline-slide" onclick="openLightbox('${s.dir}',${s.count},${pg})" title="Open slide ${pg}">
    <img loading="lazy" src="slides/${s.dir}/${num}.jpg" alt="slide ${pg}"><figcaption>📑 Slide ${pg}</figcaption></figure>`;
}

// Render one chapter/section: continuous prose with inline colored callouts and
// curated inline slides, then a flip-card recall grid at the end.
function renderChapterContent(n, losIds){
  let body = "", cards = [];
  losIds.forEach(id => {
    const lo = loById(n, id); if (!lo) return;
    const blocks = lo.blocks || [];
    const dk = `${n}_${id}`;
    if (typeof DIAGRAMS !== "undefined" && DIAGRAMS[dk]) body += `<div class="rc-diagram">${DIAGRAMS[dk]}</div>`;
    let topic = chapterTitleFromLO(lo) || "";
    // doc's ReClaude answers (rendered as prose) → fold into the matching q flashcard's back
    const recAns = blocks.filter(b => b.t === "p" && /^ReClaude A\s*:/.test(b.x)).map(b => b.x.replace(/^ReClaude A\s*:?\s*/, "").trim());
    let qIdx = 0;
    blocks.forEach((b, bi) => {
      const pid = `${n}_${lo.id}_${bi}`;
      if (b.t === "cq"){
        cqItems(b.x).forEach((it, ii) => {
          const key = `${n}_${lo.id}_cc${bi}_${ii}`;
          const [pr, an] = splitRecall(it);
          cards.push(flashcardHTML(n, key, topic ? `${topic} — ${pr || "recall this"}` : (pr || "Recall this"), an));
        });
      } else if (b.t === "q"){
        cards.push(flashcardHTML(n, `${n}_${lo.id}_q${bi}`, b.x, "Think it through — the reasoning is in this section.", recAns[qIdx++] || null));
      } else if (b.t === "p"){
        if (/^ReClaude A\s*:/.test(b.x)) return;   // answer folded into its flashcard — don't render as prose
        const sb = slideJumpBtn(n, `${lo.id}_${bi}`);
        if (isPoint(b.x)) { body += pointHTML(b.x, pid, sb); }
        else { const [lead] = splitLead(b.x); if (lead) topic = lead; body += proseHTML(b.x, pid, sb); }
      } else if (NOTE_META[b.t]){
        const ekey = `${lo.id}_${bi}`;
        const epg = b.t === "key" ? slideEmbedPage(n, ekey) : null;
        if (epg) body += `<div class="rc-para-slide" data-pb="${pid}">${noteHTML(b, "", null)}${inlineSlideHTML(n, epg)}</div>`;
        else     body += noteHTML(b, slideJumpBtn(n, ekey), pid);
      } else body += proseHTML(b.x, pid);
    });
  });
  let html = body;
  if (cards.length) html += `<div class="rc-recall-zone"><div class="rc-recall-zone-h">🧠 Recall — tap a card to flip</div><div class="fc-grid">${cards.join("")}</div></div>`;
  return html;
}

function renderReadingContent(n){
  const c = (typeof LECTURE_CONTENT !== "undefined") ? LECTURE_CONTENT[n] : null;
  if (!c) return `<div class="empty-state"><div class="icon">📖</div><h3>Reading content coming soon</h3><p>Jump into the questions instead.</p></div>`;
  let html = "";
  if (c.tldr) html += `<p class="rc-standfirst">${emphEponyms(esc(c.tldr))}</p>`;
  if (c.mustKnows && c.mustKnows.length){
    const lis = c.mustKnows.map((m, i) => {
      const [lead, rest, sep] = splitMustLead(m);
      return `<li>${lead ? `<strong>${esc(lead)}</strong>${sep}` : ""}${emphEponyms(esc(rest))}${slideJumpBtn(n, `mk_${i}`)}</li>`;
    }).join("");
    html += `<div class="rc-mustknows"><div class="rc-mk-head">⭐ Must-knows <span>— what your professors stress</span></div><ul>${lis}</ul></div>`;
  }
  getChapters(n).forEach((ch, ci) => {
    html += `<section class="rc-chapter" id="ch-${n}-${ci}">
      <h3 class="rc-chapter-h"><span class="rc-chapter-n">${ci+1}</span>${ch.icon?`<span class="rc-chapter-ic">${ch.icon}</span>`:""}<span class="rc-chapter-t">${esc(ch.title)}</span></h3>
      ${renderChapterContent(n, ch.los)}</section>`;
  });
  return html;
}

function revealItem(key, el){
  if (!state.cqReveal[key]) { state.cqReveal[key] = true; save(KEYS.cqReveal, state.cqReveal); addXP(1); }
  if (el) el.classList.add("revealed");
  updateReadingProgress();
  const n = state.currentLec, rs = lectureReadingStats(n);
  if (rs.total > 0 && rs.done === rs.total && !state.read[n]) { burstXP("📖 Lecture complete! +20 XP"); markRead(n); checkMastery(n); renderSidebar(); }
}
function startReflectDrill(n, loId){
  goToLec(n);
  setView("practice");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderLearnView() {
  const main = document.getElementById("main");
  const lec = getLecture(state.currentLec);
  if (!lec) { main.innerHTML = "<p>Lecture not found.</p>"; return; }
  const [n, title, los] = lec;
  const c = (typeof LECTURE_CONTENT !== "undefined") ? LECTURE_CONTENT[n] : null;
  const prof = c && c.prof ? ` · ${c.prof}` : "";
  const idx = QUIZ.findIndex(L => L[0] === n);
  const prev = idx > 0 ? QUIZ[idx - 1][0] : null;
  const next = idx < QUIZ.length - 1 ? QUIZ[idx + 1][0] : null;
  const qCount = lectureStats(n).total;
  const rs = lectureReadingStats(n);
  const recallCls = state.recallMode ? " cc-recall" : "";

  main.innerHTML = `
    <div class="lecture-header">
      <span class="lec-pill">Lecture ${n}${prof}</span>
      <h2>${esc(title)}</h2>
    </div>
    ${lectureModeBar(n)}
    <div class="reading-prog">
      <div class="reading-prog-bar"><div class="reading-prog-fill" id="reading-prog-fill" style="width:${rs.pct}%"></div></div>
      <span class="reading-prog-txt" id="reading-prog-txt">${rs.total?`${rs.done}/${rs.total} revealed`:"Read through"}</span>
    </div>
    <div class="reading" id="reading">${renderReadingContent(n)}</div>
    ${slidesPanelHTML(n)}
    <div class="learn-cta">
      <div class="learn-cta-text">Done reading? Lock it in with ${qCount} practice question${qCount===1?"":"s"}.</div>
      <button class="btn-start-practice" onclick="setView('practice')">✍️ Start Practice →</button>
    </div>
    <div class="nav-bottom">
      ${prev !== null ? `<button class="btn" onclick="goToLec(${prev})">← Lecture ${prev}</button>` : `<span></span>`}
      ${next !== null ? `<button class="btn" onclick="goToLec(${next})">Lecture ${next} →</button>` : `<span></span>`}
    </div>`;

  // annotations: re-apply highlights, draw chapter badges, wire selection + tray
  reapplyAnnotations(n);
  renderChapterBadges(n);
  bindReadingAnnotations(n);
  showTray(true);
}

// =============================================================
// MASTER — weak-spot drill (missed/flagged questions + ⚠️ review paragraphs)
// =============================================================
function masterWeakItems(n){
  const out = [];
  const lec = getLecture(n); if (!lec) return out;
  lec[2].forEach(lo => {
    getEffectiveQuestions(n, lo[0]).forEach(qe => {
      const a = state.answers[qe.key];
      const wrong = a && a.correct === false;
      const flagged = !!state.flagged[qe.key];
      if (wrong || flagged) out.push({ type:"q", qe, lo: lo[0], reason: wrong ? "missed" : "flagged" });
    });
  });
  Object.keys(state.markReview).forEach(pb => { const t = state.markReview[pb]; if (t.lec === n) out.push({ type:"para", pb, text: t.text }); });
  return out;
}
function masterWeakCount(n){ return masterWeakItems(n).length; }
function masterClearPara(pb){ removeParaTag("review", pb); setView("master"); showToast("Cleared ✓"); }
function renderMasterView(){
  showTray(false); hideAnnoPopup();
  const main = document.getElementById("main");
  const lec = getLecture(state.currentLec);
  if (!lec) { main.innerHTML = "<p>Lecture not found.</p>"; return; }
  const [n, title] = lec;
  const items = masterWeakItems(n);
  const missed = items.filter(i => i.type==="q" && i.reason==="missed").length;
  const flagged = items.filter(i => i.type==="q" && i.reason==="flagged").length;
  const paras = items.filter(i => i.type==="para").length;
  let html = `
    <div class="lecture-header"><span class="lec-pill">Lecture ${n}</span><h2>${esc(title)}</h2></div>
    ${lectureModeBar(n)}
    <div class="master-intro">
      <div class="master-intro-h">🎯 Master · drill your weak spots</div>
      <div class="master-intro-sub">Everything you got wrong, flagged, or marked ⚠️ to review — gathered here to drill until it sticks.</div>
    </div>`;
  if (!items.length){
    html += `<div class="empty-state"><div class="icon">🎯</div><h3>No weak spots here yet</h3>
      <p>Miss a practice question, flag one with ⚑, or drag ⚠️ onto a paragraph while reading — they'll collect here automatically.</p>
      <button class="btn-start-practice" onclick="setView('practice')">✍️ Go practice →</button></div>`;
    main.innerHTML = html; return;
  }
  html += `<div class="master-stats">
    ${missed?`<span class="master-chip miss">✗ ${missed} missed</span>`:""}
    ${flagged?`<span class="master-chip flag">⚑ ${flagged} flagged</span>`:""}
    ${paras?`<span class="master-chip rev">⚠️ ${paras} to review</span>`:""}</div>`;
  items.forEach(it => {
    if (it.type === "q"){
      html += `<div class="master-item"><div class="master-item-tag ${it.reason}">${it.reason==="missed"?"✗ You missed this":"⚑ Flagged"}</div>${renderQuestionCard(it.qe, n, it.lo)}</div>`;
    } else {
      html += `<div class="master-item"><div class="master-item-tag rev">⚠️ Marked to review</div>
        <div class="master-para">${esc(it.text)}</div>
        <div class="master-para-actions">
          <button class="btn btn-small" onclick="jumpToPara(${n},'${it.pb}',0)">Open in lecture</button>
          <button class="btn-start-practice" onclick="masterClearPara('${it.pb}')">✓ Got it</button>
        </div></div>`;
    }
  });
  main.innerHTML = html;
}

function renderLecture() {
  showTray(false); hideAnnoPopup();
  const main = document.getElementById("main");
  const lec = getLecture(state.currentLec);
  if (!lec) { main.innerHTML = "<p>Lecture not found.</p>"; return; }
  const [n, title, los] = lec;
  const stats = lectureStats(n);
  const pct = stats.total === 0 ? 0 : Math.round(100 * stats.answered / stats.total);
  const accuracyText = stats.answered === 0 ? "" :
    ` · <strong>${Math.round(100*stats.correct/stats.answered)}%</strong> correct`;

  const cInfo = (typeof LECTURE_CONTENT !== "undefined") ? LECTURE_CONTENT[n] : null;
  const profTxt = cInfo && cInfo.prof ? ` · ${cInfo.prof}` : "";
  let html = `
    <div class="lecture-header">
      <span class="lec-pill">Lecture ${n}${profTxt}</span>
      <h2>${title}</h2>
      <div class="sub">${los.length} learning objective${los.length === 1 ? "" : "s"}${accuracyText}</div>
    </div>
    ${lectureModeBar(n)}
    <div class="score-row">
      <div class="score-text">${stats.answered} / ${stats.total} answered</div>
      <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
      <button class="btn btn-small" onclick="resetThisLecture(${n})">Reset This Lecture</button>
    </div>
    ${LECTURE_REFERENCES[n] || ""}
  `;

  los.forEach(([loNum, loText, _]) => {
    const loKey = `${n}_${loNum}`;
    const answer = LO_ANSWERS[loKey];
    html += `<div class="lo-card">
      <div class="lo-row">
        <div class="lo-text"><span class="lo-num">LO ${loNum}</span>${loText}</div>
        <button class="btn-teach" id="teach-btn-${loKey}" onclick="toggleTeach('${loKey}')">Teach Me This</button>
      </div>
      <div class="lo-answer" id="teach-${loKey}">
        ${renderTeachContent(answer)}
      </div>`;

    // Questions for this LO
    const qs = getEffectiveQuestions(n, loNum);
    if (qs.length === 0) {
      html += `<div class="placeholder-q">No questions yet for this LO. ${state.editMode ? "Click + Add a question below." : "Questions will appear once content is uploaded."}</div>`;
    } else {
      qs.forEach((qEntry) => {
        html += renderQuestionCard(qEntry, n, loNum);
      });
    }

    if (state.editMode) {
      html += `<button class="btn-add-q editmode-only" onclick="openAddForm(${n},${loNum})">+ Add a question to this LO</button>
      <div id="add-form-${n}_${loNum}"></div>`;
    }

    html += `</div>`;
  });

  // Nav
  const prev = QUIZ.findIndex(L => L[0] === n) > 0 ? QUIZ[QUIZ.findIndex(L => L[0] === n) - 1][0] : null;
  const next = QUIZ.findIndex(L => L[0] === n) < QUIZ.length - 1 ? QUIZ[QUIZ.findIndex(L => L[0] === n) + 1][0] : null;
  html += `<div class="nav-bottom">
    <button class="btn" onclick="setView('learn')">📖 Back to reading</button>
    ${next !== null ? `<button class="btn btn-primary" onclick="goToLec(${next})">Next: Lecture ${next} 📖 →</button>` : `<span></span>`}
  </div>`;

  main.innerHTML = html;
}

function toggleQImage(btn) {
  const wrap = btn.nextElementSibling;
  if (!wrap) return;
  const hidden = wrap.style.display === "none" || wrap.style.display === "";
  wrap.style.display = hidden ? "block" : "none";
  btn.textContent = hidden ? "Hide image" : "Show image — will reveal answer";
}

function renderTeachContent(answer) {
  if (!answer) {
    return `<h4>Teach Me This</h4>
      <p><em>Detailed explanation will be available shortly.</em></p>`;
  }
  let html = `<h4>📚 Teach Me This</h4>${formatRichText(answer.answer)}`;
  if (answer.why) {
    html += `<div class="why-block">
      <h4>💡 Why This Matters</h4>
      ${formatRichText(answer.why)}
    </div>`;
  }
  return html;
}

function formatRichText(t) {
  if (!t) return "";
  // Lightweight formatter: paragraphs split by \n\n, bullets with "- "
  const blocks = t.split(/\n\n+/);
  let out = "";
  blocks.forEach(b => {
    const lines = b.split("\n");
    if (lines.every(l => l.trim().startsWith("- "))) {
      out += "<ul>" + lines.map(l => "<li>" + l.trim().substring(2) + "</li>").join("") + "</ul>";
    } else {
      out += "<p>" + b.replace(/\n/g, " ") + "</p>";
    }
  });
  return out;
}

function renderQuestionCard(qEntry, lecNum, loNum) {
  const { key, q } = qEntry;
  const [stem, opts, correctIdx, explanation, difficulty, imgKey] = q;
  const imgHtml = (imgKey && typeof IMAGES !== "undefined" && IMAGES[imgKey])
    ? `<div class="q-image-reveal"><button class="q-image-btn" type="button" onclick="toggleQImage(this)">Show image — will reveal answer</button><div class="q-image-wrap" style="display:none;"><img class="q-image" src="${IMAGES[imgKey]}" alt="Study table figure" onclick="this.classList.toggle('zoomed')"></div></div>`
    : "";
  const answered = state.answers[key];
  const flagged = !!state.flagged[key];
  const order = shuffleOptions(opts, key);
  const tagClass = difficulty === "advanced" ? "tag-advanced" : "tag-basic";
  const tagLabel = difficulty === "advanced" ? "Multi-step" : "Foundational";

  let optsHtml = "";
  order.forEach(srcIdx => {
    const optText = opts[srcIdx];
    let cls = "option";
    let locked = false;
    if (answered) {
      locked = true;
      cls += " locked";
      if (srcIdx === correctIdx) cls += " correct";
      else if (srcIdx === answered.picked) cls += " wrong";
      else cls += " dim";
    }
    optsHtml += `<button class="${cls}" ${locked ? "disabled" : ""} onclick="answerQ('${key}',${srcIdx},${correctIdx})">${optText}</button>`;
  });

  let editControls = "";
  if (state.editMode) {
    const isEdited = !!state.edits[key];
    editControls = `<div class="q-edit-row editmode-only">
      <button class="btn-edit" onclick="openEditForm('${key}',${lecNum},${loNum})">Edit</button>
      <button class="btn-delete" onclick="deleteQ('${key}')">Delete</button>
      ${isEdited ? `<button class="btn-revert" onclick="revertQ('${key}')">Revert</button>` : ""}
    </div>
    <div id="edit-form-${key}"></div>`;
  }

  return `<div class="question-card" id="qcard-${key}">
    <button class="q-flag-btn ${flagged ? 'flagged' : ''}" onclick="toggleFlag('${key}')">${flagged ? '⚑ Flagged' : '⚐ Flag'}</button>
    <div class="q-meta">
      <span class="tag ${tagClass}">${tagLabel}</span>
      <span class="tag tag-lo">LO ${loNum}</span>
    </div>
    <div class="q-stem">${stem}</div>
    ${imgHtml}
    <div class="options">${optsHtml}</div>
    ${answered ? `<div class="explanation"><strong>${answered.correct ? "✓ Correct." : "✗ Not quite."}</strong> ${explanation}</div>` : ""}
    ${editControls}
  </div>`;
}

// =============================================================
// ANSWER / FLAG
// =============================================================
function answerQ(key, picked, correctIdx) {
  if (state.answers[key]) return; // already answered
  const correct = picked === correctIdx;
  state.answers[key] = { picked, correct };
  save(KEYS.answers, state.answers);

  // Streak
  if (correct) {
    state.streakData.current += 1;
    if (state.streakData.current > state.streakData.highest) {
      state.streakData.highest = state.streakData.current;
    }
  } else {
    state.streakData.current = 0;
  }
  save(KEYS.streak, state.streakData);

  // XP + badges
  if (correct) {
    const parts = key.split("_");
    const lecN = parseInt(parts[0]);
    const qEntry = findQuestionByKey(key);
    const diff = qEntry && qEntry.q && qEntry.q[4] === "advanced" ? "advanced" : "basic";
    let gained = diff === "advanced" ? 10 : 5;
    gained += 3; // first-attempt bonus (answers are one-shot)
    addXP(gained);
    awardBadge("first_correct");
    if (state.streakData.current === 10) awardBadge("on_fire");
    // perfectionist: all answered for this lecture and 100%
    const ls = lectureStats(lecN);
    if (ls.total > 0 && ls.answered === ls.total && ls.correct === ls.total && ls.total >= 5) awardBadge("sharpshooter");
    checkMastery(lecN);
  }

  bumpDaily();

  renderMain();
  renderSidebar();
  renderRSidebar();
  updateHeaderStat();
}

function toggleFlag(key) {
  if (state.flagged[key]) {
    delete state.flagged[key];
  } else {
    state.flagged[key] = true;
  }
  save(KEYS.flagged, state.flagged);
  renderMain();
  renderRSidebar();
  updateHeaderFlagBtn();
}

function updateHeaderFlagBtn() {
  const btn = document.getElementById("btn-review-flagged");
  const count = Object.keys(state.flagged).filter(k => state.flagged[k]).length;
  if (count > 0) {
    btn.classList.add("has-flagged");
    btn.innerHTML = `⚑ Review Flagged (${count})`;
  } else {
    btn.classList.remove("has-flagged");
    btn.innerHTML = `⚑ Review Flagged`;
  }
}

function updateHeaderStat() {
  const el = document.getElementById("head-stat-overall");
  if (!el) return;
  const o = overallStats();
  el.textContent = `${o.answered} / ${o.total} answered`;
}

// =============================================================
// TEACH ME THIS toggle
// =============================================================
function toggleTeach(loKey) {
  const panel = document.getElementById("teach-" + loKey);
  const btn = document.getElementById("teach-btn-" + loKey);
  if (!panel) return;
  panel.classList.toggle("show");
  btn.classList.toggle("active");
  btn.textContent = panel.classList.contains("show") ? "Hide" : "Teach Me This";
}

// =============================================================
// LECTURE NAV
// =============================================================
function goToLec(n) {
  if (typeof stopTTS === "function") stopTTS();
  state.currentLec = n;
  save(KEYS.currentLec, n);
  state.reviewIncorrectMode = false;
  state.reviewFlaggedMode = false;
  state.reviewConceptsMode = false;
  state.markupsMode = null;
  state.viewMode = "learn";
  updateReviewButtons();
  renderMain();
  renderSidebar();
  refreshNotesIfOpen();
  renderRSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =============================================================
// REVIEW MODES
// =============================================================
function toggleReviewIncorrect() {
  state.reviewIncorrectMode = !state.reviewIncorrectMode;
  state.reviewFlaggedMode = false;
  if (state.reviewIncorrectMode) {
    // snapshot incorrect keys
    const incorrect = Object.keys(state.answers).filter(k => state.answers[k] && !state.answers[k].correct);
    state.reviewSnapshot = new Set(incorrect);
  } else {
    state.reviewSnapshot = null;
  }
  updateReviewButtons();
  renderMain();
}

function toggleReviewFlagged() {
  state.reviewFlaggedMode = !state.reviewFlaggedMode;
  state.reviewIncorrectMode = false;
  updateReviewButtons();
  renderMain();
}

function updateReviewButtons() {
  const incBtn = document.getElementById("btn-review-incorrect");
  const flagBtn = document.getElementById("btn-review-flagged");
  if (state.reviewIncorrectMode) {
    incBtn.classList.add("review-active");
    incBtn.textContent = "Exit Review";
  } else {
    incBtn.classList.remove("review-active");
    incBtn.textContent = "Review Incorrect";
  }
  if (state.reviewFlaggedMode) {
    flagBtn.classList.add("review-active");
    flagBtn.textContent = "Exit Flagged";
  } else {
    flagBtn.classList.remove("review-active");
    updateHeaderFlagBtn();
  }
}

function findQuestionByKey(key) {
  // Parse key like "lec_lo_qidx" or "lec_lo_aN"
  const parts = key.split("_");
  const lec = parseInt(parts[0]);
  const lo = parseInt(parts[1]);
  const tail = parts[2];
  const qs = getEffectiveQuestions(lec, lo);
  return qs.find(q => q.key === key) || null;
}

function findLectureForKey(key) {
  const parts = key.split("_");
  return parseInt(parts[0]);
}
function findLoForKey(key) {
  const parts = key.split("_");
  return parseInt(parts[1]);
}

function renderReviewIncorrect() {
  const main = document.getElementById("main");
  const snap = state.reviewSnapshot || new Set();
  if (snap.size === 0) {
    main.innerHTML = `<div class="review-banner">
      <div>
        <h2>Reviewing Incorrect Answers</h2>
        <div class="review-sub">No incorrect answers yet.</div>
      </div>
      <button onclick="toggleReviewIncorrect()">Exit Review</button>
    </div>
    <div class="empty-state">
      <div class="icon">🎯</div>
      <h3>No incorrect answers yet!</h3>
      <p>Once you miss some questions, they'll show up here for review.</p>
    </div>`;
    return;
  }
  const corrected = Array.from(snap).filter(k => state.answers[k] && state.answers[k].correct).length;
  // A snapshot question stays in the review list until it is answered CORRECTLY.
  // This keeps it visible after "Try This Question Again" clears the answer (it is
  // then unanswered and ready to re-attempt in place) and while it remains wrong.
  const toReview = Array.from(snap).filter(k => !(state.answers[k] && state.answers[k].correct));

  // Group by lecture
  const grouped = {};
  toReview.forEach(k => {
    const lec = findLectureForKey(k);
    if (!grouped[lec]) grouped[lec] = [];
    grouped[lec].push(k);
  });

  let html = `<div class="review-banner">
    <div>
      <h2>Reviewing Incorrect Answers · ${snap.size} initial</h2>
      <div class="review-sub">${corrected} now correct on retry · ${toReview.length} remaining to correct</div>
    </div>
    <button onclick="toggleReviewIncorrect()">Exit Review</button>
  </div>`;

  if (toReview.length === 0) {
    html += `<div class="empty-state">
      <div class="icon">🎉</div>
      <h3>All corrected!</h3>
      <p>You've corrected every incorrect answer in this snapshot.</p>
    </div>`;
  } else {
    Object.keys(grouped).map(Number).sort((a,b)=>a-b).forEach(lecNum => {
      const lec = getLecture(lecNum);
      html += `<h3 class="review-lec-header">Lecture ${lecNum}. ${lec[1]}</h3>`;
      grouped[lecNum].forEach(key => {
        const qEntry = findQuestionByKey(key);
        if (!qEntry) return;
        const lo = findLoForKey(key);
        html += `<div class="review-q-meta">LO ${lo}</div>`;
        html += renderQuestionCard(qEntry, lecNum, lo);
        // Show the retry button only on an already-answered card; once cleared the
        // card is live again so the options can be re-answered in place.
        if (state.answers[key]) {
          html += `<button class="btn-retry" onclick="retryQ('${key}')">Try This Question Again →</button>`;
        }
      });
    });
  }
  main.innerHTML = html;
}

function renderReviewFlagged() {
  const main = document.getElementById("main");
  const flaggedKeys = Object.keys(state.flagged).filter(k => state.flagged[k]);
  if (flaggedKeys.length === 0) {
    main.innerHTML = `<div class="review-banner">
      <div>
        <h2>Reviewing Flagged Questions</h2>
        <div class="review-sub">No flagged questions yet.</div>
      </div>
      <button onclick="toggleReviewFlagged()">Exit Flagged</button>
    </div>
    <div class="empty-state">
      <div class="icon">⚐</div>
      <h3>No flagged questions yet!</h3>
      <p>Click the ⚐ Flag button on any question to mark it for review here.</p>
    </div>`;
    return;
  }

  const grouped = {};
  flaggedKeys.forEach(k => {
    const lec = findLectureForKey(k);
    if (!grouped[lec]) grouped[lec] = [];
    grouped[lec].push(k);
  });

  let html = `<div class="review-banner">
    <div>
      <h2>⚑ Reviewing Flagged Questions</h2>
      <div class="review-sub">${flaggedKeys.length} flagged question${flaggedKeys.length === 1 ? '' : 's'}</div>
    </div>
    <button onclick="toggleReviewFlagged()">Exit Flagged</button>
  </div>`;

  Object.keys(grouped).map(Number).sort((a,b)=>a-b).forEach(lecNum => {
    const lec = getLecture(lecNum);
    html += `<h3 class="review-lec-header">Lecture ${lecNum}. ${lec[1]}</h3>`;
    grouped[lecNum].forEach(key => {
      const qEntry = findQuestionByKey(key);
      if (!qEntry) return;
      const lo = findLoForKey(key);
      html += `<div class="review-q-meta">LO ${lo}</div>`;
      html += renderQuestionCard(qEntry, lecNum, lo);
      if (state.answers[key]) {
        html += `<button class="btn-retry" onclick="retryQ('${key}')">Try This Question Again →</button>`;
      }
    });
  });
  main.innerHTML = html;
}

function retryQ(key) {
  delete state.answers[key];
  save(KEYS.answers, state.answers);
  delete state.shuffleCache[key]; // re-shuffle so it doesn't show the previous arrangement
  renderMain();
  renderSidebar();
  renderRSidebar();
  updateHeaderStat();
}

// =============================================================
// PER-LECTURE RESET
// =============================================================
function resetThisLecture(lecNum) {
  if (!confirm(`Reset all answers for Lecture ${lecNum}? This doesn't affect any edits or other lectures.`)) return;
  const lec = getLecture(lecNum);
  lec[2].forEach(lo => {
    const qs = getEffectiveQuestions(lecNum, lo[0]);
    qs.forEach(({ key }) => {
      delete state.answers[key];
    });
  });
  save(KEYS.answers, state.answers);
  renderMain();
  renderSidebar();
  renderRSidebar();
  updateHeaderStat();
  showToast(`Lecture ${lecNum} reset.`);
}

// =============================================================
// RESET MODAL
// =============================================================
function confirmReset(kind) {
  if (kind === "progress") {
    if (!confirm("Reset question progress, streak, flags, and today's count? (Keeps edits/additions/deletions.)")) return;
    state.answers = {}; save(KEYS.answers, {});
    state.flagged = {}; save(KEYS.flagged, {});
    state.streakData = { current: 0, highest: 0 }; save(KEYS.streak, state.streakData);
    state.daily = { date: null, count: 0 }; save(KEYS.daily, state.daily);
    state.shuffleCache = {};
  } else {
    if (!confirm("Reset EVERYTHING back to the file's baseline? This wipes edits, additions, deletions, snapshots, and stats.")) return;
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    location.reload();
    return;
  }
  document.getElementById("reset-modal").classList.remove("show");
  renderMain();
  renderSidebar();
  renderRSidebar();
  updateHeaderStat();
  updateHeaderFlagBtn();
  showToast("Reset complete.");
}

// =============================================================
// EDIT MODE
// =============================================================
function toggleEditMode() {
  state.editMode = !state.editMode;
  save(KEYS.editmode, state.editMode);
  document.body.classList.toggle("edit-mode", state.editMode);
  document.getElementById("btn-editmode").textContent = state.editMode ? "Exit Edit Mode" : "Enter Edit Mode";
  renderMain();
}

function openEditForm(key, lecNum, loNum) {
  const qEntry = findQuestionByKey(key);
  if (!qEntry) return;
  const [stem, opts, correctIdx, exp, diff] = qEntry.q;
  const formEl = document.getElementById("edit-form-" + key);
  formEl.innerHTML = `
    <div class="edit-form">
      <label>Question Stem</label>
      <textarea id="ef-stem-${key}">${stem.replace(/</g,"&lt;")}</textarea>
      <label>Option 0 ${correctIdx===0?'(✓ correct)':''}</label>
      <input id="ef-opt0-${key}" value="${opts[0].replace(/</g,"&lt;").replace(/"/g,'&quot;')}">
      <label>Option 1 ${correctIdx===1?'(✓ correct)':''}</label>
      <input id="ef-opt1-${key}" value="${opts[1].replace(/</g,"&lt;").replace(/"/g,'&quot;')}">
      <label>Option 2 ${correctIdx===2?'(✓ correct)':''}</label>
      <input id="ef-opt2-${key}" value="${opts[2].replace(/</g,"&lt;").replace(/"/g,'&quot;')}">
      <label>Option 3 ${correctIdx===3?'(✓ correct)':''}</label>
      <input id="ef-opt3-${key}" value="${opts[3].replace(/</g,"&lt;").replace(/"/g,'&quot;')}">
      <label>Correct Index (0-3)</label>
      <input id="ef-correct-${key}" type="number" min="0" max="3" value="${correctIdx}">
      <label>Explanation</label>
      <textarea id="ef-exp-${key}">${exp.replace(/</g,"&lt;")}</textarea>
      <label>Difficulty</label>
      <select id="ef-diff-${key}">
        <option value="basic" ${diff==='basic'?'selected':''}>basic</option>
        <option value="advanced" ${diff==='advanced'?'selected':''}>advanced</option>
      </select>
      <div class="form-actions">
        <button class="btn" onclick="document.getElementById('edit-form-${key}').innerHTML=''">Cancel</button>
        <button class="btn btn-primary" onclick="saveEdit('${key}')">Save</button>
      </div>
    </div>`;
}

function saveEdit(key) {
  const stem = document.getElementById("ef-stem-"+key).value;
  const opts = [0,1,2,3].map(i => document.getElementById("ef-opt"+i+"-"+key).value);
  const ci = parseInt(document.getElementById("ef-correct-"+key).value);
  const exp = document.getElementById("ef-exp-"+key).value;
  const diff = document.getElementById("ef-diff-"+key).value;
  state.edits[key] = [stem, opts, ci, exp, diff];
  save(KEYS.edits, state.edits);
  delete state.answers[key]; save(KEYS.answers, state.answers);
  delete state.shuffleCache[key];
  renderMain();
  showToast("Edit saved.");
}

function revertQ(key) {
  if (!confirm("Revert this question to its original?")) return;
  delete state.edits[key];
  save(KEYS.edits, state.edits);
  delete state.answers[key]; save(KEYS.answers, state.answers);
  delete state.shuffleCache[key];
  renderMain();
  showToast("Reverted.");
}

function deleteQ(key) {
  if (!confirm("Delete this question? You can revert via a Reset if needed.")) return;
  if (key.includes("_a")) {
    // Added question - remove from added
    const parts = key.split("_");
    const lec = parseInt(parts[0]);
    const lo = parseInt(parts[1]);
    const aIdx = parseInt(parts[2].substring(1));
    const addKey = lec + "_" + lo;
    const arr = state.added[addKey] || [];
    arr.splice(aIdx, 1);
    if (arr.length === 0) delete state.added[addKey]; else state.added[addKey] = arr;
    save(KEYS.added, state.added);
  } else {
    state.deleted[key] = true;
    save(KEYS.deleted, state.deleted);
  }
  delete state.answers[key]; save(KEYS.answers, state.answers);
  delete state.shuffleCache[key];
  renderMain();
  renderSidebar();
  showToast("Question deleted.");
}

function openAddForm(lecNum, loNum) {
  const k = lecNum + "_" + loNum;
  const formEl = document.getElementById("add-form-" + k);
  formEl.innerHTML = `
    <div class="edit-form">
      <label>Question Stem</label>
      <textarea id="af-stem-${k}"></textarea>
      <label>Option 0</label><input id="af-opt0-${k}">
      <label>Option 1</label><input id="af-opt1-${k}">
      <label>Option 2</label><input id="af-opt2-${k}">
      <label>Option 3</label><input id="af-opt3-${k}">
      <label>Correct Index (0-3)</label><input id="af-correct-${k}" type="number" min="0" max="3" value="0">
      <label>Explanation</label><textarea id="af-exp-${k}"></textarea>
      <label>Difficulty</label>
      <select id="af-diff-${k}">
        <option value="basic">basic</option>
        <option value="advanced">advanced</option>
      </select>
      <div class="form-actions">
        <button class="btn" onclick="document.getElementById('add-form-${k}').innerHTML=''">Cancel</button>
        <button class="btn btn-primary" onclick="saveAdd(${lecNum},${loNum})">Add</button>
      </div>
    </div>`;
}

function saveAdd(lecNum, loNum) {
  const k = lecNum + "_" + loNum;
  const stem = document.getElementById("af-stem-"+k).value;
  const opts = [0,1,2,3].map(i => document.getElementById("af-opt"+i+"-"+k).value);
  const ci = parseInt(document.getElementById("af-correct-"+k).value);
  const exp = document.getElementById("af-exp-"+k).value;
  const diff = document.getElementById("af-diff-"+k).value;
  if (!stem || opts.some(o => !o) || isNaN(ci)) { alert("All fields required."); return; }
  const arr = state.added[k] || [];
  arr.push([stem, opts, ci, exp, diff]);
  state.added[k] = arr;
  save(KEYS.added, state.added);
  renderMain();
  showToast("Question added.");
}

// =============================================================
// COMMIT / DOWNLOAD
// =============================================================
function buildLiveQuiz() {
  // Build the QUIZ array reflecting edits + additions − deletions
  return QUIZ.map(([n, title, los]) => {
    const newLos = los.map(([loNum, loText, qs]) => {
      const out = [];
      qs.forEach((q, qi) => {
        const k = `${n}_${loNum}_${qi}`;
        if (state.deleted[k]) return;
        out.push(state.edits[k] || q);
      });
      const addKey = `${n}_${loNum}`;
      (state.added[addKey] || []).forEach(q => out.push(q));
      return [loNum, loText, out];
    });
    return [n, title, newLos];
  });
}

function commitChanges() {
  const live = buildLiveQuiz();
  const src = JSON.stringify(live);
  save(KEYS.committed, src);
  showToast("Changes committed — included in next download.");
}

async function downloadChanges() {
  const committed = load(KEYS.committed, null);
  let quizSrc;
  if (committed) {
    quizSrc = committed;
  } else {
    quizSrc = JSON.stringify(buildLiveQuiz());
  }
  // Fetch current file contents
  try {
    const res = await fetch("content.js");
    const html = await res.text();
    const newHtml = html.replace(/\/\/ QUIZ_START\r?\n[\s\S]*?\r?\n\/\/ QUIZ_END/,
      "// QUIZ_START\nconst QUIZ = " + quizSrc + ";\n// QUIZ_END");
    const blob = new Blob([newHtml], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "content.js";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (confirm("File downloaded. Clear local edits, additions, and committed snapshot? (Yes if you'll replace content.js with the download.)")) {
      state.edits = {}; save(KEYS.edits, {});
      state.added = {}; save(KEYS.added, {});
      state.deleted = {}; save(KEYS.deleted, {});
      localStorage.removeItem(KEYS.committed);
      renderMain();
      showToast("Local edits cleared.");
    }
  } catch (e) {
    alert("Couldn't fetch the current file (open via http or file:// with permissions). Error: " + e.message);
  }
}

// =============================================================
// DARK MODE
// =============================================================
function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  save(KEYS.darkmode, state.darkMode);
  document.body.classList.toggle("dark", state.darkMode);
  document.getElementById("btn-theme").textContent = state.darkMode ? "☀️" : "🌙";
}

// =============================================================
// SIDEBAR TOGGLE
// =============================================================
function toggleSidebar() {
  state.rsidebarHidden = !state.rsidebarHidden;
  save(KEYS.rsidebar, state.rsidebarHidden);
  document.getElementById("layout").classList.toggle("no-rsidebar", state.rsidebarHidden);
  document.getElementById("btn-hide-sidebar").textContent = state.rsidebarHidden ? "Show Stats" : "Hide Stats";
}

// =============================================================
// TOAST
// =============================================================
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// =============================================================
// FAST MODE
// =============================================================
const FAST = {
  active: false,
  questions: [],     // array of { key, lecNum, loNum, q }
  pool: [],          // all available (filtered)
  idx: 0,
  score: 0,
  streak: 0,
  lives: 3,
  correctCount: 0,
  answeredCount: 0,
  timer: null,
  timeLeft: 45,
  missed: [],
  config: { count: 20, onlyIncorrect: false, lectureFilter: "all" },
  awaitingNext: false
};

function openFast() {
  document.getElementById("fast-overlay").classList.add("show");
  renderFastStart();
}

function closeFast() {
  if (FAST.timer) { clearInterval(FAST.timer); FAST.timer = null; }
  FAST.active = false;
  document.getElementById("fast-overlay").classList.remove("show");
  document.getElementById("fast-hud").style.display = "none";
  document.getElementById("fast-timer-bar").style.display = "none";
}

function buildFastPool() {
  const pool = [];
  QUIZ.forEach(([n, title, los]) => {
    if (FAST.config.lectureFilter !== "all" && parseInt(FAST.config.lectureFilter) !== n) return;
    los.forEach(([loNum, loText, qs]) => {
      const effective = getEffectiveQuestions(n, loNum);
      effective.forEach(({ key, q }) => {
        if (FAST.config.onlyIncorrect) {
          if (!state.answers[key] || state.answers[key].correct) return;
        }
        pool.push({ key, lecNum: n, lecTitle: title, loNum, q });
      });
    });
  });
  return pool;
}

function renderFastStart() {
  FAST.active = false;
  const body = document.getElementById("fast-body");
  document.getElementById("fast-hud").style.display = "none";
  document.getElementById("fast-timer-bar").style.display = "none";

  // Available pool given config
  const pool = buildFastPool();
  const lectureOptions = QUIZ.map(([n, t]) => `<option value="${n}">Lecture ${n}. ${t}</option>`).join("");
  const incorrectCount = QUIZ.reduce((s, [n, _, los]) => {
    los.forEach(([loNum]) => {
      const qs = getEffectiveQuestions(n, loNum);
      qs.forEach(({ key }) => {
        if (state.answers[key] && !state.answers[key].correct) s++;
      });
    });
    return s;
  }, 0);

  body.innerHTML = `
    <div class="fast-rules">
      <h3>⚡ Fast Mode</h3>
      <ul class="rule-list">
        <li>45 seconds per question</li>
        <li>+1 point per correct answer · +1 bonus per 5-streak</li>
        <li>3 lives · +1 life every 25 correct answers</li>
        <li>Live % Correct shown in the HUD</li>
        <li>You confirm before advancing — no auto-advance</li>
      </ul>

      <div class="fast-config">
        <h4>Configure</h4>

        <div class="config-row">
          <label>Lecture</label>
          <select id="fc-lecture" onchange="onFastConfigChange()">
            <option value="all">All lectures</option>
            ${lectureOptions}
          </select>
        </div>

        <div class="config-row">
          <label>Number of questions</label>
          <input type="number" id="fc-count" min="1" max="500" value="20" onchange="onFastConfigChange()">
        </div>

        <div class="checkbox-row">
          <input type="checkbox" id="fc-only-incorrect" onchange="onFastConfigChange()">
          <label for="fc-only-incorrect">Only show questions I've previously gotten wrong <span style="color:#9b8aa6;font-weight:500;">(${incorrectCount} available)</span></label>
        </div>

        <div style="margin-top:14px;color:#14b8a6;font-size:0.85rem;" id="fc-info">
          ${pool.length} question${pool.length===1?'':'s'} available with these settings.
        </div>
      </div>

      <button class="fast-start-btn" id="fc-start" onclick="startFast()" ${pool.length === 0 ? "disabled" : ""}>
        ${pool.length === 0 ? "No questions available" : "START FAST MODE"}
      </button>

      <p class="fast-confirm-msg">⚡ When you answer, you'll click <strong>Next Question</strong> to advance.</p>
    </div>
  `;
}

function onFastConfigChange() {
  FAST.config.lectureFilter = document.getElementById("fc-lecture").value;
  FAST.config.onlyIncorrect = document.getElementById("fc-only-incorrect").checked;
  FAST.config.count = parseInt(document.getElementById("fc-count").value) || 20;
  const pool = buildFastPool();
  const info = document.getElementById("fc-info");
  if (info) info.textContent = `${pool.length} question${pool.length===1?'':'s'} available with these settings.`;
  const startBtn = document.getElementById("fc-start");
  if (pool.length === 0) {
    startBtn.disabled = true;
    startBtn.textContent = "No questions available";
  } else {
    startBtn.disabled = false;
    startBtn.textContent = "START FAST MODE";
  }
}

function startFast() {
  const pool = buildFastPool();
  if (pool.length === 0) return;
  const want = Math.min(FAST.config.count, pool.length);
  // Shuffle pool
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  FAST.questions = arr.slice(0, want);
  FAST.idx = 0;
  FAST.score = 0;
  FAST.streak = 0;
  FAST.lives = 3;
  FAST.correctCount = 0;
  FAST.answeredCount = 0;
  FAST.missed = [];
  FAST.active = true;
  FAST.awaitingNext = false;
  document.getElementById("fast-hud").style.display = "flex";
  document.getElementById("fast-timer-bar").style.display = "block";
  renderFastQuestion();
}

function updateFastHUD() {
  document.getElementById("fast-score").textContent = FAST.score;
  document.getElementById("fast-streak").textContent = FAST.streak;
  document.getElementById("fast-lives").textContent = FAST.lives <= 0 ? "💀" : "❤️".repeat(FAST.lives);
  const pct = FAST.answeredCount === 0 ? "—" : Math.round(100 * FAST.correctCount / FAST.answeredCount) + "%";
  document.getElementById("fast-pct").textContent = pct;
  document.getElementById("fast-qnum").textContent = (FAST.idx + 1) + " / " + FAST.questions.length;
}

function renderFastQuestion() {
  if (FAST.idx >= FAST.questions.length || FAST.lives <= 0) {
    return endFast();
  }
  FAST.awaitingNext = false;
  updateFastHUD();
  const cur = FAST.questions[FAST.idx];
  const [stem, opts, correctIdx, explanation, diff, imgKey] = cur.q;
  const fastImg = (imgKey && typeof IMAGES !== "undefined" && IMAGES[imgKey])
    ? `<div class="q-image-reveal"><button class="q-image-btn" type="button" onclick="toggleQImage(this)">Show image — will reveal answer</button><div class="fast-image-wrap" style="display:none;"><img class="fast-q-image" src="${IMAGES[imgKey]}" alt="figure"></div></div>` : "";
  const order = shuffleOptions(opts, "fast_" + cur.key + "_" + FAST.idx);
  let optsHtml = "";
  order.forEach(srcIdx => {
    optsHtml += `<button class="fast-option" onclick="fastAnswer(${srcIdx}, ${correctIdx})">${opts[srcIdx]}</button>`;
  });

  document.getElementById("fast-body").innerHTML = `
    <div class="fast-q-meta">Lecture ${cur.lecNum} · LO ${cur.loNum}</div>
    <div class="fast-q">${stem}</div>
    ${fastImg}
    <div class="fast-options" id="fast-opts">${optsHtml}</div>
    <div class="fast-explanation" id="fast-exp"></div>
    <button class="fast-next-btn" id="fast-next" onclick="fastNext()">Next Question →</button>
  `;

  FAST.timeLeft = 45;
  document.getElementById("fast-timer-fill").style.width = "100%";
  document.getElementById("fast-timer-fill").classList.remove("warn");
  if (FAST.timer) clearInterval(FAST.timer);
  FAST.timer = setInterval(() => {
    FAST.timeLeft -= 0.1;
    if (FAST.timeLeft <= 0) {
      clearInterval(FAST.timer);
      FAST.timer = null;
      fastTimeout();
      return;
    }
    const pct = (FAST.timeLeft / 45) * 100;
    document.getElementById("fast-timer-fill").style.width = pct + "%";
    if (FAST.timeLeft <= 10) {
      document.getElementById("fast-timer-fill").classList.add("warn");
    }
  }, 100);
}

function fastAnswer(picked, correctIdx) {
  if (FAST.awaitingNext) return;
  if (FAST.timer) { clearInterval(FAST.timer); FAST.timer = null; }
  FAST.awaitingNext = true;
  const cur = FAST.questions[FAST.idx];
  const [stem, opts, _, explanation] = cur.q;
  const correct = picked === correctIdx;

  // Disable all options + paint
  const optEls = document.querySelectorAll(".fast-option");
  optEls.forEach((el, i) => {
    el.classList.add("locked");
    el.onclick = null;
  });
  // Find positions based on order
  document.querySelectorAll(".fast-option").forEach(el => {
    el.classList.add("dim");
  });
  // Mark correct + picked
  const allBtns = Array.from(document.querySelectorAll(".fast-option"));
  // Re-derive: options were rendered in shuffled order, but the onclick passed srcIdx
  // We need to look up by text match (safer)
  allBtns.forEach(el => {
    const txt = el.textContent;
    if (txt === opts[correctIdx]) { el.classList.remove("dim"); el.classList.add("correct"); }
    if (!correct && txt === opts[picked]) { el.classList.remove("dim"); el.classList.add("wrong"); }
  });

  FAST.answeredCount += 1;
  if (correct) {
    FAST.score += 1;
    FAST.correctCount += 1;
    FAST.streak += 1;
    if (FAST.streak > 0 && FAST.streak % 5 === 0) {
      FAST.score += 1;
      burst("+1 BONUS!");
    }
    if (FAST.correctCount > 0 && FAST.correctCount % 25 === 0) {
      FAST.lives += 1;
      setTimeout(() => burst("❤️ EXTRA LIFE!"), 600);
    }
  } else {
    FAST.streak = 0;
    FAST.lives -= 1;
    FAST.missed.push({ ...cur, picked, correctIdx, timedOut: false });
  }
  updateFastHUD();

  const expBox = document.getElementById("fast-exp");
  expBox.innerHTML = `<strong>${correct ? "✓ Correct." : "✗ Not quite."}</strong> ${explanation}`;
  expBox.classList.add("show");
  document.getElementById("fast-next").classList.add("show");

  if (FAST.lives <= 0) {
    document.getElementById("fast-next").textContent = "View Results →";
  } else if (FAST.idx + 1 >= FAST.questions.length) {
    document.getElementById("fast-next").textContent = "View Results →";
  }
}

function fastTimeout() {
  if (FAST.awaitingNext) return;
  FAST.awaitingNext = true;
  const cur = FAST.questions[FAST.idx];
  const [stem, opts, correctIdx, explanation] = cur.q;
  document.querySelectorAll(".fast-option").forEach(el => {
    el.classList.add("locked", "dim");
    el.onclick = null;
    if (el.textContent === opts[correctIdx]) { el.classList.remove("dim"); el.classList.add("correct"); }
  });
  FAST.answeredCount += 1;
  FAST.streak = 0;
  FAST.lives -= 1;
  FAST.missed.push({ ...cur, picked: -1, correctIdx, timedOut: true });
  updateFastHUD();
  const expBox = document.getElementById("fast-exp");
  expBox.innerHTML = `<strong>⏰ Time's up.</strong> ${explanation}`;
  expBox.classList.add("show");
  document.getElementById("fast-next").classList.add("show");
  if (FAST.lives <= 0) document.getElementById("fast-next").textContent = "View Results →";
  else if (FAST.idx + 1 >= FAST.questions.length) document.getElementById("fast-next").textContent = "View Results →";
}

function fastNext() {
  FAST.idx += 1;
  renderFastQuestion();
}

function endFast() {
  if (FAST.timer) { clearInterval(FAST.timer); FAST.timer = null; }
  if (FAST.answeredCount > 0) { awardBadge("speed_demon"); addXP(FAST.correctCount * 2); }
  document.getElementById("fast-timer-bar").style.display = "none";
  document.getElementById("fast-hud").style.display = "flex";
  const pct = FAST.answeredCount === 0 ? 0 : Math.round(100 * FAST.correctCount / FAST.answeredCount);
  const msg = FAST.lives <= 0 ? "💀 Game Over" : "✅ Round Complete";
  document.getElementById("fast-body").innerHTML = `
    <div class="fast-game-over">
      <h2>${msg}</h2>
      <div class="fast-final-stats">
        <div class="stat"><div class="stat-val">${FAST.score}</div><div class="stat-label">Score</div></div>
        <div class="stat"><div class="stat-val">${FAST.answeredCount}</div><div class="stat-label">Answered</div></div>
        <div class="stat"><div class="stat-val">${FAST.correctCount}</div><div class="stat-label">Correct</div></div>
        <div class="stat"><div class="stat-val">${pct}%</div><div class="stat-label">Accuracy</div></div>
      </div>
      <div class="button-row">
        <button class="btn-play-again" onclick="renderFastStart()">PLAY AGAIN</button>
        ${FAST.missed.length > 0 ? `<button class="btn-review-missed" onclick="renderFastMissed()">REVIEW MISSED (${FAST.missed.length})</button>` : ""}
        <button class="btn-back" onclick="closeFast()">Back to Quiz</button>
      </div>
    </div>
  `;
}

function renderFastMissed() {
  let html = `<div class="fast-missed-list">
    <h2 style="color:#ec4899;font-size:1.7rem;font-weight:800;text-align:center;margin-bottom:8px">⚡ MISSED QUESTIONS</h2>
    <div style="text-align:center;color:#14b8a6;margin-bottom:20px;font-size:0.88rem">${FAST.missed.length} question${FAST.missed.length===1?'':'s'} missed</div>`;
  FAST.missed.forEach((m, i) => {
    const [stem, opts, correctIdx, explanation] = m.q;
    let optsHtml = "";
    opts.forEach((opt, idx) => {
      let cls = "fast-option locked dim";
      if (idx === correctIdx) cls = "fast-option locked correct";
      else if (idx === m.picked) cls = "fast-option locked wrong";
      optsHtml += `<div class="${cls}" style="cursor:default">${opt}</div>`;
    });
    html += `<div class="fast-missed-card">
      <div class="fast-missed-meta">Q${i+1} · Lecture ${m.lecNum}. ${m.lecTitle} · LO ${m.loNum}${m.timedOut ? ' · ⏰ TIMED OUT' : ''}</div>
      <div style="margin-bottom:12px;font-size:1.02rem">${stem}</div>
      <div class="fast-options" style="margin-bottom:12px">${optsHtml}</div>
      <div class="fast-explanation show" style="margin-top:0">${explanation}</div>
    </div>`;
  });
  html += `<div class="button-row" style="display:flex;justify-content:center;gap:12px;margin-top:24px;flex-wrap:wrap">
    <button class="btn-back" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:#fef2f3;padding:12px 24px;border-radius:10px;cursor:pointer;font-weight:700;font-family:inherit" onclick="endFast()">BACK TO STATS</button>
    <button class="btn-back" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:#fef2f3;padding:12px 24px;border-radius:10px;cursor:pointer;font-weight:700;font-family:inherit" onclick="closeFast()">Close Fast Mode</button>
  </div></div>`;
  document.getElementById("fast-body").innerHTML = html;
}

function burst(text) {
  const el = document.createElement("div");
  el.className = "fast-burst";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// =============================================================
// CONCEPT TRACKING + READING PROGRESS
// =============================================================
function lectureConceptKeys(n){
  const c = (typeof LECTURE_CONTENT!=="undefined") ? LECTURE_CONTENT[n] : null;
  if(!c) return [];
  const keys=[];
  (c.mustKnows||[]).forEach((m,i)=>keys.push(`${n}_mk_${i}`));
  (c.los||[]).forEach(lo=>(lo.blocks||[]).forEach((b,bi)=>keys.push(`${n}_${lo.id}_${bi}`)));
  return keys;
}
// reveal items (ClaudeCompares rows + ReClaude prompts) drive reading progress
function lectureRevealKeys(n){
  const c=(typeof LECTURE_CONTENT!=="undefined")?LECTURE_CONTENT[n]:null; if(!c) return [];
  const keys=[];
  (c.los||[]).forEach(lo=>(lo.blocks||[]).forEach((b,bi)=>{
    if(b.t==="cq") cqItems(b.x).forEach((_,ii)=>keys.push(`${n}_${lo.id}_cc${bi}_${ii}`));
    else if(b.t==="q") keys.push(`${n}_${lo.id}_q${bi}`);
  }));
  return keys;
}
function lectureReadingStats(n){
  const keys=lectureRevealKeys(n);
  const done=keys.filter(k=>state.cqReveal[k]).length;
  return {total:keys.length, done, pct: keys.length?Math.round(100*done/keys.length):0};
}
function updateReadingProgress(){
  const rs=lectureReadingStats(state.currentLec);
  const f=document.getElementById("reading-prog-fill"); if(f) f.style.width=rs.pct+"%";
  const t=document.getElementById("reading-prog-txt"); if(t) t.textContent=rs.total?`${rs.done}/${rs.total} revealed`:`Read through`;
}
function toggleConceptDone(key, el){
  const card=el.closest(".cc");
  if(state.conceptDone[key]){ delete state.conceptDone[key]; }
  else { state.conceptDone[key]=true; addXP(2); }
  save(KEYS.conceptDone, state.conceptDone);
  const on=!!state.conceptDone[key];
  el.classList.toggle("on", on); if(card) card.classList.toggle("cc-done", on);
  updateReadingProgress();
  const n=state.currentLec, rs=lectureReadingStats(n);
  if(rs.total>0 && rs.done===rs.total){ if(!state.read[n]) burstXP("📖 Lecture read! +20 XP"); markRead(n); checkMastery(n); renderSidebar(); }
}
function toggleConceptFlag(key, el){
  if(state.conceptFlag[key]) delete state.conceptFlag[key]; else state.conceptFlag[key]=true;
  save(KEYS.conceptFlag, state.conceptFlag);
  const on=!!state.conceptFlag[key];
  el.classList.toggle("on", on); const card=el.closest(".cc"); if(card) card.classList.toggle("cc-flagged", on);
}
function toggleRecall(){ state.recallMode=!state.recallMode; save(KEYS.recall, state.recallMode); renderMain(); }

// =============================================================
// SLIDES VIEWER + LIGHTBOX
// =============================================================
function slidesPanelHTML(n){
  const s=(typeof SLIDES!=="undefined")?SLIDES[n]:null;
  if(!s) return "";
  return `<div class="slides-panel">
    <button class="slides-toggle" onclick="toggleSlides(this, ${n})">📑 Lecture slides <span class="slides-count">${s.count}</span><span class="chev">▾</span></button>
    <div class="slides-strip" id="slides-strip-${n}" style="display:none"></div>
  </div>`;
}
function toggleSlides(btn, n){
  const strip=document.getElementById("slides-strip-"+n); const s=SLIDES[n];
  const open = strip.style.display==="none" || !strip.style.display;
  if(open && !strip.dataset.loaded){
    let h="";
    for(let i=1;i<=s.count;i++){ const num=String(i).padStart(2,"0");
      h+=`<img class="slide-thumb" loading="lazy" src="slides/${s.dir}/${num}.jpg" alt="slide ${i}" onclick="openLightbox('${s.dir}',${s.count},${i})">`; }
    strip.innerHTML=h; strip.dataset.loaded="1";
  }
  strip.style.display=open?"flex":"none"; btn.classList.toggle("open", open);
}
const LB={dir:null,count:0,idx:1};
function openLightbox(dir,count,idx){ LB.dir=dir; LB.count=count; LB.idx=idx; document.getElementById("lightbox").classList.add("show"); lbShow(); }
function lbShow(){ const num=String(LB.idx).padStart(2,"0"); document.getElementById("lb-img").src=`slides/${LB.dir}/${num}.jpg`; document.getElementById("lb-counter").textContent=`${LB.idx} / ${LB.count}`; }
function lbStep(d){ LB.idx=Math.max(1,Math.min(LB.count,LB.idx+d)); lbShow(); }
function closeLightbox(){ document.getElementById("lightbox").classList.remove("show"); }

// =============================================================
// TEXT-TO-SPEECH (listen mode) — mini audio player with seek
// =============================================================
let TTS = { on:false, playing:false, chunks:[], durs:[], cum:[], total:0, idx:0, lec:null, voice:null, tickStart:0, timer:null };
const TTS_CPS = 14.5; // approx chars/sec spoken at rate 0.95 (for the time bar)
// expand abbreviations + symbols so the voice reads naturally, not like code
const SAY = [
  [/→|->/g, " leads to "], [/[⇄↔]/g, " versus "], [/&/g, " and "],
  [/\bvs\.?\b/gi, "versus"], [/\bGI\b/g, "G I"], [/\bGERD\b/g, "gerd"],
  [/\bLES\b/g, "lower esophageal sphincter"], [/\bUES\b/g, "upper esophageal sphincter"],
  [/\bENS\b/g, "enteric nervous system"], [/\bPNS\b/g, "parasympathetic nervous system"],
  [/\bSNS\b/g, "sympathetic nervous system"], [/\bCCK\b/g, "cholecystokinin"],
  [/\bVIP\b/g, "V I P"], [/\bPPI\b/g, "proton pump inhibitor"], [/\bPUD\b/g, "peptic ulcer disease"],
  [/\bIDA\b/g, "iron deficiency anemia"], [/\bIBS\b/g, "I B S"], [/\bIBD\b/g, "I B D"],
  [/\bSCC\b/g, "squamous cell carcinoma"], [/\bNO\b/g, "nitric oxide"], [/\be\.g\.\,?/gi, "for example,"],
  [/\bi\.e\.\,?/gi, "that is,"]
];
function cleanForSpeech(t){
  t = String(t||"");
  SAY.forEach(([re, rep]) => t = t.replace(re, rep));
  t = t.replace(/\([^)]{0,40}\)/g, m => " " + m.slice(1,-1) + " "); // drop parens, keep words
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
function ttsChunks(n){
  const c=(typeof LECTURE_CONTENT!=="undefined")?LECTURE_CONTENT[n]:null; if(!c) return [];
  const lec=getLecture(n);
  const out=[];
  if(lec) out.push(`Lecture ${n}. ${lec[1]}.`);
  if(c.tldr) out.push(cleanForSpeech(c.tldr));
  if((c.mustKnows||[]).length){ out.push("Here are the key things to know."); (c.mustKnows||[]).forEach(m=>out.push(cleanForSpeech(m))); }
  getChapters(n).forEach(ch=>{
    if(ch.title) out.push(`Next. ${cleanForSpeech(ch.title)}.`);
    ch.los.forEach(id=>{ const lo=loById(n,id); if(!lo) return;
      (lo.blocks||[]).forEach(b=>{ if((b.t==="p"||b.t==="key"||b.t==="pearl") && !/^ReClaude A\s*:/.test(b.x)) out.push(cleanForSpeech(b.x)); });
    });
  });
  // split into sentence-sized utterances for natural pacing
  const chunks=[];
  out.join(" ").split(/(?<=[.!?])\s+/).forEach(s=>{ s=s.trim(); if(s) chunks.push(s); });
  return chunks;
}
function pickVoice(){
  if(!("speechSynthesis" in window)) return null;
  const vs=speechSynthesis.getVoices().filter(v=>/^en[-_]/i.test(v.lang));
  if(!vs.length) return null;
  const byName=n=>vs.find(v=>v.name.toLowerCase().includes(n));
  return vs.find(v=>/premium|enhanced/i.test(v.name))   // best: downloaded premium voices
      || byName("ava") || byName("samantha") || byName("allison") || byName("zoe")
      || byName("joelle") || byName("tom") || byName("daniel")
      || vs.find(v=>v.lang==="en-US") || vs[0];
}
function fmtTime(s){ s=Math.max(0,Math.round(s)); const m=Math.floor(s/60); return m + ":" + String(s%60).padStart(2,"0"); }
function ttsBuild(n){
  const chunks = ttsChunks(n);
  const durs = chunks.map(c => Math.max(1.0, c.length / TTS_CPS));
  const cum = [0]; durs.forEach(d => cum.push(cum[cum.length-1] + d));
  TTS.chunks = chunks; TTS.durs = durs; TTS.cum = cum; TTS.total = cum[cum.length-1]; TTS.lec = n;
}
function ttsSpeakCurrent(){
  if(!("speechSynthesis" in window)) return;
  if(!TTS.playing || TTS.idx >= TTS.chunks.length){ if(TTS.idx >= TTS.chunks.length) ttsEnd(); return; }
  const u = new SpeechSynthesisUtterance(TTS.chunks[TTS.idx]);
  if(TTS.voice) u.voice = TTS.voice; u.rate = 0.95; u.pitch = 1.0;
  u.onend = () => { if(TTS.playing){ TTS.idx++; TTS.tickStart = performance.now(); ttsSpeakCurrent(); ttsRenderPlayer(); } };
  u.onerror = () => {};
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  TTS.tickStart = performance.now();
}
function ttsStartTicker(){ if(TTS.timer) return; TTS.timer = setInterval(ttsTick, 200); }
function ttsStopTicker(){ if(TTS.timer){ clearInterval(TTS.timer); TTS.timer = null; } }
function ttsTick(){ if(!TTS.playing) return; ttsRenderPlayer(); }
function ttsCurTime(){
  let t = TTS.cum[TTS.idx] || 0;
  if(TTS.playing) t += Math.min((performance.now() - TTS.tickStart)/1000, TTS.durs[TTS.idx] || 0);
  return Math.min(t, TTS.total);
}
function ttsRenderPlayer(){
  const fill = document.getElementById("ap-fill"), dot = document.getElementById("ap-dot");
  const cur = document.getElementById("ap-cur"), tot = document.getElementById("ap-tot");
  if(!fill) return;
  const t = ttsCurTime(), pct = TTS.total ? (t/TTS.total*100) : 0;
  fill.style.width = pct + "%"; if(dot) dot.style.left = pct + "%";
  if(cur) cur.textContent = fmtTime(t); if(tot) tot.textContent = fmtTime(TTS.total);
  const pb = document.getElementById("ap-play"); if(pb) pb.textContent = TTS.playing ? "⏸" : "▶";
}
function showPlayer(on){ const p = document.getElementById("aplayer"); if(p) p.classList.toggle("show", on); }
function ttsPlayBtnLabel(){ const b=document.getElementById("tts-btn"); if(b){ b.classList.toggle("on", TTS.on); b.innerHTML = TTS.on ? "🔊 Playing" : "🔊 Listen"; } }

function startTTS(){
  if(!("speechSynthesis" in window)){ showToast("Speech not supported here"); return; }
  if(TTS.lec !== state.currentLec || !TTS.chunks.length){ ttsBuild(state.currentLec); TTS.idx = 0; }
  if(!TTS.chunks.length){ showToast("Nothing to read here"); return; }
  TTS.voice = pickVoice();
  TTS.on = true; TTS.playing = true;
  showPlayer(true); ttsPlayBtnLabel(); ttsStartTicker();
  const go = () => { TTS.voice = pickVoice(); ttsSpeakCurrent(); ttsRenderPlayer(); };
  if(speechSynthesis.getVoices().length){ go(); }
  else { speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; if(TTS.playing) go(); }; setTimeout(()=>{ if(TTS.playing && !speechSynthesis.speaking) go(); }, 250); }
}
function ttsPause(){ TTS.playing = false; if("speechSynthesis" in window) window.speechSynthesis.cancel(); ttsStopTicker(); ttsRenderPlayer(); ttsPlayBtnLabel(); }
function ttsResume(){ if(!TTS.chunks.length){ startTTS(); return; } TTS.playing = true; ttsStartTicker(); ttsSpeakCurrent(); ttsRenderPlayer(); ttsPlayBtnLabel(); }
function ttsPlayPause(){ if(TTS.playing) ttsPause(); else ttsResume(); }
function toggleTTS(){ if(!TTS.on){ startTTS(); } else { ttsPlayPause(); } }   // Listen button
function ttsEnd(){ ttsStop(); }
function stopTTS(){ TTS.on = false; TTS.playing = false; if("speechSynthesis" in window) window.speechSynthesis.cancel(); ttsStopTicker(); showPlayer(false); ttsPlayBtnLabel(); }
function ttsSeekTime(t){
  t = Math.max(0, Math.min(TTS.total, t));
  let i = 0; while(i < TTS.chunks.length && TTS.cum[i+1] <= t) i++;
  TTS.idx = Math.min(i, TTS.chunks.length-1); TTS.tickStart = performance.now();
  if(TTS.playing) ttsSpeakCurrent();
  ttsRenderPlayer();
}
function ttsSkip(delta){ ttsSeekTime(ttsCurTime() + delta); }
function ttsBarClick(e){
  const bar = document.getElementById("ap-bar"); if(!bar) return;
  const r = bar.getBoundingClientRect();
  ttsSeekTime(((e.clientX - r.left)/r.width) * TTS.total);
}

// =============================================================
// DASHBOARD (home) + DRAWER + RANK CHIP
// =============================================================
function goHome(){ stopTTS(); state.viewMode="dashboard"; state.markupsMode=null; state.reviewIncorrectMode=state.reviewFlaggedMode=state.reviewConceptsMode=false; updateReviewButtons(); renderMain(); renderSidebar(); renderRSidebar(); window.scrollTo({top:0,behavior:"smooth"}); }
function renderDashboard(){
  const main=document.getElementById("main");
  showTray(false); hideAnnoPopup();
  const rk=rankFor(state.xp); const o=overallStats();
  const bm=mostRecentBookmark();
  const readCount=Object.keys(state.read).filter(k=>state.read[k]).length;
  const masterCount=QUIZ.filter(L=>lectureMastered(L[0])).length;
  const acc=o.answered?Math.round(100*o.correct/o.answered):0;
  const goal=20, todayN=dailyCount(), goalPct=Math.min(100,Math.round(100*todayN/goal));
  const last=state.currentLec;
  let tiles="";
  QUIZ.forEach(([n,title])=>{
    const s=lectureStats(n); const rsd=lectureReadingStats(n);
    const status=lectureMastered(n)?"master":(state.read[n]?"read":((s.answered>0||rsd.done>0)?"started":"new"));
    const pct=s.total?Math.round(100*s.answered/s.total):0;
    const icon=status==="master"?"★":(status==="read"?"✓":"");
    tiles+=`<button class="map-tile map-${status}" onclick="goToLec(${n})">
      <div class="map-top"><span class="map-num">${n}</span>${icon?`<span class="map-icon">${icon}</span>`:""}</div>
      <div class="map-title">${esc(title)}</div>
      <div class="map-bar"><div class="map-bar-fill" style="width:${pct}%"></div></div></button>`;
  });
  main.innerHTML=`<div class="dash">
    <div class="dash-hero">
      <div class="rank-ring" style="--p:${rk.pct}"><div class="rank-ring-inner"><span class="rank-ring-icon">${rk.cur.icon}</span></div></div>
      <div class="dash-hero-info">
        <div class="dash-greeting">Welcome back 👋</div>
        <div class="dash-rank">${rk.cur.name}</div>
        <div class="dash-xp">${state.xp} XP ${rk.next?`· <b>${rk.next.min-state.xp}</b> to ${rk.next.name}`:"· max rank 👑"}</div>
        <button class="btn-continue" onclick="goToLec(${last})">▶ Continue · Lecture ${last}</button>
      </div>
    </div>
    <div class="dash-stats">
      <div class="dstat"><div class="dstat-num">${readCount}<span>/30</span></div><div class="dstat-lab">📖 Read</div></div>
      <div class="dstat"><div class="dstat-num">${masterCount}<span>/30</span></div><div class="dstat-lab">★ Mastered</div></div>
      <div class="dstat"><div class="dstat-num">${o.answered}</div><div class="dstat-lab">Answered</div></div>
      <div class="dstat"><div class="dstat-num">${o.answered?acc+"%":"—"}</div><div class="dstat-lab">Accuracy</div></div>
      <div class="dstat"><div class="dstat-num">${state.streakData.current} 🔥</div><div class="dstat-lab">Streak</div></div>
    </div>
    <div class="dash-goal">
      <div class="dash-goal-top"><span>🎯 Daily goal</span><span>${todayN}/${goal} questions</span></div>
      <div class="dash-goal-bar"><div class="dash-goal-fill" style="width:${goalPct}%"></div></div>
    </div>
    ${bm ? `<button class="dash-resume" onclick="resumeReading(${bm.lec})">
      <span class="dash-resume-ic">🔖</span>
      <span class="dash-resume-tx"><b>Pick up where you left off</b><span>Lecture ${bm.lec}${bm.label?` · ${esc(bm.label).slice(0,60)}`:""}</span></span>
      <span class="dash-resume-go">Resume →</span></button>` : ""}
    <h3 class="dash-h">Lectures</h3>
    <div class="map-grid">${tiles}</div>
  </div>`;
}
function openDrawer(){ renderRSidebar(); document.getElementById("drawer").classList.add("open"); document.getElementById("drawer-scrim").classList.add("show"); }
function closeDrawer(){ document.getElementById("drawer").classList.remove("open"); document.getElementById("drawer-scrim").classList.remove("show"); }
function toggleMoreMenu(){ document.getElementById("more-menu").classList.toggle("show"); }
function updateRankChip(){
  const chip=document.getElementById("rank-chip"); if(!chip) return;
  const rk=rankFor(state.xp);
  chip.innerHTML=`<span class="rc-ico">${rk.cur.icon}</span><span class="rc-meta"><span class="rc-name">${rk.cur.name}</span><span class="rc-xp">${state.xp} XP</span></span>`;
}

// =============================================================
// REVIEW FLAGGED CONCEPTS
// =============================================================
function conceptByKey(key){
  const p=key.split("_"); const n=parseInt(p[0]);
  const c=(typeof LECTURE_CONTENT!=="undefined")?LECTURE_CONTENT[n]:null; if(!c) return null;
  if(p[1]==="mk"){ const m=(c.mustKnows||[])[parseInt(p[2])]; return m?{t:"cq",x:m}:null; }
  const lo=(c.los||[]).find(l=>l.id===parseInt(p[1])); if(!lo) return null;
  return (lo.blocks||[])[parseInt(p[2])]||null;
}
function toggleReviewConcepts(){
  state.reviewConceptsMode=!state.reviewConceptsMode;
  state.reviewIncorrectMode=state.reviewFlaggedMode=false;
  const mm=document.getElementById("more-menu"); if(mm) mm.classList.remove("show");
  updateReviewButtons(); renderMain();
}
function renderReviewConcepts(){
  const main=document.getElementById("main");
  const keys=Object.keys(state.conceptFlag).filter(k=>state.conceptFlag[k]);
  if(!keys.length){ main.innerHTML=`<div class="review-banner"><div><h2>🚩 Flagged Concepts</h2><div class="review-sub">No flagged concepts yet.</div></div><button onclick="toggleReviewConcepts()">Exit</button></div><div class="empty-state"><div class="icon">🚩</div><h3>Nothing flagged</h3><p>Tap 🚩 on any concept card while reading to save it here.</p></div>`; return; }
  const byLec={}; keys.forEach(k=>{ const n=parseInt(k.split("_")[0]); (byLec[n]=byLec[n]||[]).push(k); });
  let html=`<div class="review-banner"><div><h2>🚩 Flagged Concepts</h2><div class="review-sub">${keys.length} saved for review</div></div><button onclick="toggleReviewConcepts()">Exit</button></div>`;
  Object.keys(byLec).map(Number).sort((a,b)=>a-b).forEach(n=>{
    const lec=getLecture(n);
    html+=`<h3 class="review-lec-header">Lecture ${n}. ${lec?esc(lec[1]):""}</h3><div class="cc-grid">`;
    byLec[n].forEach(k=>{ const b=conceptByKey(k); if(b) html+=conceptCardHTML(b,k); });
    html+=`</div>`;
  });
  main.innerHTML=html;
}

// =============================================================
// CONCEPT DIAGRAMS (signature visuals)
// =============================================================
const DIAGRAMS = {
  "1_1": `<svg viewBox="0 0 520 116" class="dgm" preserveAspectRatio="xMidYMid meet">
    <rect class="dgm-box" x="8" y="22" width="232" height="72" rx="11"/>
    <text class="dgm-t" x="124" y="52" text-anchor="middle">Submucosal · Meissner</text>
    <text class="dgm-s" x="124" y="76" text-anchor="middle">→ Secretion</text>
    <rect class="dgm-box dgm-box2" x="280" y="22" width="232" height="72" rx="11"/>
    <text class="dgm-t" x="396" y="52" text-anchor="middle">Myenteric · Auerbach</text>
    <text class="dgm-s" x="396" y="76" text-anchor="middle">→ Motility</text></svg>`,
  "1_2": `<svg viewBox="0 0 580 96" class="dgm" preserveAspectRatio="xMidYMid meet">
    <rect class="dgm-box" x="6" y="34" width="108" height="40" rx="8"/><text class="dgm-t" x="60" y="59" text-anchor="middle">Normal</text>
    <rect class="dgm-box" x="156" y="34" width="108" height="40" rx="8"/><text class="dgm-t" x="210" y="59" text-anchor="middle">Metaplasia</text>
    <rect class="dgm-box" x="306" y="34" width="108" height="40" rx="8"/><text class="dgm-t" x="360" y="59" text-anchor="middle">Dysplasia</text>
    <rect class="dgm-box dgm-box-bad" x="456" y="34" width="118" height="40" rx="8"/><text class="dgm-t" x="515" y="59" text-anchor="middle">Carcinoma</text>
    <line class="dgm-arrow" x1="116" y1="54" x2="154" y2="54"/><line class="dgm-arrow" x1="266" y1="54" x2="304" y2="54"/><line class="dgm-arrow dgm-arrow-bad" x1="416" y1="54" x2="454" y2="54"/>
    <text class="dgm-cap dgm-good" x="135" y="26" text-anchor="middle">reversible</text>
    <text class="dgm-cap dgm-good" x="285" y="26" text-anchor="middle">reversible</text>
    <text class="dgm-cap dgm-bad" x="435" y="26" text-anchor="middle">irreversible</text></svg>`
};

// =============================================================
// ANNOTATIONS — highlight + ⚠️ review + ⭐ important (text),
// 🔖 bookmark (resume), draggable tray (chapter-level), review pages
// =============================================================
const ANNO_META = {
  highlight: { cls:"hl",  icon:"🖊️", label:"Highlight" },
  review:    { cls:"rev", icon:"⚠️", label:"To review" },
  important: { cls:"imp", icon:"⭐", label:"Important" }
};
function annoId(){ return "a" + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36); }

// ---- selection popup ----
let _selRange = null;
function readingHasSel(sel){
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return false;
  const r = document.getElementById("reading");
  return r && sel.anchorNode && sel.focusNode && r.contains(sel.anchorNode) && r.contains(sel.focusNode);
}
function onReadingSelect(){
  const sel = window.getSelection();
  if (!readingHasSel(sel)) { hideAnnoPopup(); return; }
  _selRange = sel.getRangeAt(0).cloneRange();
  const rect = _selRange.getBoundingClientRect();
  const p = document.getElementById("anno-popup"); if (!p) return;
  p.style.display = "flex";
  const pw = p.offsetWidth || 168;
  let left = window.scrollX + rect.left + rect.width/2 - pw/2;
  left = Math.max(8, Math.min(left, window.scrollX + window.innerWidth - pw - 8));
  p.style.top  = (window.scrollY + rect.top - p.offsetHeight - 8) + "px";
  p.style.left = left + "px";
}
function hideAnnoPopup(){ const p = document.getElementById("anno-popup"); if (p) p.style.display = "none"; }

function chapterIndexOfNode(node){
  let el = node && node.nodeType === 3 ? node.parentElement : node;
  const ch = el && el.closest ? el.closest(".rc-chapter") : null;
  if (ch && ch.id){ const m = ch.id.match(/ch-\d+-(\d+)/); if (m) return parseInt(m[1]); }
  return 0;
}
function wrapRange(range, cls, id){
  const span = document.createElement("mark");
  span.className = "anno anno-" + cls; span.dataset.annoId = id;
  try { range.surroundContents(span); return true; }
  catch(e){
    try { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span); return true; }
    catch(e2){ return false; }
  }
}
function annoFromSelection(type){
  const n = state.currentLec;
  if (!_selRange) { hideAnnoPopup(); return; }
  const ci = chapterIndexOfNode(_selRange.startContainer);
  const text = _selRange.toString().trim().replace(/\s+/g, " ");
  if (type === "bookmark"){ setBookmark(n, ci, text); cleanupSelection(); return; }
  const id = annoId();
  wrapRange(_selRange, ANNO_META[type].cls, id);
  (state.hl[n] = state.hl[n] || []).push({ id, ci, text, type });
  save(KEYS.hl, state.hl);
  showToast(ANNO_META[type].icon + " " + ANNO_META[type].label + " saved");
  updateMarkupCount(); refreshNotesIfOpen();
  cleanupSelection();
}
function cleanupSelection(){ hideAnnoPopup(); const s = window.getSelection(); if (s) s.removeAllRanges(); _selRange = null; }

// ---- re-apply stored highlights after a render ----
function reapplyAnnotations(n){
  (state.hl[n] || []).forEach(a => {
    const ch = document.getElementById(`ch-${n}-${a.ci}`); if (!ch) return;
    highlightFirstOccurrence(ch, a.text, ANNO_META[a.type].cls, a.id);
  });
}
function highlightFirstOccurrence(container, text, cls, id){
  if (!text) return false;
  const tw = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = tw.nextNode())){
    if (node.parentElement && node.parentElement.closest(".anno")) continue;
    const idx = node.nodeValue.indexOf(text);
    if (idx >= 0){
      const range = document.createRange();
      range.setStart(node, idx); range.setEnd(node, idx + text.length);
      wrapRange(range, cls, id);
      return true;
    }
  }
  return false;
}
// click an existing highlight to remove it
function onReadingClick(e){
  const m = e.target.closest && e.target.closest(".anno");
  if (!m) return;
  const id = m.dataset.annoId, n = state.currentLec;
  state.hl[n] = (state.hl[n] || []).filter(a => a.id !== id);
  save(KEYS.hl, state.hl);
  const parent = m.parentNode;
  while (m.firstChild) parent.insertBefore(m.firstChild, m);
  parent.removeChild(m); parent.normalize();
  updateMarkupCount(); refreshNotesIfOpen(); showToast("Removed");
}

// ---- bookmarks (resume) ----
function setBookmark(n, ci, label){
  state.bookmarks[n] = { ci, label: (label || "").slice(0, 90), ts: Date.now() };
  save(KEYS.bookmarks, state.bookmarks);
  renderChapterBadges(n);
  showToast("🔖 Bookmarked — your spot is saved");
  updateMarkupCount();
}
function mostRecentBookmark(){
  let best = null;
  Object.keys(state.bookmarks).forEach(k => { const b = state.bookmarks[k]; if (b && (!best || b.ts > best.ts)) best = Object.assign({ lec: parseInt(k) }, b); });
  return best;
}
function resumeReading(lec){
  const b = lec != null ? Object.assign({ lec }, state.bookmarks[lec]) : mostRecentBookmark();
  if (!b || b.ci == null) return;
  goToLec(b.lec); setView("learn");
  setTimeout(() => { const el = document.getElementById(`ch-${b.lec}-${b.ci}`); if (el) el.scrollIntoView({ behavior:"smooth", block:"start" }); }, 80);
}

// ---- chapter-level tags (from draggable tray) ----
// ---- per-paragraph tags (drag a chip onto a paragraph) ----
function tagParagraph(type, el, n){
  const pb = el.getAttribute("data-pb"); if (!pb) return;
  const ci = chapterIndexOfNode(el);
  const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (type === "bookmark"){ setBookmark(n, ci, text); applyParaTags(n); return; }
  const store = type === "review" ? state.markReview : state.markStar;
  if (store[pb]) delete store[pb]; else store[pb] = { lec:n, pb, ci, text };
  save(type === "review" ? KEYS.markReview : KEYS.markStar, store);
  applyParaTags(n); updateMarkupCount(); refreshNotesIfOpen();
  showToast(ANNO_META[type].icon + " " + ANNO_META[type].label + (store[pb] ? " saved" : " removed"));
}
function removeParaTag(type, pb){
  const store = type === "review" ? state.markReview : state.markStar;
  delete store[pb]; save(type === "review" ? KEYS.markReview : KEYS.markStar, store);
  applyParaTags(state.currentLec); updateMarkupCount(); refreshNotesIfOpen(); showToast("Removed");
}
function applyParaTags(n){
  document.querySelectorAll("#reading [data-pb]").forEach(el => {
    el.classList.remove("pb-review", "pb-important");
    el.querySelectorAll(".pb-remove").forEach(x => x.remove());
  });
  const paint = (store, cls, type, icon) => {
    Object.keys(store).forEach(pb => {
      const t = store[pb]; if (t.lec !== n) return;
      const el = document.querySelector(`#reading [data-pb="${pb}"]`); if (!el) return;
      el.classList.add(cls);
      const b = document.createElement("button");
      b.className = "pb-remove " + type; b.textContent = icon; b.title = "Click to remove";
      b.onclick = (e) => { e.stopPropagation(); removeParaTag(type, pb); };
      el.appendChild(b);
    });
  };
  paint(state.markStar, "pb-important", "important", "⭐");
  paint(state.markReview, "pb-review", "review", "⚠️");
}
// kept for any old callers
function renderChapterBadges(n){ applyParaTags(n); }

// ---- draggable tray ----
function showTray(on){ const t = document.getElementById("anno-tray"); if (t) t.style.display = on ? "flex" : "none"; }
function bindReadingAnnotations(n){
  const r = document.getElementById("reading"); if (!r) return;
  r.onmouseup = onReadingSelect;
  r.ontouchend = () => setTimeout(onReadingSelect, 10);
  r.onclick = onReadingClick;
  const clearDrop = () => document.querySelectorAll("#reading [data-pb].drop-on").forEach(c=>c.classList.remove("drop-on"));
  r.ondragover = (e) => { if (_dragType) { e.preventDefault(); const el = e.target.closest && e.target.closest("[data-pb]"); clearDrop(); if (el) el.classList.add("drop-on"); } };
  r.ondragleave = (e) => { const el = e.target.closest && e.target.closest("[data-pb]"); if (el) el.classList.remove("drop-on"); };
  r.ondrop = (e) => {
    if (!_dragType) return;
    e.preventDefault();
    const el = e.target.closest && e.target.closest("[data-pb]");
    clearDrop();
    if (el) tagParagraph(_dragType, el, n);
    _dragType = null;
  };
}
let _dragType = null;
function initTray(){
  document.querySelectorAll("#anno-tray .anno-tray-chip").forEach(chip => {
    chip.addEventListener("dragstart", () => { _dragType = chip.dataset.type; });
    chip.addEventListener("dragend",   () => { _dragType = null; document.querySelectorAll("#reading [data-pb].drop-on").forEach(c=>c.classList.remove("drop-on")); });
  });
}

// ---- "My Markups" review pages ----
function openMarkups(kind){
  state.markupsMode = kind || "highlight";
  state.viewMode = "dashboard";
  state.reviewIncorrectMode = state.reviewFlaggedMode = state.reviewConceptsMode = false;
  const mm = document.getElementById("more-menu"); if (mm) mm.classList.remove("show");
  closeDrawer(); hideAnnoPopup(); showTray(false);
  renderMain(); renderSidebar();
}
function closeMarkups(){ state.markupsMode = null; goHome(); }
function markupCounts(){
  let hl=0, rev=0, imp=0;
  Object.keys(state.hl).forEach(n => (state.hl[n]||[]).forEach(a => { if (a.type==="highlight") hl++; else if (a.type==="review") rev++; else if (a.type==="important") imp++; }));
  rev += Object.keys(state.markReview).length;
  imp += Object.keys(state.markStar).length;
  const bm = Object.keys(state.bookmarks).filter(k=>state.bookmarks[k]).length;
  return { highlight:hl, review:rev, important:imp, bookmark:bm };
}
function updateMarkupCount(){
  const c = markupCounts(); const el = document.getElementById("markups-count");
  if (el) el.textContent = (c.highlight + c.review + c.important + c.bookmark) || "";
}
function markupItems(kind){
  // returns [{lec, ci, text, isChapter}]
  const out = [];
  if (kind === "bookmark"){
    Object.keys(state.bookmarks).forEach(k => { const b = state.bookmarks[k]; if (b) out.push({ lec:parseInt(k), ci:b.ci, text:b.label || "Bookmarked spot", ts:b.ts, isChapter:true }); });
    out.sort((a,b)=>(b.ts||0)-(a.ts||0)); return out;
  }
  Object.keys(state.hl).forEach(n => (state.hl[n]||[]).forEach(a => { if (a.type === kind) out.push({ lec:parseInt(n), ci:a.ci, text:a.text, isChapter:false }); }));
  const store = kind === "review" ? state.markReview : (kind === "important" ? state.markStar : null);
  if (store) Object.keys(store).forEach(k => { const t = store[k]; out.push({ lec:t.lec, ci:t.ci, pb:t.pb, text:t.text || "Tagged paragraph", isChapter:false }); });
  return out;
}
function renderMarkups(){
  const main = document.getElementById("main");
  const kind = state.markupsMode; const meta = ANNO_META[kind] || { icon:"🔖", label:"Bookmarks" };
  const c = markupCounts();
  const tab = (k, ic, lbl) => `<button class="mk-tab ${state.markupsMode===k?'on':''}" onclick="openMarkups('${k}')">${ic} ${lbl} <span class="mk-tab-n">${c[k]||0}</span></button>`;
  let html = `<div class="review-banner"><div><h2>📌 My Markups</h2><div class="review-sub">Everything you've flagged while reading</div></div><button onclick="closeMarkups()">Exit</button></div>
    <div class="mk-tabs">${tab("highlight","🖊️","Highlights")}${tab("review","⚠️","To review")}${tab("important","⭐","Important")}${tab("bookmark","🔖","Bookmarks")}</div>`;
  const items = markupItems(kind);
  if (!items.length){
    html += `<div class="empty-state"><div class="icon">${meta.icon}</div><h3>Nothing here yet</h3><p>Select text while reading and choose ${meta.icon} ${meta.label}, or drag the icon onto a chapter.</p></div>`;
    main.innerHTML = html; return;
  }
  const byLec = {}; items.forEach(it => (byLec[it.lec] = byLec[it.lec] || []).push(it));
  Object.keys(byLec).map(Number).sort((a,b)=>a-b).forEach(n => {
    const lec = getLecture(n);
    html += `<h3 class="review-lec-header">Lecture ${n}. ${lec?esc(lec[1]):""}</h3>`;
    byLec[n].forEach(it => {
      html += `<div class="mk-item ${it.isChapter?'chap':''}" onclick="${kind==='bookmark'?`resumeReading(${n})`:`jumpToMarkup(${n},${it.ci})`}">
        <span class="mk-item-ic">${meta.icon}</span><span class="mk-item-tx">${esc(it.text)}</span><span class="mk-item-go">Go →</span></div>`;
    });
  });
  main.innerHTML = html;
}
function jumpToMarkup(n, ci){
  state.markupsMode = null;
  goToLec(n); setView("learn");
  setTimeout(() => { const el = document.getElementById(`ch-${n}-${ci}`); if (el) el.scrollIntoView({ behavior:"smooth", block:"start" }); }, 80);
}
function jumpToPara(n, pb, ci){
  state.markupsMode = null;
  goToLec(n); setView("learn");
  setTimeout(() => { const el = document.querySelector(`#reading [data-pb="${pb}"]`) || document.getElementById(`ch-${n}-${ci}`); if (el) el.scrollIntoView({ behavior:"smooth", block:"center" }); }, 90);
}

// =============================================================
// LEFT RAIL COLLAPSE + RIGHT NOTES PANEL (Notes/Highlights/Important/Review)
// =============================================================
function toggleRail(){
  state.railCollapsed = !state.railCollapsed;
  save(KEYS.railCollapsed, state.railCollapsed);
  document.getElementById("layout").classList.toggle("rail-collapsed", state.railCollapsed);
}
function applyNotesPanel(){
  save(KEYS.notesOpen, state.notesOpen);
  document.getElementById("layout").classList.toggle("notes-open", state.notesOpen);
  const b = document.getElementById("btn-notes"); if (b) b.classList.toggle("on", state.notesOpen);
  if (state.notesOpen) renderNotesPanel();
}
function toggleNotes(){ state.notesOpen = !state.notesOpen; applyNotesPanel(); }
function openNotes(tab){ if (tab) state.notesTab = tab; state.notesOpen = true; applyNotesPanel(); }
function setNotesTab(tab){ state.notesTab = tab; renderNotesPanel(); }
function refreshNotesIfOpen(){ if (state.notesOpen) renderNotesPanel(); }

function renderNotesPanel(){
  const body = document.getElementById("notes-body"); if (!body) return;
  document.querySelectorAll("#notes-panel .np-tab").forEach(t => t.classList.toggle("on", t.dataset.tab === state.notesTab));
  body.innerHTML = state.notesTab === "notes" ? notesTabHTML() : markupTabHTML(state.notesTab);
  if (state.notesTab === "notes") wireNoteDrop();
}
function notesTabHTML(){
  const n = state.currentLec;
  const lec = getLecture(n);
  const list = state.notes[n] || [];
  const items = list.map(note =>
    `<div class="np-note"><div class="np-note-tx">${esc(note.text)}</div><button class="np-note-x" onclick="removeNote(${n},'${note.id}')" title="Delete note">✕</button></div>`
  ).join("") || `<div class="np-empty">No notes for this lecture yet.<br>Type below, or drag selected text in.</div>`;
  return `<div class="np-ctx">📝 Notes · Lecture ${n}${lec?` — ${esc(lec[1])}`:""}</div>
    <div class="np-drop" id="np-drop">${items}</div>
    <div class="np-add">
      <textarea id="note-input" class="np-note-input" rows="3" placeholder="Write a note…"></textarea>
      <button class="np-add-btn" onclick="addNoteFromInput()">+ Add note</button>
    </div>`;
}
function markupTabHTML(kind){
  const label = { highlight:"Highlights", important:"Important", review:"To review" }[kind] || kind;
  const items = markupItems(kind);
  if (!items.length) return `<div class="np-ctx">${label}</div><div class="np-empty">Nothing here yet.<br>Select text while reading → choose ${kind === "highlight" ? "🖊️ Highlight" : (kind === "important" ? "⭐ Important" : "⚠️ Review")}.</div>`;
  const byLec = {}; items.forEach(it => (byLec[it.lec] = byLec[it.lec] || []).push(it));
  let h = `<div class="np-ctx">${label} · ${items.length}</div>`;
  Object.keys(byLec).map(Number).sort((a,b)=>a-b).forEach(L => {
    const lec = getLecture(L);
    h += `<div class="np-lec">Lecture ${L}${lec?` · ${esc(lec[1]).slice(0,28)}`:""}</div>`;
    byLec[L].forEach(it => {
      const go = it.pb ? `jumpToPara(${L},'${it.pb}',${it.ci})` : `jumpToMarkup(${L},${it.ci||0})`;
      h += `<div class="np-item ${it.isChapter?'chap':''}" onclick="${go}"><span class="np-item-tx">${esc(it.text)}</span><span class="np-item-go">→</span></div>`;
    });
  });
  return h;
}
function addNote(n, text){
  text = String(text || "").trim(); if (!text) return;
  (state.notes[n] = state.notes[n] || []).unshift({ id: annoId(), text, ts: Date.now() });
  save(KEYS.notes, state.notes);
  renderNotesPanel();
}
function addNoteFromInput(){
  const ta = document.getElementById("note-input"); if (!ta) return;
  addNote(state.currentLec, ta.value); ta.value = "";
}
function removeNote(n, id){
  state.notes[n] = (state.notes[n] || []).filter(x => x.id !== id);
  save(KEYS.notes, state.notes); renderNotesPanel();
}
function wireNoteDrop(){
  const d = document.getElementById("np-drop"); if (!d) return;
  d.ondragover = (e) => { e.preventDefault(); d.classList.add("drop-on"); };
  d.ondragleave = () => d.classList.remove("drop-on");
  d.ondrop = (e) => {
    e.preventDefault(); d.classList.remove("drop-on");
    const t = e.dataTransfer.getData("text/plain") || (window.getSelection && window.getSelection().toString());
    if (t && t.trim()) addNote(state.currentLec, t.trim());
  };
}

// =============================================================
// INITIAL HOOK-UP
// =============================================================
function bind(id, fn){ const el=document.getElementById(id); if(el) el.onclick=fn; }
bind("btn-fast", openFast);
bind("btn-theme", toggleDarkMode);
bind("btn-hide-sidebar", toggleSidebar);
bind("btn-editmode", toggleEditMode);
bind("btn-commit", commitChanges);
bind("btn-download", downloadChanges);
bind("btn-review-incorrect", toggleReviewIncorrect);
bind("btn-review-flagged", toggleReviewFlagged);
bind("btn-markups", () => openNotes("highlight"));
bind("btn-reset", () => document.getElementById("reset-modal").classList.add("show"));
initTray();
updateMarkupCount();
// audio player scrub-dot dragging
(function(){
  const dot = document.getElementById("ap-dot"), bar = document.getElementById("ap-bar");
  if (!dot || !bar) return;
  let dragging = false;
  const ratioAt = x => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left)/r.width)); };
  const preview = rt => { const f = document.getElementById("ap-fill"); if (f) f.style.width = (rt*100)+"%"; dot.style.left = (rt*100)+"%"; };
  const move = e => { if (!dragging) return; preview(ratioAt(e.touches ? e.touches[0].clientX : e.clientX)); };
  const up = e => { if (!dragging) return; dragging = false; const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX; ttsSeekTime(ratioAt(x) * TTS.total); };
  dot.addEventListener("mousedown", e => { e.stopPropagation(); dragging = true; });
  dot.addEventListener("touchstart", () => { dragging = true; }, {passive:true});
  document.addEventListener("mousemove", move); document.addEventListener("touchmove", move, {passive:true});
  document.addEventListener("mouseup", up); document.addEventListener("touchend", up);
})();
if (state.railCollapsed) document.getElementById("layout").classList.add("rail-collapsed");
if (state.notesOpen) applyNotesPanel();
// hide the selection popup when clicking outside of it
document.addEventListener("mousedown", (e)=>{ const p=document.getElementById("anno-popup"); if(p && p.style.display!=="none" && !p.contains(e.target)) { /* allow button clicks */ if(!e.target.closest(".anno-popup")) setTimeout(()=>{ const s=window.getSelection(); if(!s||s.isCollapsed) hideAnnoPopup(); }, 0); } });
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape"){ closeLightbox(); closeDrawer(); hideAnnoPopup(); const mm=document.getElementById("more-menu"); if(mm) mm.classList.remove("show"); } });

document.getElementById("reset-modal").addEventListener("click", (e) => {
  if (e.target.id === "reset-modal") e.target.classList.remove("show");
});

// Apply persisted state
if (state.darkMode) {
  document.body.classList.add("dark");
  document.getElementById("btn-theme").textContent = "☀️";
}
if (state.editMode) {
  document.body.classList.add("edit-mode");
  document.getElementById("btn-editmode").textContent = "Exit Edit Mode";
}
if (state.rsidebarHidden) {
  document.getElementById("layout").classList.add("no-rsidebar");
  document.getElementById("btn-hide-sidebar").textContent = "Show Stats";
}

// Apply committed snapshot if present
const committed = load(KEYS.committed, null);
if (committed) {
  try {
    const parsed = JSON.parse(committed);
    if (Array.isArray(parsed)) {
      // Replace QUIZ contents (but keep variable reference — splice in)
      QUIZ.length = 0;
      parsed.forEach(L => QUIZ.push(L));
    }
  } catch (e) {}
}

// Ensure currentLec points to a lecture that exists in QUIZ
if (!QUIZ.some(L => L[0] === state.currentLec)) {
  state.currentLec = QUIZ.length ? QUIZ[0][0] : null;
  save(KEYS.currentLec, state.currentLec);
}

// Initial render
renderSidebar();
renderMain();
renderRSidebar();
updateHeaderStat();
updateHeaderFlagBtn();
updateRankChip();

// ============================================================
// Populate page title + header from QUIZ_CONFIG (set in content.js)
// ============================================================
(function () {
  if (typeof QUIZ_CONFIG === "undefined") return;
  document.title = QUIZ_CONFIG.title + " — Study";
  var h = document.getElementById("quiz-title");
  if (h) h.textContent = QUIZ_CONFIG.title;
})();
