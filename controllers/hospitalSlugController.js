// controllers/hospitalSlugController.js
import mongoose from "mongoose";
import Hospital from "../models/hospitalsModel.js";

const getHospitalBySlug = async (req, res) => {
  const { country, city, slug } = req.params;

  try {
    // 1. Try strict slug match first
    let hospital = await Hospital.findOne({
      slug,
      "address.state": country,
      "address.city": city,
    }).lean();

    // 2. Fallback: try slug only (many hospitals have unique slugs but different country/city)
    if (!hospital) {
      hospital = await Hospital.findOne({ slug }).lean();
    }

    // 3. Fallback: try name (very common case for your JSON-imported hospitals)
    if (!hospital) {
      hospital = await Hospital.findOne({
        name: { $regex: new RegExp(`^${slug.replace(/-/g, " ")}`, "i") },
      }).lean();
    }

    // 4. Fallback: id check if slug looks like ObjectId
    if (!hospital && mongoose.Types.ObjectId.isValid(slug)) {
      hospital = await Hospital.findById(slug).lean();
    }

    // 5. Final fallback to JSON data
    if (!hospital) {
      const localHospitals = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../data/hospitals.json"), "utf-8")
      );

      hospital =
        localHospitals.find(
          (h) =>
            h.slug === slug ||
            h.name.toLowerCase() === slug.replace(/-/g, " ").toLowerCase()
        ) || null;
    }

    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    return res.json(hospital);
  } catch (err) {
    console.error("Error fetching hospital by slug:", err);
    return res.status(500).json({ message: "Server error fetching hospital" });
  }
};

export default { getHospitalBySlug };

// import Hospital from "../models/hospitalsModel.js";

// // @desc Get hospital by slug (country, city, slug)
// // @route GET /hospital/:country/:city/:slug
// // @access Public
//  const getHospitalBySlug = async (req, res) => {
//   const { country, city, slug } = req.params;

//   try {
//     const hospital = await Hospital.findOne({
//       "address.state": country,
//       "address.city": city,
//       slug: slug,
//     }).lean();

//     if (!hospital) {
//       return res.status(404).json({ message: "Hospital not found" });
//     }

//     return res.json(hospital);
//   } catch (err) {
//     console.error("Error fetching hospital by slug:", err);
//     res.status(500).json({ message: "Server error fetching hospital" });
//   }
// };

// export default { getHospitalBySlug };
