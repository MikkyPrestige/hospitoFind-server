import { embedTexts } from "../utils/embeddings.js";

describe("Transformers.js embeddings", () => {
  it("generates an embedding for a single sentence", async () => {
    const [vec] = await embedTexts(["cardiology emergency"]);
    expect(Array.isArray(vec)).toBe(true);
    expect(vec.length).toBeGreaterThan(0);
  }, 60000);
});
