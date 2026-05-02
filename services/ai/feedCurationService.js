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

const CATEGORY_RULE_BLOCKS = [
  { heading: "VIDEOJUEGOS", rules: GAME_RULES },
  { heading: "MÚSICA", rules: MUSIC_RULES },
  { heading: "CINE", rules: CINEMA_RULES },
  { heading: "LITERATURA", rules: LITERATURE_RULES },
  { heading: "ARTE-VISUAL", rules: VISUAL_ART_RULES },
];

/** @returns {[string, number][]} pares [clave_es, valor] para prompts de faceta */
function spanishOceanDimensionsFromTotals(totals) {
  return [
    ["apertura", Number(totals.o) || 0],
    ["responsabilidad", Number(totals.c) || 0],
    ["extraversion", Number(totals.e) || 0],
    ["amabilidad", Number(totals.a) || 0],
    ["neuroticismo", Number(totals.n) || 0],
  ];
}

function dominantFacetFromDimensions(dimensions) {
  const sorted = [...dimensions].sort((a, b) => b[1] - a[1]);
  const [key, value] = sorted[0] || ["no_disponible", 0];
  return { key, value };
}

function formatCategoryRuleSections(dimKeys) {
  return CATEGORY_RULE_BLOCKS.map(
    ({ heading, rules }) =>
      `- Reglas para ${heading} (aplican según nivel actual por faceta):\n${dimKeys
        .map((k) => `  - ${rules[k]}`)
        .join("\n")}`
  ).join("\n");
}

function buildCompactFacetPrompt(dimensions, dominantFacet) {
  const dimKeys = dimensions.map(([key]) => key);
  const dimLines = dimensions.map(([key, value]) => {
    const detail = scoreDetailBand(value);
    const current = Number(value || 0).toFixed(2);
    const rule = FACET_PROMPT_RULES[key]?.[detail] || FACET_PROMPT_RULES[key]?.media || "";
    return `- ${key}: ${current} (${FACET_DETAIL_LABELS[detail] || detail}) => ${rule}`;
  });

  return `Traducción OCEAN compacta y dinámica (OBLIGATORIO):
${dimLines.join("\n")}
- Faceta dominante: ${dominantFacet?.key || "no_disponible"} (${(dominantFacet?.value || 0).toFixed(2)}), tratarla SIEMPRE como ALTA y prioritaria.
${formatCategoryRuleSections(dimKeys)}
- Aplica esta lógica a la vibra general (mecánicas, loop, ritmo, dificultad, agencia, narrativa y tono), no solo estética visual.
- Distingue media-baja de media-alta y evita recomendaciones clónicas entre usuarios.`;
}

const KEY_SUBFACET_SPECS = [
  ["openness", "imagination", "Apertura/imaginación"],
  ["conscientiousness", "orderliness", "Responsabilidad/meticulosidad"],
  ["conscientiousness", "perfectionism", "Responsabilidad/perfeccionismo"],
  ["extraversion", "sociability", "Extraversión/sociabilidad"],
  ["agreeableness", "empathy", "Amabilidad/empatía"],
  ["neuroticism", "calmness", "Neuroticismo/calma"],
];

function collectKeySubfacetLines(scores) {
  return KEY_SUBFACET_SPECS.map(([traitKey, facetKey, label]) =>
    formatFacetLine(scores, traitKey, facetKey, label)
  ).filter(Boolean);
}

function buildOceanFacetInterpretation(scores, totals) {
  const dimensions = spanishOceanDimensionsFromTotals(totals);
  const dominantFacet = dominantFacetFromDimensions(dimensions);
  const keySubfacets = collectKeySubfacetLines(scores);
  const compactRules = buildCompactFacetPrompt(dimensions, dominantFacet);
  return { compactRules, keySubfacets };
}

const MECHANICAL_LINE_BY_BAND = {
  c: {
    alta:
      "Responsabilidad ALTA: prioriza sistemas complejos, metódicos y obras con estructuras arquitectónicas (diseño, precisión, lógica interna).",
    baja:
      "Responsabilidad BAJA: prioriza energía cruda, improvisación y ruptura de reglas sin forzar rigidez formal.",
    media:
      "Responsabilidad MEDIA: alterna orden y libertad; evita solo obras hiperclásicas o solo caos extremo.",
  },
  n: {
    alta:
      'Neuroticismo ALTO: prioriza alta resolución emocional y catarsis (vulnerabilidad, tensión psicológica), no solo "obras tristes" genéricas.',
    baja: "Neuroticismo BAJO: puedes incluir obras serenas y reguladoras sin forzar melodrama constante.",
    media:
      "Neuroticismo MEDIO: mezcla tensión afectiva moderada con respiros; evita un solo registro emocional.",
  },
};

function mechanicalCurationLines(c, n) {
  const bc = scoreBand(c);
  const bn = scoreBand(n);
  return [MECHANICAL_LINE_BY_BAND.c[bc], MECHANICAL_LINE_BY_BAND.n[bn]];
}

/** Qué NO saturar según banda OCEAN (complementa las directrices positivas). */
const NEGATIVE_ANTIPATTERNS = {
  o: {
    alta:
      "Apertura ALTA: NO llenes la lista solo con remakes, blockbusters de fórmula o \"obras raras\" vacías sin sustancia; la rareza debe ir acompañada de intención clara.",
    baja:
      "Apertura BAJA: NO fuerces vanguardia ilegible, metaficción constante ni formalismo extremo como mayoría; respeta necesidad de anclas narrativas o melódicas.",
    media:
      "Apertura MEDIA: NO polarices todo entre catálogo mainstream y experimentación inaccesible; evita el cliché de mezcla \"de manual\" sin matices.",
  },
  c: {
    alta:
      "Responsabilidad ALTA: NO propongas como eje obras caóticas sin sistema, sin reglas internas ni progresión comprensible en la mayoría de entradas.",
    baja:
      "Responsabilidad BAJA: NO satures de simulación milimétrica, puzzles ultra-rígidos o narrativas hiper-controladas sin respiradero creativo.",
    media:
      "Responsabilidad MEDIA: NO caigas en \"solo orden\" o \"solo caos\"; evita listas que ignoren el equilibrio entre método y libertad.",
  },
  e: {
    alta:
      "Extraversión ALTA: NO te quedes solo en íntimo, lento y de baja estimulación social en la mayoría de candidatos; evita monotonía contemplativa.",
    baja:
      "Extraversión BAJA: NO priorices solo multijugador ruidoso, maximalismo social o alto bombardeo performativo sin pausas introspectivas.",
    media:
      "Extraversión MEDIA: NO uses solo un registro (fiesta continua o ermitaño total); alterna mal la escala social.",
  },
  a: {
    alta:
      "Amabilidad ALTA: NO abuses de crueldad gratuita, humillación voyerista, cinismo fácil ni conflictos resueltos solo con sarcasmo duro.",
    baja:
      "Amabilidad BAJA: NO rellenes con fábulas edulcoradas, moralina ingenua ni arcos de redención forzada y complacientes en exceso.",
    media:
      "Amabilidad MEDIA: NO homogeneices todo a \"bondad light\" ni todo a fricción cínica; evita tono único en toda la tanda.",
  },
  n: {
    alta:
      "Neuroticismo ALTO: NO suavices el feed a catálogo solo \"zen/bienestar\" ni trivialices emociones fuertes con soluciones genéricas.",
    baja:
      "Neuroticismo BAJO: NO conviertas la lista en maratón de tragedia, terror psicológico o ansiedad constante sin respiros reguladores.",
    media:
      "Neuroticismo MEDIO: NO mezcles solo melodrama barato ni solo frialdad emocional; evita ausencia de arco afectivo creíble.",
  },
};

function negativeCurationLines(o, c, e, a, n) {
  return [
    NEGATIVE_ANTIPATTERNS.o[scoreBand(o)],
    NEGATIVE_ANTIPATTERNS.c[scoreBand(c)],
    NEGATIVE_ANTIPATTERNS.e[scoreBand(e)],
    NEGATIVE_ANTIPATTERNS.a[scoreBand(a)],
    NEGATIVE_ANTIPATTERNS.n[scoreBand(n)],
  ];
}

function entropyBucketCounts(targetTotal) {
  const safe = Math.round(targetTotal * 0.2);
  const niche = Math.round(targetTotal * 0.5);
  return { safe, niche, risk: targetTotal - safe - niche };
}

function formatSubfacetBlockForPrompt(keySubfacets) {
  if (!keySubfacets.length) {
    return "   (sin subfacetas numéricas; infiere con cuidado desde los totales OCEAN.)";
  }
  return keySubfacets.map((line) => `   ${line}`).join("\n");
}

function buildArtisticProfileExtra(artisticProfile) {
  if (!artisticProfile || typeof artisticProfile !== "object") return "";
  const prof = String(artisticProfile.profile || "").trim();
  const desc = String(artisticProfile.description || "").trim().slice(0, 500);
  return `\nPerfil artístico existente: ${prof}\n${desc}\n`;
}

function diversityPromptSalt() {
  return Math.random().toString(36).substring(2, 10);
}

function feedEntityIdFromOceanResult(oceanResult) {
  if (!oceanResult || typeof oceanResult !== "object") return undefined;
  return oceanResult.entityId != null ? oceanResult.entityId : oceanResult.entity_id;
}

function buildPersonalizedFeedCuratorPrompt({
  o,
  c,
  e,
  a,
  n,
  oceanFingerprint,
  artExtra,
  rulesText,
  facetInterpretation,
  keySubfacets,
}) {
  const { safe: nEntropySafe, niche: nEntropyNiche, risk: nEntropyRisk } = entropyBucketCounts(
    TARGET_CANDIDATES
  );
  const subfacetBlock = formatSubfacetBlockForPrompt(keySubfacets);
  const mechanicalLines = mechanicalCurationLines(c, n);
  const negativeLines = negativeCurationLines(o, c, e, a, n);
  const diversitySalt = diversityPromptSalt();

  return `Eres un Curador Cultural de élite y un psicólogo experimental. Tu objetivo es generar una lista de descubrimiento radicalmente personalizada (sesgo a rareza y nicho real, sin alucinar títulos inexistentes).

### PERFIL PSICOMÉTRICO (INPUT)
- OCEAN: O:${o.toFixed(2)}, C:${c.toFixed(2)}, E:${e.toFixed(2)}, A:${a.toFixed(2)}, N:${n.toFixed(2)}
- Huella: ${oceanFingerprint}
${artExtra}
### DIFERENCIACIÓN POR PERFIL (OBLIGATORIO)
- ${rulesText}

### DIRECTRICES DE CURACIÓN (ROMPER CONVERGENCIA)
1) NO CLÁSICOS OBVIOS: evita blockbuster de manual, sagas ultra citadas y "listas de todo el mundo" (p. ej. Inception, The Witcher, Radiohead, 1984, GOT, etc.) salvo que la Apertura del usuario sea muy baja (< 2.5). Si Apertura > 3.5, incluye culto, sellos independientes, cine de autor contemporáneo u obras de long tail verificables.
2) SUBFACETAS: no uses solo el rasgo global; cruza decisiones con estas subfacetas:
${subfacetBlock}
3) REGLA DE ENTROPÍA: genera exactamente ${TARGET_CANDIDATES} candidatos repartidos en cinco categorías (cine, musica, literatura, videojuegos, arte-visual), con ~10–14 por categoría si encaja el perfil.
   - ${nEntropySafe} obras "seguras" (alto encaje OCEAN, popularidad media).
   - ${nEntropyNiche} obras de nicho (alto encaje, baja popularidad / indie / autor).
   - ${nEntropyRisk} "apuestas de riesgo" (desafían al usuario pero encajan en apertura o neuroticismo del perfil).
4) LÓGICA MECÁNICA (NO SOLO ESTÉTICA):
${mechanicalLines.map((x) => `   - ${x}`).join("\n")}

### LO QUE NO DEBES SATURAR (ANTI-PATRONES POR ESTE PERFIL)
Estas líneas son negativas: no las uses como estilo dominante del feed; equilíbralas con lo que sí encaja.
${negativeLines.map((x) => `   - ${x}`).join("\n")}

### REGLAS ESPECÍFICAS POR CATEGORÍA Y FACETA
${facetInterpretation}

### CONTEXTO TÉCNICO
No hay búsqueda web: usa solo conocimiento del modelo. Títulos y autores deben ser reales y buscables.

### FORMATO DE SALIDA (JSON ESTRICTO)
Devuelve SOLO un objeto JSON:
{"candidates":[{"category":"cine|musica|literatura|videojuegos|arte-visual","title":"Título original","creator":"Autor/Director/Estudio","genreHint":"Subgénero hiper-específico (ej. post-punk báltico, slow cinema distópico)","oceanFitReason":"Breve vínculo con un rasgo o subfaceta concreta del usuario"}]}

### NOTA FINAL
Si entregas la misma tanda que a un usuario promedio, el sistema falla. Sé específico y prioriza joyas ocultas coherentes con OCEAN.
Random seed diversidad (no repetir sesgo entre llamadas): ${diversitySalt}
`;
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
  const { compactRules: facetInterpretation, keySubfacets } = buildOceanFacetInterpretation(scores, {
    o,
    c,
    e,
    a,
    n,
  });

  const webUsed = false;
  const artExtra = buildArtisticProfileExtra(artisticProfile);
  const prompt = buildPersonalizedFeedCuratorPrompt({
    o,
    c,
    e,
    a,
    n,
    oceanFingerprint,
    artExtra,
    rulesText: profileDrivenRules.rulesText,
    facetInterpretation,
    keySubfacets,
  });

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
      userId: String(feedEntityIdFromOceanResult(oceanResult) || ""),
    });
    if (Array.isArray(vectorReranked) && vectorReranked.length) {
      cleaned = vectorReranked;
    }
  } catch (_) {
    // Fallback silencioso: si embeddings falla, se conserva flujo actual.
  }

  const feedEntityId = feedEntityIdFromOceanResult(oceanResult);
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
