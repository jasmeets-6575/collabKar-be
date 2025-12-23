
import mongoose, { Schema } from "mongoose";
import {
    ROLE_ENUM,
    FOLLOWER_RANGES,
    CREATOR_CATEGORIES,
    BUSINESS_INDUSTRIES,
    COLLAB_PREFERENCES,
} from "../constants/user.constants.js";

const CreatorProfileSchema = new Schema(
    {
        instagramHandle: {
            type: String,
            trim: true,
            required: true,
        },
        followerRange: {
            type: String,
            enum: FOLLOWER_RANGES,
            required: true,
        },
        categories: {
            type: [String],
            enum: CREATOR_CATEGORIES,
            required: true,
            validate: {
                validator: function (arr) {
                    return Array.isArray(arr) && arr.length > 0;
                },
                message: "At least one category is required",
            },
        },
        bio: {
            type: String,
            trim: true,
            maxlength: 300,
            default: "",
        },
        city: {
            type: String,
            trim: true,
            required: true,
        },
    },
    { _id: false }
);

const BusinessProfileSchema = new Schema(
    {
        businessName: {
            type: String,
            trim: true,
            required: true,
        },
        industry: {
            type: String,
            enum: BUSINESS_INDUSTRIES,
            required: true,
        },
        websiteOrInstagram: {
            type: String,
            trim: true,
            default: "",
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
        },
        city: {
            type: String,
            trim: true,
            required: true,
        },
        collabPreferences: {
            type: [String],
            enum: COLLAB_PREFERENCES,
            default: [],
        },
    },
    { _id: false }
);

const userSchema = new Schema(
    {
        role: {
            type: String,
            enum: Object.values(ROLE_ENUM),
            required: true,
        },

        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },

        phone: {
            type: String,
            required: true,
            trim: true,
        },

        creatorProfile: {
            type: CreatorProfileSchema,
            required: function () {
                return this.role === ROLE_ENUM.CREATOR;
            },
        },

        businessProfile: {
            type: BusinessProfileSchema,
            required: function () {
                return this.role === ROLE_ENUM.BUSINESS;
            },
        },
    },
    { timestamps: true }
);

userSchema.pre("save", function (next) {
    if (this.email) {
        this.email = String(this.email).toLowerCase().trim();
    }
    next();
});

userSchema.pre("validate", function (next) {
    if (this.role === ROLE_ENUM.CREATOR) {
        this.businessProfile = undefined;
    }
    if (this.role === ROLE_ENUM.BUSINESS) {
        this.creatorProfile = undefined;
    }
    next();
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);
