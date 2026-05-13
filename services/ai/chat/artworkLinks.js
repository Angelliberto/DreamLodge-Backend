/**
 * URL pública para que el usuario abra/consulte una obra (TMDB, Spotify, etc.).
 * Prioriza metadata.contextLink; si falta, deriva desde source + originalId.
 */
function igdbContextLinkIsSteam(url) {
  return typeof url === "string" && /store\.steampowered\.com/i.test(url);
}

function steamConsumptionUrlForIgdbArtwork(artwork) {
  const meta = artwork.metadata || {};
  const steamRaw = meta.steamAppId;
  const steamApp = steamRaw != null && steamRaw !== "" ? String(steamRaw).trim() : "";
  if (steamApp && /^\d+$/.test(steamApp)) {
    return `https://store.steampowered.com/app/${encodeURIComponent(steamApp)}/`;
  }
  const title = typeof artwork.title === "string" ? artwork.title.trim() : "";
  if (title) {
    return `https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`;
  }
  return "";
}

function buildArtworkConsumptionUrl(artwork) {
  if (!artwork || typeof artwork !== "object") return "";

  const source = String(artwork.source || "");
  const raw = artwork.metadata && typeof artwork.metadata.contextLink === "string"
    ? artwork.metadata.contextLink.trim()
    : "";
  if (raw && /^https?:\/\//i.test(raw)) {
    if (source === "IGDB" && /\.igdb\.com/i.test(raw)) {
      /* legacy: enlaces a IGDB se sustituyen por Steam */
    } else if (source === "IGDB" && !igdbContextLinkIsSteam(raw)) {
      /* contextLink no-Steam en juegos: preferir Steam */
    } else {
      return raw;
    }
  }

  const oid = artwork.originalId;
  const strId = oid != null && oid !== "" ? String(oid) : "";

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

  if (source === "IGDB") {
    const steam = steamConsumptionUrlForIgdbArtwork(artwork);
    if (steam) return steam;
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
