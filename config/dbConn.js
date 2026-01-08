import mongoose from "mongoose";
import asyncHandler from "express-async-handler";

// Connect to the database
const connectDB = asyncHandler(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB Connected");
});

export default connectDB;
