import mongoose from "mongoose";
import Hospital from "../models/hospitalsModel.js"
import { sanitize } from "../config/sanitize.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MongoDB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const cursor = Hospital.find({}, "name address.slug").cursor();
  let updated = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    try {
      if (!doc.slug || doc.slug.trim() === "") {
        const base = sanitize(doc.name || "hospital");
        let slug = base;
        let i = 0;
        // check uniqueness within state+city
        while (
          await Hospital.exists({
            "address.state": doc.address?.state,
            "address.city": doc.address?.city,
            slug,
          })
        ) {
          i += 1;
          slug = `${base}-${i}`;
          if (i > 10) {
            slug = `${base}-${doc._id.toString().slice(-6)}`;
            break;
          }
        }
        doc.slug = slug;
        await doc.save();
        updated++;
        if (updated % 100 === 0) console.log(`Updated ${updated} hospitals`);
      }
    } catch (err) {
      console.error("Error for doc", doc._id, err);
    }
  }

  console.log(`Done. Total updated: ${updated}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
