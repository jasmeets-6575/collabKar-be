import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    getUserData,
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

// protected routes
router.post("/logout", verifyJWT, logoutUser);

router.get("/me", verifyJWT, getUserData);

export default router;
