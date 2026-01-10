import { Router } from "express";
import { updateLocation, getLocation, getDistance } from "../controllers/location.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/update-location", verifyJWT, updateLocation);

router.get("/get-location", verifyJWT, getLocation);

router.get("/distance", verifyJWT, getDistance);

export default router;
