import { asyncHandler } from "../utils/asyncHandler.js";

const registerUser = asyncHandler(async (req, res) => {
    return res.status(200).send("register");
});

const loginUser = asyncHandler(async (req, res) => {
    return res.status(200).send("login");
});

const logoutUser = asyncHandler(async (req, res) => {
    return res.status(200).send("logout");
});

export {
    registerUser,
    loginUser,
    logoutUser,
};
