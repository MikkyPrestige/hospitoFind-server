import mongoose from "mongoose";

const Schema = mongoose.Schema;

const sharedHospitalSchema = new Schema(
  {
    id: { type: String, required: true },
    slug: { type: String, required: true },

    name: { type: String, required: true },

    address: {
      street: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
    },

    phone: { type: String },
    website: { type: String },
    email: { type: String },
    photoUrl: { type: String },
    type: { type: String },
    services: { type: [String] },
    comments: { type: [String] },
    hours: { type: Array },
  },
  { _id: false }
);

const shareableLinkSchema = new Schema({
  linkId: {
    type: String,
    required: true,
    unique: true,
  },

  hospitals: {
    type: [sharedHospitalSchema],
    required: true,
  },
});

const ShareableLink = mongoose.model("ShareableLink", shareableLinkSchema);

export default ShareableLink;