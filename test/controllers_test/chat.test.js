const {
  sendMessage,
  getRecommendations,
  listChatConversations,
  getChatMessages,
  deleteChatConversation,
} = require("../../controllers/chat");

const ai = require("../../services/ai");
const chatPersistence = require("../../services/persistence/chatPersistence");
const { handleHTTPError } = require("../../utils/handleHTTPError");

jest.mock("../../services/ai");
jest.mock("../../services/persistence/chatPersistence");
jest.mock("../../utils/handleHTTPError");

// Helper para crear req y res falsos
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides = {}) => ({
  body: {},
  query: {},
  params: {},
  user: { _id: "user123" },
  ...overrides,
});

// ─────────────────────────────────────────────
// sendMessage
// ─────────────────────────────────────────────
describe("sendMessage", () => {
  it("devuelve 400 si el mensaje está vacío", async () => {
    const req = mockReq({ body: { message: "   " } });
    const res = mockRes();
    await sendMessage(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "El mensaje es requerido", 400);
  });

  it("devuelve 502 si la IA lanza un error", async () => {
    ai.processChatMessage.mockRejectedValue(new Error("IA caída"));
    const req = mockReq({ body: { message: "Hola" } });
    const res = mockRes();
    await sendMessage(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "IA caída", 502);
  });

  it("devuelve 502 si la IA devuelve respuesta vacía", async () => {
    ai.processChatMessage.mockResolvedValue({ response: "" });
    const req = mockReq({ body: { message: "Hola" } });
    const res = mockRes();
    await sendMessage(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "La IA devolvió una respuesta vacía.", 502);
  });

  it("devuelve 200 con la respuesta correcta", async () => {
    ai.processChatMessage.mockResolvedValue({
      response: "Hola, ¿en qué te ayudo?",
      toolsUsed: [],
      context: {},
      suggestedTitle: "Chat 1",
    });
    const req = mockReq({ body: { message: "Hola" } });
    const res = mockRes();
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: "Hola, ¿en qué te ayudo?",
        }),
      })
    );
  });
});

// ─────────────────────────────────────────────
// getRecommendations
// ─────────────────────────────────────────────
describe("getRecommendations", () => {
  it("devuelve 401 si no hay usuario autenticado", async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    await getRecommendations(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(
      res,
      { message: "Usuario no autenticado" },
      401
    );
  });

  it("devuelve 200 con recomendaciones", async () => {
    ai.processChatMessage.mockResolvedValue({ response: "Te recomiendo..." });
    const req = mockReq({ query: { category: "cine", limit: 5 } });
    const res = mockRes();
    await getRecommendations(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Recomendaciones generadas correctamente" })
    );
  });

  it("devuelve 502 si la IA falla", async () => {
    ai.processChatMessage.mockRejectedValue(new Error("IA no disponible"));
    const req = mockReq({ query: {} });
    const res = mockRes();
    await getRecommendations(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "IA no disponible", 502);
  });
});

// ─────────────────────────────────────────────
// listChatConversations
// ─────────────────────────────────────────────
describe("listChatConversations", () => {
  it("devuelve 401 si no hay usuario", async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    await listChatConversations(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "Usuario no autenticado", 401);
  });

  it("devuelve 200 con la lista de conversaciones", async () => {
    chatPersistence.listConversations.mockResolvedValue([{ id: "conv1" }]);
    const req = mockReq({ query: { limit: 10 } });
    const res = mockRes();
    await listChatConversations(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: "conv1" }] })
    );
  });
});

// ─────────────────────────────────────────────
// getChatMessages
// ─────────────────────────────────────────────
describe("getChatMessages", () => {
  it("devuelve 401 si no hay usuario", async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    await getChatMessages(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "Usuario no autenticado", 401);
  });

  it("devuelve 400 si no hay conversationRef", async () => {
    const req = mockReq({ params: { conversationRef: "" } });
    const res = mockRes();
    await getChatMessages(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(
      res,
      "Identificador de conversación requerido",
      400
    );
  });

  it("devuelve 404 si no existe la conversación", async () => {
    chatPersistence.listMessages.mockResolvedValue({ conversation: null, messages: [] });
    const req = mockReq({ params: { conversationRef: "conv999" } });
    const res = mockRes();
    await getChatMessages(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "Conversación no encontrada", 404);
  });

  it("devuelve 200 con los mensajes", async () => {
    chatPersistence.listMessages.mockResolvedValue({
      conversation: { id: "conv1" },
      messages: [{ role: "user", content: "Hola" }],
    });
    const req = mockReq({ params: { conversationRef: "conv1" } });
    const res = mockRes();
    await getChatMessages(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversation: { id: "conv1" } }),
      })
    );
  });
});

// ─────────────────────────────────────────────
// deleteChatConversation
// ─────────────────────────────────────────────
describe("deleteChatConversation", () => {
  it("devuelve 401 si no hay usuario", async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    await deleteChatConversation(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "Usuario no autenticado", 401);
  });

  it("devuelve 404 si la conversación no existe", async () => {
    chatPersistence.softDeleteConversation.mockResolvedValue(false);
    const req = mockReq({ params: { conversationRef: "conv999" } });
    const res = mockRes();
    await deleteChatConversation(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "Conversación no encontrada", 404);
  });

  it("devuelve 200 si se elimina correctamente", async () => {
    chatPersistence.softDeleteConversation.mockResolvedValue(true);
    const req = mockReq({ params: { conversationRef: "conv1" } });
    const res = mockRes();
    await deleteChatConversation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "Conversación eliminada" });
  });
});