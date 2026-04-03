const express = require("express");
const router = express.Router();
const { authUser } = require("../middleware/session");
const { getPersonalizedFeedCurated } = require("../controllers/feed");

router.get("/personalized", authUser, getPersonalizedFeedCurated);
router.post("/personalized", authUser, getPersonalizedFeedCurated);

module.exports = router;
