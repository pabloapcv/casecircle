import { redditStats } from "./reddit-stats.js";

const spaceRules = [
  [/i-?751|removal of conditions/i, "i-751"],
  [/i-?765|\bead\b|work permit|employment authorization/i, "i-765"],
  [/i-?131|advance parole|reentry permit|combo card/i, "i-131"],
  [/i-?140|\beb-?[123]\b|\bniw\b/i, "i-140"],
  [/i-?130\b|cr-?1|ir-?1/i, "i-130"],
  [/i-?129f|\bk-?1\b|fianc/i, "i-129f"],
  [/n-?400|naturalization|oath ceremony/i, "n-400"],
  [/n-?600/i, "n-600"],
  [/i-?90\b/i, "i-90"],
  [/i-?589|asylum/i, "i-589"],
  [/i-?539/i, "i-539"],
  [/i-?485|adjustment of status|\baos\b/i, "i-485"],
  [/ds-?260|\bnvc\b|consular/i, "consular"],
  [/premium processing|i-?907/i, "fees-and-tools"],
  [/h-?1b|l-?1\b|o-?1\b|i-?129\b/i, "i-129"],
  [/biometrics|green card|interview/i, "i-485"]
];

export { redditStats };

export function spaceForTitle(title) {
  for (const [pattern, id] of spaceRules) {
    if (pattern.test(title)) return id;
  }
  return "";
}

export function readRedditPost(row) {
  const flair = row[6] && row[6].length < 40 ? row[6] : "";
  return {
    sub: row[0],
    date: row[1],
    title: row[2],
    href: row[3],
    score: row[4],
    comments: row[5],
    flair,
    space: spaceForTitle(row[2]) || spaceForTitle(row[6] || "")
  };
}

let catalog = null;
let catalogLoad = null;

/** Loads ~700KB reddit-posts.js on demand so the homepage shell is not blocked. */
export function loadRedditCatalog() {
  if (catalog) return Promise.resolve(catalog);
  if (!catalogLoad) {
    catalogLoad = import("./reddit-posts.js")
      .then(({ redditPosts }) => {
        catalog = redditPosts.map(readRedditPost);
        return catalog;
      })
      .catch((err) => {
        catalogLoad = null;
        throw err;
      });
  }
  return catalogLoad;
}

export function redditCatalogReady() {
  return Boolean(catalog);
}

export function redditCatalog() {
  return catalog ?? [];
}

export function redditForSpace(spaceId) {
  return redditCatalog().filter((post) => post.space === spaceId);
}

export function redditFeed(spaceIds) {
  const joined = new Set(spaceIds || []);
  const posts = redditCatalog();
  const matched = posts.filter((post) => post.space && joined.has(post.space));
  return matched.length ? matched : posts;
}

export function themeForSpace(spaceId) {
  return redditStats.themes.find((row) => row[1] === spaceId) || null;
}

export function redditThemes(lang) {
  const es = lang === "es";
  return redditStats.themes.map((row) => ({
    id: row[0],
    space: row[1],
    total: row[2],
    uscis: row[3],
    forum: row[4],
    label: es ? row[6] : row[5]
  }));
}

export function redditMonths(lang) {
  return Object.entries(redditStats.byMonth).map(([key, count]) => {
    const [year, month] = key.split("-").map(Number);
    const label = new Intl.DateTimeFormat(lang === "es" ? "es" : "en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
    return { key, count, label };
  });
}

export function formatCount(value) {
  return Number(value).toLocaleString("en-US");
}

export function formatRedditDate(lang, iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "es" ? "es" : "en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}