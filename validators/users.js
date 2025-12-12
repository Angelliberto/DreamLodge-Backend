const { check } = require("express-validator");
const {validateResults} = require("../utils/handleValidators");

const userRegisterValidator = [
    check("name")
        .exists().withMessage("Name is required")
        .notEmpty().withMessage("Name cannot be empty")
        .isString().withMessage("Name must be a string"),
    check("birthdate")
        .exists().withMessage("Birthdate is required")
        .notEmpty().withMessage("Birthdate cannot be empty")
        .isISO8601().withMessage("Birthdate must be a valid date"),
    check("email")
        .exists().withMessage("Email is required")
        .notEmpty().withMessage("Email cannot be empty")
        .isEmail().withMessage("Email must be valid"),
    check("password")
        .exists().withMessage("Password is required")
        .notEmpty().withMessage("Password cannot be empty")
        .isString().withMessage("Password must be a string")
        .isLength({ min: 8 }).withMessage("Password must be at least 6 characters"),
    check("confirmPassword")
    .exists().withMessage("Confirm Password is required")
    .notEmpty().withMessage("Confirm Password cannot be empty")
    .custom((value, { req }) => value === req.body.password).withMessage("Passwords do not match")
        ,
    check("preferences.favorite_types")
        .optional()
        .isArray().withMessage("favorite_types must be an array of strings"),
    check("preferences.favorite_genres")
        .optional()
        .isArray().withMessage("favorite_genres must be an array of strings"),
    check("emotional_profile.common_emotions")
        .optional()
        .isArray().withMessage("common_emotions must be an array of strings"),
    check("emotional_profile.style")
        .optional()
        .isString().withMessage("style must be a string"),
    (req, res, next) => validateResults(req, res, next)
];

const userLoginValidator= [
    check("email")
        .exists().withMessage("Email is required")
        .notEmpty().withMessage("Email cannot be empty")
        .isEmail().withMessage("Email must be valid"),
    check("password")
        .exists().withMessage("Password is required")
        .notEmpty().withMessage("Password cannot be empty")
        .isString().withMessage("Password must be a string")
        .isLength({ min: 8 }).withMessage("Password must be at least 6 characters"),
    (req, res, next) => validateResults(req, res, next)
];

const userUpdateValidator = [
    check("name")
        .exists().withMessage("Name is required")
        .optional().withMessage("Name cannot be empty")
        .isString().withMessage("Name must be a string"),
    check("birthdate")
        .exists().withMessage("Birthdate is required")
        .optional().withMessage("Birthdate cannot be empty")
        .isISO8601().withMessage("Birthdate must be a valid date"),
    check("email")
        .exists().withMessage("Email is required")
        .optional().withMessage("Email cannot be empty")
        .isEmail().withMessage("Email must be valid"),
    check("password")
        .exists().withMessage("Password is required")
        .optional().withMessage("Password cannot be empty")
        .isString().withMessage("Password must be a string")
        .isLength({ min: 8 }).withMessage("Password must be at least 6 characters"),
    check("preferences.favorite_types")
        .optional()
        .isArray().withMessage("favorite_types must be an array of strings"),
    check("preferences.favorite_genres")
        .optional()
        .isArray().withMessage("favorite_genres must be an array of strings"),
    check("emotional_profile.common_emotions")
        .optional()
        .isArray().withMessage("common_emotions must be an array of strings"),
    check("emotional_profile.style")
        .optional()
        .isString().withMessage("style must be a string"),
    (req, res, next) => validateResults(req, res, next)
];


const googleSignInValidator = [
    check("token")
        .exists().withMessage("Google token is required")
        .notEmpty().withMessage("Google token cannot be empty"),
    (req, res, next) => validateResults(req, res, next)
];

module.exports = { userRegisterValidator,userLoginValidator, userUpdateValidator,googleSignInValidator};