"""Ask Reddit Q&A endpoint.

Retrieves relevant threads from reddit_threads, uses LLM to synthesize an answer
in the user's language (EN/ES), and returns citations with proper disclaimers.

POST /api/reddit-ask
  Body: { question, lang?, form?, office?, step? }
  Response: { answer, citations, threadsUsed, fallback, disclaimer }

GET /api/reddit-ask/status
  Response: { available, reason, dailyLimit, used }

POST /api/reddit-ingest - Start background ingestion (admin/token)
GET /api/reddit-ingest/status - Check ingestion job status (admin/token)
POST /api/reddit-ingest/push - Push pre-fetched threads (admin/token)

Degrades gracefully when LLM key is not set, returning title-matching results only.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Iterator

import community

# Rate limits (configurable via env)
DAILY_LIMIT_ANONYMOUS = 5
DAILY_LIMIT_SIGNED_IN = 20
MAX_QUESTION_LEN = 500
MAX_THREADS = 20
LLM_TIMEOUT = 30
MAX_OUTPUT_TOKENS = 1000

# Disclaimers (bilingual)
DISCLAIMERS = {
    "en": (
        "These are self-reported experiences from public Reddit posts, not official USCIS data. "
        "This is not legal advice and is not affiliated with USCIS. "
        "For official information, visit uscis.gov. For case-specific questions, consult a licensed attorney "
        "or DOJ-accredited representative."
    ),
    "es": (
        "Estas son experiencias auto-reportadas de publicaciones públicas de Reddit, no datos oficiales de USCIS. "
        "Esto no es asesoría legal y no está afiliado a USCIS. "
        "Para información oficial, visita uscis.gov. Para preguntas sobre tu caso, consulta a un abogado "
        "o representante acreditado por el DOJ."
    ),
}

FALLBACK_MESSAGE = {
    "en": (
        "I couldn't find enough relevant threads to synthesize an answer. "
        "Here are the closest matching threads I found. "
        "These are self-reported experiences, not official data."
    ),
    "es": (
        "No encontré suficientes hilos relevantes para sintetizar una respuesta. "
        "Aquí están los hilos más cercanos que encontré. "
        "Estas son experiencias auto-reportadas, no datos oficiales."
    ),
}

NO_THREADS_MESSAGE = {
    "en": (
        "I couldn't find any threads matching your question. "
        "Try rephrasing or using different keywords like form numbers (I-485, N-400) "
        "or process steps (biometrics, interview)."
    ),
    "es": (
        "No encontré hilos que coincidan con tu pregunta. "
        "Intenta reformular o usar palabras clave diferentes como números de formulario (I-485, N-400) "
        "o pasos del proceso (biometría, entrevista)."
    ),
}

LLM_UNAVAILABLE_MESSAGE = {
    "en": (
        "The AI answer service is temporarily unavailable. "
        "Here are relevant threads you can read directly. "
        "These are self-reported experiences, not official data."
    ),
    "es": (
        "El servicio de respuestas con IA no está disponible temporalmente. "
        "Aquí están los hilos relevantes que puedes leer directamente. "
        "Estas son experiencias auto-reportadas, no datos oficiales."
    ),
}


def env_name(name: str, default: str = "") -> str:
    return str(os.environ.get(name, default) or default).strip()


def api_key() -> str:
    return env_name("CASECIRCLE_LLM_API_KEY")


def base_url() -> str:
    return env_name("CASECIRCLE_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")


def model_name() -> str:
    return env_name("CASECIRCLE_LLM_MODEL", "gpt-4o-mini")


def daily_limit_anonymous() -> int:
    try:
        return int(env_name("CASECIRCLE_REDDIT_ASK_LIMIT_ANON", str(DAILY_LIMIT_ANONYMOUS)))
    except ValueError:
        return DAILY_LIMIT_ANONYMOUS


def daily_limit_signed_in() -> int:
    try:
        return int(env_name("CASECIRCLE_REDDIT_ASK_LIMIT_USER", str(DAILY_LIMIT_SIGNED_IN)))
    except ValueError:
        return DAILY_LIMIT_SIGNED_IN


def llm_available() -> bool:
    return bool(api_key())


def hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


def hash_question(question: str) -> str:
    return hashlib.sha256(question.lower().strip().encode("utf-8")).hexdigest()


def client_ip(handler: Any) -> str:
    if env_name("CASECIRCLE_TRUST_PROXY") == "1":
        forwarded = handler.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
    return handler.client_address[0] if handler.client_address else "unknown"


def detect_language(text: str) -> str:
    """Detect if text is likely Spanish based on common patterns."""
    spanish_patterns = [
        r"\b(qué|cómo|cuánto|cuándo|dónde|quién|por qué)\b",
        r"\bentrevista\b", r"\bciudadanía\b", r"\bresidencia\b",
        r"\bpermiso\b", r"\btrabajo\b", r"\bbiometría\b",
        r"\baprobación\b", r"\bformulario\b", r"\bsolicitud\b",
        r"\bpreguntan\b", r"\btarda\b", r"\btiempo\b",
    ]
    for pattern in spanish_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return "es"
    return "en"


def search_threads(
    question: str,
    lang: str = "en",
    form: str | None = None,
    office: str | None = None,
    step: str | None = None,
    limit: int = MAX_THREADS,
) -> list[dict[str, Any]]:
    """Search reddit_threads using Supabase bilingual full-text search."""
    supabase = community.supabase()
    if not supabase:
        return []
    
    # Auto-detect language if not explicitly Spanish
    detected_lang = detect_language(question) if lang != "es" else "es"
    
    try:
        from supa import call
        # Use the bilingual search function
        status, data, _ = call(
            "POST",
            "/rest/v1/rpc/search_reddit_threads_bilingual",
            body={
                "query": question,
                "lang": detected_lang,
                "form_filter": form,
                "office_filter": office,
                "step_filter": step,
                "max_results": limit,
            },
        )
        if status == 200 and isinstance(data, list):
            return data
    except Exception as e:
        print(f"Bilingual search error: {e}")
    
    # Fallback to basic search
    try:
        from supa import call
        status, data, _ = call(
            "POST",
            "/rest/v1/rpc/search_reddit_threads",
            body={
                "query": question,
                "form_filter": form,
                "office_filter": office,
                "step_filter": step,
                "max_results": limit,
            },
        )
        if status == 200 and isinstance(data, list):
            return data
    except Exception as e:
        print(f"Basic search error: {e}")
    
    return []


def log_usage(
    handler: Any,
    question: str,
    form: str | None,
    office: str | None,
    step: str | None,
    threads_used: int,
    llm_used: bool,
) -> None:
    """Log usage to reddit_ask_usage table."""
    supabase = community.supabase()
    if not supabase:
        return
    
    try:
        from supa import call, jwt_claims, read_cookies
        at, _ = read_cookies(handler)
        claims = jwt_claims(at) if at else {}
        user_id = claims.get("sub") if claims else None
        ip = client_ip(handler)
        ip_hash = hash_ip(ip) if not user_id else None
        
        body = {
            "ip_hash": ip_hash,
            "user_id": user_id,
            "question_preview": question[:100],
            "form_filter": form,
            "office_filter": office,
            "step_filter": step,
            "threads_used": threads_used,
            "llm_used": llm_used,
        }
        
        call("POST", "/rest/v1/reddit_ask_usage", body=body)
    except Exception as e:
        print(f"Usage logging error: {e}")


def check_rate_limit(handler: Any) -> tuple[bool, int, int]:
    """Check if user is within rate limit. Returns (allowed, limit, used)."""
    supabase = community.supabase()
    if not supabase:
        return True, daily_limit_anonymous(), 0
    
    try:
        from supa import call, jwt_claims, read_cookies
        at, _ = read_cookies(handler)
        claims = jwt_claims(at) if at else {}
        user_id = claims.get("sub") if claims else None
        
        ip = client_ip(handler)
        ip_hash = hash_ip(ip) if not user_id else None
        
        limit = daily_limit_signed_in() if user_id else daily_limit_anonymous()
        
        status, data, _ = call(
            "POST",
            "/rest/v1/rpc/count_reddit_ask_today",
            body={"p_ip_hash": ip_hash, "p_user_id": user_id},
        )
        
        used = data if isinstance(data, int) else 0
        return used < limit, limit, used
    except Exception as e:
        print(f"Rate limit check error: {e}")
        return True, daily_limit_anonymous(), 0


def format_thread_for_llm(thread: dict[str, Any]) -> str:
    """Format a thread for the LLM context."""
    parts = [f"Title: {thread.get('title', '')}"]
    
    selftext = thread.get("selftext", "")
    if selftext:
        parts.append(f"Post: {selftext[:1000]}")
    
    comments = thread.get("top_comments", [])
    if comments:
        comment_texts = [c.get("body", "")[:500] for c in comments[:3] if c.get("body")]
        if comment_texts:
            parts.append("Top comments: " + " | ".join(comment_texts))
    
    return "\n".join(parts)


def format_citation(thread: dict[str, Any]) -> dict[str, Any]:
    """Format a thread for citation in the response."""
    return {
        "title": thread.get("title", ""),
        "subreddit": thread.get("subreddit", ""),
        "permalink": f"https://www.reddit.com{thread.get('permalink', '')}",
        "score": thread.get("score", 0),
        "numComments": thread.get("num_comments", 0),
        "createdUtc": thread.get("created_utc", ""),
        "formTags": thread.get("form_tags", []),
        "stepTags": thread.get("step_tags", []),
    }


def build_system_prompt(lang: str) -> str:
    language = "Spanish" if lang == "es" else "English"
    return f"""You are the CaseCircle Reddit Q&A assistant. You help people understand what others have shared about their USCIS immigration experiences on Reddit.

CRITICAL RULES:
1. You MUST paraphrase everything. Never quote anyone directly or use identifying details.
2. Never mention usernames, authors, or any identifying information.
3. Present information as "people reported", "some described", "experiences varied" - never as facts or predictions.
4. Never present anything as approval odds, predictions, or guarantees.
5. Never give legal advice. Always recommend consulting a licensed attorney or DOJ-accredited representative.
6. Always remind that these are self-reported experiences, not official USCIS data.
7. Point users to uscis.gov for official information.
8. If threads mention specific timelines, present them as ranges people reported, not as expectations.
9. Acknowledge when experiences varied or information is limited.
10. Reply in {language}.

FORMAT:
- Start with a direct answer to the question based on what people shared.
- Cover common themes, typical experiences reported, and timeline ranges (when available).
- Note what varied across experiences.
- Keep the answer concise (2-4 paragraphs).
- End with a brief reminder that this is not official information.

If the threads don't have enough relevant information, say so honestly."""


def build_user_prompt(question: str, threads: list[dict[str, Any]], lang: str) -> str:
    thread_summaries = []
    for i, t in enumerate(threads[:8], 1):
        thread_summaries.append(f"[Thread {i}]\n{format_thread_for_llm(t)}")
    
    threads_text = "\n\n".join(thread_summaries)
    
    return f"""Question: {question}

Based on the following {len(threads)} public Reddit threads, synthesize an answer. Remember to paraphrase everything and never quote or identify anyone.

{threads_text}

Provide a helpful answer in {"Spanish" if lang == "es" else "English"} based on what these threads contain."""


def call_llm(question: str, threads: list[dict[str, Any]], lang: str) -> str | None:
    """Call the LLM to synthesize an answer."""
    if not api_key():
        return None
    
    url = base_url() + "/chat/completions"
    body = json.dumps({
        "model": model_name(),
        "messages": [
            {"role": "system", "content": build_system_prompt(lang)},
            {"role": "user", "content": build_user_prompt(question, threads, lang)},
        ],
        "max_tokens": MAX_OUTPUT_TOKENS,
        "temperature": 0.3,
    }).encode("utf-8")
    
    headers = {
        "Authorization": f"Bearer {api_key()}",
        "Content-Type": "application/json",
    }
    
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    
    try:
        with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if choices and choices[0].get("message", {}).get("content"):
                return choices[0]["message"]["content"].strip()
    except Exception as e:
        print(f"LLM error: {e}")
    
    return None


def handle_status(handler: Any, port: int) -> None:
    """GET /api/reddit-ask/status - Check availability and limits."""
    allowed, limit, used = check_rate_limit(handler)
    
    payload = {
        "available": llm_available(),
        "reason": "ready" if llm_available() else "no_key",
        "dailyLimit": limit,
        "used": used,
        "remaining": max(0, limit - used),
    }
    
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def handle_ask(handler: Any, port: int) -> None:
    """POST /api/reddit-ask - Ask a question."""
    # Check rate limit
    allowed, limit, used = check_rate_limit(handler)
    if not allowed:
        _json_error(handler, 429, {
            "error": "rate_limit",
            "message": "Daily question limit reached. Try again tomorrow.",
            "limit": limit,
            "used": used,
        })
        return
    
    # Parse request body
    ctype = (handler.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ctype != "application/json":
        _json_error(handler, 415, {"error": "invalid_content_type"})
        return
    
    try:
        length = int(handler.headers.get("Content-Length") or "0")
    except ValueError:
        length = 0
    
    if length <= 0 or length > 16384:
        _json_error(handler, 400, {"error": "invalid_body"})
        return
    
    try:
        data = json.loads(handler.rfile.read(length).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        _json_error(handler, 400, {"error": "invalid_json"})
        return
    
    # Validate inputs
    question = str(data.get("question", "")).strip()
    if not question or len(question) > MAX_QUESTION_LEN:
        _json_error(handler, 400, {"error": "invalid_question"})
        return
    
    lang = str(data.get("lang", "en"))
    if lang not in ("en", "es"):
        lang = "en"
    
    form = data.get("form")
    office = data.get("office")
    step = data.get("step")
    
    # Validate optional filters
    if form and not re.match(r"^[A-Z]-\d{2,4}[A-Z]?$", str(form)):
        form = None
    if office and not re.match(r"^[a-z-]{3,40}$", str(office)):
        office = None
    if step and not re.match(r"^[a-z-]{3,30}$", str(step)):
        step = None
    
    # Search for relevant threads (with language support)
    threads = search_threads(question, lang, form, office, step)
    
    # Build response
    response: dict[str, Any] = {
        "question": question,
        "lang": lang,
        "disclaimer": DISCLAIMERS[lang],
        "citations": [],
        "threadsUsed": 0,
        "fallback": False,
        "answer": "",
    }
    
    if not threads:
        # No threads found
        response["answer"] = NO_THREADS_MESSAGE[lang]
        response["fallback"] = True
        log_usage(handler, question, form, office, step, 0, False)
    elif not llm_available():
        # LLM not available - fallback to showing threads directly
        response["answer"] = LLM_UNAVAILABLE_MESSAGE[lang]
        response["citations"] = [format_citation(t) for t in threads[:8]]
        response["threadsUsed"] = len(threads[:8])
        response["fallback"] = True
        log_usage(handler, question, form, office, step, len(threads[:8]), False)
    elif len(threads) < 3:
        # Too few threads for good synthesis - fallback
        response["answer"] = FALLBACK_MESSAGE[lang]
        response["citations"] = [format_citation(t) for t in threads]
        response["threadsUsed"] = len(threads)
        response["fallback"] = True
        log_usage(handler, question, form, office, step, len(threads), False)
    else:
        # Use LLM to synthesize answer
        llm_answer = call_llm(question, threads[:8], lang)
        
        if llm_answer:
            response["answer"] = llm_answer
            response["citations"] = [format_citation(t) for t in threads[:8]]
            response["threadsUsed"] = len(threads[:8])
            response["fallback"] = False
            log_usage(handler, question, form, office, step, len(threads[:8]), True)
        else:
            # LLM call failed - fallback
            response["answer"] = LLM_UNAVAILABLE_MESSAGE[lang]
            response["citations"] = [format_citation(t) for t in threads[:8]]
            response["threadsUsed"] = len(threads[:8])
            response["fallback"] = True
            log_usage(handler, question, form, office, step, len(threads[:8]), False)
    
    # Send response
    body = json.dumps(response, ensure_ascii=False).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def handle_feedback(handler: Any, port: int) -> None:
    """POST /api/reddit-ask/feedback - Submit feedback (helpful/not helpful)."""
    ctype = (handler.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ctype != "application/json":
        _json_error(handler, 415, {"error": "invalid_content_type"})
        return
    
    try:
        length = int(handler.headers.get("Content-Length") or "0")
    except ValueError:
        length = 0
    
    if length <= 0 or length > 1024:
        _json_error(handler, 400, {"error": "invalid_body"})
        return
    
    try:
        data = json.loads(handler.rfile.read(length).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        _json_error(handler, 400, {"error": "invalid_json"})
        return
    
    helpful = data.get("helpful")
    question = str(data.get("question", ""))
    
    if helpful is None or not isinstance(helpful, bool) or not question:
        _json_error(handler, 400, {"error": "invalid_feedback"})
        return
    
    # Store feedback (counts only, no personal data)
    supabase = community.supabase()
    if supabase:
        try:
            from supa import call
            ip = client_ip(handler)
            
            call("POST", "/rest/v1/reddit_ask_feedback", body={
                "ip_hash": hash_ip(ip),
                "helpful": helpful,
                "question_hash": hash_question(question),
            })
        except Exception as e:
            print(f"Feedback error: {e}")
    
    body = json.dumps({"ok": True}).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _check_ingest_auth(handler: Any) -> bool:
    """Check if request is authorized for ingestion endpoints."""
    auth_header = handler.headers.get("Authorization", "")
    secret = env_name("REDDIT_INGEST_SECRET")
    
    # Check for secret token
    if secret and auth_header == f"Bearer {secret}":
        return True
    
    # Check for admin session
    supabase = community.supabase()
    if supabase:
        from supa import fetch_account, read_cookies
        at, rt = read_cookies(handler)
        if at:
            status, user = fetch_account(at)
            if user and user.get("is_admin"):
                return True
    
    return False


def handle_ingest(handler: Any, port: int) -> None:
    """POST /api/reddit-ingest - Start background ingestion (admin-only or secret token)."""
    if not _check_ingest_auth(handler):
        _json_error(handler, 403, {"error": "unauthorized"})
        return
    
    # Start background job
    from reddit_ingest import start_ingest_job
    secret = env_name("REDDIT_INGEST_SECRET")
    
    result = start_ingest_job(
        subreddits=None,  # All subreddits
        limit=50,
        token=secret,
    )
    
    # Return 202 Accepted with job info
    body = json.dumps(result, ensure_ascii=False).encode("utf-8")
    handler.send_response(202 if result.get("ok") else 409)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def handle_ingest_status(handler: Any, port: int) -> None:
    """GET /api/reddit-ingest/status - Check ingestion job status."""
    if not _check_ingest_auth(handler):
        _json_error(handler, 403, {"error": "unauthorized"})
        return
    
    from reddit_ingest import get_job_status
    status = get_job_status()
    
    body = json.dumps(status, ensure_ascii=False).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def handle_ingest_push(handler: Any, port: int) -> None:
    """POST /api/reddit-ingest/push - Push pre-fetched threads (admin-only or secret token)."""
    if not _check_ingest_auth(handler):
        _json_error(handler, 403, {"error": "unauthorized"})
        return
    
    # Parse request body
    ctype = (handler.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ctype != "application/json":
        _json_error(handler, 415, {"error": "invalid_content_type"})
        return
    
    try:
        length = int(handler.headers.get("Content-Length") or "0")
    except ValueError:
        length = 0
    
    if length <= 0 or length > 10 * 1024 * 1024:  # 10MB max
        _json_error(handler, 400, {"error": "invalid_body"})
        return
    
    try:
        data = json.loads(handler.rfile.read(length).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        _json_error(handler, 400, {"error": "invalid_json"})
        return
    
    if not isinstance(data, list):
        _json_error(handler, 400, {"error": "expected_array", "message": "Body must be an array of threads"})
        return
    
    # Process and upsert the pushed threads
    from reddit_ingest import process_push_data
    secret = env_name("REDDIT_INGEST_SECRET")
    
    result = process_push_data(data, secret)
    
    body = json.dumps(result, ensure_ascii=False).encode("utf-8")
    handler.send_response(200 if result.get("ok") else 400)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _json_error(handler: Any, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
