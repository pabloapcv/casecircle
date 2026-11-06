# CaseCircle website

The calm, bilingual companion for the USCIS wait / El acompañante bilingüe y tranquilo para la espera de USCIS.

CaseCircle is a free-to-start community and case companion for people with family-based and naturalization cases: compare your wait, gather papers on the device, prepare for interviews, and learn from moderated community experiences. It is **not** affiliated with USCIS, not legal advice, and not a filing service.

The site is static files plus one same-origin chat endpoint. Both are served from this folder.

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

Checklist UI uses neutral **Checklist progress** language (marked items), never “strength score” or evidence grading.

### Exact environment variables

Set these in the shell that starts `serve.py`, or in `web/.env` (that file is gitignored). **Never** put a key in client JavaScript, `localStorage`, the repo, or screenshots.

| Name | Required | Meaning |
| --- | --- | --- |
| `CASECIRCLE_LLM_API_KEY` | Yes, for a real model | Server-side bearer token. If unset (and mock is off), the UI says chat is unavailable. It does **not** fall back to canned answers presented as a model. |
| `CASECIRCLE_LLM_BASE_URL` | No | OpenAI-compatible root. Default: `https://api.openai.com/v1`. For xAI: `https://api.x.ai/v1`. |
| `CASECIRCLE_LLM_MODEL` | No | Model id. Default: `gpt-4o-mini`. xAI example: `grok-2-latest`. |
| `CASECIRCLE_LLM_MOCK` | Tests only | `1` returns replies labeled **Test-only mock reply (not a language model)**. |

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

That runs the existing Node tests, folder-chat payload tests, and Python tests for consent, PII, no-key, and the mock endpoint.

To smoke the UI against the mock (clearly test-only):

```bash
CASECIRCLE_LLM_MOCK=1 python3 serve.py 8766
```

Then open a folder in Prepare. Mock replies start with “Test-only mock reply”.

## Visual design

The UI follows the Paper "mineral" design. Tokens (colors, radii, font) are CSS custom properties at the top of `styles.css`. **Light theme only** — there is no dark mode. The font is Inter Tight from Google Fonts with the system sans as fallback, so the browser requests the font files from Google; no case data, documents, or checklist content is part of that request.

On screens 1100px and wider, Feed, a case group, and a post show a right sidebar ("Your case", saved posts, tools, community rules). Its data comes from `sidebar.js`, which only reads local state; `sidebar.test.js` covers it.
