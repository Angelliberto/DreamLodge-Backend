const { searchIgdbGames } = require("../../services/integrations/igdbClient");
const { handleHTTPError } = require("../../utils/handleHTTPError");
const { searchGames } = require("../../controllers/IGDB");

jest.mock("../../services/integrations/igdbClient");
jest.mock("../../utils/handleHTTPError");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides = {}) => ({
  query: {},
  body: {},
  ...overrides,
});

describe("searchGames", () => {
  it("El término 'search' es requerido", async () => {
    const req = mockReq({ body: { search: "" } });
    const res = mockRes();
    await searchGames(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "El término 'search' es requerido" }, 400);
})   

it("devuelve los resultados de la búsqueda", async () => {
  searchIgdbGames.mockResolvedValue([{ id: 1, name: "Batman" }]);

  const req = mockReq({ body: { search: "batman" } });
  const res = mockRes();
  await searchGames(req, res);

  expect(res.json).toHaveBeenCalledWith([{ id: 1, name: "Batman" }]);
});

it("devuelve 500 si searchIgdbGames falla", async () => {
 searchIgdbGames.mockRejectedValue(new Error("fallo"));

  const req = mockReq({ body: { search: "batman" } });
  const res = mockRes();
  await searchGames(req, res);

  expect(handleHTTPError).toHaveBeenCalledWith(res, { message: "Error buscando juegos" }, 500);
});})