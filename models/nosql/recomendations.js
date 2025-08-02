const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  artwork_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Artwork', required: true },
  reason: String,
  created_at: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Recommendation', recommendationSchema);
