const express = require("express");
const router = express.Router();
const { authUser } = require("../middleware/session");
const {
  getPersonalizedFeedCurated,
  getPersonalizedFeedBuildStatus,
  rebuildPersonalizedFeed,
} = require("../controllers/feed");

router.get("/personalized", authUser, getPersonalizedFeedCurated);
router.post("/personalized", authUser, getPersonalizedFeedCurated);
router.get("/personalized/status", authUser, getPersonalizedFeedBuildStatus);
router.post("/personalized/rebuild", authUser, rebuildPersonalizedFeed);

module.exports = router;
