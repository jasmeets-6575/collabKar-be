import mongoose from "mongoose";

const campaignInviteSchema = new mongoose.Schema(
    {
        campaign: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Campaign",
            required: true,
            index: true,
        },

        // Business (author)
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        businessUsername: {
            type: String,
            required: true,
            index: true,
        },

        // Creator (receiver)
        creator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        creatorUsername: {
            type: String,
            required: true,
            index: true,
        },

        // Modal fields (business writes these)
        title: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, required: true, trim: true, maxlength: 3000 },

        // Optional offer fields (add only if you want)
        offeredAmount: { type: Number, min: 0, default: null },
        offeredPaymentTerms: {
            type: String,
            enum: ["cash", "product", "freebies", "food"],
            default: null,
        },
        deliverables: { type: [String], default: [] }, // ["2 reels", "5 stories"]

        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "cancelled"],
            default: "pending",
            index: true,
        },

        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// ✅ prevent duplicate invite
campaignInviteSchema.index({ campaign: 1, creator: 1 }, { unique: true });

// helpful lists
campaignInviteSchema.index({ creator: 1, status: 1, createdAt: -1 });
campaignInviteSchema.index({ business: 1, status: 1, createdAt: -1 });

const CampaignInvite = mongoose.model("CampaignInvite", campaignInviteSchema);
export default CampaignInvite;
