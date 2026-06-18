import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';

let model = null;

const init = async () => {
  if (!model) {
    await tf.ready();
    model = await use.load();
  }
};

/**
 * Embed an array of strings into vectors.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export const embedTexts = async (texts) => {
  await init();
  const embeddings = await model.embed(texts);
  // Convert tensors to plain arrays
  return Array.from(embeddings.arraySync());
};
