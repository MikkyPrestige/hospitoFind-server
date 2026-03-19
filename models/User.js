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
    resetPasswordToken: String,
    resetPasswordExpire: Date,
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
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hospital" }],
    recentlyViewed: [
      {
        hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
    weeklyViewCount: { type: Number, default: 0 },
    lastWeeklyReset: { type: Date, default: Date.now },
    healthHistory: [
      {
        date: {
          type: Date,
          default: Date.now,
        },
        symptoms: [{ type: String, trim: true }],
        location: {
          type: String,
          trim: true,
        },
        matchedHospitals: [
          {
            hospitalId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Hospital",
            },
            name: { type: String },
            matchScore: { type: Number },
          },
        ],
        hospitalVisited: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Hospital",
          default: null,
        },
        rating: {
          type: Number,
          min: 1,
          max: 5,
          default: null,
        },
        feedback: {
          type: String,
          trim: true,
          default: null,
        },
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;