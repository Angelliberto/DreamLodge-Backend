const handleHTTPError = (res, message, code = 500) => {
    res.status(code).json({
        error: true,
        message,
        code
    });
};

module.exports = { handleHTTPError };