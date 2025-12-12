const mongoose = require('mongoose');

const usersModel = new mongoose.Schema({
  name: String,
  birthdate: Date,
  email: { type: String, unique: true, required: true },
  password: String,
  preferences: {
    favorite_types: [String],   
    favorite_genres: [String]   
  },
  emotional_profile: {
    depth_preference: { type: String, enum: ['accesible', 'middle', 'deep', 'experimental'] },
    common_emotions: [String], 
    style: String             
  },
  two_fa_enabled: { type: Boolean, default: false },
  reset_token: String,         // para recuperación de contraseña
  deleted: { type: Boolean, default: false } // soft delete opcional
}, { timestamps: true });

module.exports = mongoose.model('users', usersModel);
