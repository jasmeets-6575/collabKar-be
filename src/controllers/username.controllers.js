import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getUserByUsername = asyncHandler(async (req, res) => {
    const username = String(req.params.username || "")
        .toLowerCase()
        .trim();

    if (!username) {
        throw new ApiError(400, "Username is required");
    }

    const user = await User.findOne({ username }).select(
        [
            "role",
            "firstName",
            "lastName",
            "username",
            "avatar",

            "verified",
            "gender",
            "genderOther",

            "stats",
            "creatorProfile",
            "businessProfile",

            "createdAt",
        ].join(" ")
    );

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (user.role === "creator") user.businessProfile = undefined;
    if (user.role === "business") user.creatorProfile = undefined;

    return res
        .status(200)
        .json(new ApiResponse(200, { user }, "User profile fetched"));
});
