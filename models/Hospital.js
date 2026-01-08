import mongoose from "mongoose";
import { sanitize } from "../utils/sanitize.js";

const Schema = mongoose.Schema;

const hospitalSchema = new Schema(
  {
    id: { type: String },
    name: { type: String, required: true },
    slug: { type: String, index: true },
    address: {
      street: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
    },
    phoneNumber: { type: String },
    website: { type: String },
    email: { type: String },
    photoUrl: { type: String },
    type: { type: String },
    services: { type: [String] },
    comments: { type: [String] },
    hours: { type: [{ day: { type: String }, open: { type: String } }] },
    isFeatured: { type: Boolean, default: false },
    verified: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    longitude: { type: Number },
    latitude: { type: Number },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        index: "2dsphere",
      },
    },
  },
  { timestamps: true }
);

hospitalSchema.index({ "address.state": 1, "address.city": 1, slug: 1 });

// Pre-save: auto-generate slug from name if not present
hospitalSchema.pre("save", async function (next) {
  if (this.latitude && this.longitude) {
    this.location = {
      type: "Point",
      coordinates: [this.longitude, this.latitude],
    };
  }

  if (!this.slug && this.name) {
    const base = sanitize(this.name);
    let slug = base;
    const Hospital = this.constructor;

    let i = 0;
    while (
      await Hospital.exists({
        "address.state": this.address?.state,
        "address.city": this.address?.city,
        slug,
      })
    ) {
      i += 1;
      slug = `${base}-${i}`;
      if (i > 10) {
        slug = `${base}-${this._id.toString().slice(-6)}`;
        break;
      }
    }
    this.slug = slug;
  }
  next();
});

const Hospital = mongoose.model("Hospital", hospitalSchema);
export default Hospital;
