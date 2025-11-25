import Hospital from "../models/hospitalsModel.js";

 const getHospitalBySlug = async (req, res) => {
  const { country, city, slug } = req.params;

  try {
    const hospital = await Hospital.findOne({
      "address.state": country,
      "address.city": city,
      slug: slug,
    }).lean();

    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    return res.json(hospital);
  } catch (err) {
    console.error("Error fetching hospital by slug:", err);
    res.status(500).json({ message: "Server error fetching hospital" });
  }
};

export default { getHospitalBySlug };