import test from "node:test";
import assert from "node:assert/strict";
import { caseSummary, pickCase, savedPosts } from "./sidebar.js";

const iso = (monthsAgo) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toISOString();
};

function stateWith(user, extra = {}) {
  return { meId: "u1", members: [{ id: "u1", blocks: [], bookmarks: [], profiles: [], ...user }, ...(extra.members || [])], posts: extra.posts || [] };
}

test("pickCase prefers the screen's group, then the most recent filing", () => {
  const profiles = [
    { spaceId: "i-751", filed: iso(14) },
    { spaceId: "i-485", filed: iso(3) },
    { spaceId: "i-765", filed: "not a date" }
  ];
  assert.equal(pickCase(profiles, "i-751").spaceId, "i-751");
  assert.equal(pickCase(profiles, "n-400").spaceId, "i-485");
  assert.equal(pickCase(profiles).spaceId, "i-485");
  assert.equal(pickCase([]), null);
  assert.equal(pickCase(undefined), null);
});

test("caseSummary is null without a case and reports months without a wait estimate for small groups", () => {
  assert.equal(caseSummary(stateWith({})), null);
  assert.equal(caseSummary({ meId: null, members: [] }), null);
  const summary = caseSummary(stateWith({ profiles: [{ spaceId: "i-751", form: "I-751", stage: "biometrics", filed: iso(14), officeId: "vsc" }] }));
  assert.equal(summary.form, "I-751");
  assert.equal(summary.stage, "biometrics");
  assert.equal(summary.months, 14);
  assert.equal(summary.wait, null, "fewer than 20 timelines stays hidden");
  assert.equal(summary.others, 0);
});

test("caseSummary shows a percentile once 20 similar timelines exist", () => {
  const others = Array.from({ length: 20 }, (_, i) => ({ id: `o${i}`, blocks: [], profiles: [{ spaceId: "i-485", officeId: "nbc", filed: iso(i < 15 ? 2 : 20) }] }));
  const summary = caseSummary(stateWith({ profiles: [{ spaceId: "i-485", form: "I-485", stage: "filed", filed: iso(6), officeId: "nbc" }] }, { members: others }));
  assert.equal(summary.wait.count, 21);
  assert.equal(summary.wait.percentile, 71);
});

test("savedPosts lists live, unblocked bookmarks, newest save first", () => {
  const posts = [
    { id: "p1", status: "live", authorId: "a" },
    { id: "p2", status: "removed", authorId: "a" },
    { id: "p3", status: "live", authorId: "blocked" },
    { id: "p4", status: "live", authorId: "a" },
    { id: "p5", status: "live", authorId: "a" }
  ];
  const state = stateWith({ bookmarks: ["p1", "p2", "p3", "p4", "p5", "gone"], blocks: ["blocked"] }, { posts });
  const result = savedPosts(state, 2);
  assert.deepEqual(result.posts.map((post) => post.id), ["p5", "p4"]);
  assert.equal(result.total, 3);
  assert.deepEqual(savedPosts({ meId: null, members: [], posts }), { posts: [], total: 0 });
});
