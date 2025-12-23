import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const registerUser = asyncHandler(async (req, res) => {
    const {
        role, 
        firstName,
        lastName,
        username,
        email,
        phone,
        password,

        // creator fields
        instagramHandle,
        followerRange,
        categories,
        creatorBio,
        creatorCity,

        // business fields
        businessName,
        industry,
        websiteOrInstagram,
        businessDescription,
        businessCity,
        collabPreferences,
    } = req.body

    // Basic validations
    if (!role || !["creator", "business"].includes(role)) {
        throw new ApiError(400, "Role is required (creator or business)");
    }

    if (!firstName || !lastName) {
        throw new ApiError(400, "First name and last name are required");
    }

    if (!username) {
        throw new ApiError(400, "Username is required");
    }

    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    if (!phone) {
        throw new ApiError(400, "Mobile number is required");
    }

    if (!password) {
        throw new ApiError(400, "Password is required");
    }

    // Normalize + uniqueness checks

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedUsername = String(username).toLowerCase().trim();

    const existing = await User.findOne({
        $or :[
            { email: normalizedEmail },
            { username: normalizedUsername }
        ]
    })

    if (existing?.email === normalizedEmail) {
        throw new ApiError(409, "Email already registered");
    }

    if (existing?.username === normalizedUsername) {
        throw new ApiError(409, "Username already taken");
    }

    // Avatar (multer local file path)

    const avatarLocalPath = req.files?.avatar?.[0]?.path || "";
    
    let creatorProfile;
    let businessProfile;

    if ( role === "creator") {
        if (!instagramHandle) {
            throw new ApiError(400, "Instagram handle is required for creators");
        }
        if (!followerRange) {
            throw new ApiError(400, "Follower range is required for creators");
        }
        if (!categories) {
            throw new ApiError(400, "At least one category is required for creators");
        }
        if (!creatorCity) {
            throw new ApiError(400, "City is required for creators");
        }

        const categoriesArr = Array.isArray(categories)
            ? categories
            : String(categories)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);

        if (!categoriesArr.length) {
            throw new ApiError(400, "At least one category is required for creators");
        }

        creatorProfile = {
            instagramHandle: String(instagramHandle).trim(),
            followerRange: String(followerRange).trim(),
            categories: categoriesArr,
            bio: creatorBio ? String(creatorBio).trim() : "",
            city: String(creatorCity).trim(),
        };
    }

    if (role === "business") {
        if (!businessName) {
            throw new ApiError(400, "Business name is required for businesses");
        }
        if (!industry) {
            throw new ApiError(400, "Industry is required for businesses");
        }
        if (!businessCity) {
            throw new ApiError(400, "City is required for businesses");
        }

        const collabPrefsArr = Array.isArray(collabPreferences)
            ? collabPreferences
            : collabPreferences
            ? String(collabPreferences)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

        businessProfile = {
            businessName: String(businessName).trim(),
            industry: String(industry).trim(),
            websiteOrInstagram: websiteOrInstagram ? String(websiteOrInstagram).trim() : "",
            description: businessDescription ? String(businessDescription).trim() : "",
            city: String(businessCity).trim(),
            collabPreferences: collabPrefsArr,
        };
    }

    // Upload avatar to cloudinary
    const avatarUpload = await uploadOnCloudinary(avatarLocalPath);

    if (!avatarUpload?.secure_url && !avatarUpload?.url) {
        throw new ApiError(400, "Avatar upload failed");
    }

    const avatarUrl = avatarUpload.secure_url || avatarUpload.url;

    // Create user
    const user = await User.create({
        role,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        phone: String(phone).trim(),
        password,
        avatar: avatarLocalPath,
        creatorProfile,
        businessProfile,
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(500, "User registration failed");
    }

    return res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: createdUser,
    });
});

const loginUser = asyncHandler(async (req, res) => {
    return res.status(200).send("login");
});

const logoutUser = asyncHandler(async (req, res) => {
    return res.status(200).send("logout");
});

export {
    registerUser,
    loginUser,
    logoutUser,
};
