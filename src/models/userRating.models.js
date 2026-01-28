import mongoose from "mongoose";

const UserRatingSchema = new mongoose.Schema(
    {
        rater: {
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
        score: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            trim: true,
            maxlength: 400,
            default: ""
        }
    },
    { timestamps: true }
);

UserRatingSchema.index({ rater: 1, target: 1 }, { unique: true });
UserRatingSchema.index({ target: 1, createdAt: -1 });

export const UserRating = mongoose.model("UserRating", UserRatingSchema);
