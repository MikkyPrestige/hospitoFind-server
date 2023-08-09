import mongoose from "mongoose";

const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: {
    type: String,
    unique: false,
  },
  username: {
    type: String,
    unique: true,
  },
  email: {
    type: String,
    unique: true
  },
  password: {
    type: String,
    minLength: 6,
    maxLength: 1024
  }
}, { timestamps: true });

const User = mongoose.model("user", userSchema);

export default User;