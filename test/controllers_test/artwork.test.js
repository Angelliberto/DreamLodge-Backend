const {
  getArtworkById,
  getAllArtworks,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  addToPending,
  removeFromPending,
  getPending,
  addToDisliked,
  removeFromDisliked,
  getDisliked,
  addToSeen,
  removeFromSeen,
  getSeen,
  addToNotInterested,
  removeFromNotInterested,
  getNotInterested,
  getSimilarArtworks,
  postTranslateArtworkDescription,
  postEnrichSpotifyAlbumDescription,
} = require("../../controllers/artworks");

const { ArtworkModel, UserModel } = require("../../models");
const { handleHTTPError } = require("../../utils/handleHTTPError");
const ai = require("../../services/ai");
const { resolveCuratedFeedCandidates } = require("../../services/search/feedCandidateResolver");
const { enrichSpotifyAlbumDescriptionIfNeeded } = require("../../services/ai/content/albumDescriptionEnricher");
const { translateDescriptionToSpanishIfNeeded } = require("../../services/ai/content/descriptionSpanishTranslator");
const { clearPersonalizedFeedCacheForUser } = require("../../controllers/feed");
const mongoose = require("mongoose");

jest.mock("../../models");
jest.mock("../../utils/handleHTTPError");
jest.mock("../../services/ai");
jest.mock("../../services/search/feedCandidateResolver");
jest.mock("../../services/ai/content/albumDescriptionEnricher");
jest.mock("../../services/ai/content/descriptionSpanishTranslator");
jest.mock("../../controllers/feed");
jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  return {
    ...actual,
    startSession: jest.fn().mockResolvedValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    }),
    Types: {
      ObjectId: {
        isValid: jest.fn().mockReturnValue(true),
      },
    },
  };
});

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

beforeEach(() => {
  jest.clearAllMocks();
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides = {}) => ({
  query: {},
  body: {},
  params: {},
  headers: {},
  originalUrl: "/test",
  user: { _id: "user123" },
  ...overrides,
});

const mockArtwork = {
  id: "art_123",
  originalId: "orig_123",
  source: "TMDB",
  title: "Batman",
  category: "cine",
  imageUrl: "http://img.com/batman.jpg",
  creator: "Tim Burton",
  year: 1989,
  description: "Una película de Batman",
  metadata: {},
};

// ─────────────────────────────────────────────
// getArtworkById
// ─────────────────────────────────────────────
describe("getArtworkById", () => {
  it("devuelve 400 si no hay id", async () => {
    const req = mockReq({ params: { id: "" } });
    const res = mockRes();
    await getArtworkById(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "ID es requerido" }, 400);
  });

  it("devuelve 404 si no existe la obra", async () => {
    ArtworkModel.findOne.mockResolvedValue(null);
    const req = mockReq({ params: { id: "art_123" } });
    const res = mockRes();
    await getArtworkById(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "Obra no encontrada" }, 404);
  });

  it("devuelve 200 con la obra encontrada", async () => {
    ArtworkModel.findOne.mockResolvedValue({
      ...mockArtwork,
      toObject: () => mockArtwork,
      _id: "mongo_123",
    });
    enrichSpotifyAlbumDescriptionIfNeeded.mockResolvedValue({ description: null });
    const req = mockReq({ params: { id: "art_123" } });
    const res = mockRes();
    await getArtworkById(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Object) }));
  });

  it("devuelve 500 si ocurre un error", async () => {
    ArtworkModel.findOne.mockRejectedValue(new Error("DB error"));
    const req = mockReq({ params: { id: "art_123" } });
    const res = mockRes();
    await getArtworkById(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, expect.objectContaining({ message: "Error al obtener la obra" }), 500);
  });
});

// ─────────────────────────────────────────────
// getAllArtworks
// ─────────────────────────────────────────────
describe("getAllArtworks", () => {
  it("devuelve 200 con lista de obras", async () => {
    ArtworkModel.find.mockReturnValue({
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([mockArtwork]),
    });
    ArtworkModel.countDocuments.mockResolvedValue(1);
    const req = mockReq({ query: { page: "1", limit: "20" } });
    const res = mockRes();
    await getAllArtworks(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
  });

  it("devuelve 500 si ocurre un error", async () => {
    ArtworkModel.find.mockReturnValue({
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      sort: jest.fn().mockRejectedValue(new Error("DB error")),
    });
    const req = mockReq();
    const res = mockRes();
    await getAllArtworks(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, expect.objectContaining({ message: "Error al obtener las obras" }), 500);
  });
});

// ─────────────────────────────────────────────
// getFavorites
// ─────────────────────────────────────────────
describe("getFavorites", () => {
  it("devuelve 404 si no existe el usuario", async () => {
    UserModel.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    const req = mockReq();
    const res = mockRes();
    await getFavorites(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "Usuario no encontrado" }, 404);
  });

  it("devuelve 200 con los favoritos del usuario", async () => {
    UserModel.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ favoriteArtworks: [mockArtwork] }),
    });
    const req = mockReq();
    const res = mockRes();
    await getFavorites(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [mockArtwork] });
  });
});

// ─────────────────────────────────────────────
// addToFavorites
// ─────────────────────────────────────────────
describe("addToFavorites", () => {
  it("devuelve 400 si no hay artwork en el body", async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await addToFavorites(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "Los datos de la obra son requeridos" }, 400);
  });

  it("devuelve 404 si no existe el usuario", async () => {
    ArtworkModel.findOne.mockResolvedValue({ _id: "mongo_123", toObject: () => mockArtwork });
    ArtworkModel.create.mockResolvedValue({ _id: "mongo_123" });
    UserModel.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
    const req = mockReq({ body: { artwork: mockArtwork } });
    const res = mockRes();
    await addToFavorites(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "Usuario no encontrado" }, 404);
  });

  it("devuelve 200 si la obra ya está en favoritos", async () => {
    const artworkId = "mongo_123";
    ArtworkModel.findOne.mockResolvedValue({ _id: artworkId, toObject: () => mockArtwork });
    UserModel.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue({
        favoriteArtworks: [artworkId],
        includes: jest.fn().mockReturnValue(true),
      }),
    });
    const req = mockReq({ body: { artwork: mockArtwork } });
    const res = mockRes();
    await addToFavorites(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─────────────────────────────────────────────
// removeFromFavorites
// ─────────────────────────────────────────────
describe("removeFromFavorites", () => {
  it("devuelve 400 si no hay artworkId", async () => {
    const req = mockReq({ params: { artworkId: "" } });
    const res = mockRes();
    await removeFromFavorites(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "El ID de la obra es requerido" }, 400);
  });

  it("devuelve 404 si no existe el usuario", async () => {
    UserModel.findByIdAndUpdate.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    const req = mockReq({ params: { artworkId: "a".repeat(24) } });
    const res = mockRes();
    await removeFromFavorites(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "Usuario no encontrado" }, 404);
  });

  it("devuelve 200 al remover correctamente", async () => {
    UserModel.findByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ favoriteArtworks: [] }),
    });
    const req = mockReq({ params: { artworkId: "a".repeat(24) } });
    const res = mockRes();
    await removeFromFavorites(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─────────────────────────────────────────────
// getPending
// ─────────────────────────────────────────────
describe("getPending", () => {
  it("devuelve 404 si no existe el usuario", async () => {
    UserModel.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    const req = mockReq();
    const res = mockRes();
    await getPending(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "Usuario no encontrado" }, 404);
  });

  it("devuelve 200 con los guardados del usuario", async () => {
    UserModel.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ pendingArtworks: [mockArtwork] }),
    });
    const req = mockReq();
    const res = mockRes();
    await getPending(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [mockArtwork] });
  });
});

// ─────────────────────────────────────────────
// getDisliked / getSeen / getNotInterested
// ─────────────────────────────────────────────
describe.each([
  ["getDisliked", getDisliked, "dislikedArtworks"],
  ["getSeen", getSeen, "seenArtworks"],
  ["getNotInterested", getNotInterested, "notInterestedArtworks"],
])("%s", (name, fn, field) => {
  it("devuelve 404 si no existe el usuario", async () => {
    UserModel.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    const req = mockReq();
    const res = mockRes();
    await fn(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "Usuario no encontrado" }, 404);
  });

  it("devuelve 200 con la lista correcta", async () => {
    UserModel.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ [field]: [mockArtwork] }),
    });
    const req = mockReq();
    const res = mockRes();
    await fn(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [mockArtwork] });
  });
});

// ─────────────────────────────────────────────
// getSimilarArtworks
// ─────────────────────────────────────────────
describe("getSimilarArtworks", () => {
  it("devuelve 400 si faltan title o category", async () => {
    const req = mockReq({ body: { artwork: { title: "", category: "" } } });
    const res = mockRes();
    await getSimilarArtworks(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "artwork.title y artwork.category son requeridos" }, 400);
  });

  it("devuelve 200 con obras similares", async () => {
    ai.recommendSimilarWorks.mockResolvedValue({ candidates: [mockArtwork] });
    resolveCuratedFeedCandidates.mockResolvedValue([{ ...mockArtwork, title: "Superman" }]);
    const req = mockReq({ body: { artwork: { title: "Batman", category: "cine" } } });
    const res = mockRes();
    await getSimilarArtworks(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ items: expect.any(Array) }) }));
  });

  it("devuelve 500 si la IA falla", async () => {
    ai.recommendSimilarWorks.mockRejectedValue(new Error("IA caída"));
    resolveCuratedFeedCandidates.mockRejectedValue(new Error("IA caída"));
    // título diferente para evitar la caché interna
    const req = mockReq({ body: { artwork: { title: "Joker", category: "cine" } } });
    const res = mockRes();
    await getSimilarArtworks(req, res);
    expect(handleHTTPError).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// postTranslateArtworkDescription
// ─────────────────────────────────────────────
describe("postTranslateArtworkDescription", () => {
  it("devuelve 400 si el texto está vacío", async () => {
    const req = mockReq({ body: { text: "" } });
    const res = mockRes();
    await postTranslateArtworkDescription(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "text es requerido" }, 400);
  });

  it("devuelve 503 si Gemini no está configurado", async () => {
    ai.isGeminiConfigured.mockReturnValue(false);
    const req = mockReq({ body: { text: "Some description" } });
    const res = mockRes();
    await postTranslateArtworkDescription(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, expect.objectContaining({ message: expect.stringContaining("Traducción no disponible") }), 503);
  });

  it("devuelve 200 con el texto traducido", async () => {
    ai.isGeminiConfigured.mockReturnValue(true);
    translateDescriptionToSpanishIfNeeded.mockResolvedValue({ text: "Descripción en español", alreadySpanish: false });
    const req = mockReq({ body: { text: "Some description" } });
    const res = mockRes();
    await postTranslateArtworkDescription(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { text: "Descripción en español", alreadySpanish: false } });
  });
});

// ─────────────────────────────────────────────
// postEnrichSpotifyAlbumDescription
// ─────────────────────────────────────────────
describe("postEnrichSpotifyAlbumDescription", () => {
  it("devuelve 400 si no hay artwork en el body", async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await postEnrichSpotifyAlbumDescription(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "artwork es requerido" }, 400);
  });

  it("devuelve 200 con la descripción enriquecida", async () => {
    ArtworkModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    enrichSpotifyAlbumDescriptionIfNeeded.mockResolvedValue({ description: "Descripción enriquecida" });
    ArtworkModel.updateOne.mockResolvedValue({ matchedCount: 1 });
    const req = mockReq({ body: { artwork: mockArtwork } });
    const res = mockRes();
    await postEnrichSpotifyAlbumDescription(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ description: "Descripción enriquecida" }) }));
  });

  it("devuelve 500 si ocurre un error", async () => {
    enrichSpotifyAlbumDescriptionIfNeeded.mockRejectedValue(new Error("DB error"));
    ArtworkModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const req = mockReq({ body: { artwork: mockArtwork } });
    const res = mockRes();
    await postEnrichSpotifyAlbumDescription(req, res);
    expect(handleHTTPError).toHaveBeenCalled();
  });
});