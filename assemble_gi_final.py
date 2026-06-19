#!/usr/bin/env python3
"""Assemble quizzes/gi-final/content.js straight from the GI delta-doc SOURCE DATA
(build_kpclaude_31-34.py + build_kpclaude_35-38.py) — extraction, not PDF-parsing, so it's
verbatim & artifact-free. FIVE 'lectures':
  31 Infectious Diarrhea (Lec 31-32)      — Blavo
  33 GI Endoscopy (Lec 33-34)             — Schneider
  35 GI Pharmacology (Lec 35-36 merged)   — Parmar   (9 LOs, slides 35→36 concatenated)
  37 Abdominal Trauma (Lec 37)            — Rose
  38 Abdominal Pain / Diverticulitis (38) — Moljo
"""
import os, sys, re, json, html as htmllib

DOCDIR = "/Users/sebastiankempa/Library/CloudStorage/GoogleDrive-skempa7@gmail.com/My Drive/claude builds/gi build/build files/scripts"
sys.path.insert(0, DOCDIR)
import importlib.util
def _imp(modname, fname):
    spec = importlib.util.spec_from_file_location(modname, os.path.join(DOCDIR, fname))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
B  = _imp("bld31", "build_kpclaude_31-34.py")   # 31-32 / 33-34 source data
B2 = _imp("bld35", "build_kpclaude_35-38.py")   # 35&36 / 37 / 38 source data
B3 = _imp("bld39", "build_kpclaude_39-42.py")   # 39&40 / 41 / 42 source data
B4 = _imp("bld43", "build_kpclaude_43-49.py")   # 43&44 / 45&46 / 47 / 48 / 49 source data
B5 = _imp("bld50", "build_kpclaude_50-54.py")   # 50 / 51 / 52 / 53&54 source data
B6 = _imp("bld55", "build_kpclaude_55-57.py")   # 55 / 56 / 57 source data

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "quizzes/gi-final/content.js")

def clean(s):
    s = s.replace("&nbsp;", " ").replace("&#8594;", "→")
    s = re.sub(r"</?(b|i|font)[^>]*>", "", s)
    s = htmllib.unescape(s)
    return re.sub(r"\s+", " ", s).strip()

def lo_id(ref):            # "LO 31.1" -> 1
    return int(ref.split(".")[-1])

ADV_KW = ("patient", "traveler", "child", "returns", "presents", "jaundiced", "elderly",
          "vomits", "year-old", "stab", "gunshot", "wound", "injured", "admitted", "trauma")
def is_adv(stem):
    return bool(re.match(r"^A\s", stem)) or any(k in stem.lower() for k in ADV_KW)

# ---- per-block config for the 31-34 doc (module-level A_*/B_* in build_kpclaude_31-34.py) ----
BLOCKS = [
    {"key": "31", "title": "Infectious Diarrhea (Lec 31–32)", "prof": "Cyril Blavo, D.O.",
     "tldr": B.A_TLDCLAUDE, "musts": B.A_MUSTS, "los": B.A_LOS, "qs": B.A_QUESTIONS,
     "traps": B.A_TRAPS, "closers": B.A_CLOSERS, "connects": B.A_CONNECTS,
     "slidedir": "31-32", "slidepdf": "lecture slides/Lec 31 and 32.pdf",
     "jump": {1: 8, 2: 15, 3: 8, 4: 20, 5: 26}, "embed": {}},
    {"key": "33", "title": "GI Endoscopy (Lec 33–34)", "prof": "Jeffrey Schneider, M.D.",
     "tldr": B.B_TLDCLAUDE, "musts": B.B_MUSTS, "los": B.B_LOS, "qs": B.B_QUESTIONS,
     "traps": B.B_TRAPS, "closers": B.B_CLOSERS, "connects": B.B_CONNECTS,
     "slidedir": "33-34", "slidepdf": "lecture slides/Lec 33 and 34.pdf",
     "jump": {1: 35, 2: 42, 3: 21, 4: 90, 5: 53, 6: 69},
     "embed": {1: 35, 2: 42, 3: 21, 4: 90, 6: 69}},
]

def table_to_text(t):
    """Flatten a decision table to readable lines: '**Header row.** R1: c2 · c3 · c4 ; ...'."""
    head = t[0]
    lines = []
    for row in t[1:]:
        rest = " · ".join(clean(c) for c in row[1:])
        lines.append(f"{clean(row[0])} — {rest}")
    label = " / ".join(clean(c) for c in head)
    return f"Decision table ({label}): " + " ; ".join(lines)

def lo_blocks(lo):
    blocks = []
    # overview p must be first (slide jumps target block 0)
    body = lo["body"]
    for el in body:
        k = el[0]
        if k == "p":
            blocks.append({"t": "p", "x": clean(el[1])})
        elif k == "cq":
            blocks.append({"t": "cq", "x": clean(el[1])})
        elif k == "table":
            blocks.append({"t": "p", "x": table_to_text(el[1])})
        # 'img' skipped — slides live in the slide system
    for label, text in lo.get("callouts", []):
        ct = {"CLAUDEKEY": "key", "CLAUDE PEARL": "pearl", "CLAUDE CUE": "cue",
              "CLAUDE CONFUSIONS": "confusion", "CLAUDE TRAP": "trap"}[label]
        blocks.append({"t": ct, "x": clean(text)})
    if lo.get("reclaude_q"):
        blocks.append({"t": "q", "x": clean(lo["reclaude_q"])})
    return blocks

LECTURE_CONTENT, QUIZ, SLIDES, SLIDE_JUMPS, SLIDE_EMBED, LO_ANSWERS = {}, [], {}, {}, {}, {}

# ==================================================================================
#  31-34 blocks (PDF-rendered slides, hand-curated jumps)  →  lectures 31, 33
# ==================================================================================
import fitz
for blk in BLOCKS:
    lk = blk["key"]
    # ---- LECTURE_CONTENT ----
    los_content = []
    for lo in blk["los"]:
        i = lo_id(lo["ref"])
        los_content.append({"id": i, "statement": lo["statement"], "blocks": lo_blocks(lo)})
        ov = next((clean(e[1]) for e in lo["body"] if e[0] == "p"), "")
        LO_ANSWERS[f"{lk}_{i}"] = {"answer": ov, "why": clean(lo.get("reclaude_a", ""))}
    conc = [{"t": "trap", "x": clean(x)} for x in blk["traps"]]
    conc += [{"t": "cue", "x": clean(x)} for x in blk["closers"]]
    conc += [{"t": "p", "x": "Cross-lecture links — " + clean(x)} for x in blk["connects"]]
    los_content.append({"id": 80, "statement": "Claude Concludes — Traps & Stem-Tells", "blocks": conc})
    LECTURE_CONTENT[lk] = {"prof": blk["prof"], "tldr": clean(blk["tldr"]),
                           "mustKnows": [clean(n) + " " + clean(b) for n, b in blk["musts"]],
                           "los": los_content}
    # ---- QUIZ ----
    by_lo = {}
    for q in blk["qs"]:
        i = lo_id(q["lo"]); by_lo.setdefault(i, []).append(q)
    lo_arr = []
    for lo in blk["los"]:
        i = lo_id(lo["ref"])
        qs = []
        for q in by_lo.get(i, []):
            ch = q["choices"]; order = "ABCDE"
            choices = [clean(ch[L]) for L in order]
            why = q["answer_key"]["explanations"]
            tail = "  ".join(f"{clean(ch[L])}: {clean(why[L])}" for L in "BCDE")
            expl = clean(q["reasoning"]) + "\n\nWhy not — " + tail
            qs.append([clean(q["stem"]), choices, 0, expl, "advanced" if is_adv(q["stem"]) else "basic"])
        lo_arr.append([i, lo["statement"], qs])
    QUIZ.append([int(lk), blk["title"], lo_arr])
    # ---- slides (render from the lecture-slide PDF) ----
    d = fitz.open(os.path.join(DOCDIR, "..", blk["slidepdf"]))
    SLIDES[lk] = {"dir": blk["slidedir"], "count": d.page_count}
    outdir = os.path.join(HERE, "quizzes/gi-final/slides", blk["slidedir"])
    os.makedirs(outdir, exist_ok=True)
    for pi in range(d.page_count):
        d[pi].get_pixmap(matrix=fitz.Matrix(1.7, 1.7)).save(os.path.join(outdir, f"{pi+1:02d}.jpg"))
    d.close()
    SLIDE_JUMPS[lk] = {f"{i}_0": p for i, p in blk["jump"].items()}
    if blk["embed"]:
        SLIDE_EMBED[lk] = {f"{i}_0": p for i, p in blk["embed"].items()}

# ==================================================================================
#  35-38 blocks (slides pre-extracted as PNGs; jumps derived from each LO's lead img)
#  Block A' = Lec 35 & 36 MERGED → unique sequential LO ids 1..9, slide dir "35-36"
#  with Lec 35 slides as pages 1..34 and Lec 36 slides as pages 35..69.
# ==================================================================================
from PIL import Image

def render_png_deck(decks, out_dir):
    """decks: [(deck, count, page_offset)]. Convert build_assets/img{deck}/s{n}.png ->
    out_dir/{offset+n:02d}.jpg. Returns total page count."""
    os.makedirs(out_dir, exist_ok=True)
    total = 0
    for deck, count, off in decks:
        for n in range(1, count + 1):
            src = os.path.join(DOCDIR, f"build_assets/img{deck}/s{n:02d}.png")
            Image.open(src).convert("RGB").save(
                os.path.join(out_dir, f"{off + n:02d}.jpg"), "JPEG", quality=86)
            total += 1
    return total

def add_block35(lk, title, prof, tld, musts, los, qs, traps, closers, connects, decks, slide_dir, buzz=None):
    seq = {lo["ref"]: i for i, lo in enumerate(los, 1)}   # 35.1→1 … 36.4→9 (collision-free)
    offset = {d: off for d, _c, off in decks}
    # ---- LECTURE_CONTENT ----
    los_content = []
    for lo in los:
        i = seq[lo["ref"]]
        los_content.append({"id": i, "statement": clean(lo["statement"]), "blocks": lo_blocks(lo)})
        ov = next((clean(e[1]) for e in lo["body"] if e[0] == "p"), "")
        LO_ANSWERS[f"{lk}_{i}"] = {"answer": ov, "why": clean(lo.get("reclaude_a", ""))}
    conc = [{"t": "trap", "x": clean(x)} for x in traps]
    conc += [{"t": "cue", "x": clean(x)} for x in closers]
    conc += [{"t": "p", "x": "Cross-lecture links — " + clean(x)} for x in connects]
    los_content.append({"id": 80, "statement": "Claude Concludes — Traps & Stem-Tells", "blocks": conc})
    LECTURE_CONTENT[lk] = {"prof": prof, "tldr": clean(tld),
                           "mustKnows": [clean(n) + " " + clean(b) for n, b in musts]
                                        + [clean(t) + " = " + clean(x) for t, x in (buzz or [])],
                           "los": los_content}
    # ---- QUIZ (group questions by full LO ref so 35.x / 36.x never collide) ----
    by_lo = {}
    for q in qs:
        by_lo.setdefault(q["lo"], []).append(q)
    lo_arr = []
    for lo in los:
        i = seq[lo["ref"]]
        qq = []
        for q in by_lo.get(lo["ref"], []):
            ch = q["choices"]
            choices = [clean(ch[L]) for L in "ABCDE"]
            why = q["answer_key"]["explanations"]
            tail = "  ".join(f"{clean(ch[L])}: {clean(why[L])}" for L in "BCDE")
            expl = clean(q["reasoning"]) + "\n\nWhy not — " + tail
            qq.append([clean(q["stem"]), choices, 0, expl, "advanced" if is_adv(q["stem"]) else "basic"])
        lo_arr.append([i, clean(lo["statement"]), qq])
    QUIZ.append([int(lk), title, lo_arr])
    # ---- slides (PNG → JPG) ----
    cnt = render_png_deck(decks, os.path.join(HERE, "quizzes/gi-final/slides", slide_dir))
    SLIDES[lk] = {"dir": slide_dir, "count": cnt}
    jumps = {}
    for lo in los:
        i = seq[lo["ref"]]
        imgs = [e for e in lo["body"] if e[0] == "img"]
        if imgs:
            jumps[f"{i}_0"] = offset[lo["_deck"]] + imgs[0][1][0][0]   # lead slide of the LO
    SLIDE_JUMPS[lk] = jumps
    SLIDE_EMBED[lk] = dict(jumps)   # embed each LO's lead slide inline as well

# tuple layout: 0 nlabel,1 title,2 prof,3 ident,4 tld,5 musts,6 ct,7 questions,8 los,9 traps,10 closers,11 connects,12 deck
b0, b1, b2 = B2.BLOCKS[0], B2.BLOCKS[1], B2.BLOCKS[2]
add_block35("35", "GI Pharmacology (Lec 35–36)", "Dr. Mayur Parmar",
            b0[4], b0[5], b0[8], b0[7], b0[9], b0[10], b0[11],
            [("35", 34, 0), ("36", 35, 34)], "35-36")
add_block35("37", "Abdominal Trauma (Lec 37)", "Dr. Norman Rose",
            b1[4], b1[5], b1[8], b1[7], b1[9], b1[10], b1[11],
            [("37", 43, 0)], "37")
add_block35("38", "Abdominal Pain — Diverticulitis (Lec 38)", "Dr. R. Jackeline Moljo",
            b2[4], b2[5], b2[8], b2[7], b2[9], b2[10], b2[11],
            [("38", 20, 0)], "38")

# ---- 39-42 blocks (build_kpclaude_39-42.py): 39&40 merged (Chronic Liver Disease), 41, 42 ----
# Block 1 (39&40) LOs are 39.1-39.6 — collision-free trailing ids 1-6; slides img39 (1-39) + img40 (40-72).
c0, c1, c2 = B3.BLOCKS[0], B3.BLOCKS[1], B3.BLOCKS[2]
add_block35("39", "Chronic Liver Disease (Lec 39–40)", "Dr. Jeffrey Schneider",
            c0[4], c0[5], c0[8], c0[7], c0[9], c0[10], c0[11],
            [("39", 39, 0), ("40", 33, 39)], "39-40")
add_block35("41", "Laxative & Antidiarrheal Agents (Lec 41)", "Dr. Mayur Parmar",
            c1[4], c1[5], c1[8], c1[7], c1[9], c1[10], c1[11],
            [("41", 41, 0)], "41")
add_block35("42", "Congenital/Hereditary & Circulatory Liver (Lec 42)", "Dr. Matthew Machini",
            c2[4], c2[5], c2[8], c2[7], c2[9], c2[10], c2[11],
            [("42", 24, 0)], "42")

# ---- 43-49 blocks (build_kpclaude_43-49.py): 43&44 merged, 45&46 merged, 47, 48, 49 ----
# Merged-block LO ids are sequential within the block (seq map); questions group by full LO ref,
# so 43.x/44.x never collide. Slides: img43 (1-30) + img44 (31-58); img45 (1-36) + img46 (37-79).
e0, e1, e2, e3, e4 = (B4.BLOCKS[i] for i in range(5))
add_block35("43", "Pathology: Cirrhosis/Hepatic Failure & Biliary Tract (Lec 43–44)", "Dr. Matthew Machini",
            e0[4], e0[5], e0[8], e0[7], e0[9], e0[10], e0[11],
            [("43", 30, 0), ("44", 28, 30)], "43-44", buzz=e0[6])
add_block35("45", "Surgical Aspects: Gallbladder/Biliary & Liver/Pancreas (Lec 45–46)", "Dr. Khavir Sharieff",
            e1[4], e1[5], e1[8], e1[7], e1[9], e1[10], e1[11],
            [("45", 36, 0), ("46", 43, 36)], "45-46", buzz=e1[6])
add_block35("47", "Pathology of Jaundice (Lec 47)", "Dr. R. Daniel Bonfil",
            e2[4], e2[5], e2[8], e2[7], e2[9], e2[10], e2[11],
            [("47", 38, 0)], "47", buzz=e2[6])
add_block35("48", "Hepatic Function Tests (Lec 48)", "Dr. Jeanette Rodriguez",
            e3[4], e3[5], e3[8], e3[7], e3[9], e3[10], e3[11],
            [("48", 29, 0)], "48", buzz=e3[6])
add_block35("49", "Viral Hepatitis (Lec 49)", "Dr. Matthew Soff",
            e4[4], e4[5], e4[8], e4[7], e4[9], e4[10], e4[11],
            [("49", 46, 0)], "49", buzz=e4[6])

# ---- 50-54 blocks (build_kpclaude_50-54.py): 50, 51, 52, 53&54 merged ----
# Merged 53&54 LOs are 53.1-53.10 (collision-free seq); slides img53 (1-30) + img54 (31-50).
f0, f1, f2, f3 = (B5.BLOCKS[i] for i in range(4))
add_block35("50", "Hyperbilirubinemia (Lec 50)", "Dr. Cyril Blavo",
            f0[4], f0[5], f0[8], f0[7], f0[9], f0[10], f0[11],
            [("50", 18, 0)], "50", buzz=f0[6])
add_block35("51", "Pathology of Tumors of the Liver (Lec 51)", "Dr. R. Daniel Bonfil",
            f1[4], f1[5], f1[8], f1[7], f1[9], f1[10], f1[11],
            [("51", 39, 0)], "51", buzz=f1[6])
add_block35("52", "Pathology of the Exocrine Pancreas (Lec 52)", "Dr. Broderick Jones",
            f2[4], f2[5], f2[8], f2[7], f2[9], f2[10], f2[11],
            [("52", 40, 0)], "52", buzz=f2[6])
add_block35("53", "Medical Aspects of Pancreatic Disorders I & II (Lec 53–54)", "Dr. Ari Lamet",
            f3[4], f3[5], f3[8], f3[7], f3[9], f3[10], f3[11],
            [("53", 30, 0), ("54", 20, 30)], "53-54", buzz=f3[6])

# ---- 55-57 blocks (build_kpclaude_55-57.py): 55, 56, 57 — the final close-out (Lec 58 NOT tested) ----
g0, g1, g2 = (B6.BLOCKS[i] for i in range(3))
add_block35("55", "Nutrition in Adults (Lec 55)", "Dr. Marilyn Gordon",
            g0[4], g0[5], g0[8], g0[7], g0[9], g0[10], g0[11],
            [("55", 44, 0)], "55", buzz=g0[6])
add_block35("56", "Porphyrins (Lec 56)", "Dr. Suzanne Riskin",
            g1[4], g1[5], g1[8], g1[7], g1[9], g1[10], g1[11],
            [("56", 21, 0)], "56", buzz=g1[6])
add_block35("57", "Cytochrome P450 (Lec 57)", "Dr. Anna Potter",
            g2[4], g2[5], g2[8], g2[7], g2[9], g2[10], g2[11],
            [("57", 38, 0)], "57", buzz=g2[6])

# ==================================================================================
#  write content.js
# ==================================================================================
def js(name, obj):
    return f"const {name} = {json.dumps(obj, ensure_ascii=False)};\n"

parts = [
    "// AUTO-GENERATED for gi_final from the GI 31-34 + 35-38 delta docs (assemble_gi_final.py). Regenerate, don't hand-edit.\n\n",
    js("QUIZ_CONFIG", {"id": "gi_final", "title": "GI Final", "emoji": "🩺"}),
    js("IMAGES", {}),
    js("LO_ANSWERS", LO_ANSWERS),
    js("SLIDES", SLIDES),
    js("SLIDE_JUMPS", SLIDE_JUMPS),
    js("SLIDE_EMBED", SLIDE_EMBED),
    js("FLASHCARDS", {}),
    js("LECTURE_CONTENT", LECTURE_CONTENT),
    js("LECTURE_REFERENCES", {}),
    "\n// QUIZ_START\nconst QUIZ = " + json.dumps(QUIZ, ensure_ascii=False) + ";\n// QUIZ_END\n",
]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w").write("".join(parts))
nq = sum(len(lo[2]) for blk in QUIZ for lo in blk[2])
print(f"WROTE {OUT}")
print(f"lectures: {len(QUIZ)} | questions: {nq} | LOs(content): {sum(len(v['los']) for v in LECTURE_CONTENT.values())}")
print("slides: " + ", ".join(f"{k}={v['count']}" for k, v in SLIDES.items()))
print("quiz lecture keys: " + ", ".join(str(blk[0]) for blk in QUIZ))
