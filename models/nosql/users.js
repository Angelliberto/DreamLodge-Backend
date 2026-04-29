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
  // Obras marcadas como "no me gustó"
  dislikedArtworks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artwork'
  }],
  // Obras que el usuario ya vio/consumió
  seenArtworks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artwork'
  }],
  // Obras que el usuario no quiere volver a ver en recomendaciones
  notInterestedArtworks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Artwork'
  }],
  validated_email: { type: Boolean, default: false },
  emailValidationCode: {
    type: String,
    default: null
  },
  emailValidationCodeExpiration: {
    type: Date,
    default: null
  },
  emailValidationAttempts: {
    type: Number,
    default: 0
  },
  two_fa_enabled: { type: Boolean, default: false },
  reset_token: String,         // para recuperación de contraseña
  resetPasswordToken: String,   // token para reset de contraseña
  resetPasswordTokenExpiration: Date, // expiración del token de reset
  deleted: { type: Boolean, default: false } // soft delete opcional
}, { timestamps: true });

module.exports = mongoose.model('users', usersModel);
