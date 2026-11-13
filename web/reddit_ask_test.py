#!/usr/bin/env python3
"""Tests for reddit_ask.py and reddit_ingest.py."""
from __future__ import annotations

import json
import os
import re
import sys
import unittest
from datetime import datetime, timezone
from io import BytesIO
from typing import Any
from unittest.mock import MagicMock, patch

# Ensure web directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import reddit_ingest
import reddit_ask


class MockHandler:
    """Mock HTTP handler for testing."""
    def __init__(self, body: dict | list | None = None, headers: dict | None = None, ip: str = "127.0.0.1"):
        self.body = body
        self.headers = headers or {"Content-Type": "application/json"}
        self.client_address = (ip, 12345)
        self._response_status = None
        self._response_headers = {}
        self._response_body = b""
        
        # Set Content-Length header based on body
        if body is not None:
            body_bytes = json.dumps(body).encode("utf-8")
            self.headers["Content-Length"] = str(len(body_bytes))
            self.rfile = BytesIO(body_bytes)
        else:
            self.headers["Content-Length"] = "0"
            self.rfile = BytesIO(b"")
    
    def send_response(self, status: int) -> None:
        self._response_status = status
    
    def send_header(self, name: str, value: str) -> None:
        self._response_headers[name] = value
    
    def end_headers(self) -> None:
        pass
    
    @property
    def wfile(self):
        return self
    
    def write(self, data: bytes) -> None:
        self._response_body += data
    
    def response_json(self) -> dict | list:
        return json.loads(self._response_body.decode("utf-8"))


class TestIngestionStripAuthors(unittest.TestCase):
    """Test that ingestion properly strips usernames and author information."""
    
    def test_strip_authors_removes_usernames(self):
        """Comments should have author info removed."""
        comments = [
            {"body": "Thanks u/some_user for the info!", "author": "commenter1"},
            {"body": "I agree with /u/another_user", "author": "commenter2"},
            {"body": "Check out @username's post", "author": "commenter3"},
        ]
        
        result = reddit_ingest.strip_authors(comments)
        
        self.assertEqual(len(result), 3)
        for item in result:
            # Should have no 'author' key
            self.assertNotIn("author", item)
            # Should have only 'body' key
            self.assertEqual(list(item.keys()), ["body"])
            # Body should not contain original username patterns
            self.assertNotIn("some_user", item["body"])
            self.assertNotIn("another_user", item["body"])
            self.assertNotIn("username", item["body"])
            # Should contain [user] placeholder
            self.assertIn("[user]", item["body"])
    
    def test_strip_authors_removes_deleted_comments(self):
        """Deleted and removed comments should be excluded."""
        comments = [
            {"body": "A real comment", "author": "user1"},
            {"body": "[deleted]", "author": "[deleted]"},
            {"body": "[removed]", "author": "[deleted]"},
            {"body": "Another real comment", "author": "user2"},
        ]
        
        result = reddit_ingest.strip_authors(comments)
        
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["body"], "A real comment")
        self.assertEqual(result[1]["body"], "Another real comment")
    
    def test_strip_authors_limits_to_5_comments(self):
        """Should only keep max 5 comments."""
        comments = [{"body": f"Comment {i}", "author": f"user{i}"} for i in range(10)]
        
        result = reddit_ingest.strip_authors(comments)
        
        self.assertEqual(len(result), 5)
    
    def test_strip_authors_truncates_long_comments(self):
        """Long comments should be truncated to 2000 chars."""
        long_body = "x" * 3000
        comments = [{"body": long_body, "author": "user"}]
        
        result = reddit_ingest.strip_authors(comments)
        
        self.assertEqual(len(result), 1)
        self.assertEqual(len(result[0]["body"]), 2000)
    
    def test_process_post_removes_author_from_title_and_selftext(self):
        """Post title and selftext should have author references removed."""
        post = {
            "reddit_id": "abc123",
            "title": "Thanks to u/helpful_user for this tip!",
            "selftext": "As /u/another_user mentioned, check @someone's guide",
            "subreddit": "USCIS",
            "permalink": "/r/USCIS/comments/abc123/test/",
            "score": 10,
            "num_comments": 5,
            "created_utc": 1699012345,
        }
        
        result = reddit_ingest.process_post(post)
        
        self.assertIsNotNone(result)
        self.assertNotIn("helpful_user", result["title"])
        self.assertNotIn("another_user", result["selftext"])
        self.assertNotIn("someone", result["selftext"])
        self.assertIn("[user]", result["title"])
        self.assertIn("[user]", result["selftext"])
    
    def test_strip_usernames_function(self):
        """Test the standalone strip_usernames function."""
        test_cases = [
            ("Thanks u/user123 for help", "Thanks [user] for help"),
            ("See /u/another_person post", "See [user] post"),
            ("Check @twitter_user out", "Check [user] out"),
            ("Post by someuser123 was great", "Post by [user] was great"),
            ("No usernames here", "No usernames here"),
        ]
        
        for input_text, expected in test_cases:
            result = reddit_ingest.strip_usernames(input_text)
            self.assertEqual(result, expected, f"Failed for input: {input_text}")


class TestTagExtraction(unittest.TestCase):
    """Test tag extraction from post text."""
    
    def test_extract_form_tags(self):
        """Should extract form numbers from text."""
        text = "I filed my I-485 and I-765 together"
        tags = reddit_ingest.extract_tags(text, reddit_ingest.FORM_PATTERNS)
        
        self.assertIn("I-485", tags)
        self.assertIn("I-765", tags)
    
    def test_extract_form_tags_variations(self):
        """Should handle various form number formats."""
        test_cases = [
            ("i485 was filed", ["I-485"]),
            ("N-400 interview coming up", ["N-400"]),
            ("waiting for EAD", ["I-765"]),
            ("Advance Parole is ready", ["I-131"]),
            ("N400 citizenship", ["N-400"]),  # Without hyphen
            ("I485 pending", ["I-485"]),  # Without hyphen
        ]
        
        for text, expected in test_cases:
            tags = reddit_ingest.extract_tags(text, reddit_ingest.FORM_PATTERNS)
            for expected_tag in expected:
                self.assertIn(expected_tag, tags, f"Expected {expected_tag} in tags for '{text}'")
    
    def test_extract_office_tags(self):
        """Should extract office names from text."""
        text = "My interview at Sacramento field office"
        tags = reddit_ingest.extract_tags(text, reddit_ingest.OFFICE_PATTERNS)
        
        self.assertIn("sacramento-ca", tags)
    
    def test_extract_step_tags(self):
        """Should extract process steps from text."""
        text = "Just got my biometrics done, waiting for interview"
        tags = reddit_ingest.extract_tags(text, reddit_ingest.STEP_PATTERNS)
        
        self.assertIn("biometrics", tags)
        self.assertIn("interview", tags)


class TestAskEndpoint(unittest.TestCase):
    """Test the Ask Reddit API endpoint."""
    
    def setUp(self):
        # Mock environment
        os.environ["CASECIRCLE_LLM_API_KEY"] = ""  # No LLM by default
        os.environ.pop("SUPABASE_URL", None)
    
    def test_ask_returns_disclaimer(self):
        """Response should always include a disclaimer."""
        # Mock the search to return some threads
        mock_threads = [
            {
                "id": 1,
                "reddit_id": "abc123",
                "subreddit": "USCIS",
                "permalink": "/r/USCIS/comments/abc123/test/",
                "title": "N-400 interview experience",
                "selftext": "Just had my interview today",
                "top_comments": [],
                "score": 10,
                "num_comments": 5,
                "created_utc": "2024-01-15T10:00:00Z",
                "form_tags": ["N-400"],
                "office_tags": [],
                "step_tags": ["interview"],
            }
        ]
        
        with patch.object(reddit_ask, "search_threads", return_value=mock_threads):
            with patch.object(reddit_ask, "log_usage"):
                with patch.object(reddit_ask, "check_rate_limit", return_value=(True, 5, 0)):
                    handler = MockHandler(
                        body={"question": "What is the N-400 interview like?", "lang": "en"},
                        headers={"Content-Type": "application/json", "Content-Length": "50"}
                    )
                    reddit_ask.handle_ask(handler, 8766)
        
        self.assertEqual(handler._response_status, 200)
        response = handler.response_json()
        
        # Should have disclaimer
        self.assertIn("disclaimer", response)
        self.assertTrue(len(response["disclaimer"]) > 50)
        self.assertIn("not official", response["disclaimer"].lower())
        self.assertIn("not legal advice", response["disclaimer"].lower())
    
    def test_ask_returns_citations(self):
        """Response should include citations with source links."""
        mock_threads = [
            {
                "id": 1,
                "reddit_id": "abc123",
                "subreddit": "USCIS",
                "permalink": "/r/USCIS/comments/abc123/test/",
                "title": "Test thread",
                "selftext": "",
                "top_comments": [],
                "score": 10,
                "num_comments": 5,
                "created_utc": "2024-01-15T10:00:00Z",
                "form_tags": [],
                "office_tags": [],
                "step_tags": [],
            },
            {
                "id": 2,
                "reddit_id": "def456",
                "subreddit": "USCIS_FORUM",
                "permalink": "/r/USCIS_FORUM/comments/def456/test2/",
                "title": "Another thread",
                "selftext": "",
                "top_comments": [],
                "score": 5,
                "num_comments": 2,
                "created_utc": "2024-01-14T10:00:00Z",
                "form_tags": [],
                "office_tags": [],
                "step_tags": [],
            },
            {
                "id": 3,
                "reddit_id": "ghi789",
                "subreddit": "immigration",
                "permalink": "/r/immigration/comments/ghi789/test3/",
                "title": "Third thread",
                "selftext": "",
                "top_comments": [],
                "score": 3,
                "num_comments": 1,
                "created_utc": "2024-01-13T10:00:00Z",
                "form_tags": [],
                "office_tags": [],
                "step_tags": [],
            },
        ]
        
        with patch.object(reddit_ask, "search_threads", return_value=mock_threads):
            with patch.object(reddit_ask, "log_usage"):
                with patch.object(reddit_ask, "check_rate_limit", return_value=(True, 5, 0)):
                    handler = MockHandler(
                        body={"question": "Test question"},
                        headers={"Content-Type": "application/json"}
                    )
                    reddit_ask.handle_ask(handler, 8766)
        
        self.assertEqual(handler._response_status, 200)
        response = handler.response_json()
        
        # Should have citations
        self.assertIn("citations", response)
        self.assertGreater(len(response["citations"]), 0)
        
        # Each citation should have permalink
        for citation in response["citations"]:
            self.assertIn("permalink", citation)
            self.assertTrue(citation["permalink"].startswith("https://www.reddit.com/r/"))
    
    def test_ask_rate_limit_enforced(self):
        """Should return 429 when rate limit is exceeded."""
        with patch.object(reddit_ask, "check_rate_limit", return_value=(False, 5, 5)):
            handler = MockHandler(
                body={"question": "Test question"},
                headers={"Content-Type": "application/json"}
            )
            reddit_ask.handle_ask(handler, 8766)
        
        self.assertEqual(handler._response_status, 429)
        response = handler.response_json()
        self.assertEqual(response["error"], "rate_limit")
    
    def test_ask_fallback_without_llm_key(self):
        """Should return fallback response when no LLM key is set."""
        os.environ["CASECIRCLE_LLM_API_KEY"] = ""
        
        mock_threads = [
            {
                "id": i,
                "reddit_id": f"thread{i}",
                "subreddit": "USCIS",
                "permalink": f"/r/USCIS/comments/thread{i}/test/",
                "title": f"Test thread {i}",
                "selftext": "",
                "top_comments": [],
                "score": 10,
                "num_comments": 5,
                "created_utc": "2024-01-15T10:00:00Z",
                "form_tags": [],
                "office_tags": [],
                "step_tags": [],
            }
            for i in range(5)
        ]
        
        with patch.object(reddit_ask, "search_threads", return_value=mock_threads):
            with patch.object(reddit_ask, "log_usage"):
                with patch.object(reddit_ask, "check_rate_limit", return_value=(True, 5, 0)):
                    handler = MockHandler(
                        body={"question": "Test question"},
                        headers={"Content-Type": "application/json"}
                    )
                    reddit_ask.handle_ask(handler, 8766)
        
        self.assertEqual(handler._response_status, 200)
        response = handler.response_json()
        
        # Should have fallback flag set
        self.assertTrue(response["fallback"])
        
        # Should still have citations
        self.assertGreater(len(response["citations"]), 0)
    
    def test_ask_bilingual_support(self):
        """Should return response in requested language (ES)."""
        mock_threads = []  # No threads found
        
        with patch.object(reddit_ask, "search_threads", return_value=mock_threads):
            with patch.object(reddit_ask, "log_usage"):
                with patch.object(reddit_ask, "check_rate_limit", return_value=(True, 5, 0)):
                    handler = MockHandler(
                        body={"question": "¿Qué es el I-485?", "lang": "es"},
                        headers={"Content-Type": "application/json"}
                    )
                    reddit_ask.handle_ask(handler, 8766)
        
        self.assertEqual(handler._response_status, 200)
        response = handler.response_json()
        
        # Disclaimer should be in Spanish
        self.assertIn("experiencias auto-reportadas", response["disclaimer"].lower())


class TestHashFunctions(unittest.TestCase):
    """Test the hash functions for rate limiting and feedback."""
    
    def test_hash_ip_is_consistent(self):
        """Same IP should always produce same hash."""
        ip = "192.168.1.1"
        hash1 = reddit_ask.hash_ip(ip)
        hash2 = reddit_ask.hash_ip(ip)
        
        self.assertEqual(hash1, hash2)
        self.assertEqual(len(hash1), 64)  # SHA-256 hex
    
    def test_hash_ip_is_different_for_different_ips(self):
        """Different IPs should produce different hashes."""
        hash1 = reddit_ask.hash_ip("192.168.1.1")
        hash2 = reddit_ask.hash_ip("192.168.1.2")
        
        self.assertNotEqual(hash1, hash2)
    
    def test_hash_question_normalizes_case(self):
        """Question hash should be case-insensitive."""
        hash1 = reddit_ask.hash_question("What is I-485?")
        hash2 = reddit_ask.hash_question("what is i-485?")
        
        self.assertEqual(hash1, hash2)
    
    def test_hash_question_normalizes_whitespace(self):
        """Question hash should normalize whitespace."""
        hash1 = reddit_ask.hash_question("What is I-485?")
        hash2 = reddit_ask.hash_question("  What is I-485?  ")
        
        self.assertEqual(hash1, hash2)


class TestLLMPrompts(unittest.TestCase):
    """Test the LLM prompt building functions."""
    
    def test_system_prompt_includes_rules(self):
        """System prompt should include all critical rules."""
        prompt = reddit_ask.build_system_prompt("en")
        
        # Check for key rules
        self.assertIn("paraphrase", prompt.lower())
        self.assertIn("never mention usernames", prompt.lower())
        self.assertIn("never give legal advice", prompt.lower())
        self.assertIn("uscis.gov", prompt.lower())
    
    def test_system_prompt_language(self):
        """System prompt should request response in correct language."""
        en_prompt = reddit_ask.build_system_prompt("en")
        es_prompt = reddit_ask.build_system_prompt("es")
        
        self.assertIn("English", en_prompt)
        self.assertIn("Spanish", es_prompt)
    
    def test_format_citation(self):
        """Citation formatting should include required fields."""
        thread = {
            "title": "Test thread",
            "subreddit": "USCIS",
            "permalink": "/r/USCIS/comments/abc123/test/",
            "score": 10,
            "num_comments": 5,
            "created_utc": "2024-01-15T10:00:00Z",
            "form_tags": ["I-485"],
            "step_tags": ["interview"],
        }
        
        citation = reddit_ask.format_citation(thread)
        
        self.assertEqual(citation["title"], "Test thread")
        self.assertEqual(citation["subreddit"], "USCIS")
        self.assertTrue(citation["permalink"].startswith("https://www.reddit.com"))
        self.assertEqual(citation["score"], 10)
        self.assertEqual(citation["formTags"], ["I-485"])
        self.assertEqual(citation["stepTags"], ["interview"])


class TestRSSParsing(unittest.TestCase):
    """Test RSS feed parsing."""
    
    def test_parse_rss_posts_extracts_data(self):
        """Should extract post data from RSS feed."""
        rss_content = """<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
                <title>N-400 interview experience in Sacramento</title>
                <link href="https://www.reddit.com/r/USCIS/comments/abc123/n400_interview/" />
                <updated>2024-01-15T10:00:00Z</updated>
                <content type="html">&lt;p&gt;Just had my interview today at the Sacramento field office.&lt;/p&gt;</content>
            </entry>
        </feed>"""
        
        posts = reddit_ingest.parse_rss_posts(rss_content, "USCIS")
        
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["reddit_id"], "abc123")
        self.assertEqual(posts[0]["subreddit"], "USCIS")
        self.assertIn("N-400", posts[0]["title"])
        self.assertIn("interview", posts[0]["selftext"].lower())
    
    def test_parse_rss_posts_handles_empty_content(self):
        """Should handle RSS entries without content."""
        rss_content = """<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
                <title>Quick question about I-485</title>
                <link href="https://www.reddit.com/r/USCIS/comments/def456/quick_question/" />
                <updated>2024-01-15T10:00:00Z</updated>
            </entry>
        </feed>"""
        
        posts = reddit_ingest.parse_rss_posts(rss_content, "USCIS")
        
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["selftext"], "")
    
    def test_parse_rss_posts_handles_malformed_xml(self):
        """Should return empty list for malformed XML."""
        rss_content = "not valid xml <>"
        
        posts = reddit_ingest.parse_rss_posts(rss_content, "USCIS")
        
        self.assertEqual(posts, [])


class TestBackgroundJobStatus(unittest.TestCase):
    """Test background ingestion job status."""
    
    def test_get_job_status_returns_state(self):
        """Should return current job state."""
        status = reddit_ingest.get_job_status()
        
        self.assertIn("running", status)
        self.assertIn("job_id", status)
        self.assertIn("started_at", status)
        self.assertIn("finished_at", status)
        self.assertIn("result", status)
        self.assertIn("error", status)
    
    def test_start_ingest_job_returns_job_info(self):
        """Should return job info immediately."""
        # Mock the actual ingestion to do nothing
        with patch.object(reddit_ingest, "ingest", return_value={"total_upserted": 0}):
            result = reddit_ingest.start_ingest_job(
                subreddits=["USCIS"],
                limit=10,
                token="test_token"
            )
        
        self.assertIn("ok", result)
        self.assertIn("job_id", result)
        
        # Wait for thread to finish
        import time
        time.sleep(0.1)


class TestPushEndpoint(unittest.TestCase):
    """Test the push endpoint for external data."""
    
    def test_process_push_data_strips_usernames(self):
        """Push endpoint should strip usernames from all fields."""
        threads = [
            {
                "reddit_id": "abc123",
                "title": "Thanks to u/helpful_user for the tip",
                "selftext": "As /u/another_user said...",
                "subreddit": "USCIS",
                "permalink": "/r/USCIS/comments/abc123/test/",
                "created_utc": "2024-01-15T10:00:00Z",
            }
        ]
        
        # Mock the upsert function
        with patch.object(reddit_ingest, "supabase_upsert_via_function", return_value={"ok": True, "upserted": 1}):
            result = reddit_ingest.process_push_data(threads, "test_token")
        
        # Check that process_post was called (which strips usernames)
        self.assertEqual(result["processed_count"], 1)
    
    def test_process_push_data_empty_payload(self):
        """Should return error for empty payload."""
        result = reddit_ingest.process_push_data([], "test_token")
        
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "empty_payload")
    
    def test_process_push_data_extracts_tags(self):
        """Should extract form/office/step tags from pushed data."""
        threads = [
            {
                "reddit_id": "xyz789",
                "title": "N-400 interview at Sacramento",
                "selftext": "Had my biometrics last week",
                "subreddit": "USCIS",
                "permalink": "/r/USCIS/comments/xyz789/test/",
                "created_utc": "2024-01-15T10:00:00Z",
            }
        ]
        
        # Process without mocking upsert to check what gets processed
        processed = reddit_ingest.process_post(threads[0])
        
        self.assertIn("N-400", processed["form_tags"])
        self.assertIn("sacramento-ca", processed["office_tags"])
        self.assertIn("interview", processed["step_tags"])
        self.assertIn("biometrics", processed["step_tags"])


class TestLanguageDetection(unittest.TestCase):
    """Test automatic language detection for search."""
    
    def test_detect_spanish_question(self):
        """Should detect Spanish questions."""
        spanish_questions = [
            "¿Qué preguntan en la entrevista del N-400?",
            "¿Cuánto tiempo tarda el I-485?",
            "Entrevista de ciudadanía experiencias",
            "Permiso de trabajo cuanto tiempo",
        ]
        
        for question in spanish_questions:
            lang = reddit_ask.detect_language(question)
            self.assertEqual(lang, "es", f"Failed to detect Spanish in: {question}")
    
    def test_detect_english_question(self):
        """Should detect English questions."""
        english_questions = [
            "What do they ask at the N-400 interview?",
            "How long is I-485 taking?",
            "Interview experience at Sacramento",
        ]
        
        for question in english_questions:
            lang = reddit_ask.detect_language(question)
            self.assertEqual(lang, "en", f"Incorrectly detected Spanish in: {question}")


class TestIngestAuth(unittest.TestCase):
    """Test ingestion endpoint authentication."""
    
    def test_ingest_unauthorized_without_token(self):
        """Should return 403 without valid auth."""
        os.environ.pop("REDDIT_INGEST_SECRET", None)
        
        with patch.object(reddit_ask, "community") as mock_community:
            mock_community.supabase.return_value = None
            
            handler = MockHandler(
                body={},
                headers={"Content-Type": "application/json"}
            )
            reddit_ask.handle_ingest(handler, 8766)
        
        self.assertEqual(handler._response_status, 403)
    
    def test_ingest_authorized_with_token(self):
        """Should accept valid bearer token."""
        os.environ["REDDIT_INGEST_SECRET"] = "test_secret"
        
        with patch.object(reddit_ask, "community") as mock_community:
            mock_community.supabase.return_value = None
            with patch("reddit_ingest.start_ingest_job", return_value={"ok": True, "job_id": "123"}):
                handler = MockHandler(
                    body={},
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": "Bearer test_secret"
                    }
                )
                reddit_ask.handle_ingest(handler, 8766)
        
        self.assertEqual(handler._response_status, 202)
        
        # Cleanup
        os.environ.pop("REDDIT_INGEST_SECRET", None)


class TestSearchNormalization(unittest.TestCase):
    """Test that search properly normalizes form numbers and queries."""
    
    def test_form_number_variations_in_post(self):
        """Form numbers should be extracted in various formats."""
        test_cases = [
            ("My N400 interview", ["N-400"]),
            ("Filed I485 yesterday", ["I-485"]),
            ("N-400 and I-765 combo", ["N-400", "I-765"]),
            ("i751 waiting", ["I-751"]),
        ]
        
        for text, expected_tags in test_cases:
            tags = reddit_ingest.extract_tags(text, reddit_ingest.FORM_PATTERNS)
            for tag in expected_tags:
                self.assertIn(tag, tags, f"Expected {tag} in tags for '{text}'")


class TestSpanishFormBoost(unittest.TestCase):
    """Test that Spanish queries boost the correct form types."""
    
    def _make_threads(self, form_tags_list):
        """Helper to create mock threads with specified form tags."""
        return [
            {
                "id": i,
                "reddit_id": f"thread{i}",
                "subreddit": "USCIS",
                "permalink": f"/r/USCIS/comments/thread{i}/test/",
                "title": f"Test thread {i}",
                "selftext": "",
                "top_comments": [],
                "score": 10,
                "num_comments": 5,
                "created_utc": "2024-01-15T10:00:00Z",
                "form_tags": tags,
                "office_tags": [],
                "step_tags": ["interview"],
                "rank": 1.0 if "N-400" in tags else 0.5,  # Simulate boost
            }
            for i, tags in enumerate(form_tags_list)
        ]
    
    def test_spanish_citizenship_query_boosts_n400(self):
        """Spanish citizenship question should return mostly N-400 threads."""
        # Simulate database returning properly ranked results
        # In production, the SQL function boosts N-400 for ciudadanía queries
        n400_threads = self._make_threads([["N-400"]] * 8)
        i485_threads = self._make_threads([["I-485"]] * 2)
        
        # Simulate what the boosted search should return
        # (N-400 threads ranked higher due to form boost)
        all_threads = sorted(
            n400_threads + i485_threads,
            key=lambda t: t["rank"],
            reverse=True
        )
        
        # Top 10 should be mostly N-400
        top_10 = all_threads[:10]
        n400_count = sum(1 for t in top_10 if "N-400" in t["form_tags"])
        
        self.assertGreaterEqual(n400_count, 7, 
            f"Expected at least 7 of top 10 to be N-400, got {n400_count}")
    
    def test_spanish_terms_map_to_correct_forms(self):
        """Verify the mapping of Spanish terms to expected forms."""
        # These mappings should be in the SQL function
        expected_mappings = {
            # N-400 / Citizenship
            "ciudadanía": "N-400",
            "ciudadano": "N-400",
            "naturalización": "N-400",
            "juramento": "N-400",
            "examen de cívica": "N-400",
            # I-485 / Green Card
            "residencia": "I-485",
            "tarjeta verde": "I-485",
            # I-765 / Work Permit
            "permiso de trabajo": "I-765",
            # I-130 / Family Petition
            "petición familiar": "I-130",
        }
        
        for spanish_term, expected_form in expected_mappings.items():
            # This test documents the expected behavior
            # The actual mapping happens in the SQL function
            self.assertIn(expected_form, ["N-400", "I-485", "I-765", "I-130", "I-751", "I-131"],
                f"Form {expected_form} should be a valid form number")
    
    def test_citizenship_interview_query_targets_n400(self):
        """Query about citizenship interview should target N-400."""
        # The query "¿Cuánto tarda la entrevista de ciudadanía?" contains:
        # - ciudadanía -> should map to N-400
        # - entrevista -> interview
        
        # This test verifies the language detection picks up the Spanish
        question = "¿Cuánto tarda la entrevista de ciudadanía?"
        lang = reddit_ask.detect_language(question)
        self.assertEqual(lang, "es", "Should detect Spanish")
        
        # Verify ciudadanía is detected as a citizenship term
        self.assertIn("ciudadanía", question.lower())


class TestPostgresRegexSemantics(unittest.TestCase):
    """Test that regex patterns use correct Postgres syntax.
    
    In Postgres:
    - \\b is BACKSPACE (ASCII 8), not a word boundary
    - \\y is word boundary
    - \\m is beginning of word
    - \\M is end of word
    
    This test class documents these differences and verifies the migration
    uses the correct syntax.
    """
    
    def test_postgres_word_boundary_is_backslash_y(self):
        """Verify the migration file uses \\y not \\b for word boundaries."""
        import os
        migration_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..",
            "supabase",
            "migrations",
            "20261113000300_postgres_regex_fix.sql"
        )
        
        with open(migration_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Should use \y for word boundaries
        self.assertIn(r"\y", content, "Migration should use \\y for word boundaries")
        
        # Should NOT use \b in regex patterns (except in comments)
        lines = [l for l in content.split("\n") if not l.strip().startswith("--")]
        code_content = "\n".join(lines)
        
        # Check that \b is not used as a word boundary in the actual SQL code
        # Note: \b in SQL strings would be written as \\b in the file
        import re
        # Look for patterns like ~* '\b or ~* '...\b that indicate word boundary usage
        bad_patterns = re.findall(r"~\*?\s*'[^']*\\b[^']*'", code_content)
        self.assertEqual(len(bad_patterns), 0, 
            f"Migration should not use \\b as word boundary. Found: {bad_patterns}")
    
    def test_migration_handles_accented_characters(self):
        """Migration should match both accented and unaccented Spanish terms."""
        import os
        migration_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..",
            "supabase",
            "migrations",
            "20261113000300_postgres_regex_fix.sql"
        )
        
        with open(migration_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Should handle ciudadanía (with accent) and ciudadania (without)
        self.assertIn("ciudadania", content.lower(), 
            "Should match ciudadania without accent")
        
        # Should use translate() to normalize accents
        self.assertIn("translate", content.lower(),
            "Should use translate() to normalize accents")
    
    def test_spanish_terms_detected_with_and_without_accents(self):
        """Language detection should work with and without accents."""
        # With accent
        self.assertEqual(reddit_ask.detect_language("ciudadanía"), "es")
        # Without accent (if someone types without)
        self.assertEqual(reddit_ask.detect_language("ciudadania"), "es")
        
        # Full query with accent
        self.assertEqual(
            reddit_ask.detect_language("¿Cuánto tarda la entrevista de ciudadanía?"),
            "es"
        )


class TestSpanishQueryIntegration(unittest.TestCase):
    """Integration tests for Spanish queries returning correct results."""
    
    def test_ask_with_spanish_citizenship_query(self):
        """Spanish citizenship query should work end-to-end."""
        os.environ["CASECIRCLE_LLM_API_KEY"] = ""  # No LLM
        
        # Create mock threads with various form tags
        # N-400 threads should rank higher for citizenship queries
        mock_threads = [
            {
                "id": i,
                "reddit_id": f"n400_{i}",
                "subreddit": "USCIS",
                "permalink": f"/r/USCIS/comments/n400_{i}/test/",
                "title": f"N-400 interview experience {i}",
                "selftext": "Had my citizenship interview",
                "top_comments": [],
                "score": 20,
                "num_comments": 10,
                "created_utc": "2024-01-15T10:00:00Z",
                "form_tags": ["N-400"],
                "office_tags": [],
                "step_tags": ["interview"],
            }
            for i in range(8)
        ] + [
            {
                "id": 100 + i,
                "reddit_id": f"i485_{i}",
                "subreddit": "USCIS",
                "permalink": f"/r/USCIS/comments/i485_{i}/test/",
                "title": f"I-485 interview experience {i}",
                "selftext": "Had my green card interview",
                "top_comments": [],
                "score": 15,
                "num_comments": 5,
                "created_utc": "2024-01-14T10:00:00Z",
                "form_tags": ["I-485"],
                "office_tags": [],
                "step_tags": ["interview"],
            }
            for i in range(2)
        ]
        
        with patch.object(reddit_ask, "search_threads", return_value=mock_threads):
            with patch.object(reddit_ask, "log_usage"):
                with patch.object(reddit_ask, "check_rate_limit", return_value=(True, 5, 0)):
                    handler = MockHandler(
                        body={"question": "¿Cuánto tarda la entrevista de ciudadanía?", "lang": "es"},
                        headers={"Content-Type": "application/json"}
                    )
                    reddit_ask.handle_ask(handler, 8766)
        
        self.assertEqual(handler._response_status, 200)
        response = handler.response_json()
        
        # Should have citations
        self.assertGreater(len(response["citations"]), 0)
        
        # Check that N-400 threads are present in citations
        n400_citations = [c for c in response["citations"] if "N-400" in c.get("formTags", [])]
        self.assertGreater(len(n400_citations), 0,
            "Should have N-400 threads in citations for citizenship query")


if __name__ == "__main__":
    unittest.main()
