import dotenv from "dotenv";
import http from "http";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { initSocket } from "./socket/socket.js";

dotenv.config({
    path: "../.env",
});

const port = process.env.PORT || 8001;

connectDB()
    .then(() => {
        const httpServer = http.createServer(app);
        initSocket(httpServer);
        httpServer.listen(port);
    })
    .catch((err) => {
        console.error("MONGODB Connection failed", err);
    });
