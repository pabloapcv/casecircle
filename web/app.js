import {
  addComment, badge, basedLabel, basedOn, benchmarkCells, blockMember, categories, createAccount,
  deleteAccount, emailOk, enterDemo, evaluate, initialState, kindHelp, kindLabel, kinds, levelName,
  markHelpful, me, member, moderate, monthLabel, monthsSince, officeById, officeName, offices,
  publish, queuedPosts, report, saveProfile, similarThreads, spaceById, spaceName, spaces,
  stageLabel, stages, t, toggleBookmark, toggleVote, visiblePosts, ago, usernameIssue
} from "./logic.js";
import { blankFolder, guideReply, packetFor, prepareText, tally } from "./prepare.js";
import { homeSteps, homeText, questionGroups, questionText, quietSteps, statusLines, waitNote } from "./questions.js";
import { formatCount, formatRedditDate, redditCatalog, redditFeed, redditForSpace, redditMonths, redditStats, redditThemes, themeForSpace } from "./reddit.js";
import { askPosts, botPrompts } from "./bot.js";

const KEY = "casecircle.web.v2";
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
      const clean = withoutSamples(parsed);
      localStorage.setItem(KEY, JSON.stringify(clean));
      return clean;
    }
  } catch { /* start fresh */ }
  const lang = (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  return initialState(lang);
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function blankOnboard() {
  return { step: 0, email: "", emailDraft: "", showEmail: false, username: "", spaces: [], rules: false, advice: false, profile: blankProfile("i-751") };
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
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function boot() {
  if (new URLSearchParams(location.search).get("demo") === "1" && !state.meId) {
    state = enterDemo(state).state;
    save();
  }
  const hash = location.hash.replace("#", "");
  if (hash.startsWith("post=") && state.meId) state.route = { name: "post", id: hash.slice(5) };
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
  if (restoreFocus) {
    const field = document.getElementById(restoreFocus);
    if (field) {
      field.focus();
      const end = field.value?.length ?? 0;
      field.setSelectionRange?.(end, end);
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
  return `<div class="site">${topbar()}<main class="page">${screen()}</main>${siteFoot()}</div>`;
}

function topbar() {
  const item = (name, label) => `<button data-act="tab" data-tab="${name}" class="${navOn(name)}">${esc(label)}</button>`;
  return `<header class="topbar">
    <button class="brand" data-act="tab" data-tab="home"><div class="mark"></div><div><strong>${esc(L("appName"))}</strong><div class="muted">${esc(L("notAffiliated"))}</div></div></button>
    <nav class="nav">
      ${item("home", H("feed"))}
      ${item("spaces", H("communities"))}
      ${item("bot", Q("botNav"))}
    </nav>
    <div class="top-actions">
      <button class="btn inline share-btn" data-act="tab" data-tab="ask">${esc(H("shareThought"))}</button>
      <button class="ghost" data-act="tab" data-tab="you">${esc(me(state)?.username || L("you"))}</button>
    </div>
  </header>`;
}

function navOn(name) {
  const route = state.route?.name || "home";
  if (name === "home" && (route === "home" || route === "post" || route === "search")) return "on";
  if (name === "spaces" && route === "space") return "on";
  if (name === "prepare" && route === "prepare") return "on";
  if (name === "questions" && route === "questions") return "on";
  if (name === "bot" && route === "bot") return "on";
  return route === name ? "on" : "";
}

function siteFoot() {
  const signed = Boolean(me(state));
  const jump = (id, label) => `<button class="foot-link" data-act="home-section" data-id="${id}">${esc(label)}</button>`;
  return `<footer class="site-foot">
    <div class="foot-brand">
      <strong>${esc(L("appName"))}</strong>
      <p>${esc(H("footBlurb"))}</p>
    </div>
    <nav>
      <h2>${esc(H("footSite"))}</h2>
      ${jump("what", H("homeNavWhat"))}
      ${jump("how", H("homeNavHow"))}
      ${signed ? `<button class="foot-link" data-act="tab" data-tab="home">${esc(H("feed"))}</button>` : `<button class="foot-link" data-act="show-email">${esc(H("again"))}</button>`}
    </nav>
    <nav>
      <h2>${esc(H("footRead"))}</h2>
      <button class="foot-link" data-act="page" data-page="about">${esc(L("about"))}</button>
      <button class="foot-link" data-act="page" data-page="privacy">${esc(L("privacy"))}</button>
      <button class="foot-link" data-act="page" data-page="rules">${esc(L("rules"))}</button>
      <a href="mailto:support@casecircle.app">${esc(L("contact"))}</a>
    </nav>
    <nav>
      <h2>${esc(H("footOfficial"))}</h2>
      <a href="https://egov.uscis.gov/processing-times/" target="_blank" rel="noreferrer">${esc(H("footTimes"))}</a>
      <a href="https://egov.uscis.gov/e-request/Intro.do" target="_blank" rel="noreferrer">${esc(H("footInquiry"))}</a>
      <a href="https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/find-legal-services" target="_blank" rel="noreferrer">${esc(P("legalHelp"))}</a>
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
  if (route.name === "bot") return botScreen();
  if (route.name === "you") return youScreen();
  return homeScreen();
}

function welcome() {
  const step = onboard.step;
  const home = step === 0 && publicView === "home";
  const jump = (id, label) => `<button data-act="home-section" data-id="${id}">${esc(label)}</button>`;
  return `<div class="site">
    <header class="topbar">
      <button class="brand" data-act="public-home"><div class="mark"></div><div><strong>${esc(L("appName"))}</strong><div class="muted">${esc(L("notAffiliated"))}</div></div></button>
      ${home ? `<nav class="nav">${jump("what", H("homeNavWhat"))}${jump("how", H("homeNavHow"))}</nav>` : `<div class="nav"></div>`}
      <div class="top-actions lang">
        <button class="btn inline ${lang() === "en" ? "on" : "off"}" data-act="lang" data-lang="en">${esc(L("english"))}</button>
        <button class="btn inline ${lang() === "es" ? "on" : "off"}" data-act="lang" data-lang="es">${esc(L("spanish"))}</button>
      </div>
    </header>
    <main class="page">${step === 0 ? (publicView === "home" ? landing() : publicView === "bot" ? botScreen() : publicPage(publicView)) : `<div class="narrow stack"><p class="step">${step + 1}/5</p>${step === 1 ? usernameStep() : ""}${step === 2 ? spacesStep() : ""}${step === 3 ? rulesStep() : ""}${step === 4 ? profileStep() : ""}${onboardFooter()}</div>`}</main>
    ${siteFoot()}
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
      ${themes.map((item) => `<div class="data-row"><span>${esc(item.label)}</span><span>${esc(formatCount(item.total))}</span><span>${esc(formatCount(item.uscis))}</span><span>${esc(formatCount(item.forum))}</span></div>`).join("")}
    </div>
    <h3>${esc(Q("dataWords"))}</h3>
    <div class="word-list">${redditStats.words.map(([word, count]) => `<span>${esc(word)} <strong>${esc(formatCount(count))}</strong></span>`).join("")}</div>`;
}

function botScreen() {
  const signed = Boolean(me(state));
  const answer = botAnswer;
  return `<div class="bot">
    ${signed ? "" : `<button class="ghost" data-act="public-home">${esc(L("back"))}</button>`}
    <h1>${esc(Q("botTitle"))}</h1>
    <p class="lede">${esc(Q("botLead"))}</p>
    <label class="field">${esc(Q("botAsk"))}<textarea id="bot-q">${esc(botQuestion)}</textarea></label>
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
      <a class="ghost" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">${esc(Q("openPost"))}</a>
      ${signed ? `<button class="ghost" data-act="ask-web" data-space="${esc(item.space || "i-485")}" data-title="${esc(item.title)}">${esc(Q("askThis"))}</button>` : ""}
    </div>
  </article>`;
}

function landing({ signed = false } = {}) {
  const steps = homeSteps(lang());
  return `<section class="home-hero" id="start">
      <div>
        <p class="kicker">${esc(L("notAffiliated"))}</p>
        <h1>${esc(H("homeTitle"))}</h1>
        <p class="lede">${esc(H("homeLede"))}</p>
        <div class="cta">
          ${signed ? `<button class="btn" data-act="tab" data-tab="home">${esc(H("feed"))}</button>` : onboard.showEmail ? `<div class="narrow">${emailBox()}</div>` : `<button class="btn" data-act="show-email">${esc(H("again"))}</button>`}
        </div>
        ${signed ? "" : `<button class="ghost" data-act="demo">${esc(L("reviewerDemo"))}</button>`}
        <p class="note">${esc(H("homeTrust"))}</p>
      </div>
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
    <section class="home-section" id="what">
      <h2>${esc(H("whatTitle"))}</h2>
      <div class="features">
        <article><h2>${esc(H("whatFolderTitle"))}</h2><p>${esc(H("whatFolderBody"))}</p></article>
        <article><h2>${esc(H("whatAnswersTitle"))}</h2><p>${esc(H("whatAnswersBody"))}</p></article>
        <article><h2>${esc(H("whatClockTitle"))}</h2><p>${esc(H("whatClockBody"))}</p></article>
      </div>
    </section>
    <section class="home-section" id="how">
      <h2>${esc(H("howTitle"))}</h2>
      <div class="how-grid">${steps.map((item, index) => `<article><span>${index + 1}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join("")}</div>
    </section>`;
}

function publicPage(page) {
  const body = page === "privacy" ? L("privacyBody") : page === "about" ? L("aboutBody") : L("rulesBody");
  const title = page === "privacy" ? L("privacy") : page === "about" ? L("about") : L("rules");
  return `<button class="ghost" data-act="public-home">${esc(L("back"))}</button><article class="narrow"><h1>${esc(title)}</h1><p>${esc(body)}</p></article>`;
}

function emailBox() {
  return `<label class="field">${esc(L("continueEmail"))}
    <input id="email" type="email" value="${esc(onboard.emailDraft)}" placeholder="you@email.com">
    <span class="muted">${esc(L("emailHelp"))}</span></label>
    <button class="btn" data-act="use-email">${esc(L("useEmail"))}</button>`;
}

function usernameStep() {
  const issue = onboard.username ? usernameIssue(onboard.username, new Set(state.members.map((person) => person.username.toLowerCase()))) : null;
  return `<h1>${esc(L("usernameTitle"))}</h1><p class="muted">${esc(L("usernameHelp"))}</p>
    <input id="username" type="text" value="${esc(onboard.username)}" autocapitalize="off">
    ${issue ? `<p class="danger">${esc(issue === "taken" ? L("taken") : issue === "reserved" ? L("reserved") : L("invalidName"))}</p>` : ""}`;
}

function spacesStep() {
  const list = showAllForms ? spaces : spaces.filter((item) => item.launch);
  const cards = list.map((item) => {
    const on = onboard.spaces.includes(item.id);
    return `<button class="card ${on ? "on" : ""}" data-act="toggle-space" data-id="${esc(item.id)}">
      <div class="spread"><strong>${esc(item.forms[0])}</strong><span>${on ? "✓" : ""}</span></div>
      <div>${esc(lang() === "es" ? item.es : item.en)}</div>
    </button>`;
  }).join("");
  return `<h1>${esc(L("spacesTitle"))}</h1><p class="muted">${esc(H("joinSpaces"))}</p>
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
  return `<h1>${esc(L("profileTitle"))}</h1><p class="muted">${esc(L("profileHelp"))}</p>${profileFields("onboard")}`;
}

function profileFields(scope) {
  const draft = scope === "onboard" ? onboard.profile : profileDraft;
  const space = spaceById(draft.spaceId);
  const years = [];
  const year = new Date().getFullYear();
  for (let value = year; value >= year - 12; value -= 1) years.push(value);
  return `<div class="stack">
    <div><div class="kicker">${esc(space?.forms[0] || "")}</div><strong>${esc(space ? (lang() === "es" ? space.es : space.en) : "")}</strong></div>
    <label class="field">${esc(L("form"))}<select data-act="profile" data-key="form">${(space?.forms || []).map((form) => `<option ${form === draft.form ? "selected" : ""}>${esc(form)}</option>`).join("")}</select></label>
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

function homeScreen() {
  const user = me(state);
  const posts = visiblePosts(state, filters);
  const initial = (user?.username || "?").slice(0, 1).toUpperCase();
  const sorts = [["new", L("new")], ["top", L("top")], ["unanswered", L("unanswered")]];
  return `<div class="community">
    <div class="stack">
      <button class="composer-bar" data-act="tab" data-tab="ask"><span class="avatar">${esc(initial)}</span><span>${esc(H("shareThought"))}</span></button>
      <div class="seg">${sorts.map(([sort, label]) => `<button data-act="sort" data-sort="${sort}" class="${filters.sort === sort ? "on" : ""}">${esc(label)}</button>`).join("")}</div>
      <div class="chips">${chip(L("allPosts"), filters.kind === "", "")}${kinds.map((kind) => chip(kindLabel(lang(), kind), filters.kind === kind, kind)).join("")}</div>
      <div class="feed">${posts.map(postCard).join("")}</div>
      <h2>${esc(Q("dataTitles"))}</h2>
      <div class="feed">${redditFeed(user?.spaces || []).slice(0, webShown.feed).map((item) => webCard(item, true)).join("")}</div>
      ${redditFeed(user?.spaces || []).length > webShown.feed ? `<button class="ghost" data-act="more-web" data-list="feed">${esc(Q("dataMore"))}</button>` : ""}
    </div>
    <aside class="rail stack">
      <div class="side-card">
        <h2>${esc(H("communities"))}</h2>
        ${(user?.spaces || []).map((id) => `<button class="community-link" data-act="open-space" data-id="${esc(id)}">${esc(spaceName(lang(), id))}</button>`).join("")}
        <button class="ghost" data-act="tab" data-tab="spaces">${esc(H("allCommunities"))}</button>
      </div>
      <div class="side-card">
        <h2>${esc(H("addons"))}</h2>
        <button class="addon" data-act="tab" data-tab="prepare"><strong>${esc(Q("pathFolder"))}</strong><span>${esc(Q("pathFolderBody"))}</span></button>
        <button class="addon" data-act="tab" data-tab="timelines"><strong>${esc(Q("pathWait"))}</strong><span>${esc(Q("pathWaitBody"))}</span></button>
        <button class="addon" data-act="tab" data-tab="questions"><strong>${esc(Q("askAbout"))}</strong><span>${esc(Q("askAboutBody"))}</span></button>
        <button class="addon" data-act="tab" data-tab="bot"><strong>${esc(Q("botTitle"))}</strong><span>${esc(Q("botLead"))}</span></button>
      </div>
      <p class="muted">${esc(L("disclaimer"))}</p>
    </aside>
  </div>`;
}

function chip(label, on, kind) {
  return `<button class="chip ${on ? "on" : ""}" data-act="kind" data-kind="${esc(kind)}">${esc(label)}</button>`;
}

function postCard(post, options = {}) {
  const author = member(state, post.authorId);
  const replies = post.comments.filter((comment) => comment.status === "live").length;
  const space = post.spaceIds?.[0];
  const body = post.body.length > 180 ? `${post.body.slice(0, 177)}…` : post.body;
  return `<article class="thread">
    <div class="vote-col"><button data-act="vote" data-id="${esc(post.id)}" aria-label="↑">↑</button><span>${post.votes}</span></div>
    <button class="thread-main" data-act="open-post" data-id="${esc(post.id)}">
      <div class="thread-meta">
        ${options.hideSpace || !space ? "" : `<span>${esc(spaceName(lang(), space))}</span>`}
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
  if (!post) return `<button class="ghost" data-act="back">${esc(L("back"))}</button>`;
  const author = member(state, post.authorId);
  const user = me(state);
  const voted = Boolean(user?.votes[post.id]);
  const saved = user?.bookmarks.includes(post.id);
  const space = post.spaceIds?.[0];
  const comments = post.comments.filter((comment) => comment.status === "live" || user?.role === "mod");
  const context = [kindLabel(lang(), post.type), space ? spaceName(lang(), space) : "", ago(lang(), post.createdAt)].filter(Boolean);
  return `<article class="read">
    <button class="ghost" data-act="back">${esc(L("back"))}</button>
    ${post.status !== "live" ? `<p class="read-note">${esc(post.status === "held" ? L("held") : L("removed"))}</p>` : ""}
    <p class="read-kicker">${context.map((item) => esc(item)).join(" · ")}</p>
    <h1>${esc(post.title)}</h1>
    <p class="read-by">${esc(author?.username || L("deletedMember"))}${author?.role === "verified_pro" ? ` · ${esc(levelName(lang(), author.reputation))}` : ""}</p>
    <div class="read-body"><p>${esc(post.body)}</p></div>
    ${postFacts(post)}
    <div class="read-actions">
      <button class="vote" data-act="vote" data-id="${esc(post.id)}">↑ ${post.votes}${voted ? " ✓" : ""}</button>
      <button data-act="bookmark" data-id="${esc(post.id)}">${saved ? esc(L("saved")) : esc(L("save"))}</button>
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
        <textarea id="reply" placeholder="${esc(L("commentPlaceholder"))}"></textarea>
        <button class="btn inline" data-act="reply" data-id="${esc(post.id)}">${esc(L("send"))}</button>
      </div>
    </section>
  </article>`;
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
  return `<div class="page-head"><h1>${esc(L("spaces"))}</h1><p class="muted">${esc(L("spacesHint"))}</p></div>
    <input id="space-search" type="search" placeholder="${esc(L("search"))}" value="${esc(spaceQuery)}">
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
  return state.members.filter((person) => person.spaces.includes(spaceId) && !String(person.username).startsWith("path_")).length;
}

function spaceScreen(id) {
  const item = spaceById(id);
  if (!item) return "";
  const user = me(state);
  const joined = user?.spaces.includes(id);
  const posts = visiblePosts(state, { ...filters, spaceId: id, sort: "new" });
  const web = redditForSpace(id);
  const theme = themeForSpace(id);
  return `<div class="space-page">
    <button class="ghost" data-act="back">${esc(L("back"))}</button>
    <header class="space-head">
      <h1>${esc(lang() === "es" ? item.es : item.en)}</h1>
      <p>${esc(lang() === "es" ? item.blurbEs : item.blurbEn)}</p>
      <p class="meta">${esc(item.forms.join(" · "))} · ${countMembers(id)} ${esc(L("members"))}</p>
      ${theme ? `<p class="meta">${esc(formatCount(theme[2]))} ${esc(Q("dataMention"))}</p>` : ""}
      <div class="row">
        <button class="btn" data-act="ask-space" data-id="${esc(id)}">${esc(L("askHere"))}</button>
        <button class="btn-secondary" data-act="join" data-id="${esc(id)}">${esc(joined ? L("leave") : L("join"))}</button>
      </div>
    </header>
    <p class="space-note">${esc(L("disclaimer"))}</p>
    <div class="feed">${posts.map((post) => postCard(post, { hideSpace: true })).join("")}</div>
    <h2>${esc(Q("dataOnForm"))}</h2>
    <div class="feed">${web.slice(0, webShown.space).map((entry) => webCard(entry, true)).join("") || `<p class="muted">${esc(L("noPosts"))}</p>`}</div>
    ${web.length > webShown.space ? `<button class="ghost" data-act="more-web" data-list="space">${esc(Q("dataMore"))}</button>` : ""}
  </div>`;
}

function askScreen() {
  if (ask.step === 0) {
    return `<div class="narrow"><h1>${esc(L("whatPosting"))}</h1><div class="post-types">${kinds.map((kind) => `<button class="post-type" data-act="ask-type" data-type="${kind}"><strong>${esc(kindLabel(lang(), kind))}</strong><span>${esc(kindHelp(lang(), kind))}</span></button>`).join("")}</div></div>`;
  }
  if (ask.step === 1) {
    const choices = spaces.filter((item) => me(state).spaces.includes(item.id) || item.launch);
    return `<div class="narrow stack"><h1>${esc(L("spaces"))}</h1><div class="start-list">${choices.map((item) => `<button class="card mini" data-act="ask-space" data-id="${item.id}">${ask.spaceIds.includes(item.id) ? "✓ " : ""}${esc(lang() === "es" ? item.es : item.en)}</button>`).join("")}</div>
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
  return `<div class="page-head"><h1>${esc(Q("askAbout"))}</h1><p>${esc(Q("askAboutLead"))}</p></div>
    <div class="start-list">${topics.map((item) => `<button class="card mini" data-act="ask-topic" data-id="${esc(item.id)}"><strong>${esc(item.q)}</strong><span class="muted count">${esc(Q("askThis"))}</span></button>`).join("")}</div>
    <div class="page-head"><h1>${esc(Q("questions"))}</h1><p>${esc(Q("questionsLead"))}</p><p class="footer-note muted">${esc(Q("questionsSource"))}</p></div>
    <nav class="jumps">${groups.map((group) => `<a href="#group-${esc(group.id)}">${esc(group.title)}</a>`).join("")}<a href="#statuses">${esc(Q("statuses"))}</a><a href="#if-quiet">${esc(Q("ifQuiet"))}</a></nav>
    ${groups.map((group) => `<h2 id="group-${esc(group.id)}">${esc(group.title)}</h2>${group.items.map((item) => `<article class="answer" id="q-${esc(item.id)}"><h3>${esc(item.q)}</h3><p>${esc(item.a)}</p><button class="ghost" data-act="ask-topic" data-id="${esc(item.id)}">${esc(Q("askThis"))}</button></article>`).join("")}`).join("")}
    <h2 id="statuses">${esc(Q("statuses"))}</h2>
    ${statusLines(lang()).map((line) => `<p><strong>${esc(line.name)}.</strong> ${esc(line.body)}</p>`).join("")}
    <h2 id="if-quiet">${esc(Q("ifQuiet"))}</h2>
    <ol>${quietSteps(lang()).map((step) => `<li><strong>${esc(step.title)}.</strong> ${esc(step.body)} <a href="${esc(step.href)}" target="_blank" rel="noreferrer">${esc(step.link)}</a></li>`).join("")}</ol>`;
}

function timelinesScreen() {
  const user = me(state);
  const real = benchmarkCells(state, false).slice(0, 4);
  const cases = [...user.profiles].sort((a, b) => new Date(b.filed) - new Date(a.filed));
  const notes = [...new Set(cases.map((profile) => profile.spaceId))].map((id) => waitNote(lang(), id)).filter(Boolean);
  return `<div class="page-head"><p class="kicker">${esc(L("notAffiliated"))}</p><h1>${esc(Q("waits"))}</h1><p class="muted">${esc(Q("waitsLead"))}</p></div>
    ${notes.map((note) => `<h2>${esc(Q("yourWait"))}: ${esc(note.title)}</h2><p>${esc(note.body)}</p>`).join("")}
    <h2>${esc(Q("ifQuiet"))}</h2>
    <ol>${quietSteps(lang()).map((step) => `<li><strong>${esc(step.title)}.</strong> ${esc(step.body)} <a href="${esc(step.href)}" target="_blank" rel="noreferrer">${esc(step.link)}</a></li>`).join("")}</ol>
    <h2>${esc(L("yourCases"))}</h2>
    <div class="card-grid">${cases.map((profile) => `<button class="card" data-act="edit-profile" data-id="${esc(profile.spaceId)}"><strong>${esc(spaceName(lang(), profile.spaceId))}</strong><div class="kicker">${esc(badge(lang(), profile))}</div><div>${monthsSince(profile.filed)} ${esc(L("months"))} ${esc(L("sinceFiling"))}</div></button>`).join("") || `<p class="muted">${esc(L("profileHelp"))}</p>`}
      <button class="btn-secondary" data-act="add-profile">${esc(L("addCase"))}</button>
    </div>
    ${real.length ? `<div class="bench-grid">${real.map((cell) => benchCard(cell, false)).join("")}</div>` : `<h2>${esc(L("notEnough"))}</h2><p class="muted">${esc(L("notEnoughBody"))}</p>`}
    <p><a href="https://egov.uscis.gov/processing-times/" target="_blank" rel="noreferrer">${esc(L("official"))}</a></p>
    <p class="footer-note muted">${esc(L("officialNote"))}</p>`;
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

function prepareScreen(spaceId) {
  const user = me(state);
  const choices = [...new Set([...(user?.spaces || []), "n-400", "i-751", "i-485", "i-130", "i-765", "i-131"])];
  if (!spaceId || !spaceById(spaceId)) {
    return `<div class="page-head"><h1>${esc(P("prepare"))}</h1><p class="muted">${esc(P("folderLead"))}</p></div>
      <h2>${esc(P("pickForm"))}</h2>
      <div class="card-grid">${choices.map((id) => {
        const item = spaceById(id);
        if (!item) return "";
        const counts = tally(packetFor(id), readFolder(id));
        return `<button class="card" data-act="open-folder" data-id="${esc(id)}"><div class="kicker">${esc(item.forms[0])}</div><strong>${esc(lang() === "es" ? item.es : item.en)}</strong><div class="muted">${counts.need} ${esc(P("stillOpen"))}</div></button>`;
      }).join("")}</div>
      <div class="banner">${esc(P("noPromise"))}</div>`;
  }
  const packet = packetFor(spaceId);
  const folder = readFolder(spaceId);
  const counts = tally(packet, folder);
  const focus = packet.sections.find((section) => section.id === folder.focus) || packet.sections[0];
  const answer = guideAnswer || guideReply(lang(), packet, folder, "");
  const pct = Math.round((counts.ready / Math.max(counts.total, 1)) * 100);
  return `<div class="spread"><button class="ghost" data-act="tab" data-tab="prepare">${esc(P("backToForms"))}</button><div class="muted">${counts.ready}/${counts.total} ${esc(P("progress"))}</div></div>
    <div class="page-head"><p class="kicker">${esc(packet.form)}</p><h1>${esc(spaceName(lang(), spaceId))}</h1><p class="muted">${esc(P("folderLead"))}</p><div class="progress"><span style="width:${pct}%"></span></div></div>
    <div class="prepare-grid">
      <nav class="section-nav">${packet.sections.map((section) => `<button class="card ${section.id === focus.id ? "on" : ""}" data-act="folder-section" data-space="${esc(spaceId)}" data-id="${esc(section.id)}"><strong>${esc(lang() === "es" ? section.es : section.en)}</strong></button>`).join("")}</nav>
      <div class="stack">${focus.items.map((item) => {
        const mark = folder.marks[item.id] || "need";
        return `<article class="card"><p>${esc(lang() === "es" ? item.es : item.en)}</p><div class="mark-row">
          ${["ready", "need", "na"].map((value) => `<button class="chip ${mark === value ? "on" : ""}" data-act="folder-mark" data-space="${esc(spaceId)}" data-id="${esc(item.id)}" data-mark="${value}">${esc(P(value))}</button>`).join("")}
        </div></article>`;
      }).join("")}</div>
      <aside class="guide-card card stack">
        <div class="kicker">${esc(P("guide"))}</div>
        <strong>${esc(answer.title)}</strong>
        <p>${esc(answer.body)}</p>
        <a href="${esc(answer.href)}" target="_blank" rel="noreferrer">${esc(answer.link)}</a>
        <p class="footer-note muted">${esc(P("guideHelp"))}</p>
        <textarea id="guide-q" placeholder="${esc(P("guidePlaceholder"))}">${esc(guideQuestion)}</textarea>
        <button class="btn" data-act="guide-ask" data-space="${esc(spaceId)}">${esc(P("askGuide"))}</button>
        <p class="footer-note muted">${esc(P("noPromise"))}</p>
      </aside>
    </div>`;
}

function youScreen() {
  const user = me(state);
  const mine = state.posts.filter((post) => post.authorId === user.id);
  const saved = state.posts.filter((post) => user.bookmarks.includes(post.id));
  return `<div class="brand"><div class="mark"></div><div><h1 style="margin:0">${esc(user.username)}</h1><div class="kicker">${esc(levelName(lang(), user.reputation))}</div><div class="muted">${esc(L("reputation"))} ${user.reputation}</div></div></div>
    ${user.username === "app_review" ? `<div class="banner"><strong>${esc(L("reviewerNotes"))}</strong><p>${esc(L("reviewerBody"))}</p><button class="btn inline" data-act="mod">${esc(L("modQueue"))}</button></div>` : ""}
    <h2>${esc(L("caseProfiles"))}</h2>
    <div class="stack">${user.profiles.map((profile) => `<div class="card">${esc(badge(lang(), profile))}</div>`).join("")}<button class="btn-secondary" data-act="add-profile">${esc(L("addCase"))}</button></div>
    <h2>${esc(L("yourPosts"))}</h2>
    ${mine.length ? `<div class="stack">${mine.map(postCard).join("")}</div>` : `<p class="muted">${esc(L("noPosts"))}</p>`}
    <h2>${esc(L("bookmarks"))}</h2>
    ${saved.length ? `<div class="stack">${saved.map(postCard).join("")}</div>` : `<p class="muted">${esc(L("emptySaved"))}</p>`}
    <h2>${esc(L("yourSpaces"))}</h2>
    <div class="card-grid">${user.spaces.map((id) => `<button class="card" data-act="open-space" data-id="${esc(id)}">${esc(spaceName(lang(), id))}</button>`).join("")}</div>
    <h2>${esc(L("settings"))}</h2>
    <div class="lang">
      <button class="btn inline ${lang() === "en" ? "on" : "off"}" data-act="lang" data-lang="en">${esc(L("english"))}</button>
      <button class="btn inline ${lang() === "es" ? "on" : "off"}" data-act="lang" data-lang="es">${esc(L("spanish"))}</button>
    </div>
    <button class="ghost" data-act="page" data-page="rules">${esc(L("rules"))}</button>
    <button class="ghost" data-act="page" data-page="privacy">${esc(L("privacy"))}</button>
    <button class="ghost" data-act="page" data-page="about">${esc(L("about"))}</button>
    <a href="mailto:support@casecircle.app">${esc(L("contact"))}</a>
    <p class="muted">${esc(L("deleteHelp"))}</p>
    <button class="btn" data-act="delete">${esc(L("deleteAccount"))}</button>`;
}

function pageScreen(page) {
  const body = page === "privacy" ? L("privacyBody") : page === "about" ? L("aboutBody") : L("rulesBody");
  const title = page === "privacy" ? L("privacy") : page === "about" ? L("about") : L("rules");
  return `<button class="ghost" data-act="back">${esc(L("back"))}</button><h1>${esc(title)}</h1><p>${esc(body)}</p><div class="banner">${esc(L("disclaimer"))}</div>`;
}

function modScreen() {
  const user = me(state);
  if (user?.role !== "mod") return `<button class="ghost" data-act="back">${esc(L("back"))}</button>`;
  const posts = queuedPosts(state);
  return `<button class="ghost" data-act="back">${esc(L("back"))}</button>
    <h1>${esc(L("modQueue"))}</h1>
    <div class="banner">${esc(L("reviewerBody"))}</div>
    <div class="stack">${posts.map((post) => {
      const open = state.reports.filter((item) => item.targetId === post.id && item.state === "open").length;
      return `<div class="card"><strong>${esc(post.title)}</strong><p>${esc(post.body)}</p><div class="meta">${esc(post.status)} · ${open} ${esc(L("openReports"))}</div>
        <div class="row"><button class="btn inline" data-act="mod-act" data-id="${esc(post.id)}" data-do="restore">${esc(L("restore"))}</button>
        <button class="btn inline" data-act="mod-act" data-id="${esc(post.id)}" data-do="remove">${esc(L("remove"))}</button>
        <button class="btn inline" data-act="mod-act" data-id="${esc(post.id)}" data-do="dismiss">${esc(L("dismissReports"))}</button></div></div>`;
    }).join("")}</div>`;
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
  return `<button class="ghost" data-act="back">${esc(L("back"))}</button><h1>${esc(L("profileTitle"))}</h1>${profileFields("edit")}
    <button class="btn" data-act="save-profile">${esc(L("saveProfile"))}</button>`;
}

function searchScreen() {
  const posts = filters.query ? visiblePosts(state, { query: filters.query, sort: "new" }) : [];
  return `<button class="ghost" data-act="back">${esc(L("back"))}</button>
    <input id="search" type="search" placeholder="${esc(L("searchPrompt"))}" value="${esc(filters.query)}">
    <div class="stack">${posts.map(postCard).join("")}</div>`;
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
    const key = result.error === "short" ? "tooShort" : result.error === "stage" ? "stageRequired" : result.error === "already" ? "alreadyReported" : result.error === "taken" ? "taken" : result.error === "reserved" ? "reserved" : result.error === "invalid" ? "invalidName" : result.error === "email" ? "emailInvalid" : ["receipt", "a-number", "ssn", "passport", "abuse"].includes(result.error) ? "blockedText" : "couldNot";
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
  const node = event.target.closest("[data-act]");
  if (!node) return;
  const act = node.dataset.act;
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
  if (act === "onboard-back") { onboard.step = Math.max(0, onboard.step - 1); render(); return; }
  if (act === "onboard-skip") { finishOnboard(false); return; }
  if (act === "onboard-next") { advanceOnboard(); return; }
  if (act === "tab") {
    const name = node.dataset.tab;
    const profile = me(state)?.profiles?.[0];
    state.route = name === "prepare" && profile ? { name: "prepare", spaceId: profile.spaceId } : { name };
    if (name === "ask") ask = blankAsk();
    if (name === "prepare") guideAnswer = null;
    save();
    render();
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
    const first = me(state).spaces[0] || "i-751";
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
    if (confirm(L("deleteHelp"))) apply(deleteAccount(state));
  }
});

document.addEventListener("change", (event) => {
  const node = event.target.closest("[data-act]");
  if (!node) return;
  if (node.dataset.act === "profile") {
    const draft = state.meId && state.route?.name === "profile-edit" ? profileDraft : onboard.profile;
    draft[node.dataset.key] = node.type === "checkbox" ? node.checked : node.value;
    if (node.dataset.key === "month" || node.dataset.key === "year") draft[node.dataset.key] = Number(node.value);
    return;
  }
  if (node.dataset.act === "filter-stage") { filters.stage = node.value; render(); }
  if (node.dataset.act === "filter-office") { filters.officeId = node.value; render(); }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "username") onboard.username = event.target.value;
  if (event.target.id === "email") onboard.emailDraft = event.target.value;
  if (event.target.id === "rules") onboard.rules = event.target.checked;
  if (event.target.id === "advice") onboard.advice = event.target.checked;
  if (event.target.id === "ask-title") ask.title = event.target.value;
  if (event.target.id === "ask-body") ask.body = event.target.value;
  if (event.target.id === "ask-stage") ask.stage = event.target.value;
  if (event.target.id === "guide-q") guideQuestion = event.target.value;
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
    spaceIds: onboard.spaces,
    profile: includeProfile ? readProfile("onboard") : null
  });
  apply(result, () => { onboard = blankOnboard(); toast = L("saved"); });
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

boot();
save();
