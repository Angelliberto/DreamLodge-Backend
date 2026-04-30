const { buildArtisticWebContext } = require("./webSearch");
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
} = require("./agentUtils");

function scoreBand(v) {
  const n = Number(v) || 0;
  if (n >= 3.8) return "alta";
  if (n <= 2.2) return "baja";
  return "media";
}

function scoreDetailBand(v) {
  const n = Number(v) || 0;
  if (n < 1.8) return "muy-baja";
  if (n <= 2.2) return "baja";
  if (n < 3.0) return "media-baja";
  if (n < 3.8) return "media-alta";
  if (n < 4.4) return "alta";
  return "muy-alta";
}

function facetValue(scores, traitKey, facetKey) {
  const trait = scores?.[traitKey];
  if (!trait || typeof trait !== "object") return null;
  const raw = trait[facetKey];
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatFacetLine(scores, traitKey, facetKey, label) {
  const v = facetValue(scores, traitKey, facetKey);
  if (v == null) return null;
  return `${label}: ${v.toFixed(2)} (${scoreDetailBand(v)})`;
}

function buildDetailedOceanGuidance(scores, totals) {
  const oBand = scoreBand(totals.o);
  const cBand = scoreBand(totals.c);
  const eBand = scoreBand(totals.e);
  const aBand = scoreBand(totals.a);
  const nBand = scoreBand(totals.n);
  const oDetail = scoreDetailBand(totals.o);
  const cDetail = scoreDetailBand(totals.c);
  const eDetail = scoreDetailBand(totals.e);
  const aDetail = scoreDetailBand(totals.a);
  const nDetail = scoreDetailBand(totals.n);
  const dimensionRows = [
    { key: "apertura", value: Number(totals.o) || 0 },
    { key: "responsabilidad", value: Number(totals.c) || 0 },
    { key: "extraversion", value: Number(totals.e) || 0 },
    { key: "amabilidad", value: Number(totals.a) || 0 },
    { key: "neuroticismo", value: Number(totals.n) || 0 },
  ];
  const dominantFacet = [...dimensionRows].sort((x, y) => y.value - x.value)[0];
  const keySubfacets = [
    formatFacetLine(scores, "openness", "imagination", "Apertura/imaginación"),
    formatFacetLine(scores, "conscientiousness", "orderliness", "Responsabilidad/meticulosidad"),
    formatFacetLine(scores, "conscientiousness", "perfectionism", "Responsabilidad/perfeccionismo"),
    formatFacetLine(scores, "extraversion", "sociability", "Extraversión/sociabilidad"),
    formatFacetLine(scores, "agreeableness", "empathy", "Amabilidad/empatía"),
    formatFacetLine(scores, "neuroticism", "calmness", "Neuroticismo/calma"),
  ].filter(Boolean);

  return `Guía OCEAN detallada para derivar géneros y obras (OBLIGATORIO):
- APERTURA (actual ${oBand}):
  - baja: formatos familiares y narrativa clara.
  - media-baja: base accesible con una capa de exploración.
  - media-alta: exploración formal moderada y ambigüedad controlada.
  - alta: propuestas experimentales, simbólicas y no lineales.
- RESPONSABILIDAD (actual ${cBand}):
  - baja: vibra caótica/espontánea, fricción y crudeza.
  - media-baja: alternancia orden/desorden con sorpresa.
  - media-alta: estructura clara con libertad parcial.
  - alta: precisión formal, lógica, patrones, puzzle y método.
- EXTRAVERSIÓN (actual ${eBand}):
  - baja: intimista, contemplativa, ritmo lento.
  - media-baja: social selectivo, energía contenida.
  - media-alta: mezcla introspección + picos sociales.
  - alta: energía social alta, performance, ritmo dinámico.
- AMABILIDAD (actual ${aBand}):
  - baja: conflicto, ironía, aristas morales.
  - media-baja: empatía selectiva y tensión.
  - media-alta: calidez con conflicto moderado.
  - alta: cooperación, ternura, cuidado y esperanza.
- NEUROTICISMO (actual ${nBand}):
  - baja: estabilidad emocional, calma y foco.
  - media-baja: sensibilidad moderada y regulación.
  - media-alta: mayor vulnerabilidad y tensión psicológica.
  - alta: catarsis e intensidad emocional marcada.
- Intensidad fina:
  - Apertura ${Number(totals.o || 0).toFixed(2)} => ${oDetail}
  - Responsabilidad ${Number(totals.c || 0).toFixed(2)} => ${cDetail}
  - Extraversión ${Number(totals.e || 0).toFixed(2)} => ${eDetail}
  - Amabilidad ${Number(totals.a || 0).toFixed(2)} => ${aDetail}
  - Neuroticismo ${Number(totals.n || 0).toFixed(2)} => ${nDetail}
- Faceta dominante: ${dominantFacet?.key || "no_disponible"} (${(dominantFacet?.value || 0).toFixed(2)}), tratarla SIEMPRE como ALTA y prioritaria.
- Subfacetas guía para afinado:
${keySubfacets.length ? keySubfacets.map((x) => `  - ${x}`).join("\n") : "  - (sin subfacetas disponibles en este perfil)"}
- No usar reglas aisladas: combina al menos 2 dimensiones + 1 subfaceta por recomendación.
- Distingue media-baja de media-alta: no las trates igual.
- Aplica esta lógica a la vibra general de la experiencia, no solo a estética visual (en videojuegos: mecánicas, loop, dificultad, agencia, narrativa y tono).`;
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
  const detailedOceanGuidance = buildDetailedOceanGuidance(scores, { o, c, e, a, n });

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
${detailedOceanGuidance}

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
- Al menos 60% de los elementos pueden tener dos o más palabras, pero mantén lenguaje natural y común en crítica cultural.
- Evita etiquetas rebuscadas o artificiales (demasiados adjetivos encadenados, mezclas forzadas, símbolos raros).
- Longitud recomendada por etiqueta: 2 a 4 palabras.
- NO pongas títulos de obras ni nombres de artistas dentro de genreRecommendations; solo géneros/estilos.
- Debe derivarse del perfil OCEAN actual y ser coherente con "description".
- Debe reflejar explícitamente diferencias entre media-baja y media-alta en cada dimensión.
- Si hay subfacetas (test deep), cada categoría debe incorporar señales de subfacetas altas y evitar contradicciones con subfacetas bajas.

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
