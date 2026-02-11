import mongoose from "mongoose";

const ChatConnectionSchema = new mongoose.Schema(
    {
        creator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",  // Assuming you have a User model
            required: true,
        },
        brand: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",  // Assuming brand is also a User model
            required: true,
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active", // Can be "active" or "inactive" depending on the connection status
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
    }
);

export const ChatConnection = mongoose.model("ChatConnection", ChatConnectionSchema);

