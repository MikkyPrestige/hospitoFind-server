import mongoose from "mongoose";

const Schema = mongoose.Schema;

const hospitalSchema = new Schema({
  id: {
    type: String,
  },
  name: {
    type: String,
    required: true,
  },
  address: {
    street: {
      type: String,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
  },
  phoneNumber: {
    type: String,
  },
  website: {
    type: String,
  },
  email: {
    type: String,
  },
  photoUrl: {
    type: String,
  },
  type: {
    type: String,
  },
  services: {
    type: [String],
  },
  comments: {
    type: [String],
  },
  hours: {
    type: [
      {
        day: {
          type: String,
        },
        open: {
          type: String,
        },
      },
    ],
  },
  longitude: {
    type: Number,
  },
  latitude: {
    type: Number,
  },
});

const Hospital = mongoose.model("Hospital", hospitalSchema);

export default Hospital;
