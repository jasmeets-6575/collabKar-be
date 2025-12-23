import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { mustEnv } from "./utils/MustEnv.js";

dotenv.config({
    path: '../.env'
})

const port = mustEnv("PORT") || 8001

connectDB()
.then(() => {
    app.on("error", (error) => {
        console.log("Error: Unable to connect to DB", error);
    })
    app.listen(port, () => {
        console.log();
        console.log(` app is listening on ${port}`)
    })
})
.catch((err) => {
    console.log("MONGODB Connection failed", err);
    
})