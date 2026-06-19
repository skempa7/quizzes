#!/usr/bin/env python3
"""Match high-yield concepts (must-knows + KEY callouts) to the single best
lecture-slide page by IDF-weighted term overlap. Conservative threshold =
accuracy over coverage. Emits ~/gi-quiz-app/_slide_jumps.json:
  { lec: { "mk_<i>": page, "key_<loId>_<bi>": page, ... } }  (1-based page)
"""
import fitz, glob, os, re, json, math

SLIDESRC = "/Users/sebastiankempa/Library/CloudStorage/GoogleDrive-skempa7@gmail.com/My Drive/quiz-materials/gi midterm/gi midterm lecture slides"
MANIFEST = json.load(open(os.path.expanduser("~/gi-quiz-app/_slides.json")))
CONTENT  = json.load(open(os.path.expanduser("~/gi-quiz-app/_content.json")))
OUT      = os.path.expanduser("~/gi-quiz-app/_slide_jumps.json")
EMBOUT   = os.path.expanduser("~/gi-quiz-app/_slide_embed.json")

STOP = set("""the a an and or of to in is are was were be been being for with as by on at from into
within without between each both this that these those it its their his her your you we they them then
than which what when where who whom how why not no any all some more most other such only own same so
can will just also very much many few less least may might must should would could into onto out off up
down over under again further once here there about above below after before during because while if
unless until per via etc vs versus eg ie""".split())
KEEP_SHORT = set("les ues gerd pud ida ens pns sns cck vip no gi cns mmc ppi nsaid".split())

def words(text):
    toks = re.findall(r"[A-Za-z][A-Za-z'’-]+", text)
    out = []
    for w in toks:
        lw = w.lower().replace("’", "'").strip("'-")
        if not lw: continue
        if lw in STOP: continue
        if len(lw) >= 4 or lw in KEEP_SHORT:
            out.append(lw)
        elif w.isupper() and 2 <= len(w) <= 5:
            out.append(lw)
    return out

# verified-wrong matches to prune (accuracy over coverage)
BLOCK = {
    1:  ["Sialolithiasis", "Hiatal hernia"],
    2:  ["Acid-suppressing drug ladder"],
    13: ["The workup is symptom"],
    14: ["untreated inflamed"],
    19: ["GIST = cells of Cajal"],
}
def blocked(L, text):
    return any(s in text for s in BLOCK.get(L, []))

def deck_dir(fn):
    base = os.path.basename(fn).lower()
    if "29gi.pdf" in base.replace(" ", ""):
        return "29" if "lec 29 gi" in base else None
    m = re.match(r'lec\s*(\d+)\s*(?:and|-|–|&)?\s*(\d+)?\s*gi', base)
    if not m: return None
    a = int(m.group(1)); b = m.group(2)
    return f"{a}-{int(b)}" if b else str(a)

dir2pdf = {}
for f in glob.glob(os.path.join(SLIDESRC, "*.pdf")):
    d = deck_dir(f)
    if d and d not in dir2pdf: dir2pdf[d] = f

def page_texts(pdf):
    doc = fitz.open(pdf)
    pages = []
    for i in range(doc.page_count):
        raw = doc[i].get_text()
        title = " ".join(raw.split()[:14])
        skip = bool(re.search(r"learning objectives", raw, re.I)) or i == 0
        pages.append({"n": i+1, "tokens": words(raw), "title": title, "skip": skip})
    doc.close()
    return pages

def fuzzy_in(term, pset):
    """term matches a page token exactly, by 6-char prefix, or edit-distance<=1."""
    if term in pset: return True
    for t in pset:
        if len(term) >= 6 and len(t) >= 6 and term[:6] == t[:6]: return True
        if abs(len(term) - len(t)) <= 1 and len(term) >= 6:
            # cheap edit distance <=1 check
            if _ed1(term, t): return True
    return False

def _ed1(a, b):
    if a == b: return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1: return False
    if la == lb:
        return sum(x != y for x, y in zip(a, b)) == 1
    # one insertion/deletion
    if la > lb: a, b = b, a
    i = j = 0; diff = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]: i += 1; j += 1
        else:
            diff += 1; j += 1
            if diff > 1: return False
    return True

def match(concept, pages, idf, min_shared=2, min_score=4.0):
    cterms = set(words(concept))
    if len(cterms) < 2: return None
    # the concept's most distinctive terms (the subject) must appear on the slide
    anchors = sorted(cterms, key=lambda t: idf.get(t, 0), reverse=True)[:3]
    scored = []
    for p in pages:
        if p["skip"]: continue
        pset = set(p["tokens"])
        common = cterms & pset
        if len(common) < min_shared: continue
        if not any(fuzzy_in(a, pset) for a in anchors): continue   # precision guard
        score = sum(idf.get(t, 0) for t in common)
        scored.append((score, len(common), p))
    if not scored: return None
    scored.sort(key=lambda x: x[0], reverse=True)
    best = scored[0]
    second = scored[1][0] if len(scored) > 1 else 0
    if best[0] >= min_score and best[1] >= min_shared and (second == 0 or best[0] >= 1.15 * second):
        return {"page": best[2]["n"], "score": round(best[0], 1), "shared": best[1],
                "title": best[2]["title"]}
    return None

def main(report_lec=None):
    out = {}
    EMB = {}
    report = []
    report_all = (report_lec == "all")
    for L in range(1, 31):
        m = MANIFEST.get(str(L)); c = CONTENT.get(str(L))
        if not m or not c: continue
        pdf = dir2pdf.get(m["dir"]);
        if not pdf: continue
        pages = page_texts(pdf)
        N = max(1, sum(1 for p in pages if not p["skip"]))
        df = {}
        for p in pages:
            if p["skip"]: continue
            for t in set(p["tokens"]): df[t] = df.get(t, 0) + 1
        idf = {t: math.log((N + 1) / (d + 0.5)) for t, d in df.items()}
        buttons = {}   # lenient: small "Slide" buttons on many blocks
        embeds  = {}   # strict: inline thumbnail beside the highest-yield blocks
        def consider(blockkey, text, embed_ok):
            if blocked(L, text): return
            r = match(text, pages, idf, min_shared=2, min_score=4.0)
            if not r: return
            buttons[blockkey] = r["page"]
            if embed_ok and r["score"] >= 9.0 and r["shared"] >= 4:
                embeds[blockkey] = r["page"]
            if report_all or L == report_lec: report.append((L, blockkey, text[:54], r))
        for i, mk in enumerate(c.get("mustKnows", [])):
            consider(f"mk_{i}", mk, True)
        for lo in c.get("los", []):
            for bi, b in enumerate(lo.get("blocks", [])):
                if b["t"] in ("p", "key", "pearl", "cue"):
                    consider(f"{lo['id']}_{bi}", b["x"], b["t"] in ("key",))
        if buttons: out[L] = buttons
        if embeds:  EMB[L] = embeds
    json.dump(out, open(OUT, "w"), indent=1)
    json.dump(EMB, open(EMBOUT, "w"), indent=1)
    total = sum(len(v) for v in out.values())
    totemb = sum(len(v) for v in EMB.values())
    print(f"lectures with buttons: {len(out)}  total buttons: {total}  | embeds: {totemb} across {len(EMB)} lectures")
    print("per-lecture button counts:", {k: len(v) for k, v in sorted(out.items())})
    if report_lec:
        print(f"\n=== matches (verify concept vs slide title) ===")
        for L, kind, txt, r in report:
            print(f"L{L:>2} [{kind:>3}] p{r['page']:<3} | {txt}")
            print(f"            slide: {r['title'][:78]}")

import sys
arg = sys.argv[1] if len(sys.argv) > 1 else None
main(report_lec=("all" if arg == "all" else (int(arg) if arg else None)))
