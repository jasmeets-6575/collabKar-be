import mongoose from "mongoose";
import Campaign from "../models/campaign.models.js";
import { User } from "../models/user.models.js";
import CampaignInvite from "../models/campaignInvite.models.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ChatConnection } from "../models/chatConnection.models.js";

// ✅ socket chat models
import { Conversation } from "../models/socket/Conversation.js";
import { Message } from "../models/socket/Message.js";
import { makeDmKey } from "../utils/chat.js";

// (optional) if you want realtime emit when invite accepted
// import { getIO } from "../socket/initSocket.js";

/* ---------------- helpers ---------------- */

function toObjectId(id) {
    if (!id) return null;
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return new mongoose.Types.ObjectId(id);
}

/**
 * Ensure DM Conversation exists for creator+brand and optionally send a system message
 */
async function ensureConversationAndSendDefaultMessage({
    creatorId,
    brandId,
    text,
}) {
    const creator = toObjectId(creatorId);
    const brand = toObjectId(brandId);
    if (!creator || !brand) return null;

    const dmKey = makeDmKey(creator, brand);

    // find/create conversation
    let conv = await Conversation.findOne({ dmKey });
    if (!conv) {
        conv = await Conversation.create({
            type: "dm",
            participants: [creator, brand],
            dmKey,
        });
    }

    // create message
    const saved = await Message.create({
        conversationId: conv._id,
        senderId: brand, // ✅ brand sends the invite accepted message (you can change to creator if you want)
        text,
        clientId: `invite-accepted:${conv._id.toString()}`,
    });

    // update last message pointers
    await Conversation.updateOne(
        { _id: conv._id },
        { $set: { lastMessageAt: saved.createdAt, lastMessageId: saved._id } }
    );

    // OPTIONAL realtime emit
    // const io = getIO();
    // io.to(`conv:${conv._id.toString()}`).emit("chat:new", {
    //     id: saved._id.toString(),
    //     conversationId: conv._id.toString(),
    //     senderId: brand.toString(),
    //     text: saved.text,
    //     at: saved.createdAt.getTime(),
    //     clientId: saved.clientId,
    // });

    // also notify both users even if they didn't join room yet
    // io.to(`user:${creator.toString()}`).emit("chat:new", { ... });
    // io.to(`user:${brand.toString()}`).emit("chat:new", { ... });

    return { conversationId: conv._id.toString(), messageId: saved._id.toString() };
}

/* ---------------- controllers ---------------- */

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

    const campaign = await Campaign.findOne({
        _id: campaignId,
        createdBy: user._id,
        isDeleted: false,
    }).select("_id title status createdBy authorUsername paymentTerms");

    if (!campaign) throw new ApiError(404, "Campaign not found or not owned by you");

    if (campaign.status !== "active") {
        throw new ApiError(400, "You can invite creators only for active campaigns");
    }

    const allowedTerms = ["cash", "product", "freebies", "food"];
    if (offeredPaymentTerms && !allowedTerms.includes(offeredPaymentTerms)) {
        throw new ApiError(400, "Invalid offeredPaymentTerms");
    }

    const safeDeliverables = Array.isArray(deliverables)
        ? deliverables
            .filter((d) => typeof d === "string" && d.trim())
            .map((d) => d.trim())
        : [];

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
            creatorUsername: req.body.creatorUsername || "",
        });
    } catch (e) {
        if (e?.code === 11000) {
            throw new ApiError(409, "You already invited this creator for this campaign");
        }
        throw e;
    }

    return res.status(201).json(new ApiResponse(201, invite, "Invite sent successfully"));
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

    const status = req.query.status;

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
            { page, limit, total, invites: items },
            "Invites fetched"
        )
    );
});

/**
 * BUSINESS: Get invites sent by me
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
            { page, limit, total, items },
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
    }).populate("campaign", "title"); // for default message text

    if (!invite) throw new ApiError(404, "Invite not found");

    if (invite.status !== "pending") {
        throw new ApiError(400, "Invite already processed");
    }

    invite.status = status;
    await invite.save();

    if (status === "accepted") {
        const brandId = invite.business; // ✅ business is the brand in your system

        if (!mongoose.isValidObjectId(brandId)) {
            throw new ApiError(400, "Invalid brand id in the invite");
        }

        const brand = await User.findById({ _id: brandId });
        if (!brand) {
            throw new ApiError(404, "Brand not found");
        }

        // ✅ ensure ChatConnection exists (avoid duplicates)
        await ChatConnection.updateOne(
            { creator: user._id, brand: brandId },
            { $setOnInsert: { creator: user._id, brand: brandId, status: "active" } },
            { upsert: true }
        );

        // ✅ create/find conversation + insert default message
        const defaultText =
            `✅ Invite Accepted\n\n` +
            `Title: ${invite.title || invite?.campaign?.title || "Campaign"}\n` +
            `Description: ${invite.description || ""}`;

        const convInfo = await ensureConversationAndSendDefaultMessage({
            creatorId: user._id,
            brandId,
            text: defaultText,
        });

        // return conversationId so FE can open exact conversation if you want
        return res.status(200).json(
            new ApiResponse(
                200,
                { invite, conversationId: convInfo?.conversationId || null },
                "Invite status updated"
            )
        );
    }

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

export {
    inviteCreatorToCampaign,
    getMyInvites,
    getSentInvites,
    updateInviteStatus,
    cancelInvite
};
