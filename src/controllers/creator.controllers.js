// controllers/creator.controllers.js
import mongoose from "mongoose";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ROLE_ENUM } from "../constants/user.constants.js";

/* ---------------- helpers ---------------- */

const normalizeGeoPoint = (loc) => {
    if (!loc) return null;

    // Accept { latitude, longitude }
    if (loc.latitude != null && loc.longitude != null) {
        const lat = Number(loc.latitude);
        const lng = Number(loc.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { type: "Point", coordinates: [lng, lat] };
    }

    // Accept GeoJSON { type:"Point", coordinates:[lng,lat] }
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

const resolveUserLocation = async (req) => {
    // 1) from req.user (auth middleware)
    let loc = normalizeGeoPoint(req.user?.location);
    if (loc) return loc;

    // 2) DB fallback
    const userId = req.user?._id;
    if (!userId) return null;

    const user = await User.findById(userId).select("location");
    loc = normalizeGeoPoint(user?.location);
    return loc;
};

const ensureBusiness = (req) => {
    if (req.user?.role !== ROLE_ENUM.BUSINESS) {
        throw new ApiError(403, "Only business users can find creators");
    }
};

/* ---------------- GET OFFLINE CREATORS NEAR ME ---------------- */

const getOfflineCreatorsNearMe = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    ensureBusiness(req);

    const center = await resolveUserLocation(req);
    if (!center) {
        throw new ApiError(
            400,
            "Business location not found. Please enable location and save it in profile."
        );
    }

    // query params
    const radiusKmRaw = req.query.radiusKm ?? "25";
    const radiusKm = Math.min(200, Math.max(1, Number(radiusKmRaw))); // cap radius
    const maxDistanceMeters = radiusKm * 1000;

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;

    const q = req.query.q ? String(req.query.q).trim() : "";
    const categoriesCsv = req.query.categories ? String(req.query.categories) : "";
    const categories = categoriesCsv
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

    const followerRange = req.query.followerRange
        ? String(req.query.followerRange).trim()
        : "";

    // base match
    const match = {
        role: ROLE_ENUM.CREATOR,
        profileVisibility: "public",
        // must have location
        "location.type": "Point",
        "location.coordinates.0": { $type: "number" },
        "location.coordinates.1": { $type: "number" },
    };

    // category filter
    if (categories.length) {
        match["creatorProfile.categories"] = { $in: categories };
    }

    // followerRange filter
    if (followerRange) {
        match["creatorProfile.followerRange"] = followerRange;
    }

    // search filter
    if (q) {
        match.$or = [
            { username: { $regex: q, $options: "i" } },
            { firstName: { $regex: q, $options: "i" } },
            { lastName: { $regex: q, $options: "i" } },
            { "creatorProfile.instagramHandle": { $regex: q, $options: "i" } },
            { "creatorProfile.youtubeHandle": { $regex: q, $options: "i" } },
            { "creatorProfile.facebookHandle": { $regex: q, $options: "i" } },
            { "creatorProfile.city": { $regex: q, $options: "i" } },
        ];
    }

    /**
     * Use aggregation to:
     * - geoNear => distance field
     * - match extra filters
     * - paginate + total count
     */
    const pipeline = [
        {
            $geoNear: {
                near: center,
                distanceField: "distanceMeters",
                maxDistance: maxDistanceMeters,
                spherical: true,
                query: match,
            },
        },
        {
            $project: {
                password: 0,
                refreshToken: 0,
                __v: 0,
            },
        },
        { $sort: { distanceMeters: 1, createdAt: -1 } },
        {
            $facet: {
                items: [{ $skip: skip }, { $limit: limit }],
                meta: [{ $count: "total" }],
            },
        },
    ];

    const agg = await User.aggregate(pipeline);

    const items = agg?.[0]?.items ?? [];
    const total = agg?.[0]?.meta?.[0]?.total ?? 0;

    // add distanceKm for easier FE use
    const normalized = items.map((u) => ({
        ...u,
        distanceKm:
            typeof u.distanceMeters === "number"
                ? Math.round((u.distanceMeters / 1000) * 10) / 10
                : null,
    }));

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                creators: normalized,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    radiusKm,
                },
                center,
            },
            "Offline creators fetched"
        )
    );
});

/* ---------------- GET ONLINE CREATORS ---------------- */
const getOnlineCreators = asyncHandler(async (req, res) => {
    ensureBusiness(req);

    const {
        q,
        categories,
        followerRange,
        gender, // Added gender filter support
        sortBy = "rating" // "rating" or "followers"
    } = req.query;

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;

    const match = {
        role: ROLE_ENUM.CREATOR,
        profileVisibility: "public",
    };

    // Filters
    if (categories) match["creatorProfile.categories"] = { $in: categories.split(",") };
    if (followerRange && followerRange !== "all") match["creatorProfile.followerRange"] = followerRange;
    if (gender && gender !== "all") match["gender"] = gender;

    if (q) {
        match.$or = [
            { username: { $regex: q, $options: "i" } },
            { firstName: { $regex: q, $options: "i" } },
            { lastName: { $regex: q, $options: "i" } },
        ];
    }

    // Dynamic Sorting logic
    let sortObj = {};
    if (sortBy === "rating") {
        sortObj = { "stats.ratingAvg": -1, "stats.collabsCompleted": -1 };
    } else {
        // Since followerRange is likely a string (enum), 
        // this works best if your enums are ordered or if you store a numeric count.
        sortObj = { "creatorProfile.followerRange": -1, "stats.ratingAvg": -1 };
    }

    const creators = await User.find(match)
        .select("-password -refreshToken -__v")
        .sort(sortObj)
        .skip(skip)
        .limit(limit);

    const total = await User.countDocuments(match);

    return res.status(200).json(
        new ApiResponse(200, {
            creators,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        }, "Online creators fetched")
    );
});

export { getOfflineCreatorsNearMe, getOnlineCreators }