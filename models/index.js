const models = {
    UserModel: require("./nosql/users"),
    ArtworkModel: require("./nosql/artwork"),
    TagModel: require("./nosql/tags"),
    OceanModel: require("./nosql/ocean"),
};

module.exports = models;