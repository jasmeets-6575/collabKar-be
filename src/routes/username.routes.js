import { Router } from "express";
import { getUserByUsername } from "../controllers/username.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    getUserInteractionState,
    rateUserByUsername,
    reportUserByUsername
} from "../controllers/userFeedback.controllers.js";

const router = Router();

router.get("/:username", getUserByUsername);
router.get("/:username/actions", verifyJWT, getUserInteractionState);
router.post("/:username/rating", verifyJWT, rateUserByUsername);
router.post("/:username/report", verifyJWT, reportUserByUsername);

export default router;
