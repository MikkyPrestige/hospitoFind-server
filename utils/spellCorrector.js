let dictionary = new Set();

/**
 * Rebuild the spelling dictionary from the hospital collection.
 * Only words appearing at least 2 times across the database are kept.
 * Call on startup or via admin trigger.
 */
export const buildDictionary = async (Hospital) => {
  const fields = ['name', 'type', 'services'];
  const freqMap = new Map();

  const addTerm = (word) => {
    const cleaned = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (cleaned.length >= 3) {
      freqMap.set(cleaned, (freqMap.get(cleaned) || 0) + 1);
    }
  };

  for (const field of fields) {
    const values = await Hospital.distinct(field, { verified: true });
    values.forEach((val) => {
      if (Array.isArray(val)) {
        val.forEach((v) => {
          if (v && typeof v === 'string') v.split(/[\s,;:()]+/).forEach(addTerm);
        });
      } else if (val && typeof val === 'string') {
        val.split(/[\s,;:()]+/).forEach(addTerm);
      }
    });
  }

  // Keep only words that appear at least 2 times
  dictionary = new Set();
  for (const [word, count] of freqMap) {
    if (count >= 5) {
      dictionary.add(word);
    }
  }

  return dictionary.size;
};

/**
 * Simple Levenshtein distance
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
  let bestScore = -1;

  for (const dictWord of dictionary) {
    // Only consider words with a reasonable length difference
    if (Math.abs(dictWord.length - lowerWord.length) > 5) continue;

    const distance = levenshtein(lowerWord, dictWord);
    if (distance > 5) continue; // generous hard cap

    // Length of common prefix
    const minLen = Math.min(lowerWord.length, dictWord.length);
    let commonPrefix = 0;
    while (commonPrefix < minLen && lowerWord[commonPrefix] === dictWord[commonPrefix]) {
      commonPrefix++;
    }

    // Score: prefers long common prefix, penalises edit distance
    const score = (commonPrefix + 1) / (distance + 1);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = dictWord;
    }
  }

  return bestMatch;
};
