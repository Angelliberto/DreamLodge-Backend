const {
  PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
  oceanLikertTraitBand,
  IPIP_LIKERT_BAND_HIGH_GE,
  IPIP_LIKERT_BAND_LOW_LT,
} = require("../../../utils/ai/agentUtils");

/** Misma banda alta/media/baja que buildProfileDrivenCurationRules (agentUtils). */
const scoreBand = oceanLikertTraitBand;

function scoreDetailBand(v) {
  const n = Number(v) || 0;
  if (n < 1.8) return "muy-baja";
  if (n <= 2.2) return "baja";
  if (n < 3.0) return "media-baja";
  if (n < 3.8) return "media-alta";
  if (n < 4.4) return "alta";
  return "muy-alta";
}

function oceanMeansLikertParts(o, c, e, a, n) {
  return [o, c, e, a, n].map((x) => Number(x || 0).toFixed(2));
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

// Calibración de matiz por faceta + banda. No son repertorio final.
const FACET_CINEMA_EXAMPLES = {
  apertura: {
    "muy-baja":
      "The King's Speech — biopic clásico; Hidden Figures — estructura inspiracional clara; Green Book — drama de fórmula legible.",
    baja:
      "The Social Network — narrativa accesible con estilo; Spotlight — periodismo lineal sólido; Argo — thriller clásico eficaz.",
    "media-baja":
      "Whiplash — intensidad formal accesible; Ex Machina — sci-fi de ideas con ancla narrativa; Prisoners — tensión controlada.",
    "media-alta":
      "Arrival — sci-fi emocional no lineal moderada; Her — intimidad conceptual; Enemy — ambigüedad legible.",
    alta:
      "Synecdoche, New York — estructura fractal; Mulholland Drive — ambigüedad autoral; Holy Motors — metamorfosis formal.",
    "muy-alta":
      "Last Year at Marienbad — ruptura temporal extrema; Dog Star Man — vanguardia abstracta; Inland Empire — deriva narrativa radical.",
  },
  responsabilidad: {
    "muy-baja":
      "Mad Max (1979) — energía cruda; Clerks — improvisación expresiva; Enter the Void — deriva sensorial.",
    baja:
      "Spring Breakers — caos pop; Uncut Gems — ansiedad desbordada; Trainspotting — pulso desordenado con identidad.",
    "media-baja":
      "Birdman — virtuosismo flexible; Good Time — urgencia con control parcial; Drive — orden estético con impulso.",
    "media-alta":
      "Zodiac — método y tensión; Michael Clayton — estructura precisa con respiración; Children of Men — planificación inmersiva.",
    alta:
      "The Godfather — arquitectura narrativa rigurosa; Parasite — precisión de guion/montaje; The Prestige — diseño mecánico.",
    "muy-alta":
      "2001: A Space Odyssey — control formal total; A Separation — precisión dramática extrema; Army of Shadows — ejecución metódica.",
  },
  extraversion: {
    "muy-baja":
      "Columbus — contemplación íntima; Paterson — baja estimulación social; Winter Light — interioridad extrema.",
    baja:
      "Aftersun — memoria íntima; Manchester by the Sea — escala emocional contenida; First Reformed — aislamiento moral.",
    "media-baja":
      "Lost in Translation — social mínimo; Carol — intimidad relacional; In the Mood for Love — vínculo contenido.",
    "media-alta":
      "La La Land — intimidad y espectáculo; Frances Ha — pulso social moderado; The Worst Person in the World — alternancia social-interna.",
    alta:
      "The Grand Budapest Hotel — dinamismo coral; Knives Out — interacción constante; Little Miss Sunshine — energía grupal.",
    "muy-alta":
      "Everything Everywhere All at Once — maximalismo expresivo; Babylon — hiperestímulo social; Climax — intensidad colectiva total.",
  },
  amabilidad: {
    "muy-baja":
      "Nightcrawler — cinismo extremo; Funny Games — fricción moral dura; There Will Be Blood — dureza relacional.",
    baja:
      "Gone Girl — conflicto áspero; No Country for Old Men — frialdad ética; The Lobster — ironía cruel.",
    "media-baja":
      "Blue Valentine — empatía rota; Marriage Story — fricción humana intensa; Incendies — afecto bajo tensión.",
    "media-alta":
      "Minari — cuidado con conflicto; Roma — ternura sobria; The Florida Project — humanidad en entorno hostil.",
    alta:
      "Little Women — cooperación afectiva; Captain Fantastic — vínculo familiar; Paddington 2 — calidez explícita.",
    "muy-alta":
      "It's a Wonderful Life — humanismo pleno; Cinema Paradiso — ternura comunitaria; Shoplifters — cuidado como resistencia.",
  },
  neuroticismo: {
    "muy-baja":
      "My Neighbor Totoro — regulación afectiva; Perfect Days — serenidad cotidiana; Koyaanisqatsi (tramos contemplativos) — trance visual.",
    baja:
      "Before Sunrise — tono cálido estable; Once — intimidad regulada; The Straight Story — calma narrativa.",
    "media-baja":
      "Lady Bird — vulnerabilidad amable; Her — melancolía suave; Call Me by Your Name — tensión afectiva medida.",
    "media-alta":
      "Black Swan — presión psicológica; The Babadook — angustia con control; Melancholia — carga emocional sostenida.",
    alta:
      "Requiem for a Dream — catarsis oscura; Shame — tensión interna intensa; Persona — fractura emocional.",
    "muy-alta":
      "Irreversible — intensidad límite; Possession (1981) — desborde afectivo; Come and See — trauma extremo.",
  },
};

const FACET_LITERATURE_EXAMPLES = {
  apertura: {
    "muy-baja":
      "El viejo y el mar — prosa clara; La isla del tesoro — aventura lineal; El alquimista — simbolismo simple.",
    baja:
      "Orgullo y prejuicio — estructura clásica; Matar a un ruiseñor — narrativa accesible; El guardián entre el centeno — voz directa.",
    "media-baja":
      "Rebeca — atmósfera con forma clásica; Nunca me abandones — sci-fi sobria; Ensayo sobre la ceguera — alegoría legible.",
    "media-alta":
      "La carretera — minimalismo denso; Pedro Páramo — capas narrativas; Pálido fuego — juego formal moderado.",
    alta:
      "Rayuela — estructura abierta; La casa de hojas — experimento tipográfico; Si una noche de invierno un viajero — metaliteratura.",
    "muy-alta":
      "Finnegans Wake — ruptura total del lenguaje; Tristram Shandy — forma radical; El innombrable — disolución narrativa extrema.",
  },
  responsabilidad: {
    "muy-baja":
      "En la carretera — impulso errante; Factótum — crudeza desordenada; Trópico de Cáncer — flujo caótico.",
    baja:
      "Miedo y asco en Las Vegas — deriva frenética; Pregúntale al polvo — vitalidad impulsiva; Post Office — estructura suelta.",
    "media-baja":
      "Alta fidelidad — orden flexible; Los detectives salvajes — expansión con eje; Kafka en la orilla — lógica parcialmente abierta.",
    "media-alta":
      "Crimen y castigo — arquitectura sólida; Expiación — control formal con libertad; El nombre de la rosa — sistema narrativo robusto.",
    alta:
      "Madame Bovary — precisión estructural; Middlemarch — diseño social metódico; Los miserables — ingeniería de trama amplia.",
    "muy-alta":
      "En busca del tiempo perdido — arquitectura monumental; Ulises — sistema formal extremo; La montaña mágica — precisión conceptual alta.",
  },
  extraversion: {
    "muy-baja":
      "Diario del subsuelo — interioridad cruda; El extranjero — distanciamiento íntimo; La campana de cristal — voz introspectiva.",
    baja:
      "Stoner — vida interior contenida; Siddhartha — búsqueda interna; El túnel — perspectiva cerrada.",
    "media-baja":
      "Norwegian Wood — socialidad moderada; La elegancia del erizo — intimidad compartida; Nunca me abandones — vínculo contenido.",
    "media-alta":
      "La amiga estupenda — intimidad y tejido social; Middlesex — voz personal con alcance coral; Tokio blues — alternancia interna-social.",
    alta:
      "Cien años de soledad — alta interacción comunitaria; Los Buddenbrook — red familiar amplia; Los hermanos Karamázov — debate social intenso.",
    "muy-alta":
      "Guerra y paz — escala coral máxima; Los demonios — choque ideológico colectivo; Manhattan Transfer — pulso urbano multitudinario.",
  },
  amabilidad: {
    "muy-baja":
      "American Psycho — crueldad extrema; Meridiano de sangre — violencia áspera; Las benévolas — fricción moral radical.",
    baja:
      "Lolita — ambigüedad ética dura; Correcciónes — fricción familiar; El talentoso Sr. Ripley — empatía baja.",
    "media-baja":
      "Nunca me abandones — ternura con dureza; Desgracia — ambivalencia moral; La broma — ironía afectiva.",
    "media-alta":
      "La ridícula idea de no volver a verte — cuidado y duelo; Olive Kitteridge — humanidad con aspereza; Hamnet — afecto bajo tensión.",
    alta:
      "Mujercitas — cooperación afectiva; Anne of Green Gables — calidez sostenida; El viento en los sauces — vínculo amable.",
    "muy-alta":
      "Un hombre llamado Ove — reparación emocional; El club de los milagros de la piel — compasión explícita; El principito — humanismo esencial.",
  },
  neuroticismo: {
    "muy-baja":
      "Walden — serenidad reflexiva; Siddhartha — calma espiritual; El libro del desasosiego (pasajes contemplativos) — tono regulado.",
    baja:
      "El barón rampante — ligereza estable; El curioso incidente del perro a medianoche — control emocional narrativo; El lector — melancolía suave.",
    "media-baja":
      "Tokio blues — vulnerabilidad moderada; La tregua — afecto contenido; Nada — tensión íntima dosificada.",
    "media-alta":
      "Las olas — inestabilidad sensible; Mrs Dalloway — ansiedad interior; La campana de cristal — fragilidad sostenida.",
    alta:
      "Crimen y castigo — tormenta moral; El ruido y la furia — desborde psicológico; Carta de una desconocida — intensidad emocional.",
    "muy-alta":
      "Los sufrimientos del joven Werther — catarsis extrema; Hamlet — espiral afectiva máxima; Diario de un loco — crisis psicológica límite.",
  },
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

const GAME_RULES = {
  apertura:
    "Apertura: baja=mecánicas familiares, tutoriales claros y poca ambigüedad; media-baja=open world o sandbox accesible; media-alta=sistemas híbridos y curiosidad de diseño; alta/muy-alta=formalismo arriesgado, metanarrativa o reglas poco convencionales con intención clara.",
  responsabilidad:
    "Responsabilidad: baja=física caótica, sandbox irreverente o progresión flexible; media-baja=roguelike/ runs con reglas claras pero variación; media-alta=patrones duros aprendibles y progresión legible; alta/muy-alta=optimización, puzzles sistémicos o simulación con alta exigencia de método.",
  extraversion:
    "Extraversión: baja=experiencia solitaria, contemplativa o walking sim; media-baja=co-op opcional sin forzar multitud; media-alta=mix solo/grupo o roles sociales moderados; alta/muy-alta=multijugador competido, party o alta interacción performativa.",
  amabilidad:
    "Amabilidad: baja=conflicto moral duro o violencia con intención crítica; media-baja=dilemas grises tensos; media-alta=vínculos y cuidado con fricción; alta/muy-alta=cooperación, construcción amable o reparación emocional explícita.",
  neuroticismo:
    "Neuroticismo: baja=ritmo calmado y regulación casi meditativa; media-baja=melancolía o tensión leve; media-alta=miedo o incomodidad psicológica sostenida; alta/muy-alta=catarsis afectiva fuerte o ansiedad narrativa marcada.",
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

const HEADING_CALIBRATION_EXAMPLES = {
  CINE: {
    dataset: FACET_CINEMA_EXAMPLES,
    targetLabel: "películas/directores",
  },
  LITERATURA: {
    dataset: FACET_LITERATURE_EXAMPLES,
    targetLabel: "autores/obras",
  },
};

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
  const key = topFacetKeys(dimensions, 1)[0] || "no_disponible";
  const value = Number(dimensions.find(([k]) => k === key)?.[1]) || 0;
  return { key, value };
}

function topFacetKeys(dimensions, count = 1) {
  return [...(dimensions || [])]
    .sort((a, b) => (Number(b?.[1]) || 0) - (Number(a?.[1]) || 0))
    .slice(0, Math.max(1, count))
    .map(([key]) => key);
}

function stablePickOneExample(rawExamples, seed) {
  const options = String(rawExamples || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!options.length) return "";
  let hash = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return options[hash % options.length];
}

function formatFacetExamplesBlock(dimensions, examplesByFacet, heading, targetLabel, seedSalt = "") {
  const selected = topFacetKeys(dimensions, 2);
  const lines = selected.map((key) => {
    const value = dimensions.find(([k]) => k === key)?.[1] ?? 0;
    const detail = scoreDetailBand(value);
    const rawExamples =
      examplesByFacet[key]?.[detail] || examplesByFacet[key]?.["media-baja"] || "";
    const ex = stablePickOneExample(rawExamples, `${seedSalt}|${heading}|${key}|${detail}`);
    return `  - ${key} (${detail}): ${ex}`;
  });
  return (
    `- ${heading} (facetas más marcadas en este perfil): ejemplos concretos solo para calibrar matiz, NO catálogo de salida.\n` +
    `  NO recomiendes al usuario esos títulos salvo como mucho uno en toda la respuesta si encaja sin alternativa mejor.\n` +
    `  Prioriza ${targetLabel} distintos pero con la misma vibra dimensional y perfil Big Five numérico global.\n` +
    `${lines.join("\n")}`
  );
}

function formatCategoryRuleSections(dimensions, seedSalt = "") {
  const dimKeys = dimensions.map(([key]) => key);
  return CATEGORY_RULE_BLOCKS.map(({ heading, rules }) => {
    const cal = HEADING_CALIBRATION_EXAMPLES[heading];
    if (cal) {
      return formatFacetExamplesBlock(
        dimensions,
        cal.dataset,
        heading,
        cal.targetLabel,
        seedSalt
      );
    }
    return (
      `- Reglas para ${heading} (solo dimensiones abstractas; sin nombres de obras en esta subsección — evita sesgo de “copiar ejemplo”):\n` +
      dimKeys.map((k) => `  - ${rules[k]}`).join("\n")
    );
  }).join("\n");
}

function distinctiveSpanishTraitLine(dimensions) {
  const sorted = [...dimensions].sort(
    (a, b) => Math.abs(Number(b[1]) - 3) - Math.abs(Number(a[1]) - 3)
  );
  const top = sorted.slice(0, 2);
  if (!top.length) return "no_disponible";
  return top.map(([k, v]) => `${k}=${Number(v).toFixed(2)}`).join(" | ");
}

function buildCompactFacetPrompt(dimensions, dominantFacet, seedSalt = "") {
  const dimLines = dimensions.map(([key, value]) => {
    const detail = scoreDetailBand(value);
    const current = Number(value || 0).toFixed(2);
    const rule = FACET_PROMPT_RULES[key]?.[detail] || "";
    return `- ${key}: ${current} (${detail}) => ${rule}`;
  });

  return `TRADUCCIÓN OCEAN (compacta, obligatoria):
${dimLines.join("\n")}
- Faceta dominante prioritaria: ${dominantFacet?.key || "no_disponible"} (${(dominantFacet?.value || 0).toFixed(2)}).
- Rasgos más distintivos (mayor alejamiento del punto medio 3): ${distinctiveSpanishTraitLine(dimensions)} — prioriza diferenciación ahí sin ignorar interacciones con los demás.
${formatCategoryRuleSections(dimensions, seedSalt)}
- Usa esta lógica en mecánicas/ritmo/tono, no solo estética.
- Distingue media-baja de media-alta y evita recomendaciones clónicas.`;
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

function buildOceanFacetInterpretation(scores, totals, seedSalt = "") {
  const dimensions = spanishOceanDimensionsFromTotals(totals);
  const dominantFacet = dominantFacetFromDimensions(dimensions);
  const keySubfacets = collectKeySubfacetLines(scores);
  const compactRules = buildCompactFacetPrompt(dimensions, dominantFacet, seedSalt);
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

function formatSubfacetBlockForPrompt(keySubfacets) {
  if (!keySubfacets.length) {
    return "   (sin subfacetas numéricas; infiere con cuidado desde los totales OCEAN.)";
  }
  return keySubfacets.map((line) => `   ${line}`).join("\n");
}

const IPIP_ADAPTIVE_SPECS = [
  {
    label: "Apertura",
    high:
      "más riesgo formal con sustancia (no etiqueta hueca «experimental»); evita lista demasiado obvia.",
    low: "privilegia accesibilidad y anclas claras; el riesgo formal minoritario.",
  },
  {
    label: "Responsabilidad",
    high: "prioriza estructura, método y progresión interna legibles.",
    low: "hueco para energía cruda e improvisación sin rigidez constante.",
  },
  {
    label: "Extraversión",
    high: "no concentres la lista solo en lo íntimo/lento; añade pulso social donde encaje.",
    low: "evita saturar con piezas solo hiper-sociales o solo performativas.",
  },
  {
    label: "Amabilidad",
    high: "calidez, cooperación y reparación sin moralina obligatoria.",
    low: "admite aspereza y fricción ética; menos sentimentalismo forzado.",
  },
  {
    label: "Neuroticismo",
    high: "catarsis y vulnerabilidad pueden entrar fuerte sin listar solo cosas «zen».",
    low: "más regulación y equilibrio; evita martilleo solo con angustia extrema.",
  },
];

/** Ajustes de curación según bandas IPIP (mismos umbrales que `scoreBand`). */
function buildAdaptiveRulesFromTest(o, c, e, a, n) {
  const hi = IPIP_LIKERT_BAND_HIGH_GE;
  const loLt = IPIP_LIKERT_BAND_LOW_LT;
  const values = [o, c, e, a, n];
  const rules = [];
  for (let i = 0; i < IPIP_ADAPTIVE_SPECS.length; i += 1) {
    const v = values[i];
    const { label, high, low } = IPIP_ADAPTIVE_SPECS[i];
    if (v >= hi) {
      rules.push(
        `${label} en rango alto (media Likert ≥${IPIP_LIKERT_BAND_HIGH_GE}, IPIP): ${high}`
      );
    } else if (v < loLt) {
      rules.push(`${label} en rango bajo (media Likert <${IPIP_LIKERT_BAND_LOW_LT}, IPIP): ${low}`);
    }
  }
  return rules;
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
  rulesText,
  facetInterpretation,
  keySubfacets,
}) {
  const subfacetBlock = formatSubfacetBlockForPrompt(keySubfacets);
  const adaptiveRules = buildAdaptiveRulesFromTest(o, c, e, a, n);
  const mechanicalLines = mechanicalCurationLines(c, n);
  const diversitySalt = diversityPromptSalt();
  const [oS, cS, eS, aS, nS] = oceanMeansLikertParts(o, c, e, a, n);
  const oceanMeansInline = `O:${oS}, C:${cS}, E:${eS}, A:${aS}, N:${nS}`;
  const oceanCombinationLine = `Combinación global OCEAN prioritaria: ${oceanMeansInline.replace(/, /g, " + ")}.`;

  const sections = [
    "Rol: Curador cultural. Objetivo: discovery personalizado inclusivo (desde repertorio más conocido hasta nicho verificable), sin sesgar solo a underground ni solo a mainstream; diversidad y encaje OCEAN; no inventes obras.",
    [
      "### PERFIL",
      `- OCEAN (medias Likert 1–5 por rasgo, ítems recodificados estilo IPIP): ${oceanMeansInline}`,
      `- Diferenciación obligatoria: ${rulesText}`,
    ]
      .filter(Boolean)
      .join("\n"),
    [
      "### REGLAS NÚCLEO",
      "1) Evita listas obvias y convergencia entre usuarios; prioriza long-tail verificable.",
      "2) Subfacetas disponibles:",
      subfacetBlock,
      '2.1) Cualquier bloque más abajo con títulos concretos (solo cine/literatura ya) es tonalidad/plantilla mental, NO algo que el usuario \"deba recibir\". Máximo 1 coincidencia literal entre TODOS los candidatos si repites ese título de ejemplo.',
      "3) Lógica mecánica (no solo estética):",
      mechanicalLines.map((x) => `   - ${x}`).join("\n"),
      "4) Prohibido puntuar solo por rasgo individual: decide cada recomendación por patrón total del perfil (trade-offs entre O, C, E, A, N).",
      `5) ${oceanCombinationLine}`,
    ].join("\n"),
    adaptiveRules.length
      ? `### AJUSTE DINÁMICO POR TEST OCEAN\n${adaptiveRules.map((x) => `- ${x}`).join("\n")}`
      : "",
    `### REGLAS POR FACETA/CATEGORÍA\n${facetInterpretation}`,
    [
      "### CONTEXTO",
      "Títulos/creadores reales y buscables.",
      PROMPT_TMDB_SPAIN_CINE_TITLE_RULE,
    ].join("\n"),
    `### FORMATO DE SALIDA (JSON ESTRICTO)
Devuelve solo este objeto JSON:
{"candidates":[{"category":"cine|musica|literatura|videojuegos|arte-visual","title":"Título en español de España (TMDB es-ES) u original si no hay traducción","creator":"Autor/Director/Estudio","genreHint":"Subgénero hiper-específico (ej. post-punk báltico, slow cinema distópico)"}]}`,
    `Random seed de diversidad: ${diversitySalt}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}

module.exports = {
  buildOceanFacetInterpretation,
  buildPersonalizedFeedCuratorPrompt,
  feedEntityIdFromOceanResult,
};

