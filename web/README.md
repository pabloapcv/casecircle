# CaseCircle website

The calm, bilingual companion for the USCIS wait / El acompañante bilingüe y tranquilo para la espera de USCIS.

CaseCircle is a free-to-start community and case companion for people with family-based and naturalization cases: compare your wait, gather papers on the device, prepare for interviews, and learn from moderated community experiences. It is **not** affiliated with USCIS, not legal advice, and not a filing service.

The site is static files plus a few same-origin JSON endpoints (`serve.py`). Tools come first — **Folder Builder, Check the wait, Interview prep, Insights** — and the community is second.

## Preview on your Mac (port 8766)

From `web/`:

```bash
python3 serve.py 8766
```

Open [http://127.0.0.1:8766/](http://127.0.0.1:8766/). The process binds **127.0.0.1 only**. `serve.py` also handles `POST /api/folder-chat` so the folder page and the language-model chat share that origin.

This branch includes the blank-page startup fix from [PR #2](https://github.com/pabloapcv/casecircle/pull/2). Keep using this `serve.py`; plain `python3 -m http.server` will not expose `/api/folder-chat`.

## Positioning

- Pitch (EN): Compare your USCIS wait with people like you, get your papers in order, and learn from people who have been there, in English or Spanish, without handing over your documents.
- Pitch (ES): Compara tu espera de USCIS con personas como tú, organiza tus papeles y aprende de quienes ya pasaron por esto, en español o inglés, sin entregar tus documentos.
- Always: community experiences, checklists, plain-language explanations, not legal advice, not affiliated with USCIS.
- Never: guaranteed approval, faster processing, expedite promises, “your case is strong,” official seals, or anything that predicts a decision.

## Pricing (no payment backend yet)

- **Free core:** feed, Check the wait, checklists, common questions, limited Ask-the-posts questions.
- **Case Pass:** one-time, per case, 12 months — unlimited folder chat, printable bilingual checklist, interview prep pack, wait alerts.
- Checkout is **not** wired. The UI shows **Coming soon / Join the waitlist** and only stores an email in `localStorage` (or offers a mailto).
- A/B price test: `CASE_PASS_PRICE_USD` in `app.js` is set to **19** (alternative under test: **29**). Change that constant to flip the displayed price; do not invent a charge.

## Folder chat (language model)

The Prepare / folder view can send **this form’s checklist labels and status plus your question** to an OpenAI-compatible Chat Completions API. The chat **organizes and explains**; it does **not** judge the case or predict approval. Folder papers, marks, and identifiers stay in the browser unless you opt in. Nothing is sent until you check the consent box.

The Folder Builder shows a **Folder readiness** score (see below). It is a completeness/consistency score computed on the device, never an approval prediction.

### Exact environment variables

Set these in the shell that starts `serve.py`, or in `web/.env` (that file is gitignored). **Never** put a key in client JavaScript, `localStorage`, the repo, or screenshots.

| Name | Required | Meaning |
| --- | --- | --- |
| `CASECIRCLE_LLM_API_KEY` | Yes, for a real model | Server-side bearer token. If unset (and mock is off), the UI says chat is unavailable. It does **not** fall back to canned answers presented as a model. |
| `CASECIRCLE_LLM_BASE_URL` | No | OpenAI-compatible root. Default: `https://api.openai.com/v1`. For xAI: `https://api.x.ai/v1`. |
| `CASECIRCLE_LLM_MODEL` | No | Model id. Default: `gpt-4o-mini`. xAI example: `grok-2-latest`. |
| `CASECIRCLE_LLM_MOCK` | Tests / demos | `1` returns chat replies labeled **Test-only mock reply (not a language model)** and document checks labeled **Demo AI**. |
| `CASECIRCLE_PROCESSING_TIMES_LIVE` | No | `0` disables live USCIS processing-times requests (default on, at most once a day per form/office). |

Example with a real OpenAI-compatible provider:

```bash
export CASECIRCLE_LLM_API_KEY="your-key-here"
export CASECIRCLE_LLM_BASE_URL="https://api.openai.com/v1"
export CASECIRCLE_LLM_MODEL="gpt-4o-mini"
python3 serve.py 8766
```

Example for xAI:

```bash
export CASECIRCLE_LLM_API_KEY="your-xai-key-here"
export CASECIRCLE_LLM_BASE_URL="https://api.x.ai/v1"
export CASECIRCLE_LLM_MODEL="grok-2-latest"
python3 serve.py 8766
```

Restart `serve.py` after changing variables. The browser does not need a key.

### What is sent after consent

- Selected form id and official form URL
- Checklist item labels and `ready` / `need` / `na`
- The question and prior turns for **that folder only**

Not sent: documents, receipt numbers, A-numbers, emails, usernames, filing dates, medical “expiry” guesses, or completeness percentages.

## AI Folder Builder

`#papers` (Folder Builder) is a guided chat:

1. Pick a form (I-485, I-130, I-751, N-400, I-765, I-131) or describe the case. The description is read **on the device** (`builder.js → inferFromDescription`) and ID numbers are masked before it is stored.
2. Short follow-up questions (`builder.js → QUESTIONS`) turn the `prepare.js` checklists into a personal list (`buildPlan`). Every item that is added or left out carries a reason. Optional **Tailor with AI** (`POST /api/folder-plan`) sends only the answers, the masked description and the checklist labels; the server never lets the model remove a required item.
3. Add documents per line: PDF (pdf.js), JPG/PNG (tesseract.js OCR), or pasted text. Both libraries are lazy-loaded from jsDelivr. Text is extracted **in the browser**; the extracted text is kept in IndexedDB (`casecircle-docs`), the file itself only in memory. **Files are never uploaded.**
4. **Check with AI** opens a per-document consent step: what is sent (that document's extracted text only, after masking), to which provider/model (from `GET /api/ai-status`), and a masked, editable preview. `redact.js` masks A-numbers, SSNs, USCIS receipt numbers and passport-like numbers; the server masks again (`folder_check.mask`). `POST /api/folder-check` returns `{status: matches|possible_issue|mismatch, summary, findings[{code, severity, message, fix}], facts}`; input and output are validated and the prompt lives only in `folder_check.py`.
5. **Folder readiness** (`readiness.js`, deterministic, 0–100): required items 40 · consistency 20 · dates 20 · evidence depth 20, plus the top 3 fixes ranked by the points they add. It is **not** an approval probability: "This scores how complete and consistent your folder is. It can't predict USCIS's decision." Name consistency across documents is checked on the device.
6. The side chat (`/api/folder-chat`) uses the personalized list; document findings (codes + messages, no document text) are shared only if the extra box is ticked.
7. **Download folder summary** opens a printable HTML page with the disclaimer.

`CASECIRCLE_LLM_MOCK=1` makes `/api/folder-check` and `/api/folder-plan` return realistic heuristic findings labeled **Demo AI** everywhere they appear.

## Check the wait and Insights

- `GET /api/processing-times?form=I-485&office=NBC` tries the USCIS processing-times JSON API at most once per day per form/office (`processing_times.py`, cache in `data/cache/`, gitignored), then falls back to `data/processing-times.json`. **As of 2026-11-05 egov.uscis.gov answers automated requests with a Cloudflare 403**, so no official numbers are bundled and the UI shows the official link plus "How to read USCIS processing times" instead of inventing numbers. `CASECIRCLE_PROCESSING_TIMES_LIVE=0` disables live attempts.
- `data/timelines.json` and `data/insights.json` are generated by `npm run build-data` (`scripts/build-data.mjs`, `timeline-extract.js`) from the bundled public r/USCIS + r/USCIS_FORUM titles: conservative regexes, reposts deduped, every count linking to its source posts. Medians and the 25th–75th percentile appear only when n ≥ 10, always labeled "From public posts, self-reported, not official".
- Check the wait works with zero users: official time (when available), public-post timelines with where you fall, typical next steps, and the "outside normal processing time" order (case inquiry date → e-Request → CIS Ombudsman → congressional office), using only verified official URLs.

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/api/ai-status` | GET | `{available, mock, provider, host, model}` — never a key |
| `/api/folder-check` | POST | per-document check; consent required; 30/min per client |
| `/api/folder-plan` | POST | optional AI tailoring of the list |
| `/api/folder-chat` | GET/POST | folder side chat (SSE) |
| `/api/processing-times` | GET | official times, cached daily, or `source: "none"` |

`serve.py` refuses to serve `.py` files, `__pycache__` and `data/cache/`, so prompts are not exposed.

## Find real help

The landing page points only to real free/low-cost resources (no paid lead-gen):

- DOJ Recognition & Accreditation: https://www.justice.gov/eoir/recognition-and-accreditation-program
- AILA lawyer search: https://www.ailalawyer.com/
- Immigration Advocates Network directory: https://www.immigrationadvocates.org/legaldirectory/
- USCIS legal services: https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/legal-services
- FTC immigration scam advice: https://consumer.ftc.gov/articles/how-avoid-immigration-scams-and-get-real-help
- USCIS avoid scams: https://www.uscis.gov/avoid-scams

## Tests

```bash
npm test
```

That runs the Node tests (logic, prepare, nav, sidebar, folder-chat, redaction regexes, readiness math, timeline extraction, builder/insights/copy) and the Python tests (folder chat, `/api/folder-check` + `/api/folder-plan` validation and mock HTTP, processing-times cache/fallback).

To smoke the UI against the mock (clearly test-only):

```bash
CASECIRCLE_LLM_MOCK=1 python3 serve.py 8766
```

Then open a folder in Prepare. Mock replies start with “Test-only mock reply”.

## Visual design

The UI follows the Paper "mineral" design. Tokens (colors, radii, font) are CSS custom properties at the top of `styles.css`. **Light theme only** — there is no dark mode. The font is Inter Tight from Google Fonts with the system sans as fallback, so the browser requests the font files from Google; no case data, documents, or checklist content is part of that request.

On screens 1100px and wider, Feed, a case group, and a post show a right sidebar ("Your case", saved posts, tools, community rules). Its data comes from `sidebar.js`, which only reads local state; `sidebar.test.js` covers it.
