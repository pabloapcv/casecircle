# CaseCircle website

The site is static files plus one same-origin chat endpoint. Both are served from this folder.

## Preview on your Mac (port 8766)

From `web/`:

```bash
python3 serve.py 8766
```

Open [http://127.0.0.1:8766/](http://127.0.0.1:8766/). The process binds **127.0.0.1 only**. `serve.py` also handles `POST /api/folder-chat` so the folder page and the language-model chat share that origin.

This branch includes the blank-page startup fix from [PR #2](https://github.com/pabloapcv/casecircle/pull/2). Keep using this `serve.py`; plain `python3 -m http.server` will not expose `/api/folder-chat`.

## Folder chat (language model)

The Prepare / folder view can send **this form’s checklist labels and status plus your question** to an OpenAI-compatible Chat Completions API. Folder papers, marks, and identifiers stay in the browser unless you opt in. Nothing is sent until you check the consent box.

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
