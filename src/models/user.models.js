import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
    ROLE_ENUM,
    FOLLOWER_RANGES,
    CREATOR_CATEGORIES,
    BUSINESS_INDUSTRIES,
    COLLAB_PREFERENCES,
} from "../constants/user.constants.js";
import { mustEnv } from "../utils/MustEnv.js";

/* ---------------- SUBSCHEMAS ---------------- */

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

/* ---------------- USER SCHEMA ---------------- */

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

        // ✅ gender instead of pronouns
        gender: {
            type: String,
            enum: ["male", "female", "other", "prefer_not_to_say"],
            default: "prefer_not_to_say",
            index: true,
        },
        // Optional: only used when gender === "other"
        genderOther: {
            type: String,
            trim: true,
            maxlength: 40,
            default: "",
        },

        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            minlength: 3,
            maxlength: 30,
            match: [
                /^[a-z0-9._]+$/,
                "Username can only contain a-z, 0-9, . and _",
            ],
            index: true,
        },

        avatar: {
            type: String,
            required: true,
            default: "",
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

        // ✅ Verified badge for UI
        verified: {
            type: Boolean,
            default: false,
            index: true,
        },

        // Optional: if you later want public/private profiles
        profileVisibility: {
            type: String,
            enum: ["public", "private"],
            default: "public",
        },

        // ✅ shared stats for BOTH creator & business
        stats: {
            collabsCompleted: { type: Number, default: 0, min: 0 },
            ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
            ratingCount: { type: Number, default: 0, min: 0 },
        },

        // ✅ safety / trust signals (use internally, don’t necessarily show publicly)
        safety: {
            spamReportCount: { type: Number, default: 0, min: 0 },
            blockedCount: { type: Number, default: 0, min: 0 },
            lastReportedAt: { type: Date, default: null },
            flags: { type: [String], default: [] }, // e.g. ["spam", "harassment"]
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

        password: {
            type: String,
            required: [true, "Password is required"],
        },

        refreshToken: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

/* ---------------- HOOKS ---------------- */

userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 10);
});

// Ensure only the correct profile exists for the role
userSchema.pre("validate", function () {
    if (this.gender !== "other") {
        this.genderOther = "";
    }

    if (this.role === ROLE_ENUM.CREATOR) {
        this.businessProfile = undefined;
    }
    if (this.role === ROLE_ENUM.BUSINESS) {
        this.creatorProfile = undefined;
    }
});

/* ---------------- METHODS ---------------- */

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            username: this.username,
            fullName: `${this.firstName} ${this.lastName}`,
            role: this.role,
        },
        mustEnv("ACCESS_TOKEN_SECRET"),
        {
            expiresIn: mustEnv("ACCESS_TOKEN_EXPIRY"),
        }
    );
};

userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        mustEnv("REFRESH_TOKEN_SECRET"),
        {
            expiresIn: mustEnv("REFRESH_TOKEN_EXPIRY"),
        }
    );
};

export const User = mongoose.models.User || mongoose.model("User", userSchema);
