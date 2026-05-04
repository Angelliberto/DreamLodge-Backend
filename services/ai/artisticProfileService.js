const {
  formatExceptionForClient,
  traitTotal,
  buildDeepSubfacetsBlock,
  buildProfileDrivenCurationRules,
  buildOceanFingerprint,
  normalizeGenreRecommendations,
  genreSpecificityMetrics,
  genreNaturalnessMetrics,
  normalizeProfileDescription,
  normalizeSuggestedWorksByGenre,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
  GENRE_REC_KEYS,
  PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
} = require("./agentUtils");

function scoreBand(v) {
  const n = Number(v) || 0;
  if (n >= 3.8) return "alta";
  if (n <= 2.2) return "baja";
  return "media";
}

function buildCompactOceanGuidance(totals) {
  const oBand = scoreBand(totals.o);
  const cBand = scoreBand(totals.c);
  const eBand = scoreBand(totals.e);
  const aBand = scoreBand(totals.a);
  const nBand = scoreBand(totals.n);
  const dimensionRows = [
    { key: "apertura", value: Number(totals.o) || 0 },
    { key: "responsabilidad", value: Number(totals.c) || 0 },
    { key: "extraversion", value: Number(totals.e) || 0 },
    { key: "amabilidad", value: Number(totals.a) || 0 },
    { key: "neuroticismo", value: Number(totals.n) || 0 },
  ];
  const dominantFacet = [...dimensionRows].sort((x, y) => y.value - x.value)[0];
  return `Guía OCEAN compacta (sin repetir lógica de curación):
- Apertura ${oBand}, Responsabilidad ${cBand}, Extraversión ${eBand}, Amabilidad ${aBand}, Neuroticismo ${nBand}.
- Faceta dominante: ${dominantFacet?.key || "no_disponible"} (${(dominantFacet?.value || 0).toFixed(2)}), úsala como señal principal.
- Deriva géneros simples y útiles desde esta señal, sin listas rebuscadas ni hiper-específicas.
- Evita copiar literalmente reglas largas de curación; aquí solo define orientación general del perfil.`;
}

function simplifyGenreLabel(raw) {
  const text = String(raw || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const words = text.split(" ").slice(0, 3);
  return words.join(" ");
}

function simplifyGenreRecommendations(raw) {
  const norm = normalizeGenreRecommendations(raw);
  const out = {};
  for (const key of GENRE_REC_KEYS) {
    const list = Array.isArray(norm[key]) ? norm[key] : [];
    const seen = new Set();
    const simplified = [];
    for (const item of list) {
      const label = simplifyGenreLabel(item);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      simplified.push(label);
      if (simplified.length >= 4) break;
    }
    out[key] = simplified.slice(0, 4);
  }
  return out;
}

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
  const detailedOceanGuidance = buildCompactOceanGuidance({ o, c, e, a, n });

  if (!agent.configured()) {
    const err = new Error(
      "GEMINI_API_KEY no está configurada; no hay descripción artística sin el modelo."
    );
    err.statusCode = 503;
    throw err;
  }

  const sub = testType === "deep" ? buildDeepSubfacetsBlock(scores) : "";

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
2) Inferir GÉNEROS base por ámbito cultural en "genreRecommendations" (sin nombres de obras en ese objeto).
3) Proponer OBRAS CONCRETAS ancla en "suggestedWorks" (reales, buscables en TMDB, Spotify, Google Books, IGDB o museos), alineadas con el perfil, con "description" y con los géneros declarados en genreRecommendations.
${PROMPT_TMDB_SPAIN_CINE_TITLE_RULE}

${variationBlock}

Perfil numérico (0-5):
- Apertura ${Number(o).toFixed(2)}, Responsabilidad ${Number(c).toFixed(2)}, Extraversión ${Number(e).toFixed(2)}, Amabilidad ${Number(a).toFixed(2)}, Neuroticismo ${Number(n).toFixed(2)}

${sub}
Reglas de diferenciación entre perfiles (OBLIGATORIO):
- ${profileDrivenRules.rulesText}
${detailedOceanGuidance}

Contexto: no se usa búsqueda web externa. Prioriza obras menos obvias pero fieles al perfil; evita caer en los mismos títulos universales.

En tu razonamiento interno (no lo escribas): elige 10-16 obras reales mezclando categorías; que cada categoría tenga al menos una obra coherente con la descripción del perfil. En videojuegos, alterna épocas de lanzamiento y familias de plataforma; no agrupes varias obras solo en lo más popular o reciente del mercado.

${descriptionGuidelines}

${toneAndLanguageRules}

Objetivo de escritura de la descripción:
- Entregar una síntesis breve y útil para descubrir cultura.
- Prioriza claridad y aplicabilidad sobre profundidad técnica.
- Conecta la personalidad con posibles intereses en tipos de obras, géneros, atmósferas y formatos.

Campo "genreRecommendations" (obligatorio):
- Debe incluir EXACTAMENTE estas claves: "cine", "musica", "literatura", "videojuegos", "arte-visual".
- Cada clave: array de 2 a 4 strings, simples y útiles.
- Longitud por etiqueta: 1 a 3 palabras (ej. "drama psicológico", "indie narrativo", "synth pop").
- Evita etiquetas rebuscadas, compuestas en exceso o demasiado abstractas.
- NO pongas títulos de obras ni nombres de artistas dentro de genreRecommendations; solo géneros/estilos.
- Debe derivarse del perfil OCEAN actual y ser coherente con "description".
- No repitas aquí la lógica de curación detallada; usa este campo solo como resumen de orientación.

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
    {"category":"cine","title":"Título en español de España (TMDB es-ES) si aplica","creator":"director o autor opcional","genreHint":"uno de los géneros exactos declarados en genreRecommendations.cine"}
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

  const genresNorm = simplifyGenreRecommendations(parsed.genreRecommendations);
  const missingGenreKeys = GENRE_REC_KEYS.filter((k) => !genresNorm[k] || genresNorm[k].length < 1);
  if (missingGenreKeys.length) {
    const err = new Error(`La respuesta del modelo incompleta en genreRecommendations: ${missingGenreKeys.join(", ")}`);
    err.statusCode = 502;
    throw err;
  }

  const genreMetrics = genreSpecificityMetrics(genresNorm);
  const genericRatio = genreMetrics.total > 0 ? genreMetrics.genericCount / genreMetrics.total : 1;
  const naturalness = genreNaturalnessMetrics(genresNorm);
  const overengineeredRatio =
    naturalness.total > 0 ? naturalness.overengineeredCount / naturalness.total : 0;
  logger.info(
    "[dreamlodge][ia_profile] genre_specificity userId=%s total=%s generic=%s specific=%s genericRatio=%s overengineeredRatio=%s",
    userId || "(anon)",
    genreMetrics.total,
    genreMetrics.genericCount,
    genreMetrics.specificCount,
    genericRatio.toFixed(2),
    overengineeredRatio.toFixed(2)
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
  if (overengineeredRatio > 0.35) {
    if (!options._retryGenreNaturalness) {
      return generateArtisticDescription(
        agent,
        oceanResult,
        {
          ...options,
          regenerationSeed:
            regenerationSeed || `auto-genre-natural-${Date.now().toString(36)}`,
          _retryGenreNaturalness: true,
        },
        deps
      );
    }
    const err = new Error("genreRecommendations demasiado rebuscado; se requiere lenguaje más natural.");
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
