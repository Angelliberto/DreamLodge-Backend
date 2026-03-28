const axios = require("axios");

/**
 * Origen del servidor MCP (sin barra final).
 * Preferido: MCP_AI_BASE_URL. Compatibilidad: MCP_SERVER_URL.
 */
function getBaseUrl() {
  const raw = (
    process.env.MCP_AI_BASE_URL ||
    process.env.MCP_SERVER_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  return raw;
}

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  const secret = (process.env.MCP_INTERNAL_SECRET || "").trim();
  if (secret) {
    headers["X-MCP-Internal-Secret"] = secret;
  }
  return headers;
}

/**
 * POST al servidor MCP (rutas HTTP /ai/v1/* definidas en mcp_server.py).
 */
async function postMcpAi(path, body, { timeoutMs = 120000 } = {}) {
  const base = getBaseUrl();
  if (!base) {
    throw new Error(
      "Configura MCP_AI_BASE_URL o MCP_SERVER_URL con el origen del servidor MCP (ej. http://localhost:8080)."
    );
  }
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const { data, status } = await axios.post(url, body, {
    headers: buildHeaders(),
    timeout: timeoutMs,
    validateStatus: () => true,
  });
  if (data && data.ok === false) {
    const err = new Error(data.error || "Error en el servicio MCP de IA");
    err.statusCode = status || 502;
    throw err;
  }
  if (typeof data?.ok !== "boolean") {
    const err = new Error("Respuesta inesperada del servidor MCP");
    err.statusCode = 502;
    throw err;
  }
  return data.data;
}

async function processChatMessage({
  message,
  userId,
  conversationHistory = [],
  contextItems = [],
  currentTitle = "",
}) {
  return postMcpAi(
    "/ai/v1/chat/message",
    {
      message,
      userId: userId || undefined,
      conversationHistory,
      contextItems,
      currentTitle,
    },
    { timeoutMs: 120000 }
  );
}

/**
 * oceanResult: documento lean de Mongoose (serializable JSON).
 */
async function generateArtisticDescription(oceanResult) {
  return postMcpAi(
    "/ai/v1/ocean/artistic-description",
    { oceanResult },
    { timeoutMs: 90000 }
  );
}

module.exports = {
  postMcpAi,
  processChatMessage,
  generateArtisticDescription,
  getBaseUrl,
};
