const { buildCuratorContextFromSerper } = require("./webSearch");
const {
  formatExceptionForClient,
  traitTotal,
  buildProfileDrivenCurationRules,
  buildOceanFingerprint,
  normalizeSuggestedWorksByGenre,
  normalizeWorkCandidateRows,
  normalizeTitleForCompare,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
  GENRE_REC_KEYS,
} = require("./agentUtils");

const RECENT_FEED_TITLES = new Map();
const RECENT_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_KEEP = 40;
const TARGET_CANDIDATES = 60;

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
  return `${label}: ${v.toFixed(2)} (${scoreBand(v)})`;
}

function buildOceanFacetInterpretation(scores, totals) {
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

  const keySubfacets = [
    formatFacetLine(scores, "openness", "imagination", "Apertura/imaginación"),
    formatFacetLine(scores, "conscientiousness", "orderliness", "Responsabilidad/meticulosidad"),
    formatFacetLine(scores, "conscientiousness", "perfectionism", "Responsabilidad/perfeccionismo"),
    formatFacetLine(scores, "extraversion", "sociability", "Extraversión/sociabilidad"),
    formatFacetLine(scores, "agreeableness", "empathy", "Amabilidad/empatía"),
    formatFacetLine(scores, "neuroticism", "calmness", "Neuroticismo/calma"),
  ].filter(Boolean);
  const oDetail = scoreDetailBand(totals.o);
  const cDetail = scoreDetailBand(totals.c);
  const eDetail = scoreDetailBand(totals.e);
  const aDetail = scoreDetailBand(totals.a);
  const nDetail = scoreDetailBand(totals.n);

  return `Traducción OCEAN a estilo de recomendación (obligatorio):
- APERTURA (actual: ${oBand})
  - baja: lenguaje claro, estructura lineal, símbolos mínimos, conflicto comprensible, curva de entrada rápida.
  - media-baja: base familiar con 1 capa de rareza (giro formal o temático) sin romper legibilidad.
  - media-alta: exploración evidente de forma/idea, ambigüedad controlada, capas interpretativas accesibles.
  - alta: experimental, simbólico, no lineal, riesgo estético alto, propuestas conceptuales y mundos raros.
- RESPONSABILIDAD (actual: ${cBand})
  - baja: caos intencional, energía cruda, improvisación, fricción y ruptura de reglas.
  - media-baja: alterna orden y desorden, progresión flexible, foco en sorpresa más que precisión.
  - media-alta: estructura clara con momentos de libertad, diseño coherente, reto moderado y lógica parcial.
  - alta: precisión formal, patrones, puzzles, optimización, consistencia sistémica, diseño elegante y metódico.
- EXTRAVERSIÓN (actual: ${eBand})
  - baja: intimista, contemplativo, escala pequeña, ritmo lento, foco interno.
  - media-baja: social selectivo, tono cálido pero reservado, baja sobreestimulación.
  - media-alta: alterna introspección con picos sociales/energéticos, dinamismo moderado.
  - alta: energía social intensa, ritmo alto, performance, celebración colectiva, impulso expresivo.
- AMABILIDAD (actual: ${aBand})
  - baja: conflicto moral, ironía dura, tensión interpersonal, personajes ásperos y decisiones difíciles.
  - media-baja: empatía selectiva, ambivalencia ética, calidez limitada con fricción narrativa.
  - media-alta: cooperación parcial, humanidad visible con tensión dramática moderada.
  - alta: calidez humana, cooperación, ternura, reconciliación, cuidado y esperanza.
- NEUROTICISMO (actual: ${nBand})
  - baja: serenidad, estabilidad, foco, atmósferas limpias, regulación emocional sostenida.
  - media-baja: sensibilidad moderada con control, intensidad dosificada y cierre relativamente estable.
  - media-alta: mayor vulnerabilidad, tensión psicológica frecuente, catarsis parcial.
  - alta: catarsis emocional intensa, alta vulnerabilidad, ansiedad/drama psicológico y picos afectivos.
- Intensidad fina por rango (para evitar perfiles clónicos):
  - Apertura ${Number(totals.o || 0).toFixed(2)} => ${oDetail}
  - Responsabilidad ${Number(totals.c || 0).toFixed(2)} => ${cDetail}
  - Extraversión ${Number(totals.e || 0).toFixed(2)} => ${eDetail}
  - Amabilidad ${Number(totals.a || 0).toFixed(2)} => ${aDetail}
  - Neuroticismo ${Number(totals.n || 0).toFixed(2)} => ${nDetail}
- Subfacetas a priorizar para afinar la selección:
${keySubfacets.length ? keySubfacets.map((x) => `  - ${x}`).join("\n") : "  - (sin subfacetas disponibles en este perfil)"}

Regla crítica:
- NO uses solo 'alto/bajo' de forma genérica.
- Convierte cada faceta en tono/estructura/energía concretos al proponer obras.
- La traducción OCEAN aplica a la vibra general de la obra, no solo a la estética visual.
- En videojuegos considera también mecánicas, loop de juego, ritmo, dificultad, agencia del jugador, narrativa y tono emocional.
- Si hay test profundo con subfacetas, recomienda también en función de CADA subfaceta relevante (no solo por el total de la dimensión).
- Para cada subfaceta alta/media/baja, traduce el nivel a decisiones concretas de curaduría (tono, estructura, ritmo, complejidad, tipo de experiencia).
- Distingue explícitamente media-baja vs media-alta en dimensiones y subfacetas; NO las trates igual.
- Da prioridad a subfacetas con mayor puntuación y evita contradicciones con subfacetas claramente bajas.
- Faceta dominante del usuario: ${dominantFacet?.key || "no_disponible"} (${(dominantFacet?.value || 0).toFixed(2)}). Trátala SIEMPRE como ALTA y úsala como prioridad principal de curaduría.
- Usa combinaciones de rasgos (no reglas aisladas): cada candidato debe reflejar al menos 2 dimensiones + 1 subfaceta.
- Si dos usuarios comparten solo el nivel global (ej. media), usa diferencias de subfacetas y rango fino para separar recomendaciones.
- Evita listas genéricas repetibles entre usuarios: cambia subgénero, época, país, formato, pacing y densidad conceptual según el perfil exacto.
- Apertura baja/media/alta: usa respectivamente formatos familiares, mezcla exploración moderada, o propuestas experimentales.
- Responsabilidad baja/media/alta: usa respectivamente caos espontáneo, equilibrio estructura-libertad, o precisión lógica/puzzles.
- Extraversión baja/media/alta: usa respectivamente intimidad contemplativa, balance social-introspectivo, o energía social alta.
- Amabilidad baja/media/alta: usa respectivamente conflicto e ironía, equilibrio tensión-calidez, o calidez cooperativa.
- Neuroticismo baja/media/alta: usa respectivamente serenidad estable, contraste emocional moderado, o catarsis/intensidad emocional.
- Si Responsabilidad/meticulosidad es baja, prioriza propuestas con estética caótica o desordenada.
- Si Responsabilidad/meticulosidad es media, prioriza equilibrio: obras híbridas (parte estructuradas y parte libres), con complejidad moderada y narrativa clara con giros.
- Si Responsabilidad/perfeccionismo o meticulosidad es alta, prioriza obras de precisión, lógica y puzzles.`;
}

function getRecentTitlesForUser(userId) {
  const key = String(userId || "").trim();
  if (!key) return new Set();
  const row = RECENT_FEED_TITLES.get(key);
  if (!row || Date.now() - row.ts > RECENT_TTL_MS) {
    RECENT_FEED_TITLES.delete(key);
    return new Set();
  }
  return new Set(Array.isArray(row.titles) ? row.titles : []);
}

function saveRecentTitlesForUser(userId, works) {
  const key = String(userId || "").trim();
  if (!key) return;
  const prev = getRecentTitlesForUser(key);
  const next = [];
  for (const w of works || []) {
    const t = normalizeTitleForCompare(w?.title || "");
    if (t) next.push(t);
  }
  const merged = [...new Set([...next, ...Array.from(prev)])].slice(0, RECENT_KEEP);
  RECENT_FEED_TITLES.set(key, { ts: Date.now(), titles: merged });
}

function reorderByNovelty(candidates, recentTitles) {
  if (!Array.isArray(candidates) || !candidates.length || !recentTitles?.size) return candidates || [];
  return [...candidates].sort((a, b) => {
    const aSeen = recentTitles.has(normalizeTitleForCompare(a?.title || "")) ? 1 : 0;
    const bSeen = recentTitles.has(normalizeTitleForCompare(b?.title || "")) ? 1 : 0;
    return aSeen - bSeen;
  });
}

function mergePreferredCandidates(preferred, fallback, maxItems = 24) {
  const out = [];
  const seen = new Set();
  const pushRow = (row) => {
    if (!row || typeof row !== "object") return;
    const key = `${String(row.category || "").trim().toLowerCase()}|${normalizeTitleForCompare(
      row.title || ""
    )}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  };

  for (const row of preferred || []) pushRow(row);
  for (const row of fallback || []) pushRow(row);
  return out.slice(0, maxItems);
}

async function curatePersonalizedFeed(agent, oceanResult, artisticProfile, deps = {}) {
  const logger = deps.logger || console;
  const logIaRecommendedWorks = deps.logIaRecommendedWorks || (() => {});

  const scores = oceanResult.scores;
  if (!scores || typeof scores !== "object") {
    return { candidates: [], webSearchUsed: false, reason: "no_ocean_scores" };
  }
  if (!agent.configured()) {
    return { candidates: [], webSearchUsed: false, reason: "no_gemini" };
  }

  const o = traitTotal(scores, "openness");
  const c = traitTotal(scores, "conscientiousness");
  const e = traitTotal(scores, "extraversion");
  const a = traitTotal(scores, "agreeableness");
  const n = traitTotal(scores, "neuroticism");
  const oceanFingerprint = buildOceanFingerprint(scores);
  const profileDrivenRules = buildProfileDrivenCurationRules({ o, c, e, a, n, fingerprint: oceanFingerprint });
  const facetInterpretation = buildOceanFacetInterpretation(scores, { o, c, e, a, n });

  const personalityLine = `openness ${o.toFixed(1)} conscientiousness ${c.toFixed(1)} extraversion ${e.toFixed(1)} agreeableness ${a.toFixed(1)} neuroticism ${n.toFixed(1)}`;
  const [webBlock, webUsed] = await buildCuratorContextFromSerper(personalityLine);

  let artExtra = "";
  if (artisticProfile && typeof artisticProfile === "object") {
    const prof = String(artisticProfile.profile || "").trim();
    const desc = String(artisticProfile.description || "").trim().slice(0, 500);
    const gr = artisticProfile.genreRecommendations;
    let genreLine = "";
    if (gr && typeof gr === "object") {
      genreLine = GENRE_REC_KEYS.map((k) => {
        const arr = gr[k];
        if (!Array.isArray(arr) || !arr.length) return null;
        return `${k}: ${arr.filter(Boolean).map(String).join(", ")}`;
      }).filter(Boolean).join(" | ");
    }
    artExtra = `\nPerfil artístico existente: ${prof}\n${desc}\n${genreLine ? `${genreLine}\n` : ""}`;
  }
  const prompt = `Eres curador cultural para una app de descubrimiento.
Perfil OCEAN: Apertura ${o.toFixed(2)}, Responsabilidad ${c.toFixed(2)}, Extraversión ${e.toFixed(2)}, Amabilidad ${a.toFixed(2)}, Neuroticismo ${n.toFixed(2)}
Huella del perfil: ${oceanFingerprint}
${artExtra}
Reglas de diferenciación:
- ${profileDrivenRules.rulesText}
${facetInterpretation}
Fragmentos web:
${webBlock || "(Sin resultados web: NO te limites a clásicos obvios; prioriza ajuste fino por subgénero, tono y rasgos OCEAN del usuario.)"}
Genera exactamente ${TARGET_CANDIDATES} candidatos mezclando categorías, equilibrando cine/música/literatura/videojuegos/arte-visual.
Mínimo 10 candidatos por categoría cuando sea posible.
Haz recomendaciones más arriesgadas (menos obvias/mainstream) SIEMPRE que mantengan fidelidad al perfil OCEAN y a genreRecommendations.
Riesgo controlado: la exploración debe ocurrir dentro de los subgéneros del perfil, no fuera de ellos.
Evita converger en títulos repetidos entre usuarios salvo encaje excepcional.
Devuelve SOLO JSON: {"candidates":[{"category":"cine","title":"...","creator":"...","genreHint":"..."}]}
`;

  let text;
  try {
    text = await agent.generateWithGemini(prompt, {
      purpose: "curación feed personalizado",
      timeoutMs: 55000,
      generationConfig: { temperature: 0.95, topP: 0.92, topK: 32 },
    });
  } catch (ex) {
    logger.error("curate_feed: fallo Gemini", ex);
    const detail = formatExceptionForClient(ex);
    const err = new Error(`No se pudo curar el feed con el modelo. ${detail}`);
    err.statusCode = 503;
    throw err;
  }

  const m = text && text.match(/\{[\s\S]*\}/);
  if (!m) return { candidates: [], webSearchUsed: webUsed, reason: "bad_model_json" };

  let parsed;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return { candidates: [], webSearchUsed: webUsed, reason: "json_error" };
  }

  const rawList = parsed.candidates;
  if (!Array.isArray(rawList)) return { candidates: [], webSearchUsed: webUsed, reason: "no_candidates" };

  let cleaned = normalizeWorkCandidateRows(rawList, TARGET_CANDIDATES);
  const genreRecs = artisticProfile?.genreRecommendations;
  if (genreRecs && typeof genreRecs === "object") {
    const aligned = normalizeSuggestedWorksByGenre(rawList, genreRecs, TARGET_CANDIDATES);
    const combined = mergePreferredCandidates(aligned, cleaned, TARGET_CANDIDATES);
    const alignedRatio = cleaned.length > 0 ? aligned.length / cleaned.length : 0;
    logger.info(
      "[dreamlodge][feed] genre_alignment raw=%s aligned=%s alignedRatio=%s merged=%s",
      Array.isArray(rawList) ? rawList.length : 0,
      aligned.length,
      alignedRatio.toFixed(2),
      combined.length
    );
    cleaned = combined;
  }

  const feedEntityId = oceanResult.entityId != null ? oceanResult.entityId : oceanResult.entity_id;
  const recentTitles = getRecentTitlesForUser(feedEntityId);
  const reordered = reorderByNovelty(cleaned, recentTitles);
  if (recentTitles.size) {
    logger.info(
      "[dreamlodge][feed] novelty_reorder fingerprint=%s before=%s after=%s recent=%s",
      oceanFingerprint,
      cleaned.length,
      reordered.length,
      recentTitles.size
    );
  }
  cleaned = reordered;

  const overlapAvoid = countDefaultCanonOverlap(cleaned, profileDrivenRules.avoidTitles);
  const overlapGlobal = countGlobalCanonOverlap(cleaned);
  logger.info(
    "[dreamlodge][feed] overlap_checks fingerprint=%s avoidOverlap=%s globalOverlap=%s candidates=%s",
    oceanFingerprint,
    overlapAvoid,
    overlapGlobal,
    cleaned.length
  );

  logIaRecommendedWorks("feed_personalized", {
    id: feedEntityId != null ? String(feedEntityId) : undefined,
    works: cleaned,
  });
  saveRecentTitlesForUser(feedEntityId, cleaned);
  return { candidates: cleaned, webSearchUsed: webUsed };
}

module.exports = { curatePersonalizedFeed };
