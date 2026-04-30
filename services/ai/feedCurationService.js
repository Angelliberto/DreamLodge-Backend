const { buildCuratorContextFromSerper } = require("./webSearch");
const {
  buildUserProfileText,
  rerankByEmbeddingSimilarity,
} = require("./vectorRetriever");
const {
  formatExceptionForClient,
  traitTotal,
  buildProfileDrivenCurationRules,
  buildOceanFingerprint,
  normalizeWorkCandidateRows,
  normalizeTitleForCompare,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
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

const FACET_DETAIL_LABELS = {
  "muy-baja": "muy-baja",
  baja: "baja",
  "media-baja": "media-baja",
  "media-alta": "media-alta",
  alta: "alta",
  "muy-alta": "muy-alta",
};

const FACET_PROMPT_RULES = {
  apertura: {
    "muy-baja": "lenguaje claro, estructura lineal, simbolismo mínimo y entrada inmediata.",
    baja: "base familiar con narrativa clara y baja ambiguedad.",
    "media-baja": "base familiar con una capa de rareza controlada.",
    "media-alta": "exploración formal moderada con ambiguedad legible.",
    alta: "propuesta experimental, simbólica y no lineal.",
    "muy-alta": "riesgo formal extremo, ruptura de convenciones y alta abstracción.",
  },
  responsabilidad: {
    "muy-baja": "caos intencional, improvisación y ruptura fuerte de reglas.",
    baja: "energía cruda y progresión flexible con poco apego a método.",
    "media-baja": "alterna orden y desorden con foco en sorpresa.",
    "media-alta": "estructura clara con libertad parcial y reto medio.",
    alta: "precisión formal, patrones, lógica y consistencia sistémica.",
    "muy-alta": "optimización, mastery, alta exigencia de método y control.",
  },
  extraversion: {
    "muy-baja": "intimista, contemplativo y de baja estimulación social.",
    baja: "escala pequeña, ritmo lento y foco interno.",
    "media-baja": "social selectivo con energía contenida.",
    "media-alta": "mezcla introspección con picos sociales moderados.",
    alta: "energía social alta, ritmo dinámico y alta interacción.",
    "muy-alta": "máxima expresividad social y alto impulso performativo.",
  },
  amabilidad: {
    "muy-baja": "fricción moral intensa, ironía dura y personajes ásperos.",
    baja: "conflicto interpersonal y decisiones moralmente grises.",
    "media-baja": "empatía selectiva con tensión narrativa.",
    "media-alta": "calidez parcial con conflicto moderado.",
    alta: "cooperación, ternura, cuidado y esperanza.",
    "muy-alta": "prosocialidad extrema, reconciliación y soporte emocional.",
  },
  neuroticismo: {
    "muy-baja": "serenidad alta, regulación emocional firme y atmósfera estable.",
    baja: "calma, foco y baja reactividad emocional.",
    "media-baja": "sensibilidad moderada con control afectivo.",
    "media-alta": "vulnerabilidad mayor y tensión psicológica recurrente.",
    alta: "catarsis emocional marcada e intensidad afectiva.",
    "muy-alta": "alta carga emocional, ansiedad dramática y picos afectivos.",
  },
};

const GAME_RULES = {
  apertura:
    "Apertura: baja=experiencias claras; media-baja=fórmula conocida con twist; media-alta=mundos inventivos moderados; alta/muy-alta=diseño experimental y narrativa no convencional.",
  responsabilidad:
    "Responsabilidad: baja=sandbox/caos; media-baja=progresión flexible; media-alta=loops estructurados con objetivos claros; alta/muy-alta=estrategia, simulación, puzzle complejo y mastery.",
  extraversion:
    "Extraversión: baja=single-player íntimo; media-baja=social opcional; media-alta=mixto solo-social; alta/muy-alta=multijugador de alta interacción.",
  amabilidad:
    "Amabilidad: baja=conflicto duro; media-baja=tensión ética con empatía parcial; media-alta=cooperación parcial; alta/muy-alta=cooperación, soporte y comunidad prosocial.",
  neuroticismo:
    "Neuroticismo: baja=ritmo estable y bajo estrés; media-baja=tensión controlada; media-alta=intensidad con respiros; alta/muy-alta=survival/psicológico y catarsis.",
};

const MUSIC_RULES = {
  apertura:
    "Apertura: baja=estructura tradicional y melodía clara; media-baja=alternativo accesible; media-alta=híbridos y texturas menos obvias; alta/muy-alta=experimental, avant-pop o ambient abstracto.",
  responsabilidad:
    "Responsabilidad: baja=crudeza espontánea; media-baja=groove flexible; media-alta=producción cuidada con libertad; alta/muy-alta=arreglos meticulosos y composición compleja.",
  extraversion:
    "Extraversión: baja=íntimo/acústico; media-baja=energía media; media-alta=alternancia introspectiva-bailable; alta/muy-alta=alta energía, himnos y performance social.",
  amabilidad:
    "Amabilidad: baja=letra filosa/irónica; media-baja=ambivalencia; media-alta=calidez con tensión; alta/muy-alta=empatía, ternura y unión.",
  neuroticismo:
    "Neuroticismo: baja=calma reguladora; media-baja=melancolía suave; media-alta=tensión emocional notable; alta/muy-alta=catarsis intensa y vulnerabilidad explícita.",
};

const CINEMA_RULES = {
  apertura:
    "Apertura: baja=narrativa clásica y legible; media-baja=convención con giro; media-alta=lenguaje visual más arriesgado; alta/muy-alta=estructura no lineal y apuesta autoral.",
  responsabilidad:
    "Responsabilidad: baja=energía cruda e impredecible; media-baja=ritmo flexible; media-alta=estructura sólida con libertad; alta/muy-alta=guion preciso, montaje metódico y diseño formal.",
  extraversion:
    "Extraversión: baja=drama íntimo y foco interno; media-baja=social contenido; media-alta=balance intimidad-espectáculo; alta/muy-alta=dinamismo colectivo y alto pulso social.",
  amabilidad:
    "Amabilidad: baja=fricción moral y personajes ásperos; media-baja=empatía selectiva; media-alta=humanidad con tensión; alta/muy-alta=calidez, cooperación y reparación.",
  neuroticismo:
    "Neuroticismo: baja=tono estable y regulado; media-baja=melancolía controlada; media-alta=tensión psicológica frecuente; alta/muy-alta=catarsis emocional intensa.",
};

const LITERATURE_RULES = {
  apertura:
    "Apertura: baja=prosa clara y lineal; media-baja=forma clásica con innovación leve; media-alta=capas simbólicas moderadas; alta/muy-alta=experimentación formal y ambigüedad rica.",
  responsabilidad:
    "Responsabilidad: baja=voz espontánea y borde caótico; media-baja=estructura flexible; media-alta=arquitectura narrativa coherente; alta/muy-alta=estructura precisa, lógica interna y alta densidad de diseño.",
  extraversion:
    "Extraversión: baja=introspección profunda; media-baja=escala interpersonal contenida; media-alta=alterna mundo interno y social; alta/muy-alta=novelas corales y alta interacción social.",
  amabilidad:
    "Amabilidad: baja=cinismo, ironía y conflicto ético duro; media-baja=ambivalencia afectiva; media-alta=empatía parcial; alta/muy-alta=compasión, vínculos y cuidado.",
  neuroticismo:
    "Neuroticismo: baja=serenidad reflexiva; media-baja=tensión leve y controlada; media-alta=vulnerabilidad psicológica marcada; alta/muy-alta=intensidad emocional y catarsis.",
};

const VISUAL_ART_RULES = {
  apertura:
    "Apertura: baja=figuración accesible; media-baja=lenguaje tradicional con desviaciones; media-alta=abstracción parcial y concepto moderado; alta/muy-alta=alto riesgo conceptual y ruptura estética.",
  responsabilidad:
    "Responsabilidad: baja=gestualidad cruda y caos expresivo; media-baja=orden parcial; media-alta=composición clara con libertad; alta/muy-alta=geometría, precisión técnica y control compositivo.",
  extraversion:
    "Extraversión: baja=obra íntima y contemplativa; media-baja=presencia social discreta; media-alta=equilibrio entre introspección y exhibición; alta/muy-alta=obra performativa, pública e inmersiva.",
  amabilidad:
    "Amabilidad: baja=fricción política/moral y aspereza visual; media-baja=ambivalencia afectiva; media-alta=calidez moderada; alta/muy-alta=humanismo, ternura y cooperación simbólica.",
  neuroticismo:
    "Neuroticismo: baja=atmósfera estable y reguladora; media-baja=melancolía contenida; media-alta=tensión expresiva constante; alta/muy-alta=descarga emocional intensa.",
};

function buildCompactFacetPrompt({ scores, totals, dominantFacet, keySubfacets }) {
  const dimensions = [
    ["apertura", totals.o],
    ["responsabilidad", totals.c],
    ["extraversion", totals.e],
    ["amabilidad", totals.a],
    ["neuroticismo", totals.n],
  ];

  const dimLines = dimensions.map(([key, value]) => {
    const detail = scoreDetailBand(value);
    const current = Number(value || 0).toFixed(2);
    const rule = FACET_PROMPT_RULES[key]?.[detail] || FACET_PROMPT_RULES[key]?.media || "";
    return `- ${key}: ${current} (${FACET_DETAIL_LABELS[detail] || detail}) => ${rule}`;
  });

  const dimKeys = dimensions.map(([key]) => key);
  const gameLines = dimKeys.map((key) => `  - ${GAME_RULES[key]}`).join("\n");
  const musicLines = dimKeys.map((key) => `  - ${MUSIC_RULES[key]}`).join("\n");
  const cinemaLines = dimKeys.map((key) => `  - ${CINEMA_RULES[key]}`).join("\n");
  const literatureLines = dimKeys.map((key) => `  - ${LITERATURE_RULES[key]}`).join("\n");
  const visualArtLines = dimKeys.map((key) => `  - ${VISUAL_ART_RULES[key]}`).join("\n");

  return `Traducción OCEAN compacta y dinámica (OBLIGATORIO):
${dimLines.join("\n")}
- Subfacetas clave:
${keySubfacets.length ? keySubfacets.map((x) => `  - ${x}`).join("\n") : "  - (sin subfacetas disponibles en este perfil)"}
- Faceta dominante: ${dominantFacet?.key || "no_disponible"} (${(dominantFacet?.value || 0).toFixed(2)}), tratarla SIEMPRE como ALTA y prioritaria.
- Reglas para VIDEOJUEGOS (aplican según nivel actual por faceta):
${gameLines}
- Reglas para MÚSICA (aplican según nivel actual por faceta):
${musicLines}
- Reglas para CINE (aplican según nivel actual por faceta):
${cinemaLines}
- Reglas para LITERATURA (aplican según nivel actual por faceta):
${literatureLines}
- Reglas para ARTE-VISUAL (aplican según nivel actual por faceta):
${visualArtLines}
- Aplica esta lógica a la vibra general (mecánicas, loop, ritmo, dificultad, agencia, narrativa y tono), no solo estética visual.
- Distingue media-baja de media-alta y evita recomendaciones clónicas entre usuarios.`;
}

function buildOceanFacetInterpretation(scores, totals) {
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
  return buildCompactFacetPrompt({
    scores,
    totals,
    dominantFacet,
    keySubfacets,
  });
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
    artExtra = `\nPerfil artístico existente: ${prof}\n${desc}\n`;
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
Haz recomendaciones más arriesgadas (menos obvias/mainstream) SIEMPRE que mantengan fidelidad al perfil OCEAN y al perfil artístico textual.
Riesgo controlado: la exploración debe respetar rasgos y subfacetas OCEAN, no depender de listas de géneros predefinidas.
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

  try {
    const userProfileText = buildUserProfileText({
      o,
      c,
      e,
      a,
      n,
      artisticProfile: {
        profile: artisticProfile?.profile,
        description: artisticProfile?.description,
      },
      oceanFingerprint,
    });
    const vectorReranked = await rerankByEmbeddingSimilarity({
      agent,
      userProfileText,
      candidates: cleaned,
      maxScan: 90,
      logger,
      userId: String(
        oceanResult.entityId != null ? oceanResult.entityId : oceanResult.entity_id || ""
      ),
    });
    if (Array.isArray(vectorReranked) && vectorReranked.length) {
      cleaned = vectorReranked;
    }
  } catch (_) {
    // Fallback silencioso: si embeddings falla, se conserva flujo actual.
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
