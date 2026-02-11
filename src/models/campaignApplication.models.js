import mongoose from "mongoose";

const campaignApplicationSchema = new mongoose.Schema(
    {
        campaign: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Campaign",
            required: true,
            index: true,
        },
        applicant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // what you collect in UI modal
        title: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, required: true, trim: true, maxlength: 3000 },

        // optional extra fields (add later if you want)
        // priceQuote: { type: Number },
        // deliverables: [{ type: String }],
        // portfolioLinks: [{ type: String }],

        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "cancelled"],
            default: "pending",
            index: true,
        },
    },
    { timestamps: true }
);

campaignApplicationSchema.index(
    { campaign: 1, applicant: 1 },
    { unique: true }
);

campaignApplicationSchema.index({ campaign: 1, status: 1, createdAt: -1 });
campaignApplicationSchema.index({ applicant: 1, status: 1, createdAt: -1 });

export const CampaignApplication = mongoose.model(
    "CampaignApplication",
    campaignApplicationSchema
);
