"""Tests for the blog module: server-rendered SEO pages, sitemap, and robots.txt."""
import importlib
import os
import unittest
from datetime import datetime, timezone

import blog


class TestMarkdownToHtml(unittest.TestCase):
    """Test the markdown_to_html function."""

    def test_empty(self):
        self.assertEqual(blog.markdown_to_html(""), "")
        self.assertEqual(blog.markdown_to_html(None), "")

    def test_paragraph(self):
        html = blog.markdown_to_html("Hello world")
        self.assertIn("<p>Hello world</p>", html)

    def test_header(self):
        html = blog.markdown_to_html("# Title\n\nParagraph")
        self.assertIn("<h2>Title</h2>", html)
        self.assertIn("<p>Paragraph</p>", html)

    def test_bold_and_italic(self):
        html = blog.markdown_to_html("This is **bold** and *italic*")
        self.assertIn("<strong>bold</strong>", html)
        self.assertIn("<em>italic</em>", html)

    def test_link(self):
        html = blog.markdown_to_html("Visit [USCIS](https://uscis.gov)")
        self.assertIn('<a href="https://uscis.gov"', html)
        self.assertIn("USCIS</a>", html)
        self.assertIn('target="_blank"', html)

    def test_list(self):
        html = blog.markdown_to_html("- Item 1\n- Item 2")
        self.assertIn("<ul>", html)
        self.assertIn("<li>Item 1</li>", html)
        self.assertIn("<li>Item 2</li>", html)

    def test_ordered_list(self):
        html = blog.markdown_to_html("1. First\n2. Second")
        self.assertIn("<ol>", html)
        self.assertIn("<li>First</li>", html)
        self.assertIn("<li>Second</li>", html)

    def test_code_block(self):
        html = blog.markdown_to_html("```\ncode here\n```")
        self.assertIn("<pre><code>code here</code></pre>", html)

    def test_inline_code(self):
        html = blog.markdown_to_html("Use the `I-485` form")
        self.assertIn("<code>I-485</code>", html)

    def test_escapes_html(self):
        html = blog.markdown_to_html("Test <script>alert('xss')</script>")
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)


class TestBlogIndexHtml(unittest.TestCase):
    """Test the blog_index_html function."""

    def test_empty_state(self):
        html = blog.blog_index_html([], "en")
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn('<html lang="en">', html)
        self.assertIn("No posts yet", html)
        self.assertIn("CaseCircle", html)

    def test_empty_state_es(self):
        html = blog.blog_index_html([], "es")
        self.assertIn('<html lang="es">', html)
        self.assertIn("Aún no hay publicaciones", html)

    def test_with_posts(self):
        posts = [
            {
                "slug": "test-post",
                "title": "Test Post Title",
                "meta_description": "This is a test post description.",
                "published_at": "2026-11-10T12:00:00Z",
                "cover_image_url": None,
            }
        ]
        html = blog.blog_index_html(posts, "en")
        self.assertIn("Test Post Title", html)
        self.assertIn("This is a test post description", html)
        self.assertIn('href="/blog/test-post"', html)

    def test_has_seo_tags(self):
        html = blog.blog_index_html([], "en")
        self.assertIn('<meta name="description"', html)
        self.assertIn('<link rel="canonical"', html)
        self.assertIn('hreflang="en"', html)
        self.assertIn('hreflang="es"', html)
        self.assertIn('og:title', html)
        self.assertIn('twitter:card', html)
        self.assertIn('application/ld+json', html)


class TestBlogPostHtml(unittest.TestCase):
    """Test the blog_post_html function."""

    def test_renders_post(self):
        post = {
            "slug": "my-post",
            "lang": "en",
            "title": "My Blog Post",
            "meta_description": "Description of my post",
            "body_markdown": "# Hello\n\nThis is the content.",
            "sources": [{"label": "USCIS", "url": "https://uscis.gov"}],
            "cover_image_url": None,
            "published_at": "2026-11-10T12:00:00Z",
            "updated_at": "2026-11-11T14:00:00Z",
        }
        html = blog.blog_post_html(post, None, "en")
        
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn('<html lang="en">', html)
        self.assertIn("My Blog Post", html)
        self.assertIn("<h2>Hello</h2>", html)
        self.assertIn("This is the content.", html)
        self.assertIn("USCIS", html)
        self.assertIn("Not legal advice", html)

    def test_has_seo_tags(self):
        post = {
            "slug": "seo-test",
            "lang": "en",
            "title": "SEO Test Post",
            "meta_description": "Testing SEO meta tags",
            "body_markdown": "Content here",
            "sources": [],
            "cover_image_url": "https://example.com/image.jpg",
            "published_at": "2026-11-10T12:00:00Z",
            "updated_at": "2026-11-10T12:00:00Z",
        }
        html = blog.blog_post_html(post, None, "en")
        
        self.assertIn('<link rel="canonical" href="https://casecircle.us/blog/seo-test"', html)
        self.assertIn('<meta property="og:title" content="SEO Test Post', html)
        self.assertIn('<meta property="og:type" content="article"', html)
        self.assertIn('<meta property="og:image" content="https://example.com/image.jpg"', html)
        self.assertIn('"@type": "BlogPosting"', html)
        self.assertIn('"headline": "SEO Test Post"', html)
        self.assertIn('"datePublished": "2026-11-10"', html)
        self.assertIn('"inLanguage": "en"', html)

    def test_translation_link(self):
        post = {
            "slug": "english-post",
            "lang": "en",
            "title": "English Title",
            "meta_description": "English description",
            "body_markdown": "Content",
            "sources": [],
            "cover_image_url": None,
            "published_at": "2026-11-10T12:00:00Z",
            "updated_at": "2026-11-10T12:00:00Z",
            "translation_slug": "spanish-post",
        }
        translation = {
            "slug": "spanish-post",
            "lang": "es",
            "title": "Título en Español",
        }
        html = blog.blog_post_html(post, translation, "en")
        
        self.assertIn('hreflang="es"', html)
        self.assertIn('/es/blog/spanish-post', html)
        self.assertIn("Leer en español", html)

    def test_spanish_post(self):
        post = {
            "slug": "mi-post",
            "lang": "es",
            "title": "Mi Publicación",
            "meta_description": "Descripción de mi publicación",
            "body_markdown": "Contenido aquí",
            "sources": [],
            "cover_image_url": None,
            "published_at": "2026-11-10T12:00:00Z",
            "updated_at": "2026-11-10T12:00:00Z",
        }
        html = blog.blog_post_html(post, None, "es")
        
        self.assertIn('<html lang="es">', html)
        self.assertIn("Mi Publicación", html)
        self.assertIn("No es asesoría legal", html)
        self.assertIn('"inLanguage": "es"', html)

    def test_cta_rendered(self):
        post = {
            "slug": "cta-test",
            "lang": "en",
            "title": "CTA Test",
            "meta_description": "Testing CTA",
            "body_markdown": "Content",
            "sources": [],
            "cover_image_url": None,
            "published_at": "2026-11-10T12:00:00Z",
            "updated_at": "2026-11-10T12:00:00Z",
        }
        html = blog.blog_post_html(post, None, "en")
        self.assertIn("Plan your immigration case", html)
        self.assertIn("Get started", html)


class TestBlog404Html(unittest.TestCase):
    """Test the blog_404_html function."""

    def test_404_en(self):
        html = blog.blog_404_html("en")
        self.assertIn("Page not found", html)
        self.assertIn("doesn't exist", html)
        self.assertIn('href="/blog"', html)

    def test_404_es(self):
        html = blog.blog_404_html("es")
        self.assertIn("Página no encontrada", html)
        self.assertIn("no existe", html)
        self.assertIn('href="/es/blog"', html)


class TestSitemapXml(unittest.TestCase):
    """Test the sitemap_xml function."""

    def test_includes_static_pages(self):
        xml = blog.sitemap_xml([])
        self.assertIn('<?xml version="1.0"', xml)
        self.assertIn("<urlset", xml)
        self.assertIn("https://casecircle.us/", xml)
        self.assertIn("https://casecircle.us/blog", xml)
        self.assertIn("https://casecircle.us/es/blog", xml)

    def test_includes_posts(self):
        posts = [
            {"slug": "test-en", "lang": "en", "published_at": "2026-11-10", "updated_at": "2026-11-11"},
            {"slug": "test-es", "lang": "es", "published_at": "2026-11-09", "updated_at": "2026-11-09"},
        ]
        xml = blog.sitemap_xml(posts)
        self.assertIn("https://casecircle.us/blog/test-en", xml)
        self.assertIn("https://casecircle.us/es/blog/test-es", xml)
        self.assertIn("<lastmod>2026-11-11</lastmod>", xml)

    def test_escapes_special_chars(self):
        posts = [{"slug": "test-post", "lang": "en", "published_at": "2026-11-10", "updated_at": "2026-11-10"}]
        xml = blog.sitemap_xml(posts)
        self.assertNotIn("&", xml.replace("&amp;", "").replace("&lt;", "").replace("&gt;", ""))


class TestRobotsTxt(unittest.TestCase):
    """Test the robots_txt function."""

    def test_contains_sitemap(self):
        txt = blog.robots_txt()
        self.assertIn("User-agent: *", txt)
        self.assertIn("Allow: /", txt)
        self.assertIn("Sitemap: https://casecircle.us/sitemap.xml", txt)


class TestFormatDate(unittest.TestCase):
    """Test the format_date function."""

    def test_english_format(self):
        dt = datetime(2026, 11, 10, 12, 0, 0, tzinfo=timezone.utc)
        formatted = blog.format_date(dt, "en")
        self.assertIn("November", formatted)
        self.assertIn("10", formatted)
        self.assertIn("2026", formatted)

    def test_spanish_format(self):
        dt = datetime(2026, 11, 10, 12, 0, 0, tzinfo=timezone.utc)
        formatted = blog.format_date(dt, "es")
        self.assertIn("noviembre", formatted)
        self.assertIn("10", formatted)
        self.assertIn("2026", formatted)

    def test_string_input(self):
        formatted = blog.format_date("2026-11-10T12:00:00Z", "en")
        self.assertIn("November", formatted)

    def test_empty(self):
        self.assertEqual(blog.format_date(None), "")


class TestIsoDate(unittest.TestCase):
    """Test the iso_date function."""

    def test_datetime_input(self):
        dt = datetime(2026, 11, 10, 12, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(blog.iso_date(dt), "2026-11-10")

    def test_string_input(self):
        self.assertEqual(blog.iso_date("2026-11-10T12:00:00Z"), "2026-11-10")

    def test_empty(self):
        self.assertEqual(blog.iso_date(None), "")


class TestCanonicalOrigin(unittest.TestCase):
    """Test the _canonical_origin function with comma-separated values."""

    def setUp(self):
        self.orig_canonical = os.environ.get("CASECIRCLE_CANONICAL_ORIGIN")
        self.orig_public = os.environ.get("CASECIRCLE_PUBLIC_ORIGIN")

    def tearDown(self):
        if self.orig_canonical is None:
            os.environ.pop("CASECIRCLE_CANONICAL_ORIGIN", None)
        else:
            os.environ["CASECIRCLE_CANONICAL_ORIGIN"] = self.orig_canonical
        if self.orig_public is None:
            os.environ.pop("CASECIRCLE_PUBLIC_ORIGIN", None)
        else:
            os.environ["CASECIRCLE_PUBLIC_ORIGIN"] = self.orig_public
        importlib.reload(blog)

    def test_comma_separated_uses_first(self):
        os.environ.pop("CASECIRCLE_CANONICAL_ORIGIN", None)
        os.environ["CASECIRCLE_PUBLIC_ORIGIN"] = "https://casecircle.us,https://www.casecircle.us,https://casecircle.onrender.com"
        importlib.reload(blog)
        self.assertEqual(blog.ORIGIN, "https://casecircle.us")

    def test_canonical_origin_overrides(self):
        os.environ["CASECIRCLE_CANONICAL_ORIGIN"] = "https://custom.example.com"
        os.environ["CASECIRCLE_PUBLIC_ORIGIN"] = "https://casecircle.us,https://other.com"
        importlib.reload(blog)
        self.assertEqual(blog.ORIGIN, "https://custom.example.com")

    def test_strips_trailing_slash(self):
        os.environ.pop("CASECIRCLE_CANONICAL_ORIGIN", None)
        os.environ["CASECIRCLE_PUBLIC_ORIGIN"] = "https://casecircle.us/"
        importlib.reload(blog)
        self.assertEqual(blog.ORIGIN, "https://casecircle.us")

    def test_comma_separated_in_urls(self):
        os.environ.pop("CASECIRCLE_CANONICAL_ORIGIN", None)
        os.environ["CASECIRCLE_PUBLIC_ORIGIN"] = "https://casecircle.us,https://www.casecircle.us"
        importlib.reload(blog)
        html = blog.blog_index_html([], "en")
        self.assertIn('href="https://casecircle.us/blog"', html)
        self.assertNotIn("https://www.casecircle.us", html)
        self.assertNotIn(",", html.split('href="')[1].split('"')[0])

    def test_sitemap_uses_canonical_origin(self):
        os.environ.pop("CASECIRCLE_CANONICAL_ORIGIN", None)
        os.environ["CASECIRCLE_PUBLIC_ORIGIN"] = "https://casecircle.us,https://other.com"
        importlib.reload(blog)
        xml = blog.sitemap_xml([])
        self.assertIn("https://casecircle.us/", xml)
        self.assertNotIn("https://other.com", xml)
        self.assertNotIn(",", xml)

    def test_robots_uses_canonical_origin(self):
        os.environ.pop("CASECIRCLE_CANONICAL_ORIGIN", None)
        os.environ["CASECIRCLE_PUBLIC_ORIGIN"] = "https://casecircle.us,https://other.com"
        importlib.reload(blog)
        txt = blog.robots_txt()
        self.assertIn("Sitemap: https://casecircle.us/sitemap.xml", txt)
        self.assertNotIn("https://other.com", txt)
        self.assertNotIn(",", txt)


class TestBlogNavLinks(unittest.TestCase):
    """Test blog navigation links and toggle classes."""

    def test_spanish_blog_nav_link(self):
        html = blog.blog_index_html([], "es")
        self.assertIn('href="/es/blog" class="nav-link on"', html)
        self.assertNotIn('href="//blog"', html)

    def test_english_blog_nav_link(self):
        html = blog.blog_index_html([], "en")
        self.assertIn('href="/blog" class="nav-link on"', html)

    def test_english_toggle_classes(self):
        html = blog.blog_index_html([], "en")
        self.assertIn('href="/blog" class="on"', html)
        self.assertIn('href="/es/blog" class=""', html)

    def test_spanish_toggle_classes(self):
        html = blog.blog_index_html([], "es")
        self.assertIn('href="/blog" class=""', html)
        self.assertIn('href="/es/blog" class="on"', html)


if __name__ == "__main__":
    unittest.main()
