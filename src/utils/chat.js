import mongoose from "mongoose";
import { Conversation } from "../models/socket/Conversation.js";
import { Message } from "../models/socket/Message.js";

function toObjectId(id) {
    if (!id) return null;
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return new mongoose.Types.ObjectId(id);
}

// IMPORTANT: match your socket makeDmKey() => "A_B"
export function makeDmKey(a, b) {
    const A = a.toString();
    const B = b.toString();
    return A < B ? `${A}_${B}` : `${B}_${A}`;
}

export async function ensureDmConversation(userAId, userBId) {
    const a = toObjectId(userAId);
    const b = toObjectId(userBId);
    if (!a || !b) throw new Error("Invalid user ids");

    const dmKey = makeDmKey(a, b);

    let conv = await Conversation.findOne({ dmKey }).select("_id dmKey participants");
    if (!conv) {
        conv = await Conversation.create({
            type: "dm",
            participants: [a, b],
            dmKey,
        });
    }
    return conv;
}

// Idempotent message insert
export async function ensureInitialMessage({ conversationId, senderId, text, clientId }) {
    const cid = toObjectId(conversationId);
    const sid = toObjectId(senderId);
    if (!cid || !sid) throw new Error("Bad conversation/sender");

    const exists = await Message.findOne({ conversationId: cid, clientId }).select("_id");
    if (exists) return null;

    const saved = await Message.create({
        conversationId: cid,
        senderId: sid,
        text,
        clientId,
    });

    await Conversation.updateOne(
        { _id: cid },
        { $set: { lastMessageAt: saved.createdAt, lastMessageId: saved._id } }
    );

    return saved;
}
