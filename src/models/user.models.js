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

// Creator Profile Subschema
const CreatorProfileSchema = new Schema(
    {
        instagramHandle: {
            type: String,
            trim: true,
            default: "",
        },
        facebookHandle: {
            type: String,
            trim: true,
            default: "",
        },
        youtubeHandle: {
            type: String,
            trim: true,
            default: "",
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

// Business Profile Subschema
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

// User Schema
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
        gender: {
            type: String,
            enum: ["male", "female", "other", "prefer_not_to_say"],
            default: "prefer_not_to_say",
            index: true,
        },
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
        verified: {
            type: Boolean,
            default: false,
            index: true,
        },
        profileVisibility: {
            type: String,
            enum: ["public", "private"],
            default: "public",
        },
        stats: {
            collabsCompleted: { type: Number, default: 0, min: 0 },
            ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
            ratingCount: { type: Number, default: 0, min: 0 },
        },
        safety: {
            spamReportCount: { type: Number, default: 0, min: 0 },
            blockedCount: { type: Number, default: 0, min: 0 },
            lastReportedAt: { type: Date, default: null },
            flags: { type: [String], default: [] },
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

        location: {
            type: {
                type: String,
                enum: ["Point"], // GeoJSON type
                required: false,
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                required: false,
            },
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

userSchema.methods.getDistanceFrom = function (longitude, latitude) {
    if (!this.location || !this.location.coordinates) {
        return null;
    }

    const [userLongitude, userLatitude] = this.location.coordinates;
    const radian = (degree) => (degree * Math.PI) / 180;

    const earthRadius = 6371; // Radius in km

    const dLat = radian(latitude - userLatitude);
    const dLng = radian(longitude - userLongitude);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(radian(userLatitude)) *
        Math.cos(radian(latitude)) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c; // Distance in km
};

userSchema.index({ location: "2dsphere" });

export const User = mongoose.models.User || mongoose.model("User", userSchema);
