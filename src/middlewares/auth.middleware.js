import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mustEnv } from "../utils/MustEnv.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "Unauthorized request");
    }

    let decoded;
    try {
        decoded = jwt.verify(token, mustEnv("ACCESS_TOKEN_SECRET"));
    } catch (err) {
        throw new ApiError(401, "Invalid access token");
    }

    if (!decoded || typeof decoded !== "object" || !decoded._id) {
        throw new ApiError(401, "Invalid access token payload");
    }

    const user = await User.findById(decoded._id).select(
        "-password -refreshToken"
    );

    if (!user) {
        throw new ApiError(401, "Invalid access token");
    }

    req.user = user;
    next();
});
