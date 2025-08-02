const mongoose = require('mongoose');

const creativeIdeaSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: String,
  interpreted_tags: [String], // e.g. ["memory", "loneliness"]
  recommended_artworks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artwork' }],
  tags_by_user: [String],
  emotion_tags_IA: [String], // ["anxiety", "freedom"]
  ai_conversations: [{
    text: String,
    response: String,
  }]
}, { timestamps: true });

module.exports = mongoose.model('CreativeIdea', creativeIdeaSchema);
