/**
 * Clasificación de errores de la API Gemini para reintentos con otro modelo.
 */

function isNotSupported(err) {
  const msg = String(err?.message || "").toLowerCase();
  const s = err?.status || err?.statusCode;
  return (
    s === 404 ||
    msg.includes("not found") ||
    msg.includes("not_found") ||
    msg.includes("no longer available") ||
    msg.includes("not supported") ||
    msg.includes("generatecontent")
  );
}

function isQuota(err) {
  const msg = String(err?.message || "").toLowerCase();
  const s = err?.status || err?.statusCode;
  return s === 429 || msg.includes("quota") || msg.includes("rate limit") || msg.includes("429");
}

function isTransient(err) {
  const msg = String(err?.message || "").toLowerCase();
  const s = err?.status || err?.statusCode;
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    s === 500 ||
    s === 502 ||
    s === 503 ||
    s === 504
  );
}

module.exports = {
  isNotSupported,
  isQuota,
  isTransient,
};
