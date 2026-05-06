const mongoose = require("mongoose");

/**
 * Conversación de chat IA por usuario.
 * clientKey: id estable que envía el cliente (p. ej. conv_xxx de AsyncStorage) para no forzar ObjectId en el front.
 */
const chatConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    clientKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    title: { type: String, default: "Nueva conversación", trim: true, maxlength: 200 },
    contextItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

chatConversationSchema.index({ userId: 1, clientKey: 1 }, { unique: true });
chatConversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model("ChatConversation", chatConversationSchema);
