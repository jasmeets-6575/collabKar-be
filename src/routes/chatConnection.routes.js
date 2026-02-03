import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import getAllChatConnections from "../controllers/chatConnection.controllers.js";

const router = Router();

router.get("/connections", verifyJWT, getAllChatConnections);

export default router;
