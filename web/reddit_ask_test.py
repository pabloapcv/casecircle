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
    def __init__(self, body: dict | None = None, headers: dict | None = None, ip: str = "127.0.0.1"):
        self.body = body or {}
        self.headers = headers or {"Content-Type": "application/json"}
        self.client_address = (ip, 12345)
        self._response_status = None
        self._response_headers = {}
        self._response_body = b""
        
        # Set Content-Length header based on body
        if body:
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
    
    def response_json(self) -> dict:
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
            "id": "abc123",
            "title": "Thanks to u/helpful_user for this tip!",
            "selftext": "As /u/another_user mentioned, check @someone's guide",
            "subreddit": "USCIS",
            "permalink": "/r/USCIS/comments/abc123/test/",
            "score": 10,
            "num_comments": 5,
            "created_utc": 1699012345,
        }
        
        # Mock fetch_post_comments to return empty
        with patch.object(reddit_ingest, "fetch_post_comments", return_value=[]):
            result = reddit_ingest.process_post(post, fetch_comments=False)
        
        self.assertIsNotNone(result)
        self.assertNotIn("helpful_user", result["title"])
        self.assertNotIn("another_user", result["selftext"])
        self.assertNotIn("someone", result["selftext"])
        self.assertIn("[user]", result["title"])
        self.assertIn("[user]", result["selftext"])


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


if __name__ == "__main__":
    unittest.main()
