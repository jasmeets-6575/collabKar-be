import { Router } from "express";

const router = Router();

import {
    registerUser,
    loginUser,
    logoutUser,
} from "../controllers/user.controllers.js";

// Routes
router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/logout").post(logoutUser);

export default router;
