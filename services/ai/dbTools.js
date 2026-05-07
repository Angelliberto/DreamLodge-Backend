/**
 * Acceso MongoDB para el agente IA (equivalente a dreamlodge_db.py).
 */
const mongoose = require("mongoose");
const { ArtworkModel, UserModel, OceanModel } = require("../../models");

function serializeObject(obj) {
  if (obj == null) return obj;
  if (obj instanceof mongoose.Types.ObjectId) return String(obj);
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map((item) => serializeObject(item));
  if (typeof obj === "object" && obj.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = serializeObject(v);
    }
    return out;
  }
  if (typeof obj === "object" && obj._doc) {
    return serializeObject(obj.toObject ? obj.toObject({ flattenMaps: true }) : { ...obj });
  }
  return obj;
}

function buildArtworkQuery({ category, source, title, genre }) {
  const query = {};
  if (category) query.category = category;
  if (source) query.source = source;
  if (title) query.title = { $regex: title, $options: "i" };
  if (!genre) return query;

  const genreQuery = {
    $or: [
      { description: { $regex: genre, $options: "i" } },
      { "metadata.genres": { $regex: genre, $options: "i" } },
    ],
  };
  if (Object.keys(query).length === 0) return genreQuery;
  return { $and: [query, genreQuery] };
}

async function searchArtworks({
  category,
  source,
  title,
  genre,
  limit = 20,
  page = 1,
}) {
  try {
    const q = buildArtworkQuery({ category, source, title, genre });
    const skip = (page - 1) * limit;
    const artworks = await ArtworkModel.find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await ArtworkModel.countDocuments(q);
    return {
      data: serializeObject(artworks),
      pagination: {
        page,
        limit,
        total,
        totalPages: limit ? Math.ceil(total / limit) : 0,
      },
    };
  } catch (e) {
    return { error: String(e.message || e), data: [] };
  }
}

async function getArtworkById(artworkId) {
  try {
    if (mongoose.Types.ObjectId.isValid(artworkId)) {
      const byOid = await ArtworkModel.findById(artworkId).lean();
      if (byOid) return { data: serializeObject(byOid) };
    }
    const byId = await ArtworkModel.findOne({ id: artworkId }).lean();
    if (!byId) return { error: "Artwork no encontrado" };
    return { data: serializeObject(byId) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getUserFavorites(userId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return { error: "ID de usuario inválido" };
    }
    const user = await UserModel.findById(userId).lean();
    if (!user) return { error: "Usuario no encontrado" };
    const favoriteIds = user.favoriteArtworks || [];
    if (!favoriteIds.length) return { data: [] };
    const list = await ArtworkModel.find({
      _id: { $in: favoriteIds },
    }).lean();
    return { data: serializeObject(list) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getUserPending(userId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return { error: "ID de usuario inválido" };
    }
    const user = await UserModel.findById(userId).lean();
    if (!user) return { error: "Usuario no encontrado" };
    const pendingIds = user.pendingArtworks || [];
    if (!pendingIds.length) return { data: [] };
    const list = await ArtworkModel.find({
      _id: { $in: pendingIds },
    }).lean();
    return { data: serializeObject(list) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getUserOceanResults(userId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return { error: "ID de usuario inválido" };
    }
    const oceanResults = await OceanModel.find({
      entityType: "user",
      entityId: new mongoose.Types.ObjectId(userId),
      deleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!oceanResults.length) {
      return {
        data: null,
        message: "No se encontraron resultados OCEAN para este usuario",
      };
    }
    return { data: serializeObject(oceanResults) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function searchUsers({ email, name, limit = 20 }) {
  try {
    const query = { deleted: { $ne: true } };
    if (email) query.email = email;
    if (name) query.name = { $regex: name, $options: "i" };
    const users = await UserModel.find(query)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();
    for (const u of users) {
      delete u.password;
      delete u.resetPasswordToken;
      delete u.resetPasswordTokenExpiration;
      delete u.reset_token;
    }
    return { data: serializeObject(users) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getArtworkOceanResults(artworkId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(artworkId)) {
      return { error: "ID de artwork inválido" };
    }
    const oceanResult = await OceanModel.findOne({
      entityType: "artwork",
      entityId: new mongoose.Types.ObjectId(artworkId),
      deleted: { $ne: true },
    }).lean();
    if (!oceanResult) {
      return {
        data: null,
        message: "No se encontraron resultados OCEAN para este artwork",
      };
    }
    return { data: serializeObject(oceanResult) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getStatistics() {
  try {
    const [totalArtworks, totalUsers, totalOcean] = await Promise.all([
      ArtworkModel.countDocuments({}),
      UserModel.countDocuments({ deleted: { $ne: true } }),
      OceanModel.countDocuments({ deleted: { $ne: true } }),
    ]);
    const categories = [
      "cine",
      "música",
      "literatura",
      "arte-visual",
      "videojuegos",
    ];
    const sources = [
      "IGDB",
      "TMDB",
      "GoogleBooks",
      "MetMuseum",
      "ChicagoArt",
      "Spotify",
    ];
    const categoryCounts = {};
    for (const c of categories) {
      categoryCounts[c] = await ArtworkModel.countDocuments({ category: c });
    }
    const sourceCounts = {};
    for (const s of sources) {
      sourceCounts[s] = await ArtworkModel.countDocuments({ source: s });
    }
    return {
      statistics: {
        total_artworks: totalArtworks,
        total_users: totalUsers,
        total_ocean_results: totalOcean,
        artworks_by_category: categoryCounts,
        artworks_by_source: sourceCounts,
      },
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getUserByEmail(email) {
  try {
    const user = await UserModel.findOne({
      email,
      deleted: { $ne: true },
    }).lean();
    if (!user) return { error: "Usuario no encontrado" };
    delete user.password;
    delete user.resetPasswordToken;
    delete user.resetPasswordTokenExpiration;
    delete user.reset_token;
    return { data: serializeObject(user) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getUserBasicInfo(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  try {
    const user = await UserModel.findById(userId).lean();
    if (!user) return null;
    return { name: user.name, email: user.email };
  } catch {
    return null;
  }
}

module.exports = {
  searchArtworks,
  getArtworkById,
  getUserFavorites,
  getUserPending,
  getUserOceanResults,
  searchUsers,
  getArtworkOceanResults,
  getStatistics,
  getUserByEmail,
  getUserBasicInfo,
};
