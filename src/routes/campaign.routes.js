import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";

import {
    createCampaign,
    getMyCampaigns,
    getCampaignById,
    updateCampaignStatus,
    updateCampaign,
    deleteCampaign,
    discoverCampaigns
} from "../controllers/campaign.controllers.js";

import {
    applyToCampaign,
    listApplicationsForCampaign,
} from "../controllers/campaignApplication.controllers.js";

import { inviteCreatorToCampaign } from "../controllers/invite.controllers.js";

const router = Router();

router.post("/create", verifyJWT, createCampaign);
router.get("/my", verifyJWT, getMyCampaigns);

// discover
router.get("/discover", verifyJWT, discoverCampaigns);

router.get("/:id", verifyJWT, getCampaignById);

// apply to campaign
router.post("/:id/apply", verifyJWT, applyToCampaign);
router.get("/:id/applications", verifyJWT, listApplicationsForCampaign);

// invites
router.post("/:id/invite", verifyJWT, inviteCreatorToCampaign);

// update
router.patch("/:id/status", verifyJWT, updateCampaignStatus);
router.patch("/update/:id", verifyJWT, updateCampaign);

// delete
router.delete("/delete/:id", verifyJWT, deleteCampaign);

export default router;
