const { buildArtisticWebContext } = require("./webSearch");
const {
  formatExceptionForClient,
  traitTotal,
  buildDeepSubfacetsBlock,
  buildProfileDrivenCurationRules,
  buildOceanFingerprint,
  normalizeGenreRecommendations,
  genreSpecificityMetrics,
  normalizeProfileDescription,
  normalizeSuggestedWorksByGenre,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
  GENRE_REC_KEYS,
} = require("./agentUtils");

async function generateArtisticDescription(agent, oceanResult, options = {}, deps = {}) {
  const logger = deps.logger || console;
  const logIaRecommendedWorks = deps.logIaRecommendedWorks || (() => {});

  const userId =
    options.userId != null && String(options.userId).trim()
      ? String(options.userId).trim()
      : "";
  const regenerationSeed =
    options.regenerationSeed != null ? String(options.regenerationSeed).trim() : "";

  const scores = oceanResult.scores;
  if (!scores || typeof scores !== "object") {
    logger.warn("generateArtisticDescription: scores inválidos");
    const err = new Error("Resultados OCEAN no válidos");
    err.statusCode = 400;
    throw err;
  }

  const o = traitTotal(scores, "openness");
  const c = traitTotal(scores, "conscientiousness");
  const e = traitTotal(scores, "extraversion");
  const a = traitTotal(scores, "agreeableness");
  const n = traitTotal(scores, "neuroticism");
  const oceanFingerprint = buildOceanFingerprint(scores);
  const testType = oceanResult.testType;
  const profileDrivenRules = buildProfileDrivenCurationRules({
    o,
    c,
    e,
    a,
    n,
    fingerprint: oceanFingerprint,
  });

  if (!agent.configured()) {
    const err = new Error(
      "GEMINI_API_KEY no está configurada; no hay descripción artística sin el modelo."
    );
    err.statusCode = 503;
    throw err;
  }

  const sub = testType === "deep" ? buildDeepSubfacetsBlock(scores) : "";
  const [webBlock, webSearchUsedArtistic] = await buildArtisticWebContext(
    o,
    c,
    e,
    a,
    n,
    testType,
    sub ? sub.slice(0, 400) : ""
  );
  logger.info(
    "artistic_description: web_context_chars=%s web_used=%s",
    (webBlock || "").length,
    webSearchUsedArtistic
  );

  const descriptionGuidelines = `Descripción (campo "description") para TODOS los tests:
- Debe ser UN SOLO RESUMEN (1 párrafo), claro y directo.
- Extensión objetivo: 70 a 120 palabras.
- Debe conectar rasgos OCEAN con preferencias culturales probables.
- No repetir puntuaciones numéricas ni listas largas.
- No usar subtítulos, viñetas ni markdown.
- No mencionar "test", "evaluación", "resultado" ni diagnósticos clínicos.`;

  const toneAndLanguageRules = `Lenguaje y estilo (OBLIGATORIO):
- Español natural, contemporáneo, sin tecnicismos innecesarios.
- Evita adjetivos vacíos y frases grandilocuentes.
- Debe sonar útil para recomendar cultura, no como informe académico.`;

  const variationBlock = regenerationSeed
    ? `- Semilla de regeneración: ${regenerationSeed}. Elige una combinación distinta de obras ancla (suggestedWorks) respecto a otras ejecuciones con la misma huella; prioriza títulos distintos siempre que sigan siendo coherentes con el perfil y con genreRecommendations.`
    : "- Primera generación o sin semilla: elige obras ancla variadas, menos obvias y coherentes con el perfil.";

  const prompt = `Actúa como analista psicométrico-cultural de alta precisión.
Tu tarea es:
1) Crear un perfil artístico breve en "profile".
2) Inferir GÉNEROS / estilos / movimientos por ámbito cultural en "genreRecommendations" (sin nombres de obras en ese objeto).
3) Proponer OBRAS CONCRETAS ancla en "suggestedWorks" (reales, buscables en TMDB, Spotify, Google Books, IGDB o museos), alineadas con el perfil, con "description" y con los géneros declarados en genreRecommendations.

${variationBlock}

Perfil numérico (0-5):
- Apertura ${Number(o).toFixed(2)}, Responsabilidad ${Number(c).toFixed(2)}, Extraversión ${Number(e).toFixed(2)}, Amabilidad ${Number(a).toFixed(2)}, Neuroticismo ${Number(n).toFixed(2)}

${sub}
Reglas de diferenciación entre perfiles (OBLIGATORIO):
- ${profileDrivenRules.rulesText}

Fragmentos web (títulos y listas; prioriza obras que aparezcan aquí si encajan con OCEAN):
${webBlock || "(Sin resultados web: prioriza obras menos obvias pero fieles al perfil; evita caer en los mismos títulos universales.)"}

En tu razonamiento interno (no lo escribas): elige 10-16 obras reales mezclando categorías; que cada categoría tenga al menos una obra coherente con los géneros que pusiste para ese ámbito.

${descriptionGuidelines}

${toneAndLanguageRules}

Objetivo de escritura de la descripción:
- Entregar una síntesis breve y útil para descubrir cultura.
- Prioriza claridad y aplicabilidad sobre profundidad técnica.
- Conecta la personalidad con posibles intereses en tipos de obras, géneros, atmósferas y formatos.

Campo "genreRecommendations" (obligatorio):
- Debe incluir EXACTAMENTE estas claves: "cine", "musica", "literatura", "videojuegos", "arte-visual".
- Cada clave: array de 3 a 6 strings con GÉNEROS, subgéneros, estilos, movimientos o tipos de experiencia.
- Evita etiquetas genéricas de una sola palabra ("drama", "comedia", "rock", "novela", "arte"); usa formulaciones más precisas y distintivas.
- Al menos 70% de los elementos deben ser de dos o más palabras.
- NO pongas títulos de obras ni nombres de artistas dentro de genreRecommendations; solo géneros/estilos.
- Debe derivarse del perfil OCEAN actual y ser coherente con "description".

Responde SOLO JSON válido, sin markdown:
{
  "profile": "nombre corto del perfil artístico",
  "description": "texto en español que cumpla estrictamente las reglas anteriores",
  "genreRecommendations": {
    "cine": ["género o estilo 1", "género o estilo 2"],
    "musica": ["..."],
    "literatura": ["..."],
    "videojuegos": ["..."],
    "arte-visual": ["..."]
  },
  "suggestedWorks": [
    {"category":"cine","title":"Título exacto buscable","creator":"director o autor opcional","genreHint":"uno de los géneros exactos declarados en genreRecommendations.cine"}
  ]
}`;

  let text;
  try {
    text = await agent.generateWithGemini(prompt, {
      purpose: "descripción artística",
      timeoutMs: 55000,
      generationConfig: { temperature: 1.0, topP: 0.95, topK: 40 },
    });
  } catch (ex) {
    logger.error("artistic_description: fallo Gemini", ex);
    const detail = formatExceptionForClient(ex);
    const err = new Error(`No se pudo generar la descripción con el modelo de IA. ${detail}`);
    err.statusCode = 503;
    err.cause = ex;
    throw err;
  }

  const m = text && text.match(/\{[\s\S]*\}/);
  if (!m) {
    const err = new Error("El modelo no devolvió un JSON reconocible. Vuelve a intentarlo.");
    err.statusCode = 502;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(m[0]);
  } catch (ex) {
    const err = new Error(`El modelo devolvió JSON inválido: ${ex.message}`);
    err.statusCode = 502;
    throw err;
  }

  const profile = String(parsed.profile || "").trim();
  const description = normalizeProfileDescription(parsed.description);
  if (!profile || !description) {
    const err = new Error("La respuesta del modelo está incompleta (falta profile o description).");
    err.statusCode = 502;
    throw err;
  }

  if (parsed.recommendations != null && !Array.isArray(parsed.recommendations)) {
    const err = new Error("El campo recommendations debe ser una lista.");
    err.statusCode = 502;
    throw err;
  }
  if (parsed.recommendations == null) parsed.recommendations = [];

  const genresNorm = normalizeGenreRecommendations(parsed.genreRecommendations);
  const missingGenreKeys = GENRE_REC_KEYS.filter((k) => !genresNorm[k] || genresNorm[k].length < 1);
  if (missingGenreKeys.length) {
    const err = new Error(`La respuesta del modelo incompleta en genreRecommendations: ${missingGenreKeys.join(", ")}`);
    err.statusCode = 502;
    throw err;
  }

  const genreMetrics = genreSpecificityMetrics(genresNorm);
  const genericRatio = genreMetrics.total > 0 ? genreMetrics.genericCount / genreMetrics.total : 1;
  logger.info(
    "[dreamlodge][ia_profile] genre_specificity userId=%s total=%s generic=%s specific=%s genericRatio=%s",
    userId || "(anon)",
    genreMetrics.total,
    genreMetrics.genericCount,
    genreMetrics.specificCount,
    genericRatio.toFixed(2)
  );
  if (genericRatio > 0.3) {
    if (!options._retryGenreSpecificity) {
      return generateArtisticDescription(agent, oceanResult, {
        ...options,
        regenerationSeed: regenerationSeed || `auto-genre-specific-${Date.now().toString(36)}`,
        _retryGenreSpecificity: true,
      }, deps);
    }
    const err = new Error("genreRecommendations demasiado genérico; se requiere mayor especificidad por perfil.");
    err.statusCode = 502;
    throw err;
  }

  parsed.genreRecommendations = genresNorm;
  parsed.suggestedWorks = Array.isArray(parsed.suggestedWorks)
    ? normalizeSuggestedWorksByGenre(parsed.suggestedWorks, parsed.genreRecommendations, 20)
    : [];

  const defaultCanonOverlap = countDefaultCanonOverlap(parsed.suggestedWorks, profileDrivenRules.avoidTitles);
  const globalCanonOverlap = countGlobalCanonOverlap(parsed.suggestedWorks);
  logger.info(
    "[dreamlodge][ia_profile] overlap_checks userId=%s fingerprint=%s avoidOverlap=%s globalOverlap=%s works=%s",
    userId || "(anon)",
    oceanFingerprint,
    defaultCanonOverlap,
    globalCanonOverlap,
    parsed.suggestedWorks.length
  );

  logIaRecommendedWorks("artistic_description", { id: userId || undefined, works: parsed.suggestedWorks });
  logger.info(
    "[dreamlodge][ia_obras] artistic_description_meta userId=%s fingerprint=%s testType=%s seed=%s",
    userId || "(anon)",
    oceanFingerprint,
    testType || "?",
    regenerationSeed || "-"
  );
  return parsed;
}

module.exports = { generateArtisticDescription };
