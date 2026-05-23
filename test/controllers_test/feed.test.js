const {
  getPersonalizedFeedCurated,
  getPersonalizedFeedBuildStatus,
  rebuildPersonalizedFeed,
} = require("../../controllers/feed"); 

const ai = require("../../services/ai");
const { OceanModel, UserModel } = require("../../models");
const { handleHTTPError } = require("../../utils/handleHTTPError");
const {
  resolveCuratedFeedCandidates,
  mergeCulturalFeedDedupe,
  extractSuggestedWorksFromArtisticJson,
} = require("../../services/search/feedCandidateResolver");

jest.mock("../../services/ai");
jest.mock("../../models");
jest.mock("../../utils/handleHTTPError");
jest.mock("../../services/search/feedCandidateResolver");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides = {}) => ({
  query: {},
  body: {},
  user: { _id: "user123" },
  ...overrides,
});

// ─────────────────────────────────────────────
// getPersonalizedFeedBuildStatus
// ─────────────────────────────────────────────
describe("getPersonalizedFeedBuildStatus", () => {
  it("devuelve status ready si no hay estado de build", async () => {
    const req = mockReq();
    const res = mockRes();
    await getPersonalizedFeedBuildStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ready" }),
      })
    );
  });

  it("devuelve 500 si ocurre un error", async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    await getPersonalizedFeedBuildStatus(req, res);
    expect(handleHTTPError).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// rebuildPersonalizedFeed
// ─────────────────────────────────────────────
describe("rebuildPersonalizedFeed", () => {
  it("devuelve 200 con reason no_ocean si no hay perfil OCEAN", async () => {
    OceanModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });
    const req = mockReq();
    const res = mockRes();
    await rebuildPersonalizedFeed(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "no_ocean" }),
      })
    );
  });

  it("devuelve 202 accepted si hay perfil OCEAN", async () => {
    OceanModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: "ocean1",
          updatedAt: new Date(),
          artisticDescription: "{}",
        }),
      }),
    });
    extractSuggestedWorksFromArtisticJson.mockReturnValue([]);
    const req = mockReq();
    const res = mockRes();
    await rebuildPersonalizedFeed(req, res);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "accepted" })
    );
  });

  it("devuelve 500 si ocurre un error", async () => {
    OceanModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error("DB error")),
      }),
    });
    const req = mockReq();
    const res = mockRes();
    await rebuildPersonalizedFeed(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "DB error", 500);
  });
});

// ─────────────────────────────────────────────
// getPersonalizedFeedCurated
// ─────────────────────────────────────────────
describe("getPersonalizedFeedCurated", () => {
  beforeEach(() => {
    OceanModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: "ocean1",
          updatedAt: new Date(),
          artisticDescription: "{}",
        }),
      }),
    });
    extractSuggestedWorksFromArtisticJson.mockReturnValue([]);
    resolveCuratedFeedCandidates.mockResolvedValue([]);
    mergeCulturalFeedDedupe.mockReturnValue([]);
    UserModel.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then: jest.fn(),
    });
  });

  it("devuelve items vacíos si no hay perfil OCEAN", async () => {
    OceanModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });
    const req = mockReq();
    const res = mockRes();
    await getPersonalizedFeedCurated(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "no_ocean" }),
      })
    );
  });

  it("devuelve anchorsOnly si el query lo indica", async () => {
    resolveCuratedFeedCandidates.mockResolvedValue([{ id: "1", title: "obra" }]);
    const req = mockReq({ query: { anchorsOnly: "1" } });
    const res = mockRes();
    await getPersonalizedFeedCurated(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ items: expect.any(Array) }),
      })
    );
  });

  it("devuelve fallback si la IA falla", async () => {
    ai.curatePersonalizedFeed.mockRejectedValue(new Error("IA caída"));
    resolveCuratedFeedCandidates.mockResolvedValue([{ id: "1", title: "obra" }]);
    const req = mockReq();
    const res = mockRes();
    await getPersonalizedFeedCurated(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "ai_unavailable_anchors_only" }),
      })
    );
  });

  it("devuelve 502 si ocurre un error general", async () => {
    OceanModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error("DB error")),
      }),
    });
    const req = mockReq();
    const res = mockRes();
    await getPersonalizedFeedCurated(req, res);
    expect(handleHTTPError).toHaveBeenCalledWith(res, "DB error", 502);
  });
});