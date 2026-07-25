let dictionary = new Set();

/**
 * Rebuild the spelling dictionary from the hospital collection.
 * Call on startup or via admin trigger.
 */
export const buildDictionary = async (Hospital) => {
  const fields = ['name', 'address.city', 'address.state', 'type', 'services'];
  const uniqueTerms = new Set();

  for (const field of fields) {
    const values = await Hospital.distinct(field, { verified: true });
    values.forEach((val) => {
      if (Array.isArray(val)) {
        val.forEach((v) => {
          if (v && typeof v === 'string') {
            v.split(/\s+/).forEach((word) => uniqueTerms.add(word.toLowerCase()));
          }
        });
      } else if (val && typeof val === 'string') {
        val.split(/\s+/).forEach((word) => uniqueTerms.add(word.toLowerCase()));
      }
    });
  }

  dictionary = uniqueTerms;
  return dictionary.size;
};

/**
 * Simple Levenshtein distance implementation
 */
const levenshtein = (a, b) => {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
};

/**
 * Given a word, find the closest match in the dictionary.
 * Returns the original word if no close match found or dictionary empty.
 */
export const correctSpelling = (word) => {
  if (dictionary.size === 0) return word;
  const lowerWord = word.toLowerCase();
  let bestMatch = word;
  let minDistance = Infinity;

  for (const dictWord of dictionary) {
    // Skip words with large length difference
    if (Math.abs(dictWord.length - lowerWord.length) > 3) continue;

    const distance = levenshtein(lowerWord, dictWord);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = dictWord;
    }
  }

  // Only correct if the distance is small (<=2 edits for short words, or <=3 for longer)
  const maxDistance = lowerWord.length <= 4 ? 1 : 2;
  return minDistance <= maxDistance ? bestMatch : word;
};
