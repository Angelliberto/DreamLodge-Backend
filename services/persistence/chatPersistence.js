const mongoose = require("mongoose");
const { ChatConversationModel, ChatMessageModel } = require("../../models");

const OID_HEX = /^[a-fA-F0-9]{24}$/;

function toObjectId(userId) {
  if (!userId) return null;
  if (userId instanceof mongoose.Types.ObjectId) return userId;
  const s = String(userId);
  return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : null;
}

function isMongoIdString(id) {
  return typeof id === "string" && OID_HEX.test(id.trim());
}

/**
 * Busca conversación por _id de Mongo o por clientKey del cliente.
 */
async function getConversationForUser(userId, conversationParam) {
  const uid = toObjectId(userId);
  if (!uid) return null;
  const param = String(conversationParam || "").trim();
  if (!param) return null;

  if (isMongoIdString(param)) {
    const byId = await ChatConversationModel.findOne({
      _id: param,
      userId: uid,
      deleted: { $ne: true },
    });
    if (byId) return byId;
  }

  return ChatConversationModel.findOne({
    userId: uid,
    clientKey: param,
    deleted: { $ne: true },
  });
}

/**
 * Crea o devuelve la conversación asociada al clientKey (id local del front).
 */
async function upsertConversationByClientKey(userId, clientKey, { title, contextItems } = {}) {
  const uid = toObjectId(userId);
  if (!uid || !String(clientKey || "").trim()) return null;
  const key = String(clientKey).trim().slice(0, 256);

  let conv = await ChatConversationModel.findOne({
    userId: uid,
    clientKey: key,
    deleted: { $ne: true },
  });
  if (!conv) {
    conv = await ChatConversationModel.create({
      userId: uid,
      clientKey: key,
      title:
        typeof title === "string" && title.trim()
          ? title.trim().slice(0, 200)
          : "Nueva conversación",
      contextItems: Array.isArray(contextItems) ? contextItems : [],
    });
    return conv;
  }
  if (typeof title === "string" && title.trim()) {
    const t = title.trim().slice(0, 200);
    if (t !== conv.title) conv.title = t;
  }
  if (Array.isArray(contextItems)) {
    conv.contextItems = contextItems;
  }
  await conv.save();
  return conv;
}

async function appendMessage(conversationId, userId, role, text) {
  const uid = toObjectId(userId);
  const cid =
    conversationId instanceof mongoose.Types.ObjectId
      ? conversationId
      : new mongoose.Types.ObjectId(String(conversationId));
  if (!uid || !text || !String(text).trim()) return null;
  const clean = String(text).trim().slice(0, 48000);
  const doc = await ChatMessageModel.create({
    conversationId: cid,
    userId: uid,
    role: role === "assistant" ? "assistant" : "user",
    text: clean,
  });
  await ChatConversationModel.updateOne({ _id: cid }, { $set: { updatedAt: new Date() } });
  return doc;
}

/**
 * Historial para el prompt (orden cronológico, rol user|assistant maps a processChatMessage).
 */
async function getRecentHistory(conversationId, limit = 14) {
  const cid =
    conversationId instanceof mongoose.Types.ObjectId
      ? conversationId
      : new mongoose.Types.ObjectId(String(conversationId));
  const n = Math.max(1, Math.min(40, Number(limit) || 14));
  const rows = await ChatMessageModel.find({ conversationId: cid })
    .sort({ createdAt: -1 })
    .limit(n)
    .select({ role: 1, text: 1 })
    .lean();

  return rows.reverse().map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.text || "",
  }));
}

async function listConversations(userId, { limit = 80 } = {}) {
  const uid = toObjectId(userId);
  if (!uid) return [];
  const cap = Math.max(1, Math.min(200, Number(limit) || 80));
  const rows = await ChatConversationModel.find({ userId: uid, deleted: { $ne: true } })
    .sort({ updatedAt: -1 })
    .limit(cap)
    .select({ clientKey: 1, title: 1, updatedAt: 1, createdAt: 1 })
    .lean();
  return rows.map((r) => ({
    id: String(r._id),
    clientKey: r.clientKey,
    title: r.title || "Nueva conversación",
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
  }));
}

async function listMessages(userId, conversationParam, { limit = 500 } = {}) {
  const conv = await getConversationForUser(userId, conversationParam);
  if (!conv) return { conversation: null, messages: [] };
  const cap = Math.max(1, Math.min(1000, Number(limit) || 500));
  const rows = await ChatMessageModel.find({ conversationId: conv._id })
    .sort({ createdAt: 1 })
    .limit(cap)
    .lean();
  return {
    conversation: {
      id: String(conv._id),
      clientKey: conv.clientKey,
      title: conv.title,
      contextItems: conv.contextItems || [],
    },
    messages: rows.map((m) => ({
      id: String(m._id),
      role: m.role,
      text: m.text,
      createdAt: m.createdAt,
    })),
  };
}

async function softDeleteConversation(userId, conversationParam) {
  const conv = await getConversationForUser(userId, conversationParam);
  if (!conv) return false;
  await ChatConversationModel.updateOne({ _id: conv._id }, { $set: { deleted: true } });
  return true;
}

module.exports = {
  getConversationForUser,
  upsertConversationByClientKey,
  appendMessage,
  getRecentHistory,
  listConversations,
  listMessages,
  softDeleteConversation,
  isMongoIdString,
};
