import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getMyInvites, getSentInvites, updateInviteStatus, cancelInvite } from "../controllers/invite.controllers.js";

const router = Router();

router.get("/me", verifyJWT, getMyInvites);
router.get("/sent", verifyJWT, getSentInvites);
router.patch("/:inviteId/status", verifyJWT, updateInviteStatus);
router.patch("/:inviteId/cancel", verifyJWT, cancelInvite);

export default router;
