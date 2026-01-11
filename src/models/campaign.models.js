// models/campaign.models.js
import mongoose from "mongoose";
import { CAMPAIGN_STATUS, CAMPAIGN_STATUS_OPTIONS } from "../constants/campaign.constants.js";
import { COLLAB_PREFERENCES } from "../constants/user.constants.js";

const campaignSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        totalBudget: { type: Number, required: true, min: 0 },

        preferredSocialMediaPlatforms: {
            type: [String],
            enum: ["Instagram", "YouTube", "Facebook"],
            required: true,
        },

        deadline: { type: Date, default: null },
        tags: { type: [String], default: [] },

        paymentTerms: {
            type: String,
            enum: ["cash", "product", "freebies", "food"],
            required: true,
        },

        collabPreferences: {
            type: [String],
            enum: COLLAB_PREFERENCES,
            default: [],
        },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                default: undefined,
            },
        },

        status: {
            type: String,
            enum: CAMPAIGN_STATUS_OPTIONS,
            default: CAMPAIGN_STATUS.ACTIVE,
            index: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        authorUsername: {
            type: String,
            required: true,
            index: true,
        },

        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

campaignSchema.index({ location: "2dsphere" });

campaignSchema.index({ createdBy: 1, isDeleted: 1, createdAt: -1 });
campaignSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });

const Campaign = mongoose.model("Campaign", campaignSchema);
export default Campaign;
