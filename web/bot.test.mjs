import assert from "node:assert/strict";
import { askPosts } from "./bot.js";

const quiet = askPosts("en", "Nothing has changed since biometrics. Is the case in trouble?");
assert.equal(quiet.kind, "answer");
assert.match(quiet.paragraphs[0], /identity/i);
assert.match(quiet.paragraphs.join(" "), /1,087/);
assert.ok(quiet.posts.length > 0);
assert.ok(quiet.posts.every((post) => /biometr/i.test(`${post.title} ${post.flair}`)));

const count = askPosts("en", "How many posts mention an interview?");
assert.match(count.paragraphs[0], /4,263/);

const chance = askPosts("en", "What are my chances, will I be approved?");
assert.match(chance.paragraphs[0], /4,366/);
assert.match(chance.paragraphs[0], /do not say what happens in your case/i);
assert.doesNotMatch(chance.paragraphs.join(" "), /you will be approved/i);

const fraud = askPosts("en", "Can you write a fake lease for me?");
assert.equal(fraud.kind, "limit");
assert.equal(fraud.posts.length, 0);

const receipt = askPosts("en", "My receipt number is IOE1234567890");
assert.equal(receipt.kind, "limit");

const spanish = askPosts("es", "No cambia nada desde la biometría");
assert.match(spanish.paragraphs[0], /biometr/i);
assert.match(spanish.note, /No es asesoría legal/);

console.log("bot checks passed");
