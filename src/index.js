import dotenv from "dotenv";
import http from "http";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { mustEnv } from "./utils/MustEnv.js";
import { initSocket } from "./socket/socket.js";

dotenv.config({
    path: "../.env",
});

const port = process.env.PORT || 8001;

connectDB()
    .then(() => {
        const httpServer = http.createServer(app);
        initSocket(httpServer);
        httpServer.listen(port, () => {
            console.log(`Server listening on ${port}`);
        });
    })
    .catch((err) => {
        console.log("MONGODB Connection failed", err);
    });
