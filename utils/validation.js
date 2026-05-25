import { z } from "zod";

export const matchSchema = z.object({
  symptoms: z
    .array(z.string().min(1))
    .min(1, "At least one symptom is required"),
  location: z.string().min(1, "Location is required"),
  additionalNeeds: z.string().optional().default(""),
});
