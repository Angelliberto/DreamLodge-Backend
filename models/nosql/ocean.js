const mongoose = require('mongoose');

const oceanSchema = new mongoose.Schema({
  // Tipo de entidad relacionada (usuario u obra en catálogo)
  entityType: {
    type: String,
    enum: ['user', 'artwork'],
    required: true
  },
  
  // Referencia a la entidad (User o Artwork)
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

  /** Escala de respuesta del cuestionario: IPIP 1–5 frente al legado interno −2/+2 */
  responseScale: {
    type: String,
    enum: ['ipip_1_5', 'legacy_neg2_pos2'],
    default: 'legacy_neg2_pos2',
  },

  /**
   * Cómo se interpretan `scores.*.total` y facetas guardadas:
   * - ipip_mean_1_5: media Likert 1–5 (ítems recodificados, alineado IPIP)
   * - display_affine_05: legado ((media−1)/4)*5
   */
  scoreMetric: {
    type: String,
    enum: ['display_affine_05', 'ipip_mean_1_5'],
    default: 'display_affine_05',
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
