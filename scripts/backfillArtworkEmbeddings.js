/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");
const { ArtworkModel } = require("../models");
const { DreamLodgeAIAgent } = require("../services/ai/dreamLodgeAiAgent");
const { embedText, buildArtworkEmbeddingText, EMBEDDING_MODEL } = require("../services/ai/embeddingService");

function parseArgs(argv) {
  const out = { limit: 0, force: false };
  for (const raw of argv || []) {
    const part = String(raw || "").trim();
    if (!part) continue;
    if (part === "--force") out.force = true;
    if (part.startsWith("--limit=")) {
      const n = Number(part.split("=")[1]);
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
    }
  }
  return out;
}

function needsEmbedding(row, force) {
  if (force) return true;
  if (!Array.isArray(row?.embedding) || !row.embedding.length) return true;
  if (!row?.embeddingModel) return true;
  return row.embeddingModel !== EMBEDDING_MODEL;
}

async function run() {
  const { limit, force } = parseArgs(process.argv.slice(2));
  const dbUri = String(process.env.DB_URI || "").trim();
  if (!dbUri) {
    throw new Error("DB_URI no está configurada.");
  }

  const agent = new DreamLodgeAIAgent();
  if (!agent.configured()) {
    throw new Error("GEMINI_API_KEY no está configurada.");
  }

  await mongoose.connect(dbUri);
  console.log("[embeddings] mongo conectado");

  const query = force
    ? {}
    : {
        $or: [
          { embedding: { $exists: false } },
          { embedding: { $size: 0 } },
          { embeddingModel: { $ne: EMBEDDING_MODEL } },
        ],
      };
  const cursor = ArtworkModel.find(query)
    .sort({ updatedAt: -1 })
    .cursor();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for await (const artwork of cursor) {
    if (limit > 0 && scanned >= limit) break;
    scanned += 1;

    if (!needsEmbedding(artwork, force)) {
      skipped += 1;
      continue;
    }

    try {
      const text = buildArtworkEmbeddingText(artwork);
      const vec = await embedText(agent, text);
      if (!Array.isArray(vec) || !vec.length) {
        failed += 1;
        console.log("[embeddings] sin vector id=%s title=%s", artwork.id, artwork.title);
        continue;
      }
      artwork.embedding = vec;
      artwork.embeddingModel = EMBEDDING_MODEL;
      artwork.embeddingUpdatedAt = new Date();
      await artwork.save();
      updated += 1;
      if (updated % 25 === 0) {
        console.log("[embeddings] progreso scanned=%s updated=%s failed=%s", scanned, updated, failed);
      }
    } catch (err) {
      failed += 1;
      console.log("[embeddings] error id=%s msg=%s", artwork?.id || "?", err?.message || err);
    }
  }

  console.log(
    "[embeddings] fin scanned=%s updated=%s skipped=%s failed=%s model=%s",
    scanned,
    updated,
    skipped,
    failed,
    EMBEDDING_MODEL
  );
}

run()
  .catch((err) => {
    console.error("[embeddings] fallo:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // noop
    }
  });
