const mongoose = require('mongoose');

const oceanSchema = new mongoose.Schema({
  // Tipo de entidad relacionada (usuario, artwork o tag)
  entityType: {
    type: String,
    enum: ['user', 'artwork', 'tag'],
    required: true
  },
  
  // Referencia a la entidad (puede ser User, Artwork o Tag)
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'entityType'
  },
  
  // Puntuaciones por dimensión: { trait: { total: number, ...subfacetScores } }
  // Mixed permite Mini-IPIP (solo total) y test profundo AB5C/IPIP (múltiples subfacetas).
  scores: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Puntuación total general (opcional)
  totalScore: Number,
  
  // Tipo de test realizado (quick o deep)
  testType: {
    type: String,
    enum: ['quick', 'deep'],
    default: 'quick'
  },
  
  // Descripción artística generada por el agente IA
  artisticDescription: {
    type: String,
    default: null
  },
  
  // Soft delete
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

// Índices para búsquedas más rápidas
oceanSchema.index({ entityType: 1, entityId: 1 });
oceanSchema.index({ entityType: 1 });
oceanSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Ocean', oceanSchema);
