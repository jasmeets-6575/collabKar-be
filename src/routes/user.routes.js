import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    getUserData,
    editUserInfo,
    startGoogleAuth,
    googleAuthCallback,
} from "../controllers/user.controllers.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Register
router.post(
    "/register",
    upload.fields([
        {
            name: "avatar",
            maxCount: 1,
        },
    ]),
    registerUser
);

// Login
router.post("/login", loginUser);
router.get("/google", startGoogleAuth);
router.get("/google/callback", googleAuthCallback);

// protected routes
router.post("/logout", verifyJWT, logoutUser);

router.get("/me", verifyJWT, getUserData);

// Edit user 
router.patch(
    "/edit",
    verifyJWT,
    upload.fields([{ name: "avatar", maxCount: 1 }]),
    editUserInfo
);

export default router;
