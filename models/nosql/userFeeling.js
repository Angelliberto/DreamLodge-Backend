const mongoose = require('mongoose');

const userEmotionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  artwork_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Artwork', required: true },
  emotions_felt: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user_emotion' }],
  reflection: String,
  rated_depth_emotional: Number
}, { timestamps: true });

module.exports = mongoose.model('UserEmotion', userEmotionSchema);
