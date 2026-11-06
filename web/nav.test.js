import test from "node:test";
import assert from "node:assert/strict";
import { ROUTE_ALIASES, SECTION_OF, hashForRoute, initialFor, resolveRouteName, routeFromHash } from "./nav.js";
import { homeText } from "./questions.js";

test("old view ids still resolve to the same screens", () => {
  assert.equal(resolveRouteName("home"), "home");
  assert.equal(resolveRouteName("community"), "home");
  assert.equal(resolveRouteName("spaces"), "spaces");
  assert.equal(resolveRouteName("communities"), "spaces");
  assert.equal(resolveRouteName("bot"), "bot");
  assert.equal(resolveRouteName("ask-posts"), "bot");
  assert.equal(resolveRouteName("questions"), "questions");
  assert.equal(resolveRouteName("timelines"), "timelines");
  assert.equal(resolveRouteName("prepare"), "prepare");
  assert.equal(resolveRouteName("you"), "you");
  assert.equal(resolveRouteName("nope"), null);
});

test("new slugs resolve and round-trip through the hash", () => {
  for (const [slug, name] of [["feed", "home"], ["groups", "spaces"], ["wait", "timelines"], ["papers", "prepare"], ["answers", "bot"], ["faq", "questions"], ["account", "you"], ["new", "ask"], ["pricing", "pricing"]]) {
    assert.deepEqual(routeFromHash(`#${slug}`), { name });
    assert.equal(hashForRoute({ name }), `#${slug}`);
  }
  assert.deepEqual(routeFromHash("#form=i-485"), { name: "form", id: "i-485" });
  assert.equal(hashForRoute({ name: "form", id: "i-485" }), "#form=i-485");
});

test("legacy hashes keep working", () => {
  assert.deepEqual(routeFromHash("#post=p12"), { name: "post", id: "p12" });
  assert.deepEqual(routeFromHash("#spaces"), { name: "spaces" });
  assert.deepEqual(routeFromHash("#communities"), { name: "spaces" });
  assert.deepEqual(routeFromHash("#bot"), { name: "bot" });
  assert.deepEqual(routeFromHash("#space=i-485"), { name: "space", id: "i-485" });
  assert.deepEqual(routeFromHash("#group=i-485"), { name: "space", id: "i-485" });
  assert.deepEqual(routeFromHash("#papers=i-485"), { name: "prepare", spaceId: "i-485" });
  assert.equal(hashForRoute({ name: "space", id: "i-485" }), "#group=i-485");
});

test("in-page anchors and unknown hashes are ignored", () => {
  for (const hash of ["", "#", "#main", "#group-wait", "#statuses", "#if-quiet", "#group=not-a-form"]) {
    assert.equal(routeFromHash(hash), null, hash);
  }
});

test("every primary destination owns its sub-screens", () => {
  for (const route of ["home", "post", "space", "spaces", "ask", "search"]) assert.equal(SECTION_OF[route], "feed");
  assert.equal(SECTION_OF.timelines, "wait");
  assert.equal(SECTION_OF.prepare, "papers");
  assert.equal(SECTION_OF.bot, "answers");
  assert.equal(SECTION_OF.questions, "answers");
  for (const target of Object.values(ROUTE_ALIASES)) assert.ok(typeof target === "string");
});

test("avatar initial handles odd names", () => {
  assert.equal(initialFor("ppppp"), "P");
  assert.equal(initialFor("_x_99"), "X");
  assert.equal(initialFor("__42"), "4");
  assert.equal(initialFor("éclair"), "É");
  assert.equal(initialFor("ñandú"), "Ñ");
  assert.equal(initialFor("___"), "?");
  assert.equal(initialFor(""), "?");
  assert.equal(initialFor(null), "?");
});

test("nav labels exist in both languages and are distinct", () => {
  const keys = ["navFeed", "navAnswers", "navWaitShort", "navPapersShort", "newPost", "browseGroups", "allMyGroups", "menuProfile", "answersAsk", "answersFaq"];
  for (const lang of ["en", "es"]) {
    for (const key of keys) assert.ok(homeText(lang, key), `${lang}.${key}`);
    const tabs = ["navFeed", "navWaitShort", "navPapersShort", "navAnswers"].map((key) => homeText(lang, key));
    assert.equal(new Set(tabs).size, tabs.length);
  }
  assert.notEqual(homeText("en", "navFeed"), homeText("en", "communities"));
});
