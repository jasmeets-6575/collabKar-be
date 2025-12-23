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

        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            minlength: 3,
            maxlength: 30,
            match: [/^[a-z0-9._]+$/, "Username can only contain a-z, 0-9, . and _"],
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

userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.pre("save", function (next) {
    if (this.email) {
        this.email = String(this.email).toLowerCase().trim();
    }
    if (this.username) {
        this.username = String(this.username).toLowerCase().trim();
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
