/**
 * Recomendaciones similares a una obra (JSON desde Gemini + normalización).
 */
const {
  normalizeWorkCandidateRows,
  formatExceptionForClient,
  PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
  pickVideoGameExplorationAxes,
} = require("./agentUtils");
const { logIaRecommendedWorks } = require("./iaLogRecommendedWorks");

const logger = console;
const allowedCategories = new Set([
  "cine",
  "musica",
  "literatura",
  "videojuegos",
  "arte-visual",
]);

function normalizeCategory(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  const alias = {
    pelicula: "cine",
    peliculas: "cine",
    series: "cine",
    serie: "cine",
    tv: "cine",
    film: "cine",
    movie: "cine",
    musica: "musica",
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
    artevisual: "arte-visual",
    "arte-visual": "arte-visual",
  };
  const normalized = alias[key] || key;
  return allowedCategories.has(normalized) ? normalized : "";
}

async function recommendSimilarWorks(agent, artwork, options = {}) {
  if (!agent.configured()) {
    return { candidates: [], reason: "no_gemini" };
  }
  const limit = Math.max(1, Math.min(10, Number(options.limit) || 3));
  const requestedCategory = normalizeCategory(options.targetCategory);
  const category = normalizeCategory(artwork?.category);
  const targetCategory = requestedCategory
    ? requestedCategory
    : category;
  const title = String(artwork?.title || "").trim();
  const creator = String(artwork?.creator || "").trim();
  const description = String(artwork?.description || "")
    .trim()
    .slice(0, 450);
  const mediaType = String(artwork?.metadata?.mediaType || "")
    .trim()
    .toLowerCase();
  const genres = Array.isArray(artwork?.metadata?.genres)
    ? artwork.metadata.genres.slice(0, 6).join(", ")
    : "";

  if (!title || !category || !targetCategory) {
    return { candidates: [], reason: "invalid_input" };
  }

  const wantedCount = Math.max(limit + 2, 4);
  const gameExplorationAxes =
    targetCategory === "videojuegos"
      ? pickVideoGameExplorationAxes(`${title}|${creator}|${category}|${mediaType}`, 2)
      : [];
  const gameVarietyRules =
    targetCategory === "videojuegos"
      ? `
- En videojuegos: prioriza la similitud real con la obra base (mecánica, tono, temática, estudio) por encima de moda o actualidad. Reparte candidatos entre distintas décadas de lanzamiento y entre distintas familias de plataforma (PC, consolas clásicas o modernas, portátiles, arcade, etc.); no concentres la lista en lanzamientos recientes ni en un solo ecosistema. Incluye títulos buscables en IGDB de cualquier época; no sesgues hacia éxitos masivos del momento.
- Anti-plantilla: no devuelvas el mismo pack de megatítulos (Witcher 3, BOTW, GTA V, Minecraft, Fortnite, FIFA, CoD, Elden Ring, Cyberpunk 2077, RDR2, BG3, etc.) que servirías a cualquier usuario; al menos la mitad de los candidatos deben ser menos masificados pero igualmente buscables en IGDB. Evita que casi todos los títulos coincidan con el mismo subconjunto de "indies canónicos" que el modelo recuerda de listas genéricas en inglés: prioriza variedad de década, región y estudio.
- Ejes de exploración (al menos 2 candidatos deben encajar claramente con cada eje): (1) ${gameExplorationAxes[0] || "nicho mecánico distinto"} (2) ${gameExplorationAxes[1] || "época o plataforma distinta"}.`
      : "";
  const cineTmdbSpainRules = targetCategory === "cine" ? `\n${PROMPT_TMDB_SPAIN_CINE_TITLE_RULE}` : "";
  const prompt = `Eres un recomendador cultural.
Obra base:
- category: ${category}
- title: ${title}
- creator: ${creator || "(desconocido)"}
- mediaType (solo cine): ${mediaType || "(desconocido)"}
- genres: ${genres || "(sin géneros)"}
- description: ${description || "(sin descripción)"}

Devuelve SOLO JSON válido, sin markdown:
{"candidates":[{"category":"cine","title":"Nombre exacto","creator":"opcional"}, ...]}

Reglas:
- category exactamente uno de: cine, musica, literatura, videojuegos, arte-visual
- category objetivo para TODAS las recomendaciones: ${targetCategory}
- Devuelve entre ${wantedCount} y ${wantedCount + 1} candidatos.
- Prioriza obras muy parecidas en estilo/tema/tono a la obra base.
- Usa también el contexto de creator y description para evitar obras con mismo título pero de otra obra distinta.
- NO incluyas la misma obra base ni variaciones mínimas del mismo título.
- Si category es cine y mediaType es "movie" o "series", devuelve SOLO ese mismo tipo (no mezclar película con serie).
- Cuando sea posible, incluye creator en cine, musica y literatura para mejorar la validación.
- En cine, si un título es ambiguo (misma palabra para película y serie u homónimos), NO lo pongas sin creator/director: o incluye creator, o elige otra obra que puedas anclar.
- Si una sugerencia no se puede respaldar con director/creador ni con el tono/plot coherente con la descripción base, sustitúyela por otra recomendación.
- Usa títulos reales y buscables en APIs públicas.${cineTmdbSpainRules}${gameVarietyRules}`;

  let text;
  try {
    text = await agent.generateWithGemini(prompt, {
      purpose: "recomendaciones similares por obra",
      timeoutMs: 35000,
    });
  } catch (ex) {
    logger.error("recommend_similar: fallo Gemini", ex);
    const detail = formatExceptionForClient(ex);
    const err = new Error(`No se pudieron generar recomendaciones similares. ${detail}`);
    err.statusCode = 503;
    throw err;
  }

  const m = text && text.match(/\{[\s\S]*\}/);
  if (!m) return { candidates: [], reason: "bad_model_json" };

  let parsed;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return { candidates: [], reason: "json_error" };
  }

  const rawList = parsed?.candidates;
  if (!Array.isArray(rawList)) return { candidates: [], reason: "no_candidates" };
  const cleaned = normalizeWorkCandidateRows(rawList, wantedCount + 2).filter(
    (row) => String(row?.category || "").trim().toLowerCase() === targetCategory
  );
  logIaRecommendedWorks("recommend_similar", {
    id: `${category}:${title.slice(0, 120)}`,
    works: cleaned,
  });
  return { candidates: cleaned };
}

module.exports = { recommendSimilarWorks };
