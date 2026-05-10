const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { CHAT_GEMINI_OPTS } = require("../../services/ai/chatConstants");

describe("chatConstants", () => {
  it("expone opciones de generación para el chat", () => {
    assert.equal(CHAT_GEMINI_OPTS.purpose, "respuesta de chat");
    assert.equal(CHAT_GEMINI_OPTS.timeoutMs, 90000);
    assert.ok(CHAT_GEMINI_OPTS.generationConfig);
    assert.equal(CHAT_GEMINI_OPTS.generationConfig.maxOutputTokens, 8192);
  });
});
