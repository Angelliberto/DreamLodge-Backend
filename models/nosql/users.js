const mongoose = require('mongoose');

const usersModel = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: String,
  preferences: {
    favorite_types: [String],
    favorite_genres: [String]
  },
  emotional_profile: {
    depth_preference: { type: String, enum: ['accesible', 'middle', 'deep', 'experimental'] },
    common_emotions: [String]
  }
}, { timestamps: true });

module.exports = mongoose.model('users', usersModel);
