import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addComment,
  createAccount,
  evaluate,
  initialState,
  publish,
  rateLimited,
  RATE_WINDOWS,
  toggleVote,
  waitComparison
} from "./logic.js";

describe("PII safety filter", () => {
  it("allows ordinary timeline text", () => {
    assert.equal(evaluate("My biometrics were reused at VSC and I have been waiting 14 months.").verdict, "allow");
  });

  it("allows the public USCIS contact number", () => {
    assert.equal(evaluate("The USCIS contact center phone is 800-375-5283.").verdict, "allow");
  });

  it("allows talking about a passport appointment", () => {
    assert.equal(evaluate("My passport appointment is next week.").verdict, "allow");
  });

  it("blocks receipt numbers", () => {
    assert.equal(evaluate("My receipt is IOE1234567890").reason, "receipt");
    assert.equal(evaluate("receipt MSC2190123456").reason, "receipt");
    assert.equal(evaluate("IOE 1234567890").reason, "receipt");
    assert.equal(evaluate("EAC-12-345-67890").reason, "receipt");
  });

  it("blocks A-numbers", () => {
    assert.equal(evaluate("A-number A123456789").reason, "a-number");
    assert.equal(evaluate("alien number 012345678").reason, "a-number");
    assert.equal(evaluate("A012345678").reason, "a-number");
  });

  it("blocks SSN and passport numbers", () => {
    assert.equal(evaluate("SSN 123-45-6789").reason, "ssn");
    assert.equal(evaluate("passport number X1234567").reason, "passport");
    assert.equal(evaluate("pasaporte AB123456").reason, "passport");
  });

  it("holds scam language and blocks abuse", () => {
    assert.deepEqual(
      evaluate("Pay to expedite your case. WhatsApp me and gift cards are fine. Guaranteed approval."),
      { verdict: "hold", reason: "scam" }
    );
    assert.equal(evaluate("Please avoid notarios").verdict, "hold");
    assert.equal(evaluate("you are a bitch").reason, "abuse");
    assert.equal(evaluate("this class was long").verdict, "allow");
  });
});

function signedIn(username = "quiet_filing") {
  const created = createAccount(initialState("en"), {
    username,
    email: `${username}@example.com`,
    locale: "en",
    spaceIds: ["i-485"],
    profile: null
  });
  assert.equal(created.ok, true);
  return created.state;
}

const draft = {
  type: "question",
  title: "How long after biometrics is a quiet page normal?",
  body: "I filed an I-485 and the status has not moved. Looking for similar waits, not legal advice.",
  spaceIds: ["i-485"]
};

describe("rate limits", () => {
  it("blocks a second post inside the window", () => {
    let state = signedIn("rate_poster");
    const first = publish(state, draft);
    assert.equal(first.ok, true);
    const second = publish(first.state, { ...draft, title: "Second question about the same quiet page" });
    assert.equal(second.ok, false);
    assert.equal(second.error, "rate");
  });

  it("blocks a second comment inside the window", () => {
    let state = signedIn("rate_commenter");
    const posted = publish(state, draft);
    const other = createAccount(posted.state, {
      username: "other_voice",
      email: "other_voice@example.com",
      locale: "en",
      spaceIds: ["i-485"]
    });
    const first = addComment(other.state, posted.postId, "I waited several months after biometrics too.");
    assert.equal(first.ok, true);
    const second = addComment(first.state, posted.postId, "Adding another note about the same wait.");
    assert.equal(second.ok, false);
    assert.equal(second.error, "rate");
  });

  it("blocks a second upvote inside the window but allows removing a vote", () => {
    let state = signedIn("rate_voter");
    const posted = publish(state, draft);
    const voter = createAccount(posted.state, {
      username: "upvoter_one",
      email: "upvoter_one@example.com",
      locale: "en",
      spaceIds: ["i-485"]
    });
    const first = toggleVote(voter.state, posted.postId);
    assert.equal(first.ok, true);
    const removed = toggleVote(first.state, posted.postId);
    assert.equal(removed.ok, true, "removing a vote is not rate limited");
    const again = toggleVote(removed.state, posted.postId);
    assert.equal(again.ok, false);
    assert.equal(again.error, "rate");
  });

  it("exposes the window sizes used by posting and voting", () => {
    assert.equal(RATE_WINDOWS.post, 30_000);
    assert.equal(RATE_WINDOWS.comment, 8_000);
    assert.equal(RATE_WINDOWS.vote, 800);
    assert.equal(rateLimited({ rate: { post: Date.now() } }, "post"), true);
    assert.equal(rateLimited({ rate: { post: Date.now() - RATE_WINDOWS.post } }, "post"), false);
  });
});

describe("wait comparison privacy threshold", () => {
  it("hides percentiles until 20 similar profiles exist", () => {
    const state = signedIn("wait_user");
    const me = state.members.find((person) => person.username === "wait_user");
    const filed = new Date(Date.UTC(2025, 0, 1)).toISOString();
    me.profiles.push({ spaceId: "i-485", officeId: "nyc", filed, sample: false });
    const hidden = waitComparison(state, me.profiles[0]);
    assert.equal(hidden.publishable, false);
    assert.equal(hidden.percentile, null);
    for (let i = 0; i < 20; i += 1) {
      state.members.push({
        id: `c${i}`,
        username: `cohort_${i}`,
        sample: false,
        profiles: [{ spaceId: "i-485", officeId: "nyc", filed, sample: false }]
      });
    }
    const visible = waitComparison(state, me.profiles[0]);
    assert.equal(visible.publishable, true);
    assert.equal(typeof visible.percentile, "number");
  });
});
