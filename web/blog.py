"""Server-rendered bilingual blog pages for SEO.

Routes:
  GET /blog           English blog index (newest published posts)
  GET /es/blog        Spanish blog index
  GET /blog/:slug     English blog post
  GET /es/blog/:slug  Spanish blog post
  GET /sitemap.xml    Sitemap including all published posts
  GET /robots.txt     Robots.txt pointing to sitemap

All pages are server-rendered HTML for search engine indexing.
"""
from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

ORIGIN = os.environ.get("CASECIRCLE_PUBLIC_ORIGIN", "https://casecircle.us").rstrip("/")
APP_NAME = "CaseCircle"

DISCLAIMER_EN = "Not legal advice. Not affiliated with USCIS."
DISCLAIMER_ES = "No es asesoría legal. No afiliado con USCIS."

CTA_EN = {
    "title": "Plan your immigration case",
    "body": "Use CaseCircle's free tools to check wait times, gather documents, and prepare for interviews.",
    "button": "Get started",
    "url": "/#papers"
}
CTA_ES = {
    "title": "Planifica tu caso de inmigración",
    "body": "Usa las herramientas gratuitas de CaseCircle para verificar tiempos de espera, reunir documentos y prepararte para entrevistas.",
    "button": "Comenzar",
    "url": "/#papers"
}

NAV_EN = {"home": "Home", "blog": "Blog", "tools": "Tools", "community": "Community"}
NAV_ES = {"home": "Inicio", "blog": "Blog", "tools": "Herramientas", "community": "Comunidad"}


def esc(text: str) -> str:
    """HTML-escape text."""
    return html.escape(str(text or ""), quote=True)


def markdown_to_html(md: str) -> str:
    """Convert markdown to sanitized HTML. Basic subset: headers, paragraphs, lists, links, bold, italic, code."""
    if not md:
        return ""
    
    lines = md.split("\n")
    html_parts = []
    in_list = None
    in_code_block = False
    code_buffer = []
    
    def process_inline(text: str) -> str:
        text = esc(text)
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
        text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
        text = re.sub(
            r'\[([^\]]+)\]\((https?://[^\)]+)\)',
            lambda m: f'<a href="{esc(m.group(2))}" target="_blank" rel="noopener noreferrer">{m.group(1)}</a>',
            text
        )
        return text
    
    for line in lines:
        if line.startswith("```"):
            if in_code_block:
                html_parts.append(f'<pre><code>{esc(chr(10).join(code_buffer))}</code></pre>')
                code_buffer = []
                in_code_block = False
            else:
                if in_list:
                    html_parts.append(f'</{in_list}>')
                    in_list = None
                in_code_block = True
            continue
        
        if in_code_block:
            code_buffer.append(line)
            continue
        
        stripped = line.strip()
        
        if not stripped:
            if in_list:
                html_parts.append(f'</{in_list}>')
                in_list = None
            continue
        
        if stripped.startswith("# "):
            if in_list:
                html_parts.append(f'</{in_list}>')
                in_list = None
            html_parts.append(f'<h2>{process_inline(stripped[2:])}</h2>')
        elif stripped.startswith("## "):
            if in_list:
                html_parts.append(f'</{in_list}>')
                in_list = None
            html_parts.append(f'<h3>{process_inline(stripped[3:])}</h3>')
        elif stripped.startswith("### "):
            if in_list:
                html_parts.append(f'</{in_list}>')
                in_list = None
            html_parts.append(f'<h4>{process_inline(stripped[4:])}</h4>')
        elif stripped.startswith("- ") or stripped.startswith("* "):
            if in_list != "ul":
                if in_list:
                    html_parts.append(f'</{in_list}>')
                html_parts.append('<ul>')
                in_list = "ul"
            html_parts.append(f'<li>{process_inline(stripped[2:])}</li>')
        elif re.match(r'^\d+\.\s', stripped):
            if in_list != "ol":
                if in_list:
                    html_parts.append(f'</{in_list}>')
                html_parts.append('<ol>')
                in_list = "ol"
            html_parts.append(f'<li>{process_inline(re.sub(r"^\d+\.\s*", "", stripped))}</li>')
        else:
            if in_list:
                html_parts.append(f'</{in_list}>')
                in_list = None
            html_parts.append(f'<p>{process_inline(stripped)}</p>')
    
    if in_list:
        html_parts.append(f'</{in_list}>')
    if in_code_block:
        html_parts.append(f'<pre><code>{esc(chr(10).join(code_buffer))}</code></pre>')
    
    return "\n".join(html_parts)


def format_date(dt: datetime | str | None, lang: str = "en") -> str:
    """Format a date for display."""
    if not dt:
        return ""
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except ValueError:
            return dt[:10] if len(dt) >= 10 else dt
    if lang == "es":
        months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        return f"{dt.day} de {months[dt.month - 1]} de {dt.year}"
    else:
        return dt.strftime("%B %d, %Y")


def iso_date(dt: datetime | str | None) -> str:
    """Format a date as ISO 8601 for schema.org."""
    if not dt:
        return ""
    if isinstance(dt, str):
        return dt[:10] if len(dt) >= 10 else dt
    return dt.strftime("%Y-%m-%d")


def blog_page_html(
    lang: str,
    title: str,
    description: str,
    canonical: str,
    hreflang_en: str | None,
    hreflang_es: str | None,
    body_content: str,
    json_ld: dict[str, Any] | None = None,
    og_image: str | None = None,
) -> str:
    """Render a complete blog HTML page with SEO tags."""
    nav = NAV_ES if lang == "es" else NAV_EN
    is_es = lang == "es"
    
    hreflang_tags = ""
    if hreflang_en:
        hreflang_tags += f'\n  <link rel="alternate" hreflang="en" href="{esc(hreflang_en)}">'
    if hreflang_es:
        hreflang_tags += f'\n  <link rel="alternate" hreflang="es" href="{esc(hreflang_es)}">'
    if hreflang_en and hreflang_es:
        hreflang_tags += f'\n  <link rel="alternate" hreflang="x-default" href="{esc(hreflang_en)}">'
    
    json_ld_script = ""
    if json_ld:
        json_ld_script = f'\n  <script type="application/ld+json">{json.dumps(json_ld, ensure_ascii=False)}</script>'
    
    og_image_tag = ""
    if og_image:
        og_image_tag = f'\n  <meta property="og:image" content="{esc(og_image)}">'
        og_image_tag += f'\n  <meta name="twitter:image" content="{esc(og_image)}">'
    
    return f'''<!DOCTYPE html>
<html lang="{esc(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#FFFFFF">
  <meta name="color-scheme" content="light">
  <meta name="description" content="{esc(description)}">
  <title>{esc(title)}</title>
  <link rel="canonical" href="{esc(canonical)}">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%231F7A6E' stroke-width='3.5'/%3E%3Ccircle cx='16' cy='16' r='4' fill='%231F7A6E'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="/styles.css?v=blog1">{hreflang_tags}
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="{esc(APP_NAME)}">{og_image_tag}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(description)}">{json_ld_script}
</head>
<body>
  <div class="site blog-site">
    <header class="topbar blog-bar">
      <div class="bar-inner">
        <a href="/" class="brand" aria-label="{esc(APP_NAME)}">
          <svg class="logo" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <circle cx="16" cy="16" r="11" fill="none" stroke="#1F7A6E" stroke-width="3.5"/>
            <circle cx="16" cy="16" r="4" fill="#1F7A6E"/>
          </svg>
          <span class="brand-text">
            <strong>{esc(APP_NAME)}</strong>
            <span class="brand-tag">{"No afiliado con USCIS" if is_es else "Not affiliated with USCIS"}</span>
          </span>
        </a>
        <nav class="nav blog-nav" aria-label="{"Navegación" if is_es else "Navigation"}">
          <a href="/" class="nav-link">{esc(nav["home"])}</a>
          <a href="{"/" if is_es else ""}/blog" class="nav-link on">{esc(nav["blog"])}</a>
          <a href="/#papers" class="nav-link">{esc(nav["tools"])}</a>
          <a href="/#feed" class="nav-link">{esc(nav["community"])}</a>
        </nav>
        <div class="top-actions">
          <div class="lang-toggle">
            <a href="/blog" class="{"" if not is_es else "on"}" aria-label="English">EN</a>
            <a href="/es/blog" class="{"on" if is_es else ""}" aria-label="Español">ES</a>
          </div>
        </div>
      </div>
    </header>
    <main class="page blog-page" id="main">
      {body_content}
    </main>
    <footer class="site-foot">
      <div class="foot-legal">
        <p>{esc(DISCLAIMER_ES if is_es else DISCLAIMER_EN)}</p>
        <span>© {datetime.now().year} {esc(APP_NAME)}</span>
      </div>
    </footer>
  </div>
</body>
</html>'''


def blog_index_html(posts: list[dict[str, Any]], lang: str) -> str:
    """Render the blog index page (list of posts)."""
    is_es = lang == "es"
    
    title = f"Blog — {APP_NAME}" if not is_es else f"Blog — {APP_NAME}"
    description = ("Immigration insights, guides, and news for your USCIS journey."
                   if not is_es else
                   "Información, guías y noticias de inmigración para tu proceso con USCIS.")
    canonical = f"{ORIGIN}/{'es/' if is_es else ''}blog"
    
    if not posts:
        empty_msg = ("No posts yet. Check back soon!" if not is_es else
                     "Aún no hay publicaciones. ¡Vuelve pronto!")
        body = f'''<div class="blog-index">
  <h1>{"Blog" if not is_es else "Blog"}</h1>
  <p class="blog-lead">{esc(description)}</p>
  <div class="blog-empty">
    <p>{esc(empty_msg)}</p>
  </div>
</div>'''
    else:
        cards = []
        for post in posts:
            post_url = f"{ORIGIN}/{'es/' if is_es else ''}blog/{post['slug']}"
            pub_date = format_date(post.get("published_at"), lang)
            cards.append(f'''<article class="blog-card">
  <a href="/{'es/' if is_es else ''}blog/{esc(post['slug'])}" class="blog-card-link">
    {f'<img src="{esc(post["cover_image_url"])}" alt="" class="blog-card-image" loading="lazy">' if post.get("cover_image_url") else ''}
    <div class="blog-card-content">
      <h2 class="blog-card-title">{esc(post["title"])}</h2>
      <p class="blog-card-meta">{esc(pub_date)}</p>
      <p class="blog-card-desc">{esc(post["meta_description"][:160])}</p>
    </div>
  </a>
</article>''')
        
        body = f'''<div class="blog-index">
  <h1>{"Blog" if not is_es else "Blog"}</h1>
  <p class="blog-lead">{esc(description)}</p>
  <div class="blog-grid">
    {"".join(cards)}
  </div>
</div>'''
    
    json_ld = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": f"{APP_NAME} Blog",
        "description": description,
        "url": canonical,
        "inLanguage": lang,
        "publisher": {
            "@type": "Organization",
            "name": APP_NAME,
            "url": ORIGIN
        }
    }
    
    return blog_page_html(
        lang=lang,
        title=title,
        description=description,
        canonical=canonical,
        hreflang_en=f"{ORIGIN}/blog",
        hreflang_es=f"{ORIGIN}/es/blog",
        body_content=body,
        json_ld=json_ld
    )


def blog_post_html(post: dict[str, Any], translation: dict[str, Any] | None, lang: str) -> str:
    """Render a single blog post page."""
    is_es = lang == "es"
    
    title = f"{post['title']} — {APP_NAME}"
    description = post["meta_description"]
    canonical = f"{ORIGIN}/{'es/' if is_es else ''}blog/{post['slug']}"
    
    hreflang_en = None
    hreflang_es = None
    if is_es:
        hreflang_es = canonical
        if translation:
            hreflang_en = f"{ORIGIN}/blog/{translation['slug']}"
    else:
        hreflang_en = canonical
        if translation:
            hreflang_es = f"{ORIGIN}/es/blog/{translation['slug']}"
    
    body_html = markdown_to_html(post["body_markdown"])
    
    sources_html = ""
    sources = post.get("sources") or []
    if isinstance(sources, str):
        try:
            sources = json.loads(sources)
        except json.JSONDecodeError:
            sources = []
    if sources:
        source_items = []
        for src in sources:
            if isinstance(src, dict) and src.get("label") and src.get("url"):
                source_items.append(
                    f'<li><a href="{esc(src["url"])}" target="_blank" rel="noopener noreferrer">{esc(src["label"])}</a></li>'
                )
        if source_items:
            sources_title = "Fuentes" if is_es else "Sources"
            sources_html = f'''<section class="blog-sources">
  <h3>{esc(sources_title)}</h3>
  <ul>{"".join(source_items)}</ul>
</section>'''
    
    cta = CTA_ES if is_es else CTA_EN
    cta_html = f'''<aside class="blog-cta">
  <h3>{esc(cta["title"])}</h3>
  <p>{esc(cta["body"])}</p>
  <a href="{esc(cta["url"])}" class="btn">{esc(cta["button"])}</a>
</aside>'''
    
    lang_switch = ""
    if translation:
        other_lang = "es" if not is_es else "en"
        other_url = f"/{'es/' if not is_es else ''}blog/{translation['slug']}"
        switch_text = "Leer en español" if not is_es else "Read in English"
        lang_switch = f'<a href="{esc(other_url)}" class="blog-lang-switch">{esc(switch_text)} →</a>'
    
    disclaimer = DISCLAIMER_ES if is_es else DISCLAIMER_EN
    pub_date = format_date(post.get("published_at"), lang)
    
    body = f'''<article class="blog-post" itemscope itemtype="https://schema.org/BlogPosting">
  <header class="blog-post-header">
    <a href="/{'es/' if is_es else ''}blog" class="blog-back">← {"Volver al blog" if is_es else "Back to blog"}</a>
    {lang_switch}
    <h1 itemprop="headline">{esc(post["title"])}</h1>
    <p class="blog-post-meta">
      <time datetime="{esc(iso_date(post.get("published_at")))}" itemprop="datePublished">{esc(pub_date)}</time>
    </p>
  </header>
  {f'<img src="{esc(post["cover_image_url"])}" alt="" class="blog-post-cover" itemprop="image">' if post.get("cover_image_url") else ''}
  <div class="blog-post-body" itemprop="articleBody">
    {body_html}
  </div>
  {sources_html}
  <footer class="blog-post-footer">
    <p class="blog-disclaimer">{esc(disclaimer)}</p>
  </footer>
  {cta_html}
</article>'''
    
    json_ld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post["title"],
        "description": description,
        "url": canonical,
        "datePublished": iso_date(post.get("published_at")),
        "dateModified": iso_date(post.get("updated_at") or post.get("published_at")),
        "inLanguage": lang,
        "author": {
            "@type": "Organization",
            "name": APP_NAME
        },
        "publisher": {
            "@type": "Organization",
            "name": APP_NAME,
            "url": ORIGIN
        }
    }
    if post.get("cover_image_url"):
        json_ld["image"] = post["cover_image_url"]
    
    return blog_page_html(
        lang=lang,
        title=title,
        description=description,
        canonical=canonical,
        hreflang_en=hreflang_en,
        hreflang_es=hreflang_es,
        body_content=body,
        json_ld=json_ld,
        og_image=post.get("cover_image_url")
    )


def blog_404_html(lang: str) -> str:
    """Render a 404 page for blog."""
    is_es = lang == "es"
    title = "Página no encontrada — " + APP_NAME if is_es else "Page not found — " + APP_NAME
    description = "Esta página no existe." if is_es else "This page does not exist."
    
    body = f'''<div class="blog-404">
  <h1>{"Página no encontrada" if is_es else "Page not found"}</h1>
  <p>{"El artículo que buscas no existe o ha sido removido." if is_es else "The article you're looking for doesn't exist or has been removed."}</p>
  <a href="/{'es/' if is_es else ''}blog" class="btn">{"Volver al blog" if is_es else "Back to blog"}</a>
</div>'''
    
    return blog_page_html(
        lang=lang,
        title=title,
        description=description,
        canonical=f"{ORIGIN}/{'es/' if is_es else ''}blog",
        hreflang_en=f"{ORIGIN}/blog",
        hreflang_es=f"{ORIGIN}/es/blog",
        body_content=body
    )


def sitemap_xml(posts: list[dict[str, Any]], static_pages: list[dict[str, str]] | None = None) -> str:
    """Generate sitemap.xml including static pages and all published blog posts."""
    urls = []
    
    default_static = [
        {"loc": ORIGIN + "/", "priority": "1.0"},
        {"loc": ORIGIN + "/blog", "priority": "0.8"},
        {"loc": ORIGIN + "/es/blog", "priority": "0.8"},
    ]
    
    for page in (static_pages or default_static):
        lastmod = f"<lastmod>{page['lastmod']}</lastmod>" if page.get("lastmod") else ""
        priority = page.get("priority", "0.5")
        urls.append(f'''  <url>
    <loc>{esc(page["loc"])}</loc>{lastmod}
    <priority>{priority}</priority>
  </url>''')
    
    for post in posts:
        lang = post.get("lang", "en")
        is_es = lang == "es"
        loc = f"{ORIGIN}/{'es/' if is_es else ''}blog/{post['slug']}"
        lastmod = iso_date(post.get("updated_at") or post.get("published_at"))
        urls.append(f'''  <url>
    <loc>{esc(loc)}</loc>
    <lastmod>{lastmod}</lastmod>
    <priority>0.6</priority>
  </url>''')
    
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(urls)}
</urlset>'''


def robots_txt() -> str:
    """Generate robots.txt pointing to sitemap."""
    return f"""User-agent: *
Allow: /

Sitemap: {ORIGIN}/sitemap.xml
"""
