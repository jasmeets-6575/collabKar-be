import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser";
const app = express();

import { mustEnv } from "./utils/MustEnv.js";

app.use(cors({
    origin: mustEnv("CORS_ORIGIN"),
    credentials: true
}))
app.use(express.json({
    limit: "16kb"
}))
app.use(express.urlencoded({
    extended: true,
    limit: "16kb"
}))
app.use(express.static("public"));
app.use(cookieParser());

// routes
import userRouter from "./routes/user.routes.js"

// routes declaration 
app.use('/api/v1/auth', userRouter);

export {app};