import mongoose from "mongoose";
import Campaign from "../models/campaign.models.js";
import { CampaignApplication } from "../models/campaignApplication.models.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import { ChatConnection } from "../models/chatConnection.models.js";
import { Conversation } from "../models/socket/Conversation.js";
import { Message } from "../models/socket/Message.js";
import { getIO } from "../socket/socket.js";

/**
 * CREATOR: Apply to campaign
 * POST /api/v1/campaigns/:id/apply
 * body: { title, description }
 */
export const applyToCampaign = asyncHandler(async (req, res) => {
    const user = req.user;
    const { id: campaignId } = req.params;
    const { title, description } = req.body;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "creator") throw new ApiError(403, "Only creators can apply");

    if (!mongoose.isValidObjectId(campaignId)) throw new ApiError(400, "Invalid campaign id");
    if (!title?.trim()) throw new ApiError(400, "Title is required");
    if (!description?.trim()) throw new ApiError(400, "Description is required");

    const campaign = await Campaign.findOne({ _id: campaignId, isDeleted: false })
        .select("_id status createdBy");

    if (!campaign) throw new ApiError(404, "Campaign not found");

    if (campaign.status !== "active") {
        throw new ApiError(400, "You can only apply to active campaigns");
    }

    // prevent applying to your own campaign
    if (String(campaign.createdBy) === String(user._id)) {
        throw new ApiError(400, "You cannot apply to your own campaign");
    }

    let app;
    try {
        app = await CampaignApplication.create({
            campaign: campaign._id,
            applicant: user._id,
            title: title.trim(),
            description: description.trim(),
        });
    } catch (e) {
        if (e?.code === 11000) throw new ApiError(409, "You already applied to this campaign");
        throw e;
    }

    return res.status(201).json(new ApiResponse(201, app, "Application submitted"));
});

/**
 * BUSINESS: List applications for a campaign (only campaign owner)
 * GET /api/v1/campaigns/:id/applications
 */
export const listApplicationsForCampaign = asyncHandler(async (req, res) => {
    const user = req.user;
    const { id: campaignId } = req.params;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "business") throw new ApiError(403, "Only business can view applications");

    if (!mongoose.isValidObjectId(campaignId)) throw new ApiError(400, "Invalid campaign id");

    const campaign = await Campaign.findOne({
        _id: campaignId,
        createdBy: user._id,
        isDeleted: false,
    }).select("_id");

    if (!campaign) throw new ApiError(404, "Campaign not found or not owned by you");

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    const status = req.query.status; // optional filter
    const filter = { campaign: campaignId };
    if (status) filter.status = status;

    const [items, total] = await Promise.all([
        CampaignApplication.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("applicant", "username firstName lastName avatar creatorProfile")
            .populate("campaign", "title authorUsername totalBudget paymentTerms preferredSocialMediaPlatforms deadline status"),
        CampaignApplication.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            { page, limit, total, campaigns: items },
            "Applications fetched"
        )
    );
});

/**
 * CREATOR: My applications
 * GET /api/v1/applications/me
 */
export const listMyApplications = asyncHandler(async (req, res) => {
    const user = req.user;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "creator") throw new ApiError(403, "Only creators can view their applications");

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    const status = req.query.status;
    const filter = { applicant: user._id };
    if (status) filter.status = status;

    const [items, total] = await Promise.all([
        CampaignApplication.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("campaign", "title authorUsername totalBudget paymentTerms preferredSocialMediaPlatforms deadline status"),
        CampaignApplication.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(200, { page, limit, total, items }, "My applications fetched")
    );
});

/**
 * BUSINESS: Update application status (accept/reject)
 * PATCH /api/v1/applications/:applicationId/status
 * body: { status: "accepted" | "rejected" }
 */
export const updateApplicationStatus = asyncHandler(async (req, res) => {
    const user = req.user;
    const { applicationId } = req.params;
    const { status } = req.body;

    if (!user) throw new ApiError(401, "Unauthorized");
    if (user.role !== "business") throw new ApiError(403, "Only business can update application status");

    if (!mongoose.isValidObjectId(applicationId)) throw new ApiError(400, "Invalid application id");

    const allowed = ["accepted", "rejected"];
    if (!allowed.includes(status)) throw new ApiError(400, "Invalid status");

    // ✅ Slightly expanded populate so we can build message text safely
    const app = await CampaignApplication.findById(applicationId)
        .populate("campaign", "createdBy title")
        .populate("applicant", "_id username firstName lastName");

    if (!app) throw new ApiError(404, "Application not found");

    // only campaign owner can accept/reject
    if (String(app.campaign.createdBy) !== String(user._id)) {
        throw new ApiError(403, "Not allowed");
    }

    if (app.status !== "pending") {
        throw new ApiError(400, "Application already processed");
    }

    app.status = status;
    await app.save();

    // ✅ ADDED: if accepted → create chat connection + dm + send initial message
    if (status === "accepted") {
        const creatorId = app.applicant?._id; // creator
        const brandId = user._id;             // business

        if (!creatorId) {
            throw new ApiError(500, "Applicant not found for this application");
        }

        // 1) Upsert ChatConnection to avoid duplicates
        await ChatConnection.updateOne(
            { creator: creatorId, brand: brandId },
            { $setOnInsert: { creator: creatorId, brand: brandId, status: "active" } },
            { upsert: true }
        );

        // 2) Ensure DM Conversation exists (same dmKey logic as your socket: A_B)
        const A = creatorId.toString();
        const B = brandId.toString();
        const dmKey = A < B ? `${A}_${B}` : `${B}_${A}`;

        let conv = await Conversation.findOne({ dmKey });
        if (!conv) {
            conv = await Conversation.create({
                type: "dm",
                participants: [creatorId, brandId],
                dmKey,
            });
        }

        // 3) Insert initial message (idempotent by clientId)
        const initialText =
            `✅ Application Accepted\n` +
            `Campaign: ${app.campaign?.title || "Campaign"}\n\n` +
            `Title: ${app.title}\n` +
            `Description:\n${app.description}`;

        const clientId = `application-accepted:${app._id.toString()}`;

        const already = await Message.findOne({
            conversationId: conv._id,
            clientId,
        }).select("_id");

        let saved = null;
        if (!already) {
            saved = await Message.create({
                conversationId: conv._id,
                senderId: brandId, // business sends the first message
                text: initialText,
                clientId,
            });

            // update conversation last message pointers
            await Conversation.updateOne(
                { _id: conv._id },
                { $set: { lastMessageAt: saved.createdAt, lastMessageId: saved._id } }
            );
        }

        // 4) Emit socket event so it appears instantly on both sides
        if (saved) {
            const io = getIO();

            const payload = {
                id: saved._id.toString(),
                conversationId: conv._id.toString(),
                senderId: brandId.toString(),
                text: saved.text,
                at: saved.createdAt.getTime(),
                clientId: saved.clientId,
            };

            io.to(`user:${creatorId.toString()}`).emit("chat:new", payload);
            io.to(`user:${brandId.toString()}`).emit("chat:new", payload);
            io.to(`conv:${conv._id.toString()}`).emit("chat:new", payload);
        }
    }

    return res.status(200).json(new ApiResponse(200, app, "Application status updated"));
});
