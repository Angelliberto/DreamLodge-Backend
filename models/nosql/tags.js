const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  // Slug hashtag (minúsculas, sin espacios), ej. drama, jazz — mismo espíritu que géneros en obras
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Reservado / legado; las sugerencias actuales son solo hashtags simples
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
