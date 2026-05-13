/**
 * URL pública para que el usuario abra/consulte una obra (TMDB, Spotify, etc.).
 * Prioriza metadata.contextLink; si falta, deriva desde source + originalId.
 */
function buildArtworkConsumptionUrl(artwork) {
  if (!artwork || typeof artwork !== "object") return "";

  const source = String(artwork.source || "");
  const oid = artwork.originalId;
  const strId = oid != null && oid !== "" ? String(oid) : "";

  if (source === "IGDB" && strId) {
    return `https://www.igdb.com/games/${encodeURIComponent(strId)}`;
  }

  const raw = artwork.metadata && typeof artwork.metadata.contextLink === "string"
    ? artwork.metadata.contextLink.trim()
    : "";
  if (raw && /^https?:\/\//i.test(raw)) return raw;

  if (source === "TMDB" && strId) {
    const mediaType = artwork.metadata && artwork.metadata.mediaType;
    if (mediaType === "series") {
      return `https://www.themoviedb.org/tv/${encodeURIComponent(strId)}`;
    }
    return `https://www.themoviedb.org/movie/${encodeURIComponent(strId)}`;
  }

  if (source === "Spotify" && strId) {
    return `https://open.spotify.com/album/${encodeURIComponent(strId)}`;
  }

  if (source === "GoogleBooks") {
    const bid =
      strId ||
      String(artwork.id || "")
        .replace(/^book-/i, "")
        .trim();
    if (bid) {
      return `https://books.google.com/books?id=${encodeURIComponent(bid)}&hl=es`;
    }
  }

  if (source === "MetMuseum" && strId) {
    return `https://www.metmuseum.org/art/collection/search/${encodeURIComponent(strId)}`;
  }

  if (source === "ChicagoArt" && strId) {
    return `https://www.artic.edu/artworks/${encodeURIComponent(strId)}`;
  }

  return "";
}

module.exports = {
  buildArtworkConsumptionUrl,
};
