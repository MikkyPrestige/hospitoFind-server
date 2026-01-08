import mongoose from "mongoose";

const Schema = mongoose.Schema;

// This schema represents a "Snapshot" of the hospital at the moment it was shared.
const sharedHospitalSchema = new Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "hospital",
      required: true,
    },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    address: {
      street: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
    },
    phone: { type: String },
    website: { type: String },
    photoUrl: { type: String },
    services: { type: [String] },
    verified: { type: Boolean, default: true },
  },
  { _id: false }
);

// Main schema for shareable links
const shareableLinkSchema = new Schema(
  {
    linkId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    hospitals: {
      type: [sharedHospitalSchema],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000, // Automatically delete the document from MongoDB after 30 days
    },
  },
  { timestamps: true }
);

const ShareableLink = mongoose.model("ShareableLink", shareableLinkSchema);

export default ShareableLink;