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

  if (!user.location) {
    const safeUser = await User.findById(user._id).select("-password -refreshToken");

    return res.status(200).json({
      message: "Location not found. Please allow location access for better experience.",
      locationRequired: true,
      user: safeUser,
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

const editUserInfo = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "Unauthorized");

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  if ("role" in req.body) throw new ApiError(400, "role cannot be updated");
  if ("gender" in req.body) throw new ApiError(400, "gender cannot be updated");
  if ("genderOther" in req.body) throw new ApiError(400, "genderOther cannot be updated");
  if ("password" in req.body) throw new ApiError(400, "password cannot be updated here");

  const {
    firstName,
    lastName,
    username,
    email,
    phone,
    location,

    // creator fields
    instagramHandle,
    facebookHandle,
    youtubeHandle,
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
  } = req.body;

  const update = {};

  // ---- validate  ----
  if (firstName !== undefined) {
    if (!String(firstName).trim()) throw new ApiError(400, "firstName cannot be empty");
    update.firstName = String(firstName).trim();
  }

  if (lastName !== undefined) {
    if (!String(lastName).trim()) throw new ApiError(400, "lastName cannot be empty");
    update.lastName = String(lastName).trim();
  }

  if (phone !== undefined) {
    const p = String(phone).trim();
    if (!p) throw new ApiError(400, "phone cannot be empty");
    update.phone = p;
  }

  if (email !== undefined) {
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!normalizedEmail) throw new ApiError(400, "email cannot be empty");

    const exists = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
    if (exists) throw new ApiError(409, "Email already taken");

    update.email = normalizedEmail;
  }

  if (username !== undefined) {
    const normalizedUsername = String(username).toLowerCase().trim();
    if (!normalizedUsername) throw new ApiError(400, "username cannot be empty");

    const exists = await User.findOne({ username: normalizedUsername, _id: { $ne: userId } });
    if (exists) throw new ApiError(409, "Username already taken");

    update.username = normalizedUsername;
  }

  // ---- location (GeoJSON) ----
  if (location !== undefined) {
    if (location === null) {
      update.location = undefined;
    } else {
      const lat = Number(location?.latitude);
      const lng = Number(location?.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new ApiError(400, "location must include valid latitude and longitude");
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new ApiError(400, "location latitude/longitude out of range");
      }

      update.location = { type: "Point", coordinates: [lng, lat] };
    }
  }

  // ---- avatar update (multipart) ----
  const avatarLocalPath = req.files?.avatar?.[0]?.path || "";
  if (avatarLocalPath) {
    const avatarUpload = await uploadOnCloudinary(avatarLocalPath);
    if (!avatarUpload?.secure_url && !avatarUpload?.url) {
      throw new ApiError(400, "Avatar upload failed");
    }
    update.avatar = avatarUpload.secure_url || avatarUpload.url;
  }

  // ---- role-based profile updates ----
  if (user.role === "creator") {
    update.creatorProfile = { ...(user.creatorProfile?.toObject?.() ?? user.creatorProfile ?? {}) };

    if (instagramHandle !== undefined)
      update.creatorProfile.instagramHandle = String(instagramHandle || "").trim();
    if (facebookHandle !== undefined)
      update.creatorProfile.facebookHandle = String(facebookHandle || "").trim();
    if (youtubeHandle !== undefined)
      update.creatorProfile.youtubeHandle = String(youtubeHandle || "").trim();

    if (followerRange !== undefined)
      update.creatorProfile.followerRange = String(followerRange || "").trim();

    if (categories !== undefined) {
      update.creatorProfile.categories = Array.isArray(categories)
        ? categories.map((c) => String(c).trim()).filter(Boolean)
        : [];
    }

    if (creatorBio !== undefined)
      update.creatorProfile.bio = String(creatorBio || "").trim();
    if (creatorCity !== undefined)
      update.creatorProfile.city = String(creatorCity || "").trim();

    const hasAny =
      update.creatorProfile.instagramHandle ||
      update.creatorProfile.facebookHandle ||
      update.creatorProfile.youtubeHandle;

    if (!hasAny) throw new ApiError(400, "At least one social handle is required");
  }

  if (user.role === "business") {
    update.businessProfile = { ...(user.businessProfile?.toObject?.() ?? user.businessProfile ?? {}) };

    if (businessName !== undefined)
      update.businessProfile.businessName = String(businessName || "").trim();
    if (industry !== undefined)
      update.businessProfile.industry = String(industry || "").trim();
    if (websiteOrInstagram !== undefined)
      update.businessProfile.websiteOrInstagram = String(websiteOrInstagram || "").trim();
    if (businessDescription !== undefined)
      update.businessProfile.description = String(businessDescription || "").trim();
    if (businessCity !== undefined)
      update.businessProfile.city = String(businessCity || "").trim();

    if (collabPreferences !== undefined) {
      update.businessProfile.collabPreferences = Array.isArray(collabPreferences)
        ? collabPreferences.map((c) => String(c).trim()).filter(Boolean)
        : [];
    }
  }

  // ---- Save ----
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, { user: updatedUser }, "User updated successfully"));
});


export { registerUser, loginUser, logoutUser, getUserData, editUserInfo };
