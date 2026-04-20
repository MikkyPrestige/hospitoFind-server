import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const seedUsers = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/hospitofind",
    );
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // await User.deleteMany();
    // console.log("Existing users cleared.");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("1234567", salt);

    const users = [
      {
        name: "Elue Michael",
        username: "Zero//",
        email: "zero@hospitofind.com",
        password: hashedPassword,
        role: "admin",
        isVerified: true,
        isActive: true,
        weeklyViewCount: 1,
      },
      {
        name: "Test Developer",
        username: "dev_tester",
        email: "tester@hospitofind.com",
        password: hashedPassword,
        role: "user",
        isVerified: true,
        isActive: true,
      },
    ];

    await User.insertMany(users);
    console.log("Database Seeded Successfully!");

    process.exit();
  } catch (error) {
    console.error(`Error seeding database: ${error.message}`);
    process.exit(1);
  }
};

seedUsers();
