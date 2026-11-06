import { spaceById } from "./logic.js";

/*
 * Information architecture. Tools first, community second:
 *   papers    -> Folder Builder (guided AI chat, checklist, document checks, folder readiness)
 *   wait      -> Check the wait (official times, public-post timelines, next steps)
 *   interview -> Interview prep
 *   insights  -> Insights from public posts (+ Ask the posts and common questions)
 *   feed      -> Community: posts from your case groups
 * Plus the account menu (profile, cases, language, rules).
 * Internal route names are unchanged so saved state and old deep links keep working;
 * public slugs and legacy ids both resolve through ROUTE_ALIASES.
 */
export const ROUTE_ALIASES = {
  feed: "home", home: "home", community: "home", inicio: "home",
  groups: "spaces", spaces: "spaces", communities: "spaces", "case-groups": "spaces",
  wait: "timelines", timelines: "timelines", "check-the-wait": "timelines",
  papers: "prepare", prepare: "prepare", folder: "prepare", "gather-papers": "prepare",
  answers: "bot", bot: "bot", "ask-posts": "bot", ask_posts: "bot",
  faq: "questions", questions: "questions", "common-questions": "questions",
  account: "you", you: "you", profile: "you",
  new: "ask", ask: "ask", "new-post": "ask",
  interview: "interview", search: "search",
  pricing: "pricing", price: "pricing", "case-pass": "pricing",
  form: "form",
  insights: "insights", datos: "insights", data: "insights",
  builder: "prepare", "folder-builder": "prepare"
};
export const ROUTE_SLUG = { home: "feed", spaces: "groups", timelines: "wait", prepare: "papers", bot: "answers", questions: "faq", you: "account", ask: "new", interview: "interview", search: "search", pricing: "pricing", insights: "insights" };
export const SECTION_OF = {
  home: "feed", post: "feed", search: "feed", spaces: "feed", space: "feed", ask: "feed", form: "feed",
  interview: "interview",
  insights: "insights",
  timelines: "wait", "profile-edit": "wait",
  prepare: "papers",
  bot: "answers", questions: "answers",
  you: "account", mod: "account", pricing: "account"
};

export function resolveRouteName(name) {
  const key = String(name || "").trim().toLowerCase();
  return ROUTE_ALIASES[key] || null;
}

export function routeFromHash(hash) {
  const raw = decodeURIComponent(String(hash || "").replace(/^#/, ""));
  if (!raw) return null;
  const [key, value] = raw.includes("=") ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)] : [raw, ""];
  const k = key.toLowerCase();
  if (k === "post" && value) return { name: "post", id: value };
  if ((k === "group" || k === "space") && value && spaceById(value)) return { name: "space", id: value };
  if (k === "papers" || k === "prepare") return value && spaceById(value) ? { name: "prepare", spaceId: value } : { name: "prepare" };
  if (k === "interview") return { name: "interview", spaceId: value && spaceById(value) ? value : "i-485" };
  if ((k === "faq" || k === "questions") && value) return { name: "questions", id: value };
  if ((k === "form" || k === "forms") && value && spaceById(value)) return { name: "form", id: value };
  if (value) return null;
  const name = resolveRouteName(k);
  return name ? { name } : null;
}

export function hashForRoute(route) {
  const name = route?.name || "home";
  if (name === "post" && route.id) return `#post=${encodeURIComponent(route.id)}`;
  if (name === "space" && route.id) return `#group=${encodeURIComponent(route.id)}`;
  if (name === "prepare" && route.spaceId) return `#papers=${encodeURIComponent(route.spaceId)}`;
  if (name === "interview") return `#interview=${encodeURIComponent(route.spaceId || "i-485")}`;
  if (name === "questions" && route.id) return `#faq=${encodeURIComponent(route.id)}`;
  if (name === "form" && route.id) return `#form=${encodeURIComponent(route.id)}`;
  return ROUTE_SLUG[name] ? `#${ROUTE_SLUG[name]}` : "";
}

export function initialFor(name) {
  const match = String(name || "").match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase() : "?";
}

