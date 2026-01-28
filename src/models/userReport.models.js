import mongoose from "mongoose";

const REPORT_CATEGORIES = ["spam", "abuse", "scam", "fake_profile", "other"];
const REPORT_STATUS = ["open", "reviewed", "dismissed"];

const UserReportSchema = new mongoose.Schema(
    {
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        target: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        category: {
            type: String,
            enum: REPORT_CATEGORIES,
            default: "spam",
            required: true
        },
        reason: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },
        status: {
            type: String,
            enum: REPORT_STATUS,
            default: "open"
        }
    },
    { timestamps: true }
);

UserReportSchema.index({ reporter: 1, target: 1 }, { unique: true });
UserReportSchema.index({ target: 1, createdAt: -1 });

export const UserReport = mongoose.model("UserReport", UserReportSchema);
