import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    getAllChatConnections,
    getMyConversations,
    getMessagesByConversation,
} from "../controllers/chatConnection.controllers.js";

const router = Router();

router.get("/connections", verifyJWT, getAllChatConnections);

router.get("/conversations", verifyJWT, getMyConversations);
router.get("/messages/:conversationId", verifyJWT, getMessagesByConversation);

export default router;
