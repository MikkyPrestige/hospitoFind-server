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
        return !this.auth0Id;
      },
      minLength: 6,
      maxLength: 1024,
    },
    auth0Id: { type: String, unique: true, sparse: true },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: Date,
    // favorites: [
    //   {
    //     type: Schema.Types.ObjectId,
    //     ref: "Hospital",
    //   },
    // ],
    // recentlyViewed: [
    //   {
    //     hospital: { type: Schema.Types.ObjectId, ref: "Hospital" },
    //     viewedAt: { type: Date, default: Date.now },
    //   },
    // ],
    // weeklyViewCount: {
    //   type: Number,
    //   default: 0,
    // },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
