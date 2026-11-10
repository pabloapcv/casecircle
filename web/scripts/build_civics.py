#!/usr/bin/env python3
"""Rebuild data/premium/civics.json from the official USCIS civics source files.

Every question and answer comes verbatim from USCIS. Nothing is written by CaseCircle except the
topic labels (copied from the USCIS section headings) and the "check current officials" flags.

Usage (needs curl, pdftotext from poppler-utils, network access to uscis.gov):
    python3 scripts/build_civics.py            # downloads the sources into a temp dir and rebuilds
    python3 scripts/build_civics.py SRC_DIR    # uses already-downloaded files in SRC_DIR

Sources (checked Nov 10, 2026 on https://www.uscis.gov/citizenship/find-study-materials-and-resources/study-for-the-test):
  2025 test, 128 questions (M-1778 09/25):
    https://www.uscis.gov/sites/default/files/document/questions-and-answers/2025-Civics-Test-128-Questions-and-Answers.pdf
  2008 test, 100 questions (rev. 08/21):
    https://www.uscis.gov/sites/default/files/document/questions-and-answers/OoC_100_Questions_2008_Civics_Test_V1.pdf
  2008 test, official USCIS Spanish translation (rev. 01/19), study aid only:
    https://www.uscis.gov/sites/default/files/document/questions-and-answers/100q_Spanish_2021_SPA.docx
  Answers that change with elections/appointments:
    https://www.uscis.gov/citizenship/testupdates  (page "Last Reviewed/Updated: 09/18/2025")
  Reading / writing vocabulary (rev. 08/08):
    https://www.uscis.gov/sites/default/files/document/guides/reading_vocab.pdf
    https://www.uscis.gov/sites/default/files/document/guides/writing_vocab.pdf
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "data", "premium", "civics.json")
BASE = "https://www.uscis.gov/sites/default/files/document"
FILES = {
    "2025.pdf": f"{BASE}/questions-and-answers/2025-Civics-Test-128-Questions-and-Answers.pdf",
    "2008.pdf": f"{BASE}/questions-and-answers/OoC_100_Questions_2008_Civics_Test_V1.pdf",
    "2008-es.docx": f"{BASE}/questions-and-answers/100q_Spanish_2021_SPA.docx",
}

# Copied from https://www.uscis.gov/citizenship/testupdates (Last Reviewed/Updated 09/18/2025).
# Re-check this page in the weekly USCIS review; it changes after elections and appointments.
UPDATES_CHECKED = "2026-11-10"
UPDATES_PAGE_REVIEWED = "2025-09-18"
UPDATES = {
    "2025": {
        23: {"answers": None, "find": "https://www.senate.gov"},
        29: {"answers": None, "find": "https://www.house.gov"},
        30: {"answers": ["Mike Johnson", "Johnson", "James Michael Johnson (birth name)"]},
        38: {"answers": ["Donald J. Trump", "Donald Trump", "Trump"]},
        39: {"answers": ["JD Vance", "Vance"]},
        57: {"answers": ["John Roberts", "John G. Roberts, Jr.", "Roberts"]},
        61: {"answers": None, "find": "https://www.usa.gov/states-and-territories"},
        62: {"answers": None, "find": "https://www.usa.gov/states-and-territories"},
    },
    "2008": {
        20: {"answers": None, "find": "https://www.senate.gov"},
        23: {"answers": None, "find": "https://www.house.gov"},
        28: {"answers": ["Donald J. Trump", "Donald Trump", "Trump"]},
        29: {"answers": ["JD Vance", "Vance"]},
        39: {"answers": ["nine (9)"]},
        40: {"answers": ["John Roberts", "John G. Roberts, Jr."]},
        43: {"answers": None, "find": "https://www.usa.gov/states-and-territories"},
        44: {"answers": None, "find": "https://www.usa.gov/states-and-territories"},
        46: {"answers": ["Republican (Party)"]},
        47: {"answers": ["Mike Johnson", "Johnson", "James Michael Johnson (birth name)"]},
    },
}

# Official vocabulary lists, transcribed column by column from the two PDFs above.
VOCAB = {
    "reading": {
        "source": f"{BASE}/guides/reading_vocab.pdf", "edition": "rev. 08/08",
        "groups": {
            "People": ["Abraham Lincoln", "George Washington"],
            "Civics": ["American flag", "Bill of Rights", "capital", "citizen", "city", "Congress", "country", "Father of Our Country", "government", "President", "right", "Senators", "state/states", "White House"],
            "Places": ["America", "United States", "U.S."],
            "Holidays": ["Presidents’ Day", "Memorial Day", "Flag Day", "Independence Day", "Labor Day", "Columbus Day", "Thanksgiving"],
            "Question words": ["How", "What", "When", "Where", "Who", "Why"],
            "Verbs": ["can", "come", "do/does", "elects", "have/has", "is/are/was/be", "lives/lived", "meet", "name", "pay", "vote", "want"],
            "Other (function)": ["a", "for", "here", "in", "of", "on", "the", "to", "we"],
            "Other (content)": ["colors", "dollar bill", "first", "largest", "many", "most", "north", "one", "people", "second", "south"],
        },
    },
    "writing": {
        "source": f"{BASE}/guides/writing_vocab.pdf", "edition": "rev. 08/08",
        "groups": {
            "People": ["Adams", "Lincoln", "Washington"],
            "Civics": ["American Indians", "capital", "citizens", "Civil War", "Congress", "Father of Our Country", "flag", "free", "freedom of speech", "President", "right", "Senators", "state/states", "White House"],
            "Places": ["Alaska", "California", "Canada", "Delaware", "Mexico", "New York City", "United States", "Washington", "Washington, D.C."],
            "Months": ["February", "May", "June", "July", "September", "October", "November"],
            "Holidays": ["Presidents’ Day", "Memorial Day", "Flag Day", "Independence Day", "Labor Day", "Columbus Day", "Thanksgiving"],
            "Verbs": ["can", "come", "elect", "have/has", "is/was/be", "lives/lived", "meets", "pay", "vote", "want"],
            "Other (function)": ["and", "during", "for", "here", "in", "of", "on", "the", "to", "we"],
            "Other (content)": ["blue", "dollar bill", "fifty/50", "first", "largest", "most", "north", "one", "one hundred/100", "people", "red", "second", "south", "taxes", "white"],
        },
    },
}

TOPIC_ES = {
    "AMERICAN GOVERNMENT": "Gobierno estadounidense",
    "AMERICAN HISTORY": "Historia estadounidense",
    "SYMBOLS AND HOLIDAYS": "Símbolos y días festivos",
    "INTEGRATED CIVICS": "Educación cívica integrada",
}

BULLET = re.compile(r"^\s*[•▪]\s*(.*)$")
QUESTION = re.compile(r"^\s{0,8}(\d{1,3})\.\s+(.*)$")
SUBTOPIC = re.compile(r"^([A-C]):\s+(.+)$")
NOISE = re.compile(r"(\d+ of 19\s+uscis\.gov/citizenship)|(^\s*-\d+-\s+www\.uscis\.gov)|(^\s*\*?\s*If you are 65)|(^\s*may study just the questions)|(^M-1778)|(^\(rev\.)", re.I)


def pdf_text(path: str) -> list[str]:
    out = subprocess.run(["pdftotext", "-layout", path, "-"], check=True, capture_output=True, text=True).stdout
    out = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", out.replace("\t", " "))
    return out.splitlines()


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse(lines: list[str], version: str) -> list[dict]:
    questions: list[dict] = []
    topic = subtopic = ""
    current = None
    started = False
    for raw in lines:
        if NOISE.search(raw):
            continue
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            continue
        if stripped in TOPIC_ES:
            topic, started = stripped, True
            continue
        if not started:
            continue
        sub = SUBTOPIC.match(stripped)
        if sub and not BULLET.match(line):
            subtopic = clean(sub.group(2))
            current = None
            continue
        match = QUESTION.match(line)
        if match and (not questions or int(match.group(1)) == questions[-1]["n"] + 1):
            current = {"n": int(match.group(1)), "q": match.group(2), "answers": [], "topic": topic, "subtopic": subtopic}
            questions.append(current)
            continue
        if current is None:
            continue
        bullet = BULLET.match(line)
        if bullet:
            current["answers"].append(bullet.group(1))
        elif stripped == "*":
            current["q"] += " *"
        elif stripped.startswith("For a complete list of tribes"):
            current["note"] = clean(stripped)
        elif current["answers"]:
            current["answers"][-1] += " " + stripped
        else:
            current["q"] += " " + stripped
    for item in questions:
        q = clean(item["q"])
        item["star"] = q.endswith("*")
        item["q"] = clean(q.rstrip("*"))
        item["answers"] = [clean(a) for a in item["answers"]]
    return questions


def parse_spanish(path: str) -> list[dict]:
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    rows: list[dict] = []
    for para in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
        text = html.unescape("".join(re.findall(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", para, flags=re.S))).strip()
        if not text or "<w:numPr>" not in para:
            continue
        level = re.search(r'<w:ilvl w:val="(\d)"', para)
        if level and level.group(1) != "0":
            if rows:
                rows[-1]["answers"].append(clean(text))
        else:
            rows.append({"q": clean(text).rstrip("*").strip(), "answers": []})
    return rows


def build(src: str) -> dict:
    v2025 = parse(pdf_text(os.path.join(src, "2025.pdf")), "2025")
    v2008 = parse(pdf_text(os.path.join(src, "2008.pdf")), "2008")
    spanish = parse_spanish(os.path.join(src, "2008-es.docx"))
    assert [q["n"] for q in v2025] == list(range(1, 129)), len(v2025)
    assert [q["n"] for q in v2008] == list(range(1, 101)), len(v2008)
    assert sum(q["star"] for q in v2025) == 20 and sum(q["star"] for q in v2008) == 20
    assert all(q["answers"] for q in v2025 + v2008)
    if len(spanish) == 100:
        for item, es in zip(v2008, spanish):
            item["es"] = {"q": es["q"], "answers": es["answers"]}
    for version, items in (("2025", v2025), ("2008", v2008)):
        for item in items:
            item["topicEs"] = TOPIC_ES.get(item["topic"], item["topic"])
            update = UPDATES[version].get(item["n"])
            if update:
                item["changes"] = True
                if update.get("answers"):
                    item["current"] = update["answers"]
                if update.get("find"):
                    item["find"] = update["find"]
    return {
        "checked": UPDATES_CHECKED,
        "updatesPage": "https://www.uscis.gov/citizenship/testupdates",
        "updatesPageReviewed": UPDATES_PAGE_REVIEWED,
        "studyPage": "https://www.uscis.gov/citizenship/find-study-materials-and-resources/study-for-the-test",
        "versions": {
            "2025": {
                "label": "2025 civics test", "filedOnOrAfter": "2025-10-20", "bank": 128, "asked": 20, "pass": 12, "failAt": 9,
                "source": FILES["2025.pdf"], "edition": "M-1778 (09/25)", "spanish": None, "questions": v2025,
            },
            "2008": {
                "label": "2008 civics test", "filedBefore": "2025-10-20", "bank": 100, "asked": 10, "pass": 6, "failAt": 5,
                "source": FILES["2008.pdf"], "edition": "rev. 08/21",
                "spanish": {"source": FILES["2008-es.docx"], "edition": "rev. 01/19"} if len(spanish) == 100 else None,
                "questions": v2008,
            },
        },
        "senior": {"asked": 10, "pass": 6, "note": "65/20: 65 or older and a permanent resident for 20+ years — 10 questions from the 20 starred ones; 6 correct passes; test may be taken in the language of your choice."},
        "vocab": VOCAB,
    }


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix="civics-")
    for name, url in FILES.items():
        path = os.path.join(src, name)
        if not os.path.exists(path):
            subprocess.run(["curl", "-sSfL", "-A", "Mozilla/5.0", "-o", path, url], check=True)
    data = build(src)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
    print(f"wrote {OUT}: 2025={len(data['versions']['2025']['questions'])} 2008={len(data['versions']['2008']['questions'])} "
          f"es2008={'yes' if data['versions']['2008']['spanish'] else 'no'}")


if __name__ == "__main__":
    main()
