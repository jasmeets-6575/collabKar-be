import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { generateAccessAndrefreshTokens } from "../utils/generateAccessAndrefreshTokens.js";
import { mustEnv } from "../utils/MustEnv.js";

/* -------------------------------- REGISTER -------------------------------- */

const registerUser = asyncHandler(async (req, res) => {
  const {
    role,
    firstName,
    lastName,
    username,
    email,
    phone,
    password,
    gender,
    genderOther,
    location,
    // Creator fields
    instagramHandle,
    facebookHandle,
    youtubeHandle,
    followerRange,
    categories,
    creatorBio,
    creatorCity,
    // Business fields
    businessName,
    industry,
    websiteOrInstagram,
    businessDescription,
    businessCity,
    collabPreferences,
  } = req.body;

  // Validate inputs
  if (!role || !["creator", "business"].includes(role)) {
    throw new ApiError(400, "Role is required (creator or business)");
  }
  if (!firstName || !lastName) {
    throw new ApiError(400, "First name and last name are required");
  }
  if (!username || !email || !phone || !password) {
    throw new ApiError(400, "All required fields must be filled");
  }

  // Gender validation
  const allowedGenders = ["male", "female", "other", "prefer_not_to_say"];
  const normalizedGender = gender ? String(gender).trim().toLowerCase() : "prefer_not_to_say";

  const normalizedGenderOther = normalizedGender === "other" ? String(genderOther || "").trim() : "";

  if (normalizedGender === "other" && !normalizedGenderOther) {
    throw new ApiError(400, "genderOther is required when gender is other");
  }
  const normalizedEmail = String(email).toLowerCase().trim();
  const normalizedUsername = String(username).toLowerCase().trim();


  // Check if email or username already exists
  const existing = await User.findOne({
    $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
  });

  if (existing) {
    throw new ApiError(409, "Email or Username already taken");
  }

  // Avatar upload
  const avatarLocalPath = req.files?.avatar?.[0]?.path || "";
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  let creatorProfile, businessProfile;

  // Handle creator-specific fields
  if (role === "creator") {
    if (!instagramHandle && !facebookHandle && !youtubeHandle) {
      throw new ApiError(400, "At least one social handle (Instagram, Facebook, or YouTube) is required for creators");
    }
    if (!followerRange || !categories || !creatorCity) {
      throw new ApiError(400, "Follower range, categories, and city are required for creators");
    }

    creatorProfile = {
      instagramHandle,
      facebookHandle,
      youtubeHandle,
      followerRange,
      categories,
      bio: creatorBio || "",
      city: creatorCity,
    };
  }

  // Handle business-specific fields
  if (role === "business") {
    if (!businessName || !industry || !businessCity) {
      throw new ApiError(400, "Business name, industry, and city are required for businesses");
    }

    businessProfile = {
      businessName,
      industry,
      websiteOrInstagram,  // Only this field is required now
      description: businessDescription || "",
      city: businessCity,
      collabPreferences,
    };
  }

  // Upload avatar to Cloudinary
  const avatarUpload = await uploadOnCloudinary(avatarLocalPath);
  if (!avatarUpload?.secure_url && !avatarUpload?.url) {
    throw new ApiError(400, "Avatar upload failed");
  }
  const avatarUrl = avatarUpload.secure_url || avatarUpload.url;

  // Set the location if provided
  const userLocation = location ? {
    type: "Point",
    coordinates: [location.longitude, location.latitude],
  } : undefined;

  // Create user
  const user = await User.create({
    role,
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    gender: normalizedGender,
    genderOther: normalizedGenderOther,
    username: normalizedUsername,
    email: normalizedEmail,
    phone,
    password,
    avatar: avatarUrl,
    creatorProfile,
    businessProfile,
    location: userLocation,
    verified: false,
  });

  const createdUser = await User.findById(user._id).select("-password -refreshToken");

  if (!createdUser) {
    throw new ApiError(500, "User registration failed");
  }

  return res.status(201).json(new ApiResponse(201, { user: createdUser }, "User registered successfully"));
});

/* -------------------------------- LOGIN -------------------------------- */

const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  // Validate inputs
  if (!(username || email)) {
    throw new ApiError(400, "Username or email is required");
  }
  if (!password) {
    throw new ApiError(400, "Password is required");
  }

  const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
  const normalizedUsername = username ? String(username).toLowerCase().trim() : null;

  const user = await User.findOne({
    $or: [
      normalizedEmail ? { email: normalizedEmail } : null,
      normalizedUsername ? { username: normalizedUsername } : null,
    ].filter(Boolean),
  });

  if (!user) throw new ApiError(404, "User does not exist");

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(401, "Invalid credentials");

  // Check if location is provided, if not prompt for location
  if (!user.location) {
    return res.status(200).json({
      message: "Location not found. Please allow location access for better experience.",
      locationRequired: true, // Flag to frontend to ask for location
      user: { ...user.toObject(), location: undefined }, // Don't send location in response
    });
  }

  const { accessToken, refreshToken } = await generateAccessAndrefreshTokens(
    user._id
  );
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  const isProd = mustEnv("NODE_ENV") === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };

  return res.status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "User logged in successfully")
    );
});

/* -------------------------------- LOGOUT -------------------------------- */

const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "Unauthorized");

  await User.findByIdAndUpdate(
    userId,
    { $set: { refreshToken: "" } },
    { new: true }
  );

  const isProd = mustEnv("NODE_ENV") === "production";

  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

/* ---------------------------- GET USER DATA (ME) ---------------------------- */

const getUserData = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "Unauthorized");

  const user = await User.findById(userId).select("-password -refreshToken");
  if (!user) throw new ApiError(404, "User not found");

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "User data fetched"));
});

export { registerUser, loginUser, logoutUser, getUserData };
