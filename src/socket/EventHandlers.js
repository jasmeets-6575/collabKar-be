import mongoose from "mongoose";
import { Message } from "../models/socket/Message.js";
import { Conversation } from "../models/socket/Conversation.js";
import { makeDmKey } from "../utils/chat.js";

function toObjectId(id) {
    if (!id) return null;
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return new mongoose.Types.ObjectId(id);
}

export function EventHandlers(socket, io) {
    if (socket.userId) socket.join(`user:${socket.userId}`);

    socket.on("ping", (payload) => {
        socket.emit("pong", { ok: true, received: payload, at: Date.now() });
    });

    socket.on("dm:open", async ({ otherUserId }, ack) => {
        try {
            const me = toObjectId(socket.userId);
            if (!me) return ack?.({ ok: false, error: "UNAUTHORIZED" });

            const other = toObjectId(otherUserId);

            if (!me) return ack?.({ ok: false, error: "UNAUTHORIZED" });
            if (!other) return ack?.({ ok: false, error: "BAD_OTHER_USER" });
            if (me.equals(other)) return ack?.({ ok: false, error: "CANT_DM_SELF" });

            const dmKey = makeDmKey(me, other);

            // find or create
            let conv = await Conversation.findOne({ dmKey });
            if (!conv) {
                conv = await Conversation.create({
                    type: "dm",
                    participants: [me, other],
                    dmKey,
                });
            }

            // auto-join room
            socket.join(`conv:${conv._id.toString()}`);

            ack?.({ ok: true, conversationId: conv._id.toString() });
        } catch (e) {
            console.error("dm:open error", e);
            ack?.({ ok: false, error: "SERVER_ERROR" });
        }
    });

    /**
     * Join a conversation room (if you already know conversationId)
     */
    socket.on("chat:join", async ({ conversationId }, ack) => {
        try {
            const me = toObjectId(socket.userId);
            if (!me) return ack?.({ ok: false, error: "UNAUTHORIZED" });

            const cid = toObjectId(conversationId);
            if (!me) return ack?.({ ok: false, error: "UNAUTHORIZED" });
            if (!cid) return ack?.({ ok: false, error: "BAD_CONVERSATION_ID" });

            const conv = await Conversation.findById(cid).select("participants");
            if (!conv) return ack?.({ ok: false, error: "NOT_FOUND" });

            const isMember = conv.participants.some((p) => p.equals(me));
            if (!isMember) return ack?.({ ok: false, error: "FORBIDDEN" });

            socket.join(`conv:${cid.toString()}`);
            ack?.({ ok: true });
        } catch (e) {
            console.error("chat:join error", e);
            ack?.({ ok: false, error: "SERVER_ERROR" });
        }
    });

    socket.on("chat:send", async (msg, ack) => {
        try {
            const me = toObjectId(socket.userId);
            if (!me) return ack?.({ ok: false, error: "UNAUTHORIZED" });

            const cid = toObjectId(msg?.conversationId);
            const text = (msg?.text ?? "").toString().trim();

            if (!me) return ack?.({ ok: false, error: "UNAUTHORIZED" });
            if (!cid) return ack?.({ ok: false, error: "BAD_CONVERSATION_ID" });
            if (!text) return ack?.({ ok: false, error: "EMPTY_TEXT" });

            // membership check
            const conv = await Conversation.findById(cid).select("participants");
            if (!conv) return ack?.({ ok: false, error: "NOT_FOUND" });
            if (!conv.participants.some((p) => p.equals(me))) {
                return ack?.({ ok: false, error: "FORBIDDEN" });
            }

            const saved = await Message.create({
                conversationId: cid,
                senderId: me,
                text,
                clientId: msg?.clientId,
            });

            await Conversation.updateOne(
                { _id: cid },
                { $set: { lastMessageAt: saved.createdAt, lastMessageId: saved._id } }
            );

            const payload = {
                id: saved._id.toString(),
                conversationId: cid.toString(),
                senderId: me.toString(),
                text: saved.text,
                at: saved.createdAt.getTime(),
                clientId: saved.clientId,
            };

            // emit only to that DM room
            io.to(`conv:${cid.toString()}`).emit("chat:new", payload);

            // ack sender
            ack?.({ ok: true, ...payload });
        } catch (e) {
            console.error("chat:send error", e);
            ack?.({ ok: false, error: "SERVER_ERROR" });
        }
    });
}
