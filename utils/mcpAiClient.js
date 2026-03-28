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

function isDebug() {
  return (
    process.env.MCP_AI_DEBUG === "1" ||
    process.env.NODE_ENV === "development"
  );
}

function responsePreview(data, max = 500) {
  if (data == null) return String(data);
  if (typeof data === "string") return data.slice(0, max);
  try {
    return JSON.stringify(data).slice(0, max);
  } catch {
    return String(data).slice(0, max);
  }
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

  let response;
  try {
    response = await axios.post(url, body, {
      headers: buildHeaders(),
      timeout: timeoutMs,
      validateStatus: () => true,
    });
  } catch (err) {
    const detail = {
      url,
      code: err.code,
      message: err.message,
      syscall: err.syscall,
      address: err.address,
      port: err.port,
    };
    console.error("[MCP IA] fallo de red (sin respuesta HTTP válida):", detail);

    let hint =
      err.message || err.code || "error de red al contactar el MCP";
    if (err.code === "ECONNREFUSED") {
      hint = `ECONNREFUSED en ${base}: el servidor MCP no está en marcha o el puerto/host es incorrecto.`;
    } else if (
      err.code === "ENOTFOUND" ||
      err.code === "EAI_AGAIN"
    ) {
      hint = `DNS/host no resuelto al llamar al MCP (${base}).`;
    } else if (err.code === "ETIMEDOUT" || /timeout/i.test(String(err.message))) {
      hint = `Timeout (${timeoutMs}ms) esperando al MCP en ${url}.`;
    }

    const wrapped = new Error(hint);
    wrapped.statusCode = 502;
    wrapped.details = detail;
    throw wrapped;
  }

  const { data, status, headers } = response;

  if (isDebug()) {
    console.log("[MCP IA] respuesta HTTP", {
      url,
      status,
      contentType: headers["content-type"],
    });
  }

  const isObject = data !== null && typeof data === "object" && !Array.isArray(data);

  if (!isObject) {
    console.error("[MCP IA] cuerpo no es un objeto JSON", {
      url,
      status,
      preview: responsePreview(data),
    });
    const err = new Error(
      status >= 502
        ? `El MCP o un proxy devolvió HTTP ${status} con cuerpo no JSON (¿URL apunta al servicio equivocado o error de gateway?).`
        : `Respuesta inesperada del MCP (HTTP ${status}, no JSON)`
    );
    err.statusCode = status >= 400 && status < 600 ? status : 502;
    throw err;
  }

  if (data.ok === false) {
    console.error("[MCP IA] MCP respondió ok=false", {
      url,
      status,
      error: data.error,
      error_type: data.error_type,
    });
    const err = new Error(data.error || "Error en el servicio MCP de IA");
    err.statusCode = status || 502;
    err.mcpPayload = { error_type: data.error_type };
    throw err;
  }

  if (typeof data.ok !== "boolean") {
    console.error("[MCP IA] JSON sin campo ok booleano", {
      url,
      status,
      keys: Object.keys(data),
      preview: responsePreview(data),
    });
    const err = new Error(
      "Respuesta inesperada del servidor MCP (falta ok: true/false)"
    );
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
 * oceanResult: documento serializable (ObjectId/fechas como en JSON).
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
