import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ChatConnection } from "../models/chatConnection.models.js";

// ✅ for conversations + messages
import { Conversation } from "../models/socket/Conversation.js";
import { Message } from "../models/socket/Message.js";

/**
 * GET /api/v1/chat/connections
 * returns chat connections (creator <-> brand)
 */
export const getAllChatConnections = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    // Only return connections where logged-in user is part of it
    const filter = {
        status: "active",
        $or: [{ creator: userId }, { brand: userId }],
    };

    const [chatConnections, total] = await Promise.all([
        ChatConnection.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .populate("creator", "_id firstName lastName username email avatar role")
            .populate("brand", "_id firstName lastName username email avatar role")
            .lean(),
        ChatConnection.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            { page, limit, total, chatConnections },
            "Chat connections fetched successfully"
        )
    );
});

/**
 * GET /api/v1/chat/conversations
 * Sidebar-ready list: conversationId + other user + last message + time
 *
 * Query:
 *  - page (default 1)
 *  - limit (default 20)
 */
export const getMyConversations = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    // Find conversations where I'm a participant
    const [convs, total] = await Promise.all([
        Conversation.find({ participants: userId })
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("participants", "_id firstName lastName username avatar role")
            .populate("lastMessageId", "_id text senderId createdAt")
            .lean(),
        Conversation.countDocuments({ participants: userId }),
    ]);

    const items = convs.map((c) => {
        const others = (c.participants || []).filter(
            (p) => String(p._id) !== String(userId)
        );

        const other = others[0] || null;

        const lastMsg = c.lastMessageId
            ? {
                id: c.lastMessageId._id,
                text: c.lastMessageId.text,
                senderId: c.lastMessageId.senderId,
                createdAt: c.lastMessageId.createdAt,
            }
            : null;

        return {
            conversationId: c._id,
            type: c.type,
            dmKey: c.dmKey,
            otherUser: other,
            lastMessageAt: c.lastMessageAt || null,
            lastMessage: lastMsg,
        };
    });

    return res
        .status(200)
        .json(new ApiResponse(200, { page, limit, total, items }, "Conversations fetched"));
});

/**
 * GET /api/v1/chat/messages/:conversationId?page=1&limit=30
 * Fetch messages for a conversation (pagination)
 */
export const getMessagesByConversation = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) {
        throw new ApiError(400, "Invalid conversation id");
    }

    const conv = await Conversation.findById(conversationId).select("participants");
    if (!conv) throw new ApiError(404, "Conversation not found");

    const isMember = conv.participants.some((p) => String(p) === String(userId));
    if (!isMember) throw new ApiError(403, "Forbidden");

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
        Message.find({ conversationId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Message.countDocuments({ conversationId }),
    ]);

    // Return ascending order for UI (oldest -> newest)
    const messages = items.reverse().map((m) => ({
        id: m._id.toString(),
        conversationId: m.conversationId,
        senderId: m.senderId.toString(),
        text: m.text,
        clientId: m.clientId,
        createdAt: m.createdAt,
    }));

    return res.status(200).json(
        new ApiResponse(
            200,
            { page, limit, total, items: messages },
            "Messages fetched"
        )
    );
});
