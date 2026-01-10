import { User } from "../models/user.models.js";

export const generateAccessAndrefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(
            50,
            "something went wrong while generating refresh and access token"
        );
    }
};
