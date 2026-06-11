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
  bookmarks: SUBJ + "_bookmarks_v1"  // { lec: {ci, label, ts} } 🔖 resume points
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
  darkMode: load(KEYS.darkmode, false),
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
  viewMode: "dashboard",           // "dashboard" | "learn" | "practice"
  reviewConceptsMode: false
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
  if (state.reviewIncorrectMode) return renderReviewIncorrect();
  if (state.reviewFlaggedMode) return renderReviewFlagged();
  if (state.reviewConceptsMode) return renderReviewConcepts();
  if (state.viewMode === "dashboard") return renderDashboard();
  if (state.viewMode === "learn") return renderLearnView();
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
  const tools = state.viewMode === "learn" ? `
    <div class="mode-tools">
      <button class="tool-btn" id="tts-btn" onclick="toggleTTS()" title="Listen">🔊 Listen</button>
    </div>` : `<div class="mode-status">${lectureMastered(n)?'<span class="mode-dot master">★ mastered</span>':(state.read[n]?'<span class="mode-dot done">✓ read</span>':'')}</div>`;
  return `<div class="mode-bar">
    <button class="mode-btn ${learnActive}" onclick="setView('learn')">📖 Learn</button>
    <button class="mode-btn ${practiceActive}" onclick="setView('practice')">✍️ Practice</button>
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
  s = s.replace(/^(Describe|Identify|Explain|List|Define|Discuss|Outline|Understand|Recognize|Compare|Review|Apply|Analyze|Summari[sz]e|State|Interpret)\s+(the\s+)?/i, "");
  s = s.replace(/\s+from a clinical perspective$/i, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length > 72) s = s.slice(0, 70).replace(/\s+\S*$/, "") + "…";
  return s;
}
function getChapters(n){
  const c = (typeof LECTURE_CONTENT !== "undefined") ? LECTURE_CONTENT[n] : null;
  if (!c) return [];
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
function proseHTML(text){
  const [lead, body] = splitLead(text);
  if (lead) return `<p class="rc-p"><strong class="rc-lead">${esc(lead)}.</strong> ${emphEponyms(esc(body))}</p>`;
  return `<p class="rc-p">${emphEponyms(esc(text))}</p>`;
}
function noteHTML(b){
  const m = NOTE_META[b.t];
  return `<p class="rc-note rc-note-${m.cls}"><strong class="rc-note-tag">${m.tag}</strong> ${emphEponyms(esc(b.x))}</p>`;
}

// Render one chapter: continuous prose + light inline callouts, then a single
// end-of-chapter "Recall" zone holding all ClaudeCompares + ReClaude reveals.
function renderChapterContent(n, losIds){
  let body = "", recall = "";
  losIds.forEach(id => {
    const lo = loById(n, id); if (!lo) return;
    const blocks = lo.blocks || [];
    const dk = `${n}_${id}`;
    if (typeof DIAGRAMS !== "undefined" && DIAGRAMS[dk]) body += `<div class="rc-diagram">${DIAGRAMS[dk]}</div>`;
    let cqRun = [];
    const flushCQ = () => {
      if (!cqRun.length) return;
      const items = [];
      cqRun.forEach(bi => cqItems(blocks[bi].x).forEach((it, ii) => items.push({ it, key:`${n}_${lo.id}_cc${bi}_${ii}` })));
      if (items.length >= 2)
        recall += `<div class="rc-compare"><div class="rc-compare-head">⇄ ClaudeCompares <span>— recall each, then sort them apart</span></div>${items.map(o => recallRowHTML(o.it, o.key)).join("")}</div>`;
      else if (items.length)
        recall += recallRowHTML(items[0].it, items[0].key);
      cqRun = [];
    };
    blocks.forEach((b, bi) => {
      if (b.t === "cq") { cqRun.push(bi); return; }
      flushCQ();
      if (b.t === "q")            recall += reflectHTML(n, lo.id, b.x, `${n}_${lo.id}_q${bi}`);
      else if (b.t === "p")       body += proseHTML(b.x);
      else if (NOTE_META[b.t])    body += noteHTML(b);
      else                        body += proseHTML(b.x);
    });
    flushCQ();
  });
  let html = body;
  if (recall) html += `<div class="rc-recall-zone"><div class="rc-recall-zone-h">🧠 Recall — test yourself</div>${recall}</div>`;
  return html;
}

function renderReadingContent(n){
  const c = (typeof LECTURE_CONTENT !== "undefined") ? LECTURE_CONTENT[n] : null;
  if (!c) return `<div class="empty-state"><div class="icon">📖</div><h3>Reading content coming soon</h3><p>Jump into the questions instead.</p></div>`;
  let html = "";
  if (c.tldr) html += `<p class="rc-standfirst">${emphEponyms(esc(c.tldr))}</p>`;
  if (c.mustKnows && c.mustKnows.length){
    const lis = c.mustKnows.map(m => {
      const [lead, rest, sep] = splitMustLead(m);
      return `<li>${lead ? `<strong>${esc(lead)}</strong>${sep}` : ""}${emphEponyms(esc(rest))}</li>`;
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
}

function renderLecture() {
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
  state.viewMode = "learn";
  updateReviewButtons();
  renderMain();
  renderSidebar();
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
// TEXT-TO-SPEECH (listen mode)
// =============================================================
let TTS={on:false};
function ttsText(n){
  const c=(typeof LECTURE_CONTENT!=="undefined")?LECTURE_CONTENT[n]:null; if(!c) return "";
  let parts=[];
  if(c.tldr) parts.push("Summary. "+c.tldr);
  (c.mustKnows||[]).forEach((m,i)=>parts.push(`Must know ${i+1}. ${m}`));
  (c.los||[]).forEach(lo=>{ if(lo.statement) parts.push("Objective. "+lo.statement); (lo.blocks||[]).forEach(b=>parts.push(b.x)); });
  return parts.join(" ");
}
function stopTTS(){ if("speechSynthesis" in window) window.speechSynthesis.cancel(); TTS.on=false; const b=document.getElementById("tts-btn"); if(b){b.classList.remove("on"); b.innerHTML="🔊 Listen";} }
function toggleTTS(){
  if(!("speechSynthesis" in window)){ showToast("Speech not supported here"); return; }
  const btn=document.getElementById("tts-btn");
  if(TTS.on){ stopTTS(); return; }
  const u=new SpeechSynthesisUtterance(ttsText(state.currentLec)); u.rate=1.03;
  u.onend=()=>{ TTS.on=false; if(btn){btn.classList.remove("on"); btn.innerHTML="🔊 Listen";} };
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  TTS.on=true; if(btn){btn.classList.add("on"); btn.innerHTML="⏸ Stop";}
}

// =============================================================
// DASHBOARD (home) + DRAWER + RANK CHIP
// =============================================================
function goHome(){ stopTTS(); state.viewMode="dashboard"; state.reviewIncorrectMode=state.reviewFlaggedMode=state.reviewConceptsMode=false; updateReviewButtons(); renderMain(); renderSidebar(); renderRSidebar(); window.scrollTo({top:0,behavior:"smooth"}); }
function renderDashboard(){
  const main=document.getElementById("main");
  const rk=rankFor(state.xp); const o=overallStats();
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
bind("btn-reset", () => document.getElementById("reset-modal").classList.add("show"));
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape"){ closeLightbox(); closeDrawer(); const mm=document.getElementById("more-menu"); if(mm) mm.classList.remove("show"); } });

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
