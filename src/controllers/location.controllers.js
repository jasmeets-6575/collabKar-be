import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/* -------------------------------- UPDATE LOCATION -------------------------------- */

const updateLocation = asyncHandler(async (req, res) => {
    const { location } = req.body;

    if (!location || !location.coordinates) {
        throw new ApiError(400, "Invalid location data");
    }

    // Find user and update location
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    user.location = location;
    await user.save();

    return res.status(200).json(new ApiResponse(200, { location }, "Location updated successfully"));
});

/* -------------------------------- GET LOCATION -------------------------------- */

const getLocation = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user || !user.location) {
        throw new ApiError(404, "Location not set");
    }

    return res.status(200).json(new ApiResponse(200, { location: user.location }, "Location fetched successfully"));
});

/* -------------------------------- GET DISTANCE -------------------------------- */

const getDistance = asyncHandler(async (req, res) => {
    const { longitude, latitude } = req.query;

    if (!longitude || !latitude) {
        throw new ApiError(400, "Longitude and latitude are required");
    }

    const user = await User.findById(req.user._id);
    if (!user || !user.location || !user.location.coordinates) {
        throw new ApiError(404, "User location not set");
    }

    const distance = user.getDistanceFrom(longitude, latitude);

    if (distance === null) {
        throw new ApiError(400, "Unable to calculate distance");
    }

    return res.status(200).json(new ApiResponse(200, { distance }, "Distance calculated successfully"));
});

export { updateLocation, getLocation, getDistance };
