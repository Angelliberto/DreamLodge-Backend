/**
 * Tests unitarios ligeros para intención de búsqueda (sin I/O).
 */
const {
  extractSearchParams,
  extractArtworkId,
  analyzeMessageAndSelectTools,
} = require("../../services/ai/chat/messageIntent");

describe("messageIntent", () => {
  describe("extractSearchParams", () => {
    it("detecta categoría cine por palabra clave", () => {
      const p = extractSearchParams("quiero ver una película de drama");
      expect(p.category).toBe("cine");
      expect(p.genre).toBe("drama");
    });

    it("detecta título entre comillas", () => {
      const p = extractSearchParams('recomiéndame "El padrino"');
      expect(p.title).toBe("El padrino");
    });

    it("devuelve objeto vacío para mensaje sin señales", () => {
      const p = extractSearchParams("hola");
      expect(p).toEqual({});
    });
  });

  describe("extractArtworkId", () => {
    it("prioriza el primer contextItem con id", () => {
      const id = extractArtworkId("cualquier texto", [{ id: "art_123" }]);
      expect(id).toBe("art_123");
    });

    it("parsea id: en el mensaje", () => {
      const id = extractArtworkId("muéstrame id: abc-xyz", []);
      expect(id).toBe("abc-xyz");
    });
  });

  describe("analyzeMessageAndSelectTools", () => {
    it("incluye search_artworks si hay categoría inferida", () => {
      const tools = analyzeMessageAndSelectTools("libros de terror", []);
      expect(tools).toContain("search_artworks");
    });

    it("añade get_artwork_by_id si hay items de contexto", () => {
      const tools = analyzeMessageAndSelectTools("hola", [{ id: "x1" }]);
      expect(tools).toContain("get_artwork_by_id");
    });
  });
});