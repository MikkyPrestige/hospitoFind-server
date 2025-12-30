import mongoose from "mongoose";

const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    name: { type: String, unique: false },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: {
      type: String,
      required: function () {
        return !this.socialId; // Only required if not a social login
      },
      minLength: 6,
      maxLength: 1024,
    },
    socialId: { type: String, unique: true, sparse: true },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
