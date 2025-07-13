const mongoose = require('mongoose');

const artworkSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: {
    type: String,
    enum: ['cinema', 'music', 'literature', 'visual_art'],
    required: true
  },
  genres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Genre' }],
  description: String,
  author: String,
  release_date: Date,
  link: String,
  source: String,
  image_url: String,
  tone_tags: [String], 
  depth_emotional: Number, 
  depth_artistic: Number,

  // Optional fields depending on type
  duration: Number,  // minutes or seconds
  pages: Number,     // for books
  medium: String     // for art visuals (oil, digital, etc.)
}, { timestamps: true });

module.exports = mongoose.model('Artwork', artworkSchema);
