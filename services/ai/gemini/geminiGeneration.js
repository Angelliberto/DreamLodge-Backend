/**
 * Llamadas a Gemini con reintentos por modelo (sync y stream).
 */
const { envModels, formatExceptionForClient } = require("../../../utils/ai/agentUtils");
const { isNotSupported, isQuota, isTransient } = require("./geminiErrors");

/**
 * @param {import("@google/generative-ai").GoogleGenerativeAI | null} genAI
 */
async function generateWithGemini(
  genAI,
  prompt,
  { purpose = "respuesta", timeoutMs = 40000, generationConfig = null, modelCandidates = null } = {}
) {
  if (!genAI) {
    throw new Error("El servicio de IA no está configurado (Gemini no disponible).");
  }
  const candidates =
    Array.isArray(modelCandidates) && modelCandidates.length ? modelCandidates : envModels();
  if (!candidates.length) {
    throw new Error("No hay modelos Gemini configurados. Define GEMINI_API_KEY o GEMINI_MODEL.");
  }

  const tried = [];
  let lastErr = null;

  for (const modelName of candidates) {
    tried.push(modelName);
    const model = genAI.getGenerativeModel({ model: modelName });
    try {
      const run = async () => {
        const request = generationConfig
          ? {
              contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
              generationConfig,
            }
          : prompt;
        const result = await model.generateContent(request);
        const response = result.response;
        let text = "";
        try {
          text = (response.text && response.text()) || "";
        } catch {
          const parts = response.candidates?.[0]?.content?.parts || [];
          text = parts.map((p) => p.text || "").join("");
        }
        return String(text || "").trim();
      };

      const text = await Promise.race([
        run(),
        new Promise((_, rej) =>
          setTimeout(
            () => rej(new Error(`Timeout generando ${purpose} con ${modelName}`)),
            Math.max(timeoutMs, 1000)
          )
        ),
      ]);

      if (!text) {
        throw new Error(`El modelo ${modelName} no generó ninguna respuesta.`);
      }
      return text;
    } catch (e) {
      lastErr = e;
      if (isNotSupported(e)) continue;
      if (isQuota(e)) continue;
      if (isTransient(e)) continue;
      throw e;
    }
  }

  if (lastErr) {
    const detail = formatExceptionForClient(lastErr);
    const err = new Error(`Gemini falló tras probar: ${tried.join(", ")}. ${detail}`);
    err.cause = lastErr;
    throw err;
  }
  throw new Error(`No hay modelos Gemini compatibles. Modelos probados: ${tried.join(", ")}`);
}

/**
 * @param {import("@google/generative-ai").GoogleGenerativeAI | null} genAI
 * @param {(cumulative: string) => void} [onChunk]
 */
async function generateWithGeminiStream(
  genAI,
  prompt,
  { purpose = "respuesta", timeoutMs = 40000, generationConfig = null, modelCandidates = null } = {},
  onChunk
) {
  if (!genAI) {
    throw new Error("El servicio de IA no está configurado (Gemini no disponible).");
  }
  const candidates =
    Array.isArray(modelCandidates) && modelCandidates.length ? modelCandidates : envModels();
  if (!candidates.length) {
    throw new Error("No hay modelos Gemini configurados. Define GEMINI_API_KEY o GEMINI_MODEL.");
  }

  const tried = [];
  let lastErr = null;

  for (const modelName of candidates) {
    tried.push(modelName);
    const model = genAI.getGenerativeModel({ model: modelName });
    try {
      const runStream = async () => {
        const request =
          generationConfig != null
            ? {
                contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
                generationConfig,
              }
            : String(prompt || "");

        const result = await model.generateContentStream(request);
        let text = "";
        for await (const chunk of result.stream) {
          let piece = "";
          try {
            piece = (chunk.text && chunk.text()) || "";
          } catch {
            const parts = chunk.candidates?.[0]?.content?.parts || [];
            piece = parts.map((p) => p.text || "").join("");
          }
          if (piece) {
            text += piece;
            if (typeof onChunk === "function") onChunk(text);
          }
        }
        return String(text || "").trim();
      };

      const text = await Promise.race([
        runStream(),
        new Promise((_, rej) =>
          setTimeout(
            () => rej(new Error(`Timeout generando ${purpose} con ${modelName}`)),
            Math.max(timeoutMs, 1000)
          )
        ),
      ]);

      if (!text) {
        throw new Error(`El modelo ${modelName} no generó ninguna respuesta.`);
      }
      return text;
    } catch (e) {
      lastErr = e;
      if (isNotSupported(e)) continue;
      if (isQuota(e)) continue;
      if (isTransient(e)) continue;
      throw e;
    }
  }

  if (lastErr) {
    const detail = formatExceptionForClient(lastErr);
    const err = new Error(`Gemini falló tras probar: ${tried.join(", ")}. ${detail}`);
    err.cause = lastErr;
    throw err;
  }
  throw new Error(`No hay modelos Gemini compatibles. Modelos probados: ${tried.join(", ")}`);
}

module.exports = {
  generateWithGemini,
  generateWithGeminiStream,
};
