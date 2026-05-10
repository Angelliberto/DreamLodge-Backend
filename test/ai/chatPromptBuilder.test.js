/**
 * Comprueba que el prompt de chat incluye mensaje del usuario e instrucciones base.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildChatFullPrompt } = require("../../services/ai/chat/chatPromptBuilder");

describe("chatPromptBuilder", () => {
  it("incluye el mensaje del usuario y el system prompt", () => {
    const text = buildChatFullPrompt(
      "¿Qué cine me recomiendas?",
      "Eres un asistente útil.",
      [],
      {}
    );
    assert.match(text, /Mensaje del usuario: ¿Qué cine me recomiendas\?/);
    assert.match(text, /Eres un asistente útil/);
    assert.match(text, /INSTRUCCIONES IMPORTANTES/);
  });

  it("añade bloque de historial cuando hay mensajes", () => {
    const text = buildChatFullPrompt("ok", "Sys", [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "Hola ¿en qué te ayudo?" },
    ], {});
    assert.match(text, /Historial de conversación/);
    assert.match(text, /Usuario: Hola/);
    assert.match(text, /Asistente: Hola/);
  });
});
