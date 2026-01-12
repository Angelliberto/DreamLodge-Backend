const mongoose = require('mongoose');


const artworkSchema = new mongoose.Schema({
  // Identificadores
  id: { type: String, required: true, unique: true }, // ID único global (ej: "movie-550")
  originalId: { type: mongoose.Schema.Types.Mixed, required: true }, // ID en la API original (puede ser string o number)
  source: {
    type: String,
    enum: ['IGDB', 'TMDB', 'GoogleBooks', 'MetMuseum', 'ChicagoArt', 'Spotify'],
    required: true
  },
  
  // Datos Principales
  title: { type: String, required: true },
  category: {
    type: String,
    enum: ['cine', 'música', 'literatura', 'arte-visual', 'videojuegos'],
    required: true
  },
  imageUrl: { type: String, required: true }, // URL de alta calidad
  
  // Detalles Creativos
  creator: { type: String, required: true }, // Director, Autor, Desarrollador o Artista
  year: String, // Año de lanzamiento (string para flexibilidad)
  
  // Datos Adicionales
  description: String,
  rating: Number, // Normalizado a escala 0-10
  
  // Metadatos Específicos (Lo que hace único a cada tipo)
  metadata: {
    genres: [String], // Géneros (Acción, Impresionismo, Jazz)
    duration: String, // "120 min", "350 págs", "12 tracks"
    label: String, // "Nintendo", "Sony Music", "Oleo sobre lienzo"
    contextLink: String // Link a la web original o app
  },
  
  // Legacy fields (kept for backward compatibility if needed)
  tone_tags: [String], 
  depth_emotional: Number, 
  depth_artistic: Number
}, { timestamps: true });

// Índices para búsquedas más rápidas
artworkSchema.index({ id: 1 });
artworkSchema.index({ category: 1 });
artworkSchema.index({ source: 1 });

module.exports = mongoose.model('Artwork', artworkSchema);
