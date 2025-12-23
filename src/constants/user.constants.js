
// src/constants/user.constants.js

export const ROLE_ENUM = Object.freeze({
    CREATOR: "creator",
    BUSINESS: "business",
});

export const FOLLOWER_RANGES = Object.freeze([
    "500-2K",
    "2K-5K",
    "5K-10K",
    "10K-25K",
    "25K-50K",
    "50K+",
]);

export const CREATOR_CATEGORIES = Object.freeze([
    "Food & Dining",
    "Fitness & Wellness",
    "Fashion & Beauty",
    "Travel & Lifestyle",
    "Home & Decor",
    "Technology",
    "Photography",
    "Art & Design",
    "Music & Entertainment",
    "Business & Finance",
]);

export const BUSINESS_INDUSTRIES = Object.freeze([
    "Café / Restaurant",
    "Salon / Spa",
    "Gym / Fitness Studio",
    "Boutique / Fashion Store",
    "Clinic / Health",
    "Real Estate / Property",
    "Home-run Business",
    "Other Local Service",
]);

export const COLLAB_PREFERENCES = Object.freeze([
    "In-store shoots at my location",
    "Creators can shoot from home with my products",
    "Open to both in-store & home UGC",
]);
