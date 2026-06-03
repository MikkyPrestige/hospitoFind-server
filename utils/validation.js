import { z } from "zod";

// ─── COMMON SUB‑SCHEMAS ────────────────────────────────────────────────────
const mongoId = z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
  message: "Invalid ID format",
});

const hospitalAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "Country / State is required"),
});

// Full hospital body – used for creation (POST /hospitals and admin create)
const hospitalBodySchema = z
  .object({
    name: z.string().min(1, "Hospital name is required"),
    address: hospitalAddressSchema,
    phoneNumber: z.string().optional(),
    website: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    photoUrl: z.string().optional(),
    type: z.string().optional(),
    services: z.array(z.string()).optional(),
    comments: z.array(z.string()).optional(),
    hours: z
      .array(
        z.object({
          day: z.string().optional(),
          open: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough(); // allow any extra fields that sanitizer may pass

// ─── AUTH SCHEMAS ──────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().min(1, "Username is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const auth0LoginSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  username: z.string().optional(),
  idToken: z.string().min(1, "ID token is required"),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(1, "New password is required"),
});

// ─── HOSPITAL SCHEMAS ──────────────────────────────────────────────────────
export const addHospitalSchema = hospitalBodySchema;

// For update: all fields optional but address object can be partial
export const updateHospitalSchema = hospitalBodySchema.partial().extend({
  address: hospitalAddressSchema.partial().optional(),
});

export const shareHospitalsSchema = z.object({
  searchParams: z
    .object({
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
    })
    .optional(),
});

// ─── ADMIN SCHEMAS ─────────────────────────────────────────────────────────
export const createUserAdminSchema = z.object({
  name: z.string().optional(),
  username: z.string().min(1, "Username is required"),
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
  role: z.string().optional(),
});

export const updateUserRoleAdminSchema = z.object({
  userId: mongoId,
  newRole: z.enum(["user", "admin"]),
});

export const importFromGoogleSchema = z.object({
  city: z.string().min(1, "City is required"),
  targetCountry: z.string().min(1, "Country is required"),
});

export const importFromOsmSchema = z.object({
  city: z.string().min(1, "City is required"),
  targetCountry: z.string().min(1, "Country is required"),
});

export const createHospitalAdminSchema = hospitalBodySchema;

export const updateHospitalAdminSchema = hospitalBodySchema.partial().extend({
  address: hospitalAddressSchema.partial().optional(),
});

export const batchApproveSchema = z.object({
  ids: z.array(mongoId).min(1, "At least one hospital ID is required"),
});

export const createSymptomMappingSchema = z.object({
  symptomKeywords: z
    .array(z.string().min(1))
    .min(1, "At least one keyword is required"),
  services: z
    .array(z.string().min(1))
    .min(1, "At least one service is required"),
});

export const updateSymptomMappingSchema = z.object({
  symptomKeywords: z.array(z.string().min(1)).optional(),
  services: z.array(z.string().min(1)).optional(),
});

// ─── USER SCHEMAS ──────────────────────────────────────────────────────────
export const updateUserProfileSchema = z.object({
  name: z.string().optional(),
  username: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().optional(),
  role: z.string().optional(),
});

export const updateUserRoleSchema = z.object({
  userId: mongoId,
  newRole: z.enum(["user", "admin"]),
});

export const updatePasswordSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(1, "New password is required"),
});

export const recordViewSchema = z.object({
  hospitalId: mongoId,
});

export const deleteUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().optional(),
});

// ─── HEALTH HISTORY SCHEMAS ────────────────────────────────────────────────
export const updateSessionFeedbackSchema = z.object({
  hospitalVisited: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  feedback: z.string().optional(),
});

// ─── AGENT/ MATCHING SCHEMAS ─────────────────────────────────────────────────────────
export const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string().min(1),
        content: z.string().min(1),
      }),
    )
    .min(1, "Messages array must not be empty"),
  userLocation: z.string().optional(),
});

export const matchSchema = z.object({
  symptoms: z
    .array(z.string().min(1))
    .min(1, "At least one symptom is required"),
  location: z.string().min(1, "Location is required"),
  additionalNeeds: z.string().optional().default(""),
});
