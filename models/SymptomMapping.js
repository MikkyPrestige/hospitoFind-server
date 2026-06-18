import mongoose from 'mongoose';

const symptomMappingSchema = new mongoose.Schema(
  {
    symptomKeywords: {
      type: [String],
      required: true,
      index: true,
    },
    services: {
      type: [String],
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('SymptomMapping', symptomMappingSchema);
