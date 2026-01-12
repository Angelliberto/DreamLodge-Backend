const mongoose = require('mongoose');

const genreSchema = new mongoose.Schema({
  // Nombre del género
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // Géneros padres (géneros superiores en la jerarquía)
  parentGenres: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Genre'
  }],
  
  // Géneros hijos (subgéneros)
  childGenres: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Genre'
  }],
  
  // Descripción del género
  description: {
    type: String,
    trim: true
  },
  
  // Referencia al modelo Ocean (resultados del test para este género)
  oceanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ocean'
  },
  
  // Soft delete
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

// Índices para búsquedas más rápidas
// Nota: 'name' ya tiene índice por 'unique: true', no duplicar
genreSchema.index({ oceanId: 1 });

module.exports = mongoose.model('Genre', genreSchema);
