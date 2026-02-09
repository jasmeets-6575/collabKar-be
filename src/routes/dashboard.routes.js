import { Router } from "express";
import { getMyDashboard } from "../controllers/dashboard.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/me", verifyJWT, getMyDashboard);

export default router;
