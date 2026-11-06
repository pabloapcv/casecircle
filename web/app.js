import {
  addComment, badge, basedLabel, basedOn, benchmarkCells, blockMember, categories, createAccount,
  deleteAccount, emailOk, enterDemo, evaluate, initialState, kindHelp, kindLabel, kinds, levelName,
  markHelpful, me, member, moderate, monthLabel, monthsSince, officeById, officeName, offices,
  publish, queuedPosts, report, saveProfile, similarThreads, spaceById, spaceName, spaces,
  stageLabel, stages, t, toggleBookmark, toggleVote, visiblePosts, ago, usernameIssue, waitComparison,
  normalizeWebState
} from "./logic.js";
import { blankFolder, guideReply, packetFor, prepareText, tally, calculateScore, parseRFE, calculateRiskFlags } from "./prepare.js";
import { buildFolderChatPayload, scanFolderChatPayload } from "./folder-chat.js";
import { homeSteps, homeText, homePains, homeCompare, pricingText, helpText, formSeoText, questionGroups, questionText, quietSteps, statusLines, waitNote, statusDecoder, interviewTips } from "./questions.js";
import { formatCount, formatRedditDate, redditCatalog, redditFeed, redditForSpace, redditMonths, redditStats, redditThemes, themeForSpace } from "./reddit.js";
import { askPosts, botPrompts } from "./bot.js";
import { SECTION_OF, hashForRoute, initialFor, resolveRouteName, routeFromHash } from "./nav.js";
import { caseSummary, savedPosts } from "./sidebar.js";
import { toolsText } from "./tools-text.js";
import { BUILDER_FORMS, answerLabel, buildPlan, inferFromDescription, mergeAiPlan, nextQuestion, questionsFor, suggestItem } from "./builder.js";
import { computeReadiness, crossDocFindings, readinessBand, topFixes } from "./readiness.js";
import { maskIdentifiers } from "./redact.js";
import { deleteText, extractFromFile, kindOf, loadText, saveText, keepFile } from "./extract.js";
import { folderSummaryHtml } from "./summary.js";
import { NEXT_STEPS, OFFICIAL, WAIT_FORMS, rangeBar, waitPosition } from "./insights.js";

const KEY = "casecircle.web.v3";
/** A/B test Case Pass price: set to 19 or 29. Documented in README. */
const CASE_PASS_PRICE_USD = 19;
const WAITLIST_KEY = "casecircle.waitlist.v1";
let state = load();
let toast = "";
let onboard = blankOnboard();
let filters = { sort: "new", kind: "", stage: "", officeId: "" };
let spaceQuery = "";
let ask = blankAsk();
let profileDraft = null;
let reportTarget = null;
let guideQuestion = "";
let guideAnswer = null;
let showAllForms = false;
let publicView = "home";
let webShown = { home: 20, feed: 30, space: 30 };
let botQuestion = "";
let botAnswer = null;
let rfeText = "";
let rfeParsed = null;
let waitCalcProfile = null;
let evidenceMarks = {};
const folderChats = new Map();
// Tools state (in memory; folder data itself lives in state.folders and IndexedDB)
let aiStatus = { loaded: false, inflight: false, available: false, mock: false, provider: "", host: "", model: "" };
const builderUi = { desc: "", pending: null, pasteFor: "", pasteDraft: "", consentFor: "", consentDraft: "", consentCounts: 0, consentAgree: false, busy: {}, errors: {}, tailoring: "", showChat: false };
const dataCache = { timelines: null, insights: null, loading: false, failed: false };
const officialCache = new Map();
let folderChatStatus = { available: null, mock: false, reason: "", loaded: false, inflight: false };
let folderChatAbort = null;

function withoutSamples(saved) {
  const sampleIds = new Set((saved.members || []).filter((person) => person.sample).map((person) => person.id));
  if (!sampleIds.size) return saved;
  saved.members = saved.members.filter((person) => !person.sample);
  saved.posts = (saved.posts || []).filter((post) => !sampleIds.has(post.authorId)).map((post) => ({
    ...post,
    comments: (post.comments || []).filter((comment) => !sampleIds.has(comment.authorId))
  }));
  if (sampleIds.has(saved.meId)) saved.meId = null;
  return saved;
}

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const clean = normalizeWebState(withoutSamples(parsed));
      localStorage.setItem(KEY, JSON.stringify(clean));
      return clean;
    }
  } catch { /* start fresh */ }
  const lang = (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  return initialState(lang);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* keep the rendered UI if storage is unavailable */ }
}

function blankOnboard() {
  return { step: 0, email: "", emailDraft: "", showEmail: false, username: "", spaces: [], rules: false, advice: false, profile: blankProfile("i-485"), skippedProfile: false };
}

function blankProfile(spaceId) {
  const form = spaceById(spaceId)?.forms[0] || "";
  const now = new Date();
  return { spaceId, form, basedOn: "marriage", year: now.getFullYear(), month: now.getMonth() + 1, officeId: "unsure", method: "online", stage: "" };
}

function blankAsk() {
  return { step: 0, type: "", spaceIds: [], title: "", body: "", stage: "", warned: false };
}

function lang() { return state.lang === "es" ? "es" : "en"; }
function L(key) { return t(lang(), key); }
function P(key) { return prepareText(lang(), key); }
function Q(key) { return questionText(lang(), key); }
function H(key) { return homeText(lang(), key); }
function Pr(key) { return pricingText(lang(), key); }
function Help(key) { return helpText(lang(), key); }
function FormSeo(key) { return formSeoText(lang(), key); }
function T(key, vars) { return toolsText(lang(), key, vars); }
function casePassPriceLabel() {
  return lang() === "es" ? `US$${CASE_PASS_PRICE_USD} (una vez)` : `$${CASE_PASS_PRICE_USD} one-time`;
}
function readWaitlist() {
  try { return JSON.parse(localStorage.getItem(WAITLIST_KEY) || "[]"); } catch { return []; }
}
function saveWaitlistEmail(email) {
  const list = readWaitlist().filter((item) => item !== email);
  list.push(email);
  localStorage.setItem(WAITLIST_KEY, JSON.stringify(list));
}
function syncDocumentMeta() {
  const title = H("metaTitle");
  const desc = H("metaDesc");
  document.title = title;
  document.documentElement.lang = lang() === "es" ? "es" : "en";
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", desc);
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function boot() {
  if (new URLSearchParams(location.search).get("demo") === "1" && !state.meId) {
    state = enterDemo(state).state;
    save();
  }
  if (state.meId) {
    // Old saved routes and old/new deep links (#post=…, #spaces, #communities, #bot, #groups, #answers…) all resolve here.
    const saved = state.route?.name ? resolveRouteName(state.route.name) : null;
    if (saved && saved !== state.route.name) state.route = { ...state.route, name: saved };
    const fromHash = routeFromHash(location.hash);
    if (fromHash) state.route = fromHash;
  }
  ensureData();
  render();
}

let restoreFocus = "";

function render() {
  const root = document.querySelector("#app");
  let html = "";
  try {
    html = state.meId ? shell() : welcome();
  } catch (error) {
    html = `<pre class="page">${esc(error && (error.stack || error.message) || error)}</pre>`;
  }
  root.innerHTML = html;
  syncDocumentMeta();
  syncHash();
  const activeScope = root.querySelector(".scope-scroll .scope.on");
  if (activeScope) {
    const strip = activeScope.parentElement;
    strip.scrollLeft = Math.max(0, activeScope.offsetLeft - strip.offsetLeft - 24);
  }
  if (restoreFocus) {
    const field = document.getElementById(restoreFocus);
    if (field) {
      field.focus();
      const end = field.value?.length ?? 0;
      if (/^(text|search|textarea|email|url|tel|password)$/.test(field.type || "")) field.setSelectionRange?.(end, end);
    }
    restoreFocus = "";
  }
  if (state.route?.name === "questions" && state.route.id) {
    document.getElementById(`q-${state.route.id}`)?.scrollIntoView({ block: "start" });
  }
  const note = document.querySelector("#toast");
  if (toast) {
    const node = document.createElement("div");
    node.className = "toast";
    node.id = "toast";
    node.textContent = toast;
    root.querySelector(".site")?.append(node);
    if (!note) setTimeout(() => { toast = ""; const current = document.querySelector("#toast"); if (current) current.remove(); }, 2400);
  }
}

function shell() {
  return `<div class="site">${topbar()}<main class="page" id="main" tabindex="-1">${screen()}</main>${bottomNav()}${siteFoot()}</div>`;
}

let hashSynced = false;
function syncHash() {
  if (!state.meId || typeof history === "undefined") return;
  const next = hashForRoute(state.route || { name: "home" });
  if (!next || location.hash === next) { hashSynced = true; return; }
  const url = `${location.pathname}${location.search}${next}`;
  try {
    if (hashSynced) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  } catch { /* file:// or sandboxed frames */ }
  hashSynced = true;
}

function section() {
  return SECTION_OF[state.route?.name || "home"] || "";
}

const ICONS = {
  feed: '<path d="M4 6h16M4 12h12M4 18h14"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  wait: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  papers: '<path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4"/><path d="M9 13h6M9 17h6"/>',
  answers: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  chat: '<path d="M5 6h14v10H9l-4 3z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  caret: '<path d="m7 10 5 5 5-5"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
  shield: '<path d="M12 3.5 5 6.5v5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9v-5z"/>',
  book: '<path d="M5 4.5h10a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z"/><path d="M5 17.5a2 2 0 0 1 2-2h10"/>',
  interview: '<rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6"/>',
  insights: '<path d="M5 19.5V11M10 19.5V5.5M15 19.5v-6M20 19.5V8.5"/>',
  spark: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/>',
  upload: '<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9"/><path d="M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  doc: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  groups: '<circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.5"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 15.2A4.5 4.5 0 0 1 20.5 19"/>'
};
function icon(name, size = 20) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;
}

function logoMark(size = 28) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="16" cy="16" r="4" fill="currentColor"/></svg>`;
}

function langToggle() {
  const opt = (code, label, name) => `<button type="button" data-act="lang" data-lang="${code}" lang="${code}" aria-pressed="${lang() === code}" aria-label="${esc(name)}" class="${lang() === code ? "on" : ""}">${label}</button>`;
  return `<div class="lang-toggle" role="group" aria-label="${esc(H("langSwitch"))}">${opt("en", "EN", "English")}${opt("es", "ES", "Español")}</div>`;
}

function backButton(label = L("back"), attrs = 'data-act="back"') {
  return `<button type="button" class="back-link" ${attrs}>${icon("back", 18)}<span>${esc(label)}</span></button>`;
}

function fill(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => (key in values ? values[key] : ""));
}

/* Tools first, community last. "Insights" also owns Ask the posts and the common questions. */
function navItems() {
  return [
    { id: "papers", route: "prepare", label: T("navBuilder"), short: T("navBuilderShort") },
    { id: "wait", route: "timelines", label: T("navWait"), short: T("navWaitShort") },
    { id: "interview", route: "interview", label: T("navInterview"), short: T("navInterviewShort") },
    { id: "insights", route: "insights", label: T("navInsights"), short: T("navInsightsShort"), also: ["answers"] },
    { id: "feed", route: "home", label: T("navCommunity"), short: T("navCommunityShort") }
  ];
}

function hueFor(name) {
  let hash = 0;
  for (const char of String(name || "")) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return 150 + (hash % 120); // teal→blue→violet family, stays on-brand
}

function avatar(user, size = "") {
  const name = user?.username || "";
  return `<span class="avatar ${size}" style="--hue:${hueFor(name)}" aria-hidden="true">${esc(initialFor(name))}</span>`;
}

function topbar() {
  const user = me(state);
  const current = section();
  const item = (entry) => {
    const on = current === entry.id || (entry.also || []).includes(current);
    return `<a href="#${entry.id}" data-act="tab" data-tab="${entry.route}" class="nav-link${on ? " on" : ""}"${on ? ' aria-current="page"' : ""}>${esc(entry.label)}</a>`;
  };
  const name = user?.username || L("you");
  const mod = user?.role === "mod";
  return `<a href="#main" class="skip-link">${esc(H("skipToContent"))}</a>
  <header class="topbar app-bar">
    <div class="bar-inner">
      <a href="#papers" class="brand" data-act="tab" data-tab="prepare" aria-label="${esc(`${L("appName")} — ${T("navBuilder")}`)}">
        ${logoMark(28)}
        <span class="brand-text"><strong>${esc(L("appName"))}</strong><span class="brand-tag">${esc(L("notAffiliated"))}</span></span>
      </a>
      <nav class="nav app-nav" aria-label="${esc(H("navMain"))}">
        ${navItems().map(item).join("")}
      </nav>
      <div class="top-actions">
        ${langToggle()}
        <a href="#new" class="btn new-post" data-act="tab" data-tab="ask" aria-label="${esc(H("newPost"))}"${state.route?.name === "ask" ? ' aria-current="page"' : ""}>${icon("plus", 18)}<span class="new-post-label">${esc(H("newPost"))}</span></a>
        <div class="account">
          <button type="button" id="account-btn" class="account-btn${current === "account" ? " on" : ""}" data-act="account-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu" aria-label="${esc(`${H("accountMenu")}: ${name}`)}" title="${esc(name)}">
            ${avatar(user)}
            <span class="account-name">${esc(name)}</span>
            ${icon("caret", 16)}
          </button>
          <div id="account-menu" class="account-menu" role="menu" aria-labelledby="account-btn" hidden>
            <div class="menu-head" role="presentation">
              ${avatar(user, "lg")}
              <div class="menu-who"><strong class="menu-name">${esc(name)}</strong><span class="muted">${esc(levelName(lang(), user?.reputation || 0))}</span></div>
            </div>
            <button type="button" role="menuitem" data-act="tab" data-tab="you">${icon("user", 18)}<span>${esc(H("menuProfile"))}</span></button>
            <button type="button" role="menuitem" data-act="tab" data-tab="spaces">${icon("groups", 18)}<span>${esc(H("menuGroups"))}</span></button>
            ${mod ? `<button type="button" role="menuitem" data-act="mod">${icon("shield", 18)}<span>${esc(L("modQueue"))}</span></button>` : ""}
            <div class="menu-sep" role="separator"></div>
            <div class="menu-label" role="presentation">${icon("globe", 16)}<span>${esc(L("language"))}</span></div>
            <div class="menu-lang" role="group" aria-label="${esc(L("language"))}">
              <button type="button" role="menuitemradio" aria-checked="${lang() === "en"}" data-act="lang" data-lang="en" lang="en">English</button>
              <button type="button" role="menuitemradio" aria-checked="${lang() === "es"}" data-act="lang" data-lang="es" lang="es">Español</button>
            </div>
            <div class="menu-sep" role="separator"></div>
            <button type="button" role="menuitem" data-act="page" data-page="rules">${icon("book", 18)}<span>${esc(L("rules"))}</span></button>
          </div>
        </div>
      </div>
    </div>
  </header>`;
}

function bottomNav() {
  const user = me(state);
  if (!user) return "";
  const current = section();
  const item = (entry) => {
    const on = current === entry.id || (entry.also || []).includes(current);
    return `<a href="#${entry.id}" data-act="tab" data-tab="${entry.route}" class="${on ? "on" : ""}"${on ? ' aria-current="page"' : ""}>${icon(entry.id, 22)}<span>${esc(entry.short)}</span></a>`;
  };
  return `<nav class="bottom-nav" aria-label="${esc(H("navMain"))}">${navItems().map(item).join("")}</nav>`;
}

function groupSwitcher(activeId) {
  const user = me(state);
  const joined = user?.spaces || [];
  const ids = activeId && activeId !== "all" && activeId !== "browse" && !joined.includes(activeId) ? [...joined, activeId] : joined;
  const link = (href, attrs, label, on, extra = "") => `<a href="${href}" ${attrs} class="scope${on ? " on" : ""}${extra}"${on ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<nav class="scope-bar" aria-label="${esc(H("groupsLabel"))}">
    <div class="scope-scroll">
      ${link("#feed", 'data-act="tab" data-tab="home"', esc(H("allMyGroups")), activeId === "all")}
      ${ids.map((id) => link(`#group=${esc(id)}`, `data-act="open-space" data-id="${esc(id)}"`, esc(spaceName(lang(), id)), activeId === id)).join("")}
    </div>
    ${link("#groups", 'data-act="tab" data-tab="spaces"', `${icon("plus", 14)}<span>${esc(H("browseGroups"))}</span>`, activeId === "browse", " browse")}
  </nav>`;
}

function answersTabs(active) {
  const tab = (route, slug, label) => `<a href="#${slug}" data-act="tab" data-tab="${route}" class="${active === route ? "on" : ""}"${active === route ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  return `<nav class="sub-tabs" aria-label="${esc(H("navAnswers"))}">${tab("bot", "answers", H("answersAsk"))}${tab("questions", "faq", H("answersFaq"))}</nav>`;
}

let accountMenuReturn = null;
function menuItems(menu) {
  return [...menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')];
}
function openAccountMenu(focusFirst = true) {
  const button = document.getElementById("account-btn");
  const menu = document.getElementById("account-menu");
  if (!button || !menu) return;
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  accountMenuReturn = button;
  if (focusFirst) menuItems(menu)[0]?.focus();
}
function closeAccountMenu(returnFocus = false) {
  const button = document.getElementById("account-btn");
  const menu = document.getElementById("account-menu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  button?.setAttribute("aria-expanded", "false");
  if (returnFocus) (accountMenuReturn || button)?.focus();
}

document.addEventListener("keydown", (event) => {
  const menu = document.getElementById("account-menu");
  const button = document.getElementById("account-btn");
  if (!menu || !button) return;
  if (event.target === button && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    openAccountMenu(false);
    const items = menuItems(menu);
    (event.key === "ArrowUp" ? items[items.length - 1] : items[0])?.focus();
    return;
  }
  if (menu.hidden) return;
  if (event.key === "Escape") { event.preventDefault(); closeAccountMenu(true); return; }
  if (!menu.contains(event.target)) return;
  const items = menuItems(menu);
  const index = items.indexOf(document.activeElement);
  if (event.key === "Tab") { closeAccountMenu(false); return; }
  if (event.key === "ArrowDown") { event.preventDefault(); items[(index + 1) % items.length]?.focus(); return; }
  if (event.key === "ArrowUp") { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); return; }
  if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); return; }
  if (event.key === "End") { event.preventDefault(); items[items.length - 1]?.focus(); }
});

function applyHashRoute() {
  if (!state.meId) return;
  const route = routeFromHash(location.hash);
  if (!route) return;
  if (hashForRoute(route) === hashForRoute(state.route)) return;
  state.route = route;
  if (route.name === "ask") ask = blankAsk();
  save();
  render();
  window.scrollTo(0, 0);
}
window.addEventListener("popstate", applyHashRoute);
window.addEventListener("hashchange", applyHashRoute);

function siteFoot() {
  const signed = Boolean(me(state));
  const jump = (id, label) => `<button class="foot-link" data-act="home-section" data-id="${id}">${esc(label)}</button>`;
  return `<footer class="site-foot">
    <div class="foot-brand">
      <strong>${esc(L("appName"))}</strong>
      <p>${esc(H("footBlurb"))}</p>
    </div>
    <nav aria-label="Site links">
      <h2>${esc(H("footSite"))}</h2>
      ${jump("what", H("homeNavWhat"))}
      ${jump("pricing", H("homeNavPricing"))}
      ${jump("find-help", H("homeNavHelp"))}
      ${signed ? `<button class="foot-link" data-act="tab" data-tab="home">${esc(H("navFeed"))}</button>` : `<button class="foot-link" data-act="show-email">${esc(H("again"))}</button>`}
    </nav>
    <nav aria-label="Information">
      <h2>${esc(H("footRead"))}</h2>
      <button class="foot-link" data-act="page" data-page="about">${esc(L("about"))}</button>
      <button class="foot-link" data-act="page" data-page="privacy">${esc(L("privacy"))}</button>
      <button class="foot-link" data-act="page" data-page="rules">${esc(L("rules"))}</button>
      <button class="foot-link" data-act="open-pricing">${esc(H("homeNavPricing"))}</button>
      <a href="mailto:support@casecircle.app">${esc(L("contact"))}</a>
    </nav>
    <nav aria-label="Official resources">
      <h2>${esc(H("footOfficial"))}</h2>
      <a href="https://egov.uscis.gov/processing-times/" target="_blank" rel="noreferrer">${esc(H("footTimes"))}</a>
      <a href="https://egov.uscis.gov/e-request/Intro.do" target="_blank" rel="noreferrer">${esc(H("footInquiry"))}</a>
      <a href="https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/legal-services" target="_blank" rel="noreferrer">${esc(P("legalHelp"))}</a>
      <button class="foot-link" data-act="home-section" data-id="find-help">${esc(H("homeNavHelp"))}</button>
      <a href="https://www.uscis.gov/contactcenter" target="_blank" rel="noreferrer">${esc(H("footContact"))}</a>
    </nav>
    <div class="foot-base">
      <p>${esc(L("disclaimer"))} ${esc(H("homeTrust"))}</p>
      <span>© ${new Date().getFullYear()} ${esc(L("appName"))}</span>
    </div>
  </footer>`;
}

function screen() {
  const route = state.route || { name: "home" };
  if (route.name === "post") return postScreen(route.id);
  if (route.name === "space") return spaceScreen(route.id);
  if (route.name === "search") return searchScreen();
  if (route.name === "page") return pageScreen(route.page);
  if (route.name === "mod") return modScreen();
  if (route.name === "profile-edit") return profileEditor(route.spaceId, route.existing || false);
  if (route.name === "ask") return askScreen();
  if (route.name === "prepare") return prepareScreen(route.spaceId);
  if (route.name === "questions") return questionsScreen();
  if (route.name === "explain") return landing({ signed: true });
  if (route.name === "spaces") return spacesScreen();
  if (route.name === "timelines") return timelinesScreen();
  if (route.name === "insights") return insightsScreen();
  if (route.name === "bot") return botScreen();
  if (route.name === "you") return youScreen();
  if (route.name === "interview") return interviewScreen(route.spaceId);
  if (route.name === "pricing") return pricingScreen();
  if (route.name === "form") return formSeoScreen(route.id);
  return homeScreen();
}

function welcome() {
  const step = onboard.step;
  const home = step === 0 && publicView === "home";
  const jump = (id, label) => `<button data-act="home-section" data-id="${id}">${esc(label)}</button>`;
  const publicMain = () => {
    if (publicView === "home") return landing();
    if (publicView === "bot") return botScreen();
    if (publicView === "pricing") return pricingScreen({ public: true });
    if (publicView.startsWith("form:")) return formSeoScreen(publicView.slice(5), { public: true });
    return publicPage(publicView);
  };
  return `<div class="site">
    <header class="topbar public-bar">
      <button class="brand" data-act="public-home" aria-label="CaseCircle Home">${logoMark(28)}<span class="brand-text"><strong>${esc(L("appName"))}</strong><span class="brand-tag">${esc(L("notAffiliated"))}</span></span></button>
      ${home ? `<nav class="nav" aria-label="Navigation"><button data-act="start-tool" data-route="prepare">${esc(T("navBuilder"))}</button><button data-act="start-tool" data-route="timelines">${esc(T("navWait"))}</button><button data-act="start-tool" data-route="interview">${esc(T("navInterview"))}</button>${jump("insights-home", T("navInsights"))}${jump("talk", T("navCommunity"))}${jump("pricing", H("homeNavPricing"))}${jump("find-help", H("homeNavHelp"))}</nav>` : `<div class="nav"></div>`}
      <div class="top-actions">${langToggle()}</div>
    </header>
    <main class="page" id="main">${step === 0 ? publicMain() : onboardingScreen()}</main>
    ${siteFoot()}
  </div>`;
}

function onboardingScreen() {
  const step = onboard.step;
  return `<div class="narrow stack">
    <p class="kicker">${esc(L("notAffiliated"))}</p>
    <p class="muted">${esc(L("pitch"))}</p>
    <div class="spread">
      <p class="step">${esc(lang() === "es" ? "Paso" : "Step")} ${step}/4</p>
      <button class="ghost" data-act="skip-onboard">${esc(lang() === "es" ? "Saltar configuración" : "Skip setup")}</button>
    </div>
    ${step === 1 ? usernameStep() : ""}
    ${step === 2 ? spacesStep() : ""}
    ${step === 3 ? rulesStep() : ""}
    ${step === 4 ? profileStep() : ""}
    ${onboardFooter()}
  </div>`;
}

function landing({ signed = false } = {}) {
  const steps = homeSteps(lang());
  const pains = homePains(lang());
  const compare = homeCompare(lang());
  const formCards = ["i-485", "n-400", "i-130", "i-751"].map((id) => {
    const item = spaceById(id);
    if (!item) return "";
    return `<button class="card form-seo-card" data-act="open-form-seo" data-id="${esc(id)}">
      <div class="kicker">${esc(item.forms[0])}</div>
      <strong>${esc(lang() === "es" ? item.es : item.en)}</strong>
      <p class="muted">${esc(waitNote(lang(), id)?.title || "")}</p>
    </button>`;
  }).join("");

  return `${toolsHero(signed)}

    <section class="home-section" id="painpoints">
      <h2>${esc(H("painsTitle"))}</h2>
      <p class="lede">${esc(H("painsLead"))}</p>
      <div class="pain-grid">${pains.map((p) => `<button class="pain" data-act="pain-point" data-id="${esc(p.id)}"><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></button>`).join("")}</div>
    </section>

    <section class="home-section" id="what">
      <h2>${esc(H("whatTitle"))}</h2>
      <p class="lede">${esc(H("whatLead"))}</p>
      <div class="features">
        <article><h2>${esc(H("whatClockTitle"))}</h2><p>${esc(H("whatClockBody"))}</p></article>
        <article><h2>${esc(H("whatFolderTitle"))}</h2><p>${esc(H("whatFolderBody"))}</p></article>
        <article><h2>${esc(H("whatInterviewTitle"))}</h2><p>${esc(H("whatInterviewBody"))}</p></article>
        <article><h2>${esc(H("whatCommunityTitle"))}</h2><p>${esc(H("whatCommunityBody"))}</p></article>
        <article><h2>${esc(H("whatAnswersTitle"))}</h2><p>${esc(H("whatAnswersBody"))}</p></article>
      </div>
    </section>

    <section class="home-section" id="compare">
      <h2>${esc(lang() === "es" ? "Cómo se diferencia CaseCircle" : "How CaseCircle is different")}</h2>
      <p class="lede">${esc(lang() === "es" ? "Categorías de alternativas, sin nombres de competidores." : "Categories of alternatives — no competitor names.")}</p>
      <div class="compare-grid">${compare.map((row) => `<article class="card"><h3>${esc(row.title)}</h3><p>${esc(row.body)}</p><p class="muted">${esc(lang() === "es" ? "CaseCircle: comunidad bilingüe, listas en el dispositivo, gratis para empezar." : "CaseCircle: bilingual community, on-device checklists, free to start.")}</p></article>`).join("")}</div>
    </section>

    <section class="home-section" id="forms">
      <h2>${esc(FormSeo("formsTitle"))}</h2>
      <p class="lede">${esc(FormSeo("formsLead"))}</p>
      <div class="card-grid">${formCards}</div>
    </section>

    <section class="home-section" id="how">
      <h2>${esc(H("howTitle"))}</h2>
      <p class="lede">${esc(H("howLead"))}</p>
      <div class="how-grid">${steps.map((item, index) => `<article><span>${index + 1}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join("")}</div>
    </section>

    <section class="home-section" id="talk">
      <h2>${esc(Q("sayingTitle"))}</h2>
      <p class="lede">${esc(Q("sayingLead"))} ${esc(formatCount(redditCatalog().length))} ${esc(Q("dataListed"))}</p>
      <button class="btn" data-act="open-bot">${esc(Q("botTitle"))}</button>
      ${redditStatsBlock()}
      <h3>${esc(Q("dataTitles"))}</h3>
      <div class="feed">${redditCatalog().slice(0, webShown.home).map((item) => webCard(item, signed)).join("")}</div>
      ${redditCatalog().length > webShown.home ? `<button class="ghost" data-act="more-web" data-list="home">${esc(Q("dataMore"))}</button>` : ""}
    </section>

    ${pricingSection()}
    ${findHelpSection()}
    ${legalDisclaimer()}`;
}

function pricingSection() {
  const onList = readWaitlist().length > 0;
  return `<section class="home-section" id="pricing">
    <h2>${esc(Pr("pricingTitle"))}</h2>
    <p class="lede">${esc(Pr("pricingLead"))}</p>
    <div class="pricing-grid">
      <article class="card pricing-card">
        <p class="kicker">${esc(Pr("freeTitle"))}</p>
        <h3>${esc(Pr("freePrice"))}</h3>
        <p>${esc(Pr("freeBody"))}</p>
      </article>
      <article class="card pricing-card featured">
        <p class="kicker">${esc(Pr("passTitle"))}</p>
        <h3>${esc(casePassPriceLabel())}</h3>
        <p>${esc(Pr("passBody"))}</p>
        <p class="muted">${esc(Pr("abNote"))}</p>
        <button class="btn" data-act="waitlist-open" aria-describedby="waitlist-note">${esc(Pr("passComing"))}</button>
        <p id="waitlist-note" class="muted">${esc(Pr("waitlistHelp"))}</p>
        ${onList ? `<p class="note">${esc(Pr("waitlistSaved"))}</p>` : ""}
        <div id="waitlist-box" class="waitlist-box" hidden>
          <label class="field">${esc(L("continueEmail"))}
            <input id="waitlist-email" type="email" autocomplete="email" placeholder="you@email.com">
          </label>
          <button class="btn" data-act="waitlist-save">${esc(lang() === "es" ? "Guardar en este navegador" : "Save in this browser")}</button>
          <a class="text-link" href="mailto:support@casecircle.app?subject=${encodeURIComponent("Case Pass waitlist")}">${esc(Pr("waitlistMailto"))}</a>
        </div>
      </article>
    </div>
  </section>`;
}

function pricingScreen({ public: isPublic = false } = {}) {
  return `${isPublic || !me(state) ? "" : backButton()}
    <div class="page-head"><p class="kicker">${esc(L("notAffiliated"))}</p></div>
    ${pricingSection()}
    ${findHelpSection()}
    ${legalDisclaimer()}`;
}

function findHelpSection() {
  const links = [
    ["https://www.justice.gov/eoir/recognition-and-accreditation-program", Help("dojLabel")],
    ["https://www.ailalawyer.com/", Help("ailaLabel")],
    ["https://www.immigrationadvocates.org/legaldirectory/", Help("ianLabel")],
    ["https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/legal-services", Help("uscisLegalLabel")],
    ["https://consumer.ftc.gov/articles/how-avoid-immigration-scams-and-get-real-help", Help("ftcLabel")],
    ["https://www.uscis.gov/avoid-scams", Help("uscisScamLabel")]
  ];
  return `<section class="home-section" id="find-help">
    <h2>${esc(Help("findHelpTitle"))}</h2>
    <p class="lede">${esc(Help("findHelpLead"))}</p>
    <div class="card scam-warn">
      <h3>${esc(Help("notarioTitle"))}</h3>
      <p>${esc(Help("notarioBody"))}</p>
    </div>
    <ul class="help-links">${links.map(([href, label]) => `<li><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`).join("")}</ul>
  </section>`;
}

function formSeoScreen(spaceId, { public: isPublic = false } = {}) {
  const item = spaceById(spaceId) || spaceById("i-485");
  const id = item?.id || "i-485";
  const note = waitNote(lang(), id);
  const title = `${item.forms[0]} — ${lang() === "es" ? item.es : item.en}`;
  const tips = interviewTips(lang(), id).slice(0, 3);
  return `${isPublic || !me(state) ? backButton(L("back"), 'data-act="public-home"') : backButton()}
    <article class="narrow form-seo">
      <p class="kicker">${esc(L("notAffiliated"))}</p>
      <h1>${esc(title)}</h1>
      <p class="lede">${esc(note?.body || H("homeLede"))}</p>
      <div class="features">
        <article><h2>${esc(H("whatClockTitle"))}</h2><p>${esc(H("whatClockBody"))}</p></article>
        <article><h2>${esc(H("whatFolderTitle"))}</h2><p>${esc(H("whatFolderBody"))}</p></article>
        <article><h2>${esc(H("whatInterviewTitle"))}</h2><p>${esc(H("whatInterviewBody"))}</p></article>
      </div>
      <h2>${esc(H("whatInterviewTitle"))}</h2>
      <div class="stack">${tips.map((tip) => `<div class="card"><strong>${esc(tip.title)}</strong><p>${esc(tip.body)}</p></div>`).join("")}</div>
      <p class="muted">${esc(H("homeTrust"))}</p>
      ${!me(state) ? `<button class="btn" data-act="show-email">${esc(H("again"))}</button>` : `<button class="btn" data-act="open-folder" data-id="${esc(id)}">${esc(Q("pathFolder"))}</button>`}
    </article>
    ${findHelpSection()}
    ${legalDisclaimer()}`;
}

function legalDisclaimer() {
  return `<div class="disclaimer">
    <strong>${esc(lang() === "es" ? "Aviso legal importante" : "Important legal notice")}</strong>
    ${esc(lang() === "es" 
      ? "CaseCircle es solo para organización. No es asesoría legal. No garantiza aprobación, no reemplaza a un abogado, y no representa los requisitos de USCIS que pueden cambiar. Siempre verifica con las instrucciones oficiales vigentes."
      : "CaseCircle is for organization only. It is not legal advice. It does not guarantee approval, does not replace an attorney, and does not represent USCIS requirements, which may change. Always verify with current official instructions."
    )}
  </div>`;
}

function publicPage(page) {
  const body = page === "privacy" ? L("privacyBody") : page === "about" ? L("aboutBody") : L("rulesBody");
  const title = page === "privacy" ? L("privacy") : page === "about" ? L("about") : L("rules");
  return `${backButton(L("back"), 'data-act="public-home"')}<article class="narrow"><h1>${esc(title)}</h1><p>${esc(body)}</p></article>`;
}

function emailBox() {
  return `<label class="field">${esc(L("continueEmail"))}
    <input id="email" type="email" value="${esc(onboard.emailDraft)}" placeholder="you@email.com" autocomplete="email">
    <span class="muted">${esc(L("emailHelp"))}</span></label>
    <button class="btn" data-act="use-email">${esc(L("useEmail"))}</button>`;
}

function usernameStep() {
  const issue = onboard.username ? usernameIssue(onboard.username, new Set(state.members.map((person) => person.username.toLowerCase()))) : null;
  return `<h1>${esc(L("usernameTitle"))}</h1><p class="muted">${esc(L("usernameHelp"))}</p>
    <input id="username" type="text" value="${esc(onboard.username)}" autocapitalize="off" autocomplete="username">
    ${issue ? `<p class="danger">${esc(issue === "taken" ? L("taken") : issue === "reserved" ? L("reserved") : L("invalidName"))}</p>` : ""}`;
}

function spacesStep() {
  const list = showAllForms ? spaces : spaces.filter((item) => item.launch);
  const cards = list.map((item) => {
    const on = onboard.spaces.includes(item.id);
    return `<button class="card ${on ? "on" : ""}" data-act="toggle-space" data-id="${esc(item.id)}" aria-pressed="${on}">
      <div class="spread"><strong>${esc(item.forms[0])}</strong><span aria-hidden="true">${on ? "✓" : ""}</span></div>
      <div>${esc(lang() === "es" ? item.es : item.en)}</div>
    </button>`;
  }).join("");
  return `<h1>${esc(L("spacesTitle"))}</h1><p class="muted">${esc(H("joinSpaces"))}</p>
    <p class="onboard-tools">${icon("spark", 18)}<span>${esc(T("onboardToolsNote"))}</span></p>
    <div class="card-grid">${cards}</div>
    <button class="ghost" data-act="show-forms">${esc(showAllForms ? Q("showFewer") : Q("showAllForms"))}</button>`;
}

function rulesStep() {
  return `<h1>${esc(L("rulesTitle"))}</h1><p>${esc(L("rulesBody"))}</p>
    <label class="check"><input id="rules" type="checkbox" ${onboard.rules ? "checked" : ""}>${esc(L("agreeRules"))}</label>
    <label class="check"><input id="advice" type="checkbox" ${onboard.advice ? "checked" : ""}>${esc(L("agreeNotAdvice"))}</label>
    ${onboard.rules && onboard.advice ? "" : `<p class="muted">${esc(L("acceptBoth"))}</p>`}`;
}

function profileStep() {
  return `<h1>${esc(L("profileTitle"))}</h1>
    <p class="muted">${esc(L("profileHelp"))}</p>
    <p class="muted">${esc(lang() === "es" ? "Puedes agregar esto después si lo prefieres." : "You can add this later if you prefer.")}</p>
    ${profileFields("onboard")}`;
}

function profileFields(scope) {
  const draft = scope === "onboard" ? onboard.profile : profileDraft;
  const space = spaceById(draft.spaceId);
  const years = [];
  const year = new Date().getFullYear();
  for (let value = year; value >= year - 12; value -= 1) years.push(value);
  return `<div class="stack">
    <label class="field">${esc(lang() === "es" ? "Formulario" : "Form")}
      <select data-act="profile-space" data-key="spaceId">
        ${spaces.filter(s => s.launch).map(s => `<option value="${s.id}" ${s.id === draft.spaceId ? "selected" : ""}>${esc(s.forms[0])} - ${esc(lang() === "es" ? s.es : s.en)}</option>`).join("")}
      </select>
    </label>
    <label class="field">${esc(L("based"))}<select data-act="profile" data-key="basedOn">${basedOn.map((item) => `<option value="${item}" ${item === draft.basedOn ? "selected" : ""}>${esc(basedLabel(lang(), item))}</option>`).join("")}</select></label>
    <div class="row">
      <label class="field">${esc(L("month"))}<select data-act="profile" data-key="month">${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${index + 1 === Number(draft.month) ? "selected" : ""}>${esc(monthName(index))}</option>`).join("")}</select></label>
      <label class="field">${esc(L("year"))}<select data-act="profile" data-key="year">${years.map((value) => `<option ${value === Number(draft.year) ? "selected" : ""}>${value}</option>`).join("")}</select></label>
    </div>
    <label class="field">${esc(L("office"))}<select data-act="profile" data-key="officeId">${offices.map((item) => `<option value="${item.id}" ${item.id === draft.officeId ? "selected" : ""}>${esc(lang() === "es" ? item.es : item.en)}</option>`).join("")}</select></label>
    <label class="field">${esc(L("method"))}<select data-act="profile" data-key="method"><option value="online" ${draft.method === "online" ? "selected" : ""}>${esc(L("online"))}</option><option value="paper" ${draft.method === "paper" ? "selected" : ""}>${esc(L("paper"))}</option></select></label>
    <label class="field">${esc(L("stage"))}<select data-act="profile" data-key="stage"><option value="">${esc(L("choose"))}</option>${stages.map((item) => `<option value="${item}" ${item === draft.stage ? "selected" : ""}>${esc(stageLabel(lang(), item))}</option>`).join("")}</select></label>
  </div>`;
}

function monthName(index) {
  return new Intl.DateTimeFormat(lang() === "es" ? "es" : "en", { month: "long" }).format(new Date(Date.UTC(2026, index, 1)));
}

function onboardFooter() {
  const title = onboard.step === 4 ? L("saveProfile") : L("next");
  return `<div class="stack">
    <button class="btn" data-act="onboard-next">${esc(title)}</button>
    ${onboard.step === 4 ? `<button class="btn-secondary" data-act="onboard-skip">${esc(L("skip"))}</button>` : ""}
    <button class="ghost" data-act="onboard-back">${esc(L("back"))}</button>
  </div>`;
}

function redditStatsBlock() {
  const themes = redditThemes(lang());
  const months = redditMonths(lang());
  const peak = Math.max(...months.map((item) => item.count));
  return `<div class="stat-grid">
      <article><strong>${esc(formatCount(redditStats.posts))}</strong><span>${esc(Q("dataPosts"))}</span></article>
      <article><strong>${esc(formatCount(redditStats.bySub.USCIS))}</strong><span>r/USCIS</span></article>
      <article><strong>${esc(formatCount(redditStats.bySub.USCIS_FORUM))}</strong><span>r/USCIS_FORUM</span></article>
      <article><strong>${esc(formatCount(redditStats.questions))}</strong><span>${esc(Q("dataQuestions"))}</span></article>
    </div>
    <h3>${esc(Q("dataByMonth"))}</h3>
    <div class="month-list">${months.map((item) => `<div class="month-row"><span>${esc(item.label)}</span><span>${esc(formatCount(item.count))}</span><span class="month-bar"><span style="width:${Math.round((item.count / peak) * 100)}%"></span></span></div>`).join("")}</div>
    <h3>${esc(Q("dataByTopic"))}</h3>
    <div class="data-table">
      <div class="data-head"><span></span><span>${esc(Q("dataPosts"))}</span><span>r/USCIS</span><span>r/USCIS_FORUM</span></div>
      ${themes.slice(0, 10).map((item) => `<div class="data-row"><span>${esc(item.label)}</span><span>${esc(formatCount(item.total))}</span><span>${esc(formatCount(item.uscis))}</span><span>${esc(formatCount(item.forum))}</span></div>`).join("")}
    </div>`;
}

function botScreen() {
  const signed = Boolean(me(state));
  const answer = botAnswer;
  return `<div class="bot">
    ${signed ? answersTabs("bot") : backButton(L("back"), 'data-act="public-home"')}
    <h1>${esc(Q("botTitle"))}</h1>
    <p class="lede">${esc(Q("botLead"))}</p>
    <label class="field">${esc(Q("botAsk"))}<textarea id="bot-q" aria-label="${esc(Q("botAsk"))}">${esc(botQuestion)}</textarea></label>
    <button class="btn" data-act="bot-ask">${esc(Q("botAsk"))}</button>
    ${answer ? `<article class="bot-answer">${answer.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}${answer.note ? `<p class="read-note">${esc(answer.note)}</p>` : ""}${answer.posts.length ? `<h2>${esc(Q("botSources"))}</h2><div class="feed">${answer.posts.map((item) => webCard(item, signed)).join("")}</div>` : ""}</article>` : ""}
    <h2>${esc(Q("botTry"))}</h2>
    <div class="post-types">${botPrompts(lang()).map((prompt) => `<button class="post-type" data-act="bot-prompt" data-q="${esc(prompt)}"><strong>${esc(prompt)}</strong></button>`).join("")}</div>
  </div>`;
}

function webCard(item, signed) {
  const flair = item.flair ? ` · ${item.flair}` : "";
  return `<article class="web-post">
    <p class="web-meta">r/${esc(item.sub)} · ${esc(formatRedditDate(lang(), item.date))}${esc(flair)}</p>
    <h2>${esc(item.title)}</h2>
    <p class="web-stats">${esc(formatCount(item.score))} ${esc(Q("dataPoints"))} · ${esc(formatCount(item.comments))} ${esc(Q("dataComments"))}</p>
    <div class="row">
      <a class="text-link" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">${esc(Q("openPost"))}</a>
      ${signed ? `<button class="text-link" data-act="ask-web" data-space="${esc(item.space || "i-485")}" data-title="${esc(item.title)}">${esc(Q("askThis"))}</button>` : ""}
    </div>
  </article>`;
}

function homeScreen() {
  const user = me(state);
  const posts = visiblePosts(state, filters);
  const sorts = [["new", L("new")], ["top", L("top")], ["unanswered", L("unanswered")]];
  const hasProfiles = user?.profiles?.length > 0;
  
  return `<h1 class="sr-only">${esc(H("navFeed"))}</h1>
  <div class="with-rail">
    <div class="main-col">
      ${groupSwitcher("all")}
      ${!hasProfiles ? emptyProfileCTA() : ""}
      <button class="composer-bar" data-act="tab" data-tab="ask">${avatar(user)}<span>${esc(H("shareThought"))}</span></button>
      <div class="feed-controls">
        <div class="seg" role="group" aria-label="${esc(H("sortLabel"))}">${sorts.map(([sort, label]) => `<button data-act="sort" data-sort="${sort}" class="${filters.sort === sort ? "on" : ""}" aria-pressed="${filters.sort === sort}">${esc(label)}</button>`).join("")}</div>
      </div>
      <div class="chips" role="group" aria-label="${esc(H("postTypeLabel"))}">${chip(L("allPosts"), filters.kind === "", "")}${kinds.map((kind) => chip(kindLabel(lang(), kind), filters.kind === kind, kind)).join("")}</div>
      ${posts.length ? `<div class="post-list">${posts.map(postCard).join("")}</div>` : emptyFeed()}
      <h2 class="section-title">${esc(Q("dataTitles"))}</h2>
      <div class="feed">${redditFeed(user?.spaces || []).slice(0, webShown.feed).map((item) => webCard(item, true)).join("")}</div>
      ${redditFeed(user?.spaces || []).length > webShown.feed ? `<button class="btn-secondary more" data-act="more-web" data-list="feed">${esc(Q("dataMore"))}</button>` : ""}
    </div>
    ${caseRail()}
  </div>`;
}

/* Desktop right sidebar (>=1100px): your case, saved posts, tools, rules. Hidden on smaller screens. */
function caseRail(preferSpaceId = "") {
  const user = me(state);
  if (!user) return "";
  const summary = caseSummary(state, preferSpaceId);
  const saved = savedPosts(state, 3);
  const es = lang() === "es";
  let caseCard;
  if (summary) {
    const group = spaceName(lang(), summary.spaceId);
    const months = summary.months;
    const monthsText = months === 0 ? H("filedThisMonth") : months === 1 ? H("monthSinceFiling") : H("monthsSinceFiling");
    caseCard = `<section class="rail-card case-card" aria-labelledby="rail-case">
      <h2 class="rail-label" id="rail-case">${esc(H("yourCase"))}${summary.form ? ` · ${esc(summary.form)}` : ""}</h2>
      <p class="case-group">${esc(group)}</p>
      ${months != null ? `<p class="case-months">${months > 0 ? `<strong>${months}</strong>` : ""}<span>${esc(monthsText)}</span></p>` : ""}
      ${summary.stage ? `<p class="case-stage"><span>${esc(L("stage"))}</span> ${esc(stageLabel(lang(), summary.stage))}</p>` : ""}
      ${summary.wait ? `<div class="case-bar" role="img" aria-label="${esc(fill(H("waitLonger"), { p: summary.wait.percentile, n: summary.wait.count }))}"><span style="width:${Math.max(4, Math.min(100, summary.wait.percentile))}%"></span></div>
      <p class="case-note">${esc(fill(H("waitLonger"), { p: summary.wait.percentile, n: summary.wait.count }))}</p>` : `<p class="case-note">${esc(H("waitNoCompare"))}</p>`}
      ${summary.others > 0 ? `<p class="case-note">${esc(fill(H("moreCases"), { n: summary.others }))}</p>` : ""}
      <div class="case-links">
        <a href="#wait" data-act="tab" data-tab="timelines">${esc(Q("pathWait"))} <span aria-hidden="true">→</span></a>
        <a href="#papers=${esc(summary.spaceId)}" data-act="open-folder" data-id="${esc(summary.spaceId)}">${esc(Q("pathFolder"))} <span aria-hidden="true">→</span></a>
      </div>
    </section>`;
  } else {
    caseCard = `<section class="rail-card case-empty" aria-labelledby="rail-case">
      <h2 class="rail-label" id="rail-case">${esc(H("yourCase"))}</h2>
      <p class="rail-title">${esc(H("caseEmptyTitle"))}</p>
      <p class="rail-body">${esc(H("caseEmptyBody"))}</p>
      <button class="btn small" data-act="add-profile">${esc(L("addCase"))}</button>
      <div class="rail-links">
        <a href="#wait" data-act="tab" data-tab="timelines">${esc(Q("pathWait"))}</a>
        <a href="#papers" data-act="tab" data-tab="prepare">${esc(Q("pathFolder"))}</a>
      </div>
    </section>`;
  }
  const savedCard = `<section class="rail-card" aria-labelledby="rail-saved">
      <h2 class="rail-label" id="rail-saved">${esc(H("savedTitle"))}</h2>
      ${saved.posts.length ? `<ul class="rail-list">${saved.posts.map((post) => `<li><a href="#post=${esc(post.id)}" data-act="open-post" data-id="${esc(post.id)}"><span class="rail-post-title">${esc(post.title)}</span>${post.spaceIds?.[0] ? `<span class="rail-post-meta">${esc(spaceName(lang(), post.spaceIds[0]))}</span>` : ""}</a></li>`).join("")}</ul>
      ${saved.total > saved.posts.length ? `<a class="rail-more" href="#account" data-act="tab" data-tab="you">${esc(fill(H("savedSeeAll"), { n: saved.total }))}</a>` : ""}` : `<p class="rail-body">${esc(H("savedEmptyBody"))}</p>`}
    </section>`;
  const toolsCard = `<section class="rail-card" aria-labelledby="rail-tools">
      <h2 class="rail-label" id="rail-tools">${esc(H("addons"))}</h2>
      <a class="rail-tool" href="#papers" data-act="tab" data-tab="prepare"><strong>${esc(T("navBuilder"))}</strong><span>${esc(T("toolBuilderBody"))}</span></a>
      <a class="rail-tool" href="#insights" data-act="tab" data-tab="insights"><strong>${esc(T("navInsights"))}</strong><span>${esc(T("insightsHomeLead"))}</span></a>
      <a class="rail-tool" href="#answers" data-act="tab" data-tab="bot"><strong>${esc(H("navAnswers"))}</strong><span>${esc(H("answersBody"))}</span></a>
      <a class="rail-tool" href="#interview=${esc(summary?.spaceId || user.profiles?.[0]?.spaceId || "i-485")}" data-act="open-interview" data-id="${esc(summary?.spaceId || user.profiles?.[0]?.spaceId || "i-485")}"><strong>${esc(H("interviewPrep"))}</strong><span>${esc(H("interviewPrepBody"))}</span></a>
    </section>`;
  return `<aside class="rail" aria-label="${esc(H("sidebarLabel"))}">
    ${caseCard}
    ${savedCard}
    ${toolsCard}
    <a class="rail-rules" href="#rules" data-act="page" data-page="rules">${icon("book", 18)}<span><strong>${esc(L("rules"))}</strong><span>${esc(H("rulesLinkBody"))}</span></span></a>
    <p class="rail-note">${esc(L("disclaimer"))}</p>
  </aside>`;
}

function emptyProfileCTA() {
  return `<div class="next-card">
    <p class="kicker">${esc(lang() === "es" ? "Empieza aquí" : "Start here")}</p>
    <h2>${esc(lang() === "es" ? "Agrega tu primer caso" : "Add your first case")}</h2>
    <p>${esc(lang() === "es" ? "Para ver tiempos de espera personalizados y comparaciones" : "To see personalized wait times and comparisons")}</p>
    <button class="btn" data-act="add-profile">${esc(L("addCase"))}</button>
  </div>`;
}

function emptyFeed() {
  return `<div class="empty-state">
    ${icon("chat", 40)}
    <h3>${esc(lang() === "es" ? "No hay publicaciones todavía" : "No posts yet")}</h3>
    <p>${esc(H("emptyFeedBody"))}</p>
    <div class="row">
      <button class="btn" data-act="tab" data-tab="ask">${esc(H("newPost"))}</button>
      <button class="btn-secondary" data-act="tab" data-tab="spaces">${esc(H("browseGroups"))}</button>
    </div>
  </div>`;
}

function chip(label, on, kind) {
  return `<button class="chip ${on ? "on" : ""}" data-act="kind" data-kind="${esc(kind)}" aria-pressed="${on}">${esc(label)}</button>`;
}

function postCard(post, options = {}) {
  const author = member(state, post.authorId);
  const replies = (post.comments || []).filter((comment) => comment.status === "live").length;
  const space = post.spaceIds?.[0];
  const body = String(post.body || "").length > 180 ? `${post.body.slice(0, 177)}…` : post.body;
  return `<article class="thread">
    <div class="vote-col"><button data-act="vote" data-id="${esc(post.id)}" aria-label="${esc(lang() === "es" ? "Votar" : "Vote")}" aria-pressed="${Boolean(me(state)?.votes?.[post.id])}">↑</button><span>${post.votes}</span></div>
    <button class="thread-main" data-act="open-post" data-id="${esc(post.id)}">
      <div class="thread-meta">
        ${options.hideSpace || !space ? "" : `<span class="thread-space">${esc(spaceName(lang(), space))}</span>`}
        <span class="muted">${esc(author?.username || L("deletedMember"))} · ${esc(ago(lang(), post.createdAt))}</span>
        ${post.faq ? `<span class="pill plain">${esc(L("pinned"))}</span>` : ""}
      </div>
      <h2>${esc(post.title)}</h2>
      <p>${esc(body)}</p>
      <div class="meta">${replies} ${esc(L("replies"))} · ${esc(kindLabel(lang(), post.type))}</div>
    </button>
  </article>`;
}

function postFacts(post) {
  const rows = [];
  if (post.form) rows.push([L("form"), post.form]);
  const office = officeById(post.officeId);
  if (office) rows.push([L("office"), lang() === "es" ? office.es : office.en]);
  if (post.filed) rows.push([L("filed"), monthLabel(lang(), post.filed)]);
  if (post.stage) rows.push([L("stage"), stageLabel(lang(), post.stage)]);
  if (!rows.length) return "";
  return `<dl class="read-facts">${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}</dl>`;
}

function postScreen(id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post) return `<div class="with-rail"><div class="main-col">${backButton()}<div class="empty-state">${icon("chat", 40)}<h3>${esc(lang() === "es" ? "Publicación no encontrada" : "Post not found")}</h3><p>${esc(H("postMissingBody"))}</p><button class="btn" data-act="back">${esc(H("backToFeed"))}</button></div></div>${caseRail()}</div>`;
  const author = member(state, post.authorId);
  const user = me(state);
  const voted = Boolean(user?.votes?.[post.id]);
  const saved = user?.bookmarks?.includes(post.id);
  const space = post.spaceIds?.[0];
  const comments = (post.comments || []).filter((comment) => comment.status === "live" || user?.role === "mod");
  const context = [kindLabel(lang(), post.type), space ? spaceName(lang(), space) : "", ago(lang(), post.createdAt)].filter(Boolean);
  
  const decoded = post.stage ? statusDecoder(lang(), post.stage) : null;
  
  return `<div class="with-rail"><article class="read main-col">
    ${backButton()}
    ${post.status !== "live" ? `<p class="read-note">${esc(post.status === "held" ? L("held") : L("removed"))}</p>` : ""}
    <p class="read-kicker">${context.map((item) => esc(item)).join(" · ")}</p>
    <h1>${esc(post.title)}</h1>
    <p class="read-by">${esc(author?.username || L("deletedMember"))}${author?.role === "verified_pro" ? ` · ${esc(levelName(lang(), author.reputation))}` : ""}</p>
    <div class="read-body"><p>${esc(post.body)}</p></div>
    ${postFacts(post)}
    ${decoded ? statusDecoderInline(decoded) : ""}
    <div class="read-actions">
      <button class="vote${voted ? " on" : ""}" data-act="vote" data-id="${esc(post.id)}" aria-label="${esc(lang() === "es" ? "Votar" : "Vote")}" aria-pressed="${voted}">↑ ${post.votes}</button>
      <button data-act="bookmark" data-id="${esc(post.id)}" aria-pressed="${Boolean(saved)}" class="${saved ? "on" : ""}">${saved ? esc(L("saved")) : esc(L("save"))}</button>
      <button data-act="share" data-id="${esc(post.id)}">${esc(L("share"))}</button>
      <span class="read-tools">
        ${author && author.id !== user?.id ? `<button class="quiet" data-act="block" data-id="${esc(author.id)}">${esc(L("block"))}</button>` : ""}
        <button class="quiet" data-act="report-open" data-id="${esc(post.id)}">${esc(L("report"))}</button>
      </span>
    </div>
    ${reportTarget === post.id ? reportBox(post.id) : ""}
    <p class="read-note">${esc(L("disclaimer"))}</p>
    <section class="replies">
      <h2>${comments.length ? `${comments.length} ${esc(L("replies"))}` : esc(L("noReplies"))}</h2>
      <p class="read-note">${esc(L("commentNote"))}</p>
      ${comments.map((comment) => commentCard(post, comment)).join("")}
    </section>
    <section class="reply-box">
      <h2>${esc(L("writeReply"))}</h2>
      <div class="composer">
        <label class="field" for="reply">${esc(L("commentPlaceholder"))}</label>
        <textarea id="reply" placeholder="${esc(L("commentPlaceholder"))}"></textarea>
        <button class="btn block" data-act="reply" data-id="${esc(post.id)}">${esc(L("send"))}</button>
      </div>
    </section>
  </article>${caseRail(space || "")}</div>`;
}

function statusDecoderInline(decoded) {
  return `<div class="status-decoder">
    <strong>${esc(lang() === "es" ? "¿Qué significa esta etapa?" : "What does this stage mean?")}</strong>
    <p>${esc(decoded.explanation)}</p>
  </div>`;
}

function commentCard(post, comment) {
  const author = member(state, comment.authorId);
  const user = me(state);
  const helpful = post.helpfulCommentId === comment.id;
  const canMark = user && post.type === "question" && post.authorId === user.id && comment.authorId !== user.id;
  return `<article class="reply">
    <p class="read-by">${esc(author?.username || L("deletedMember"))}</p>
    <p>${esc(comment.body)}</p>
    <div class="read-actions">
      <button class="vote" data-act="vote" data-id="${esc(comment.id)}">↑ ${comment.votes}</button>
      ${canMark ? `<button data-act="helpful" data-post="${esc(post.id)}" data-id="${esc(comment.id)}">${helpful ? "✓ " : ""}${esc(L("helpful"))}</button>` : ""}
      <span class="read-tools"><button class="quiet" data-act="report-open" data-id="${esc(comment.id)}">${esc(L("report"))}</button></span>
    </div>
    ${reportTarget === comment.id ? reportBox(comment.id) : ""}
  </article>`;
}

function reportBox(id) {
  const reasons = [["spam", "Spam"], ["identifiers", lang() === "es" ? "Identificadores" : "Identifiers"], ["scam", lang() === "es" ? "Estafa" : "Scam"], ["other", lang() === "es" ? "Otro" : "Other"]];
  return `<div class="stack">${reasons.map(([reason, label]) => `<button class="btn-secondary" data-act="report" data-id="${esc(id)}" data-reason="${reason}">${esc(label)}</button>`).join("")}</div>`;
}

function spacesScreen() {
  const query = spaceQuery.trim().toLowerCase();
  const matches = (item) => !query || [item.en, item.es, item.forms.join(" ")].join(" ").toLowerCase().includes(query);
  const groups = categories.map((category) => {
    const list = spaces.filter((item) => item.categoryId === category.id && matches(item));
    if (!list.length) return "";
    return `<h2>${esc(lang() === "es" ? category.es : category.en)}</h2><div class="start-list">${list.map(spaceRow).join("")}</div>`;
  }).join("");
  const launch = spaces.filter((item) => item.launch && matches(item)).map((item) => `<button class="card mini" data-act="open-space" data-id="${esc(item.id)}"><span class="kicker">${esc(item.forms[0])}</span><strong>${esc(lang() === "es" ? item.es : item.en)}</strong><span class="muted count">${countMembers(item.id)} ${esc(L("members"))}</span></button>`).join("");
  return `${groupSwitcher("browse")}<div class="page-head"><h1>${esc(L("spaces"))}</h1><p class="muted">${esc(L("spacesHint"))}</p></div>
    <input id="space-search" type="search" placeholder="${esc(L("search"))}" value="${esc(spaceQuery)}" aria-label="${esc(L("search"))}">
    <h2>${esc(L("startHere"))}</h2><div class="start-list">${launch}</div>${groups}`;
}

function spaceRow(item) {
  return `<button class="card mini" data-act="open-space" data-id="${esc(item.id)}">
    <strong>${esc(lang() === "es" ? item.es : item.en)}</strong>
    <span class="muted">${esc(item.forms[0])}</span>
    <span class="pill ${item.launch ? "" : "plain"}">${esc(item.launch ? L("active") : L("newSpace"))}</span>
    <span class="muted count">${countMembers(item.id)} ${esc(L("members"))}</span>
  </button>`;
}

function countMembers(spaceId) {
  return state.members.filter((person) => (person.spaces || []).includes(spaceId) && !String(person.username).startsWith("path_")).length;
}

function spaceScreen(id) {
  const item = spaceById(id);
  if (!item) return "";
  const user = me(state);
  const joined = user?.spaces?.includes(id);
  const posts = visiblePosts(state, { ...filters, spaceId: id, sort: "new" });
  const web = redditForSpace(id);
  const theme = themeForSpace(id);
  return `<div class="with-rail"><div class="main-col space-page">${groupSwitcher(id)}
    <header class="space-head">
      <h1>${esc(lang() === "es" ? item.es : item.en)}</h1>
      <p>${esc(lang() === "es" ? item.blurbEs : item.blurbEn)}</p>
      <p class="meta">${esc(item.forms.join(" · "))} · ${countMembers(id)} ${esc(L("members"))}</p>
      ${theme ? `<p class="meta">${esc(formatCount(theme[2]))} ${esc(Q("dataMention"))}</p>` : ""}
      <div class="row">
        <button class="btn" data-act="ask-space" data-id="${esc(id)}">${esc(L("askHere"))}</button>
        <button class="btn-secondary" data-act="join" data-id="${esc(id)}">${esc(joined ? L("leave") : L("join"))}</button>
        <button class="btn-secondary" data-act="open-interview" data-id="${esc(id)}">${esc(lang() === "es" ? "Preparación entrevista" : "Interview prep")}</button>
      </div>
    </header>
    <p class="space-note">${esc(L("disclaimer"))}</p>
    ${posts.length ? `<div class="post-list">${posts.map((post) => postCard(post, { hideSpace: true })).join("")}</div>` : `<div class="empty-state">${icon("chat", 40)}<h3>${esc(lang() === "es" ? "No hay publicaciones en este grupo" : "No posts in this group yet")}</h3><p>${esc(fill(H("groupEmptyBody"), { g: lang() === "es" ? item.es : item.en }))}</p><button class="btn" data-act="ask-space" data-id="${esc(id)}">${esc(lang() === "es" ? "Sé el primero" : "Be the first")}</button></div>`}
    <h2 class="section-title">${esc(Q("dataOnForm"))}</h2>
    <div class="feed">${web.slice(0, webShown.space).map((entry) => webCard(entry, true)).join("") || `<p class="muted">${esc(L("noPosts"))}</p>`}</div>
    ${web.length > webShown.space ? `<button class="btn-secondary more" data-act="more-web" data-list="space">${esc(Q("dataMore"))}</button>` : ""}
  </div>${caseRail(id)}</div>`;
}

function askScreen() {
  if (ask.step === 0) {
    return `<div class="narrow"><h1>${esc(L("whatPosting"))}</h1><div class="post-types">${kinds.map((kind) => `<button class="post-type" data-act="ask-type" data-type="${kind}"><strong>${esc(kindLabel(lang(), kind))}</strong><span>${esc(kindHelp(lang(), kind))}</span></button>`).join("")}</div></div>`;
  }
  if (ask.step === 1) {
    const choices = spaces.filter((item) => me(state).spaces.includes(item.id) || item.launch);
    return `<div class="narrow stack"><h1>${esc(L("spaces"))}</h1><div class="start-list">${choices.map((item) => `<button class="card mini" data-act="ask-space" data-id="${item.id}" aria-pressed="${ask.spaceIds.includes(item.id)}">${ask.spaceIds.includes(item.id) ? "✓ " : ""}${esc(lang() === "es" ? item.es : item.en)}</button>`).join("")}</div>
      <button class="btn" data-act="ask-next" ${ask.spaceIds.length ? "" : "disabled"}>${esc(L("next"))}</button></div>`;
  }
  const spaceId = ask.spaceIds[0];
  const similar = ask.type === "question" && ask.title.length >= 8 ? similarThreads(state, ask.title, ask.body, spaceId) : [];
  const showSimilar = ask.warned && similar.length;
  return `<div class="narrow stack"><h1>${esc(kindLabel(lang(), ask.type))}</h1>
    <p class="muted">${esc(ask.spaceIds.map((id) => spaceName(lang(), id)).join(" · "))}</p>
    <label class="field">${esc(L("title"))}<input id="ask-title" value="${esc(ask.title)}"></label>
    <label class="field">${esc(L("body"))}<textarea id="ask-body">${esc(ask.body)}</textarea></label>
    ${ask.type === "timeline" || ask.type === "interview" ? `<label class="field">${esc(L("stage"))}<select id="ask-stage"><option value="">${esc(L("choose"))}</option>${stages.map((item) => `<option value="${item}" ${ask.stage === item ? "selected" : ""}>${esc(stageLabel(lang(), item))}</option>`).join("")}</select></label>` : ""}
    ${showSimilar ? `<h2>${esc(L("similar"))}</h2><div class="stack">${similar.map(postCard).join("")}</div>` : ""}
    <button class="btn" data-act="publish">${esc(showSimilar ? L("postAnyway") : L("publish"))}</button>
    <button class="ghost" data-act="ask-back">${esc(L("back"))}</button></div>`;
}

function topicSpace(id) {
  const map = {
    "ead-separate": "i-765", "cannot-work": "i-765", "i751-quiet": "i-751", "i751-online": "i-751", "petition-not-visa": "i-130",
    "n400-oath": "n-400", "oath-timeline": "n-400", "premium-not-adjustment": "i-140", "i140-not-greencard": "i-140", "premium-i140": "i-140",
    "travel-pending": "i-131", "card-travel": "i-131"
  };
  return map[id] || "i-485";
}

function questionsScreen() {
  const groups = questionGroups(lang());
  const topics = groups.flatMap((group) => group.items);
  return `${answersTabs("questions")}<div class="page-head"><h1>${esc(Q("askAbout"))}</h1><p>${esc(Q("askAboutLead"))}</p></div>
    <div class="start-list">${topics.map((item) => `<button class="card mini" data-act="ask-topic" data-id="${esc(item.id)}"><strong>${esc(item.q)}</strong><span class="muted count">${esc(Q("askThis"))}</span></button>`).join("")}</div>
    <div class="page-head"><h1>${esc(Q("questions"))}</h1><p>${esc(Q("questionsLead"))}</p><p class="footer-note muted">${esc(Q("questionsSource"))}</p></div>
    <nav class="jumps" aria-label="${esc(lang() === "es" ? "Ir a sección" : "Jump to section")}">${groups.map((group) => `<a href="#group-${esc(group.id)}">${esc(group.title)}</a>`).join("")}<a href="#statuses">${esc(Q("statuses"))}</a><a href="#if-quiet">${esc(Q("ifQuiet"))}</a></nav>
    ${groups.map((group) => `<h2 id="group-${esc(group.id)}">${esc(group.title)}</h2>${group.items.map((item) => `<article class="answer" id="q-${esc(item.id)}"><h3>${esc(item.q)}</h3><p>${esc(item.a)}</p><button class="ghost" data-act="ask-topic" data-id="${esc(item.id)}">${esc(Q("askThis"))}</button></article>`).join("")}`).join("")}
    <h2 id="statuses">${esc(Q("statuses"))}</h2>
    ${statusLines(lang()).map((line) => `<p><strong>${esc(line.name)}.</strong> ${esc(line.body)}</p>`).join("")}
    <h2 id="if-quiet">${esc(Q("ifQuiet"))}</h2>
    <ol>${quietSteps(lang()).map((step) => `<li><strong>${esc(step.title)}.</strong> ${esc(step.body)} <a href="${esc(step.href)}" target="_blank" rel="noreferrer">${esc(step.link)}</a></li>`).join("")}</ol>`;
}

function emptyProfileState() {
  return `<div class="empty-state" style="grid-column: 1/-1;">
    ${icon("papers", 40)}
    <h3>${esc(lang() === "es" ? "Agrega tu caso" : "Add your case")}</h3>
    <p>${esc(lang() === "es" ? "Para ver comparaciones con personas en situación similar" : "To see comparisons with people in similar situations")}</p>
  </div>`;
}

function waitCalculator() {
  const user = me(state);
  const profile = waitCalcProfile || user?.profiles?.[0] || null;
  
  if (!profile) {
    return `<div class="wait-calc">
      <h3>${esc(lang() === "es" ? "¿Es normal mi espera?" : "Is my wait normal?")}</h3>
      <p class="muted">${esc(lang() === "es" ? "Agrega un perfil de caso para comparar tu tiempo con otros" : "Add a case profile to compare your timeline with others")}</p>
      <button class="btn" data-act="add-profile">${esc(L("addCase"))}</button>
    </div>`;
  }
  
  const comparison = waitComparison(state, profile);
  const percentile = comparison.percentile;
  const percentileClass = percentile == null ? "" : percentile > 75 ? "coral" : percentile > 50 ? "amber" : "green";
  const percentileDesc = percentile == null
    ? ""
    : percentile > 75
      ? (lang() === "es" ? "Tu espera es más larga que la mayoría en este grupo" : "Your wait is longer than most in this group")
      : percentile > 50
        ? (lang() === "es" ? "Tu espera está en el rango medio de este grupo" : "Your wait is in the middle of this group")
        : (lang() === "es" ? "Tu espera es más corta que la mayoría en este grupo" : "Your wait is shorter than most in this group");
  
  return `<div class="wait-calc">
    <h3>${esc(lang() === "es" ? "¿Es normal mi espera?" : "Is my wait normal?")}</h3>
    
    ${user?.profiles?.length > 1 ? `<label class="field">${esc(lang() === "es" ? "Seleccionar caso" : "Select case")}
      <select data-act="wait-calc-profile">
        ${user.profiles.map(p => `<option value="${p.spaceId}" ${p.spaceId === profile.spaceId ? "selected" : ""}>${esc(spaceName(lang(), p.spaceId))} - ${esc(badge(lang(), p))}</option>`).join("")}
      </select>
    </label>` : ""}
    
    <div class="wait-result">
      ${comparison.publishable ? `<div class="wait-percentile ${percentileClass}">${percentile}%</div>` : ""}
      <div class="wait-desc">
        ${comparison.publishable ? `
          <strong>${esc(percentileDesc)}</strong>
          <span>${esc(lang() === "es" ? `De ${comparison.count} personas con perfil similar en CaseCircle` : `Of ${comparison.count} people with similar profiles on CaseCircle`)}</span>
        ` : `
          <strong>${esc(L("notEnough"))}</strong>
          <span>${esc(L("notEnoughBody"))}</span>
        `}
      </div>
    </div>
    
    <div class="meta" style="margin-top:12px;">
      <strong>${esc(spaceName(lang(), profile.spaceId))}</strong> · ${esc(badge(lang(), profile))} · ${comparison.mine} ${esc(L("months"))}
    </div>
    <p class="read-note">${esc(L("exampleBody"))}</p>
  </div>`;
}

function benchCard(cell, example) {
  const office = officeById(cell.officeId);
  return `<div class="card">
    <div class="spread"><strong>${esc(office ? (lang() === "es" ? office.es : office.en) : cell.officeId)}</strong>${example ? `<span class="pill amber">${esc(L("sample"))}</span>` : ""}</div>
    <div>${esc(stageLabel(lang(), cell.fromStage))} → ${esc(stageLabel(lang(), cell.toStage))}</div>
    <div class="kicker">${esc(lang() === "es" ? "Mediana" : "Median")} ${cell.median} ${esc(L("days"))}</div>
    <div class="muted">${cell.p25}–${cell.p75} ${esc(L("days"))} · ${cell.count} ${esc(L("people"))}</div>
  </div>`;
}

function readFolder(spaceId) {
  const user = me(state);
  if (!state.folders) state.folders = {};
  if (!user) return blankFolder(spaceId);
  if (!state.folders[user.id]) state.folders[user.id] = {};
  if (!state.folders[user.id][spaceId]) state.folders[user.id][spaceId] = blankFolder(spaceId);
  return state.folders[user.id][spaceId];
}

function chatFor(spaceId) {
  if (!folderChats.has(spaceId)) {
    folderChats.set(spaceId, { consent: false, shareFindings: false, draft: "", messages: [], status: "idle", error: "", retry: "" });
  }
  return folderChats.get(spaceId);
}

async function ensureChatStatus() {
  if (folderChatStatus.loaded || folderChatStatus.inflight) return;
  folderChatStatus.inflight = true;
  try {
    const response = await fetch("/api/folder-chat", { headers: { Accept: "application/json" } });
    const data = response.ok ? await response.json() : {};
    folderChatStatus = {
      available: Boolean(data.available),
      mock: Boolean(data.mock),
      reason: data.reason || (response.ok ? "unavailable" : "unavailable"),
      loaded: true
    };
  } catch {
    folderChatStatus = { available: false, mock: false, reason: "unavailable", loaded: true };
  }
  render();
}

function folderChatPanel(spaceId, packet, folder) {
  const chat = chatFor(spaceId);
  const local = guideReply(lang(), packet, folder, "");
  const loading = chat.status === "loading";
  const pendingStatus = !folderChatStatus.loaded;
  const unavailable = folderChatStatus.loaded && folderChatStatus.available === false;
  const messages = chat.messages.map((row, index) => {
    const who = row.role === "assistant" ? P("chatAssistant") : P("chatYou");
    const streamId = row.streaming ? " id=\"chat-stream\"" : "";
    const mock = row.mock ? `<p class="chat-mock">${esc(P("chatMockNote"))}</p>` : "";
    return `<article class="chat-msg ${esc(row.role)}"${streamId}><p class="chat-who">${esc(who)}</p>${mock}<p>${esc(row.text)}</p></article>`;
  }).join("");
  const composer = unavailable || pendingStatus ? "" : `<label class="field">${esc(P("chatPlaceholder"))}
      <textarea id="chat-q" ${chat.consent && !loading ? "" : "disabled"} placeholder="${esc(P("chatPlaceholder"))}" aria-label="${esc(P("chatTitle"))}">${esc(chat.draft)}</textarea>
    </label>
    <div class="chat-actions">
      ${loading ? `<button class="btn-secondary" data-act="chat-cancel">${esc(P("chatCancel"))}</button>` : `<button class="btn" data-act="chat-send" data-space="${esc(spaceId)}" ${chat.consent ? "" : "disabled"}>${esc(P("chatSend"))}</button>`}
      ${chat.status === "error" && chat.retry ? `<button class="ghost" data-act="chat-retry" data-space="${esc(spaceId)}">${esc(P("chatRetry"))}</button>` : ""}
    </div>`;
  return `<aside class="guide-card card stack chat-panel" aria-labelledby="chat-heading">
    <div class="kicker">${esc(P("guide"))}</div>
    <p class="muted">${esc(P("chatLocal"))}</p>
    <strong>${esc(local.title)}</strong>
    <p>${esc(local.body)}</p>
    <a href="${esc(local.href)}" target="_blank" rel="noreferrer">${esc(local.link)}</a>
    <h2 id="chat-heading">${esc(P("chatTitle"))}</h2>
    <p class="muted">${esc(P("chatLead"))}</p>
    ${pendingStatus ? `<p class="muted" role="status">${esc(lang() === "es" ? "Comprobando si el modelo de lenguaje está disponible…" : "Checking whether the language model is available…")}</p>` : ""}
    ${unavailable ? `<div class="chat-unavailable" role="status"><strong>${esc(P("chatUnavailable"))}</strong><p>${esc(P("chatUnavailableBody"))}</p></div>` : ""}
    ${folderChatStatus.mock ? `<p class="chat-mock">${esc(P("chatMockNote"))}</p>` : ""}
    ${unavailable || pendingStatus ? "" : `<label class="check-item chat-consent"><input id="chat-consent" type="checkbox" data-act="chat-consent" data-space="${esc(spaceId)}" ${chat.consent ? "checked" : ""} ${loading ? "disabled" : ""}><span>${esc(P("chatConsent"))}</span></label>`}
    ${unavailable || pendingStatus || !(folder.docs || []).some((doc) => doc.check) ? "" : `<label class="check-item chat-consent"><input id="chat-findings" type="checkbox" data-act="chat-findings" data-space="${esc(spaceId)}" ${chat.shareFindings ? "checked" : ""} ${loading ? "disabled" : ""}><span>${esc(T("chatFindingsConsent"))}</span></label>`}
    <div class="chat-log" id="chat-log" role="log" aria-live="polite">${messages || (unavailable || pendingStatus ? "" : `<p class="muted">${esc(P("chatEmpty"))}</p>`)}</div>
    ${loading ? `<p class="muted" role="status">${esc(P("chatLoading"))}</p>` : ""}
    ${chat.error ? `<p class="danger" role="alert">${esc(chat.error)}</p>` : ""}
    ${composer}
    <p class="footer-note muted">${esc(P("chatLegal"))}</p>
    <p class="footer-note muted">${esc(P("noPromise"))}</p>
  </aside>`;
}

async function sendFolderChat(spaceId, question) {
  const chat = chatFor(spaceId);
  const asked = String(question || chat.draft || "").trim();
  if (!asked || chat.status === "loading") return;
  if (!chat.consent) {
    chat.error = P("chatConsent");
    render();
    return;
  }
  const folder = readFolder(spaceId);
  const input = BUILDER_FORMS.includes(spaceId) ? readinessInput(spaceId) : null;
  const findings = input && chat.shareFindings
    ? [...input.docs.flatMap((doc) => (doc.check?.findings || []).filter((row) => !row.resolved).map((row) => ({ itemId: doc.itemId, status: doc.check.status, code: row.code, message: row.message }))),
       ...input.cross.filter((row) => !row.resolved).map((row) => ({ itemId: row.itemId, status: "possible_issue", code: row.code, message: row.message }))]
    : undefined;
  const payload = buildFolderChatPayload({
    spaceId,
    lang: lang(),
    question: asked,
    history: chat.messages.filter((row) => !row.streaming).map((row) => ({ role: row.role, text: row.text })),
    folder,
    consent: true,
    items: input ? input.items.map((item) => ({ id: item.id, label: itemLabel(item), status: input.marks[item.id] || "need" })) : undefined,
    findings
  });
  const blocked = scanFolderChatPayload(payload);
  if (blocked.verdict === "block") {
    chat.error = P("chatBlocked");
    chat.draft = asked;
    render();
    return;
  }
  if (folderChatAbort) folderChatAbort.abort();
  const abort = new AbortController();
  folderChatAbort = abort;
  chat.draft = "";
  chat.error = "";
  chat.retry = asked;
  chat.status = "loading";
  chat.messages.push({ role: "user", text: asked });
  chat.messages.push({ role: "assistant", text: "", streaming: true, mock: false });
  restoreFocus = "chat-q";
  render();
  try {
    const response = await fetch("/api/folder-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      signal: abort.signal
    });
    if (!response.ok) {
      let reason = "error";
      try {
        const err = await response.json();
        reason = err.error || err.reason || reason;
      } catch { /* use default */ }
      if (reason === "unavailable" || reason === "no_key") {
        folderChatStatus = { available: false, mock: false, reason, loaded: true };
        chat.messages.pop();
        chat.messages.pop();
        chat.draft = asked;
        chat.status = "idle";
        chat.error = "";
        render();
        return;
      }
      if (reason === "blocked" || reason === "consent") {
        chat.messages.pop();
        chat.messages.pop();
        chat.draft = asked;
        chat.status = "idle";
        chat.error = reason === "blocked" ? P("chatBlocked") : P("chatConsent");
        render();
        return;
      }
      throw new Error(reason);
    }
    const assistant = chat.messages[chat.messages.length - 1];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!abort.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const line = frame.split("\n").find((item) => item.startsWith("data:"));
        if (!line) continue;
        const data = JSON.parse(line.slice(5).trim());
        if (data.delta) {
          assistant.text += data.delta;
          const node = document.querySelector("#chat-stream p:last-child");
          if (node) node.textContent = assistant.text;
          else {
            restoreFocus = "chat-q";
            render();
          }
        }
        if (data.mock) assistant.mock = true;
        if (data.error) throw new Error(data.error);
      }
    }
    assistant.streaming = false;
    chat.status = "idle";
    restoreFocus = "chat-q";
    render();
    document.querySelector("#chat-log")?.scrollTo?.(0, 99999);
  } catch (error) {
    if (error && error.name === "AbortError") {
      const assistant = chat.messages[chat.messages.length - 1];
      if (assistant?.streaming) {
        assistant.streaming = false;
        if (!assistant.text) assistant.text = lang() === "es" ? "Cancelado." : "Cancelled.";
      }
      chat.status = "idle";
      restoreFocus = "chat-q";
      render();
      return;
    }
    chat.status = "error";
    chat.error = P("chatError");
    const assistant = chat.messages[chat.messages.length - 1];
    if (assistant?.streaming && !assistant.text) chat.messages.pop();
    else if (assistant) assistant.streaming = false;
    restoreFocus = "chat-q";
    render();
  } finally {
    if (folderChatAbort === abort) folderChatAbort = null;
  }
}

/* ───────────── Tools: shared ───────────── */
async function ensureAiStatus() {
  if (aiStatus.loaded || aiStatus.inflight) return;
  aiStatus.inflight = true;
  try {
    const response = await fetch("/api/ai-status", { headers: { Accept: "application/json" } });
    const data = response.ok ? await response.json() : {};
    aiStatus = { loaded: true, inflight: false, available: Boolean(data.available), mock: Boolean(data.mock), provider: String(data.provider || ""), host: String(data.host || ""), model: String(data.model || "") };
  } catch {
    aiStatus = { loaded: true, inflight: false, available: false, mock: false, provider: "", host: "", model: "" };
  }
  render();
}

function ensureData() {
  if (dataCache.timelines || dataCache.loading || dataCache.failed) return;
  dataCache.loading = true;
  Promise.all([
    fetch("data/timelines.json").then((r) => { if (!r.ok) throw new Error("t"); return r.json(); }),
    fetch("data/insights.json").then((r) => { if (!r.ok) throw new Error("i"); return r.json(); })
  ]).then(([timelines, insights]) => {
    dataCache.timelines = timelines;
    dataCache.insights = insights;
  }).catch(() => { dataCache.failed = true; }).finally(() => { dataCache.loading = false; render(); });
}

function officialFor(form, office) {
  const key = `${form}|${office || ""}`;
  if (officialCache.has(key)) return officialCache.get(key);
  officialCache.set(key, { loading: true });
  fetch(`/api/processing-times?form=${encodeURIComponent(form)}&office=${encodeURIComponent(office || "")}`, { headers: { Accept: "application/json" } })
    .then((r) => r.json())
    .then((data) => officialCache.set(key, data))
    .catch(() => officialCache.set(key, { source: "none", data: null, officialUrl: OFFICIAL.processing }))
    .finally(render);
  return officialCache.get(key);
}

function demoPill() {
  return aiStatus.mock ? `<span class="pill demo-ai" title="${esc(T("demoAiNote"))}">${icon("spark", 14)}${esc(T("demoAi"))}</span>` : "";
}

function formOfSpace(spaceId) {
  return spaceById(spaceId)?.forms?.[0] || spaceId.toUpperCase();
}

function extLink(href, label) {
  return `<a href="${esc(href)}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
}

/* Guest account for the tools: no email, nothing leaves this browser. */
function startTool(route) {
  if (!state.meId) {
    const taken = new Set(state.members.map((person) => person.username.toLowerCase()));
    let guest = "";
    for (let i = 0; i < 20; i += 1) {
      guest = `guest_${Math.random().toString(36).slice(2, 8)}`;
      if (!taken.has(guest) && !usernameIssue(guest, taken)) break;
    }
    const result = createAccount(state, { username: guest, email: "", locale: lang(), spaceIds: ["i-485", "i-130", "n-400"], profile: null });
    if (!result.ok) { toast = L(result.error) || result.error; render(); return; }
    state = result.state;
  }
  state.route = route;
  save();
  render();
  window.scrollTo?.(0, 0);
}

/* ───────────── Folder Builder: data ───────────── */
function builderOf(spaceId) {
  const folder = readFolder(spaceId);
  if (!folder.builder || typeof folder.builder !== "object") folder.builder = { answers: {}, description: "", done: false, ai: null, skippedAi: false };
  if (!folder.builder.answers) folder.builder.answers = {};
  if (!Array.isArray(folder.docs)) folder.docs = [];
  if (!Array.isArray(folder.resolvedCross)) folder.resolvedCross = [];
  return folder;
}

function planFor(spaceId) {
  const folder = builderOf(spaceId);
  return mergeAiPlan(buildPlan(spaceId, folder.builder.answers), folder.builder.ai);
}

function itemLabel(item) {
  return lang() === "es" ? item.es : item.en;
}

function readinessInput(spaceId) {
  const folder = builderOf(spaceId);
  const plan = planFor(spaceId);
  const ids = new Set(plan.items.map((item) => item.id));
  const docs = folder.docs.filter((doc) => ids.has(doc.itemId));
  const cross = crossDocFindings(docs, lang()).map((row) => ({ ...row, resolved: folder.resolvedCross.includes(`${row.docId}:${row.code}`) }));
  return { items: plan.items, marks: folder.marks || {}, docs, cross, plan, folder };
}

function fixText(fix, items) {
  const item = items.find((row) => row.id === fix.itemId);
  const label = item ? itemLabel(item) : "";
  if (fix.type === "add") return T("fixAdd", { item: label });
  if (fix.type === "evidence") return T("fixEvidence", { item: label });
  if (fix.type === "mismatch") return T("fixMismatch", { item: label });
  if (fix.type === "check") return T("fixCheck");
  const body = fix.fix || fix.message || "";
  return label ? `${label}: ${body}` : body;
}

function folderScore(spaceId) {
  const input = readinessInput(spaceId);
  return computeReadiness(input).score;
}

/* ───────────── Folder Builder: start ───────────── */
function builderStartScreen() {
  const user = me(state);
  const choices = [...new Set([...BUILDER_FORMS, ...(user?.spaces || []).filter((id) => BUILDER_FORMS.includes(id))])];
  const pending = builderUi.pending;
  const chips = choices.map((id) => `<button class="chip form-chip" data-act="builder-form" data-id="${esc(id)}"><strong>${esc(formOfSpace(id))}</strong><span>${esc(spaceName(lang(), id))}</span></button>`).join("");
  const started = choices.filter((id) => {
    const folder = state.folders?.[user?.id]?.[id];
    return folder && (folder.builder?.done || Object.keys(folder.builder?.answers || {}).length || (folder.docs || []).length || Object.keys(folder.marks || {}).length);
  });
  return `<div class="page-head builder-head">
      <p class="kicker">${icon("spark", 16)} ${esc(T("builderKicker"))} ${demoPill()}</p>
      <h1>${esc(T("builderTitle"))}</h1>
      <p class="lede">${esc(T("builderLead"))}</p>
      <p class="legal-line">${esc(T("notLegal"))}</p>
    </div>
    <section class="builder-chat card" aria-label="${esc(T("builderKicker"))}">
      <div class="bubbles">
        ${botBubble(T("builderHello"))}
        ${pending ? userBubble(pending.text) + botBubble(T("builderWhichForm")) : ""}
      </div>
      <div class="builder-compose">
        <p class="compose-label">${esc(T("builderPickForm"))}</p>
        <div class="form-chips" role="group" aria-label="${esc(T("builderPickForm"))}">${chips}</div>
        ${pending ? "" : `<p class="compose-label or">${esc(T("builderOr"))}</p>
        <label class="field sr-label"><span class="sr-only">${esc(T("builderOr"))}</span>
          <textarea id="builder-desc" rows="3" placeholder="${esc(T("builderDescribePh"))}">${esc(builderUi.desc)}</textarea>
        </label>
        <div class="compose-row"><p class="hint">${icon("lock", 14)} ${esc(T("builderDescribeHint"))}</p><button class="btn" data-act="builder-describe">${esc(T("builderStart"))}</button></div>`}
      </div>
    </section>
    ${started.length ? `<h2>${esc(T("formsTitle"))}</h2>
    <div class="card-grid folder-cards">${started.map((id) => {
      const score = folderScore(id);
      const band = readinessBand(score);
      return `<button class="card folder-card" data-act="open-folder" data-id="${esc(id)}">
        <div class="kicker">${esc(formOfSpace(id))}</div>
        <strong>${esc(spaceName(lang(), id))}</strong>
        <div class="mini-ready ${band}"><span class="mini-score">${score}</span><span>${esc(T("readinessTitle"))}</span></div>
        <div class="progress"><span style="width:${score}%"></span></div>
      </button>`;
    }).join("")}</div>` : ""}
    ${rfeHelperSection()}
    ${legalDisclaimer()}`;
}

function botBubble(text, extra = "") {
  return `<div class="bubble bot"><span class="bubble-avatar" aria-hidden="true">${icon("spark", 16)}</span><div class="bubble-body"><p class="bubble-who">${esc(T("assistant"))}</p><p>${esc(text)}</p>${extra}</div></div>`;
}
function userBubble(text) {
  return `<div class="bubble me"><div class="bubble-body"><p class="bubble-who">${esc(T("you"))}</p><p>${esc(text)}</p></div></div>`;
}

/* ───────────── Folder Builder: one folder ───────────── */
function builderIntake(spaceId, folder, plan) {
  const b = folder.builder;
  const questions = questionsFor(spaceId);
  const parts = [];
  if (b.description) {
    parts.push(userBubble(b.description));
    const picked = Object.entries(b.inferred || {}).map(([key, value]) => {
      const question = questions.find((row) => row.id === key);
      return question ? `<li><span>${esc(lang() === "es" ? question.es : question.en)}</span> <strong>${esc(answerLabel(lang(), spaceId, key, value))}</strong></li>` : "";
    }).filter(Boolean);
    parts.push(botBubble(picked.length ? T("builderPicked", { list: picked.length }) : T("builderPickedNone"), picked.length ? `<ul class="picked">${picked.join("")}</ul>` : ""));
  }
  let open = null;
  for (const question of questions) {
    const value = b.answers[question.id];
    if (value) {
      if (b.inferred && b.inferred[question.id] === value) continue;
      parts.push(botBubble(lang() === "es" ? question.es : question.en));
      parts.push(userBubble(answerLabel(lang(), spaceId, question.id, value)));
    } else if (!b.done) {
      open = question;
      break;
    }
  }
  if (open) {
    const options = open.options.map((option) => `<button class="chip answer-chip" data-act="builder-answer" data-space="${esc(spaceId)}" data-q="${esc(open.id)}" data-v="${esc(option.value)}">${esc(lang() === "es" ? option.es : option.en)}</button>`).join("");
    parts.push(botBubble(lang() === "es" ? open.es : open.en, `${open.hint ? `<p class="hint">${esc(lang() === "es" ? open.hint.es : open.hint.en)}</p>` : ""}<div class="answer-chips" role="group">${options}</div>`));
    parts.push(`<div class="intake-skip"><button class="ghost small" data-act="builder-skip" data-space="${esc(spaceId)}">${esc(T("builderSkipQuestions"))}</button></div>`);
    return { html: parts.join(""), done: false };
  }
  const added = plan.items.filter((item) => item.source !== "base").length;
  parts.push(botBubble(T("builderBuilt", { n: plan.items.length, added, removed: plan.removed.length })));
  // AI tailoring (optional, consented by the button itself; answers + labels only)
  if (b.ai) {
    const notes = (b.ai.notes || []).map((note) => `<li>${esc(note)}</li>`).join("");
    const changed = (b.ai.add || []).length + (b.ai.remove || []).length;
    parts.push(botBubble(changed ? T("builderTailored", { add: (b.ai.add || []).length, remove: (b.ai.remove || []).length }) : T("builderTailoredNone"), `${b.ai.mock ? `<p class="chat-mock">${esc(T("demoAiNote"))}</p>` : ""}${notes ? `<ul class="ai-notes">${notes}</ul>` : ""}`));
  } else if (builderUi.tailoring === spaceId) {
    parts.push(botBubble(T("builderTailoring")));
  } else if (!b.skippedAi) {
    const ready = aiStatus.loaded && aiStatus.available;
    const actions = ready
      ? `<div class="answer-chips"><button class="btn small" data-act="builder-tailor" data-space="${esc(spaceId)}">${icon("spark", 14)} ${esc(T("builderTailorBtn"))}</button><button class="chip" data-act="builder-tailor-skip" data-space="${esc(spaceId)}">${esc(T("builderTailorSkip"))}</button></div>
         <p class="hint">${esc(aiStatus.mock ? T("consentToDemo") : T("consentToProvider", { provider: aiStatus.provider, host: aiStatus.host, model: aiStatus.model }))}</p>`
      : "";
    parts.push(botBubble(aiStatus.loaded && !aiStatus.available ? T("builderTailorUnavailable") : T("builderTailorAsk"), actions));
  }
  if (b.aiError) parts.push(botBubble(b.aiError));
  parts.push(botBubble(T("builderNextUp")));
  return { html: parts.join(""), done: true };
}

function readinessCard(spaceId, input) {
  const result = computeReadiness(input);
  const fixes = topFixes(input, 3);
  const band = readinessBand(result.score);
  const unchecked = !input.docs.some((doc) => doc.check);
  const rows = [
    ["required", T("partRequired")],
    ["consistency", T("partConsistency")],
    ["dates", T("partDates")],
    ["evidence", T("partEvidence")]
  ].map(([key, label]) => {
    const part = result.parts[key];
    const pct = Math.round((part.points / Math.max(part.max, 1)) * 100);
    const note = unchecked && (key === "consistency" || key === "dates") ? `<span class="part-note">${esc(T("partUnchecked"))}</span>` : "";
    return `<div class="part-row"><div class="part-top"><span>${esc(label)}</span><strong>${Math.round(part.points)}<small>/${part.max}</small></strong></div><div class="part-bar ${readinessBand(pct)}"><span style="width:${pct}%"></span></div>${note}</div>`;
  }).join("");
  return `<section class="readiness card ${band}" id="readiness" aria-labelledby="readiness-h">
    <div class="ready-main">
      <div class="ready-ring ${band}" style="--p:${result.score}" role="img" aria-label="${esc(`${T("readinessTitle")}: ${result.score}/100`)}"><span>${result.score}</span><small>/100</small></div>
      <div class="ready-copy">
        <h2 id="readiness-h">${esc(T("readinessTitle"))} ${demoPill()}</h2>
        <p class="ready-note">${esc(T("readinessNote"))}</p>
      </div>
    </div>
    <div class="ready-parts">${rows}</div>
    <div class="ready-fixes">
      <h3>${esc(T("topFixes"))}</h3>
      ${fixes.length ? `<ol>${fixes.map((fix) => `<li><div class="fix-row"><span>${esc(fixText(fix, input.items))}</span><span class="pts">${esc(T("points", { n: fix.points }))}</span></div></li>`).join("")}</ol>` : `<p class="muted">${esc(T("noFixes"))}</p>`}
    </div>
    <div class="ready-foot">
      <details><summary>${esc(T("howScored"))}</summary><p>${esc(T("howScoredBody"))}</p></details>
      <button class="btn-secondary small" data-act="folder-summary" data-space="${esc(spaceId)}">${icon("doc", 16)} ${esc(T("downloadSummary"))}</button>
    </div>
  </section>`;
}

const STATUS_PILL = { matches: ["green", "statusMatches"], possible_issue: ["amber", "statusPossible"], mismatch: ["coral", "statusMismatch"] };

function docRow(spaceId, item, doc, input) {
  const busy = builderUi.busy[doc.id];
  const error = builderUi.errors[doc.id];
  const check = doc.check;
  const pill = check ? STATUS_PILL[check.status] : null;
  const meta = [doc.source === "pdf" ? "PDF" : doc.source === "image" ? (lang() === "es" ? "Imagen" : "Image") : (lang() === "es" ? "Texto" : "Text")];
  if (doc.pages) meta.push(doc.pages === 1 ? (lang() === "es" ? "1 página" : "1 page") : T("pages", { n: doc.pages }));
  if (doc.chars) meta.push(T("chars", { n: formatCount(doc.chars) }));
  const cross = input.cross.filter((row) => row.docId === doc.id);
  const findings = [
    ...(check?.findings || []).map((row, index) => ({ ...row, index, origin: "ai" })),
    ...cross.map((row) => ({ ...row, origin: "device" }))
  ];
  const findingList = findings.length ? `<ul class="findings">${findings.map((row) => `<li class="finding ${esc(row.severity || "medium")}${row.resolved ? " resolved" : ""}">
      <div class="finding-top"><span class="sev-dot" aria-hidden="true"></span><p>${esc(row.message)}</p></div>
      ${row.fix ? `<p class="finding-fix"><strong>${esc(T("fix"))}:</strong> ${esc(row.fix)}</p>` : ""}
      <div class="finding-actions">${row.origin === "device" ? `<span class="tiny">${esc(T("foundOnDevice"))}</span>` : ""}
      ${row.resolved ? `<span class="pill green">${icon("check", 12)} ${esc(T("fixed"))}</span>` : `<button class="ghost small" data-act="finding-fixed" data-space="${esc(spaceId)}" data-doc="${esc(doc.id)}" data-origin="${row.origin}" data-index="${row.index ?? ""}" data-code="${esc(row.code)}">${esc(T("markFixed"))}</button>`}</div>
    </li>`).join("")}</ul>` : "";
  const consent = builderUi.consentFor === doc.id ? consentPanel(spaceId, item, doc) : "";
  const canCheck = doc.chars >= 20 && !busy;
  return `<div class="doc-row${check ? ` checked ${esc(check.status)}` : ""}" id="doc-${esc(doc.id)}">
    <div class="doc-top">
      <span class="doc-icon" aria-hidden="true">${icon("doc", 18)}</span>
      <div class="doc-name"><strong>${esc(doc.name)}</strong><span class="tiny">${esc(meta.join(" · "))} · ${icon("lock", 11)} ${esc(T("onDevice"))}</span></div>
      <div class="doc-pills">${pill ? `<span class="pill ${pill[0]}">${esc(T(pill[1]))}</span>` : busy ? "" : `<span class="pill plain">${esc(T("notChecked"))}</span>`}${check?.mock ? `<span class="pill demo-ai">${esc(T("demoAi"))}</span>` : ""}</div>
    </div>
    ${busy ? `<p class="doc-busy" role="status"><span class="spinner" aria-hidden="true"></span>${esc(T(busy))}</p>` : ""}
    ${error ? `<p class="danger small" role="alert">${esc(error)}</p>` : ""}
    ${check?.summary ? `<p class="doc-summary">${esc(check.summary)}</p>` : ""}
    ${findingList}
    ${consent}
    <div class="doc-actions">
      ${consent ? "" : `<button class="btn-secondary small" data-act="doc-check" data-space="${esc(spaceId)}" data-doc="${esc(doc.id)}" ${canCheck ? "" : "disabled"}>${icon("spark", 14)} ${esc(check ? T("recheck") : T("checkAi"))}</button>`}
      <button class="ghost small" data-act="doc-remove" data-space="${esc(spaceId)}" data-doc="${esc(doc.id)}">${esc(T("removeDoc"))}</button>
    </div>
  </div>`;
}

function consentPanel(spaceId, item, doc) {
  const to = aiStatus.mock ? T("consentToDemo") : T("consentToProvider", { provider: aiStatus.provider || "AI", host: aiStatus.host || "", model: aiStatus.model || "" });
  return `<section class="consent-panel" id="consent" aria-labelledby="consent-h">
    <h4 id="consent-h">${icon("lock", 16)} ${esc(T("consentTitle"))}</h4>
    <dl class="consent-facts">
      <div><dt>${esc(T("consentWhat"))}</dt><dd>${esc(T("consentWhatBody"))}</dd></div>
      <div><dt>${esc(T("consentTo"))}</dt><dd>${esc(to)}</dd></div>
      <div><dt>${esc(T("consentRedact"))}</dt><dd>${esc(T("consentRedactBody"))}</dd></div>
    </dl>
    <p class="mask-count ${builderUi.consentCounts ? "has" : ""}">${icon("check", 14)} ${esc(builderUi.consentCounts ? T("maskedCount", { n: builderUi.consentCounts }) : T("maskedNone"))}</p>
    <label class="field">${esc(T("previewLabel"))}
      <textarea id="consent-text" rows="7" spellcheck="false">${esc(builderUi.consentDraft)}</textarea>
    </label>
    <label class="check-item consent-agree"><input id="consent-agree" type="checkbox" data-act="consent-agree" ${builderUi.consentAgree ? "checked" : ""}><span>${esc(T("consentAgree"))}</span></label>
    <div class="consent-actions">
      <button class="btn small" data-act="consent-send" data-space="${esc(spaceId)}" data-doc="${esc(doc.id)}" ${builderUi.consentAgree ? "" : "disabled"}>${esc(T("consentSend"))}</button>
      <button class="ghost small" data-act="consent-cancel">${esc(T("consentKeep"))}</button>
    </div>
  </section>`;
}

function checklistItem(spaceId, item, input) {
  const mark = input.marks[item.id] || "need";
  const docs = input.docs.filter((doc) => doc.itemId === item.id);
  const worst = docs.map((doc) => doc.check?.status).find((s) => s === "mismatch") || docs.map((doc) => doc.check?.status).find((s) => s === "possible_issue") || (docs.some((doc) => doc.check?.status === "matches") ? "matches" : "");
  const present = mark === "ready" || docs.some((doc) => doc.check?.status !== "mismatch");
  const tag = item.source === "ai" ? `<span class="pill violet">${esc(T("aiSuggested"))}</span>` : item.source === "rule" ? `<span class="pill plain">${esc(T("addedForYou"))}</span>` : "";
  const paste = builderUi.pasteFor === item.id ? `<div class="paste-panel">
      <label class="field">${esc(T("pasteText"))}<textarea id="paste-text" rows="5" placeholder="${esc(T("pastePh"))}">${esc(builderUi.pasteDraft)}</textarea></label>
      <div class="consent-actions"><button class="btn small" data-act="paste-add" data-space="${esc(spaceId)}" data-item="${esc(item.id)}">${esc(T("pasteAdd"))}</button><button class="ghost small" data-act="paste-cancel">${esc(T("cancel"))}</button></div>
    </div>` : "";
  return `<article class="doc-item card ${mark === "na" ? "na" : present ? "present" : ""} ${worst ? `st-${worst}` : ""}" id="item-${esc(item.id)}">
    <div class="doc-item-head">
      <span class="item-state" aria-hidden="true">${present ? icon("check", 14) : ""}</span>
      <h3>${esc(itemLabel(item))}</h3>
      <div class="item-tags">${item.required ? `<span class="pill coral-soft">${esc(T("required"))}</span>` : `<span class="pill plain">${esc(T("optional"))}</span>`}${tag}</div>
    </div>
    ${item.reason ? `<p class="item-reason"><strong>${esc(T("why"))}:</strong> ${esc(lang() === "es" ? item.reason.es : item.reason.en)}</p>` : ""}
    <div class="mark-row" role="group" aria-label="${esc(T("status"))}">
      ${[["ready", "markReady"], ["need", "markNeed"], ["na", "markNa"]].map(([value, key]) => `<button class="chip small ${mark === value ? "on" : ""}" data-act="folder-mark" data-space="${esc(spaceId)}" data-id="${esc(item.id)}" data-mark="${value}" aria-pressed="${mark === value}">${esc(T(key))}</button>`).join("")}
    </div>
    ${docs.map((doc) => docRow(spaceId, item, doc, input)).join("")}
    ${paste}
    ${mark === "na" || paste ? "" : `<div class="add-row">
      <label class="btn-secondary small file-btn">${icon("upload", 14)} ${esc(T("addDoc"))}<input type="file" class="file-input" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" data-act="doc-file" data-space="${esc(spaceId)}" data-item="${esc(item.id)}"></label>
      <button class="ghost small" data-act="paste-open" data-item="${esc(item.id)}">${esc(T("pasteText"))}</button>
    </div>`}
  </article>`;
}

function builderFolderScreen(spaceId) {
  const folder = builderOf(spaceId);
  if (!aiStatus.loaded) ensureAiStatus();
  if (!folderChatStatus.loaded) ensureChatStatus();
  const input = readinessInput(spaceId);
  const plan = input.plan;
  const intake = builderIntake(spaceId, folder, plan);
  const required = plan.items.filter((item) => item.required);
  const optional = plan.items.filter((item) => !item.required);
  const transcript = `<section class="builder-chat card${intake.done ? " done" : ""}" aria-label="${esc(T("builderKicker"))}">
      ${intake.done ? `<details class="intake-details"${folder.builder.ai || builderUi.tailoring === spaceId || !folder.builder.skippedAi ? " open" : ""}><summary>${esc(T("builderYourAnswers"))} · ${Object.keys(folder.builder.answers).length}</summary><div class="bubbles">${intake.html}</div></details>
      <div class="intake-tools"><button class="ghost small" data-act="builder-edit" data-space="${esc(spaceId)}">${esc(T("builderEditAnswers"))}</button></div>` : `<div class="bubbles">${intake.html}</div>`}
    </section>`;
  const head = `<div class="spread">${backButton(T("allFolders"), 'data-act="builder-home"')}</div>
    <div class="page-head builder-head">
      <p class="kicker">${icon("spark", 16)} ${esc(T("builderKicker"))} · ${esc(formOfSpace(spaceId))} ${demoPill()}</p>
      <h1>${esc(spaceName(lang(), spaceId))}</h1>
      <p class="legal-line">${esc(T("notLegal"))}</p>
    </div>`;
  if (!intake.done) {
    return `${head}<div class="builder-solo">${transcript}</div>${legalDisclaimer()}`;
  }
  return `${head}
  <div class="builder-grid">
    <div class="builder-main">
      ${transcript}
      ${readinessCard(spaceId, input)}
      <section class="checklist-wrap" aria-labelledby="checklist-h">
        <h2 id="checklist-h">${esc(T("checklistTitle"))}</h2>
        <h3 class="group-h">${esc(T("groupRequired"))} <span class="count">${required.length}</span></h3>
        <div class="stack">${required.map((item) => checklistItem(spaceId, item, input)).join("")}</div>
        ${optional.length ? `<h3 class="group-h">${esc(T("groupOptional"))} <span class="count">${optional.length}</span></h3><div class="stack">${optional.map((item) => checklistItem(spaceId, item, input)).join("")}</div>` : ""}
        ${plan.removed.length ? `<details class="removed"><summary>${esc(T("groupRemoved"))} · ${plan.removed.length}</summary><ul>${plan.removed.map((row) => `<li><strong>${esc(lang() === "es" ? row.es : row.en)}</strong><span>${esc(lang() === "es" ? row.reason.es : row.reason.en)}</span></li>`).join("")}</ul></details>` : ""}
      </section>
    </div>
    ${folderChatPanel(spaceId, packetFor(spaceId), folder)}
  </div>
  ${legalDisclaimer()}`;
}

function prepareScreen(spaceId) {
  if (!aiStatus.loaded) ensureAiStatus();
  if (!spaceId || !spaceById(spaceId) || !BUILDER_FORMS.includes(spaceId)) return builderStartScreen();
  return builderFolderScreen(spaceId);
}

/* ───────────── Folder Builder: actions ───────────── */
function openBuilderFolder(spaceId, description = "", inferred = {}) {
  const folder = builderOf(spaceId);
  if (description) {
    folder.builder = { answers: { ...inferred }, inferred: { ...inferred }, description, done: false, ai: null, skippedAi: false };
  }
  builderUi.pending = null;
  builderUi.desc = "";
  state.route = { name: "prepare", spaceId };
  save();
  render();
  window.scrollTo?.(0, 0);
}

function answerBuilder(spaceId, question, value) {
  const folder = builderOf(spaceId);
  folder.builder.answers = { ...folder.builder.answers, [question]: value };
  if (!nextQuestion(spaceId, folder.builder.answers)) folder.builder.done = true;
  save();
  render();
}

async function tailorPlan(spaceId) {
  const folder = builderOf(spaceId);
  const plan = buildPlan(spaceId, folder.builder.answers);
  const masked = maskIdentifiers(folder.builder.description || "").text.slice(0, 1500);
  const payload = {
    consent: true, lang: lang(), spaceId, form: formOfSpace(spaceId),
    answers: folder.builder.answers, description: masked,
    items: plan.items.slice(0, 80).map((item) => ({ id: item.id, label: itemLabel(item).slice(0, 200), required: item.required }))
  };
  builderUi.tailoring = spaceId;
  folder.builder.aiError = "";
  render();
  try {
    const response = await fetch("/api/folder-plan", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.reason || "error");
    folder.builder.ai = { add: data.add || [], remove: data.remove || [], notes: data.notes || [], mock: Boolean(data.mock) };
  } catch {
    folder.builder.aiError = T("builderTailorFail");
  }
  builderUi.tailoring = "";
  save();
  render();
}

function newDocId() {
  return `doc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function addDocFromFile(spaceId, itemId, file) {
  const folder = builderOf(spaceId);
  const kind = kindOf(file);
  if (!kind) { toast = T("readFail"); render(); return; }
  const doc = { id: newDocId(), itemId, name: String(file.name || "document").slice(0, 120), mime: file.type, size: file.size, source: kind, pages: null, chars: 0, addedAt: new Date().toISOString(), check: null };
  folder.docs.push(doc);
  builderUi.busy[doc.id] = kind === "pdf" ? "readingPdf" : "readingImage";
  save();
  render();
  try {
    const out = await extractFromFile(file, lang());
    doc.pages = out.pages || null;
    doc.chars = out.text.length;
    await saveText(doc.id, out.text);
    keepFile(doc.id, file);
    if (out.text.length < 20) builderUi.errors[doc.id] = T("readFail");
  } catch {
    builderUi.errors[doc.id] = T("readFail");
  }
  delete builderUi.busy[doc.id];
  save();
  render();
}

async function addDocFromText(spaceId, itemId, text) {
  const folder = builderOf(spaceId);
  const clean = String(text || "").trim().slice(0, 12000);
  if (!clean) return;
  const date = new Date().toLocaleDateString(lang() === "es" ? "es" : "en", { month: "short", day: "numeric" });
  const doc = { id: newDocId(), itemId, name: `${T("pasteText")} · ${date}`, mime: "text/plain", size: clean.length, source: "text", pages: null, chars: clean.length, addedAt: new Date().toISOString(), check: null };
  folder.docs.push(doc);
  await saveText(doc.id, clean);
  builderUi.pasteFor = "";
  builderUi.pasteDraft = "";
  save();
  render();
}

async function openConsent(spaceId, docId) {
  const text = await loadText(docId);
  if (!text) { builderUi.errors[docId] = T("readFail"); render(); return; }
  const masked = maskIdentifiers(text);
  builderUi.consentFor = docId;
  builderUi.consentDraft = masked.text;
  builderUi.consentCounts = masked.total;
  builderUi.consentAgree = false;
  render();
  document.getElementById("consent")?.scrollIntoView?.({ block: "center" });
}

async function sendCheck(spaceId, docId) {
  const folder = builderOf(spaceId);
  const doc = folder.docs.find((row) => row.id === docId);
  if (!doc || !builderUi.consentAgree) return;
  const plan = planFor(spaceId);
  const item = plan.items.find((row) => row.id === doc.itemId);
  const text = maskIdentifiers(builderUi.consentDraft).text.trim();
  const otherNames = folder.docs.filter((row) => row.id !== docId && row.check?.facts?.primaryName).map((row) => row.check.facts.primaryName).slice(0, 12);
  const itemId = /^[a-z0-9-]{1,48}$/.test(doc.itemId) ? doc.itemId : "item";
  const payload = { consent: true, lang: lang(), spaceId, form: formOfSpace(spaceId), item: { id: itemId, label: (item ? itemLabel(item) : itemId).slice(0, 200) }, text, source: doc.source, pages: doc.pages ?? null, otherNames };
  builderUi.consentFor = "";
  builderUi.consentAgree = false;
  builderUi.busy[docId] = "checking";
  delete builderUi.errors[docId];
  render();
  try {
    const response = await fetch("/api/folder-check", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      builderUi.errors[docId] = data.error === "blocked" ? T("checkBlocked") : data.error === "unavailable" ? T("checkUnavailable") : T("checkFail");
    } else {
      doc.check = { status: data.status, summary: data.summary || "", findings: (data.findings || []).map((row) => ({ ...row, resolved: false })), facts: data.facts || {}, mock: Boolean(data.mock), at: new Date().toISOString() };
      if (doc.check.status !== "mismatch" && (folder.marks[doc.itemId] || "need") === "need") folder.marks[doc.itemId] = "ready";
    }
  } catch {
    builderUi.errors[docId] = T("checkFail");
  }
  delete builderUi.busy[docId];
  save();
  render();
}

function removeDoc(spaceId, docId) {
  const folder = builderOf(spaceId);
  folder.docs = folder.docs.filter((row) => row.id !== docId);
  folder.resolvedCross = folder.resolvedCross.filter((key) => !key.startsWith(`${docId}:`));
  deleteText(docId).catch(() => {});
  if (builderUi.consentFor === docId) builderUi.consentFor = "";
  save();
  render();
}

function openFolderSummary(spaceId) {
  const input = readinessInput(spaceId);
  const readiness = computeReadiness(input);
  const fixes = topFixes(input, 3).map((fix) => ({ text: fixText(fix, input.items), points: fix.points }));
  const items = input.items.map((item) => ({ ...item, label: itemLabel(item) }));
  const html = folderSummaryHtml({ lang: lang(), form: formOfSpace(spaceId), title: spaceName(lang(), spaceId), items, marks: input.marks, docs: input.docs, readiness, fixes, mock: input.docs.some((doc) => doc.check?.mock) || aiStatus.mock, date: new Date(), officialUrl: `https://www.uscis.gov/${formOfSpace(spaceId).toLowerCase()}` });
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `casecircle-${spaceId}-folder-summary.html`;
    document.body.append(link);
    link.click();
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ───────────── Check the wait ───────────── */
let waitTool = null;
function waitDefaults() {
  if (waitTool) return waitTool;
  const profile = me(state)?.profiles?.[0];
  const form = profile && WAIT_FORMS.includes(profile.form) ? profile.form : "I-485";
  const office = profile ? officeById(profile.officeId)?.code || "" : "";
  waitTool = { form, office, filed: profile?.filed || "", checked: Boolean(profile?.filed) };
  return waitTool;
}

function waitToolSection() {
  const tool = waitDefaults();
  ensureData();
  const officeOptions = offices.filter((row) => row.code).map((row) => `<option value="${esc(row.code)}" ${tool.office === row.code ? "selected" : ""}>${esc(lang() === "es" ? row.es : row.en)} (${esc(row.code)})</option>`).join("");
  const form = `<form class="wait-form card" onsubmit="return false">
    <label class="field">${esc(T("waitForm"))}<select id="wait-form-sel">${WAIT_FORMS.map((f) => `<option ${tool.form === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
    <label class="field">${esc(T("waitOffice"))}<select id="wait-office-sel"><option value="">${esc(T("waitOfficeAny"))}</option>${officeOptions}</select></label>
    <label class="field">${esc(T("waitFiled"))}<input id="wait-filed" type="date" value="${esc(tool.filed)}" max="${new Date().toISOString().slice(0, 10)}"></label>
    <button class="btn" data-act="wait-check">${esc(T("waitCheck"))}</button>
  </form>`;
  if (!tool.checked || !tool.filed) return form + howToReadCard(false);
  const official = officialFor(tool.form, tool.office);
  const pos = waitPosition({ form: tool.form, filed: tool.filed, timelines: dataCache.timelines, official: official?.data ? official : null });
  if (pos.error) return form + `<p class="danger" role="alert">${esc(T("waitFutureDate"))}</p>`;
  const officialCard = `<article class="wait-card official">
    <h3>${esc(T("waitOfficialTitle"))}</h3>
    ${official?.loading ? `<p class="muted">${esc(T("insightsLoading"))}</p>` : pos.official.available
      ? `<p class="big">${esc(T("waitOfficialLive", { m: pos.official.months }))}</p><p class="${pos.official.past ? "warn" : "ok"}">${esc(pos.official.past ? T("waitOfficialPast") : T("waitOfficialWithin"))}</p><p class="tiny">${esc(T("waitOfficialSource", { date: String(pos.official.fetchedAt || "").slice(0, 10) }))}</p>`
      : `<p>${esc(T("waitOfficialNone"))}</p>`}
    <p><a class="btn-secondary small" href="${esc(OFFICIAL.processing)}" target="_blank" rel="noreferrer">${esc(T("waitOpenOfficial"))} ↗</a></p>
  </article>`;
  const pub = pos.publicPosts;
  const bar = rangeBar(pub, pos.days);
  const publicCard = `<article class="wait-card public">
    <h3>${esc(T("waitPublicTitle"))}</h3>
    <p class="label-chip">${esc(T("publicLabel"))}</p>
    ${pub.thin ? `<p>${esc(T("waitPublicThin", { form: tool.form, n: pub.n }))}</p>` : `
      <p>${esc(T("waitPublicBody", { n: pub.n, form: tool.form, median: pub.median, p25: pub.p25, p75: pub.p75 }))}</p>
      <div class="range-bar" role="img" aria-label="${esc(`p25 ${pub.p25}, median ${pub.median}, p75 ${pub.p75}, you ${pos.days}`)}">
        <span class="iqr" style="left:${bar.p25}%;width:${Math.max(1, bar.p75 - bar.p25)}%"></span>
        <span class="med" style="left:${bar.median}%"></span>
        <span class="you" style="left:${bar.you}%"><em>${esc(T("you"))}</em></span>
      </div>
      <div class="range-axis"><span>0</span><span>${bar.max} ${esc(T("insightsDays"))}</span></div>
      ${pub.pct != null ? `<p class="strong">${esc(T("waitPublicYou", { d: pos.days, pct: pub.pct }))}</p>` : ""}
      <details class="sources"><summary>${esc(T("insightsSources"))} (${pub.n})</summary><ul>${(cellSources(tool.form)).map((row) => `<li>${extLink(row.href, row.title)} <span class="tiny">${row.days} ${esc(T("insightsDays"))}</span></li>`).join("")}</ul></details>`}
  </article>`;
  const nextCard = `<article class="wait-card next">
    <h3>${esc(T("waitNextTitle"))}</h3>
    <ol class="next-steps">${pos.next.map((step) => `<li class="${step.upcoming === false ? "past" : ""}"><strong>${esc(lang() === "es" ? step.label.es : step.label.en)}</strong><p>${esc(lang() === "es" ? step.body.es : step.body.en)}</p><span class="tiny">${step.milestone ? esc(step.typical != null ? T("waitTypical", { median: step.typical, n: step.n }) : T("waitNoTypical")) : ""}</span></li>`).join("")}</ol>
  </article>`;
  const outside = `<article class="wait-card outside">
    <h3>${esc(T("waitOutsideTitle"))}</h3>
    <p class="muted">${esc(T("waitOutsideLead"))}</p>
    <ol class="outside-steps">
      <li><strong>${esc(T("outside1"))}</strong><p>${esc(T("outside1Body"))}</p>${extLink(OFFICIAL.processing, T("linkProcessing"))}</li>
      <li><strong>${esc(T("outside2"))}</strong><p>${esc(T("outside2Body"))}</p>${extLink(OFFICIAL.eRequest, T("linkERequest"))} · ${extLink(OFFICIAL.contact, T("linkContact"))}</li>
      <li><strong>${esc(T("outside3"))}</strong><p>${esc(T("outside3Body"))}</p>${extLink(OFFICIAL.ombudsman, T("linkOmbudsman"))}</li>
      <li><strong>${esc(T("outside4"))}</strong><p>${esc(T("outside4Body"))}</p>${extLink(OFFICIAL.house, T("linkHouse"))}</li>
    </ol>
  </article>`;
  return `${form}
    <p class="elapsed" id="wait-result">${esc(T("waitElapsed", { d: formatCount(pos.days), m: pos.months }))}</p>
    <div class="wait-grid">${officialCard}${publicCard}</div>
    <div class="wait-grid">${nextCard}${outside}</div>
    ${howToReadCard(pos.official.available)}`;
}

function cellSources(form) {
  return dataCache.timelines?.forms?.[form]?.filed_to_approval?.sources || [];
}

function howToReadCard(collapsed) {
  const body = `<ol>${[1, 2, 3, 4].map((n) => `<li>${esc(T(`howToRead${n}`))}</li>`).join("")}</ol><p>${extLink(OFFICIAL.processing, T("linkProcessing"))} · ${extLink(OFFICIAL.moreInfo, T("moreInfo"))} · ${extLink(OFFICIAL.faqs, "FAQ")}</p>`;
  return collapsed
    ? `<details class="card how-read"><summary>${esc(T("howToReadTitle"))}</summary>${body}</details>`
    : `<section class="card how-read"><h3>${esc(T("howToReadTitle"))}</h3>${body}</section>`;
}

function timelinesScreen() {
  const user = me(state);
  const cases = [...(user?.profiles || [])].sort((a, b) => new Date(b.filed) - new Date(a.filed));
  return `<div class="page-head">
    <p class="kicker">${esc(T("waitKicker"))}</p>
    <h1>${esc(T("waitTitle"))}</h1>
    <p class="lede">${esc(T("waitLead"))}</p>
    <p class="legal-line">${esc(T("notLegal"))}</p>
  </div>
  ${waitToolSection()}
  <h2 class="secondary-h">${esc(T("waitCommunityTitle"))}</h2>
  ${waitCalculator()}
  ${cases.length ? `<div class="card-grid">${cases.map((profile) => `<button class="card" data-act="edit-profile" data-id="${esc(profile.spaceId)}"><strong>${esc(spaceName(lang(), profile.spaceId))}</strong><div class="kicker">${esc(badge(lang(), profile))}</div><div>${monthsSince(profile.filed)} ${esc(L("months"))} ${esc(L("sinceFiling"))}</div></button>`).join("")}</div>` : ""}
  <p class="footer-note muted">${esc(L("officialNote"))}</p>
  ${legalDisclaimer()}`;
}

/* ───────────── Insights ───────────── */
const QUESTION_TARGET = { documents: "prepare", evidence: "prepare", rfe: "prepare", fees: "prepare", timeline: "timelines", status: "timelines", interview: "interview", travel: "bot", work: "bot" };

function insightsScreen() {
  ensureData();
  const data = dataCache.insights;
  const timelines = dataCache.timelines;
  const head = `<div class="page-head">
    <p class="kicker">${esc(T("insightsKicker"))}</p>
    <h1>${esc(T("insightsTitle"))}</h1>
    <p class="lede">${esc(T("insightsLead"))}</p>
    <p class="label-chip">${esc(T("publicLabel"))}</p>
  </div>`;
  if (!data || !timelines) return `${head}<p class="muted" role="status">${esc(dataCache.failed ? T("readFail") : T("insightsLoading"))}</p>${legalDisclaimer()}`;
  const src = data.source;
  const questions = WAIT_FORMS.map((form) => {
    const row = data.questionsByForm?.[form];
    if (!row) return "";
    const top = row.topics.slice(0, 4);
    const max = Math.max(1, ...top.map((t) => t.count));
    const spaceId = form.toLowerCase();
    return `<article class="ins-form">
      <div class="spread"><h4>${esc(form)}</h4><span class="tiny">${esc(T("insightsPosts", { n: row.questions }))}</span></div>
      <ul class="bars">${top.map((topic) => `<li><span class="bar-label">${esc(lang() === "es" ? topic.es : topic.en)}</span><span class="bar"><span style="width:${Math.round((topic.count / max) * 100)}%"></span></span><span class="bar-n">${topic.count}</span>${topic.examples?.[0] ? `<a class="bar-ex tiny" href="${esc(topic.examples[0].href)}" target="_blank" rel="noreferrer">${esc(topic.examples[0].title)}</a>` : ""}</li>`).join("")}</ul>
      <button class="ghost small" data-act="ins-open" data-route="${esc(QUESTION_TARGET[top[0]?.id] || "prepare")}" data-space="${esc(spaceId)}">${esc(top[0] && QUESTION_TARGET[top[0].id] === "timelines" ? T("insightsOpenWait") : top[0] && QUESTION_TARGET[top[0].id] === "interview" ? T("insightsOpenInterview") : T("insightsOpenFolder"))} →</button>
    </article>`;
  }).join("");
  const gapRows = [];
  for (const form of WAIT_FORMS) {
    for (const [milestone, cell] of Object.entries(timelines.forms?.[form] || {})) {
      if (!cell.n) continue;
      gapRows.push({ form, milestone, cell });
    }
  }
  const gaps = `<table class="gap-table"><thead><tr><th>${esc(T("waitForm"))}</th><th>${esc(lang() === "es" ? "Intervalo" : "Interval")}</th><th>n</th><th>${esc(T("insightsMedian"))}</th><th>p25–p75</th></tr></thead><tbody>${gapRows.map(({ form, milestone, cell }) => `<tr><td>${esc(form)}</td><td>${esc(T(`ms_${milestone}`))}</td><td>${cell.n}</td>${cell.median != null ? `<td><strong>${cell.median}</strong> ${esc(T("insightsDays"))}</td><td>${cell.p25}–${cell.p75}</td>` : `<td colspan="2" class="muted">${esc(T("insightsNotEnough"))}</td>`}</tr>`).join("")}</tbody></table>`;
  const rfeMax = Math.max(1, ...data.rfe.topics.map((t) => t.count));
  const rfe = `<ul class="bars">${data.rfe.topics.slice(0, 8).map((topic) => `<li><span class="bar-label">${esc(lang() === "es" ? topic.es : topic.en)}</span><span class="bar coral"><span style="width:${Math.round((topic.count / rfeMax) * 100)}%"></span></span><span class="bar-n">${topic.count}</span>${topic.examples?.[0] ? `<a class="bar-ex tiny" href="${esc(topic.examples[0].href)}" target="_blank" rel="noreferrer">${esc(topic.examples[0].title)}</a>` : ""}</li>`).join("")}</ul>`;
  const themes = redditThemes(lang()).slice(0, 10);
  const themeMax = Math.max(1, ...themes.map((t) => t.total));
  const themeList = `<ul class="bars">${themes.map((theme) => `<li><span class="bar-label">${esc(theme.label)}</span><span class="bar violet"><span style="width:${Math.round((theme.total / themeMax) * 100)}%"></span></span><span class="bar-n">${esc(formatCount(theme.total))}</span></li>`).join("")}</ul>`;
  return `${head}
  <p class="data-note">${esc(T("insightsDataNote", { n: formatCount(src.posts), from: src.from, to: src.to }))}</p>
  <div class="insights-grid">
    <section class="card ins-card wide"><h2>${esc(T("insightsQuestions"))}</h2><p class="muted">${esc(T("insightsQuestionsBody", { n: formatCount(src.questions) }))}</p><div class="ins-forms">${questions}</div></section>
    <section class="card ins-card"><h2>${esc(T("insightsGaps"))}</h2><p class="muted">${esc(T("insightsGapsBody"))}</p>${gaps}<button class="btn-secondary small" data-act="tab" data-tab="timelines">${esc(T("insightsOpenWait"))} →</button></section>
    <section class="card ins-card"><h2>${esc(T("insightsRfe"))}</h2><p class="muted">${esc(T("insightsRfeBody", { n: data.rfe.posts }))}</p>${rfe}<button class="btn-secondary small" data-act="tab" data-tab="prepare">${esc(T("insightsOpenFolder"))} →</button></section>
    <section class="card ins-card wide"><h2>${esc(T("insightsThemes"))}</h2><p class="muted">${esc(T("insightsThemesBody", { n: formatCount(redditStats.posts), from: redditStats.from, to: redditStats.to }))}</p>${themeList}<div class="cta"><button class="btn-secondary small" data-act="tab" data-tab="bot">${esc(T("insightsOpenCommunity"))} →</button><button class="ghost small" data-act="tab" data-tab="questions">${esc(H("navAnswers"))}</button></div></section>
  </div>
  ${legalDisclaimer()}`;
}

/* ───────────── Landing: tools first ───────────── */
function toolsHero(signed) {
  const go = (route) => signed ? `data-act="tab" data-tab="${route}"` : `data-act="start-tool" data-route="${route}"`;
  const tools = [
    ["papers", "prepare", T("navBuilder"), T("toolBuilderBody")],
    ["wait", "timelines", T("navWait"), T("toolWaitBody")],
    ["interview", "interview", T("navInterview"), T("toolInterviewBody")],
    ["feed", "home", T("navCommunity"), T("toolCommunityBody")]
  ];
  return `<section class="home-hero tools-hero" id="start">
      <div class="hero-copy">
        <p class="kicker">${esc(T("heroKicker"))}</p>
        <h1>${esc(T("heroTitle"))}</h1>
        <p class="lede">${esc(T("heroLede"))}</p>
        <div class="cta">
          <button class="btn" ${go("prepare")}>${icon("spark", 18)} ${esc(T("heroStartBuilder"))}</button>
          <button class="btn-secondary" ${go("timelines")}>${esc(T("heroCheckWait"))}</button>
          ${!signed ? `<button class="ghost" data-act="demo">${esc(L("reviewerDemo"))}</button>` : ""}
        </div>
        ${!signed ? (onboard.showEmail ? `<div class="narrow hero-join">${emailBox()}</div>` : `<p class="hero-join-link"><button class="link-btn" data-act="show-email">${esc(H("again"))}</button></p>`) : ""}
        <p class="note">${icon("lock", 14)} ${esc(T("heroPrivacy"))}</p>
      </div>
      <div class="hero-demo" aria-hidden="true">
        <span class="pill plain hero-sample">${esc(L("sample"))}</span>
        <div class="bubble bot"><span class="bubble-avatar">${icon("spark", 14)}</span><div class="bubble-body"><p>${esc(T("builderHello"))}</p></div></div>
        <div class="hero-score"><div class="ready-ring medium" style="--p:72"><span>72</span><small>/100</small></div><div><strong>${esc(T("readinessTitle"))}</strong><p>${esc(T("readinessNote"))}</p></div></div>
      </div>
    </section>
    <section class="home-section tool-section" id="tools">
      <h2>${esc(T("toolsTitle"))}</h2>
      <div class="tool-grid">${tools.map(([id, route, title, body], index) => `<button class="tool-card${index === 0 ? " lead" : ""}" ${go(route)}><span class="tool-icon">${icon(id, 22)}</span><strong>${esc(title)}</strong><span>${esc(body)}</span><span class="tool-open">${esc(T("open"))} →</span></button>`).join("")}</div>
    </section>
    <section class="home-section" id="insights-home">
      <h2>${esc(T("insightsHomeTitle"))}</h2>
      <p class="lede">${esc(T("insightsHomeLead"))}</p>
      ${redditStatsBlock()}
      <button class="btn-secondary" ${go("insights")}>${esc(T("seeInsights"))} →</button>
    </section>`;
}

function rfeHelperSection() {
  return `<section class="rfe-helper">
    <h2>${esc(lang() === "es" ? "Ayuda para RFE" : "RFE Helper")}</h2>
    <p class="muted">${esc(lang() === "es" ? "Pega el texto de tu RFE para generar una lista de verificación" : "Paste your RFE text to generate a response checklist")}</p>
    <label class="field">
      ${esc(lang() === "es" ? "Texto del RFE (sin números de recibo ni identificadores)" : "RFE text (no receipt numbers or identifiers)")}
      <textarea id="rfe-text" placeholder="${esc(lang() === "es" ? "Pega aquí el texto de tu RFE..." : "Paste your RFE text here...")}">${esc(rfeText)}</textarea>
    </label>
    <button class="btn" data-act="parse-rfe">${esc(lang() === "es" ? "Generar lista" : "Generate checklist")}</button>
    
    ${rfeParsed ? `<div class="rfe-checklist">
      <h3>${esc(lang() === "es" ? "Items solicitados" : "Requested items")}</h3>
      <div class="checklist">${rfeParsed.items.map((item, i) => `<div class="check-item">
        <input type="checkbox" id="rfe-${i}" aria-label="${esc(item.text)}">
        <div class="text">
          <div class="label">${esc(item.text)}</div>
          ${item.hint ? `<div class="hint">${esc(item.hint)}</div>` : ""}
          ${item.required ? `<span class="pill coral">${esc(lang() === "es" ? "Requerido" : "Required")}</span>` : `<span class="pill plain">${esc(lang() === "es" ? "Si aplica" : "If applicable")}</span>`}
        </div>
      </div>`).join("")}</div>
      <p class="read-note">${esc(lang() === "es" ? "Responde dentro del plazo indicado en el RFE. Guarda copia de todo." : "Respond within the deadline in your RFE. Keep copies of everything.")}</p>
    </div>` : ""}
  </section>`;
}

function interviewScreen(spaceId) {
  const space = spaceById(spaceId || "i-485");
  const tips = interviewTips(lang(), spaceId || "i-485");
  const interviewPosts = redditForSpace(spaceId || "i-485").filter(p => 
    /interview|entrevista/i.test(p.title)
  ).slice(0, 10);
  
  return `<div class="interview-hub">
    ${backButton()}
    <div class="page-head">
      <h1>${esc(lang() === "es" ? "Preparación para entrevista" : "Interview Preparation")}</h1>
      <p class="muted">${esc(space ? (lang() === "es" ? space.es : space.en) : "")}</p>
    </div>
    
    <h2>${esc(lang() === "es" ? "Consejos generales" : "General tips")}</h2>
    <div class="stack">${tips.map(tip => `<div class="card"><strong>${esc(tip.title)}</strong><p>${esc(tip.body)}</p></div>`).join("")}</div>
    
    ${spaceId === "i-485" || spaceId === "i-130" ? marriageEvidenceChecklist() : ""}
    
    <h2>${esc(lang() === "es" ? "Experiencias de entrevistas" : "Interview experiences")}</h2>
    <p class="muted">${esc(lang() === "es" ? "De r/USCIS - experiencias reales de personas" : "From r/USCIS - real experiences from people")}</p>
    <div class="feed">${interviewPosts.map(p => webCard(p, true)).join("") || `<p class="muted">${esc(lang() === "es" ? "No hay experiencias de entrevistas aún" : "No interview experiences yet")}</p>`}</div>
    
    ${legalDisclaimer()}
  </div>`;
}

function marriageEvidenceChecklist() {
  const items = [
    { id: "marriage-cert", text: lang() === "es" ? "Acta de matrimonio" : "Marriage certificate", required: true },
    { id: "joint-taxes", text: lang() === "es" ? "Declaración de impuestos conjunta" : "Joint tax returns", required: false },
    { id: "joint-bank", text: lang() === "es" ? "Cuentas bancarias conjuntas" : "Joint bank accounts", required: false },
    { id: "lease-deed", text: lang() === "es" ? "Contrato de arrendamiento o escritura conjunta" : "Joint lease or deed", required: false },
    { id: "insurance", text: lang() === "es" ? "Pólizas de seguro con beneficiario" : "Insurance policies listing spouse", required: false },
    { id: "photos", text: lang() === "es" ? "Fotos juntos a través del tiempo" : "Photos together over time", required: false },
    { id: "affidavits", text: lang() === "es" ? "Declaraciones juradas de familia/amigos" : "Affidavits from family/friends", required: false },
    { id: "birth-cert-kids", text: lang() === "es" ? "Actas de nacimiento de hijos (si aplica)" : "Birth certificates of children (if applicable)", required: false },
    { id: "correspondence", text: lang() === "es" ? "Correspondencia con ambos nombres" : "Mail addressed to both", required: false }
  ];
  
  const checkedCount = items.filter((item) => evidenceMarks[item.id]).length;
  const score = Math.round((checkedCount / items.length) * 100);
  const scoreLevel = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  
  return `<section style="margin-top:32px;">
    <h2>${esc(lang() === "es" ? "Lista de pruebas de matrimonio" : "Marriage evidence checklist")}</h2>
    <p class="muted">${esc(lang() === "es" ? "Marca lo que tienes. Esto es avance de la lista, no un juicio del caso." : "Check what you have. This is checklist progress, not a judgment of the case.")}</p>
    
    <div class="score-meter" style="max-width:300px;margin:16px 0;">
      <div class="score-label">
        <span>${esc(P("checklistProgress"))}</span>
        <span class="value">${checkedCount}/${items.length}</span>
      </div>
      <div class="score-bar ${scoreLevel}"><span style="width:${score}%"></span></div>
    </div>
    
    <div class="checklist">${items.map(item => `<label class="check-item">
      <input type="checkbox" id="ev-${item.id}" data-act="evidence-check" data-id="${esc(item.id)}" ${evidenceMarks[item.id] ? "checked" : ""}>
      <div class="text">
        <div class="label">${esc(item.text)}</div>
        ${item.required ? `<span class="pill coral">${esc(lang() === "es" ? "Requerido" : "Required")}</span>` : ""}
      </div>
    </label>`).join("")}</div>
    
    <p class="read-note" style="margin-top:12px;">${esc(lang() === "es" ? "Marca solo documentos genuinos. Una lista más marcada no es un juicio de tu caso." : "Mark only genuine documents. A fuller checklist is not a judgment of your case.")}</p>
  </section>`;
}

function youScreen() {
  const user = me(state);
  if (!user) return homeScreen();
  const mine = state.posts.filter((post) => post.authorId === user.id);
  const saved = state.posts.filter((post) => (user.bookmarks || []).includes(post.id));
  return `<div class="profile-head">${avatar(user, "xl")}<div class="profile-who"><h1>${esc(user.username)}</h1><div class="kicker">${esc(levelName(lang(), user.reputation))}</div><div class="muted">${esc(L("reputation"))} ${user.reputation}</div></div></div>
    ${user.username === "app_review" ? `<div class="banner"><strong>${esc(L("reviewerNotes"))}</strong><p>${esc(L("reviewerBody"))}</p><button class="btn inline" data-act="mod">${esc(L("modQueue"))}</button></div>` : ""}
    <h2>${esc(L("caseProfiles"))}</h2>
    <div class="stack">${user.profiles.length ? user.profiles.map((profile) => `<div class="card">${esc(badge(lang(), profile))}</div>`).join("") : `<p class="muted">${esc(lang() === "es" ? "No tienes perfiles de caso todavía" : "No case profiles yet")}</p>`}<button class="btn-secondary" data-act="add-profile">${esc(L("addCase"))}</button></div>
    <h2>${esc(L("yourPosts"))}</h2>
    ${mine.length ? `<div class="stack">${mine.map(postCard).join("")}</div>` : `<div class="empty-state"><p>${esc(L("noPosts"))}</p><button class="btn-secondary" data-act="tab" data-tab="ask">${esc(H("newPost"))}</button></div>`}
    <h2>${esc(L("bookmarks"))}</h2>
    ${saved.length ? `<div class="stack">${saved.map(postCard).join("")}</div>` : `<p class="muted">${esc(L("emptySaved"))}</p>`}
    <h2>${esc(L("yourSpaces"))}</h2>
    <div class="card-grid">${user.spaces.length ? user.spaces.map((id) => `<button class="card" data-act="open-space" data-id="${esc(id)}">${esc(spaceName(lang(), id))}</button>`).join("") : `<p class="muted">${esc(lang() === "es" ? "No te has unido a ningún grupo" : "You haven't joined any case groups")}</p>`}</div>
    <h2>${esc(L("settings"))}</h2>
    <div class="chips lang-pills" role="group" aria-label="${esc(L("language"))}">
      <button class="chip dark ${lang() === "en" ? "on" : ""}" data-act="lang" data-lang="en" aria-pressed="${lang() === "en"}">${esc(L("english"))}</button>
      <button class="chip dark ${lang() === "es" ? "on" : ""}" data-act="lang" data-lang="es" aria-pressed="${lang() === "es"}">${esc(L("spanish"))}</button>
    </div>
    <div class="link-list">
      <button class="text-link" data-act="page" data-page="rules">${esc(L("rules"))}</button>
      <button class="text-link" data-act="page" data-page="privacy">${esc(L("privacy"))}</button>
      <button class="text-link" data-act="page" data-page="about">${esc(L("about"))}</button>
      <a class="text-link" href="mailto:support@casecircle.app">${esc(L("contact"))}</a>
    </div>
    <p class="muted delete-help">${esc(L("deleteHelp"))}</p>
    <button class="btn danger-btn" data-act="delete">${esc(L("deleteAccount"))}</button>`;
}

function pageScreen(page) {
  const body = page === "privacy" ? L("privacyBody") : page === "about" ? L("aboutBody") : L("rulesBody");
  const title = page === "privacy" ? L("privacy") : page === "about" ? L("about") : L("rules");
  return `${backButton()}<h1>${esc(title)}</h1><p>${esc(body)}</p><div class="banner">${esc(L("disclaimer"))}</div>`;
}

function modScreen() {
  const user = me(state);
  if (user?.role !== "mod") return `${backButton()}`;
  const posts = queuedPosts(state);
  return `${backButton()}
    <h1>${esc(L("modQueue"))}</h1>
    <div class="banner">${esc(L("reviewerBody"))}</div>
    <div class="stack">${posts.length ? posts.map((post) => {
      const open = state.reports.filter((item) => item.targetId === post.id && item.state === "open").length;
      return `<div class="card mod-card"><strong>${esc(post.title)}</strong><p>${esc(post.body)}</p><div class="meta">${esc(post.status)} · ${open} ${esc(L("openReports"))}</div>
        <div class="row"><button class="btn inline" data-act="mod-act" data-id="${esc(post.id)}" data-do="restore">${esc(L("restore"))}</button>
        <button class="btn-secondary inline" data-act="mod-act" data-id="${esc(post.id)}" data-do="remove">${esc(L("remove"))}</button>
        <button class="btn-secondary inline" data-act="mod-act" data-id="${esc(post.id)}" data-do="dismiss">${esc(L("dismissReports"))}</button></div></div>`;
    }).join("") : `<p class="muted">${esc(lang() === "es" ? "No hay publicaciones en cola" : "No posts in queue")}</p>`}</div>`;
}

function profileEditor(spaceId) {
  if (!profileDraft || profileDraft.spaceId !== spaceId) {
    const existing = me(state).profiles.find((item) => item.spaceId === spaceId);
    const filed = existing ? new Date(existing.filed) : new Date();
    profileDraft = existing ? {
      spaceId, form: existing.form, basedOn: existing.basedOn, year: filed.getUTCFullYear(), month: filed.getUTCMonth() + 1,
      officeId: existing.officeId, method: existing.method, stage: existing.stage
    } : blankProfile(spaceId);
  }
  return `${backButton()}<h1>${esc(L("profileTitle"))}</h1>${profileFields("edit")}
    <button class="btn" data-act="save-profile">${esc(L("saveProfile"))}</button>`;
}

function searchScreen() {
  const posts = filters.query ? visiblePosts(state, { query: filters.query, sort: "new" }) : [];
  return `${backButton()}
    <input id="search" type="search" placeholder="${esc(L("searchPrompt"))}" value="${esc(filters.query)}" aria-label="${esc(L("search"))}">
    <div class="stack">${posts.length ? posts.map(postCard).join("") : `<p class="muted">${esc(lang() === "es" ? "No hay resultados" : "No results")}</p>`}</div>`;
}

function readProfile(scope) {
  const draft = scope === "onboard" ? onboard.profile : profileDraft;
  return {
    spaceId: draft.spaceId,
    form: draft.form,
    basedOn: draft.basedOn,
    filed: new Date(Date.UTC(Number(draft.year), Number(draft.month) - 1, 1)).toISOString(),
    officeId: draft.officeId,
    method: draft.method,
    stage: draft.stage
  };
}

function apply(result, success) {
  if (!result.ok) {
    const key = result.error === "short" ? "tooShort" : result.error === "stage" ? "stageRequired" : result.error === "already" ? "alreadyReported" : result.error === "taken" ? "taken" : result.error === "reserved" ? "reserved" : result.error === "invalid" ? "invalidName" : result.error === "email" ? "emailInvalid" : result.error === "rate" ? "slowDown" : ["receipt", "a-number", "ssn", "passport", "abuse"].includes(result.error) ? "blockedText" : "couldNot";
    toast = L(key);
    render();
    return;
  }
  state = result.state;
  if (success) success(result);
  save();
  render();
}

function syncDraft(scope) {
  const root = scope === "onboard" ? onboard.profile : profileDraft;
  if (!root) return;
  document.querySelectorAll("[data-act=profile]").forEach((node) => {
    root[node.dataset.key] = node.value;
  });
}

document.addEventListener("click", (event) => {
  const openMenu = document.getElementById("account-menu");
  if (openMenu && !openMenu.hidden && !event.target.closest(".account")) closeAccountMenu(false);
  const node = event.target.closest("[data-act]");
  if (!node) return;
  const act = node.dataset.act;
  // In-app links keep a real href (#feed, #group=…) for open-in-new-tab and deep links, but navigate in place.
  if (node.matches('a[data-act][href^="#"]') && !event.metaKey && !event.ctrlKey && !event.shiftKey) event.preventDefault();
  else if (node.matches('a[data-act][href^="#"]')) return;
  if (act === "account-menu") {
    const menu = document.getElementById("account-menu");
    if (menu?.hidden) openAccountMenu(event.detail === 0);
    else closeAccountMenu(false);
    return;
  }
  
  if (act === "lang") {
    state.lang = node.dataset.lang;
    const user = me(state);
    if (user) user.locale = state.lang;
    save();
    render();
    return;
  }
  if (act === "show-email") {
    publicView = "home";
    onboard.step = 0;
    onboard.showEmail = true;
    render();
    document.getElementById("email")?.focus();
    return;
  }
  if (act === "public-home") {
    publicView = "home";
    onboard.step = 0;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (act === "home-section") {
    const id = node.dataset.id;
    if (state.meId) {
      state.route = { name: "explain" };
      save();
      render();
      document.getElementById(id)?.scrollIntoView({ block: "start" });
      return;
    }
    publicView = "home";
    onboard.step = 0;
    render();
    document.getElementById(id)?.scrollIntoView({ block: "start" });
    return;
  }
  if (act === "pain-point") {
    const id = node.dataset.id;
    if (id === "waiting" || id === "status") {
      startTool({ name: "timelines" }); return;
    } else if (id === "interview") {
      startTool({ name: "interview", spaceId: "i-485" }); return;
    } else if (id === "folder") {
      startTool({ name: "prepare" }); return;
    } else if (id === "scams") {
      if (state.meId) { state.route = { name: "explain" }; save(); render(); document.getElementById("find-help")?.scrollIntoView({ block: "start" }); return; }
      else { publicView = "home"; onboard.step = 0; render(); document.getElementById("find-help")?.scrollIntoView({ block: "start" }); return; }
    } else if (id === "language") {
      /* stay; language toggle is in the header */
    } else {
      if (!state.meId) { onboard.showEmail = true; onboard.step = 0; }
    }
    render();
    return;
  }
  if (act === "waitlist-open") {
    const box = document.getElementById("waitlist-box");
    if (box) box.hidden = !box.hidden;
    document.getElementById("waitlist-email")?.focus();
    return;
  }
  if (act === "waitlist-save") {
    const email = (document.getElementById("waitlist-email")?.value || "").trim().toLowerCase();
    if (!emailOk(email)) { toast = L("emailInvalid"); render(); return; }
    saveWaitlistEmail(email);
    toast = Pr("waitlistSaved");
    render();
    return;
  }
  if (act === "open-form-seo") {
    const id = node.dataset.id;
    if (state.meId) { state.route = { name: "form", id }; save(); render(); window.scrollTo(0, 0); return; }
    publicView = `form:${id}`;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (act === "open-pricing") {
    if (state.meId) { state.route = { name: "pricing" }; save(); render(); window.scrollTo(0, 0); return; }
    publicView = "pricing";
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (act === "use-email") {
    onboard.emailDraft = document.querySelector("#email")?.value || "";
    if (!emailOk(onboard.emailDraft)) { toast = L("emailInvalid"); render(); return; }
    onboard.email = onboard.emailDraft.trim().toLowerCase();
    onboard.step = 1;
    render();
    return;
  }
  if (act === "demo") { apply(enterDemo(state)); return; }
  if (act === "toggle-space") {
    const id = node.dataset.id;
    onboard.spaces = onboard.spaces.includes(id) ? onboard.spaces.filter((item) => item !== id) : [...onboard.spaces, id];
    render();
    return;
  }
  if (act === "skip-onboard") {
    const taken = new Set(state.members.map((person) => person.username.toLowerCase()));
    const name = onboard.username.trim();
    if (!name) {
      let guest = `member_${Math.random().toString(36).slice(2, 8)}`;
      while (usernameIssue(guest, taken)) guest = `member_${Math.random().toString(36).slice(2, 8)}`;
      onboard.username = guest;
    } else if (usernameIssue(name, taken)) {
      toast = usernameIssue(name, taken) === "taken" ? L("taken") : usernameIssue(name, taken) === "reserved" ? L("reserved") : L("invalidName");
      render();
      return;
    }
    onboard.spaces = onboard.spaces.length ? onboard.spaces : ["i-485"];
    finishOnboard(false);
    return;
  }
  if (act === "onboard-back") { onboard.step = Math.max(0, onboard.step - 1); render(); return; }
  if (act === "onboard-skip") { finishOnboard(false); return; }
  if (act === "onboard-next") { advanceOnboard(); return; }
  if (act === "start-tool") {
    const name = resolveRouteName(node.dataset.route) || "prepare";
    startTool(name === "interview" ? { name, spaceId: "i-485" } : { name });
    return;
  }
  if (act === "builder-home") { state.route = { name: "prepare" }; save(); render(); window.scrollTo(0, 0); return; }
  if (act === "builder-form") {
    const id = node.dataset.id;
    if (builderUi.pending) {
      const pending = builderUi.pending;
      openBuilderFolder(id, pending.text, inferFromDescription(`${id} ${pending.text}`).answers);
    } else openBuilderFolder(id);
    return;
  }
  if (act === "builder-describe") {
    const text = (document.querySelector("#builder-desc")?.value || builderUi.desc).trim();
    if (!text) { restoreFocus = "builder-desc"; render(); return; }
    const clean = maskIdentifiers(text).text.slice(0, 1500);
    const inferred = inferFromDescription(clean);
    if (inferred.form) openBuilderFolder(inferred.form, clean, inferred.answers);
    else { builderUi.pending = { text: clean }; render(); }
    return;
  }
  if (act === "builder-answer") { answerBuilder(node.dataset.space, node.dataset.q, node.dataset.v); return; }
  if (act === "builder-skip") { const folder = builderOf(node.dataset.space); folder.builder.done = true; save(); render(); return; }
  if (act === "builder-edit") {
    const folder = builderOf(node.dataset.space);
    folder.builder = { answers: {}, description: "", done: false, ai: null, skippedAi: false };
    save();
    render();
    return;
  }
  if (act === "builder-tailor") { tailorPlan(node.dataset.space); return; }
  if (act === "builder-tailor-skip") { const folder = builderOf(node.dataset.space); folder.builder.skippedAi = true; save(); render(); return; }
  if (act === "paste-open") { builderUi.pasteFor = node.dataset.item; builderUi.pasteDraft = ""; restoreFocus = "paste-text"; render(); return; }
  if (act === "paste-cancel") { builderUi.pasteFor = ""; builderUi.pasteDraft = ""; render(); return; }
  if (act === "paste-add") { addDocFromText(node.dataset.space, node.dataset.item, document.querySelector("#paste-text")?.value || builderUi.pasteDraft); return; }
  if (act === "doc-check") { openConsent(node.dataset.space, node.dataset.doc); return; }
  if (act === "consent-agree") { builderUi.consentAgree = Boolean(node.checked); restoreFocus = "consent-agree"; render(); return; }
  if (act === "consent-cancel") { builderUi.consentFor = ""; builderUi.consentAgree = false; builderUi.consentDraft = ""; render(); return; }
  if (act === "consent-send") { builderUi.consentDraft = document.querySelector("#consent-text")?.value ?? builderUi.consentDraft; sendCheck(node.dataset.space, node.dataset.doc); return; }
  if (act === "doc-remove") { removeDoc(node.dataset.space, node.dataset.doc); return; }
  if (act === "finding-fixed") {
    const folder = builderOf(node.dataset.space);
    if (node.dataset.origin === "device") folder.resolvedCross.push(`${node.dataset.doc}:${node.dataset.code}`);
    else {
      const doc = folder.docs.find((row) => row.id === node.dataset.doc);
      const finding = doc?.check?.findings?.[Number(node.dataset.index)];
      if (finding) finding.resolved = true;
    }
    save();
    render();
    return;
  }
  if (act === "folder-summary") { openFolderSummary(node.dataset.space); return; }
  if (act === "chat-findings") { chatFor(node.dataset.space).shareFindings = Boolean(node.checked); render(); return; }
  if (act === "wait-check") {
    event.preventDefault();
    waitTool = {
      form: document.querySelector("#wait-form-sel")?.value || "I-485",
      office: document.querySelector("#wait-office-sel")?.value || "",
      filed: document.querySelector("#wait-filed")?.value || "",
      checked: true
    };
    render();
    document.getElementById("wait-result")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    return;
  }
  if (act === "ins-open") {
    const name = node.dataset.route;
    const spaceId = node.dataset.space;
    if (name === "prepare") openBuilderFolder(spaceId);
    else {
      if (name === "timelines") waitTool = { ...waitDefaults(), form: spaceId.toUpperCase() };
      state.route = name === "interview" ? { name, spaceId } : { name };
      save();
      render();
      window.scrollTo(0, 0);
    }
    return;
  }
  if (act === "tab") {
    const name = resolveRouteName(node.dataset.tab) || "home";
    state.route = { name };
    if (name === "ask") ask = blankAsk();
    if (name === "prepare") {
      guideAnswer = null;
      rfeParsed = null;
    }
    save();
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (act === "show-forms") { showAllForms = !showAllForms; render(); return; }
  if (act === "open-question") {
    state.route = { name: "questions", id: node.dataset.id };
    save();
    render();
    return;
  }
  if (act === "open-folder") {
    state.route = { name: "prepare", spaceId: node.dataset.id };
    guideAnswer = null;
    guideQuestion = "";
    if (folderChatAbort) folderChatAbort.abort();
    save();
    render();
    return;
  }
  if (act === "folder-section") {
    const folder = readFolder(node.dataset.space);
    folder.focus = node.dataset.id;
    save();
    render();
    return;
  }
  if (act === "folder-mark") {
    const folder = readFolder(node.dataset.space);
    folder.marks[node.dataset.id] = node.dataset.mark;
    guideAnswer = guideReply(lang(), packetFor(node.dataset.space), folder, "");
    save();
    render();
    return;
  }
  if (act === "guide-ask") {
    const folder = readFolder(node.dataset.space);
    guideQuestion = document.querySelector("#guide-q")?.value || guideQuestion;
    guideAnswer = guideReply(lang(), packetFor(node.dataset.space), folder, guideQuestion);
    render();
    return;
  }
  if (act === "chat-consent") {
    const chat = chatFor(node.dataset.space);
    chat.consent = Boolean(node.checked);
    chat.error = "";
    restoreFocus = "chat-q";
    render();
    return;
  }
  if (act === "chat-send") {
    const chat = chatFor(node.dataset.space);
    chat.draft = document.querySelector("#chat-q")?.value || chat.draft;
    sendFolderChat(node.dataset.space, chat.draft);
    return;
  }
  if (act === "chat-retry") {
    const chat = chatFor(node.dataset.space);
    sendFolderChat(node.dataset.space, chat.retry);
    return;
  }
  if (act === "chat-cancel") {
    if (folderChatAbort) folderChatAbort.abort();
    return;
  }
  if (act === "parse-rfe") {
    rfeText = document.querySelector("#rfe-text")?.value || "";
    rfeParsed = parseRFE(lang(), rfeText);
    render();
    return;
  }
  if (act === "sort") { filters.sort = node.dataset.sort; render(); return; }
  if (act === "kind") { filters.kind = filters.kind === node.dataset.kind ? "" : node.dataset.kind; render(); return; }
  if (act === "open-bot") {
    if (me(state)) state.route = { name: "bot" };
    else publicView = "bot";
    render();
    return;
  }
  if (act === "bot-ask" || act === "bot-prompt") {
    botQuestion = act === "bot-prompt" ? (node.dataset.q || "") : (document.querySelector("#bot-q")?.value || "");
    botAnswer = askPosts(lang(), botQuestion);
    if (me(state)) state.route = { name: "bot" };
    else publicView = "bot";
    render();
    document.querySelector(".bot-answer")?.scrollIntoView({ block: "start" });
    return;
  }
  if (act === "more-web") {
    const list = node.dataset.list;
    if (webShown[list]) webShown[list] += list === "home" ? 20 : 30;
    render();
    return;
  }
  if (act === "ask-web") {
    ask = blankAsk();
    ask.type = "question";
    ask.title = node.dataset.title || "";
    ask.spaceIds = [node.dataset.space || "i-485"];
    ask.step = 2;
    state.route = { name: "ask" };
    save();
    render();
    return;
  }
  if (act === "open-post") { state.route = { name: "post", id: node.dataset.id }; save(); render(); return; }
  if (act === "open-space") { state.route = { name: "space", id: node.dataset.id }; save(); render(); return; }
  if (act === "open-interview") { state.route = { name: "interview", spaceId: node.dataset.id }; save(); render(); return; }
  if (act === "back") { state.route = { name: "home" }; save(); render(); return; }
  if (act === "vote") { apply(toggleVote(state, node.dataset.id)); return; }
  if (act === "bookmark") { apply(toggleBookmark(state, node.dataset.id), () => { toast = L("saved"); }); return; }
  if (act === "helpful") { apply(markHelpful(state, node.dataset.post, node.dataset.id)); return; }
  if (act === "report-open") { reportTarget = reportTarget === node.dataset.id ? null : node.dataset.id; render(); return; }
  if (act === "report") {
    apply(report(state, node.dataset.id, node.dataset.reason), () => { toast = L("reportThanks"); reportTarget = null; });
    return;
  }
  if (act === "block") { apply(blockMember(state, node.dataset.id), () => { toast = L("blockedToast"); state.route = { name: "home" }; }); return; }
  if (act === "share") {
    const url = `${location.origin}${location.pathname}#post=${node.dataset.id}`;
    navigator.clipboard?.writeText(url);
    toast = L("share");
    render();
    return;
  }
  if (act === "reply") {
    const body = document.querySelector("#reply")?.value || "";
    apply(addComment(state, node.dataset.id, body), (result) => { toast = result.held ? L("heldToast") : L("posted"); });
    return;
  }
  if (act === "join") {
    const user = me(state);
    const id = node.dataset.id;
    if (user.spaces.includes(id)) user.spaces = user.spaces.filter((item) => item !== id);
    else user.spaces.push(id);
    save();
    render();
    return;
  }
  if (act === "ask-space" && state.route?.name === "space") {
    ask = blankAsk();
    ask.spaceIds = [node.dataset.id];
    ask.step = 0;
    state.route = { name: "ask" };
    render();
    return;
  }
  if (act === "ask-topic") {
    const topic = questionGroups(lang()).flatMap((group) => group.items).find((item) => item.id === node.dataset.id);
    ask = blankAsk();
    ask.type = "question";
    ask.title = topic?.q || "";
    ask.spaceIds = [topicSpace(node.dataset.id)];
    ask.step = 2;
    state.route = { name: "ask" };
    save();
    render();
    return;
  }
  if (act === "ask-type") { ask.type = node.dataset.type; ask.step = 1; render(); return; }
  if (act === "ask-space") {
    const id = node.dataset.id;
    if (ask.spaceIds.includes(id)) ask.spaceIds = ask.spaceIds.filter((item) => item !== id);
    else if (ask.spaceIds.length < 3) ask.spaceIds.push(id);
    render();
    return;
  }
  if (act === "ask-next") { ask.step = 2; render(); return; }
  if (act === "ask-back") { ask.step = Math.max(0, ask.step - 1); render(); return; }
  if (act === "publish") { publishAsk(); return; }
  if (act === "add-profile") {
    const first = me(state)?.spaces[0] || "i-485";
    profileDraft = blankProfile(first);
    state.route = { name: "profile-edit", spaceId: first };
    render();
    return;
  }
  if (act === "edit-profile") {
    state.route = { name: "profile-edit", spaceId: node.dataset.id };
    profileDraft = null;
    render();
    return;
  }
  if (act === "save-profile") {
    syncDraft("edit");
    if (!profileDraft.stage) { toast = L("chooseStage"); render(); return; }
    apply(saveProfile(state, readProfile("edit")), () => { toast = L("saved"); state.route = { name: "timelines" }; });
    return;
  }
  if (act === "page") {
    if (!state.meId) {
      publicView = node.dataset.page;
      onboard.step = 0;
      render();
      window.scrollTo(0, 0);
      return;
    }
    state.route = { name: "page", page: node.dataset.page };
    save();
    render();
    return;
  }
  if (act === "mod") { state.route = { name: "mod" }; render(); return; }
  if (act === "mod-act") { apply(moderate(state, node.dataset.id, node.dataset.do)); return; }
  if (act === "delete") {
    if (confirm(L("deleteHelp"))) {
      for (const folder of Object.values(state.folders?.[state.meId] || {})) for (const doc of folder?.docs || []) deleteText(doc.id).catch(() => {});
      apply(deleteAccount(state));
    }
  }
});

document.addEventListener("change", (event) => {
  const node = event.target.closest("[data-act]");
  if (!node) return;
  if (node.dataset.act === "doc-file") {
    const file = node.files?.[0];
    if (file) addDocFromFile(node.dataset.space, node.dataset.item, file);
    return;
  }
  if (node.dataset.act === "profile") {
    const draft = state.meId && state.route?.name === "profile-edit" ? profileDraft : onboard.profile;
    draft[node.dataset.key] = node.type === "checkbox" ? node.checked : node.value;
    if (node.dataset.key === "month" || node.dataset.key === "year") draft[node.dataset.key] = Number(node.value);
    return;
  }
  if (node.dataset.act === "profile-space") {
    const draft = state.meId && state.route?.name === "profile-edit" ? profileDraft : onboard.profile;
    draft.spaceId = node.value;
    draft.form = spaceById(node.value)?.forms[0] || "";
    render();
    return;
  }
  if (node.dataset.act === "wait-calc-profile") {
    const user = me(state);
    waitCalcProfile = user?.profiles?.find(p => p.spaceId === node.value) || null;
    render();
    return;
  }
  if (node.dataset.act === "filter-stage") { filters.stage = node.value; render(); }
  if (node.dataset.act === "filter-office") { filters.officeId = node.value; render(); }
  if (node.dataset.act === "evidence-check") {
    evidenceMarks[node.dataset.id] = node.checked;
    render();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "username") onboard.username = event.target.value;
  if (event.target.id === "email") onboard.emailDraft = event.target.value;
  if (event.target.id === "rules") { onboard.rules = event.target.checked; restoreFocus = "rules"; render(); }
  if (event.target.id === "advice") { onboard.advice = event.target.checked; restoreFocus = "advice"; render(); }
  if (event.target.id === "ask-title") ask.title = event.target.value;
  if (event.target.id === "ask-body") ask.body = event.target.value;
  if (event.target.id === "ask-stage") ask.stage = event.target.value;
  if (event.target.id === "guide-q") guideQuestion = event.target.value;
  if (event.target.id === "chat-q") {
    const spaceId = state.route?.spaceId;
    if (spaceId) chatFor(spaceId).draft = event.target.value;
  }
  if (event.target.id === "rfe-text") rfeText = event.target.value;
  if (event.target.id === "builder-desc") builderUi.desc = event.target.value;
  if (event.target.id === "paste-text") builderUi.pasteDraft = event.target.value;
  if (event.target.id === "consent-text") builderUi.consentDraft = event.target.value;
  if (event.target.id === "search") { filters.query = event.target.value; restoreFocus = "search"; render(); }
  if (event.target.id === "space-search") { spaceQuery = event.target.value; restoreFocus = "space-search"; render(); }
});

function advanceOnboard() {
  if (onboard.step === 1) {
    const issue = usernameIssue(onboard.username, new Set(state.members.map((person) => person.username.toLowerCase())));
    if (issue) { toast = issue === "taken" ? L("taken") : issue === "reserved" ? L("reserved") : L("invalidName"); render(); return; }
  }
  if (onboard.step === 2) {
    if (!onboard.spaces.length) { toast = L("spacesHint"); render(); return; }
    onboard.profile = blankProfile(onboard.spaces[0]);
  }
  if (onboard.step === 3 && (!onboard.rules || !onboard.advice)) { toast = L("acceptBoth"); render(); return; }
  if (onboard.step === 4) {
    syncDraft("onboard");
    if (!onboard.profile.stage) { toast = L("chooseStage"); render(); return; }
    finishOnboard(true);
    return;
  }
  onboard.step += 1;
  render();
}

function finishOnboard(includeProfile) {
  if (includeProfile) syncDraft("onboard");
  const result = createAccount(state, {
    username: onboard.username,
    email: onboard.email,
    locale: lang(),
    spaceIds: onboard.spaces.length ? onboard.spaces : ["i-485"],
    profile: includeProfile ? readProfile("onboard") : null
  });
  apply(result, () => { onboard = blankOnboard(); toast = L("saved"); state.route = { name: "prepare" }; });
}

function publishAsk() {
  ask.title = document.querySelector("#ask-title")?.value ?? ask.title;
  ask.body = document.querySelector("#ask-body")?.value ?? ask.body;
  ask.stage = document.querySelector("#ask-stage")?.value ?? ask.stage;
  const similar = ask.type === "question" ? similarThreads(state, ask.title, ask.body, ask.spaceIds[0]) : [];
  if (similar.length && !ask.warned) { ask.warned = true; render(); return; }
  apply(publish(state, ask), (result) => {
    toast = result.held ? L("heldToast") : L("posted");
    ask = blankAsk();
    state.route = { name: "post", id: result.postId };
  });
}

try {
  boot();
  save();
} catch (error) {
  const root = document.querySelector("#app");
  if (root) root.textContent = error && (error.stack || error.message) || String(error);
}
