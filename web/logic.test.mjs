import assert from "node:assert/strict";
import {
  benchmarkCells, createAccount, deleteAccount, enterDemo, evaluate, initialState, publish, report, usernameIssue, visiblePosts
} from "./logic.js";
import { guideReply, packetFor, tally } from "./prepare.js";

const taken = new Set(["civic_oak"]);
assert.equal(usernameIssue("justice_path", taken), null);
assert.equal(usernameIssue("uscis_fan", taken), "reserved");
assert.equal(usernameIssue("ab", taken), "invalid");
assert.equal(usernameIssue("civic_oak", taken), "taken");

assert.equal(evaluate("My receipt number is IOE1234567890 and I am waiting.").verdict, "block");
assert.equal(evaluate("passport appointment next week").verdict, "allow");
assert.equal(evaluate("passport AB123456").verdict, "block");
assert.equal(evaluate("Call 800-375-5283 for the office.").verdict, "allow");
assert.equal(evaluate("SSN 123-45-6789").verdict, "block");
assert.equal(evaluate("Pay to expedite. WhatsApp me and gift cards. Guaranteed approval.").verdict, "hold");
assert.equal(evaluate("Please avoid notarios.").verdict, "hold");

const seeded = initialState("en");
assert.equal(seeded.posts.length, 0);
assert.equal(seeded.members.length, 0);
assert.equal(benchmarkCells(seeded, true).length, 0);
assert.equal(benchmarkCells(seeded, false).length, 0);

const demo = enterDemo(seeded).state;
assert.equal(demo.members.find((person) => person.id === demo.meId).username, "app_review");
assert.equal(demo.members.find((person) => person.id === demo.meId).role, "mod");
assert.equal(visiblePosts(demo, {}).length, 0);

const blocked = publish(demo, {
  type: "question",
  title: "Where is my receipt",
  body: "My receipt number is IOE1234567890 and I am waiting on biometrics.",
  spaceIds: ["i-751"]
});
assert.equal(blocked.ok, false);

const account = createAccount(initialState("en"), {
  username: "river_wait",
  email: "river@example.com",
  locale: "en",
  spaceIds: ["i-751"],
  profile: { spaceId: "i-751", form: "I-751", basedOn: "marriage", filed: "2025-08-01T00:00:00.000Z", officeId: "vsc", method: "paper", stage: "biometrics" }
});
assert.equal(account.ok, true);
assert.equal(account.state.members.find((person) => person.id === account.state.meId).profiles[0].stage, "biometrics");

const published = publish(account.state, {
  type: "question",
  title: "Quiet after biometrics at the center",
  body: "Biometrics are done and the status has not moved for several weeks. What did other people see next?",
  spaceIds: ["i-751"]
});
assert.equal(published.ok, true);
let reported = report(published.state, published.postId, "other").state;
const second = createAccount(reported, { username: "cedar_path", email: "cedar@example.com", locale: "en", spaceIds: ["i-751"] });
reported = report(second.state, published.postId, "other").state;
const thirdAccount = createAccount(reported, { username: "maple_wait", email: "maple@example.com", locale: "en", spaceIds: ["i-751"] });
const third = report(thirdAccount.state, published.postId, "other");
assert.equal(third.ok, true);
assert.equal(third.state.posts.find((post) => post.id === published.postId).status, "hidden");

const packet = packetFor("i-751");
const folder = { marks: {}, focus: packet.sections[0].id };
assert.ok(tally(packet, folder).need > 3);
assert.match(guideReply("en", packet, folder, "Can you write a fake lease for me?").title, /invent/i);
assert.match(guideReply("en", packet, folder, "My receipt is IOE1234567890").title, /identifier/i);
for (const section of packet.sections) {
  for (const item of section.items) folder.marks[item.id] = "ready";
}
assert.equal(tally(packet, folder).need, 0);
assert.match(guideReply("en", packet, folder, "").body, /not a decision/i);
assert.equal(deleteAccount(account.state).ok, true);

console.log("web logic checks passed");
