import mongoose from "mongoose";
import Campaign from "../models/campaign.models.js";
import { CampaignApplication } from "../models/campaignApplication.models.js";
import CampaignInvite from "../models/campaignInvite.models.js";
import { User } from "../models/user.models.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toObjectId = (id) => {
    if (!id) return null;
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return new mongoose.Types.ObjectId(id);
};

/**
 * GET /api/v1/dashboard/me
 * returns dashboard stats + recent offers for current user (business or creator)
 */
export const getMyDashboard = asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user?._id) throw new ApiError(401, "Unauthorized");

    const userId = toObjectId(user._id);
    if (!userId) throw new ApiError(401, "Unauthorized");

    if (user.role === "business") {
        // 1) Find my campaign ids (only non-deleted)
        const myCampaignIds = await Campaign.find({
            createdBy: userId,
            isDeleted: false,
        }).distinct("_id");

        // If no campaigns, still return safe response
        if (!myCampaignIds?.length) {
            return res.status(200).json(
                new ApiResponse(
                    200,
                    {
                        role: "business",
                        stats: {
                            activeOffers: 0,
                            activeCollabs: 0,
                            totalInvested: 0, // optional if you want later
                            avgRoi: 0, // optional if you want later
                        },
                        recentOffers: [],
                    },
                    "Dashboard fetched"
                )
            );
        }

        // 2) activeOffers = pending applications on my campaigns
        const pendingAppsCountPromise = CampaignApplication.countDocuments({
            campaign: { $in: myCampaignIds },
            status: "pending",
        });

        // 3) activeCollabs = (accepted invites sent by me) + (accepted applications on my campaigns)
        const acceptedInvitesCountPromise = CampaignInvite.countDocuments({
            business: userId,
            isDeleted: false,
            status: "accepted",
        });

        const acceptedAppsCountPromise = CampaignApplication.countDocuments({
            campaign: { $in: myCampaignIds },
            status: "accepted",
        });

        // 4) recentOffers = latest 2 pending applications on my campaigns
        const recentPendingAppsPromise = CampaignApplication.find({
            campaign: { $in: myCampaignIds },
            status: "pending",
        })
            .sort({ createdAt: -1 })
            .limit(2)
            .populate("applicant", "username firstName lastName avatar creatorProfile")
            .populate("campaign", "title authorUsername totalBudget paymentTerms preferredSocialMediaPlatforms deadline status")
            .lean();

        const [pendingAppsCount, acceptedInvitesCount, acceptedAppsCount, recentPendingApps] =
            await Promise.all([
                pendingAppsCountPromise,
                acceptedInvitesCountPromise,
                acceptedAppsCountPromise,
                recentPendingAppsPromise,
            ]);

        const activeOffers = pendingAppsCount;
        const activeCollabs = acceptedInvitesCount + acceptedAppsCount;

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    role: "business",
                    stats: {
                        activeOffers,
                        activeCollabs,
                        totalInvested: 0, // optional placeholder
                        avgRoi: 0, // optional placeholder
                    },
                    // pending offers from creators -> applications
                    recentOffers: recentPendingApps,
                },
                "Dashboard fetched"
            )
        );
    }

    if (user.role === "creator") {
        // activeProjects = (accepted applications by me) + (accepted invites received by me)
        const acceptedAppsCountPromise = CampaignApplication.countDocuments({
            applicant: userId,
            status: "accepted",
        });

        const acceptedInvitesCountPromise = CampaignInvite.countDocuments({
            creator: userId,
            isDeleted: false,
            status: "accepted",
        });

        // recentOffers = 2 recent pending invites
        const recentInvitesPromise = CampaignInvite.find({
            creator: userId,
            isDeleted: false,
            status: "pending",
        })
            .sort({ createdAt: -1 })
            .limit(2)
            .populate("campaign", "title totalBudget preferredSocialMediaPlatforms paymentTerms deadline status authorUsername")
            .populate("business", "username firstName lastName avatar")
            .lean();

        // rating/completed: map to your actual User fields
        // Adjust these paths to whatever you store in User schema.
        const dbUserPromise = User.findById(userId)
            .select("rating completedCollabs creatorProfile")
            .lean();

        const [acceptedAppsCount, acceptedInvitesCount, recentInvites, dbUser] =
            await Promise.all([
                acceptedAppsCountPromise,
                acceptedInvitesCountPromise,
                recentInvitesPromise,
                dbUserPromise,
            ]);

        const activeProjects = acceptedAppsCount + acceptedInvitesCount;

        // ✅ Adjust these to your real fields.
        // fallback: creatorProfile.rating / creatorProfile.completed if you store there
        const rating =
            Number(dbUser?.rating) ||
            Number(dbUser?.creatorProfile?.rating) ||
            0;

        const completed =
            Number(dbUser?.completedCollabs) ||
            Number(dbUser?.creatorProfile?.completedCollabs) ||
            0;

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    role: "creator",
                    stats: {
                        activeProjects,
                        rating,
                        completed,
                    },
                    // recent offers for creator = invites
                    recentOffers: recentInvites,
                },
                "Dashboard fetched"
            )
        );
    }

    throw new ApiError(403, "Invalid user role");
});
