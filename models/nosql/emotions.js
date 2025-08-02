const mongoose = require('mongoose');

const emotionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, 
  description: { type: String, required: true },         
  category: {
    type: String,
    enum: ['positive', 'negative', 'mixed', 'deep'], 
    required: true
  },
  symbolic_tags: [String],       // Ej: ["nostalgia", "memoria", "soledad"]

}, { timestamps: true });

module.exports = mongoose.model('Emotion', emotionSchema);
