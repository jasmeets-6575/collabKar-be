// controllers/campaign.controllers.js
import mongoose from "mongoose";
import Campaign from "../models/campaign.models.js";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    CAMPAIGN_STATUS,
    CAMPAIGN_STATUS_OPTIONS,
} from "../constants/campaign.constants.js";

/* ------------------------------ helpers ------------------------------ */

const ensureObjectId = (id, name = "id") => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, `Invalid ${name}`);
    }
};

const ensureBusiness = (req) => {
    if (req.user?.role !== "business") {
        throw new ApiError(403, "Only business can create campaigns");
    }
};

const normalizeGeoPoint = (loc) => {
    if (!loc) return null;

    // Allow { latitude, longitude }
    if (loc.latitude != null && loc.longitude != null) {
        const lat = Number(loc.latitude);
        const lng = Number(loc.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

        return { type: "Point", coordinates: [lng, lat] };
    }

    if (loc.type === "Point" && Array.isArray(loc.coordinates)) {
        const [lngRaw, latRaw] = loc.coordinates;
        const lng = Number(lngRaw);
        const lat = Number(latRaw);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

        return { type: "Point", coordinates: [lng, lat] };
    }

    return null;
};

const resolveCampaignLocation = async (req) => {
    // 1) Body
    let finalLocation = normalizeGeoPoint(req.body?.location);

    // 2) From auth middleware user object
    if (!finalLocation) {
        finalLocation = normalizeGeoPoint(req.user?.location);
    }

    // 3) DB fallback
    if (!finalLocation) {
        const userId = req.user?._id;
        if (userId) {
            const user = await User.findById(userId).select("location");
            finalLocation = normalizeGeoPoint(user?.location);
        }
    }

    return finalLocation;
};

/* -------------------------------- CREATE -------------------------------- */

const createCampaign = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const authorUsername = req.user?.username;
    if (!userId) throw new ApiError(401, "Unauthorized");

    ensureBusiness(req);

    const {
        title,
        description,
        totalBudget,
        preferredSocialMediaPlatforms,
        deadline,
        tags,
        paymentTerms,
        collabPreferences,
    } = req.body;

    if (!title?.trim()) throw new ApiError(400, "title is required");
    if (!description?.trim()) throw new ApiError(400, "description is required");

    const budgetNum = Number(totalBudget);
    if (Number.isNaN(budgetNum) || budgetNum < 0) {
        throw new ApiError(400, "totalBudget must be a number >= 0");
    }

    if (
        !Array.isArray(preferredSocialMediaPlatforms) ||
        preferredSocialMediaPlatforms.length === 0
    ) {
        throw new ApiError(400, "preferredSocialMediaPlatforms is required");
    }

    if (!paymentTerms?.trim()) {
        throw new ApiError(400, "paymentTerms is required");
    }

    // normalize fields
    const cleanTags = Array.isArray(tags)
        ? tags.map((t) => String(t).trim()).filter(Boolean)
        : [];

    const cleanCollabPrefs = Array.isArray(collabPreferences)
        ? collabPreferences.map((c) => String(c).trim()).filter(Boolean)
        : [];

    const parsedDeadline = deadline ? new Date(deadline) : null;
    if (deadline && Number.isNaN(parsedDeadline.getTime())) {
        throw new ApiError(400, "deadline must be a valid date");
    }

    const finalLocation = await resolveCampaignLocation(req);

    const campaign = await Campaign.create({
        title: title.trim(),
        description: description.trim(),
        totalBudget: budgetNum,
        preferredSocialMediaPlatforms,
        deadline: parsedDeadline,
        tags: cleanTags,
        paymentTerms: String(paymentTerms).trim(),
        collabPreferences: cleanCollabPrefs,
        status: CAMPAIGN_STATUS.ACTIVE,
        createdBy: userId,
        isDeleted: false,
        deletedAt: null,
        authorUsername,
        ...(finalLocation ? { location: finalLocation } : {}),
    });

    const created = await Campaign.findById(campaign._id);

    return res
        .status(201)
        .json(new ApiResponse(201, { campaign: created }, "Campaign created"));
});

/* ------------------------------ GET MY CAMPAIGNS ------------------------------ */

const getMyCampaigns = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));

    const status = req.query.status ? String(req.query.status) : null;
    if (status && !CAMPAIGN_STATUS_OPTIONS.includes(status)) {
        throw new ApiError(400, "Invalid status filter");
    }

    const q = req.query.q ? String(req.query.q).trim() : "";

    const match = {
        createdBy: userId,
        isDeleted: false,
        ...(status ? { status } : {}),
        ...(q
            ? {
                $or: [
                    { title: { $regex: q, $options: "i" } },
                    { description: { $regex: q, $options: "i" } },
                    { tags: { $in: [new RegExp(q, "i")] } },
                ],
            }
            : {}),
    };

    const [items, total] = await Promise.all([
        Campaign.find(match)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Campaign.countDocuments(match),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                campaigns: items,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            },
            "My campaigns fetched"
        )
    );
});

/* ------------------------------ GET BY ID ------------------------------ */

const getCampaignById = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const { id } = req.params;
    ensureObjectId(id, "campaign id");

    const campaign = await Campaign.findOne({ _id: id, isDeleted: false });
    if (!campaign) throw new ApiError(404, "Campaign not found");

    // Only owner can view (change if you want public campaigns later)
    if (String(campaign.createdBy) !== String(userId)) {
        throw new ApiError(403, "You are not allowed to access this campaign");
    }

    return res.status(200).json(new ApiResponse(200, { campaign }, "Campaign fetched"));
});

/* ------------------------------ UPDATE STATUS ------------------------------ */

const updateCampaignStatus = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const { id } = req.params;
    ensureObjectId(id, "campaign id");

    const { status } = req.body;
    if (!status) throw new ApiError(400, "status is required");
    if (!CAMPAIGN_STATUS_OPTIONS.includes(status)) {
        throw new ApiError(400, "Invalid status");
    }

    const campaign = await Campaign.findOneAndUpdate(
        { _id: id, createdBy: userId, isDeleted: false },
        { $set: { status } },
        { new: true }
    );

    if (!campaign) throw new ApiError(404, "Campaign not found");

    return res
        .status(200)
        .json(new ApiResponse(200, { campaign }, "Campaign status updated"));
});

/* ------------------------------ UPDATE CAMPAIGN (FIELDS) ------------------------------ */

const updateCampaign = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const { id } = req.params;
    ensureObjectId(id, "campaign id");

    const {
        title,
        description,
        totalBudget,
        preferredSocialMediaPlatforms,
        deadline,
        tags,
        paymentTerms,
        collabPreferences,
        location,
        status
    } = req.body;

    const update = {};
    const unset = {};

    if (title !== undefined) {
        if (!String(title).trim()) throw new ApiError(400, "title cannot be empty");
        update.title = String(title).trim();
    }

    if (description !== undefined) {
        if (!String(description).trim())
            throw new ApiError(400, "description cannot be empty");
        update.description = String(description).trim();
    }

    if (totalBudget !== undefined) {
        const b = Number(totalBudget);
        if (Number.isNaN(b) || b < 0) throw new ApiError(400, "totalBudget must be >= 0");
        update.totalBudget = b;
    }

    if (preferredSocialMediaPlatforms !== undefined) {
        if (
            !Array.isArray(preferredSocialMediaPlatforms) ||
            preferredSocialMediaPlatforms.length === 0
        ) {
            throw new ApiError(400, "preferredSocialMediaPlatforms must be a non-empty array");
        }
        update.preferredSocialMediaPlatforms = preferredSocialMediaPlatforms;
    }

    if (deadline !== undefined) {
        if (!deadline) update.deadline = null;
        else {
            const d = new Date(deadline);
            if (Number.isNaN(d.getTime())) throw new ApiError(400, "deadline must be valid date");
            update.deadline = d;
        }
    }

    if (tags !== undefined) {
        update.tags = Array.isArray(tags)
            ? tags.map((t) => String(t).trim()).filter(Boolean)
            : [];
    }

    if (paymentTerms !== undefined) {
        if (!String(paymentTerms).trim())
            throw new ApiError(400, "paymentTerms cannot be empty");
        update.paymentTerms = String(paymentTerms).trim();
    }

    if (collabPreferences !== undefined) {
        update.collabPreferences = Array.isArray(collabPreferences)
            ? collabPreferences.map((c) => String(c).trim()).filter(Boolean)
            : [];
    }

    if (location !== undefined) {
        if (location === null) {
            unset.location = 1;
        } else {
            const loc = normalizeGeoPoint(location);
            if (!loc) throw new ApiError(400, "Invalid location");
            update.location = loc;
        }
    }
    if (status !== undefined) {
        if (!String(status).trim()) {
            throw new ApiError(400, "status cannot be empty");
        }
        if (!CAMPAIGN_STATUS_OPTIONS.includes(String(status))) {
            throw new ApiError(400, "Invalid status");
        }
        update.status = String(status);
    }

    const updateDoc = {};
    if (Object.keys(update).length) updateDoc.$set = update;
    if (Object.keys(unset).length) updateDoc.$unset = unset;

    const campaign = await Campaign.findOneAndUpdate(
        { _id: id, createdBy: userId, isDeleted: false },
        updateDoc,
        { new: true }
    );

    if (!campaign) throw new ApiError(404, "Campaign not found");

    return res.status(200).json(new ApiResponse(200, { campaign }, "Campaign updated"));
});

/* ------------------------------ DELETE CAMPAIGN (SOFT) ------------------------------ */

const deleteCampaign = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const { id } = req.params;
    ensureObjectId(id, "campaign id");

    const campaign = await Campaign.findOneAndUpdate(
        { _id: id, createdBy: userId, isDeleted: false },
        {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
                status: CAMPAIGN_STATUS.ARCHIVED,
            },
        },
        { new: true }
    );

    if (!campaign) throw new ApiError(404, "Campaign not found");

    return res.status(200).json(new ApiResponse(200, { campaign }, "Campaign deleted"));
});

/* ------------------------------ DISCOVER (For Creators) ------------------------------ */

const discoverCampaigns = asyncHandler(async (req, res) => {
    const {
        mode = "offline",
        page = 1,
        limit = 12,
        radiusKm = 25,
        q = "",
        sortBy = "newest",
        platforms = "" // comma separated
    } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));

    // 1. Build Base Match (Only active, non-deleted campaigns)
    const baseMatch = {
        isDeleted: false,
        status: CAMPAIGN_STATUS.ACTIVE,
    };

    // 2. Text Search
    if (q) {
        baseMatch.$or = [
            { title: { $regex: q, $options: "i" } },
            { description: { $regex: q, $options: "i" } },
            { tags: { $in: [new RegExp(q, "i")] } },
            { authorUsername: { $regex: q, $options: "i" } }
        ];
    }

    // 3. Platform Filter
    if (platforms) {
        const platformArray = platforms.split(",").map(p => p.trim()).filter(Boolean);
        baseMatch.preferredSocialMediaPlatforms = { $in: platformArray };
    }

    let pipeline = [];

    if (mode === "offline") {
        // --- OFFLINE MODE: Geospatial Search ---
        const userLocation = normalizeGeoPoint(req.user?.location);
        if (!userLocation) {
            throw new ApiError(400, "User location is required for offline discovery. Please update your profile.");
        }

        pipeline.push({
            $geoNear: {
                near: userLocation,
                distanceField: "distanceKm",
                spherical: true,
                maxDistance: Number(radiusKm) * 1000, // Convert Km to Meters
                query: baseMatch,
                distanceMultiplier: 0.001, // Convert Meters to Km
            },
        });
    } else {
        // --- ONLINE MODE: Standard Search ---
        pipeline.push({ $match: baseMatch });

        // Sort Logic for Online
        let sortObj = { createdAt: -1 };
        if (sortBy === "budget") sortObj = { totalBudget: -1 };
        if (sortBy === "deadline") sortObj = { deadline: 1 };

        pipeline.push({ $sort: sortObj });
    }

    // Pagination
    pipeline.push(
        {
            $facet: {
                metadata: [{ $count: "total" }],
                data: [
                    { $skip: (pageNum - 1) * limitNum },
                    { $limit: limitNum },
                ],
            },
        },
        {
            $project: {
                campaigns: "$data",
                total: { $arrayElemAt: ["$metadata.total", 0] },
            },
        }
    );

    const [result] = await Campaign.aggregate(pipeline);

    const total = result?.total || 0;
    const campaigns = result?.campaigns || [];

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                campaigns,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum),
                },
            },
            `Found ${campaigns.length} campaigns`
        )
    );
});
export {
    createCampaign,
    getMyCampaigns,
    getCampaignById,
    updateCampaignStatus,
    updateCampaign,
    deleteCampaign,
    discoverCampaigns
};
