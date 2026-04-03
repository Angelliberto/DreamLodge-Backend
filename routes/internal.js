const express = require("express");
const router = express.Router();
const { mcpInternalOnly } = require("../middleware/mcpInternalAuth");
const { getMediaCatalogCredentials } = require("../controllers/internalMcp");

router.get("/mcp/media-catalog-credentials", mcpInternalOnly, getMediaCatalogCredentials);

module.exports = router;
