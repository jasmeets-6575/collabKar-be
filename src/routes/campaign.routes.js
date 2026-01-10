// routes/campaign.routes.js
import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    createCampaign,
    getMyCampaigns,
    getCampaignById,
    updateCampaignStatus,
    updateCampaign,
    deleteCampaign,
} from "../controllers/campaign.controllers.js";

const router = Router();

router.post("/create", verifyJWT, createCampaign);
router.get("/my", verifyJWT, getMyCampaigns);
router.get("/:id", verifyJWT, getCampaignById);

// update
router.patch("/:id/status", verifyJWT, updateCampaignStatus);
router.patch("/:id", verifyJWT, updateCampaign);

// delete 
router.delete("/:id", verifyJWT, deleteCampaign);

export default router;
