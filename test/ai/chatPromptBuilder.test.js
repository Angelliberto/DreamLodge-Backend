/**
 * Comprueba que el prompt de chat incluye mensaje del usuario e instrucciones base.
 */
const { buildChatFullPrompt } = require("../../services/ai/chat/chatPromptBuilder");

describe("chatPromptBuilder", () => {
  it("incluye el mensaje del usuario y el system prompt", () => {
    const text = buildChatFullPrompt(
      "¿Qué cine me recomiendas?",
      "Eres un asistente útil.",
      [],
      {}
    );
    expect(text).toMatch(/Mensaje del usuario: ¿Qué cine me recomiendas\?/);
    expect(text).toMatch(/Eres un asistente útil/);
    expect(text).toMatch(/INSTRUCCIONES IMPORTANTES/);
  });

  it("añade bloque de historial cuando hay mensajes", () => {
    const text = buildChatFullPrompt("ok", "Sys", [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "Hola ¿en qué te ayudo?" },
    ], {});
    expect(text).toMatch(/Historial de conversación/);
    expect(text).toMatch(/Usuario: Hola/);
    expect(text).toMatch(/Asistente: Hola/);
  });
});
