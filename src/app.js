import express from "express";
import cors from "cors";

const app = express();

const allowedOrigins = ["http://localhost:3000", "http://localhost:3001"];

app.use(
    cors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
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
