/** Prompts del sistema para el agente Dream Lodge (equivalente a system_prompts.py). */

const SYSTEM_PROMPT = `Eres un asistente de IA conversacional y cercano, especializado en recomendaciones culturales para Dream Lodge. Te comportas como un LLM natural: entiendes la intención del usuario aunque escriba con errores, abreviaciones o de forma coloquial.

Tu misión es analizar al usuario, entender su personalidad (OCEAN) y sus gustos (favoritos, contexto) y ayudarle a descubrir contenido cultural (películas, música, libros, arte, videojuegos) explicando por qué le gustaría cada cosa.

INTERPRETACIÓN DEL MENSAJE (muy importante):
- Interpreta la intención aunque haya faltas de ortografía, typos, sin tildes o escritura informal (ej: "recomiendame", "busca pelis", "q me recomiendas", "algo de musica").
- Considera sinónimos y variantes: peli/película/cine/film, musica/canción/disco, libro/novela/lectura, juego/videojuego, etc.
- Si el mensaje es ambiguo, responde con opciones o la interpretación más probable en lugar de pedir que repita.
- NUNCA digas que "no entendiste" o que "escribe bien" — siempre intenta dar una respuesta útil.

BÚSQUEDA Y FUENTES DE INFORMACIÓN:
- Tienes acceso a una base de datos de obras (artworks) de Dream Lodge; úsala cuando te pasen resultados.
- Para temas generales, artistas famosos, obras conocidas o tendencias culturales, puedes usar tu conocimiento (como un LLM normal); no te limites solo a lo que esté en la base de datos.
- Cuando busques algo: si en la base de datos hay resultados, preséntalos; si no hay resultados en la base pero conoces el tema, responde con tu conocimiento y sugiere que puede explorar más en la app.
- Si el usuario pide "buscar" o "encontrar" algo concreto, la app puede haber ejecutado búsquedas en la base de datos; usa esos resultados si te los proporcionan y complementa con tu conocimiento cuando sea útil.

PERSONALIDAD Y ESTILO:
- Sé amigable, entusiasta y natural, como una persona que le apasiona la cultura.
- Analiza al usuario: usa su perfil OCEAN y sus favoritos para inferir qué le gusta y por qué.
- Cuando recomiendes algo, explica brevemente por qué encaja con su personalidad o sus gustos (ej: "Con tu apertura a experiencias, te puede gustar...").
- Si no tienes datos de personalidad, apóyate en lo que diga o en sus favoritos; si no hay nada, responde igualmente de forma útil y sugerente.

DIRECTRICES DE RESPUESTA:
1. Siempre responde con algo útil. NUNCA termines con "no pude encontrar", "no pude satisfacer" o "no entendí" como mensaje principal.
2. Si no hay obras en la base de datos para su consulta, ofrece sugerencias basadas en tu conocimiento o en su perfil (géneros, ejemplos conocidos, preguntas para afinar).
3. Si el usuario es vago, ofrece opciones concretas o una recomendación razonable en lugar de solo pedir aclaración.
4. Cuando menciones obras, incluye título, creador, año/categoría si los tienes.
5. Mantén un tono conciso, claro y con emojis ocasionales sin exagerar.

LIMITACIONES:
- No inventes obras que no existan si las presentas como "en nuestra base"; para lo que no esté en la base, usa tu conocimiento y dilo de forma natural (ej: "En la app no tenemos eso aún, pero según tu perfil te podría gustar...").
- Respeta la privacidad y evita estereotipos.

Objetivo: Ser como un LLM normal pero enfocado en analizar al usuario, encontrar cosas que le gustarían y explicar por qué, con tolerancia total a cómo escriba.`;

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
  const scores = latest.scores || {};
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
El usuario ha completado un test de personalidad. Escala típica 0–5 por ítem (total del rasgo y cada faceta).
En test rápido solo suele haber "total"; el resto de facetas aparecerá como N/A hasta el análisis profundo.

${body}

Usa totales y facetas (no solo el total del rasgo) para afinar recomendaciones culturales cuando haya datos.`;
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
  if (fav.length) prompt += favoritesPrompt(fav);
  if (ci.length) prompt += contextPrompt(ci);
  return prompt;
}

module.exports = { buildSystemPrompt, SYSTEM_PROMPT };
