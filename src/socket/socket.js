import { Server } from "socket.io";
import { socketAuth } from "./socketAuth.js";
import { EventHandlers } from "./EventHandlers.js";

let io;

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

export function initSocket(httpServer) {
    const allowedOrigins = getAllowedOrigins();

    io = new Server(httpServer, {
        cors: {
            origin: (origin, cb) => {
                if (!origin) return cb(null, true);
                const o = normalizeOrigin(origin);
                if (allowedOrigins.includes(o)) return cb(null, true);

                return cb(new Error(`Socket.IO CORS blocked for origin: ${origin}`));
            },
            credentials: true,
            methods: ["GET", "POST"],
        },
        transports: ["websocket", "polling"],
    });

    socketAuth(io);

    io.on("connection", (socket) => {
        EventHandlers(socket, io);
    });

    return io;
}

export function getIO() {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
}
