/**
 * Solo el servidor MCP (u otros servicios internos) con el secreto compartido.
 */
function mcpInternalOnly(req, res, next) {
  const got = String(req.headers["x-mcp-internal-secret"] || "").trim();
  const expected = String(process.env.MCP_INTERNAL_SECRET || "").trim();
  if (!expected || got !== expected) {
    return res.status(403).json({ ok: false, message: "Forbidden" });
  }
  next();
}

module.exports = { mcpInternalOnly };
