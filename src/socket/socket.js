import { Server } from "socket.io";
import { mustEnv } from "../utils/MustEnv.js";
import { EventHandlers } from "./EventHandlers.js";
import { socketAuth } from "./socketAuth.js";

let io;

const normalizeOrigin = (s) => String(s).trim().replace(/\/$/, ""); // drop trailing /

export function initSocket(httpServer) {
    const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://bucolic-snickerdoodle-271168.netlify.app",
    ]
        .filter(Boolean)
        .map(normalizeOrigin);

    console.log("Socket allowedOrigins:", allowedOrigins);

    io = new Server(httpServer, {
        cors: {
            origin: (origin, cb) => {
                // allow non-browser clients / server-to-server
                if (!origin) return cb(null, true);

                const o = normalizeOrigin(origin);
                if (allowedOrigins.includes(o)) return cb(null, true);

                console.log("Socket blocked origin:", origin);
                return cb(new Error(`Socket.IO CORS blocked for origin: ${origin}`));
            },
            credentials: true,
            methods: ["GET", "POST"],
        },
        transports: ["websocket", "polling"],
    });

    socketAuth(io);
    io.on("connection", (socket) => {
        console.log("🟢 Client connected:", socket.id);
        EventHandlers(socket, io);
        socket.on("disconnect", () => {
            console.log("🔴 Client disconnected:", socket.id);
        });
    });

    return io;
}

export function getIO() {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
}
