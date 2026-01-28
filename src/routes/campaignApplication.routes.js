import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    listMyApplications,
    updateApplicationStatus,
} from "../controllers/campaignApplication.controllers.js";

const router = Router();

router.get("/me", verifyJWT, listMyApplications);
router.patch("/:applicationId/status", verifyJWT, updateApplicationStatus);

export default router;
