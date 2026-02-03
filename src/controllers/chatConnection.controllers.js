
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import { ApiResponse } from "../utils/ApiResponse.js";
import { ChatConnection } from "../models/chatConnection.models.js";

const getAllChatConnections = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    // Ensure user is authenticated (optional, depending on use case)
    if (!userId) throw new ApiError(401, "Unauthorized");

    // Pagination parameters
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    const filter = {
        isDeleted: false, // Customize according to your logic (e.g., isDeleted field if relevant)
    };

    // Fetching data
    const [chatConnections, total] = await Promise.all([
        ChatConnection.find(filter)
            .skip(skip)
            .limit(limit)
            .populate('creator', 'name email') // Populate the creator field
            .populate('brand', 'name email')   // Populate the brand field
            .sort({ createdAt: -1 }), // Optional: You can sort by creation date if required
        ChatConnection.countDocuments(filter), // Count the total documents for pagination
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                page,
                limit,
                total,
                chatConnections,
            },
            "Chat connections fetched successfully"
        )
    );
});

export default getAllChatConnections;
