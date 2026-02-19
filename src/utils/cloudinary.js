import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { mustEnv } from "./MustEnv.js";

cloudinary.config({
    cloud_name: mustEnv("CLOUDINARY_NAME"),
    api_key: mustEnv("CLOUDINARY_API_KEY"),
    api_secret: mustEnv("CLOUDINARY_API_SECRET_KEY"),
});

const safeUnlink = (filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {}
};

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        const resp = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });

        safeUnlink(localFilePath);
        return resp;
    } catch (error) {
        safeUnlink(localFilePath);
        return null;
    }
};

export { uploadOnCloudinary };
