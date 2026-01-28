import mongoose from "mongoose";
import { User } from "../models/user.models.js";
import { ChatConnection } from "../models/chatConnection.models.js";
import { UserRating } from "../models/userRating.models.js";
import { UserReport } from "../models/userReport.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const REPORT_CATEGORIES = ["spam", "abuse", "scam", "fake_profile", "other"];

function normalizeUsername(rawUsername) {
    return String(rawUsername || "")
        .toLowerCase()
        .trim();
}

async function findUserByUsernameOrFail(rawUsername) {
    const username = normalizeUsername(rawUsername);
    if (!username) {
        throw new ApiError(400, "Username is required");
    }

    const user = await User.findOne({ username }).select(
        "_id username firstName lastName role"
    );
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return user;
}

async function hasActiveConnection(userAId, userBId) {
    const exists = await ChatConnection.exists({
        status: "active",
        isDeleted: { $ne: true },
        $or: [
            { creator: userAId, brand: userBId },
            { creator: userBId, brand: userAId }
        ]
    });

    return Boolean(exists);
}

async function recomputeRatingStats(targetUserId) {
    const targetId = new mongoose.Types.ObjectId(String(targetUserId));

    const [agg] = await UserRating.aggregate([
        { $match: { target: targetId } },
        {
            $group: {
                _id: "$target",
                ratingCount: { $sum: 1 },
                ratingAvg: { $avg: "$score" }
            }
        }
    ]);

    const ratingCount = agg?.ratingCount || 0;
    const rawAverage = agg?.ratingAvg || 0;
    const ratingAvg = ratingCount ? Math.round(rawAverage * 10) / 10 : 0;

    await User.updateOne(
        { _id: targetUserId },
        {
            $set: {
                "stats.ratingAvg": ratingAvg,
                "stats.ratingCount": ratingCount
            }
        }
    );

    return { ratingAvg, ratingCount };
}

export const getUserInteractionState = asyncHandler(async (req, res) => {
    const currentUserId = req.user?._id;
    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized");
    }

    const targetUser = await findUserByUsernameOrFail(req.params.username);
    const isSelf = String(currentUserId) === String(targetUser._id);
    const hasConnection = isSelf
        ? false
        : await hasActiveConnection(currentUserId, targetUser._id);

    const canInteract = Boolean(hasConnection && !isSelf);

    const [myRating, existingReport] = await Promise.all([
        canInteract
            ? UserRating.findOne({
                  rater: currentUserId,
                  target: targetUser._id
              }).select("score comment updatedAt")
            : null,
        canInteract
            ? UserReport.findOne({
                  reporter: currentUserId,
                  target: targetUser._id
              }).select("_id category reason status updatedAt")
            : null
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                hasConnection,
                canRate: canInteract,
                canReport: canInteract,
                alreadyReported: Boolean(existingReport),
                myRating: myRating
                    ? {
                          score: myRating.score,
                          comment: myRating.comment || "",
                          updatedAt: myRating.updatedAt
                      }
                    : null
            },
            "User interaction state fetched"
        )
    );
});

export const rateUserByUsername = asyncHandler(async (req, res) => {
    const currentUserId = req.user?._id;
    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized");
    }

    const targetUser = await findUserByUsernameOrFail(req.params.username);
    if (String(currentUserId) === String(targetUser._id)) {
        throw new ApiError(400, "You cannot rate your own profile");
    }

    const connected = await hasActiveConnection(currentUserId, targetUser._id);
    if (!connected) {
        throw new ApiError(403, "You can rate only users connected with you");
    }

    const rawScore = Number(req.body?.score);
    if (!Number.isInteger(rawScore) || rawScore < 1 || rawScore > 5) {
        throw new ApiError(400, "Rating score must be an integer between 1 and 5");
    }

    const comment = String(req.body?.comment || "").trim();
    if (comment.length > 400) {
        throw new ApiError(400, "Rating comment must be 400 characters or less");
    }

    let ratingDoc = await UserRating.findOne({
        rater: currentUserId,
        target: targetUser._id
    });
    let created = false;

    if (ratingDoc) {
        ratingDoc.score = rawScore;
        ratingDoc.comment = comment;
        await ratingDoc.save();
    } else {
        ratingDoc = await UserRating.create({
            rater: currentUserId,
            target: targetUser._id,
            score: rawScore,
            comment
        });
        created = true;
    }

    const stats = await recomputeRatingStats(targetUser._id);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                created,
                rating: {
                    score: ratingDoc.score,
                    comment: ratingDoc.comment || "",
                    updatedAt: ratingDoc.updatedAt
                },
                stats
            },
            created ? "Rating submitted successfully" : "Rating updated successfully"
        )
    );
});

export const reportUserByUsername = asyncHandler(async (req, res) => {
    const currentUserId = req.user?._id;
    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized");
    }

    const targetUser = await findUserByUsernameOrFail(req.params.username);
    if (String(currentUserId) === String(targetUser._id)) {
        throw new ApiError(400, "You cannot report your own profile");
    }

    const connected = await hasActiveConnection(currentUserId, targetUser._id);
    if (!connected) {
        throw new ApiError(403, "You can report only users connected with you");
    }

    const category = String(req.body?.category || "spam")
        .toLowerCase()
        .trim();
    if (!REPORT_CATEGORIES.includes(category)) {
        throw new ApiError(400, "Invalid report category");
    }

    const reason = String(req.body?.reason || "").trim();
    if (reason.length > 500) {
        throw new ApiError(400, "Report reason must be 500 characters or less");
    }

    let reportDoc = await UserReport.findOne({
        reporter: currentUserId,
        target: targetUser._id
    });
    let created = false;

    if (reportDoc) {
        reportDoc.category = category;
        reportDoc.reason = reason;
        reportDoc.status = "open";
        await reportDoc.save();
    } else {
        reportDoc = await UserReport.create({
            reporter: currentUserId,
            target: targetUser._id,
            category,
            reason,
            status: "open"
        });
        created = true;

        await User.updateOne(
            { _id: targetUser._id },
            {
                $inc: { "safety.spamReportCount": 1 },
                $set: { "safety.lastReportedAt": new Date() },
                $addToSet: { "safety.flags": "reported" }
            }
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                created,
                report: {
                    category: reportDoc.category,
                    reason: reportDoc.reason || "",
                    status: reportDoc.status,
                    updatedAt: reportDoc.updatedAt
                }
            },
            created ? "Report submitted successfully" : "Report updated successfully"
        )
    );
});
