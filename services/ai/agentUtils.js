const WORK_CAT_ALLOWED = new Set([
  "cine",
  "musica",
  "literatura",
  "videojuegos",
  "arte-visual",
]);

const WORK_CAT_ALIAS = {
  pelicula: "cine",
  películas: "cine",
  series: "cine",
  serie: "cine",
  tv: "cine",
  film: "cine",
  movie: "cine",
  música: "musica",
  music: "musica",
  album: "musica",
  libro: "literatura",
  libros: "literatura",
  book: "literatura",
  juego: "videojuegos",
  juegos: "videojuegos",
  game: "videojuegos",
  games: "videojuegos",
  arte: "arte-visual",
  art: "arte-visual",
  pintura: "arte-visual",
};

const OCEAN_SUBFACET_ORDER = {
  openness: [
    "intellect",
    "ingenuity",
    "reflection",
    "competence",
    "quickness",
    "introspection",
    "creativity",
    "imagination",
    "depth",
  ],
  conscientiousness: [
    "conscientiousness",
    "efficiency",
    "dutifulness",
    "purposefulness",
    "organization",
    "cautiousness",
    "rationality",
    "perfectionism",
    "orderliness",
  ],
  extraversion: [
    "gregariousness",
    "friendliness",
    "assertiveness",
    "poise",
    "leadership",
    "provocativeness",
    "self_disclosure",
    "talkativeness",
    "sociability",
  ],
  agreeableness: [
    "understanding",
    "warmth",
    "morality",
    "pleasantness",
    "empathy",
    "cooperation",
    "sympathy",
    "tenderness",
    "nurturance",
  ],
  neuroticism: [
    "stability",
    "happiness",
    "calmness",
    "moderation",
    "toughness",
    "impulse_control",
    "imperturbability",
    "cool_headedness",
    "tranquility",
  ],
};

const GENRE_REC_KEYS = [
  "cine",
  "musica",
  "literatura",
  "videojuegos",
  "arte-visual",
];

const DEFAULT_CANON_TITLES = [
  "stalker",
  "blade runner",
  "blade runner 2049",
  "persona",
  "arrival",
  "la llegada",
  "music for airports",
  "ambient 1: music for airports",
  "music for 18 musicians",
  "disco elysium",
  "the witness",
  "journey",
  "meditaciones",
  "el extranjero",
  "1984",
];

const GENERIC_GENRE_TERMS = new Set([
  "drama",
  "comedia",
  "accion",
  "acción",
  "thriller",
  "romance",
  "terror",
  "horror",
  "fantasia",
  "fantasía",
  "musica",
  "música",
  "rock",
  "pop",
  "jazz",
  "clasica",
  "clásica",
  "novela",
  "ficcion",
  "ficción",
  "cine",
  "arte",
  "videojuegos",
]);

function normalizeWorkCandidateRows(rawList, maxItems = 24) {
  if (!Array.isArray(rawList)) return [];
  const cleaned = [];
  const seen = new Set();
  for (const item of rawList.slice(0, maxItems)) {
    if (!item || typeof item !== "object") continue;
    let cat = String(item.category || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "-");
    if (WORK_CAT_ALIAS[cat]) cat = WORK_CAT_ALIAS[cat];
    if (!WORK_CAT_ALLOWED.has(cat)) continue;
    const title = String(item.title || "").trim();
    if (title.length < 2) continue;
    const creator = String(item.creator || "").trim();
    const key = `${cat}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = { category: cat, title: title.slice(0, 200) };
    if (creator) row.creator = creator.slice(0, 120);
    cleaned.push(row);
  }
  return cleaned;
}

function formatExceptionForClient(exc, maxLen = 800) {
  const parts = [];
  let cur = exc;
  let depth = 0;
  while (cur != null && depth < 4) {
    const s = String(cur.message || cur || "").trim();
    if (s && !parts.includes(s)) parts.push(s);
    cur = cur.cause || cur.__cause__;
    depth += 1;
  }
  const msg = parts.length ? parts.join(" | ") : (exc && exc.name) || "Error";
  if (msg.length > maxLen) return `${msg.slice(0, maxLen - 1)}…`;
  return msg;
}

function traitTotal(scores, key) {
  const v = scores[key];
  if (v && typeof v === "object") {
    const t = v.total;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "number") return v;
  return 0;
}

function buildDeepSubfacetsBlock(scores) {
  if (!scores || typeof scores !== "object") return "";
  const parts = [];
  const dims = [
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
  ];

  for (const dim of dims) {
    const dimScores =
      scores[dim] && typeof scores[dim] === "object" ? scores[dim] : {};
    const canonical = OCEAN_SUBFACET_ORDER[dim] || [];
    const extraKeys = Object.keys(dimScores).filter(
      (k) => k !== "total" && !canonical.includes(k)
    );
    const orderedSubfacets = [...canonical, ...extraKeys];
    const line = orderedSubfacets
      .map((sf) => `${sf}: ${dimScores[sf] ?? "N/A"}`)
      .join(", ");
    parts.push(`- ${dim}: ${line || "(sin subfacetas disponibles)"}`);
  }

  return `Subfacetas detalladas (deben considerarse todas):\n${parts.join("\n")}\n`;
}

function scoreBand(v) {
  const n = Number(v) || 0;
  if (n >= 3.8) return "high";
  if (n <= 2.2) return "low";
  return "mid";
}

function buildProfileDrivenCurationRules({ o, c, e, a, n, fingerprint }) {
  const ob = scoreBand(o);
  const cb = scoreBand(c);
  const eb = scoreBand(e);
  const ab = scoreBand(a);
  const nb = scoreBand(n);
  const rules = [
    `Apertura ${ob}, Responsabilidad ${cb}, Extraversión ${eb}, Amabilidad ${ab}, Neuroticismo ${nb}.`,
    eb === "high"
      ? "Prioriza propuestas con energía social y dinamismo."
      : eb === "low"
      ? "Prioriza propuestas introspectivas, contemplativas y de ritmo pausado."
      : "Combina propuestas introspectivas y sociales de forma equilibrada.",
    nb === "high"
      ? "Incluye intensidad emocional y catarsis guiada; evita frialdad excesiva."
      : nb === "low"
      ? "Incluye calma, precisión formal y coherencia estética."
      : "Alterna estabilidad tonal con contraste emocional moderado.",
    ob === "high"
      ? "Incluye riesgo creativo y estructuras menos convencionales."
      : ob === "low"
      ? "Incluye claridad narrativa y formatos más accesibles."
      : "Mezcla innovación moderada con formatos familiares.",
    `Usa la huella ${String(fingerprint || "na")} para que la selección sea única del perfil y no clónica frente a otros usuarios.`,
    "Prioriza subgéneros concretos y menos obvios cuando encajen con el perfil, sin bloquear obras por lista fija.",
  ];
  return { rulesText: rules.join("\n- "), avoidTitles: [] };
}

function buildOceanFingerprint(scores) {
  if (!scores || typeof scores !== "object") return "na";
  const dims = [
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
  ];
  const parts = [];
  for (const d of dims) {
    const row = scores[d];
    if (!row || typeof row !== "object") continue;
    const keys = Object.keys(row)
      .filter((k) => k !== "__proto__")
      .sort();
    const seg = keys.map((k) => `${k}:${row[k]}`).join(",");
    parts.push(`${d}{${seg}}`);
  }
  const s = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(16).slice(0, 12);
}

function normalizeGenreRecommendations(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const k of GENRE_REC_KEYS) {
    let arr = raw[k];
    if (!Array.isArray(arr) && k === "arte-visual" && Array.isArray(raw.arte_visual)) {
      arr = raw.arte_visual;
    }
    if (!Array.isArray(arr)) continue;
    const cleaned = arr
      .map((x) => String(x || "").trim())
      .filter((x) => x.length > 0)
      .slice(0, 12);
    if (cleaned.length) out[k] = cleaned;
  }
  return out;
}

function normalizeGenreText(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericGenreLabel(label) {
  const n = normalizeGenreText(label);
  if (!n) return true;
  if (GENERIC_GENRE_TERMS.has(n)) return true;
  const tokenCount = n.split(" ").filter(Boolean).length;
  return tokenCount <= 1;
}

function genreSpecificityMetrics(genreRecommendations) {
  let total = 0;
  let genericCount = 0;
  for (const key of GENRE_REC_KEYS) {
    const list = Array.isArray(genreRecommendations?.[key])
      ? genreRecommendations[key]
      : [];
    for (const item of list) {
      total += 1;
      if (isGenericGenreLabel(item)) genericCount += 1;
    }
  }
  return { total, genericCount, specificCount: Math.max(0, total - genericCount) };
}

function looksOverengineeredGenreLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return true;
  const n = normalizeGenreText(raw);
  const tokenCount = n.split(" ").filter(Boolean).length;
  const weirdChars = (raw.match(/[\/|()[\]{}]/g) || []).length;
  const commaCount = (raw.match(/,/g) || []).length;
  // Penalize ultra-long or stacked compound tags that sound unnatural.
  return raw.length > 42 || tokenCount > 5 || weirdChars >= 2 || commaCount >= 2;
}

function genreNaturalnessMetrics(genreRecommendations) {
  let total = 0;
  let overengineeredCount = 0;
  for (const key of GENRE_REC_KEYS) {
    const list = Array.isArray(genreRecommendations?.[key]) ? genreRecommendations[key] : [];
    for (const item of list) {
      total += 1;
      if (looksOverengineeredGenreLabel(item)) overengineeredCount += 1;
    }
  }
  return {
    total,
    overengineeredCount,
    naturalCount: Math.max(0, total - overengineeredCount),
  };
}

function normalizeTitleForCompare(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenreHintCompatible(genreHint, allowedGenres) {
  if (!genreHint || !Array.isArray(allowedGenres) || !allowedGenres.length) return false;
  const hint = normalizeGenreText(genreHint);
  if (!hint) return false;
  const allowed = allowedGenres.map((g) => normalizeGenreText(g)).filter(Boolean);
  return allowed.some(
    (g) => hint === g || hint.includes(g) || g.includes(hint)
  );
}

function normalizeProfileDescription(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const summary = (paragraphs.length ? paragraphs[paragraphs.length - 1] : text)
    .replace(/\s+/g, " ")
    .trim();
  return summary.length > 900 ? `${summary.slice(0, 899)}…` : summary;
}

function normalizeSuggestedWorksByGenre(rawList, genreRecommendations, maxItems = 20) {
  if (!Array.isArray(rawList) || !genreRecommendations || typeof genreRecommendations !== "object") {
    return [];
  }

  const cleaned = normalizeWorkCandidateRows(rawList, maxItems * 2);
  const byKey = new Map();
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const key = `${String(item.category || "").trim().toLowerCase().replace(/\s+/g, "").replace(/_/g, "-")}|${String(item.title || "").trim().toLowerCase()}`;
    byKey.set(key, item);
  }

  const filtered = [];
  for (const row of cleaned) {
    const key = `${row.category}|${String(row.title || "").trim().toLowerCase()}`;
    const original = byKey.get(key);
    const hint =
      original?.genreHint ||
      original?.genre ||
      original?.style ||
      original?.subgenre ||
      "";
    const allowed = genreRecommendations[row.category] || [];
    if (isGenreHintCompatible(hint, allowed)) {
      filtered.push(row);
      if (filtered.length >= maxItems) break;
    }
  }

  return filtered;
}

function countDefaultCanonOverlap(works, avoidTitles) {
  if (!Array.isArray(works) || !works.length) return 0;
  const avoid = new Set((avoidTitles || []).map(normalizeTitleForCompare));
  let count = 0;
  for (const w of works) {
    const t = normalizeTitleForCompare(w?.title || "");
    if (t && avoid.has(t)) count += 1;
  }
  return count;
}

function countGlobalCanonOverlap(works) {
  if (!Array.isArray(works) || !works.length) return 0;
  const canon = DEFAULT_CANON_TITLES.map(normalizeTitleForCompare);
  let count = 0;
  for (const w of works) {
    const t = normalizeTitleForCompare(w?.title || "");
    if (!t) continue;
    const overlapsCanon = canon.some((c) => c && (t === c || t.includes(c) || c.includes(t)));
    if (overlapsCanon) count += 1;
  }
  return count;
}

function envModels() {
  const raw = process.env.GEMINI_MODEL;
  const candidates = [
    raw,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ].filter(Boolean);
  return [...new Set(candidates)];
}

function normalizeForIntent(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

module.exports = {
  GENRE_REC_KEYS,
  normalizeWorkCandidateRows,
  formatExceptionForClient,
  traitTotal,
  buildDeepSubfacetsBlock,
  buildProfileDrivenCurationRules,
  buildOceanFingerprint,
  normalizeGenreRecommendations,
  genreSpecificityMetrics,
  genreNaturalnessMetrics,
  normalizeTitleForCompare,
  normalizeProfileDescription,
  normalizeSuggestedWorksByGenre,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
  envModels,
  normalizeForIntent,
};
