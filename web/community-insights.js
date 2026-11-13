// CaseCircle Community Insights - live data from Supabase aggregates
// This module fetches from Supabase insights_* tables and transforms to the format expected by insightsScreen()

const SUPABASE_URL = "https://aucdxtyzyilcjqtgxrqf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1Y2R4dHl6eWlsY2pxdGd4cnFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzg1MjIsImV4cCI6MjEwOTkxNDUyMn0.gdRCv5vV5zZNhzwwbIS7wjHXH7TbQryK2zUJLBmup88";

async function supabaseQuery(table, options = {}) {
  const params = new URLSearchParams();
  if (options.select) params.set("select", options.select);
  if (options.order) params.set("order", options.order);
  if (options.limit) params.set("limit", options.limit);
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

const TOPIC_LABELS = {
  timeline: { en: "Waiting and timelines", es: "Espera y tiempos" },
  interview: { en: "Interview", es: "Entrevista" },
  documents: { en: "Documents and evidence", es: "Documentos y pruebas" },
  rfe: { en: "RFEs and NOIDs", es: "RFE y NOID" },
  biometrics: { en: "Biometrics", es: "Biometría" },
  approval: { en: "Approval", es: "Aprobación" },
  denial: { en: "Denial", es: "Negación" },
  expedite: { en: "Expedite requests", es: "Solicitudes de expedición" },
  travel: { en: "Travel and advance parole", es: "Viaje y advance parole" },
  combo: { en: "Combo card", es: "Combo card" },
  processing: { en: "Processing times", es: "Tiempos de procesamiento" },
  general: { en: "General questions", es: "Preguntas generales" }
};

function inferTopic(title) {
  const t = (title || "").toLowerCase();
  if (/interview|oath|ceremony/.test(t)) return "interview";
  if (/rfe|noid|request for evidence/.test(t)) return "rfe";
  if (/document|evidence|proof|form|i-\d+/.test(t)) return "documents";
  if (/timeline|wait|pending|how long|days|months|stuck/.test(t)) return "timeline";
  if (/biometric/.test(t)) return "biometrics";
  if (/approv|card.*produc/.test(t)) return "approval";
  if (/deni|reject/.test(t)) return "denial";
  if (/expedite/.test(t)) return "expedite";
  if (/travel|parole|i-131/.test(t)) return "travel";
  if (/combo/.test(t)) return "combo";
  if (/processing time/.test(t)) return "processing";
  return "general";
}

export async function fetchLiveInsights() {
  const [meta, formCounts, stepCounts, yearTrends, rfeTopics, examplePosts] = await Promise.all([
    supabaseQuery("insights_meta"),
    supabaseQuery("insights_form_counts", { order: "post_count.desc" }),
    supabaseQuery("insights_step_counts", { order: "form,post_count.desc" }),
    supabaseQuery("insights_year_trends", { order: "form,year" }),
    supabaseQuery("insights_rfe_topics", { order: "post_count.desc" }),
    supabaseQuery("insights_example_posts", { order: "score.desc", limit: "100" })
  ]);

  const metaMap = Object.fromEntries(meta.map(m => [m.key, m.value_text || m.value_int || m.value_json]));

  const questionsByForm = {};
  const FORMS = ["I-485", "I-130", "I-751", "N-400", "I-765", "I-131"];
  
  for (const form of FORMS) {
    const fc = formCounts.find(f => f.form === form);
    if (!fc) continue;
    
    const formExamples = examplePosts.filter(p => p.form === form);
    const topicCounts = {};
    for (const ex of formExamples) {
      const topic = inferTopic(ex.title);
      if (!topicCounts[topic]) topicCounts[topic] = { count: 0, examples: [] };
      topicCounts[topic].count++;
      if (topicCounts[topic].examples.length < 2) {
        topicCounts[topic].examples.push({
          title: ex.title,
          href: `https://reddit.com${ex.permalink}`
        });
      }
    }
    
    const steps = stepCounts.filter(s => s.form === form);
    for (const step of steps) {
      const topic = step.step;
      if (!topicCounts[topic]) topicCounts[topic] = { count: 0, examples: [] };
      topicCounts[topic].count += step.post_count;
    }
    
    const topics = Object.entries(topicCounts)
      .map(([id, data]) => ({
        id,
        en: TOPIC_LABELS[id]?.en || id,
        es: TOPIC_LABELS[id]?.es || id,
        count: data.count,
        examples: data.examples
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    
    questionsByForm[form] = {
      questions: fc.question_count || 0,
      topics
    };
  }

  const rfeTopicsList = rfeTopics.slice(0, 10).map(r => ({
    id: r.form.toLowerCase(),
    en: `${r.form} RFE`,
    es: `RFE de ${r.form}`,
    count: r.post_count,
    examples: r.example_permalink ? [{
      title: `${r.form} RFE example`,
      href: `https://reddit.com${r.example_permalink}`
    }] : []
  }));

  return {
    generatedBy: "Supabase aggregates (live)",
    label: {
      en: "From public posts, self-reported, not official",
      es: "De publicaciones públicas, autodeclarado, no oficial"
    },
    source: {
      posts: metaMap.total_posts || 0,
      uniqueTitles: metaMap.total_posts || 0,
      questions: formCounts.reduce((sum, f) => sum + (f.question_count || 0), 0),
      from: metaMap.min_date,
      to: metaMap.max_date,
      fields: "full posts"
    },
    datasetWide: {
      posts: metaMap.total_posts || 0,
      from: metaMap.min_date,
      to: metaMap.max_date,
      note: metaMap.coverage_note || ""
    },
    questionsByForm,
    rfe: {
      posts: rfeTopics.reduce((sum, r) => sum + r.post_count, 0),
      topics: rfeTopicsList
    },
    yearTrends: yearTrends.reduce((acc, y) => {
      if (!acc[y.form]) acc[y.form] = {};
      acc[y.form][y.year] = y.post_count;
      return acc;
    }, {}),
    meta: {
      minDate: metaMap.min_date,
      maxDate: metaMap.max_date,
      totalPosts: metaMap.total_posts,
      coverageNote: metaMap.coverage_note,
      refreshedAt: metaMap.refreshed_at
    }
  };
}

export async function fetchUscisOfficialData() {
  const [processingTimes, quarterlyPending, fieldOffices] = await Promise.all([
    fetch("data/uscis_official/processing_times.json").then(r => r.ok ? r.json() : null),
    fetch("data/uscis_official/quarterly_pending.json").then(r => r.ok ? r.json() : null),
    fetch("data/uscis_official/field_offices.json").then(r => r.ok ? r.json() : null)
  ]);
  return { processingTimes, quarterlyPending, fieldOffices };
}
