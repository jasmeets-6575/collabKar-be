import mongoose from "mongoose";
import { mustEnv } from "../utils/MustEnv.js";

const connectDB = async () => {
    try {
        await mongoose.connect(mustEnv("MONGODB_URI"));
    } catch (error) {
        console.error("Error whhile connected to DB", error);
        process.exit(1);
    }
};

export default connectDB;
