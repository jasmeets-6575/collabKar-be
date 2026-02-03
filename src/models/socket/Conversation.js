import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ["dm"], default: "dm" },
        participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
        dmKey: { type: String, unique: true, index: true },
        lastMessageAt: Date,
        lastMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    },
    { timestamps: true }
);

export const Conversation = mongoose.model("Conversation", ConversationSchema);
