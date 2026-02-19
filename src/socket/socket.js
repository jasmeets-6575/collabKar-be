import { Server } from "socket.io";
import { socketAuth } from "./socketAuth.js";
import { EventHandlers } from "./EventHandlers.js";

let io;

const normalizeOrigin = (s) => String(s).trim().replace(/\/$/, "");

export function initSocket(httpServer) {
    const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        // "https://bucolic-snickerdoodle-271168.netlify.app",
    ]
        .filter(Boolean)
        .map(normalizeOrigin);

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
