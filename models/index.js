const models = {
    UserModel: require("./nosql/users"),
    ArtworkModel: require("./nosql/artwork"),
    OceanModel: require("./nosql/ocean"),
    ChatConversationModel: require("./nosql/chatConversation"),
    ChatMessageModel: require("./nosql/chatMessage"),
};

module.exports = models;