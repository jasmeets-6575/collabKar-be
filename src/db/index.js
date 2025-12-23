import mongoose from "mongoose";
import { mustEnv } from "../utils/MustEnv.js";

const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(mustEnv("MONGODB_URI"))
        console.log(`\n MongoDB connected ! DB HOST: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.log("Error whhile connected to DB", error);
        process.exit(1);
    }
}

export default connectDB;