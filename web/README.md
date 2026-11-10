# CaseCircle website

The calm, bilingual companion for the USCIS wait / El acompañante bilingüe y tranquilo para la espera de USCIS.

CaseCircle is a free-to-start community and case companion for people with family-based and naturalization cases: compare your wait, gather papers on the device, prepare for interviews, and learn from moderated community experiences. It is **not** affiliated with USCIS, not legal advice, and not a filing service.

The site is static files plus same-origin JSON endpoints served by `serve.py` (Python standard library only), with accounts, community posts and the waitlist stored in **Supabase** (Auth + Postgres with Row Level Security) when `SUPABASE_URL` is set, or in a local SQLite file otherwise (local runs and tests). Tools come first — **Folder Builder, Check the wait, Interview prep, Insights** — and the community is second.

## Preview on your Mac (port 8766)

From `web/`:

```bash
python3 serve.py            # 127.0.0.1:8766, database at web/data/casecircle.db
python3 serve.py 8766       # same, explicit port
```

Open [http://127.0.0.1:8766/](http://127.0.0.1:8766/). Locally the server binds **127.0.0.1**. When `PORT` is set (as hosts do) it binds `0.0.0.0` unless `HOST` says otherwise. The SQLite file is created and migrated on startup; `web/data/*.db` is gitignored and never served.

This branch includes the blank-page startup fix from [PR #2](https://github.com/pabloapcv/casecircle/pull/2). Keep using this `serve.py`; plain `python3 -m http.server` will not expose `/api/folder-chat`.

## Positioning

- Pitch (EN): Compare your USCIS wait with people like you, get your papers in order, and learn from people who have been there, in English or Spanish, without handing over your documents.
- Pitch (ES): Compara tu espera de USCIS con personas como tú, organiza tus papeles y aprende de quienes ya pasaron por esto, en español o inglés, sin entregar tus documentos.
- Always: community experiences, checklists, plain-language explanations, not legal advice, not affiliated with USCIS.
- Never: guaranteed approval, faster processing, expedite promises, “your case is strong,” official seals, or anything that predicts a decision.

## Pricing (no payment backend yet)

- **Free core:** feed, Check the wait, folder checklist, common questions, general interview tips, limited Ask-the-posts questions.
- **Case Pass:** one-time, per case, 12 months — Interview practice, Civics practice, the AI document check, folder chat, printable bilingual checklist, wait alerts. New accounts get every extra free for 3 days.
- Checkout is **not** wired. The UI shows **Coming soon / Join the waitlist**; `POST /api/waitlist` stores the email, language and source page in SQLite (table `waitlist`). The browser only remembers a "joined" flag.
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
2. Short follow-up questions (`builder.js → QUESTIONS`) turn the `prepare.js` checklists into a personal list (`buildPlan`). Every item that is added or left out carries a reason. Optional **Tailor with AI** (`POST /api/folder-plan`, gated after the trial) sends only the answers, the masked description and the checklist labels; the server never lets the model remove a required item.
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
| `/api/folder-plan` | POST | optional AI tailoring of the list; gated after the trial |
| `/api/folder-chat` | GET/POST | folder side chat (SSE) |
| `/api/processing-times` | GET | official times, cached daily, or `source: "none"` |

`serve.py` refuses to serve `.py` files, `__pycache__` and `data/cache/`, so prompts are not exposed.

## Accounts and community (server)

`community.py` (stdlib + `sqlite3`) owns accounts, posts, replies, votes, saves, reports, moderation and the waitlist.

- **Accounts:** email + password (`hashlib.scrypt`, n=2^14, r=8, p=1, 16-byte random salt per user; Python builds without OpenSSL scrypt, such as macOS system Python, fall back to PBKDF2-SHA256 with 600,000 iterations, tagged in the stored hash), public handle (3–20 letters/numbers/_; reserved words like `uscis`, `admin` refused), chosen case groups and optional case profile. Passwords need 10–200 characters and are refused when they're on a built-in list of common passwords, use only one or two distinct characters, or equal the email / handle. Sessions are random 256-bit tokens stored as SHA-256 hashes, sent as an `HttpOnly; SameSite=Lax` cookie (`Secure` behind HTTPS); they expire after **30 days idle** (sliding, refreshed at most hourly), and a new token is issued on every sign-in and password change (the old one is deleted). Password, token and hash comparisons are constant-time; sign-in errors never say whether the email exists.
- **Email confirmation:** sign-up emails a confirmation link (`#verify=TOKEN`, single use, 24 h). Until it's clicked the account can read, save, vote and use every tool, but posting and replying return `403 unverified`; the app shows a banner with a **Resend link** button (3/hour). Accounts that existed before this change start unconfirmed; `CASECIRCLE_ADMIN_EMAILS` accounts always count as confirmed.
- **Forgot password:** sign-in → *Forgot password?* always answers the same neutral message whether or not the email exists (3 emails/hour per address, 10 requests/hour per IP). The link (`#reset=TOKEN`, single use, 1 h) opens *Choose a new password*; saving it signs the account out everywhere, confirms the email (the link proved ownership) and emails a "password changed" notice. Tokens are 256-bit random values stored only as SHA-256 hashes; a new link revokes the previous unused one; email links use the URL fragment so tokens never reach server logs or `Referer`.
- **Account settings** (account menu → *Account settings*, `#settings`): change email (current password; the new address must confirm a link before it replaces the old one, and the old address gets a notice), change password (current password; signs out other devices), sign out of all devices, delete account (password + confirmation box).
- **Sign-in lockout:** after 5 wrong passwords for the same email from the same IP, sign-in waits 30 s, then doubles per further failure up to 15 min (`429 rate`, `retryAfter`). Unknown emails behave identically.
- **Reading is open** to everyone (signed-out visitors get a device-only "guest" so the tools work too). Posting, replying, voting, saving and reporting need an account; the UI shows a sign-in prompt instead.
- **CSRF:** every state-changing request must carry `X-CaseCircle: 1` (cannot be sent cross-site without a CORS preflight, which is never granted) and, when the browser sends one, a same-origin `Origin`.
- **Rate limits (in memory, per IP or per user):** sign-up 5/h per IP, sign-in 10/15 min per IP and per email (plus the lockout above), email/token endpoints 30/15 min per IP, account changes 10/15 min per user, posts 1/30 s and 20/day, replies 1/8 s and 200/day, votes/saves 60/min, reports 20/h, waitlist 5/h per IP.
- **Content:** length limits (title 8–140, post 20–5,000, reply 8–3,000 chars), control characters stripped, and the same rules as the client (`logic.js evaluate`) run on the server: receipt numbers, A-numbers, SSNs, passport numbers and abuse are refused; scam phrases are held for review. Text is stored as plain text and the client renders every field through its HTML escaper; the CSP blocks inline scripts.
- **Moderation:** a post or reply with `CASECIRCLE_REPORT_HIDE_THRESHOLD` (default 3) open reports is hidden automatically. Accounts whose email is in `CASECIRCLE_ADMIN_EMAILS` see **Review queue** (account menu) and can hide, unhide, remove or dismiss reports.
- **Delete account** (Account settings → Delete) needs the password and `confirm: true`; it removes email, password, handle, sessions and tokens and keeps posts as "Deleted member".
- The **App Review demo** account and the old browser-only posts are gone from production paths (old local data is dropped on load). The "Public titles" Reddit section is unchanged.
- Documents are **never** uploaded: the folder checklist, readiness score and adding documents still work signed out. The AI document check, folder chat, and Tailor with AI need a signed-in account in the free trial or with a Case Pass (`POST` returns `401 signin` or `402 extras_locked`).

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/healthz` | GET | `{ok:true}` after opening the database |
| `/api/me` | GET / POST | current account (+ group member counts) / update locale, groups, case profiles |
| `/api/signup`, `/api/login`, `/api/logout` | POST | session cookie |
| `/api/account/delete` | POST | `{password, confirm: true}` |
| `/api/verify` | POST | `{token}` from the `#verify=` link (confirms sign-up or an email change) |
| `/api/verify/resend` | POST | signed in; re-sends the confirmation link(s) |
| `/api/password/forgot` | POST | `{email}` → always `{ok: true}` |
| `/api/password/reset` | POST | `{token, password}` → signs out everywhere |
| `/api/account/password` | POST | `{current, password}` → new session cookie, other devices signed out |
| `/api/account/email` | POST | `{email, password}` → sets `pendingEmail`, sends a link to the new address |
| `/api/account/logout-all` | POST | deletes every session of the account |
| `/api/handle-check?handle=` | GET | `{issue: null\|taken\|reserved\|invalid}` |
| `/api/posts` | GET / POST | list: `group`, `groups=a,b`, `type`, `sort=new\|top\|unanswered`, `q`, `author=me`, `saved=1`, `limit`, `offset` / create |
| `/api/posts/<id>` | GET | post + replies |
| `/api/posts/<id>/replies`, `/save`, `/helpful` | POST | reply / toggle save / asker marks a reply helpful |
| `/api/vote`, `/api/report` | POST | `{target: "p12" \| "c34"}` |
| `/api/mod/queue`, `/api/mod` | GET / POST | admins only; `{target, action: hide\|unhide\|remove\|dismiss}` |
| `/api/waitlist` | POST | `{email, lang, source}` |

**Privacy and Terms pages** (`#privacy`, `#terms`, copy in `auth-text.js`, English and Spanish) are a **draft for attorney review** before launch. They state what is stored (account email, hashed password, handle, groups/profile, posts, saves, votes, reports, waitlist email), that documents never leave the device, and that CaseCircle is not legal advice.

## Supabase (accounts + data that survive deploys)

When `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set, `supa.py` serves every account/community/waitlist route instead of SQLite. Nothing lives on the Render disk any more, so deploys and restarts no longer wipe accounts.

- **Who talks to Supabase:** only the Python server, with the project's public **publishable** key (`sb_publishable_…`; the legacy `anon` key also works as `SUPABASE_ANON_KEY`). There is no service-role/secret key and no database password anywhere. The browser keeps talking to our own `/api/*`, so the UI, CSP and CSRF guard are unchanged.
- **Sign-in:** Supabase Auth REST — `/auth/v1/signup`, `/auth/v1/token?grant_type=password|refresh_token`, `/auth/v1/logout`, `/auth/v1/recover`, `/auth/v1/user`. The access and refresh tokens are kept in `HttpOnly; SameSite=Lax` cookies (`cc_at`, `cc_rt`, `Secure` over HTTPS); an access token that is about to expire is refreshed once per request (parallel requests share one refresh).
- **Data:** PostgREST calls carry the signed-in user's JWT, so the **RLS policies are the security boundary** (anyone could call PostgREST directly with the public key and their own login). Schema + policies: `supabase/migrations/*.sql`. Users can only read/write their own `accounts` row (locale, groups, case profiles — never `is_admin`, `trial_started_at` or `pass_until`); posts and replies are public when live, writable only by their author; votes, saves and reports are per user; the waitlist is insert-only. Counters (votes, reply counts, reputation, group sizes) are kept by triggers in the unexposed `private` schema, and the same identifier/abuse/scam rules and post/reply rate limits run in the database too.
- **Trial:** starts at account creation (`accounts.trial_started_at`), length still `CASECIRCLE_TRIAL_DAYS` (default 3); `GATED_FEATURES`, 401 signed-out and 402 trial-ended are unchanged.
- **Admin:** `accounts.is_admin`, set only with SQL (Supabase SQL editor): `update public.accounts set is_admin = true where user_id = (select id from auth.users where email = 'pabloapcv@gmail.com');` `CASECIRCLE_ADMIN_EMAILS` is not used in Supabase mode, and the owner-email bypass only applies with that flag (an email can be auto-confirmed without proof).
- **Emails** (confirm sign-up, reset password, change email) are sent by Supabase, not `mailer.py`. Supabase's built-in sender only delivers to the project team's addresses and allows **2 emails per hour**; for real users set up custom SMTP (e.g. Resend) under Authentication → Emails → SMTP. If "Confirm email" is on, sign-up shows "Check your email" and sign-in before confirming returns `403 unconfirmed`. Email links land on `/#access_token=…&type=signup|recovery|email_change`, which the page hands to `/api/verify` or the reset form.
- **Dashboard settings:** Authentication → URL Configuration: Site URL `https://casecircle.us`; Redirect URLs `https://casecircle.us/**` and `https://casecircle.onrender.com/**`. Set `CASECIRCLE_PUBLIC_ORIGIN` so `redirect_to` uses the real domain.
- **Free plan:** Supabase may pause a Free project after a week of low activity (restore it from the dashboard within 90 days); paid plans are never paused.

| Name | Needed | Value |
| --- | --- | --- |
| `SUPABASE_URL` | for Supabase | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | for Supabase | the project's publishable key (public, but keep it in env, not in code) |

Without these two variables everything below (SQLite, `mailer.py`) applies as before.

### Continue with Google

The sign-in and sign-up screens show a **Continue with Google** button (Google's standard white button, EN/ES) whenever the Google provider is switched on in Supabase (`/api/me` reports `providers.google`, read from Supabase's public `/auth/v1/settings` and cached 5 minutes). With SQLite accounts there is no Google sign-in.

**How it works (server-side PKCE, no Supabase JS in the browser):**

1. `GET /api/auth/google?locale=es&next=/#feed` makes a random `code_verifier`, keeps it in a 10-minute `cc_oauth` cookie (`HttpOnly; SameSite=Lax; Secure` over HTTPS) and redirects to `https://<project-ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=<origin>/auth/callback&code_challenge=<S256>&code_challenge_method=s256`. Only the challenge leaves the server. If the request arrives on a host that isn't in `CASECIRCLE_PUBLIC_ORIGIN`, it is first bounced to the first configured origin, so the callback lands where the cookie is.
2. Google → Supabase → `GET /auth/callback?code=…`. The server posts `{auth_code, code_verifier}` to `/auth/v1/token?grant_type=pkce`, sets `cc_at`/`cc_rt` exactly like a password sign-in, clears `cc_oauth` and redirects to `next` with `?signin=google`. Errors come back as `?signin_error=google_cancelled|google_expired|google_failed|google_off|google_unavailable`, which the page shows in English or Spanish on the sign-in screen (expired/missing verifier, a code minted for another browser, a cancelled Google screen and a Supabase outage are all covered).
3. **First-time Google users:** the existing `on_auth_user_created` trigger gives them an accounts row with a placeholder handle (`user_` + 10 hex digits of their id). Until they finish their profile the server treats them as signed out everywhere except `/api/me`, `/api/handle-check`, `/api/logout` and `POST /api/auth/complete-profile`, and the page shows **Finish your profile**: public name (same rules as sign-up) plus the same two agreements (community rules; not legal advice / not affiliated with USCIS). That POST keeps the `X-CaseCircle` + same-origin CSRF check and calls `public.complete_profile()` (migration `20261110220000_complete_profile.sql`), which sets the name and groups and **starts the 3-day trial at that moment**. It only works while the placeholder handle is still there.
4. **Same email as an existing password account:** Supabase links the Google identity to the existing (confirmed) user, so the same auth user and the same `accounts` row come back — same handle, same trial, same admin flag.
5. Google-only accounts have no CaseCircle password: Account settings hides the change-email/change-password forms and deleting the account asks for the public name instead of a password.

**Setup (once):**

1. **Google Cloud Console** → APIs & Services → OAuth consent screen: External, app name CaseCircle, support email, authorized domain `casecircle.us` (and `supabase.co` while Supabase's domain is shown), scopes `openid`, `email`, `profile` only.
2. Credentials → Create credentials → **OAuth client ID** → Web application. Authorized JavaScript origins: `https://casecircle.us`. Authorized redirect URI: **`https://aucdxtyzyilcjqtgxrqf.supabase.co/auth/v1/callback`** (Supabase's callback, not ours). Keep the client secret out of the repo.
3. **Supabase** → Authentication → Sign In / Providers → **Google**: enable, paste the Client ID and Client Secret, save. URL Configuration already allows `https://casecircle.us/**` and `https://casecircle.onrender.com/**`, which covers `/auth/callback`.
4. Apply `supabase/migrations/20261110220000_complete_profile.sql` (SQL editor or `supabase db push`). Without it, Google sign-in works but **Finish your profile** answers 503.
5. Until Google verifies the app (and the domain), Google's screen names the Supabase domain instead of CaseCircle; a custom auth domain or verification fixes that.

## Deploy

The repo root has a `render.yaml` Blueprint: one Python web service (`rootDir: web`, `python3 serve.py`, health check `/healthz`) with a 1 GB persistent disk at `/var/data` for SQLite. On Render: **New → Blueprint**, pick the repo, fill the `sync: false` values, deploy. Disks need a paid instance (the Blueprint uses `starter`) and keep the service at **one instance**; deploys have a few seconds of downtime. Render snapshots the disk daily.

Any host that runs a long-lived Python 3.10+ process with a persistent volume works the same way: `cd web && python3 serve.py`, with these variables:

| Name | Needed | Value |
| --- | --- | --- |
| `PORT` | set by the host | port to listen on (binds `0.0.0.0` when set) |
| `HOST` | no | override bind address |
| `CASECIRCLE_DB_PATH` | **yes** in production | e.g. `/var/data/casecircle.db` on the persistent disk (default `web/data/casecircle.db`) |
| `CASECIRCLE_TRUST_PROXY` | yes behind a proxy | `1`: trust `X-Forwarded-For` / `-Proto` / `-Host` (rate limits per real IP, Secure cookie) |
| `CASECIRCLE_COOKIE_SECURE` | recommended | `1`: always mark the session cookie `Secure` |
| `CASECIRCLE_ADMIN_EMAILS` | yes | comma-separated emails that get the review queue |
| `CASECIRCLE_PUBLIC_ORIGIN` | **yes** in production | e.g. `https://casecircle.app` (comma-separated; the first one builds email links, so links never trust the request `Host`) |
| `CASECIRCLE_EMAIL_PROVIDER` | **yes** in production | `resend`, `smtp` or `console` (default; local only — prints emails to the server log and writes them to `web/data/outbox/`) |
| `CASECIRCLE_EMAIL_FROM` | **yes** with resend/smtp | e.g. `CaseCircle <hello@mail.casecircle.app>`; the domain must be verified with your provider (SPF + DKIM) |
| `RESEND_API_KEY` | with `resend` | API key from resend.com (sending access only is enough) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | with `smtp` | any SMTP relay that supports STARTTLS (port default 587) |
| `CASECIRCLE_OUTBOX_DIR` | no | console mode: where `.txt`/`.html` copies go (default `web/data/outbox/`, gitignored, never served) |
| `CASECIRCLE_EMAIL_SYNC` | no | `1`: send in the request thread (tests). Default sends on a background thread so response time doesn't reveal whether an account exists |
| `CASECIRCLE_REPORT_HIDE_THRESHOLD` | no | open reports before auto-hide (default 3) |
| `CASECIRCLE_TRIAL_DAYS` | no | free-trial length for the extras (Interview practice, Civics practice, AI document check, folder chat) on new accounts; default `3`, clamped 0–90 |
| `CASECIRCLE_LLM_API_KEY`, `CASECIRCLE_LLM_BASE_URL`, `CASECIRCLE_LLM_MODEL` | for real AI | see "Folder chat" above; without a key the AI parts say they're unavailable |
| `CASECIRCLE_LLM_MOCK` | **never in production** | test-only canned replies |

Security headers on every response: `Content-Security-Policy` (self + Google Fonts + jsDelivr for pdf.js/tesseract.js + tesseract language data + `blob:` workers; one hashed inline handler for the printable summary's Print button), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`, and HSTS when served over HTTPS. CSS/JS/HTML keep `Cache-Control: no-cache, must-revalidate`. Directory listings, `.py`, dotfiles, `scripts/`, `data/cache/`, `data/outbox/`, `data/premium/` (gated extras content) and database files are never served (paths are percent-decoded before the check).

### Email

`mailer.py` sends five bilingual (en/es) emails, plain text + HTML in the app's light mineral palette: confirm email, confirm new email, reset password, password changed, email changed. Each carries the "not legal advice, not affiliated with USCIS" footer. Outside console mode the log only records the kind, provider and recipient **domain** (`sent verify via resend to *@gmail.com`) — never addresses, links, tokens or keys. Locally, with no settings, open the newest file in `web/data/outbox/` (or the server log) and paste the link into the browser.

Backups: besides Render's daily disk snapshots, copy the database with `sqlite3 /var/data/casecircle.db ".backup /var/data/backup.db"` from the service shell.

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

That runs the Node tests (logic, prepare, nav, sidebar, folder-chat, redaction regexes, readiness math, timeline extraction, builder/insights/copy, API client + bilingual auth copy) and the Python tests (folder chat, `/api/folder-check` + `/api/folder-plan` validation and mock HTTP, processing-times cache/fallback, `mailer_test.py`: templates, escaping, console/Resend/SMTP delivery and quiet logs, `supa_test.py`: the Supabase backend against a fake Auth/PostgREST (cookies, refresh rotation, error mapping, signup/confirm, trial/pass/admin gating, Continue with Google: PKCE redirect, callback exchange, finish-your-profile, error paths), and `community_test.py`: accounts, scrypt hashing, sessions, email confirmation, forgot/reset, settings, lockout, idle expiry, CSRF, posts, replies, filters, votes/saves/helpful, reports + admin, rate limits, waitlist, restart persistence, headers, migrations).

To smoke the UI against the mock (clearly test-only):

```bash
CASECIRCLE_LLM_MOCK=1 python3 serve.py 8766
```

Then open a folder in Prepare. Mock replies start with “Test-only mock reply”.

## Visual design

The UI follows the Paper "mineral" design. Tokens (colors, radii, font) are CSS custom properties at the top of `styles.css`. **Light theme only** — there is no dark mode. The font is Inter Tight from Google Fonts with the system sans as fallback, so the browser requests the font files from Google; no case data, documents, or checklist content is part of that request.

On screens 1100px and wider, Feed, a case group, and a post show a right sidebar ("Your case", saved posts, tools, community rules). "Your case" comes from `sidebar.js` (local/account case profile); saved posts come from `GET /api/posts?saved=1`.


### Freemium: extras and the free trial

Free for everyone: the folder checklist (marks, on-device documents, readiness score), Check the wait, the community, common questions, and general interview tips.

Extras (server-gated, listed in `entitlements.GATED_FEATURES` — add an id there and in `extras-text.js` to gate another feature later): **Interview practice** (mock interview prompts from the sections of your forms, a what-to-bring checklist matched to your folder, tips with official citations), **Civics practice** (official 2025 and 2008 USCIS banks, practice test with the real pass/stop rules, study by topic, flashcards, reading/writing vocabulary), the **AI document check**, **folder chat**, and **Tailor with AI** (`POST /api/folder-plan`).

- One check, `entitlements.has_extras(user, admin=…)` / `entitlements.user_gate(user, feature, admin=…)`: admin (`CASECIRCLE_ADMIN_EMAILS`, or the owner address once verified) **or** inside the trial **or** `users.pass_until` in the future. Features not in `GATED_FEATURES` stay open, including when signed out.
- Trial: starts at sign-up (`users.trial_started_at`); accounts older than the trial start it on their next `/api/me`. Length `CASECIRCLE_TRIAL_DAYS` (default 3). `/api/me` returns `user.extras` with `access`, `reason` (`admin` / `trial` / `paid` / `expired` / `signin`), `daysLeft`, and `gatedFeatures`.
- `GET /api/extras`, `/api/extras/civics?version=2025|2008`, `/api/extras/interview?form=i-485|i-130|i-751|n-400`, `POST /api/folder-check`, `POST /api/folder-chat`, and `POST /api/folder-plan` return `401 signin` or `402 extras_locked` when not entitled. Content for interview/civics lives in `data/premium/`, which is never served statically. `GET /api/folder-chat` and `GET /api/ai-status` (provider availability) stay open.
- After the trial the extras point to the Case Pass waitlist. There is no checkout. A payment provider can later call `entitlements.grant_pass(conn, user_id, until)` from a verified webhook.
- `scripts/build_civics.py <dir with the official USCIS files>` regenerates `data/premium/civics.json` (check `UPDATES` against uscis.gov/citizenship/testupdates first).
- `data/form-editions.json` is the accepted-editions table used by the document check; update it from each form's official page.

## Case twins and approval cards

- **Case twins** (`twins.js`, `/api/twins`, migration `20261110230000_case_twins.sql`): signed-in people opt in with form + USCIS office + filing month (never the day, receipt numbers, A-numbers or email). `public.my_case_twins()` (security definer) returns only rough counts — 0–1 others is shown as "be the first", 2–9 exact, then tens ("10+", "20+"…), capped at "50+" — plus up to 9 public handles. Turning it off deletes the row. Signed-out visitors see a free teaser. Until the migration is applied `/api/twins` is a 404 and the UI hides the section.
- **Approval cards** (`approval-card.js`): "Mark approved" saves the approval month on the case profile, then a light-mode 1080×1080 PNG is drawn client-side (form, "Approved in N months", optional office, optional first name/handle, "not affiliated with USCIS"). Download, Web Share, WhatsApp, Facebook, and an optional celebration post. Nothing is uploaded to make the card.
