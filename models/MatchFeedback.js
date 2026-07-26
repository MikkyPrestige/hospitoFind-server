import mongoose from 'mongoose';

const matchFeedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null,
    },
    messageId: {
      type: String,
      default: null,
    },
    rating: {
      type: String,
      enum: ['up', 'down'],
      required: true,
    },
    matchId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

// Unique index for userId + messageId (for chat feedback)
matchFeedbackSchema.index(
  { userId: 1, messageId: 1 },
  { unique: true, partialFilterExpression: { messageId: { $type: 'string' } } },
);

// For legacy hospital feedback (no messageId), ensure uniqueness per userId+hospitalId
matchFeedbackSchema.index(
  { userId: 1, hospitalId: 1 },
  { unique: true, partialFilterExpression: { hospitalId: { $type: 'objectId' } } },
);

const MatchFeedback = mongoose.model('MatchFeedback', matchFeedbackSchema);
export default MatchFeedback;
