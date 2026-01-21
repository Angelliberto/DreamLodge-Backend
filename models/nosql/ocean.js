const mongoose = require('mongoose');

const oceanSchema = new mongoose.Schema({
  // Tipo de entidad relacionada (usuario, artwork o genre)
  entityType: {
    type: String,
    enum: ['user', 'artwork', 'genre'],
    required: true
  },
  
  // Referencia a la entidad (puede ser User, Artwork o Genre)
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'entityType'
  },
  
  // Puntuaciones por dimensión (facetas principales)
  scores: {
    openness: {
      imagination: Number,
      aesthetics: Number,
      feelings: Number,
      intellectual_curiosity: Number,
      values_and_new_ideas: Number,
      total: Number  // Suma de todas las subfacetas de openness
    },
    conscientiousness: {
      order: Number,
      competence: Number,
      dutifulness: Number,
      self_discipline: Number,
      deliberation: Number,
      total: Number
    },
    extraversion: {
      friendliness: Number,
      gregariousness: Number,
      assertiveness: Number,
      activity: Number,
      excitement_seeking: Number,
      total: Number
    },
    agreeableness: {
      trust: Number,
      morality: Number,
      altruism: Number,
      cooperation: Number,
      modesty: Number,
      total: Number
    },
    neuroticism: {
      anxiety: Number,
      anger: Number,
      depression: Number,
      self_consciousness: Number,
      immoderation: Number,
      total: Number
    }
  },
  
  // Puntuación total general (opcional)
  totalScore: Number,
  
  // Tipo de test realizado (quick o deep)
  testType: {
    type: String,
    enum: ['quick', 'deep'],
    default: 'quick'
  },
  
  // Soft delete
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

// Índices para búsquedas más rápidas
oceanSchema.index({ entityType: 1, entityId: 1 });
oceanSchema.index({ entityType: 1 });
oceanSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Ocean', oceanSchema);
