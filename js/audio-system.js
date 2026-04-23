const DEFAULT_THROW_SOUND_PATH = './sounds/throw.wav';
const DEFAULT_WALL_COLLISION_SOUND_PATH = './sounds/wall_collision.wav';
const DEFAULT_WIN_SOUND_PATH = './sounds/Win.mp3';
const DEFAULT_FAIL_SOUND_PATH = './sounds/Fail.mp3';
const DEFAULT_WALL_COLLISION_MIN_IMPACT = 0.45;
const DEFAULT_WALL_COLLISION_COOLDOWN_MS = 55;

function createAudio(path) {
  try {
    return new Audio(path);
  } catch (error) {
    return null;
  }
}

function preloadAudio(audio) {
  if (!audio) return;
  try {
    audio.preload = 'auto';
    audio.load();
  } catch (error) {
    // Ignore preload errors.
  }
}

function playAudio(audio) {
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  } catch (error) {
    // Ignore playback errors (for example, autoplay restrictions).
  }
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function createGameAudioSystem(options = {}) {
  const throwSoundPath = (
    typeof options.throwSoundPath === 'string' && options.throwSoundPath.trim()
      ? options.throwSoundPath
      : DEFAULT_THROW_SOUND_PATH
  );
  const wallCollisionSoundPath = (
    typeof options.wallCollisionSoundPath === 'string' && options.wallCollisionSoundPath.trim()
      ? options.wallCollisionSoundPath
      : DEFAULT_WALL_COLLISION_SOUND_PATH
  );
  const winSoundPath = (
    typeof options.winSoundPath === 'string' && options.winSoundPath.trim()
      ? options.winSoundPath
      : DEFAULT_WIN_SOUND_PATH
  );
  const failSoundPath = (
    typeof options.failSoundPath === 'string' && options.failSoundPath.trim()
      ? options.failSoundPath
      : DEFAULT_FAIL_SOUND_PATH
  );
  const wallCollisionMinImpact = Math.max(
    0,
    Number(options.wallCollisionMinImpact) || DEFAULT_WALL_COLLISION_MIN_IMPACT
  );
  const wallCollisionCooldownMs = Math.max(
    0,
    Number(options.wallCollisionCooldownMs) || DEFAULT_WALL_COLLISION_COOLDOWN_MS
  );

  let throwAudio = null;
  let wallCollisionAudio = null;
  let winAudio = null;
  let failAudio = null;
  let lastWallCollisionAt = 0;

  const ensureThrowAudio = () => {
    if (throwAudio) return throwAudio;
    throwAudio = createAudio(throwSoundPath);
    preloadAudio(throwAudio);
    return throwAudio;
  };

  const ensureWallCollisionAudio = () => {
    if (wallCollisionAudio) return wallCollisionAudio;
    wallCollisionAudio = createAudio(wallCollisionSoundPath);
    preloadAudio(wallCollisionAudio);
    return wallCollisionAudio;
  };
  const ensureWinAudio = () => {
    if (winAudio) return winAudio;
    winAudio = createAudio(winSoundPath);
    preloadAudio(winAudio);
    return winAudio;
  };
  const ensureFailAudio = () => {
    if (failAudio) return failAudio;
    failAudio = createAudio(failSoundPath);
    preloadAudio(failAudio);
    return failAudio;
  };

  return {
    preload() {
      ensureThrowAudio();
      ensureWallCollisionAudio();
      ensureWinAudio();
      ensureFailAudio();
    },
    playThrow() {
      playAudio(ensureThrowAudio());
    },
    playWallCollision(impactSpeed) {
      const impact = Number(impactSpeed) || 0;
      if (impact < wallCollisionMinImpact) return;

      const now = nowMs();
      if (now - lastWallCollisionAt < wallCollisionCooldownMs) return;

      lastWallCollisionAt = now;
      playAudio(ensureWallCollisionAudio());
    },
    playWin() {
      playAudio(ensureWinAudio());
    },
    playFail() {
      playAudio(ensureFailAudio());
    }
  };
}
