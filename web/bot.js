import { evaluate } from "./logic.js";
import { questionGroups, statusLines, waitNote } from "./questions.js";
import { formatRedditDate, redditCatalog, redditStats } from "./reddit.js";

const stops = new Set("a an the of to and or is are was were be been my me i we you your our do does did what how why when where who which about for from with this that it on in at not no yes que el la los las un una de en por para con mi tu es son como cuando donde quien cual una".split(" "));
const fraud = /\b(fake|forged?|forge|falsif\w*|lie on|lying on|pretend|notario|guaranteed approval|gift cards?|whatsapp|mentira|mentir|falso|fals\w*|inventar pruebas|invent\w* (a |an )?(lease|letter|evidence|pay stub))\b/i;
const chance = /\b(my chances|will i (get |be )?approv\w*|am i going to (get |be )?approv\w*|will they approve me|predict my|me van a aprobar|mis probabilidades|voy a ser aprobad\w*|que debo decir para|what should i say to get)\b/i;
const infopass = /\binfopass\b/i;

const themeHints = [
  ["i485", ["i485", "adjustment", "aos", "greencard", "ajuste", "residencia"]],
  ["approved", ["approved", "approval", "aprobado", "aprobacion"]],
  ["interview", ["interview", "entrevista", "civics", "civismo"]],
  ["timeline", ["timeline", "howlong", "cuanto", "months", "meses", "waiting", "espera"]],
  ["i765", ["i765", "ead", "workpermit", "permiso", "empleo"]],
  ["n400", ["n400", "naturalization", "citizenship", "oath", "ciudadania", "juramento"]],
  ["i130", ["i130", "petition", "relative", "familiar", "cr1", "ir1"]],
  ["marriage", ["marriage", "spouse", "matrimonio", "esposo", "esposa"]],
  ["i140", ["i140", "eb1", "eb2", "eb3", "niw"]],
  ["rfe", ["rfe", "evidence", "evidencia"]],
  ["i751", ["i751", "conditions", "condiciones", "roc"]],
  ["biometrics", ["biometrics", "biometric", "biometria", "fingerprints", "huellas"]],
  ["address", ["address", "direccion", "moved"]],
  ["silence", ["quiet", "silence", "silencio", "no update", "stuck", "quieto"]],
  ["denied", ["denied", "denial", "negado", "negacion"]],
  ["i129f", ["i129f", "k1", "fiance", "prometido"]],
  ["inquiry", ["inquiry", "inquire", "consulta", "outside normal"]],
  ["i131", ["i131", "advanceparole", "travel", "viaje", "combo"]],
  ["nvc", ["nvc", "ds260", "consular", "consulado", "visa"]],
  ["expedite", ["expedite", "expedited", "acelerar"]],
  ["medical", ["medical", "i693", "medico"]],
  ["fee", ["fee", "fees", "tarifa", "payment"]],
  ["transferred", ["transferred", "transfer", "transferido"]],
  ["card", ["card", "tarjeta"]],
  ["scam", ["scam", "estafa", "notario"]],
  ["reviewed", ["actively", "reviewed", "revision"]],
  ["received", ["case was received", "caso recibido"]]
];

function say(lang, en, es) {
  return lang === "es" ? es : en;
}

function fold(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/-/g, "");
}

function tokens(text) {
  return [...new Set(fold(text).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !stops.has(word)))];
}

function overlap(query, text) {
  const words = new Set(tokens(text));
  let score = 0;
  for (const token of query) {
    if (words.has(token)) score += 2;
  }
  return score;
}

function library() {
  const en = questionGroups("en").flatMap((group) => group.items);
  const es = questionGroups("es").flatMap((group) => group.items);
  const cards = en.map((item, index) => ({
    enQ: item.q,
    enA: item.a,
    esQ: es[index].q,
    esA: es[index].a
  }));
  for (const line of statusLines("en")) {
    const twin = statusLines("es").find((item) => item.id === line.id);
    cards.push({ enQ: line.name, enA: line.body, esQ: twin?.name || line.name, esA: twin?.body || line.body });
  }
  for (const id of ["i-485", "i-130", "i-751", "i-765", "n-400", "i-131"]) {
    const enNote = waitNote("en", id);
    const esNote = waitNote("es", id);
    if (enNote) cards.push({ enQ: enNote.title, enA: enNote.body, esQ: esNote.title, esA: esNote.body });
  }
  return cards;
}

const cards = library();
const posts = redditCatalog();

function themeRows(query) {
  return redditStats.themes.map((row) => {
    const hints = themeHints.find((item) => item[0] === row[0])?.[1] || [];
    const hay = `${row[0]} ${row[5]} ${row[6]} ${hints.join(" ")}`;
    return { id: row[0], total: row[2], uscis: row[3], forum: row[4], en: row[5], es: row[6], score: overlap(query, hay) + (query.some((token) => hints.includes(token)) ? 3 : 0) };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score || b.total - a.total);
}

const generic = new Set("changed change case status still anyone post posts mention since nothing trouble people filed got only then after before show showing month months time long update updates seen else experienced this".split(" "));

function matchingPosts(query) {
  const hinted = query.filter((token) => themeHints.some((hint) => hint[1].includes(token)));
  const specific = query.filter((token) => !generic.has(token));
  const needed = hinted.length ? hinted : specific.length ? specific : query;
  return posts.map((post) => {
    const words = new Set(tokens(`${post.title} ${post.flair}`));
    return { post, score: overlap(query, `${post.title} ${post.flair}`), hit: needed.some((token) => words.has(token)) };
  }).filter((item) => item.hit && item.score >= 2)
    .sort((a, b) => b.score - a.score || (b.post.comments + b.post.score) - (a.post.comments + a.post.score))
    .slice(0, 4)
    .map((item) => item.post);
}

function themeSentence(lang, theme) {
  const label = lang === "es" ? theme.es : theme.en;
  return say(
    lang,
    `${label} shows up in ${theme.total.toLocaleString("en-US")} of the ${redditStats.posts.toLocaleString("en-US")} counted posts. ${theme.uscis.toLocaleString("en-US")} are on r/USCIS and ${theme.forum.toLocaleString("en-US")} are on r/USCIS_FORUM.`,
    `${label} aparece en ${theme.total.toLocaleString("en-US")} de las ${redditStats.posts.toLocaleString("en-US")} publicaciones contadas. ${theme.uscis.toLocaleString("en-US")} están en r/USCIS y ${theme.forum.toLocaleString("en-US")} en r/USCIS_FORUM.`
  );
}

export function askPosts(lang, question) {
  const asked = String(question || "").trim();
  const query = tokens(asked);
  const note = say(
    lang,
    "This is what the public posts are about. It is not legal advice, not a USCIS status, and not a decision on one case.",
    "Esto es de lo que tratan las publicaciones públicas. No es asesoría legal, no es un estatus de USCIS y no es una decisión sobre un caso."
  );
  if (evaluate(asked).verdict === "block" || infopass.test(asked)) {
    return {
      kind: "limit",
      paragraphs: [say(
        lang,
        "Leave receipt numbers, A-numbers, Social Security numbers, and passport numbers out. For a status, use your USCIS account or the USCIS Contact Center at 800-375-5283. Do not use a phone-tree trick.",
        "Deja fuera los números de recibo, los números A, el Seguro Social y los números de pasaporte. Para un estatus, usa tu cuenta de USCIS o el Centro de contacto de USCIS al 800-375-5283. No uses un truco del menú telefónico."
      )],
      note,
      themes: [],
      posts: []
    };
  }
  if (fraud.test(asked) || evaluate(asked).verdict === "hold") {
    return {
      kind: "limit",
      paragraphs: [say(
        lang,
        "This will not help you invent evidence, pay a stranger, or buy an approval. An expedite, when one exists, is an official request with a real reason. A private chat does not decide a case.",
        "Esto no ayuda a inventar pruebas, pagarle a un desconocido ni comprar una aprobación. Un trámite acelerado, cuando existe, es una solicitud oficial con una razón real. Un chat privado no decide un caso."
      )],
      note,
      themes: [],
      posts: []
    };
  }
  if (query.length < 1) {
    return {
      kind: "short",
      paragraphs: [say(lang, "Ask about a form or a step, such as biometrics, an interview, or the I-485.", "Pregunta por un formulario o un paso, como la biometría, una entrevista o el I-485.")],
      note: "",
      themes: [],
      posts: []
    };
  }
  const themes = themeRows(query).slice(0, 2);
  const found = matchingPosts(query);
  const best = cards.map((card) => ({ card, score: overlap(query, `${card.enQ} ${card.esQ} ${card.enA} ${card.esA}`) })).sort((a, b) => b.score - a.score)[0];
  const counting = /\b(how many|cuantos|cuantas)\b/.test(fold(asked));
  const paragraphs = [];
  if (chance.test(asked)) {
    const approved = redditStats.themes.find((row) => row[0] === "approved");
    const denied = redditStats.themes.find((row) => row[0] === "denied");
    paragraphs.push(say(
      lang,
      `The counted posts include ${approved[2].toLocaleString("en-US")} titles about an approval and ${denied[2].toLocaleString("en-US")} about a denial. Those are other people's posts. They do not say what happens in your case. There is no script that produces an approval.`,
      `Las publicaciones contadas incluyen ${approved[2].toLocaleString("en-US")} títulos sobre una aprobación y ${denied[2].toLocaleString("en-US")} sobre una negación. Son publicaciones de otras personas. No dicen qué pasa en tu caso. No hay un guion que produzca una aprobación.`
    ));
  } else if (counting && themes[0]) {
    paragraphs.push(themeSentence(lang, themes[0]));
  } else if (best && best.score >= 4) {
    paragraphs.push(lang === "es" ? best.card.esA : best.card.enA);
    if (themes[0]) paragraphs.push(themeSentence(lang, themes[0]));
  } else if (themes[0]) {
    paragraphs.push(say(
      lang,
      `The closest topic in the counted posts is ${themes[0].en}.`,
      `El tema más cercano en las publicaciones contadas es ${themes[0].es}.`
    ));
    paragraphs.push(themeSentence(lang, themes[0]));
  } else {
    paragraphs.push(say(
      lang,
      "That does not match a topic in the counted posts. Try a form, such as I-485 or N-400, or a step, such as biometrics, an interview, or a request for evidence.",
      "Eso no coincide con un tema de las publicaciones contadas. Prueba un formulario, como el I-485 o el N-400, o un paso, como la biometría, una entrevista o un pedido de evidencia."
    ));
  }
  return { kind: "answer", paragraphs, note, themes: themes.slice(0, 2), posts: found };
}

export function botPrompts(lang) {
  return lang === "es"
    ? ["No cambia nada desde la biometría. ¿El caso está en problemas?", "¿Qué significa en revisión activa?", "¿Cuántas publicaciones hablan de una entrevista?", "Presenté el I-751 y luego solo llegó la biometría."]
    : ["Nothing has changed since biometrics. Is the case in trouble?", "What does actively being reviewed mean?", "How many posts mention an interview?", "I filed the I-751 and then only got biometrics."];
}

export function redditDate(lang, iso) {
  return formatRedditDate(lang, iso);
}
