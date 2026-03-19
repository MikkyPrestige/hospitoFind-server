import User from "../models/User.js";

// ─────────────────────────────────────────────────────────────────────────────
// GET /user/health-history
// ─────────────────────────────────────────────────────────────────────────────
export const getHealthHistory = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("healthHistory")
      .populate("healthHistory.matchedHospitals.hospitalId", "name slug address photoUrl")
      .populate("healthHistory.hospitalVisited", "name slug address photoUrl")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return newest sessions first
    const history = [...(user.healthHistory || [])].reverse();

    return res.status(200).json({
      success: true,
      count: history.length,
      history,
    });
  } catch (err) {
    console.error("getHealthHistory error:", err);
    return res.status(500).json({ message: "Failed to fetch health history" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /user/health-history/:sessionId/feedback
// ─────────────────────────────────────────────────────────────────────────────
export const updateSessionFeedback = async (req, res) => {
  const { sessionId } = req.params;
  const { hospitalVisited, rating, feedback } = req.body;

  if (rating && (rating < 1 || rating > 5)) {
    return res.status(400).json({ message: "Rating must be between 1 and 5" });
  }

  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const session = user.healthHistory.id(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (hospitalVisited !== undefined && hospitalVisited !== "none") {
      session.hospitalVisited = hospitalVisited;
    }
    if (rating !== undefined) session.rating = rating;
    if (feedback !== undefined) session.feedback = feedback;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Feedback saved",
      session,
    });
  } catch (err) {
    console.error("updateSessionFeedback error:", err);
    return res.status(500).json({ message: "Failed to save feedback" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /user/health-history/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
export const deleteSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const session = user.healthHistory.id(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    session.deleteOne();
    await user.save();

    return res.status(200).json({ success: true, message: "Session deleted" });
  } catch (err) {
    console.error("deleteSession error:", err);
    return res.status(500).json({ message: "Failed to delete session" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /user/health-history
// ─────────────────────────────────────────────────────────────────────────────
export const clearHealthHistory = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      $set: { healthHistory: [] },
    });

    return res.status(200).json({ success: true, message: "Health history cleared" });
  } catch (err) {
    console.error("clearHealthHistory error:", err);
    return res.status(500).json({ message: "Failed to clear history" });
  }
};
