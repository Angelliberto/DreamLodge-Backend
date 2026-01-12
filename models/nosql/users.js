const mongoose = require('mongoose');

const usersModel = new mongoose.Schema({
  name: String,
  birthdate: Date,
  email: { type: String, unique: true, required: true },
  password: String,
  // Referencia al modelo Ocean (resultados del test de personalidad del usuario)
  oceanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ocean'
  },
  // Obras favoritas del usuario
  favoriteArtworks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artwork'
  }],
  // Obras que el usuario quiere ver o están pendientes
  pendingArtworks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artwork'
  }],
  two_fa_enabled: { type: Boolean, default: false },
  reset_token: String,         // para recuperación de contraseña
  deleted: { type: Boolean, default: false } // soft delete opcional
}, { timestamps: true });

module.exports = mongoose.model('users', usersModel);
