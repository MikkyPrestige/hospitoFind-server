// controllers/hospitalSlugController.js
import mongoose from "mongoose";
import Hospital from "../models/hospitalsModel.js";

const getHospitalBySlug = async (req, res) => {
  const { country, city, slug } = req.params;

  try {
    // strict slug match first
    let hospital = await Hospital.findOne({
      slug,
      "address.state": country,
      "address.city": city,
    }).lean();

    //  slug only (some hospitals have unique slugs but different country/city)
    if (!hospital) {
      hospital = await Hospital.findOne({ slug }).lean();
    }

    // name
    if (!hospital) {
      hospital = await Hospital.findOne({
        name: { $regex: new RegExp(`^${slug.replace(/-/g, " ")}`, "i") },
      }).lean();
    }

    // id check if slug looks like ObjectId
    if (!hospital && mongoose.Types.ObjectId.isValid(slug)) {
      hospital = await Hospital.findById(slug).lean();
    }

    // fallback to JSON data
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
    // console.error("Error fetching hospital by slug:", err);
    return res.status(500).json({ message: "Server error fetching hospital" });
  }
};

export default { getHospitalBySlug };