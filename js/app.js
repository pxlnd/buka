const STAGES_PER_LEVEL = 5;
const DEFAULT_LEVEL_VISUALS = Object.freeze({
  background: '#DCE7FF',
  field: '#8692FF'
});
const LEVEL_VISUAL_DEFAULTS = Object.freeze({
  1: Object.freeze({
    background: '#DCE7FF',
    field: '#8692FF'
  }),
  2: Object.freeze({
    background: '#BC9AFB',
    field: '#FFFFFF'
  })
});
const DEFAULT_COMMON_SETTINGS = Object.freeze({
  physics: {
    impulse: 0.2,
    braking: 0.0035
  }
});

const COLOR_TOKENS = {
  yellow: '#f6c531',
  red: '#e8393b',
  green: '#1fd95b',
  blue: '#2aa4ff',
  pink: '#ff5ca0',
  orange: '#ff9f1a'
};

const DEFAULT_POLYGON = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 }
];

const LEGACY_SIDE_TO_EDGE = {
  top: 0,
  right: 1,
  bottom: 2,
  left: 3
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const levelLabel = document.getElementById('levelLabel');
const progressSteps = document.getElementById('progressSteps');
const restartBtn = document.getElementById('restartBtn');
const backBtn = document.getElementById('backBtn');
const loseOverlay = document.getElementById('loseOverlay');
const loseRetryBtn = document.getElementById('loseRetryBtn');

const debugCloseBtn = document.getElementById('debugCloseBtn');
const debugPanel = document.getElementById('debugPanel');
const debugEditorMode = document.getElementById('debugEditorMode');
const debugLevelSelect = document.getElementById('debugLevelSelect');
const debugStageSelect = document.getElementById('debugStageSelect');
const debugLevelNumber = document.getElementById('debugLevelNumber');
const debugLoadLevelBtn = document.getElementById('debugLoadLevelBtn');
const debugNewLevelBtn = document.getElementById('debugNewLevelBtn');
const debugClearStageBtn = document.getElementById('debugClearStageBtn');
const debugBallColor = document.getElementById('debugBallColor');
const debugBallImpulse = document.getElementById('debugBallImpulse');
const debugBallBraking = document.getElementById('debugBallBraking');
const debugBackgroundColor = document.getElementById('debugBackgroundColor');
const debugFieldColor = document.getElementById('debugFieldColor');
const debugSaveSettingsBtn = document.getElementById('debugSaveSettingsBtn');
const debugToolRow = document.getElementById('debugToolRow');
const debugResetPolygonBtn = document.getElementById('debugResetPolygonBtn');
const debugVertexList = document.getElementById('debugVertexList');
const debugGateSide = document.getElementById('debugGateSide');
const debugGateColor = document.getElementById('debugGateColor');
const debugGateSize = document.getElementById('debugGateSize');
const debugGateCount = document.getElementById('debugGateCount');
const debugGateList = document.getElementById('debugGateList');
const debugObstacleList = document.getElementById('debugObstacleList');
const debugObstacleVertexList = document.getElementById('debugObstacleVertexList');
const debugObstacleStartBtn = document.getElementById('debugObstacleStartBtn');
const debugObstacleFinishBtn = document.getElementById('debugObstacleFinishBtn');
const debugObstacleCancelBtn = document.getElementById('debugObstacleCancelBtn');
const debugSaveBtn = document.getElementById('debugSaveBtn');
const debugStatus = document.getElementById('debugStatus');

const state = {
  levels: [],
  levelIndex: 0,
  stageIndex: 0,
  stageLocked: false,
  shotUsed: false,
  commonSettings: {
    physics: {
      impulse: DEFAULT_COMMON_SETTINGS.physics.impulse,
      braking: DEFAULT_COMMON_SETTINGS.physics.braking
    }
  },
  levelVisuals: {
    background: DEFAULT_LEVEL_VISUALS.background,
    field: DEFAULT_LEVEL_VISUALS.field
  },
  arena: { x: 16, y: 16, w: 328, h: 328 },
  worldPolygon: {
    points: [],
    edges: []
  },
  worldObstacles: [],
  ball: {
    x: 70,
    y: 300,
    r: 16,
    colorToken: 'yellow',
    color: COLOR_TOKENS.yellow,
    vx: 0,
    vy: 0,
    moving: false
  },
  dragging: false,
  pull: { x: 0, y: 0 },
  lastTs: 0,
  dpr: 1,
  canvasRect: null,
  editor: {
    panelOpen: false,
    enabled: false,
    tool: 'start',
    draftObstacle: null,
    dragVertexIndex: -1,
    dragObstacle: null,
    selectedObstacleIndex: -1,
    isSaving: false,
    isSavingSettings: false
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clonePoints(points) {
  return points.map((point) => ({ x: point.x, y: point.y }));
}

function defaultPolygon() {
  return clonePoints(DEFAULT_POLYGON);
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeHexColor(value, fallback) {
  if (!isHexColor(value)) return fallback;
  return value.trim().toUpperCase();
}

function normalizeLevelVisualSettings(rawVisuals, fallback = DEFAULT_LEVEL_VISUALS) {
  const safeFallback = {
    background: normalizeHexColor(fallback?.background, DEFAULT_LEVEL_VISUALS.background),
    field: normalizeHexColor(fallback?.field, DEFAULT_LEVEL_VISUALS.field)
  };

  return {
    background: normalizeHexColor(rawVisuals?.background, safeFallback.background),
    field: normalizeHexColor(rawVisuals?.field, safeFallback.field)
  };
}

function defaultLevelVisualsForNumber(levelNumber) {
  const key = clamp(Number(levelNumber) || 1, 1, 9999);
  const preset = LEVEL_VISUAL_DEFAULTS[key];
  return normalizeLevelVisualSettings(preset, DEFAULT_LEVEL_VISUALS);
}

function isValidColorToken(token) {
  return typeof token === 'string' && (token in COLOR_TOKENS || /^#[0-9a-fA-F]{6}$/.test(token));
}

function colorValue(token) {
  if (typeof token !== 'string') return COLOR_TOKENS.yellow;
  return COLOR_TOKENS[token] || token;
}

function createPolygonPath(points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function pointToSegment(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;

  if (lenSq <= 0.000001) {
    const dx = point.x - a.x;
    const dy = point.y - a.y;
    return {
      t: 0,
      x: a.x,
      y: a.y,
      dist: Math.hypot(dx, dy)
    };
  }

  const t = clamp(((point.x - a.x) * vx + (point.y - a.y) * vy) / lenSq, 0, 1);
  const x = a.x + vx * t;
  const y = a.y + vy * t;

  return {
    t,
    x,
    y,
    dist: Math.hypot(point.x - x, point.y - y)
  };
}

function polygonArea(points) {
  if (!points || points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }

  return area * 0.5;
}

function pointOnSegment(point, a, b, epsilon = 1e-6) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > epsilon) return false;

  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < -epsilon) return false;

  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (dot - lenSq > epsilon) return false;

  return true;
}

function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (pointOnSegment(point, a, b)) return true;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];

    const intersects = (
      (pi.y > point.y) !== (pj.y > point.y)
      && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || 1e-9) + pi.x
    );

    if (intersects) inside = !inside;
  }

  return inside;
}

function polygonCentroid(points) {
  if (!points || points.length < 3) {
    return { x: 0.5, y: 0.5 };
  }

  const area = polygonArea(points);
  if (Math.abs(area) < 1e-6) {
    const sum = points.reduce((acc, point) => {
      acc.x += point.x;
      acc.y += point.y;
      return acc;
    }, { x: 0, y: 0 });

    return {
      x: sum.x / points.length,
      y: sum.y / points.length
    };
  }

  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }

  const factor = 1 / (6 * area);
  return {
    x: cx * factor,
    y: cy * factor
  };
}

function stageLabel(index) {
  return `Этап ${index + 1}/${STAGES_PER_LEVEL}`;
}

function parseLevelNumberFromFile(fileName) {
  const match = /^level-(\d+)\.json$/.exec(fileName || '');
  return match ? Number(match[1]) : null;
}

function fileNameForLevel(number) {
  return `level-${number}.json`;
}

function setDebugStatus(text, isError = false) {
  debugStatus.textContent = text;
  debugStatus.classList.toggle('error', Boolean(isError));
}

function makeBlankStage() {
  return {
    ballColor: 'yellow',
    start: { x: 0.14, y: 0.84 },
    polygon: defaultPolygon(),
    gates: [],
    obstacles: []
  };
}

function makeBlankLevel(number) {
  const visuals = defaultLevelVisualsForNumber(number);
  return {
    number,
    fileName: fileNameForLevel(number),
    background: visuals.background,
    field: visuals.field,
    stages: Array.from({ length: STAGES_PER_LEVEL }, () => makeBlankStage())
  };
}

function normalizePolygon(rawPoints) {
  const source = Array.isArray(rawPoints) ? rawPoints : defaultPolygon();
  const cleaned = [];

  for (const point of source) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) continue;

    const normalized = {
      x: round(clamp(Number(point.x), 0, 1)),
      y: round(clamp(Number(point.y), 0, 1))
    };

    const previous = cleaned[cleaned.length - 1];
    if (previous && Math.hypot(previous.x - normalized.x, previous.y - normalized.y) < 0.005) {
      continue;
    }

    cleaned.push(normalized);
  }

  if (cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.005) {
      cleaned.pop();
    }
  }

  if (cleaned.length < 3 || Math.abs(polygonArea(cleaned)) < 0.0001) {
    return defaultPolygon();
  }

  return cleaned;
}

function normalizeGate(gate, edgeCount) {
  let edge = Number.isFinite(Number(gate?.edge))
    ? Math.floor(Number(gate.edge))
    : LEGACY_SIDE_TO_EDGE[gate?.side] ?? 0;

  edge = clamp(edge, 0, Math.max(0, edgeCount - 1));

  const size = clamp(Number(gate?.size) || 0.24, 0.05, 0.95);
  const half = size * 0.5;
  const at = clamp(Number(gate?.at) || 0.5, half, 1 - half);
  const color = isValidColorToken(gate?.color) ? gate.color : 'yellow';

  return {
    edge,
    at: round(at),
    size: round(size),
    color
  };
}

function makeRectObstaclePolygon(obstacle) {
  const x = clamp(Number(obstacle?.x) || 0.1, 0, 1);
  const y = clamp(Number(obstacle?.y) || 0.1, 0, 1);
  const maxW = Math.max(0.03, 1 - x);
  const maxH = Math.max(0.03, 1 - y);
  const w = clamp(Number(obstacle?.w) || 0.2, 0.03, maxW);
  const h = clamp(Number(obstacle?.h) || 0.1, 0.03, maxH);

  return [
    { x: round(x), y: round(y) },
    { x: round(x + w), y: round(y) },
    { x: round(x + w), y: round(y + h) },
    { x: round(x), y: round(y + h) }
  ];
}

function normalizeObstaclePolygon(rawPoints) {
  const source = Array.isArray(rawPoints) ? rawPoints : [];
  const cleaned = [];

  for (const point of source) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) continue;

    const normalized = {
      x: round(clamp(Number(point.x), 0, 1)),
      y: round(clamp(Number(point.y), 0, 1))
    };

    const previous = cleaned[cleaned.length - 1];
    if (previous && Math.hypot(previous.x - normalized.x, previous.y - normalized.y) < 0.005) {
      continue;
    }

    cleaned.push(normalized);
  }

  if (cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.005) {
      cleaned.pop();
    }
  }

  if (cleaned.length < 3 || Math.abs(polygonArea(cleaned)) < 0.0001) {
    return null;
  }

  return cleaned;
}

function normalizeObstacle(obstacle) {
  let points = null;

  if (Array.isArray(obstacle?.polygon)) {
    points = normalizeObstaclePolygon(obstacle.polygon);
  } else if (Array.isArray(obstacle?.points)) {
    points = normalizeObstaclePolygon(obstacle.points);
  } else if (
    Number.isFinite(Number(obstacle?.x))
    && Number.isFinite(Number(obstacle?.y))
    && Number.isFinite(Number(obstacle?.w))
    && Number.isFinite(Number(obstacle?.h))
  ) {
    points = normalizeObstaclePolygon(makeRectObstaclePolygon(obstacle));
  }

  if (!points) return null;

  return { polygon: points };
}

function normalizeStart(start, polygon) {
  const candidate = {
    x: clamp(Number(start?.x) || 0.14, 0, 1),
    y: clamp(Number(start?.y) || 0.84, 0, 1)
  };

  if (pointInPolygon(candidate, polygon)) {
    return {
      x: round(candidate.x),
      y: round(candidate.y)
    };
  }

  const centroid = polygonCentroid(polygon);
  return {
    x: round(clamp(centroid.x, 0, 1)),
    y: round(clamp(centroid.y, 0, 1))
  };
}

function normalizeStage(stage) {
  const polygon = normalizePolygon(stage?.polygon || stage?.field?.polygon || stage?.field?.points);
  const edgeCount = polygon.length;

  const ballColor = isValidColorToken(stage?.ballColor) ? stage.ballColor : 'yellow';
  const start = normalizeStart(stage?.start, polygon);

  const gates = Array.isArray(stage?.gates)
    ? stage.gates.map((gate) => normalizeGate(gate, edgeCount))
    : [];

  const obstacles = Array.isArray(stage?.obstacles)
    ? stage.obstacles.map(normalizeObstacle).filter(Boolean)
    : [];

  return {
    ballColor,
    start,
    polygon,
    gates,
    obstacles
  };
}

function normalizeImpulse(value) {
  const parsed = Number(value);
  const candidate = Number.isFinite(parsed) ? parsed : DEFAULT_COMMON_SETTINGS.physics.impulse;
  return round(clamp(candidate, 0.05, 1), 4);
}

function normalizeBraking(value) {
  const parsed = Number(value);
  const candidate = Number.isFinite(parsed) ? parsed : DEFAULT_COMMON_SETTINGS.physics.braking;
  return round(clamp(candidate, 0.0005, 0.03), 6);
}

function normalizeCommonSettings(raw) {
  return {
    physics: {
      impulse: normalizeImpulse(raw?.physics?.impulse),
      braking: normalizeBraking(raw?.physics?.braking)
    }
  };
}

function normalizeLevel(rawLevel, fileName = null) {
  const fileNumber = parseLevelNumberFromFile(fileName || '');
  const number = clamp(Number(rawLevel?.number) || fileNumber || 1, 1, 9999);
  const visuals = normalizeLevelVisualSettings({
    background: rawLevel?.background ?? rawLevel?.visuals?.background,
    field: rawLevel?.field ?? rawLevel?.visuals?.field
  }, defaultLevelVisualsForNumber(number));

  const sourceStages = Array.isArray(rawLevel?.stages) ? rawLevel.stages : [];
  const stages = [];

  for (let i = 0; i < STAGES_PER_LEVEL; i += 1) {
    stages.push(normalizeStage(sourceStages[i] || makeBlankStage()));
  }

  return {
    number,
    fileName: fileName || fileNameForLevel(number),
    background: visuals.background,
    field: visuals.field,
    stages
  };
}

function serializeStage(stage) {
  return {
    ballColor: stage.ballColor,
    start: {
      x: round(stage.start.x),
      y: round(stage.start.y)
    },
    polygon: stage.polygon.map((point) => ({
      x: round(point.x),
      y: round(point.y)
    })),
    gates: stage.gates.map((gate) => ({
      edge: Math.floor(gate.edge),
      at: round(gate.at),
      size: round(gate.size),
      color: gate.color
    })),
    obstacles: stage.obstacles.map((obstacle) => ({
      polygon: obstacle.polygon.map((point) => ({
        x: round(point.x),
        y: round(point.y)
      }))
    }))
  };
}

function serializeLevel(level) {
  const visuals = normalizeLevelVisualSettings(level, defaultLevelVisualsForNumber(level.number));

  return {
    number: level.number,
    background: visuals.background,
    field: visuals.field,
    stages: level.stages.map(serializeStage)
  };
}

function serializeCommonSettings(settings) {
  return {
    physics: {
      impulse: normalizeImpulse(settings?.physics?.impulse),
      braking: normalizeBraking(settings?.physics?.braking)
    }
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function loadLevelFilesFromManifest() {
  const manifest = await fetchJson('./data/levels/manifest.json');
  if (!manifest || !Array.isArray(manifest.levels)) {
    throw new Error('Некорректный manifest.json');
  }

  return manifest.levels
    .filter((entry) => /^level-\d+\.json$/.test(entry))
    .sort((a, b) => (parseLevelNumberFromFile(a) || 0) - (parseLevelNumberFromFile(b) || 0));
}

async function loadLevelsFromJson() {
  let files = [];
  try {
    files = await loadLevelFilesFromManifest();
  } catch (error) {
    setDebugStatus(`Manifest не найден (${error.message}). Загружаю дефолт.`, true);
    return [makeBlankLevel(1)];
  }

  const levels = [];

  for (const fileName of files) {
    try {
      const rawLevel = await fetchJson(`./data/levels/${fileName}`);
      levels.push(normalizeLevel(rawLevel, fileName));
    } catch (error) {
      setDebugStatus(`Не удалось прочитать ${fileName}: ${error.message}`, true);
    }
  }

  if (!levels.length) {
    return [makeBlankLevel(1)];
  }

  levels.sort((a, b) => a.number - b.number);
  return levels;
}

async function saveLevelToServer(level) {
  const number = clamp(Number(level.number) || 1, 1, 9999);
  const fileName = fileNameForLevel(number);
  const payload = serializeLevel({ ...level, number });

  const response = await fetch(`/api/levels/${fileName}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function loadCommonSettings() {
  try {
    const raw = await fetchJson('/api/settings/common');
    return normalizeCommonSettings(raw);
  } catch (error) {
    setDebugStatus(`Не удалось загрузить общие настройки: ${error.message}. Использую дефолт.`, true);
    return normalizeCommonSettings(DEFAULT_COMMON_SETTINGS);
  }
}

async function saveCommonSettingsToServer(settings) {
  const payload = serializeCommonSettings(settings);

  const response = await fetch('/api/settings/common', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `${response.status} ${response.statusText}`);
  }

  return response.json();
}

function currentLevel() {
  return state.levels[state.levelIndex];
}

function currentStage() {
  return currentLevel().stages[state.stageIndex];
}

function currentLevelVisualSettings(level = null) {
  const target = level || (state.levels.length ? currentLevel() : null);
  const number = clamp(Number(target?.number) || 1, 1, 9999);
  return normalizeLevelVisualSettings(target, defaultLevelVisualsForNumber(number));
}

function applyLevelVisualSettings(level = null) {
  const visuals = currentLevelVisualSettings(level);
  state.levelVisuals = visuals;
  document.documentElement.style.setProperty('--level-bg', visuals.background);
}

function ensureCurrentStageShape() {
  const stage = currentStage();
  stage.polygon = normalizePolygon(stage.polygon);

  const edgeCount = stage.polygon.length;
  stage.gates = stage.gates.map((gate) => normalizeGate(gate, edgeCount));
  stage.obstacles = stage.obstacles.map(normalizeObstacle).filter(Boolean);
  stage.start = normalizeStart(stage.start, stage.polygon);
}

function rebuildWorldPolygon() {
  const stage = currentStage();
  const normalized = normalizePolygon(stage.polygon);

  const worldPoints = normalized.map((point) => ({
    x: state.arena.x + point.x * state.arena.w,
    y: state.arena.y + point.y * state.arena.h
  }));

  const edges = [];

  for (let i = 0; i < worldPoints.length; i += 1) {
    const a = worldPoints[i];
    const b = worldPoints[(i + 1) % worldPoints.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);

    if (len < 1e-4) continue;

    const tx = dx / len;
    const ty = dy / len;
    let inx = -ty;
    let iny = tx;

    const mid = {
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5
    };

    const probe = {
      x: mid.x + inx * 6,
      y: mid.y + iny * 6
    };

    if (!pointInPolygon(probe, worldPoints)) {
      inx = -inx;
      iny = -iny;
    }

    edges.push({
      index: i,
      a,
      b,
      len,
      tx,
      ty,
      inx,
      iny
    });
  }

  state.worldPolygon.points = worldPoints;
  state.worldPolygon.edges = edges;
}

function polygonBounds(points) {
  if (!points.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0
    };
  }

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function rebuildWorldObstacles() {
  const stage = currentStage();
  const worldObstacles = [];

  stage.obstacles.forEach((obstacle, index) => {
    const points = obstacle.polygon.map((point) => ({
      x: state.arena.x + point.x * state.arena.w,
      y: state.arena.y + point.y * state.arena.h
    }));

    if (points.length < 3) return;

    const edges = [];

    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);

      if (len < 1e-4) continue;

      const tx = dx / len;
      const ty = dy / len;
      let ox = -ty;
      let oy = tx;

      const mid = {
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5
      };

      const probe = {
        x: mid.x + ox * 4,
        y: mid.y + oy * 4
      };

      // Obstacles are solid inside, so we need normals directed outside.
      if (pointInPolygon(probe, points)) {
        ox = -ox;
        oy = -oy;
      }

      edges.push({
        index: i,
        a,
        b,
        len,
        tx,
        ty,
        ox,
        oy
      });
    }

    worldObstacles.push({
      index,
      points,
      edges,
      bounds: polygonBounds(points),
      area: polygonArea(points)
    });
  });

  state.worldObstacles = worldObstacles;
}

function syncBallWithStage() {
  const stage = currentStage();
  stage.start = normalizeStart(stage.start, stage.polygon);

  state.ball.x = state.arena.x + stage.start.x * state.arena.w;
  state.ball.y = state.arena.y + stage.start.y * state.arena.h;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.moving = false;
  state.ball.colorToken = stage.ballColor;
  state.ball.color = colorValue(stage.ballColor);
}

function gateSpan(gate) {
  const size = clamp(Number(gate?.size) || 0.24, 0.05, 0.95);
  const half = size * 0.5;
  const center = clamp(Number(gate?.at) || 0.5, half, 1 - half);

  return {
    size,
    half,
    center
  };
}

function gateSegment(gate) {
  const edge = state.worldPolygon.edges[gate.edge];
  if (!edge) return null;

  const span = gateSpan(gate);
  const startT = span.center - span.half;
  const endT = span.center + span.half;

  const sx = edge.a.x + edge.tx * (startT * edge.len);
  const sy = edge.a.y + edge.ty * (startT * edge.len);
  const ex = edge.a.x + edge.tx * (endT * edge.len);
  const ey = edge.a.y + edge.ty * (endT * edge.len);

  return {
    edge,
    sx,
    sy,
    ex,
    ey,
    cx: (sx + ex) * 0.5,
    cy: (sy + ey) * 0.5,
    tx: edge.tx,
    ty: edge.ty,
    nx: edge.inx,
    ny: edge.iny,
    color: colorValue(gate.color)
  };
}

function findGateHit(edgeIndex, t) {
  const stage = currentStage();

  for (const gate of stage.gates) {
    if (gate.edge !== edgeIndex) continue;

    const span = gateSpan(gate);
    if (t >= span.center - span.half && t <= span.center + span.half) {
      return gate;
    }
  }

  return null;
}

function findNearestObstacleVertex(point, maxDistance = 14) {
  let hit = null;
  let bestDistance = maxDistance;

  state.worldObstacles.forEach((obstacle, obstacleIndex) => {
    obstacle.points.forEach((vertex, vertexIndex) => {
      const distance = Math.hypot(point.x - vertex.x, point.y - vertex.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        hit = { obstacleIndex, vertexIndex, distance };
      }
    });
  });

  return hit;
}

function findObstacleByPoint(point) {
  for (let i = state.worldObstacles.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(point, state.worldObstacles[i].points)) {
      return i;
    }
  }
  return -1;
}

function findNearestObstacleEdge(point, obstacleIndex, maxDistance = 18) {
  const obstacle = state.worldObstacles[obstacleIndex];
  if (!obstacle) return null;

  let best = null;
  let bestDistance = maxDistance;

  obstacle.edges.forEach((edge) => {
    const closest = pointToSegment(point, edge.a, edge.b);
    if (closest.dist < bestDistance) {
      bestDistance = closest.dist;
      best = {
        edgeIndex: edge.index
      };
    }
  });

  return best;
}

function updateHeader() {
  levelLabel.textContent = `LEVEL ${currentLevel().number}`;
}

function updateProgress() {
  progressSteps.innerHTML = '';

  for (let i = 0; i < STAGES_PER_LEVEL; i += 1) {
    const dot = document.createElement('div');
    dot.className = 'step-dot';
    if (i < state.stageIndex) dot.classList.add('done');
    if (i === state.stageIndex) dot.classList.add('active');
    progressSteps.appendChild(dot);
  }
}

function formatDecimal(value, digits = 4) {
  return Number(value).toFixed(digits).replace(/\.?0+$/, '');
}

function syncPhysicsInputs() {
  debugBallImpulse.value = formatDecimal(state.commonSettings.physics.impulse, 4);
  debugBallBraking.value = formatDecimal(state.commonSettings.physics.braking, 6);
}

function setCommonSettings(nextSettings) {
  state.commonSettings = normalizeCommonSettings(nextSettings);
  syncPhysicsInputs();
}

function updatePhysicsSettingsFromInputs() {
  setCommonSettings({
    ...state.commonSettings,
    physics: {
      impulse: debugBallImpulse.value,
      braking: debugBallBraking.value
    }
  });
}

function updateCurrentLevelColorsFromInputs() {
  if (!state.levels.length) return true;

  const level = currentLevel();
  const currentVisuals = currentLevelVisualSettings(level);
  const rawBackground = String(debugBackgroundColor.value || '').trim();
  const rawField = String(debugFieldColor.value || '').trim();

  if (!isHexColor(rawBackground) || !isHexColor(rawField)) {
    debugBackgroundColor.value = currentVisuals.background;
    debugFieldColor.value = currentVisuals.field;
    setDebugStatus('Цвета должны быть в формате #RRGGBB.', true);
    return false;
  }

  level.background = normalizeHexColor(rawBackground, currentVisuals.background);
  level.field = normalizeHexColor(rawField, currentVisuals.field);
  applyLevelVisualSettings(level);

  debugBackgroundColor.value = level.background;
  debugFieldColor.value = level.field;
  return true;
}

function updateCommonSettingsFromInputs() {
  updatePhysicsSettingsFromInputs();
  return true;
}

function hideLoseOverlay() {
  loseOverlay.classList.remove('is-visible');
  loseOverlay.hidden = true;
}

function showLoseOverlay() {
  loseOverlay.hidden = false;
  requestAnimationFrame(() => loseOverlay.classList.add('is-visible'));
}

function syncGateEdgeOptions() {
  const previous = debugGateSide.value;
  debugGateSide.innerHTML = '';

  const autoOption = document.createElement('option');
  autoOption.value = 'auto';
  autoOption.textContent = 'auto';
  debugGateSide.appendChild(autoOption);

  state.worldPolygon.edges.forEach((edge, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `edge ${edge.index + 1}`;
    debugGateSide.appendChild(option);
  });

  if ([...debugGateSide.options].some((option) => option.value === previous)) {
    debugGateSide.value = previous;
  } else {
    debugGateSide.value = 'auto';
  }
}

function renderDebugLists() {
  const stage = currentStage();
  const hasDraft = Boolean(state.editor.draftObstacle);
  const draftPoints = state.editor.draftObstacle?.points || [];

  if (
    state.editor.selectedObstacleIndex < 0
    || state.editor.selectedObstacleIndex >= stage.obstacles.length
  ) {
    state.editor.selectedObstacleIndex = -1;
  }

  debugVertexList.innerHTML = '';
  stage.polygon.forEach((vertex, index) => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${index + 1}. x=${vertex.x.toFixed(2)} y=${vertex.y.toFixed(2)}`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-btn';
    removeButton.dataset.vertexIndex = String(index);
    removeButton.textContent = 'Удалить';

    li.append(text, removeButton);
    debugVertexList.appendChild(li);
  });

  debugGateList.innerHTML = '';
  if (!stage.gates.length) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = 'Ворот нет';
    debugGateList.appendChild(li);
  } else {
    stage.gates.forEach((gate, index) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = `${index + 1}. edge=${gate.edge + 1} | at=${gate.at.toFixed(2)} | size=${gate.size.toFixed(2)} | ${gate.color}`;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-btn';
      removeButton.dataset.gateIndex = String(index);
      removeButton.textContent = 'Удалить';

      li.append(text, removeButton);
      debugGateList.appendChild(li);
    });
  }

  debugObstacleList.innerHTML = '';
  if (!stage.obstacles.length) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = 'Препятствий нет';
    debugObstacleList.appendChild(li);
  } else {
    stage.obstacles.forEach((obstacle, index) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      const selected = index === state.editor.selectedObstacleIndex;
      text.textContent = `${selected ? '● ' : ''}${index + 1}. вершин=${obstacle.polygon.length}`;

      const buttons = document.createElement('span');
      buttons.className = 'list-actions';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'pick-btn';
      editButton.dataset.obstacleSelect = String(index);
      editButton.textContent = selected ? 'Выбрано' : 'Выбрать';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-btn';
      removeButton.dataset.obstacleIndex = String(index);
      removeButton.textContent = 'Удалить';

      buttons.append(editButton, removeButton);
      li.append(text, buttons);
      debugObstacleList.appendChild(li);
    });
  }

  debugObstacleVertexList.innerHTML = '';
  if (hasDraft) {
    draftPoints.forEach((point, index) => {
      const li = document.createElement('li');
      li.textContent = `Черновик ${index + 1}. x=${point.x.toFixed(2)} y=${point.y.toFixed(2)}`;
      debugObstacleVertexList.appendChild(li);
    });
  } else if (state.editor.selectedObstacleIndex < 0) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = 'Выберите препятствие для редактирования.';
    debugObstacleVertexList.appendChild(li);
  } else {
    const selected = stage.obstacles[state.editor.selectedObstacleIndex];
    selected.polygon.forEach((point, index) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = `${index + 1}. x=${point.x.toFixed(2)} y=${point.y.toFixed(2)}`;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-btn';
      removeButton.dataset.obstacleVertexIndex = String(index);
      removeButton.textContent = 'Удалить';

      li.append(text, removeButton);
      debugObstacleVertexList.appendChild(li);
    });
  }

  debugObstacleFinishBtn.disabled = !hasDraft || draftPoints.length < 3;
  debugObstacleCancelBtn.disabled = !hasDraft;
}

function syncDebugPanel() {
  const level = currentLevel();
  const stage = currentStage();

  debugLevelSelect.innerHTML = '';
  state.levels.forEach((entry, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `LEVEL ${entry.number} (${entry.fileName})`;
    debugLevelSelect.appendChild(option);
  });
  debugLevelSelect.value = String(state.levelIndex);

  debugStageSelect.innerHTML = '';
  for (let i = 0; i < STAGES_PER_LEVEL; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${i + 1}`;
    debugStageSelect.appendChild(option);
  }
  debugStageSelect.value = String(state.stageIndex);

  debugLevelNumber.value = String(level.number);
  debugBallColor.value = stage.ballColor;
  syncPhysicsInputs();
  const visuals = currentLevelVisualSettings(level);
  debugBackgroundColor.value = visuals.background;
  debugFieldColor.value = visuals.field;

  if (!Object.keys(COLOR_TOKENS).includes(debugGateColor.value)) {
    debugGateColor.value = stage.ballColor;
  }

  debugEditorMode.checked = state.editor.enabled;

  const toolButtons = debugToolRow.querySelectorAll('.tool-btn');
  toolButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === state.editor.tool);
  });

  syncGateEdgeOptions();
}

function loadStage(levelIndex, stageIndex) {
  state.levelIndex = clamp(levelIndex, 0, state.levels.length - 1);
  state.stageIndex = clamp(stageIndex, 0, STAGES_PER_LEVEL - 1);

  ensureCurrentStageShape();
  state.stageLocked = false;
  state.shotUsed = false;
  state.dragging = false;
  state.pull.x = 0;
  state.pull.y = 0;
  state.editor.dragObstacle = null;
  state.editor.selectedObstacleIndex = -1;
  state.editor.draftObstacle = null;
  hideLoseOverlay();

  rebuildWorldPolygon();
  rebuildWorldObstacles();
  syncBallWithStage();
  applyLevelVisualSettings(currentLevel());
  updateHeader();
  updateProgress();
  syncDebugPanel();
  renderDebugLists();
}

function restartLevel() {
  loadStage(state.levelIndex, 0);
}

function nextStageOrLevel() {
  if (state.stageIndex < STAGES_PER_LEVEL - 1) {
    loadStage(state.levelIndex, state.stageIndex + 1);
    return;
  }

  if (state.levelIndex < state.levels.length - 1) {
    setTimeout(() => loadStage(state.levelIndex + 1, 0), 680);
  } else {
    setTimeout(() => loadStage(0, 0), 1000);
  }
}

function reflectByNormal(nx, ny) {
  const speedAlongNormal = state.ball.vx * nx + state.ball.vy * ny;
  if (speedAlongNormal < 0) {
    state.ball.vx -= 2 * speedAlongNormal * nx;
    state.ball.vy -= 2 * speedAlongNormal * ny;
  }
  state.ball.vx *= 0.992;
  state.ball.vy *= 0.992;
}

function onCorrectGate(gate) {
  if (state.stageLocked) return;

  state.stageLocked = true;
  state.ball.moving = false;
  state.ball.vx = 0;
  state.ball.vy = 0;

  const finishedColor = colorValue(gate.color);
  const puffStart = performance.now();
  const puffDuration = 340;

  const puff = () => {
    const now = performance.now();
    const t = clamp((now - puffStart) / puffDuration, 0, 1);
    drawScene(t, finishedColor);

    if (t < 1) {
      requestAnimationFrame(puff);
      return;
    }

    nextStageOrLevel();
  };

  requestAnimationFrame(puff);
}

function onStageFailed() {
  if (state.stageLocked) return;

  state.stageLocked = true;
  state.dragging = false;
  state.pull.x = 0;
  state.pull.y = 0;
  state.ball.moving = false;
  state.ball.vx = 0;
  state.ball.vy = 0;
  showLoseOverlay();
}

function handlePolygonCollisions() {
  const edges = state.worldPolygon.edges;

  for (let pass = 0; pass < 3; pass += 1) {
    let hadCollision = false;

    for (const edge of edges) {
      const closest = pointToSegment(
        { x: state.ball.x, y: state.ball.y },
        edge.a,
        edge.b
      );

      const signed = (
        (state.ball.x - closest.x) * edge.inx
        + (state.ball.y - closest.y) * edge.iny
      );

      if (signed >= state.ball.r) continue;

      const gate = findGateHit(edge.index, closest.t);
      if (gate) {
        const gateColor = colorValue(gate.color).toLowerCase();
        const ballColor = colorValue(state.ball.colorToken).toLowerCase();

        if (gateColor === ballColor) {
          onCorrectGate(gate);
        } else {
          onStageFailed();
        }
        return;
      }

      const penetration = state.ball.r - signed + 0.05;
      state.ball.x += edge.inx * penetration;
      state.ball.y += edge.iny * penetration;

      reflectByNormal(edge.inx, edge.iny);
      hadCollision = true;

      if (state.stageLocked) return;
    }

    if (!hadCollision) break;
  }
}

function closestPointOnPolygonBoundary(point, points) {
  if (!Array.isArray(points) || points.length < 2) return null;

  let best = null;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const candidate = pointToSegment(point, a, b);

    if (!best || candidate.dist < best.dist) {
      best = {
        ...candidate,
        edgeIndex: i,
        a,
        b
      };
    }
  }

  return best;
}

function handleObstacleCollisions() {
  for (let pass = 0; pass < 3; pass += 1) {
    let hadCollision = false;

    for (const obstacle of state.worldObstacles) {
      const bounds = obstacle.bounds;
      if (
        state.ball.x < bounds.minX - state.ball.r
        || state.ball.x > bounds.maxX + state.ball.r
        || state.ball.y < bounds.minY - state.ball.r
        || state.ball.y > bounds.maxY + state.ball.r
      ) {
        continue;
      }

      const center = { x: state.ball.x, y: state.ball.y };
      const closest = closestPointOnPolygonBoundary(center, obstacle.points);
      if (!closest) continue;

      const inside = pointInPolygon(center, obstacle.points);
      if (!inside && closest.dist >= state.ball.r) {
        continue;
      }

      let nx = 0;
      let ny = 0;
      let penetration = 0;

      if (closest.dist > 1e-5) {
        const dx = (state.ball.x - closest.x) / closest.dist;
        const dy = (state.ball.y - closest.y) / closest.dist;

        if (inside) {
          nx = -dx;
          ny = -dy;
          penetration = state.ball.r + closest.dist + 0.05;
        } else {
          nx = dx;
          ny = dy;
          penetration = state.ball.r - closest.dist + 0.05;
        }
      } else {
        const edgeDx = closest.b.x - closest.a.x;
        const edgeDy = closest.b.y - closest.a.y;
        const edgeLen = Math.hypot(edgeDx, edgeDy);
        if (edgeLen < 1e-5) continue;

        const tx = edgeDx / edgeLen;
        const ty = edgeDy / edgeLen;
        const ccw = obstacle.area >= 0;

        const ox = ccw ? ty : -ty;
        const oy = ccw ? -tx : tx;

        nx = ox;
        ny = oy;
        penetration = inside ? state.ball.r + 0.1 : state.ball.r + 0.05;
      }

      state.ball.x += nx * penetration;
      state.ball.y += ny * penetration;
      reflectByNormal(nx, ny);
      hadCollision = true;
    }

    if (!hadCollision) break;
  }
}

function updatePhysics(dt) {
  if (!state.ball.moving || state.stageLocked || state.editor.enabled) return;

  const travel = Math.hypot(state.ball.vx * dt, state.ball.vy * dt);
  const subSteps = clamp(
    Math.ceil(travel / Math.max(3, state.ball.r * 0.35)),
    3,
    18
  );
  const stepDt = dt / subSteps;

  for (let i = 0; i < subSteps; i += 1) {
    state.ball.x += state.ball.vx * stepDt;
    state.ball.y += state.ball.vy * stepDt;

    handlePolygonCollisions();
    if (state.stageLocked) return;

    handleObstacleCollisions();
    if (state.stageLocked) return;
  }

  const frictionBase = 1 - state.commonSettings.physics.braking;
  const friction = Math.pow(frictionBase, dt);
  state.ball.vx *= friction;
  state.ball.vy *= friction;

  if (Math.hypot(state.ball.vx, state.ball.vy) < 0.05) {
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.moving = false;

    if (state.shotUsed && !state.stageLocked) {
      onStageFailed();
    }
  }
}

function shadeColor(hex, amount) {
  const raw = hex.replace('#', '');
  const num = parseInt(raw, 16);

  const r = clamp((num >> 16) + amount, 0, 255);
  const g = clamp(((num >> 8) & 0xff) + amount, 0, 255);
  const b = clamp((num & 0xff) + amount, 0, 255);

  return `rgb(${r}, ${g}, ${b})`;
}

function drawBall(pulse = 0, pulseColor = '#fff') {
  const radius = state.ball.r + pulse * 9;
  const alpha = 1 - pulse;

  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = state.ball.color;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = shadeColor(state.ball.color, -38);
  ctx.stroke();

  if (pulse > 0) {
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.r + pulse * 20, 0, Math.PI * 2);
    ctx.strokeStyle = `${pulseColor}${Math.round(alpha * 210).toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawAim() {
  if (!state.dragging || state.editor.enabled) return;

  const maxPull = 100;
  const pullX = clamp(state.pull.x, -maxPull, maxPull);
  const pullY = clamp(state.pull.y, -maxPull, maxPull);
  const distance = Math.min(Math.hypot(pullX, pullY), maxPull);
  if (distance < 2) return;

  const dirX = -pullX / distance;
  const dirY = -pullY / distance;
  const trailLen = 54 + distance * 0.95;
  const baseWidth = 11 + (distance / maxPull) * 9;
  const tipWidth = 1.6 + (distance / maxPull) * 2.4;

  const tipX = state.ball.x + dirX * trailLen;
  const tipY = state.ball.y + dirY * trailLen;
  const nx = -dirY;
  const ny = dirX;

  ctx.beginPath();
  ctx.moveTo(state.ball.x + nx * baseWidth, state.ball.y + ny * baseWidth);
  ctx.lineTo(state.ball.x - nx * baseWidth, state.ball.y - ny * baseWidth);
  ctx.lineTo(tipX - nx * tipWidth, tipY - ny * tipWidth);
  ctx.lineTo(tipX + nx * tipWidth, tipY + ny * tipWidth);
  ctx.closePath();

  const glow = ctx.createLinearGradient(state.ball.x, state.ball.y, tipX, tipY);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.56)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(state.ball.x, state.ball.y);
  ctx.lineTo(state.ball.x + pullX, state.ball.y + pullY);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawGate(gate) {
  const segment = gateSegment(gate);
  if (!segment) return;

  ctx.beginPath();
  ctx.moveTo(segment.sx, segment.sy);
  ctx.lineTo(segment.ex, segment.ey);
  ctx.lineCap = 'round';
  ctx.lineWidth = 24;
  ctx.strokeStyle = segment.color;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(segment.sx, segment.sy);
  ctx.lineTo(segment.ex, segment.ey);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.stroke();

  const tipX = segment.cx + segment.nx * 10;
  const tipY = segment.cy + segment.ny * 10;
  const baseX = segment.cx - segment.nx * 2;
  const baseY = segment.cy - segment.ny * 2;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + segment.tx * 7, baseY + segment.ty * 7);
  ctx.lineTo(baseX - segment.tx * 7, baseY - segment.ty * 7);
  ctx.closePath();
  ctx.fillStyle = shadeColor(segment.color, -42);
  ctx.fill();
}

function drawArena() {
  const points = state.worldPolygon.points;
  if (points.length < 3) return;

  createPolygonPath(points);
  ctx.fillStyle = state.levelVisuals.field;
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(239, 245, 255, 0.92)';
  ctx.stroke();

  ctx.save();
  createPolygonPath(points);
  ctx.clip();

  for (const obstacle of state.worldObstacles) {
    const bounds = obstacle.bounds;

    createPolygonPath(obstacle.points);
    ctx.fillStyle = "#c8d9ff";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(246, 248, 255, 0.9)';
    ctx.stroke();
  }

  ctx.restore();
}

function drawEditorOverlay() {
  if (!state.editor.enabled) return;

  const stage = currentStage();
  const points = state.worldPolygon.points;

  if (points.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  points.forEach((point, index) => {
    const active = index === state.editor.dragVertexIndex;

    ctx.beginPath();
    ctx.arc(point.x, point.y, active ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#42d96c' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(22,58,140,0.9)';
    ctx.stroke();
  });

  const startX = state.arena.x + stage.start.x * state.arena.w;
  const startY = state.arena.y + stage.start.y * state.arena.h;

  ctx.beginPath();
  ctx.arc(startX, startY, 12, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(startX - 6, startY);
  ctx.lineTo(startX + 6, startY);
  ctx.moveTo(startX, startY - 6);
  ctx.lineTo(startX, startY + 6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(34,64,140,0.95)';
  ctx.stroke();

  const showObstacleHandles = state.editor.tool === 'obstacle';
  state.worldObstacles.forEach((obstacle, obstacleIndex) => {
    const selected = obstacleIndex === state.editor.selectedObstacleIndex;

    if (showObstacleHandles || selected) {
      createPolygonPath(obstacle.points);
      ctx.lineWidth = selected ? 3 : 1.8;
      ctx.strokeStyle = selected ? 'rgba(70, 220, 105, 0.95)' : 'rgba(255, 255, 255, 0.55)';
      ctx.stroke();
    }

    if (!showObstacleHandles && !selected) return;

    obstacle.points.forEach((vertex, vertexIndex) => {
      const active = (
        state.editor.dragObstacle
        && state.editor.dragObstacle.obstacleIndex === obstacleIndex
        && state.editor.dragObstacle.vertexIndex === vertexIndex
      );

      ctx.beginPath();
      ctx.arc(vertex.x, vertex.y, active ? 7.2 : 5.4, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#43de6e' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(22,58,140,0.92)';
      ctx.stroke();
    });
  });

  if (state.editor.draftObstacle?.points?.length) {
    const points = state.editor.draftObstacle.points.map((point) => ({
      x: state.arena.x + point.x * state.arena.w,
      y: state.arena.y + point.y * state.arena.h
    }));

    if (points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.stroke();
    }

    if (points.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(points[0].x, points[0].y);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(67, 222, 110, 0.95)';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    points.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 0 ? 6.2 : 5.2, 0, Math.PI * 2);
      ctx.fillStyle = index === 0 ? '#43de6e' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(22,58,140,0.95)';
      ctx.stroke();
    });
  }
}

function drawScene(pulse = 0, pulseColor = '#ffffff') {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(state.dpr, state.dpr);

  drawArena();
  currentStage().gates.forEach((gate) => drawGate(gate));
  drawAim();
  drawBall(pulse, pulseColor);
  drawEditorOverlay();

  ctx.restore();
}

function worldPosFromEvent(evt) {
  const rect = state.canvasRect || canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function pointInsideArena(point) {
  return (
    point.x >= state.arena.x
    && point.x <= state.arena.x + state.arena.w
    && point.y >= state.arena.y
    && point.y <= state.arena.y + state.arena.h
  );
}

function normalizedFromPoint(point) {
  return {
    x: clamp((point.x - state.arena.x) / state.arena.w, 0, 1),
    y: clamp((point.y - state.arena.y) / state.arena.h, 0, 1)
  };
}

function findNearestVertexIndex(point, maxDistance = 14) {
  const points = state.worldPolygon.points;

  let nearestIndex = -1;
  let nearestDistance = maxDistance;

  for (let i = 0; i < points.length; i += 1) {
    const distance = Math.hypot(point.x - points[i].x, point.y - points[i].y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}

function resolveGateEdge(point) {
  if (debugGateSide.value !== 'auto') {
    const edge = Number(debugGateSide.value);
    if (Number.isInteger(edge) && edge >= 0 && edge < state.worldPolygon.edges.length) {
      return edge;
    }
  }

  let bestEdge = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  state.worldPolygon.edges.forEach((edge, index) => {
    const candidate = pointToSegment(point, edge.a, edge.b);
    if (candidate.dist < bestDistance) {
      bestDistance = candidate.dist;
      bestEdge = index;
    }
  });

  return bestEdge;
}

function projectionOnEdge(point, edgeIndex) {
  const edge = state.worldPolygon.edges[edgeIndex];
  if (!edge) return 0.5;
  return pointToSegment(point, edge.a, edge.b).t;
}

function applyPolygonChange() {
  const stage = currentStage();
  stage.polygon = normalizePolygon(stage.polygon);

  const edgeCount = stage.polygon.length;
  stage.gates = stage.gates.map((gate) => normalizeGate(gate, edgeCount));
  stage.start = normalizeStart(stage.start, stage.polygon);

  rebuildWorldPolygon();
  rebuildWorldObstacles();
  syncBallWithStage();
  syncDebugPanel();
  renderDebugLists();
}

function addGateAtPoint(point) {
  const stage = currentStage();

  const edge = resolveGateEdge(point);
  const baseAt = projectionOnEdge(point, edge);

  const count = clamp(Math.floor(Number(debugGateCount.value) || 1), 1, 8);
  const size = clamp(Number(debugGateSize.value) || 0.24, 0.05, 0.95);
  const color = debugGateColor.value;

  const half = size * 0.5;
  const spacing = size * 1.1;

  for (let i = 0; i < count; i += 1) {
    const shift = (i - (count - 1) / 2) * spacing;
    const at = clamp(baseAt + shift, half, 1 - half);

    stage.gates.push({
      edge,
      at: round(at),
      size: round(size),
      color
    });
  }

  renderDebugLists();
  setDebugStatus(`Добавлено ворот: ${count}.`);
}

function removeAtPoint(point) {
  const stage = currentStage();

  const vertexIndex = findNearestVertexIndex(point, 16);
  if (vertexIndex >= 0) {
    if (stage.polygon.length <= 3) {
      setDebugStatus('Минимум 3 вершины в полигоне.', true);
      return;
    }

    stage.polygon.splice(vertexIndex, 1);
    applyPolygonChange();
    setDebugStatus('Вершина удалена.');
    return;
  }

  let nearestGateIndex = -1;
  let nearestGateDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < stage.gates.length; i += 1) {
    const segment = gateSegment(stage.gates[i]);
    if (!segment) continue;
    const distance = Math.hypot(point.x - segment.cx, point.y - segment.cy);

    if (distance < nearestGateDistance) {
      nearestGateDistance = distance;
      nearestGateIndex = i;
    }
  }

  if (nearestGateIndex >= 0 && nearestGateDistance < 36) {
    stage.gates.splice(nearestGateIndex, 1);
    renderDebugLists();
    setDebugStatus('Ворота удалены.');
    return;
  }

  const obstacleVertex = findNearestObstacleVertex(point, 16);
  if (obstacleVertex) {
    const obstacle = stage.obstacles[obstacleVertex.obstacleIndex];
    if (!obstacle) {
      setDebugStatus('Не удалось определить препятствие.', true);
      return;
    }

    if (obstacle.polygon.length <= 3) {
      setDebugStatus('У препятствия минимум 3 вершины.', true);
      return;
    }

    obstacle.polygon.splice(obstacleVertex.vertexIndex, 1);
    const normalizedObstacle = normalizeObstacle(obstacle);
    if (!normalizedObstacle) {
      setDebugStatus('Полигон препятствия некорректный.', true);
      return;
    }
    stage.obstacles[obstacleVertex.obstacleIndex] = normalizedObstacle;
    rebuildWorldObstacles();
    renderDebugLists();
    setDebugStatus('Вершина препятствия удалена.');
    return;
  }

  const obstacleIndex = findObstacleByPoint(point);
  if (obstacleIndex >= 0) {
    stage.obstacles.splice(obstacleIndex, 1);
    if (state.editor.selectedObstacleIndex === obstacleIndex) {
      state.editor.selectedObstacleIndex = -1;
    } else if (state.editor.selectedObstacleIndex > obstacleIndex) {
      state.editor.selectedObstacleIndex -= 1;
    }
    rebuildWorldObstacles();
    renderDebugLists();
    setDebugStatus('Препятствие удалено.');
    return;
  }

  setDebugStatus('Под курсором нет объектов для удаления.', true);
}

function beginObstacleDraft(normalized) {
  state.editor.draftObstacle = {
    points: [{ x: round(normalized.x), y: round(normalized.y) }]
  };
  state.editor.dragObstacle = null;
  state.editor.selectedObstacleIndex = -1;
  renderDebugLists();
}

function addPointToObstacleDraft(normalized) {
  if (!state.editor.draftObstacle) return false;

  const points = state.editor.draftObstacle.points;
  const last = points[points.length - 1];
  const nextPoint = { x: round(normalized.x), y: round(normalized.y) };

  if (last && Math.hypot(last.x - nextPoint.x, last.y - nextPoint.y) < 0.008) {
    return false;
  }

  points.push(nextPoint);
  renderDebugLists();
  return true;
}

function cancelObstacleDraft() {
  if (!state.editor.draftObstacle) return;
  state.editor.draftObstacle = null;
  renderDebugLists();
  setDebugStatus('Черновик препятствия отменен.');
}

function commitObstacleDraft() {
  const draft = state.editor.draftObstacle;
  if (!draft) return false;

  if (draft.points.length < 3) {
    setDebugStatus('Для препятствия нужно минимум 3 точки.', true);
    return false;
  }

  const normalized = normalizeObstacle({ polygon: draft.points });
  if (!normalized) {
    setDebugStatus('Полигон препятствия некорректный.', true);
    return false;
  }

  const stage = currentStage();
  stage.obstacles.push(normalized);
  state.editor.draftObstacle = null;
  state.editor.selectedObstacleIndex = stage.obstacles.length - 1;
  rebuildWorldObstacles();
  renderDebugLists();
  setDebugStatus('Препятствие добавлено.');
  return true;
}

function setSelectedObstacle(index) {
  const stage = currentStage();
  if (!Number.isInteger(index) || index < 0 || index >= stage.obstacles.length) {
    state.editor.selectedObstacleIndex = -1;
    state.editor.dragObstacle = null;
    renderDebugLists();
    return;
  }

  state.editor.selectedObstacleIndex = index;
  state.editor.dragObstacle = null;
  state.editor.draftObstacle = null;
  renderDebugLists();
}

function insertVertexIntoSelectedObstacle(point, normalized) {
  const obstacleIndex = state.editor.selectedObstacleIndex;
  if (obstacleIndex < 0) return false;

  const nearestEdge = findNearestObstacleEdge(point, obstacleIndex, 18);
  if (!nearestEdge) return false;

  const stage = currentStage();
  const obstacle = stage.obstacles[obstacleIndex];
  if (!obstacle) return false;

  const insertAt = nearestEdge.edgeIndex + 1;
  obstacle.polygon.splice(insertAt, 0, {
    x: round(normalized.x),
    y: round(normalized.y)
  });

  const normalizedObstacle = normalizeObstacle(obstacle);
  if (!normalizedObstacle) {
    setDebugStatus('Не удалось добавить вершину.', true);
    return false;
  }

  stage.obstacles[obstacleIndex] = normalizedObstacle;
  rebuildWorldObstacles();
  state.editor.dragObstacle = {
    obstacleIndex,
    vertexIndex: clamp(insertAt, 0, normalizedObstacle.polygon.length - 1)
  };
  renderDebugLists();
  setDebugStatus(`Вершина добавлена в препятствие ${obstacleIndex + 1}.`);
  return true;
}

function dragObstacleVertex(normalized) {
  const drag = state.editor.dragObstacle;
  if (!drag) return;

  const stage = currentStage();
  const obstacle = stage.obstacles[drag.obstacleIndex];
  if (!obstacle || !obstacle.polygon[drag.vertexIndex]) return;

  obstacle.polygon[drag.vertexIndex].x = round(normalized.x);
  obstacle.polygon[drag.vertexIndex].y = round(normalized.y);

  const normalizedObstacle = normalizeObstacle(obstacle);
  if (!normalizedObstacle) return;

  stage.obstacles[drag.obstacleIndex] = normalizedObstacle;
  rebuildWorldObstacles();
  state.editor.selectedObstacleIndex = drag.obstacleIndex;
  state.editor.dragObstacle.vertexIndex = clamp(
    drag.vertexIndex,
    0,
    normalizedObstacle.polygon.length - 1
  );
}

function handleEditorPointerDown(evt) {
  const point = worldPosFromEvent(evt);
  if (!pointInsideArena(point)) return;

  const normalized = normalizedFromPoint(point);
  const stage = currentStage();

  if (state.editor.tool === 'start') {
    stage.start = normalizeStart(normalized, stage.polygon);
    syncBallWithStage();
    setDebugStatus('Стартовая позиция обновлена.');
    return;
  }

  if (state.editor.tool === 'gate') {
    addGateAtPoint(point);
    return;
  }

  if (state.editor.tool === 'polygon') {
    const nearestVertex = findNearestVertexIndex(point, 16);
    if (nearestVertex >= 0) {
      state.editor.dragVertexIndex = nearestVertex;
      setDebugStatus(`Перетаскивание вершины ${nearestVertex + 1}.`);
      return;
    }

    stage.polygon.push({ x: round(normalized.x), y: round(normalized.y) });
    applyPolygonChange();
    setDebugStatus('Вершина добавлена.');
    return;
  }

  if (state.editor.tool === 'obstacle') {
    const hitVertex = findNearestObstacleVertex(point, 16);
    if (hitVertex) {
      state.editor.selectedObstacleIndex = hitVertex.obstacleIndex;
      state.editor.draftObstacle = null;
      state.editor.dragObstacle = {
        obstacleIndex: hitVertex.obstacleIndex,
        vertexIndex: hitVertex.vertexIndex
      };
      renderDebugLists();
      setDebugStatus(`Перетаскивание вершины ${hitVertex.vertexIndex + 1} препятствия ${hitVertex.obstacleIndex + 1}.`);
      return;
    }

    if (state.editor.draftObstacle) {
      if (!state.editor.draftObstacle.points.length) {
        addPointToObstacleDraft(normalized);
        setDebugStatus('Первая точка черновика добавлена.');
        return;
      }

      const first = state.editor.draftObstacle.points[0];
      const firstWorld = {
        x: state.arena.x + first.x * state.arena.w,
        y: state.arena.y + first.y * state.arena.h
      };

      if (
        state.editor.draftObstacle.points.length >= 3
        && Math.hypot(point.x - firstWorld.x, point.y - firstWorld.y) < 16
      ) {
        commitObstacleDraft();
        return;
      }

      if (addPointToObstacleDraft(normalized)) {
        setDebugStatus(`Точка ${state.editor.draftObstacle.points.length} добавлена в черновик.`);
      } else {
        setDebugStatus('Точка слишком близко к предыдущей.', true);
      }
      return;
    }

    if (insertVertexIntoSelectedObstacle(point, normalized)) {
      return;
    }

    const obstacleIndex = findObstacleByPoint(point);
    if (obstacleIndex >= 0) {
      setSelectedObstacle(obstacleIndex);
      setDebugStatus(`Выбрано препятствие ${obstacleIndex + 1}.`);
      return;
    }

    beginObstacleDraft(normalized);
    setDebugStatus('Начат черновик препятствия. Добавьте точки и нажмите "Завершить полигон".');
    return;
  }

  if (state.editor.tool === 'erase') {
    removeAtPoint(point);
  }
}

function handleEditorPointerMove(evt) {
  const point = worldPosFromEvent(evt);
  const normalized = normalizedFromPoint(point);

  if (state.editor.tool === 'polygon' && state.editor.dragVertexIndex >= 0) {
    const stage = currentStage();
    const index = state.editor.dragVertexIndex;

    if (!stage.polygon[index]) return;

    stage.polygon[index].x = round(normalized.x);
    stage.polygon[index].y = round(normalized.y);

    applyPolygonChange();
    state.editor.dragVertexIndex = clamp(index, 0, currentStage().polygon.length - 1);
    return;
  }

  if (state.editor.tool === 'obstacle' && state.editor.dragObstacle) {
    dragObstacleVertex(normalized);
  }
}

function handleEditorPointerUp() {
  if (state.editor.tool === 'polygon' && state.editor.dragVertexIndex >= 0) {
    state.editor.dragVertexIndex = -1;
    setDebugStatus('Вершина обновлена.');
    return;
  }

  if (state.editor.tool === 'obstacle' && state.editor.dragObstacle) {
    state.editor.dragObstacle = null;
    renderDebugLists();
    setDebugStatus('Вершина препятствия обновлена.');
  }
}

function onPointerDown(evt) {
  if (state.editor.enabled) {
    handleEditorPointerDown(evt);
    return;
  }

  if (state.stageLocked || state.ball.moving || state.shotUsed) return;

  const pointer = worldPosFromEvent(evt);
  const distance = Math.hypot(pointer.x - state.ball.x, pointer.y - state.ball.y);
  if (distance > state.ball.r + 20) return;

  state.dragging = true;
  state.pull.x = 0;
  state.pull.y = 0;
  canvas.setPointerCapture(evt.pointerId);
}

function onPointerMove(evt) {
  if (state.editor.enabled) {
    handleEditorPointerMove(evt);
    return;
  }

  if (!state.dragging) return;

  const pointer = worldPosFromEvent(evt);
  const dx = pointer.x - state.ball.x;
  const dy = pointer.y - state.ball.y;
  const maxPull = 100;

  const distance = Math.hypot(dx, dy);
  const scale = distance > maxPull ? maxPull / distance : 1;

  state.pull.x = dx * scale;
  state.pull.y = dy * scale;
}

function onPointerUp(evt) {
  if (state.editor.enabled) {
    handleEditorPointerUp(evt);
    return;
  }

  if (!state.dragging) return;

  canvas.releasePointerCapture(evt.pointerId);

  const launchX = -state.pull.x;
  const launchY = -state.pull.y;
  const force = Math.hypot(launchX, launchY);

  state.dragging = false;
  state.pull.x = 0;
  state.pull.y = 0;

  if (force < 7) return;

  const speed = state.commonSettings.physics.impulse;
  state.ball.vx = launchX * speed;
  state.ball.vy = launchY * speed;
  state.ball.moving = true;
  state.shotUsed = true;
}

function resizeCanvas() {
  state.canvasRect = canvas.getBoundingClientRect();
  state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(state.canvasRect.width * state.dpr);
  canvas.height = Math.floor(state.canvasRect.height * state.dpr);

  const pad = Math.max(14, state.canvasRect.width * 0.044);
  state.arena.x = pad;
  state.arena.y = pad;
  state.arena.w = state.canvasRect.width - pad * 2;
  state.arena.h = state.canvasRect.height - pad * 2;

  if (state.levels.length) {
    rebuildWorldPolygon();
    rebuildWorldObstacles();
    if (!state.ball.moving && !state.dragging && !state.stageLocked) {
      syncBallWithStage();
    }
  }

  drawScene();
}

function frame(timestamp) {
  if (!state.lastTs) state.lastTs = timestamp;
  const dt = clamp((timestamp - state.lastTs) / 16.67, 0.5, 2.4);
  state.lastTs = timestamp;

  updatePhysics(dt);
  drawScene();
  requestAnimationFrame(frame);
}

function fillColorSelect(select) {
  select.innerHTML = '';
  Object.keys(COLOR_TOKENS).forEach((token) => {
    const option = document.createElement('option');
    option.value = token;
    option.textContent = token;
    select.appendChild(option);
  });
}

function setEditorTool(tool) {
  state.editor.tool = tool;
  state.editor.dragVertexIndex = -1;
  state.editor.dragObstacle = null;
  if (tool !== 'obstacle') {
    state.editor.draftObstacle = null;
    state.editor.selectedObstacleIndex = -1;
  }
  syncDebugPanel();
  renderDebugLists();
  setDebugStatus(`Инструмент: ${tool}`);
}

function setDebugPanelOpen(isOpen) {
  state.editor.panelOpen = isOpen;
  debugPanel.classList.toggle('is-open', isOpen);
}

function isTypingTarget(target) {
  if (!target) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target.isContentEditable) return true;
  return false;
}

function onGlobalKeyDown(event) {
  if (event.code !== 'Space' || event.repeat) return;
  if (isTypingTarget(event.target)) return;

  event.preventDefault();
  setDebugPanelOpen(!state.editor.panelOpen);
}

function findLevelIndexByNumber(number) {
  return state.levels.findIndex((level) => level.number === number);
}

function insertNewLevel(level) {
  state.levels.push(level);
  state.levels.sort((a, b) => a.number - b.number);
  return findLevelIndexByNumber(level.number);
}

async function saveCurrentLevel() {
  if (state.editor.isSaving) return;

  try {
    state.editor.isSaving = true;
    debugSaveBtn.disabled = true;
    if (!updateCurrentLevelColorsFromInputs()) return;

    const level = currentLevel();
    const requestedNumber = clamp(Number(debugLevelNumber.value) || level.number, 1, 9999);

    level.number = requestedNumber;
    level.fileName = fileNameForLevel(requestedNumber);

    const payload = normalizeLevel(serializeLevel(level), level.fileName);
    await saveLevelToServer(payload);

    state.levels = await loadLevelsFromJson();
    const newLevelIndex = findLevelIndexByNumber(requestedNumber);
    loadStage(newLevelIndex >= 0 ? newLevelIndex : 0, state.stageIndex);

    setDebugStatus(`Сохранено: data/levels/${fileNameForLevel(requestedNumber)}`);
  } catch (error) {
    setDebugStatus(`Ошибка сохранения: ${error.message}`, true);
  } finally {
    state.editor.isSaving = false;
    debugSaveBtn.disabled = false;
  }
}

async function saveCommonSettings() {
  if (state.editor.isSavingSettings) return;

  try {
    state.editor.isSavingSettings = true;
    debugSaveSettingsBtn.disabled = true;

    if (!updateCommonSettingsFromInputs()) return;
    const response = await saveCommonSettingsToServer(state.commonSettings);
    setCommonSettings(response.settings || state.commonSettings);

    const savedPath = response.path || 'data/settings/game-settings.json';
    setDebugStatus(`Общие настройки сохранены: ${savedPath}`);
  } catch (error) {
    setDebugStatus(`Ошибка сохранения общих настроек: ${error.message}`, true);
  } finally {
    state.editor.isSavingSettings = false;
    debugSaveSettingsBtn.disabled = false;
  }
}

function bindUi() {
  fillColorSelect(debugBallColor);
  fillColorSelect(debugGateColor);

  restartBtn.addEventListener('click', restartLevel);
  loseRetryBtn.addEventListener('click', () => {
    loadStage(state.levelIndex, state.stageIndex);
  });

  backBtn.addEventListener('click', () => {
    window.location = "uniwebview://close";
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', onGlobalKeyDown);

  debugCloseBtn.addEventListener('click', () => {
    setDebugPanelOpen(false);
  });

  debugEditorMode.addEventListener('change', () => {
    state.editor.enabled = debugEditorMode.checked;
    state.dragging = false;
    state.pull.x = 0;
    state.pull.y = 0;
    state.editor.draftObstacle = null;
    state.editor.dragVertexIndex = -1;
    state.editor.dragObstacle = null;
    state.editor.selectedObstacleIndex = -1;

    if (state.editor.enabled) {
      state.ball.vx = 0;
      state.ball.vy = 0;
      state.ball.moving = false;
      setDebugStatus('Режим редактора включен.');
    } else {
      setDebugStatus('Режим редактора выключен.');
    }

    renderDebugLists();
  });

  debugToolRow.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tool]');
    if (!button) return;
    setEditorTool(button.dataset.tool);
  });

  debugLevelSelect.addEventListener('change', () => {
    const nextLevel = clamp(Number(debugLevelSelect.value) || 0, 0, state.levels.length - 1);
    loadStage(nextLevel, 0);
  });

  debugStageSelect.addEventListener('change', () => {
    const nextStage = clamp(Number(debugStageSelect.value) || 0, 0, STAGES_PER_LEVEL - 1);
    loadStage(state.levelIndex, nextStage);
  });

  debugLoadLevelBtn.addEventListener('click', () => {
    const requested = clamp(Number(debugLevelNumber.value) || 1, 1, 9999);
    const index = findLevelIndexByNumber(requested);

    if (index < 0) {
      setDebugStatus(`LEVEL ${requested} не найден.`, true);
      return;
    }

    loadStage(index, 0);
    setDebugStatus(`Загружен LEVEL ${requested}.`);
  });

  debugNewLevelBtn.addEventListener('click', () => {
    const requested = clamp(Number(debugLevelNumber.value) || 1, 1, 9999);
    const existing = findLevelIndexByNumber(requested);

    if (existing >= 0) {
      loadStage(existing, 0);
      setDebugStatus(`LEVEL ${requested} уже существует.`);
      return;
    }

    const createdIndex = insertNewLevel(makeBlankLevel(requested));
    loadStage(createdIndex, 0);
    setDebugStatus(`Создан новый LEVEL ${requested}.`);
  });

  debugClearStageBtn.addEventListener('click', () => {
    currentLevel().stages[state.stageIndex] = makeBlankStage();
    loadStage(state.levelIndex, state.stageIndex);
    setDebugStatus('Этап очищен.');
  });

  debugBallColor.addEventListener('change', () => {
    const stage = currentStage();
    stage.ballColor = debugBallColor.value;
    state.ball.colorToken = stage.ballColor;
    state.ball.color = colorValue(stage.ballColor);
    renderDebugLists();
  });

  debugBallImpulse.addEventListener('change', () => {
    updatePhysicsSettingsFromInputs();
    setDebugStatus('Импульс обновлен. Нажмите "Сохранить настройки", чтобы записать в JSON.');
  });

  debugBallBraking.addEventListener('change', () => {
    updatePhysicsSettingsFromInputs();
    setDebugStatus('Торможение обновлено. Нажмите "Сохранить настройки", чтобы записать в JSON.');
  });

  debugBackgroundColor.addEventListener('change', () => {
    if (!updateCurrentLevelColorsFromInputs()) return;
    setDebugStatus('Цвет фона уровня обновлен. Нажмите "Сохранить уровень в JSON".');
  });

  debugFieldColor.addEventListener('change', () => {
    if (!updateCurrentLevelColorsFromInputs()) return;
    setDebugStatus('Цвет игрового поля обновлен. Нажмите "Сохранить уровень в JSON".');
  });

  debugResetPolygonBtn.addEventListener('click', () => {
    currentStage().polygon = defaultPolygon();
    applyPolygonChange();
    setDebugStatus('Поле сброшено к прямоугольнику.');
  });

  debugObstacleStartBtn.addEventListener('click', () => {
    setEditorTool('obstacle');
    state.editor.selectedObstacleIndex = -1;
    state.editor.dragObstacle = null;
    state.editor.draftObstacle = {
      points: []
    };
    renderDebugLists();
    setDebugStatus('Режим создания препятствия: кликайте по полю, чтобы добавить вершины.');
  });

  debugObstacleFinishBtn.addEventListener('click', () => {
    if (!state.editor.draftObstacle) {
      setDebugStatus('Нет активного черновика.', true);
      return;
    }
    commitObstacleDraft();
  });

  debugObstacleCancelBtn.addEventListener('click', () => {
    cancelObstacleDraft();
  });

  debugVertexList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-vertex-index]');
    if (!button) return;

    const index = Number(button.dataset.vertexIndex);
    if (!Number.isInteger(index)) return;

    const stage = currentStage();
    if (stage.polygon.length <= 3) {
      setDebugStatus('Минимум 3 вершины в полигоне.', true);
      return;
    }

    stage.polygon.splice(index, 1);
    applyPolygonChange();
    setDebugStatus('Вершина удалена.');
  });

  debugGateList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-gate-index]');
    if (!button) return;

    const index = Number(button.dataset.gateIndex);
    if (!Number.isInteger(index)) return;

    currentStage().gates.splice(index, 1);
    renderDebugLists();
    setDebugStatus('Ворота удалены.');
  });

  debugObstacleList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('button[data-obstacle-index]');
    if (removeButton) {
      const index = Number(removeButton.dataset.obstacleIndex);
      if (!Number.isInteger(index)) return;

      currentStage().obstacles.splice(index, 1);
      rebuildWorldObstacles();

      if (state.editor.selectedObstacleIndex === index) {
        state.editor.selectedObstacleIndex = -1;
      } else if (state.editor.selectedObstacleIndex > index) {
        state.editor.selectedObstacleIndex -= 1;
      }

      renderDebugLists();
      setDebugStatus('Препятствие удалено.');
      return;
    }

    const selectButton = event.target.closest('button[data-obstacle-select]');
    if (!selectButton) return;

    const index = Number(selectButton.dataset.obstacleSelect);
    if (!Number.isInteger(index)) return;

    setEditorTool('obstacle');
    setSelectedObstacle(index);
    setDebugStatus(`Выбрано препятствие ${index + 1}. Перетаскивайте вершины на поле.`);
  });

  debugObstacleVertexList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-obstacle-vertex-index]');
    if (!button) return;

    const vertexIndex = Number(button.dataset.obstacleVertexIndex);
    const obstacleIndex = state.editor.selectedObstacleIndex;
    if (!Number.isInteger(vertexIndex) || obstacleIndex < 0) return;

    const stage = currentStage();
    const obstacle = stage.obstacles[obstacleIndex];
    if (!obstacle) return;

    if (obstacle.polygon.length <= 3) {
      setDebugStatus('У препятствия минимум 3 вершины.', true);
      return;
    }

    obstacle.polygon.splice(vertexIndex, 1);
    const normalized = normalizeObstacle(obstacle);
    if (!normalized) {
      setDebugStatus('Полигон препятствия некорректный.', true);
      return;
    }

    stage.obstacles[obstacleIndex] = normalized;
    rebuildWorldObstacles();
    renderDebugLists();
    setDebugStatus('Вершина препятствия удалена.');
  });

  debugSaveBtn.addEventListener('click', saveCurrentLevel);
  debugSaveSettingsBtn.addEventListener('click', saveCommonSettings);
}

async function init() {
  bindUi();
  setCommonSettings(await loadCommonSettings());

  state.levels = await loadLevelsFromJson();
  if (!state.levels.length) {
    state.levels = [makeBlankLevel(1)];
  }

  loadStage(0, 0);
  resizeCanvas();
  requestAnimationFrame(frame);
}

init().catch((error) => {
  setDebugStatus(`Ошибка инициализации: ${error.message}`, true);
});
