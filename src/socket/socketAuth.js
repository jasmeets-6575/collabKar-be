import jwt from "jsonwebtoken";

export function socketAuth(io) {
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error("Missing token"));
            const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            socket.userId = payload.sub || payload.id || payload._id;
            
            if (!socket.userId) return next(new Error("Invalid token payload"));
            return next();
        } catch (e) {
            return next(new Error("Unauthorized"));
        }
    });
}