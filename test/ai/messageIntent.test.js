/**
 * Tests unitarios ligeros para intención de búsqueda (sin I/O).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  extractSearchParams,
  extractArtworkId,
  analyzeMessageAndSelectTools,
} = require("../../services/ai/chat/messageIntent");

describe("messageIntent", () => {
  describe("extractSearchParams", () => {
    it("detecta categoría cine por palabra clave", () => {
      const p = extractSearchParams("quiero ver una película de drama");
      assert.equal(p.category, "cine");
      assert.equal(p.genre, "drama");
    });

    it("detecta título entre comillas", () => {
      const p = extractSearchParams('recomiéndame "El padrino"');
      assert.equal(p.title, "El padrino");
    });

    it("devuelve objeto vacío para mensaje sin señales", () => {
      const p = extractSearchParams("hola");
      assert.deepEqual(p, {});
    });
  });

  describe("extractArtworkId", () => {
    it("prioriza el primer contextItem con id", () => {
      const id = extractArtworkId("cualquier texto", [{ id: "art_123" }]);
      assert.equal(id, "art_123");
    });

    it("parsea id: en el mensaje", () => {
      const id = extractArtworkId("muéstrame id: abc-xyz", []);
      assert.equal(id, "abc-xyz");
    });
  });

  describe("analyzeMessageAndSelectTools", () => {
    it("incluye search_artworks si hay categoría inferida", () => {
      const tools = analyzeMessageAndSelectTools("libros de terror", []);
      assert.ok(tools.includes("search_artworks"));
    });

    it("añade get_artwork_by_id si hay items de contexto", () => {
      const tools = analyzeMessageAndSelectTools("hola", [{ id: "x1" }]);
      assert.ok(tools.includes("get_artwork_by_id"));
    });
  });
});
