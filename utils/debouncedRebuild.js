import { rebuildEmbeddings } from './rebuildEmbeddings.js';

let rebuildTimer = null;
let isRebuilding = false;
let pending = false; // true if a request arrived while a rebuild was running

const DEBOUNCE_MS = 5_000; // wait 5 seconds after the last call before rebuilding

const runRebuild = async () => {
  isRebuilding = true;
  try {
    await rebuildEmbeddings();
  } catch (err) {
    console.error('Debounced rebuild failed:', err);
  } finally {
    isRebuilding = false;
    if (pending) {
      pending = false;
      scheduleRebuild();
    }
  }
};

export const scheduleRebuild = () => {
  if (rebuildTimer) clearTimeout(rebuildTimer);

  if (isRebuilding) {
    pending = true;
    return;
  }

  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    runRebuild();
  }, DEBOUNCE_MS);
};
