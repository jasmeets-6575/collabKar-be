import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
    {
        conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, trim: true, maxlength: 5000, required: true },
        clientId: { type: String, index: true },
    },
    { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message = mongoose.model("Message", MessageSchema);
