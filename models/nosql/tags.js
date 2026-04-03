const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Orientación corta para el modelo de recomendación / IA
  aiHint: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  oceanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ocean'
  },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

tagSchema.index({ oceanId: 1 });

module.exports = mongoose.model('Tag', tagSchema);
