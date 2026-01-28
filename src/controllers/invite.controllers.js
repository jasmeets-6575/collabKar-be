import mongoose from "mongoose";
import Campaign from "../models/campaign.models.js";
import CampaignInvite from "../models/campaignInvite.models.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * BUSINESS: Send invite to a creator for a campaign
 * POST /api/v1/campaigns/:id/invite
 * body: { creatorId, title, description, offeredAmount?, offeredPaymentTerms?, deliverables? }
 */
const inviteCreatorToCampaign = asyncHandler(async (req, res) => {
    const user = req.user;
    const { id: campaignId } = req.params;

    const {
        creatorId,
        title,
        description,
        offeredAmount = null,
        offeredPaymentTerms = null,
        deliverables = [],
    } = req.body;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "business") throw new ApiError(403, "Only business can invite creators");

    if (!mongoose.isValidObjectId(campaignId)) throw new ApiError(400, "Invalid campaign id");
    if (!mongoose.isValidObjectId(creatorId)) throw new ApiError(400, "Invalid creator id");

    if (!title?.trim()) throw new ApiError(400, "Title is required");
    if (!description?.trim()) throw new ApiError(400, "Description is required");

    // Ensure campaign exists and belongs to this business
    const campaign = await Campaign.findOne({
        _id: campaignId,
        createdBy: user._id,
        isDeleted: false,
    }).select("_id title status createdBy authorUsername paymentTerms");

    if (!campaign) throw new ApiError(404, "Campaign not found or not owned by you");

    // Optional: only allow invites for active campaigns
    if (campaign.status !== "active") {
        throw new ApiError(400, "You can invite creators only for active campaigns");
    }

    // If offeredPaymentTerms is set, ensure it matches campaign payment options enum
    // (Your campaign paymentTerms enum: ["cash","product","freebies","food"])
    const allowedTerms = ["cash", "product", "freebies", "food"];
    if (offeredPaymentTerms && !allowedTerms.includes(offeredPaymentTerms)) {
        throw new ApiError(400, "Invalid offeredPaymentTerms");
    }

    // deliverables should be an array of strings
    const safeDeliverables = Array.isArray(deliverables)
        ? deliverables.filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim())
        : [];

    // Create invite (unique index: {campaign, creator} prevents duplicates)
    let invite;
    try {
        invite = await CampaignInvite.create({
            campaign: campaign._id,
            business: user._id,
            businessUsername: user.username,
            creator: creatorId,
            title: title.trim(),
            description: description.trim(),
            offeredAmount: typeof offeredAmount === "number" ? offeredAmount : null,
            offeredPaymentTerms: offeredPaymentTerms || null,
            deliverables: safeDeliverables,
            // creatorUsername optional: if you have it in body, store it. else omit.
            creatorUsername: req.body.creatorUsername || "",
        });
    } catch (e) {
        // duplicate key error from unique index
        if (e?.code === 11000) {
            throw new ApiError(409, "You already invited this creator for this campaign");
        }
        throw e;
    }

    return res
        .status(201)
        .json(new ApiResponse(201, invite, "Invite sent successfully"));
});

/**
 * CREATOR: Get my invites
 * GET /api/v1/invites/me
 */
const getMyInvites = asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "creator") throw new ApiError(403, "Only creators can view invites");

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    const status = req.query.status; // optional: pending/accepted/rejected/cancelled

    const filter = {
        creator: user._id,
        isDeleted: false,
    };

    if (status) filter.status = status;

    const [items, total] = await Promise.all([
        CampaignInvite.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("campaign", "title totalBudget preferredSocialMediaPlatforms paymentTerms deadline tags collabPreferences authorUsername status")
            .populate("business", "username firstName lastName avatar"),
        CampaignInvite.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                page,
                limit,
                total,
                invites: items,
            },
            "Invites fetched"
        )
    );
});

/**
 * BUSINESS: Get invites sent by me (optionally for one campaign)
 * GET /api/v1/invites/sent?campaignId=...
 */
const getSentInvites = asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "business") throw new ApiError(403, "Only business can view sent invites");

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    const campaignId = req.query.campaignId;
    const status = req.query.status;

    const filter = {
        business: user._id,
        isDeleted: false,
    };

    if (campaignId) {
        if (!mongoose.isValidObjectId(campaignId)) throw new ApiError(400, "Invalid campaignId");
        filter.campaign = campaignId;
    }

    if (status) filter.status = status;

    const [items, total] = await Promise.all([
        CampaignInvite.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("campaign", "title totalBudget preferredSocialMediaPlatforms paymentTerms deadline status authorUsername")
            .populate("creator", "username firstName lastName avatar creatorProfile"),
        CampaignInvite.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                page,
                limit,
                total,
                items,
            },
            "Sent invites fetched"
        )
    );
});

/**
 * CREATOR: Accept/Reject an invite
 * PATCH /api/v1/invites/:inviteId/status
 * body: { status: "accepted" | "rejected" }
 */
const updateInviteStatus = asyncHandler(async (req, res) => {
    const user = req.user;
    const { inviteId } = req.params;
    const { status } = req.body;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "creator") throw new ApiError(403, "Only creators can update invite status");

    if (!mongoose.isValidObjectId(inviteId)) throw new ApiError(400, "Invalid invite id");

    const allowed = ["accepted", "rejected"];
    if (!allowed.includes(status)) throw new ApiError(400, "Invalid status");

    const invite = await CampaignInvite.findOne({
        _id: inviteId,
        creator: user._id,
        isDeleted: false,
    });

    if (!invite) throw new ApiError(404, "Invite not found");

    if (invite.status !== "pending") {
        throw new ApiError(400, "Invite already processed");
    }

    invite.status = status;
    await invite.save();

    return res.status(200).json(new ApiResponse(200, invite, "Invite status updated"));
});

/**
 * BUSINESS: Cancel an invite (only if pending)
 * PATCH /api/v1/invites/:inviteId/cancel
 */
const cancelInvite = asyncHandler(async (req, res) => {
    const user = req.user;
    const { inviteId } = req.params;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "business") throw new ApiError(403, "Only business can cancel invites");

    if (!mongoose.isValidObjectId(inviteId)) throw new ApiError(400, "Invalid invite id");

    const invite = await CampaignInvite.findOne({
        _id: inviteId,
        business: user._id,
        isDeleted: false,
    });

    if (!invite) throw new ApiError(404, "Invite not found");

    if (invite.status !== "pending") {
        throw new ApiError(400, "Only pending invites can be cancelled");
    }

    invite.status = "cancelled";
    await invite.save();

    return res.status(200).json(new ApiResponse(200, invite, "Invite cancelled"));
});

export { inviteCreatorToCampaign, getMyInvites, getSentInvites, updateInviteStatus, cancelInvite }