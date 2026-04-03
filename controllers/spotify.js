const { getSpotifyClientCredentialsPayload } = require("../services/spotifyClient");

exports.getAppAccessToken = async (req, res) => {
  try {
    const payload = await getSpotifyClientCredentialsPayload();
    res.json(payload);
  } catch (error) {
    if (error.code === "SPOTIFY_ENV") {
      return res.status(500).json({
        error: "ENVIRONMENT_ERROR",
        details: "Client ID o Client Secret no están cargados en el backend. Revisa tu archivo .env.",
      });
    }
    const status = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : {};
    console.error("Spotify token error:", status, errorData);
    res.status(status).json({
      error: "TOKEN_FETCH_FAILED",
      details: errorData,
      status,
    });
  }
};
