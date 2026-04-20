import Groq from "groq-sdk";
import Hospital from "../models/Hospital.js";
import User from "../models/User.js";
import { matchHospitals } from "../utils/matchingEngine.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

//  System prompt
const SYSTEM_PROMPT = `You are HospitoFind's intelligent hospital matchmaking assistant.
Your job is to gently interview a patient to understand their needs, then trigger a hospital match.

CONVERSATION RULES:
1. Be warm, calm, and empathetic — the user may be unwell or anxious.
2. Ask ONE question at a time. Never bombard the user.
3. Collect these 3 pieces of information in order:
   a. Symptoms or reason for seeking care (required)
   b. Location — city, state, or country (required)
   c. Any specific needs — e.g. emergency, specialist, language, accessibility (optional, ask once)
4. Once you have symptoms AND location, you have enough to trigger a match.
5. When ready to trigger the match, output ONLY the raw JSON below with absolutely no other text,
   no explanation, no preamble, no punctuation before or after it:
   {"action":"MATCH","symptoms":["..."],"location":"...","additionalNeeds":"..."}
   ANY text before or after the JSON will break the system. Output the JSON and nothing else.
6. Never diagnose. Never recommend specific treatments. Always encourage professional care.
7. If the user seems to be in an emergency, immediately tell them to call emergency services first.

TONE: Friendly, concise, professional. Like a knowledgeable healthcare receptionist.`;


const extractMatchTrigger = (text) => {
  try {
    const trimmed = text.trim();

    // Case 1 — pure JSON
    if (trimmed.startsWith("{") && trimmed.includes('"action":"MATCH"')) {
      return JSON.parse(trimmed);
    }

    // Case 2 — wrapped in markdown code fences
    const fenceMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenceMatch) {
      const parsed = JSON.parse(fenceMatch[1]);
      if (parsed.action === "MATCH") return parsed;
    }

    // Case 3 — JSON embedded anywhere in prose
    const embeddedMatch = trimmed.match(
      /\{[\s\S]*?"action"\s*:\s*"MATCH"[\s\S]*?\}/,
    );
    if (embeddedMatch) {
      const parsed = JSON.parse(embeddedMatch[0]);
      if (parsed.action === "MATCH") return parsed;
    }
  } catch {
    // Not a trigger
  }
  return null;
};


const detectPatterns = (healthHistory) => {
  if (!healthHistory || healthHistory.length < 3) return null;

  const symptomCount = {};
  healthHistory.forEach((session) => {
    (session.symptoms || []).forEach((symptom) => {
      const key = symptom.toLowerCase();
      symptomCount[key] = (symptomCount[key] || 0) + 1;
    });
  });

  const repeated = Object.entries(symptomCount)
    .filter(([, count]) => count >= 3)
    .map(([symptom]) => symptom);

  if (repeated.length > 0) {
    return `You've mentioned ${repeated.join(", ")} in multiple recent sessions. Consider seeing a specialist.`;
  }
  return null;
};

// POST /agent/chat
export const chat = async (req, res) => {
  const { messages = [], userLocation } = req.body;

  if (!messages.length) {
    return res.status(400).json({ message: "No messages provided" });
  }

  try {
    let historyContext = "";

    if (req.userId) {
      const user = await User.findById(req.userId)
        .select("healthHistory")
        .lean();

      if (user?.healthHistory?.length > 0) {
        const recent = user.healthHistory.slice(-3);
        const recentSymptoms = recent
          .flatMap((s) => s.symptoms)
          .filter(Boolean)
          .join(", ");

        if (recentSymptoms) {
          historyContext = `\n\nUSER HEALTH CONTEXT (from previous sessions): This returning user has previously reported: ${recentSymptoms}. Reference this naturally if relevant.`;
        }

        const patternAlert = detectPatterns(user.healthHistory);
        if (patternAlert) {
          historyContext += `\n\nPATTERN ALERT: ${patternAlert} Mention this gently at an appropriate moment.`;
        }
      }
    }

    if (userLocation) {
      historyContext += `\n\nUSER LOCATION (already known — DO NOT ask for location): The user's location is "${userLocation}". Use this location directly when triggering the match. Never ask the user where they are located.`;
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + historyContext },
        ...messages.map(({ role, content }) => ({ role, content })),
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const responseText = completion.choices[0].message.content;
    const matchTrigger = extractMatchTrigger(responseText);

    if (matchTrigger) {
      if (!matchTrigger.location && userLocation) {
        matchTrigger.location = userLocation;
      }

      return res.status(200).json({
        type: "MATCH_READY",
        profile: {
          symptoms: matchTrigger.symptoms,
          location: matchTrigger.location || userLocation || "",
          additionalNeeds: matchTrigger.additionalNeeds || "",
        },
      });
    }

    return res.status(200).json({
      type: "MESSAGE",
      message: responseText,
    });
  } catch (err) {
    console.error("Agent chat error:", err);
    return res.status(500).json({ message: "Agent service unavailable" });
  }
};

// POST /agent/match
export const match = async (req, res) => {
  const { symptoms = [], location = "", additionalNeeds = "" } = req.body;

  if (!symptoms.length || !location) {
    return res
      .status(400)
      .json({ message: "Symptoms and location are required" });
  }

  try {
    const hospitals = await Hospital.find({}).lean();

    if (!hospitals.length) {
      return res
        .status(404)
        .json({ message: "No hospitals found in database" });
    }

    const matchResult = matchHospitals(
      { symptoms, location, additionalNeeds },
      hospitals,
      5,
    );

    if (matchResult.noResults) {
      return res.status(200).json({
        success: true,
        count: 0,
        noResults: true,
        region: matchResult.region,
        message: matchResult.message,
        profile: { symptoms, location, additionalNeeds },
        hospitals: [],
      });
    }

    if (req.userId) {
      const session = {
        symptoms,
        location,
        matchedHospitals: matchResult.results.slice(0, 3).map((h) => ({
          hospitalId: h._id,
          name: h.name,
          matchScore: h.matchScore,
        })),
      };

      await User.findByIdAndUpdate(
        req.userId,
        { $push: { healthHistory: session } },
        { new: true },
      );
    }

    return res.status(200).json({
      success: true,
      count: matchResult.results.length,
      noResults: false,
      profile: { symptoms, location, additionalNeeds },
      hospitals: matchResult.results,
    });
  } catch (err) {
    console.error("Agent match error:", err);
    return res.status(500).json({ message: "Matching service unavailable" });
  }
};
