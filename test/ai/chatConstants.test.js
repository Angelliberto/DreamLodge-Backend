const { CHAT_GEMINI_OPTS } = require("../../services/ai/chat/chatConstants");

describe("chatConstants", () => {
  it("expone opciones de generación para el chat", () => {
    expect(CHAT_GEMINI_OPTS.purpose).toBe("respuesta de chat");
    expect(CHAT_GEMINI_OPTS.timeoutMs).toBe(90000);
    expect(CHAT_GEMINI_OPTS.generationConfig).toBeDefined();
    expect(CHAT_GEMINI_OPTS.generationConfig.maxOutputTokens).toBe(8192);
  });
});
