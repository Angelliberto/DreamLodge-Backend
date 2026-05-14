/**
 * Traduce descripciones de obras al español con Gemini cuando no lo estén ya.
 */
const { getAiAgent } = require("../core/dreamLodgeAiAgent");

const TRANSLATE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
];

const MAX_IN = 10000;

function parseJsonObject(raw) {
  const s = String(raw || "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fenced ? fenced[1].trim() : s;
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Respuesta sin JSON");
  }
  return JSON.parse(inner.slice(start, end + 1));
}

function buildPrompt(description) {
  const payload = JSON.stringify(description);
  return `Eres un traductor profesional al español (España), tono informativo y natural.

Recibes la descripción de una obra cultural en esta cadena JSON (puede incluir comillas y saltos de línea escapados):
${payload}

Responde SOLO con un objeto JSON válido (sin markdown, sin texto antes ni después), exactamente con estas claves:
{"alreadySpanish": boolean, "text": string}

Criterios:
- alreadySpanish = true si el texto ya está redactado principalmente en español (pueden quedar nombres propios, títulos o citas en otro idioma). En ese caso "text" debe reproducir el significado del original en español, sin cambios de sustancia (solo puedes unificar espacios o un typo evidente).
- alreadySpanish = false si no está principalmente en español. Entonces "text" es la traducción completa al español de España, fiel en contenido, sin añadir comentarios meta ("esta obra", "en esta descripción"), sin prefijos ni conclusiones.

No incluyas claves adicionales.`;
}

/**
 * @param {string} description
 * @returns {Promise<{ text: string, alreadySpanish: boolean }>}
 */
async function translateDescriptionToSpanishIfNeeded(description) {
  const raw = String(description ?? "").trim();
  if (!raw) {
    return { text: "", alreadySpanish: true };
  }
  const clipped = raw.length > MAX_IN ? raw.slice(0, MAX_IN) : raw;

  const agent = getAiAgent();
  if (!agent.configured()) {
    throw new Error("Gemini no configurado");
  }

  const prompt = buildPrompt(clipped);
  const genText = await agent.generateWithGemini(prompt, {
    purpose: "traducción descripción obra",
    timeoutMs: 35000,
    modelCandidates: TRANSLATE_MODELS,
    generationConfig: { temperature: 0.15, maxOutputTokens: 8192 },
  });

  let parsed;
  try {
    parsed = parseJsonObject(genText);
  } catch (e) {
    throw new Error(`No se pudo interpretar la respuesta del modelo: ${e.message || e}`);
  }

  const alreadySpanish = Boolean(parsed.alreadySpanish);
  let text = String(parsed.text ?? "").trim();
  if (!text) {
    text = clipped;
  }

  return { text, alreadySpanish };
}

module.exports = {
  translateDescriptionToSpanishIfNeeded,
  MAX_DESCRIPTION_TRANSLATE_CHARS: MAX_IN,
};
