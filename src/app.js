import express from "express";
import cors from "cors";

const app = express();

const normalizeOrigin = (s) => String(s).trim().replace(/\/$/, "");

function getAllowedOrigins() {
    const fromEnv = [
        process.env.ALLOWED_ORIGINS,
        process.env.CORS_ORIGIN,
        process.env.CORS_LOCAL1,
        process.env.CORS_LOCAL2,
        process.env.CORS_LOCAL3,
    ]
        .filter(Boolean)
        .flatMap((v) => String(v).split(","))
        .map(normalizeOrigin)
        .filter(Boolean);

    const defaults = ["http://localhost:3000", "http://localhost:3001"];
    return Array.from(new Set((fromEnv.length ? fromEnv : defaults).map(normalizeOrigin)));
}

const allowedOrigins = getAllowedOrigins();

app.use(
    cors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            const o = normalizeOrigin(origin);
            if (allowedOrigins.includes(o)) return cb(null, true);
            return cb(new Error(`CORS blocked for origin: ${origin}`));
        },
        credentials: true,
        methods: ["GET", "POST"],
    })
);

app.get("/health", (_req, res) => {
    return res.status(200).json({
        success: true,
        message: "Socket server is running",
    });
});

app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

app.use((err, _req, res, _next) => {
    const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
    return res.status(statusCode).json({
        success: false,
        message: err?.message || "Internal Server Error",
    });
});

export { app };
