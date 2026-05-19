const { runGlobalSearch } = require("../services/search/globalSearchService");
jest.mock("../services/search/globalSearchService");
const { globalSearch,  parseListParam} = require("../../controllers/globalSearch");
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides = {}) => ({
  query: {},
  ...overrides,
});

describe("parseListParam", ()=> {

it("devuelve el array limpio si le llega un array", () => {
    expect(parseListParam(["cine", "", "musica"])).toEqual(["cine", "musica"])
})


it("devuelve [] cuando pasamos null",() =>{
    expect(parseListParam(null)).toEqual([])
})

it("devuelve el string separado dentro del array ",() =>{
    expect(parseListParam("cine, musica")).toEqual(["cine", "musica"])
})
})




describe("globalSearch", () => {
it("runGlobalSearch devuelve resultados", async () => {
  runGlobalSearch.mockResolvedValue([{ title: "batman" }]);

  const req = mockReq({ query: { q: "batman" } });
  const res = mockRes();
  await globalSearch(req, res);

  expect(res.json).toHaveBeenCalledWith({ items: [{ title: "batman" }]});
}); 

it("runGlobalSearch devuelve error", async () => {
  runGlobalSearch.mockRejectedValue(new Error("fallo"));
  
  const req = mockReq({ query: { q: "batman" } });
  const res = mockRes();
  await globalSearch(req, res);

  expect(res.json).toHaveBeenCalledWith({ items: [] });
  expect(res.status).toHaveBeenCalledWith(500);
});
})