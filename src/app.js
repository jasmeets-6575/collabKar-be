import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
const app = express();

import { mustEnv } from "./utils/MustEnv.js";

const allowedOrigins = [
    mustEnv("CORS_LOCAL"),
    mustEnv("CORS_LOCAL1"),
    mustEnv("CORS_ORIGIN"),
];

app.use(
    cors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error(`CORS blocked for origin: ${origin}`));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(
    express.json({
        limit: "16kb",
    })
);
app.use(
    express.urlencoded({
        extended: true,
        limit: "16kb",
    })
);
app.use(express.static("public"));
app.use(cookieParser());

// routes
import userRouter from "./routes/user.routes.js";
import usernameRouter from "./routes/username.routes.js";
import locationRouter from "./routes/location.routes.js";
import campaignRouter from "./routes/campaign.routes.js";
import creatorRouter from "./routes/creators.routes.js";
import inviteRouter from "./routes/invite.routes.js";
import applicationRouter from "./routes/campaignApplication.routes.js";

// routes declaration
app.use("/api/v1/auth", userRouter);
app.use("/api/v1/user", usernameRouter);
app.use("/api/v1/location", locationRouter);
app.use("/api/v1/campaign", campaignRouter);
app.use("/api/v1/creators", creatorRouter);
app.use("/api/v1/invites", inviteRouter);
app.use("/api/v1/applications", applicationRouter);

export { app };
