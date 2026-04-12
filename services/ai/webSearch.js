/**
 * Búsqueda web opcional (Serper / SerpAPI) — equivalente a web_search.py.
 */
const axios = require("axios");

const SERPER_URL = "https://google.serper.dev/search";
const SERPAPI_URL = "https://serpapi.com/search.json";

function trimEnv(...names) {
  for (const n of names) {
    let raw = process.env[n];
    if (raw == null) continue;
    raw = String(raw).trim();
    if (
      raw.length >= 2 &&
      ((raw.startsWith("'") && raw.endsWith("'")) ||
        (raw.startsWith('"') && raw.endsWith('"')))
    ) {
      raw = raw.slice(1, -1).trim();
    }
    if (raw) return raw;
  }
  return "";
}

function organicFromSerper(data, num) {
  const out = [];
  for (const item of (data.organic || []).slice(0, num)) {
    const title = String(item.title || "").trim();
    const snip = String(item.snippet || "").trim();
    if (title || snip) out.push({ title, snippet: snip });
  }
  return out;
}

function organicFromSerpapi(data, num) {
  const out = [];
  for (const item of (data.organic_results || []).slice(0, num)) {
    const title = String(item.title || "").trim();
    const snip = String(item.snippet || "").trim();
    if (title || snip) out.push({ title, snippet: snip });
  }
  return out;
}

async function callSerper(query, num, key) {
  try {
    const { data, status } = await axios.post(
      SERPER_URL,
      { q: query.trim(), num: Math.min(num, 10) },
      {
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        timeout: 25000,
        validateStatus: () => true,
      }
    );
    if (status >= 400) return [[], true];
    if (!data || typeof data !== "object") return [[], false];
    return [organicFromSerper(data, num), false];
  } catch {
    return [[], true];
  }
}

async function callSerpapi(query, num, key) {
  try {
    const { data } = await axios.get(SERPAPI_URL, {
      params: {
        engine: "google",
        q: query.trim(),
        api_key: key,
        num: Math.min(num, 10),
      },
      timeout: 30000,
    });
    if (!data || typeof data !== "object") return [];
    return organicFromSerpapi(data, num);
  } catch {
    return [];
  }
}

async function serperSearch(query, num = 8) {
  const q = String(query || "").trim();
  if (!q) return [];

  const serperKey = trimEnv("SERPER_API_KEY", "SERPER_KEY");
  const serpapiKey = trimEnv("SERPAPI_API_KEY", "SERPAPI_KEY");

  if (serperKey) {
    const [rows, failed] = await callSerper(q, num, serperKey);
    if (!failed) return rows;
    if (serpapiKey) return callSerpapi(q, num, serpapiKey);
    return [];
  }
  if (serpapiKey) return callSerpapi(q, num, serpapiKey);
  return [];
}

async function buildCuratorContextFromSerper(personalityLine) {
  const queries = [
    `cultural recommendations personality traits film series music books games ${personalityLine.slice(0, 120)}`,
    "best acclaimed albums films novels video games art lovers curated lists",
  ];
  const chunks = [];
  for (const q of queries) {
    const rows = await serperSearch(q, 6);
    for (const row of rows) {
      chunks.push(`- ${row.title}: ${row.snippet}`.slice(0, 500));
    }
  }
  if (!chunks.length) return ["", false];
  let text = chunks.join("\n");
  if (text.length > 6000) text = `${text.slice(0, 6000)}\n…`;
  return [text, true];
}

async function buildArtisticWebContext(o, c, e, a, n, testType, subfacetsPreview) {
  const traits = `openness ${o.toFixed(1)} conscientiousness ${c.toFixed(1)} extraversion ${e.toFixed(1)} agreeableness ${a.toFixed(1)} neuroticism ${n.toFixed(1)} test ${testType}`;
  const queries = [
    `best films series novels albums video games art personality taste ${traits.slice(0, 140)}`,
    `acclaimed cultural masterpieces movies books music games emotional depth ${traits.slice(0, 120)}`,
    `obras culturales recomendadas cine literatura música juegos arte personalidad ${traits.slice(0, 130)}`,
  ];
  if (String(subfacetsPreview || "").trim()) {
    queries.push(
      `curation lists film literature music games psychology ${String(subfacetsPreview).slice(0, 160)}`
    );
  }
  const chunks = [];
  for (const q of queries) {
    const rows = await serperSearch(q, 7);
    for (const row of rows) {
      chunks.push(`- ${row.title}: ${row.snippet}`.slice(0, 520));
    }
  }
  if (!chunks.length) return ["", false];
  let text = chunks.join("\n");
  if (text.length > 7000) text = `${text.slice(0, 7000)}\n…`;
  return [text, true];
}

module.exports = {
  serperSearch,
  buildCuratorContextFromSerper,
  buildArtisticWebContext,
};
