/**
 * Normaliza respuestas de APIs externas al shape CulturalItem del cliente.
 * Compartido por feedCandidateResolver y globalSearchService.
 */
const { TMDB_IMG_W500 } = require("./tmdbShared");

function formatTag(tag) {
  if (!tag || typeof tag !== "string") return "";
  return tag
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatTags(tags) {
  if (!tags?.length) return [];
  return tags.map(formatTag).filter((t) => t.length > 0);
}

function adaptIGDB(game) {
  const year = game.first_release_date
    ? new Date(game.first_release_date * 1000).getFullYear().toString()
    : undefined;
  const genres = (game.genres || []).map((g) => g.name).filter(Boolean);
  const tags = [];
  const platforms = (game.platforms || [])
    .map((p) => p.name || p.abbreviation)
    .filter(Boolean);
  const other = [];
  (game.game_modes || []).forEach((m) => m.name && tags.push(m.name));
  (game.involved_companies || []).forEach((c) => {
    if (c.company?.name) other.push(c.company.name);
  });
  const allForFeed = [...genres, ...tags, ...platforms];
  const cover = game.cover?.url
    ? `https:${String(game.cover.url).replace("t_thumb", "t_720p")}`
    : "https://via.placeholder.com/400x600?text=No+Cover";
  return {
    id: `game-${game.id}`,
    originalId: game.id,
    source: "IGDB",
    category: "videojuegos",
    title: game.name,
    imageUrl: cover,
    creator: game.involved_companies?.[0]?.company?.name || "Desarrollador Desconocido",
    year,
    rating: game.rating ? Math.round(game.rating / 10) : undefined,
    description: game.summary,
    metadata: {
      genres: formatTags(allForFeed),
      tags: formatTags(tags),
      platforms: formatTags(platforms),
      other: formatTags(other),
      label: "IGDB",
    },
  };
}

function adaptTMDBMovie(movie, genreMap) {
  const genres = (movie.genre_ids || []).map((id) => genreMap[id]).filter(Boolean);
  const year = movie.release_date ? movie.release_date.split("-")[0] : undefined;
  const tags = [];
  const other = [];
  const allForFeed = [...genres, ...tags, ...other];
  return {
    id: `movie-${movie.id}`,
    originalId: movie.id,
    source: "TMDB",
    category: "cine",
    title: movie.title,
    imageUrl: movie.poster_path ? `${TMDB_IMG_W500}${movie.poster_path}` : "https://via.placeholder.com/400x600?text=No+Poster",
    creator: "Películas",
    year,
    rating: movie.vote_average ? parseFloat(Number(movie.vote_average).toFixed(1)) : undefined,
    description: movie.overview,
    metadata: {
      genres: formatTags(allForFeed),
      tags: formatTags(tags),
      platforms: [],
      other: formatTags(other),
      label: "TMDB",
      mediaType: "movie",
    },
  };
}

function adaptTMDBTv(show, genreMap) {
  const genres = (show.genre_ids || []).map((id) => genreMap[id]).filter(Boolean);
  const year = show.first_air_date ? show.first_air_date.split("-")[0] : undefined;
  const tags = [];
  const allForFeed = [...genres, ...tags];
  return {
    id: `tv-${show.id}`,
    originalId: show.id,
    source: "TMDB",
    category: "cine",
    title: show.name || "Serie",
    imageUrl: show.poster_path ? `${TMDB_IMG_W500}${show.poster_path}` : "https://via.placeholder.com/400x600?text=No+Poster",
    creator: "Series",
    year,
    rating: show.vote_average ? parseFloat(Number(show.vote_average).toFixed(1)) : undefined,
    description: show.overview,
    metadata: {
      genres: formatTags(allForFeed),
      tags: formatTags(tags),
      platforms: [],
      other: [],
      label: "TMDB TV",
      mediaType: "series",
    },
  };
}

function adaptSpotifyAlbum(album) {
  const image = album.images?.[0]?.url || "https://via.placeholder.com/400x400?text=No+Cover";
  const genres = [...(album.genres || [])];
  const tags = [];
  const platforms = [];
  // En feed priorizamos mostrar géneros reales del álbum/artista, no el tipo "Álbum".
  if (album.label) platforms.push(album.label);
  const allForFeed = [...genres, ...tags];
  return {
    id: `music-${album.id}`,
    originalId: album.id,
    source: "Spotify",
    category: "musica",
    title: album.name,
    imageUrl: image,
    creator: album.artists ? album.artists.map((a) => a.name).join(", ") : "Varios Artistas",
    year: album.release_date ? album.release_date.split("-")[0] : undefined,
    description: `Álbum con ${album.total_tracks} canciones.`,
    metadata: {
      genres: formatTags(allForFeed),
      tags: formatTags(tags),
      platforms: formatTags(platforms),
      other: [],
      duration: `${album.total_tracks} canciones`,
      label: "Spotify",
      contextLink: album.external_urls?.spotify,
    },
  };
}

function adaptBook(volumeItem) {
  const vol = volumeItem.volumeInfo || {};
  const id = volumeItem.id;
  const authors = (vol.authors || []).join(", ") || "Autor Desconocido";
  const imageUrl = vol.imageLinks?.thumbnail
    ? vol.imageLinks.thumbnail.replace("http:", "https:")
    : "https://via.placeholder.com/150";
  const genres = [...(vol.categories || [])];
  const tags = [];
  const platforms = [];
  const other = [];
  if (vol.language && vol.language !== "en") other.push(vol.language.toUpperCase());
  if (vol.publisher) platforms.push(vol.publisher);
  if (vol.printType) tags.push(formatTag(vol.printType));
  const allForFeed = [...genres, ...tags, ...platforms, ...other];
  return {
    id: `book-${id}`,
    originalId: id,
    source: "GoogleBooks",
    category: "literatura",
    title: vol.title || "Libro",
    imageUrl,
    creator: authors,
    year: vol.publishedDate ? vol.publishedDate.split("-")[0] : undefined,
    description: vol.description || "Toca para ver detalles",
    metadata: {
      genres: formatTags(allForFeed),
      tags: formatTags(tags),
      platforms: formatTags(platforms),
      other: formatTags(other),
      label: "Google Books",
      contextLink: vol.infoLink || `https://books.google.com/books?id=${id}`,
    },
  };
}

function adaptMet(art) {
  const full = art.full || {};
  const genres = [];
  const tags = [];
  const platforms = [art.source || "MET"];
  const other = [];
  if (full.medium) tags.push(full.medium);
  if (full.department) platforms.push(full.department);
  const allForFeed = [...genres, ...tags, ...platforms];
  return {
    id: `art-MET-${art.id}`,
    originalId: art.id,
    source: "MetMuseum",
    category: "arte-visual",
    title: art.title,
    imageUrl: art.imageUrl,
    creator: art.artist,
    year: full.objectDate || full.objectBeginDate,
    description: full.description || "Obra maestra clásica",
    metadata: {
      genres: formatTags(allForFeed),
      tags: formatTags(tags),
      platforms: formatTags(platforms),
      other: formatTags(other),
      label: "MET",
    },
  };
}

function adaptCmaArt(row) {
  const platforms = ["CMA"];
  const allForFeed = [...platforms];
  return {
    id: `art-CMA-${row.id}`,
    originalId: row.id,
    source: "ChicagoArt",
    category: "arte-visual",
    title: row.title,
    imageUrl: row.imageUrl,
    creator: row.artist,
    description: "Obra maestra clásica",
    metadata: {
      genres: formatTags(allForFeed),
      tags: [],
      platforms: formatTags(platforms),
      other: [],
      label: "CMA",
    },
  };
}

module.exports = {
  formatTag,
  formatTags,
  adaptIGDB,
  adaptTMDBMovie,
  adaptTMDBTv,
  adaptSpotifyAlbum,
  adaptBook,
  adaptMet,
  adaptCmaArt,
};
