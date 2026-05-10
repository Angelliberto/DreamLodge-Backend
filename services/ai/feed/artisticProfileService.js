const {
  formatExceptionForClient,
  traitTotal,
  buildDeepSubfacetsBlock,
  buildProfileDrivenCurationRules,
  buildOceanFingerprint,
  normalizeProfileDescription,
  normalizeWorkCandidateRows,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
  PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
  oceanScoresToCanonicalLikert,
  DEFAULT_OCEAN_SCORE_METRIC,
  oceanLikertTraitBand,
} = require("../../../utils/ai/agentUtils");

function buildCompactOceanGuidance(totals) {
  const oBand = oceanLikertTraitBand(totals.o);
  const cBand = oceanLikertTraitBand(totals.c);
  const eBand = oceanLikertTraitBand(totals.e);
  const aBand = oceanLikertTraitBand(totals.a);
  const nBand = oceanLikertTraitBand(totals.n);
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
- Que la descripción explique tono y estilos de descubrimiento en prosa natural, sin objetos género-etiqueta separados del texto.
- Evita copiar literalmente reglas largas de curación; aquí solo define orientación general del perfil.`;
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

  const rawScores = oceanResult.scores;
  if (!rawScores || typeof rawScores !== "object") {
    logger.warn("generateArtisticDescription: scores inválidos");
    const err = new Error("Resultados OCEAN no válidos");
    err.statusCode = 400;
    throw err;
  }

  const scoreMetric =
    oceanResult.scoreMetric === "ipip_mean_1_5"
      ? "ipip_mean_1_5"
      : DEFAULT_OCEAN_SCORE_METRIC;
  const scores = oceanScoresToCanonicalLikert(rawScores, scoreMetric);

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
- Extensión objetivo: 170 a 260 palabras.
- Debe conectar rasgos OCEAN con preferencias culturales probables.
- Debe incluir matices sobre ritmo, tono, complejidad, tipo de narrativa y forma de descubrimiento cultural.
- Estructura obligatoria dentro del párrafo: primero explica cómo es la personalidad; después conecta esa explicación con lo que le puede gustar.
- Usa una transición causal natural tipo: "por eso", "por lo que", "esto hace que te encaje".
- No repetir puntuaciones numéricas ni listas largas.
- No usar subtítulos, viñetas ni markdown.
- No mencionar "test", "evaluación", "resultado" ni diagnósticos clínicos.
- Enfoca la redacción como una orientación personal (posibilidades y tendencias), no como una verdad cerrada.`;

  const toneAndLanguageRules = `Lenguaje y estilo (OBLIGATORIO):
- Español natural, contemporáneo, sin tecnicismos innecesarios.
- Evita adjetivos vacíos y frases grandilocuentes.
- Debe sonar útil para recomendar cultura, no como informe académico.
- Usa lenguaje cotidiano: frases simples, cercanas y fáciles de entender.
- Evita tono tajante o absoluto (por ejemplo, evita "eres", "siempre", "nunca"); prefiere "podrías", "sueles", "te puede encajar".`;

  const variationBlock = regenerationSeed
    ? `- Semilla de regeneración: ${regenerationSeed}. Elige una combinación distinta de obras ancla (suggestedWorks) respecto a otras ejecuciones con la misma huella; prioriza títulos distintos siempre que sigan siendo coherentes con el perfil y con la descripción.`
    : "- Primera generación o sin semilla: elige obras ancla variadas, menos obvias y coherentes con el perfil.";

  const prompt = `Actúa como guía psicométrico-cultural orientado a recomendación.
Tu tarea es:
1) Usar exactamente "Análisis de personalidad" en "profile" (no inventes otro nombre).
2) Proponer OBRAS CONCRETAS ancla en "suggestedWorks" (reales, buscables en TMDB, Spotify, Google Books, IGDB o museos), alineadas con el perfil y con "description".
${PROMPT_TMDB_SPAIN_CINE_TITLE_RULE}

${variationBlock}

Perfil numérico — medias Likert 1–5 por rasgo (ítems recodificados al estilo IPIP/Mini-IPIP; 1 = muy bajo en el rasgo, 5 = muy alto):
- Apertura ${Number(o).toFixed(2)}, Responsabilidad ${Number(c).toFixed(2)}, Extraversión ${Number(e).toFixed(2)}, Amabilidad ${Number(a).toFixed(2)}, Neuroticismo ${Number(n).toFixed(2)}

${sub}
Reglas de diferenciación entre perfiles (OBLIGATORIO):
- ${profileDrivenRules.rulesText}
${detailedOceanGuidance}

Contexto: no se usa búsqueda web externa. Prioriza obras menos obvias pero fieles al perfil; evita caer en los mismos títulos universales entre distintos usuarios con OCEAN parecido (especialmente en música y videojuegos: dispersa año, país/escena, sello/indie vs blockbuster).

En tu razonamiento interno (no lo escribas): elige 10-16 obras reales mezclando categorías; que cada categoría tenga al menos una obra coherente con los rasgos más distintivos del perfil (no solo uno). En música y videojuegos, fuerza mayoría fuera del pack de GOTY/streaming repetido; alterna épocas y estudios/región.

En música y videojuegos: suggestedWorks debe sentirse anclado al perfil (tono, ritmo, complejidad); evita justificaciones cliché intercambiables entre usuarios; no fuerces enumerar rasgos si el encaje es claro.

${descriptionGuidelines}

${toneAndLanguageRules}

Objetivo de escritura de la descripción:
- Entregar una síntesis extensa y útil para descubrir cultura.
- Prioriza claridad y aplicabilidad, con mayor riqueza de contexto.
- Conecta la personalidad con posibles intereses en tipos de obras, géneros, atmósferas y formatos.
- Mantén un tono acompañante: orienta, sugiere y propone caminos de exploración.
- Patrón recomendado de redacción: "tiendes a ser X en Y, por lo que te puede gustar Z".

Campo "suggestedWorks" (obligatorio):
- Mezcla categorías: cine, musica, literatura, videojuegos, arte-visual.
- Cada entrada: category, title, creator (opcional), genreHint (subgénero o matiz concreto coherente con la obra y el párrafo description, 1–4 palabras útiles).

Responde SOLO JSON válido, sin markdown:
{
  "profile": "Análisis de personalidad",
  "description": "texto en español que cumpla estrictamente las reglas anteriores",
  "suggestedWorks": [
    {"category":"cine","title":"Título en español de España (TMDB es-ES) si aplica","creator":"director o autor opcional","genreHint":"matiz concreto (ej. drama psicológico europeo)"}
  ]
}`;

  console.log(
    `[dreamlodge] PROMPT DESCRIPCIÓN ARTÍSTICA (test OCEAN) → IA | user=${userId || "anon"} | fp=${oceanFingerprint} | ${prompt.length} chars\n${prompt}`
  );

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

  const profile = "Análisis de personalidad";
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

  parsed.suggestedWorks = Array.isArray(parsed.suggestedWorks)
    ? normalizeWorkCandidateRows(parsed.suggestedWorks, 20)
    : [];
  delete parsed.genreRecommendations;

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
