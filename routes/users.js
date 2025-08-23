const express = require('express');
const router = express.Router();
const {authUser} = require("../middleware/session")
const passport = require("../middleware/googleAuth");
const {
  userRegister,
  userLogin,
  userDelete,
  userUpdate,
  googleCallback} = require("../controllers/users")
const {
  userRegisterValidator,
  userLoginValidator,
  userUpdateValidator,
  googleSignInValidator} = require("../validators/users")
  


router.post("/register", userRegisterValidator, userRegister);
router.post("/login", userLoginValidator,userLogin);
router.delete("/delete", authUser,userDelete);
router.patch("/update",authUser,userUpdateValidator,userUpdate);


router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", passport.authenticate("google", { session: false }), googleCallback);


module.exports = router;
