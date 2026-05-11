/** Prompts del sistema para el agente Dream Lodge (equivalente a system_prompts.py). */

const SYSTEM_PROMPT = `Eres el asistente cultural oficial de Dream Lodge. Tu estilo es cercano, inteligente y accionable. Funcionas como un LLM natural, pero optimizado para descubrimiento cultural personalizado en la app.

MISIÓN PRINCIPAL:
Entender intención + perfil del usuario (OCEAN, favoritos, contexto de conversación) para recomendar obras culturales relevantes y explicar por qué encajan. Debes maximizar utilidad real y sensación de personalización.

DOMINIO DREAM LODGE:
- Categorías objetivo: cine, música, literatura, arte-visual, videojuegos.
- Cuando la app provea obras desde la base de datos, priorízalas y exprésalas con claridad.
- Cuando no haya resultados en la base, puedes usar conocimiento general y mantener continuidad con el perfil del usuario.
- Diferencia entre "lo que está en la base" y "sugerencias generales" de forma natural y breve.

INTERPRETACIÓN ROBUSTA DEL MENSAJE:
- Tolera typos, falta de tildes, abreviaciones y lenguaje coloquial.
- Interpreta intención por sinónimos: peli/película/cine/film, música/canción/disco, libro/novela, juego/videojuego, etc.
- Si el mensaje es ambiguo, propone una interpretación razonable y da 2-3 opciones concretas.
- Nunca respondas regañando al usuario por cómo escribe.
- Nunca uses como respuesta principal: "no entendí", "no pude satisfacer", "escribe mejor".

USO DE OCEAN Y SEÑALES DE PERFIL (OBLIGATORIO SI EXISTEN):
- Usa OCEAN para ajustar energía, complejidad, tono emocional, ritmo y nivel de riesgo de las recomendaciones.
- Usa favoritos y contexto para inferir patrones (género, estilo, intensidad, época, enfoque autoral).
- Explica encaje de forma breve y específica: rasgo/indicio -> consecuencia en la recomendación.
- Si faltan datos de personalidad, usa el mensaje actual y preguntas de afinación livianas.

HEURÍSTICA PRÁCTICA POR RASGO:
- Apertura alta: propuestas menos obvias, híbridas, autorales o de exploración.
- Apertura baja: propuestas accesibles, claras y de entrada directa.
- Responsabilidad alta: obras estructuradas, detallistas, coherentes formalmente.
- Responsabilidad baja: obras espontáneas, viscerales, menos rígidas.
- Extraversión alta: obras dinámicas, sociales o de alto pulso.
- Extraversión baja: obras íntimas, contemplativas o de foco interno.
- Amabilidad alta: tono empático, cálido, cooperativo.
- Amabilidad baja: conflicto moral, filo crítico, tensión interpersonal.
- Neuroticismo alto: mayor profundidad emocional y catarsis guiada.
- Neuroticismo bajo: estabilidad, calma y balance afectivo.

CRITERIOS DE CALIDAD DE RESPUESTA:
- Sé específico: evita recomendaciones genéricas vacías.
- Si recomiendas obras, idealmente incluye título y creador; añade año/categoría cuando aporte valor.
- No inventes obras inexistentes.
- No afirmes que una obra está en la base si no aparece en resultados de herramientas.
- Prioriza utilidad inmediata: recomendaciones concretas, comparaciones útiles o siguiente paso claro.

ENLACES PARA VER O CONSUMIR (OBLIGATORIO CUANDO APLIQUE):
- Si el contexto de esta conversación incluye una URL bajo "Enlace (oficial / consumo)" o similar para una obra, debes ofrecerla al usuario con formato Markdown: [texto corto](URL). Copia la URL carácter a carácter; no la acortes ni la sustituyas.
- Usa etiquetas claras: "Ver en TMDB", "Abrir en Spotify", "Ficha en Google Libros", "Ver en IGDB", etc., según corresponda.
- Si recomiendas algo solo con conocimiento general y no tienes URL en el contexto, no inventes enlaces: indica de forma honesta dónde suele encontrarse (streaming, librería, tienda de apps) sin fabricar un https://.

FORMATO DE RESPUESTA RECOMENDADO:
- Empieza con una frase breve que conecte con la intención del usuario.
- Da 3-5 recomendaciones cuando pidan sugerencias (salvo que el usuario pida otra cantidad).
- Cada recomendación debe incluir una justificación corta y específica.
- Cierra con una pregunta opcional para afinar ("¿quieres algo más oscuro, más ligero o más experimental?").

COMPORTAMIENTO EN ESCENARIOS COMUNES:
- Si hay resultados DB: preséntalos primero y complementa con contexto del perfil.
- Si no hay resultados DB: no te bloquees; aporta recomendaciones útiles con conocimiento general.
- Si el usuario pide "algo parecido a X": prioriza similitud real (tono, estructura, tema, ritmo), no solo popularidad.
- Si el usuario pide descubrimiento: combina 1 opción segura + 1 intermedia + 1 arriesgada.

TONO:
- Español natural, claro y humano.
- Entusiasta sin exagerar.
- Emojis opcionales y moderados.

OBJETIVO FINAL:
Que el usuario sienta que Dream Lodge lo entiende de verdad y que cada respuesta le aporta valor cultural concreto, personalizado y accionable.`;

const OCEAN_TRAIT_TITLES_ES = {
  openness: "Apertura a experiencias (Openness)",
  conscientiousness: "Meticulosidad (Conscientiousness)",
  extraversion: "Extroversión (Extraversion)",
  agreeableness: "Simpatía (Agreeableness)",
  neuroticism: "Neurosis / inestabilidad emocional (Neuroticism)",
};

const OCEAN_FACET_ORDER = {
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

const FACET_LABELS_ES = {
  gregariousness: "Ambientes con mucha gente",
  friendliness: "Cercanía al iniciar contacto",
  assertiveness: "Decir lo que piensas con firmeza",
  poise: "Comodidad en contextos sociales nuevos",
  leadership: "Dirigir en grupo",
  provocativeness: "Debate y confrontación directa",
  self_disclosure: "Compartir lo personal",
  talkativeness: "Mucho hablar en la conversación",
  sociability: "Buscar compañía a menudo",
  understanding: "Escuchar y respetar lo ajeno",
  warmth: "Hacer sentir bienvenido",
  morality: "Honestidad y rectitud",
  pleasantness: "Poca dureza al criticar",
  empathy: "Captar lo que el otro necesita",
  cooperation: "Acordar en lugar de imponer",
  sympathy: "Conmoverte por el sufrimiento",
  tenderness: "Cariño en el trato",
  nurturance: "Cuidar y proteger activamente",
  conscientiousness: "Fiabilidad en lo prometido",
  efficiency: "Uso ordenado del tiempo y los pasos",
  dutifulness: "Sentido del deber y las normas",
  purposefulness: "Llegar hasta el final",
  organization: "Detalle y calidad del trabajo",
  cautiousness: "Pausa ante riesgos",
  rationality: "Razonar con lógica y pasos",
  perfectionism: "Exigencia máxima con el resultado",
  orderliness: "Orden físico y rutinas claras",
  stability: "Cambios de humor bruscos",
  happiness: "Tristeza y bajón de ánimo",
  calmness: "Enfado fácil (irritabilidad)",
  moderation: "Impulsos difíciles de frenar",
  toughness: "Sobrepaso ante presión o crítica",
  impulse_control: "Reaccionar sin pensar (palabras y emoción)",
  imperturbability: "Emociones muy intensas o abrumadoras",
  cool_headedness: "Poca serenidad cuando hay tensión",
  tranquility: "Altibajos durante el día",
  intellect: "Ideas abstractas y análisis",
  ingenuity: "Ingenio (enfoques poco obvios)",
  reflection: "Contemplación y sensibilidad estética",
  competence: "Capacidad de aprender y aplicar",
  quickness: "Rapidez al entender",
  introspection: "Mirar hacia dentro",
  creativity: "Creatividad (varias soluciones)",
  imagination: "Imaginación y fantasía",
  depth: "Profundidad (ir más allá de la superficie)",
};

function facetValue(traitScores, facetKey) {
  if (!traitScores || typeof traitScores !== "object") return "N/A";
  if (!(facetKey in traitScores)) return "N/A";
  const v = traitScores[facetKey];
  if (v === null || v === undefined) return "N/A";
  return v;
}

function formatOceanTraitBlock(traitKey, traitScores) {
  const title = OCEAN_TRAIT_TITLES_ES[traitKey] || traitKey;
  const total = facetValue(traitScores, "total");
  const lines = [`- ${title}: total = ${total}`];
  for (const facetKey of OCEAN_FACET_ORDER[traitKey] || []) {
    const label = FACET_LABELS_ES[facetKey] || facetKey;
    const val = facetValue(traitScores, facetKey);
    lines.push(`  - ${label}: ${val}`);
  }
  return lines.join("\n");
}

function oceanPrompt(oceanResults) {
  if (!oceanResults || !oceanResults.length) return "";
  const latest = oceanResults[0];
  const {
    oceanScoresToCanonicalLikert,
    DEFAULT_OCEAN_SCORE_METRIC,
  } = require("../../../utils/ai/agentUtils");
  const scoreMetric =
    latest.scoreMetric === "ipip_mean_1_5"
      ? "ipip_mean_1_5"
      : DEFAULT_OCEAN_SCORE_METRIC;
  const scores = oceanScoresToCanonicalLikert(latest.scores || {}, scoreMetric);
  const blocks = [];
  for (const traitKey of [
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
  ]) {
    const raw = scores[traitKey];
    const traitScores = raw && typeof raw === "object" ? raw : {};
    blocks.push(formatOceanTraitBlock(traitKey, traitScores));
  }
  const body = blocks.join("\n\n");
  return `

PERFIL DE PERSONALIDAD DEL USUARIO (Big Five - OCEAN, con las 9 facetas AB5C por dimensión cuando existan):
El usuario ha completado un test de personalidad. Los números son medias Likert en escala 1–5 por rasgo y por faceta (ítems recodificados al estilo IPIP/Mini-IPIP; 1 = muy bajo en el rasgo o faceta, 5 = muy alto, 3 ≈ punto medio teórico).
En test rápido solo suele haber "total"; el resto de facetas aparecerá como N/A hasta el análisis profundo.

${body}

Usa totales y facetas (no solo el total del rasgo) para afinar recomendaciones culturales cuando haya datos.`;
}

function parseArtisticDescriptionPayload(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function artisticProfilePrompt(oceanResults) {
  const latest = Array.isArray(oceanResults) && oceanResults.length ? oceanResults[0] : null;
  if (!latest || typeof latest !== "object") return "";

  const payload = parseArtisticDescriptionPayload(latest.artisticDescription);
  if (!payload || typeof payload !== "object") return "";

  const profile = String(payload.profile || "").trim();
  const description = String(payload.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
  const suggestedWorks = Array.isArray(payload.suggestedWorks) ? payload.suggestedWorks : [];

  const worksLines = suggestedWorks
    .slice(0, 8)
    .map((w) => {
      const title = String(w?.title || "").trim();
      const creator = String(w?.creator || "").trim();
      const category = String(w?.category || "").trim();
      if (!title) return null;
      const creatorPart = creator ? ` — ${creator}` : "";
      const categoryPart = category ? ` (${category})` : "";
      return `- ${title}${creatorPart}${categoryPart}`;
    })
    .filter(Boolean);

  const profileLine = profile
    ? `Análisis de personalidad: ${profile}`
    : "Análisis de personalidad: (no especificado)";
  const descriptionLine = description
    ? `Descripción base del análisis: ${description}`
    : "Descripción base del análisis: (no disponible)";

  const worksBlock = worksLines.length
    ? `\nObras semilla del análisis de personalidad:\n${worksLines.join("\n")}`
    : "";

  return `

ANÁLISIS DE PERSONALIDAD PERSISTIDO DEL USUARIO (prioritario para recomendaciones):
${profileLine}
${descriptionLine}${worksBlock}

Úsalo como contexto de alto valor para orientar tono, complejidad, energía y selección de obras.`;
}

function favoritesPrompt(favorites) {
  if (!favorites || !favorites.length) return "";
  const lines = favorites.slice(0, 10).map(
    (item) =>
      `- ${item.title || ""} (${item.category || ""}) por ${item.creator || ""}`
  );
  return `

OBRAS FAVORITAS DEL USUARIO:
El usuario ha marcado las siguientes obras como favoritas:
${lines.join("\n")}

Usa esta información para entender los gustos del usuario y hacer recomendaciones similares o complementarias.`;
}

function contextPrompt(contextItems) {
  if (!contextItems || !contextItems.length) return "";
  const lines = contextItems.map((item) => {
    const title = item.title || "";
    const category = item.category || "";
    const creator = item.creator || "";
    const year = item.year;
    const y = year ? ` (${year})` : "";
    return `- ${title} (${category}) por ${creator}${y}`;
  });
  return `

CONTEXTO ACTUAL DE LA CONVERSACIÓN:
El usuario ha añadido las siguientes obras al contexto de esta conversación:
${lines.join("\n")}

Usa esta información para:
- Referenciar estas obras cuando sea relevante
- Hacer recomendaciones relacionadas o complementarias
- Responder preguntas específicas sobre estas obras
- Entender mejor los gustos del usuario`;
}

function buildSystemPrompt({
  contextItems,
  oceanResults,
  favorites,
  userInfo,
} = {}) {
  const ci = contextItems || [];
  const oc = oceanResults || [];
  const fav = favorites || [];
  let prompt = SYSTEM_PROMPT;
  if (userInfo) {
    prompt += `

INFORMACIÓN DEL USUARIO:
- Nombre: ${userInfo.name || "No disponible"}
- Email: ${userInfo.email || "No disponible"}`;
  }
  if (oc.length) prompt += oceanPrompt(oc);
  if (oc.length) prompt += artisticProfilePrompt(oc);
  if (fav.length) prompt += favoritesPrompt(fav);
  if (ci.length) prompt += contextPrompt(ci);
  return prompt;
}

module.exports = { buildSystemPrompt, SYSTEM_PROMPT };
