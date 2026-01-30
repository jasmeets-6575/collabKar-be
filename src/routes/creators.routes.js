// routes/creator.routes.js
import { Router } from "express";
import { getOfflineCreatorsNearMe, getOnlineCreators } from "../controllers/creator.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/offline", verifyJWT, getOfflineCreatorsNearMe);
router.get("/online", verifyJWT, getOnlineCreators);

export default router;
