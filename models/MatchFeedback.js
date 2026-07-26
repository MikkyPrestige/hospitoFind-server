import mongoose from 'mongoose';

const matchFeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
      index: true,
    },
    rating: {
      type: String,
      enum: ['up', 'down'],
      required: true,
    },
    matchId: {
      type: String, // optional reference to a specific match session
      default: null,
    },
  },
  { timestamps: true },
);

// compound index to prevent duplicate feedback for the same user-hospital pair (one feedback per pair)
matchFeedbackSchema.index({ userId: 1, hospitalId: 1 }, { unique: true });

const MatchFeedback = mongoose.model('MatchFeedback', matchFeedbackSchema);
export default MatchFeedback;
