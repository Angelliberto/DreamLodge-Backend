const mongoose = require('mongoose');

const emotionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  is_primary: { type: Boolean, default: false },
  parent_emotions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Emotion' }],
}, { timestamps: true });

module.exports = mongoose.model('Emotion', emotionSchema);
