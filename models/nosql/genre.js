const mongoose = require('mongoose');

const genreSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  art_types: [{
    type: String,
    enum: ['film', 'music', 'literature', 'visual_art']
  }]
});

module.exports = mongoose.model('Genre', genreSchema);
