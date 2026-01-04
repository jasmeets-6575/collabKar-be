import { Router } from "express";
import { getUserByUsername } from "../controllers/username.controllers.js";

const router = Router();

router.get("/:username", getUserByUsername);

export default router;
