import { redditPosts } from "./reddit-posts.js";

export const redditStats = {
  from: "2025-11-03",
  to: "2026-11-03",
  posts: 33922,
  questions: 9916,
  bySub: { USCIS: 30671, USCIS_FORUM: 3251 },
  byMonth: {
    "2025-11": 2389,
    "2025-12": 2667,
    "2026-01": 2630,
    "2026-02": 2473,
    "2026-03": 2733,
    "2026-04": 2652,
    "2026-05": 2785,
    "2026-06": 2844,
    "2026-07": 3059,
    "2026-08": 3067,
    "2026-09": 3015,
    "2026-10": 3315,
    "2026-11": 293
  },
  themes: [
    ["i485", "i-485", 6018, 5419, 599, "Adjustment of status", "Ajuste de estatus"],
    ["approved", "", 4366, 3996, 370, "Approved", "Aprobado"],
    ["interview", "", 4263, 3839, 424, "Interview", "Entrevista"],
    ["timeline", "", 3178, 2863, 315, "How long", "Cuánto tarda"],
    ["i765", "i-765", 2311, 2019, 292, "Work permit", "Permiso de trabajo"],
    ["n400", "n-400", 1897, 1739, 158, "Naturalization", "Naturalización"],
    ["i130", "i-130", 1862, 1660, 202, "Petition for a relative", "Petición de familiar"],
    ["marriage", "", 1779, 1598, 181, "Marriage", "Matrimonio"],
    ["i140", "i-140", 1608, 1508, 100, "Immigrant worker petition", "Petición de trabajador inmigrante"],
    ["rfe", "", 1174, 1043, 131, "Request for evidence", "Pedido de evidencia"],
    ["i751", "i-751", 1139, 1020, 119, "Removal of conditions", "Quitar condiciones"],
    ["biometrics", "", 1087, 991, 96, "Biometrics", "Biometría"],
    ["address", "", 928, 825, 103, "Address", "Dirección"],
    ["silence", "", 722, 626, 96, "No update", "Sin novedad"],
    ["denied", "", 671, 570, 101, "Denied", "Negado"],
    ["i129f", "i-129f", 602, 555, 47, "Fiancé(e) petition", "Petición de prometido(a)"],
    ["inquiry", "", 577, 495, 82, "Case inquiry", "Consulta del caso"],
    ["i131", "i-131", 573, 503, 70, "Travel document", "Documento de viaje"],
    ["nvc", "consular", 452, 421, 31, "National Visa Center", "Centro Nacional de Visas"],
    ["expedite", "", 430, 376, 54, "Expedite", "Acelerar"],
    ["medical", "", 338, 305, 33, "Medical exam", "Examen médico"],
    ["fee", "fees-and-tools", 314, 278, 36, "Fees", "Tarifas"],
    ["transferred", "", 297, 267, 30, "Case transferred", "Caso transferido"],
    ["work", "i-765", 158, 141, 17, "Work", "Trabajo"],
    ["card", "", 115, 110, 5, "Card", "Tarjeta"],
    ["scam", "", 93, 82, 11, "Scam", "Estafa"],
    ["reviewed", "", 65, 61, 4, "Actively reviewed", "En revisión activa"],
    ["received", "", 14, 13, 1, "Case received", "Caso recibido"]
  ],
  words: [
    ["interview", 4191], ["i-485", 3194], ["approved", 2980], ["card", 2242], ["green", 1742],
    ["pending", 1549], ["timeline", 1492], ["i-130", 1488], ["visa", 1271], ["approval", 1175],
    ["processing", 1080], ["marriage", 986], ["status", 898], ["biometrics", 883], ["months", 856],
    ["n-400", 790], ["i-751", 785], ["waiting", 785], ["filing", 761], ["notice", 759],
    ["travel", 670], ["asylum", 659], ["i-765", 658], ["evidence", 477], ["premium", 455],
    ["spouse", 414], ["denied", 390], ["citizenship", 385]
  ]
};

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

const catalog = redditPosts.map(readRedditPost);

export function redditCatalog() {
  return catalog;
}

export function redditForSpace(spaceId) {
  return catalog.filter((post) => post.space === spaceId);
}

export function redditFeed(spaceIds) {
  const joined = new Set(spaceIds || []);
  const matched = catalog.filter((post) => post.space && joined.has(post.space));
  return matched.length ? matched : catalog;
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
