// import Hospital from "../models/hospitalsModel.js";

// export const redirectHospitalById = async (req, res) => {
//   try {
//     const hospital = await Hospital.findById(req.params.id);

//     if (!hospital) {
//       return res.status(404).json({ message: "Hospital not found" });
//     }

//     const { state, city } = hospital.address;
//     const finalUrl = `/hospital/${state}/${city}/${hospital.slug}`;

//     return res.redirect(301, finalUrl);
//   } catch (err) {
//     console.error("Redirect error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };
