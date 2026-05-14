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

/** Umbrales IPIP (media Likert 1–5 por rasgo): misma lógica que anti-patrones / ajuste dinámico del feed. */
const IPIP_LIKERT_BAND_HIGH_GE = 3.55;
const IPIP_LIKERT_BAND_LOW_LT = 2.75;

/** Banda cualitativa alta / media / baja (etiquetas en español para prompts). */
function oceanLikertTraitBand(v) {
  const n = Number(v) || 0;
  if (n >= IPIP_LIKERT_BAND_HIGH_GE) return "alta";
  if (n < IPIP_LIKERT_BAND_LOW_LT) return "baja";
  return "media";
}

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
    const genreHint = String(item.genreHint || item.genre || "").trim();
    if (genreHint) row.genreHint = genreHint.slice(0, 160);
    const oceanFit = String(item.oceanFitReason || item.ocean_fit_reason || "").trim();
    if (oceanFit) row.oceanFitReason = oceanFit.slice(0, 280);
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

/** Histórico: totales facetas guardados como ((mediaLikert − 1) / 4) * 5 → media Likert equivalente en [1, 5]. */
function affineDisplay05ToLikertMean(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return (n / 5) * 4 + 1;
}

const DEFAULT_OCEAN_SCORE_METRIC = "display_affine_05";

/** Convierte el árbol de scores Mongo a medias Likert 1–5 para prompts IA y curación (traslada formato antiguo). */
function oceanScoresToCanonicalLikert(scores, scoreMetric = DEFAULT_OCEAN_SCORE_METRIC) {
  if (!scores || typeof scores !== "object") return scores;
  const dims = [
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
  ];
  const useLikertStored = scoreMetric === "ipip_mean_1_5";
  const out = { ...scores };
  for (const d of dims) {
    const row = scores[d];
    if (!row || typeof row !== "object") continue;
    const next = { ...row };
    const t = parseFloat(row.total);
    if (Number.isFinite(t)) next.total = useLikertStored ? t : affineDisplay05ToLikertMean(t);
    for (const k of Object.keys(row)) {
      if (k === "total") continue;
      const sv = parseFloat(row[k]);
      if (!Number.isFinite(sv)) continue;
      next[k] = useLikertStored ? sv : affineDisplay05ToLikertMean(sv);
    }
    out[d] = next;
  }
  return out;
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

function buildProfileDrivenCurationRules({ o, c, e, a, n }) {
  const ob = oceanLikertTraitBand(o);
  const cb = oceanLikertTraitBand(c);
  const eb = oceanLikertTraitBand(e);
  const ab = oceanLikertTraitBand(a);
  const nb = oceanLikertTraitBand(n);
  const rules = [
    `Apertura ${ob}, Responsabilidad ${cb}, Extraversión ${eb}, Amabilidad ${ab}, Neuroticismo ${nb} (solo estas bandas cualitativas alta/media/baja por rasgo; sin puntuaciones del cuestionario).`,
  ];
  return { rulesText: rules.join("\n- "), avoidTitles: [] };
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

const VIDEOGAME_FEED_EXPLORATION_AXES = [
  "CRPG o isométrico narrativo de PC europeo (no saga mainstream reciente)",
  "Simulación, tycoon o 4X de PC entre 1995 y 2012",
  "Metroidvania o acción-plataformas de estudio pequeño o regional",
  "Novela visual, adventure point-and-click o walking sim con fuerte guion",
  "Shooter o acción de PS2/Xbox/Dreamcast fuera de franquicias anuales",
  "JRPG de consola clásica (PS1/PS2/DS) que no sea la subsaga más citada",
  "Estrategia por turnos o táctica en cuadrícula de nicho (war games, roguelike táctico)",
  "Juego de puzles o diseño experimental con reglas propias",
  "Carreras, arcades o compilaciones retro poco streamadas",
  "RPG de mesa digital, deckbuilder roguelike o autoral indie hispanohablante",
  "Horror psicológico o survival de bajo presupuesto con identidad clara",
  "Sandbox físico o simulación rara (física, logística, oficios)",
  "Beat em up, shoot em up o run and gun de arcade o 16-bit",
  "MMO o servicio en vivo antiguo o regional con comunidad distintiva",
  "Aventura gráfica española o latinoamericana de estudio mediano",
  "Musical, ritmo o party game fuera de las dos franquicias dominantes",
];

function hashString32(input) {
  const s = String(input ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Elige ejes distintos por semilla derivada del contexto para des-correlacionar listas. */
function pickVideoGameExplorationAxes(seed, count = 2) {
  const pool = [...VIDEOGAME_FEED_EXPLORATION_AXES];
  const out = [];
  let h = hashString32(seed || "na");
  for (let i = 0; i < count && pool.length; i += 1) {
    const idx = h % pool.length;
    out.push(pool.splice(idx, 1)[0]);
    h = Math.imul(h ^ (i + 1), 1103515245) >>> 0;
  }
  return out;
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
  ].filter(Boolean);
  return [...new Set(candidates)];
}

/**
 * Modelos Gemini para el chat (calidad alta primero).
 * GEMINI_CHAT_MODEL override (coma-separado o un solo modelo); si no, GEMINI_MODEL y luego cascada estable.
 */
function chatGeminiCandidates() {
  const primary = (
    process.env.GEMINI_CHAT_MODEL ||
    process.env.GEMINI_MODEL ||
    ""
  )
    .split(",")
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const defaults = [
    "gemini-2.5-pro",
    "gemini-2.5-pro-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ];
  const merged = [...primary, ...defaults];
  return [...new Set(merged)];
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

/** Bloque corto para prompts: títulos alineados con TMDB España (es-ES). */
const PROMPT_TMDB_SPAIN_CINE_TITLE_RULE =
  "- CINE (película o serie): en \"title\" usa el nombre comercial en español de España exactamente como lo lista TMDB con locale es-ES (cartelera España). No uses título en inglés ni variantes latinoamericanas si en TMDB España el estreno tiene otro título; así el validador automático encuentra la ficha.";

module.exports = {
  IPIP_LIKERT_BAND_HIGH_GE,
  IPIP_LIKERT_BAND_LOW_LT,
  oceanLikertTraitBand,
  normalizeWorkCandidateRows,
  formatExceptionForClient,
  traitTotal,
  affineDisplay05ToLikertMean,
  DEFAULT_OCEAN_SCORE_METRIC,
  oceanScoresToCanonicalLikert,
  buildDeepSubfacetsBlock,
  buildProfileDrivenCurationRules,
  normalizeTitleForCompare,
  normalizeProfileDescription,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
  envModels,
  chatGeminiCandidates,
  normalizeForIntent,
  PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
  pickVideoGameExplorationAxes,
};
