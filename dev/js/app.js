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
    braking: 0.0035,
    ballRadiusRatio: 0.0444
  }
});
const EDITOR_ARENA_OPACITY = 0.62;
const EDITOR_GATE_OPACITY = 0.7;
const DEFAULT_HOLE_RADIUS = 0.05;
const MIN_HOLE_RADIUS = 0.01;
const MAX_HOLE_RADIUS = 0.25;

const COLOR_TOKENS = {
  yellow: '#f6c531',
  red: '#e8393b',
  green: '#1fd95b',
  blue: '#2aa4ff',
  pink: '#ff5ca0',
  purple: '#B633FD'
};

const BALL_OUTLINE_TOKENS = {
  yellow: '#F9FF90',
  red: '#AA000A',
  green: '#168B03',
  blue: '#cbe8ff',
  pink: '#BB0E9D',
  purple: '#7305BB'
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
const debugBallRadiusRatio = document.getElementById('debugBallRadiusRatio');
const debugBackgroundColor = document.getElementById('debugBackgroundColor');
const debugFieldColor = document.getElementById('debugFieldColor');
const debugStageImage = document.getElementById('debugStageImage');
const debugSaveSettingsBtn = document.getElementById('debugSaveSettingsBtn');
const debugToolRow = document.getElementById('debugToolRow');
const debugResetPolygonBtn = document.getElementById('debugResetPolygonBtn');
const debugVertexList = document.getElementById('debugVertexList');
const debugGateSide = document.getElementById('debugGateSide');
const debugGateColor = document.getElementById('debugGateColor');
const debugGateSize = document.getElementById('debugGateSize');
const debugGateAt = document.getElementById('debugGateAt');
const debugGateCount = document.getElementById('debugGateCount');
const debugGateList = document.getElementById('debugGateList');
const debugHoleRadius = document.getElementById('debugHoleRadius');
const debugHoleList = document.getElementById('debugHoleList');
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
  worldHoles: [],
  stageImage: {
    src: '',
    image: null,
    isReady: false
  },
  ball: {
    x: 70,
    y: 300,
    r: 16,
    colorToken: 'yellow',
    color: COLOR_TOKENS.yellow,
    vx: 0,
    vy: 0,
    moving: false,
    renderScale: 1
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
    dragGate: null,
    selectedGateIndex: -1,
    dragHole: null,
    selectedHoleIndex: -1,
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

function ballOutlineValue(token) {
  if (typeof token !== 'string') return BALL_OUTLINE_TOKENS.yellow;
  if (token in BALL_OUTLINE_TOKENS) return BALL_OUTLINE_TOKENS[token];
  return shadeColor(colorValue(token), 72);
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

function defaultStageImagePath(levelNumber, stageIndex) {
  const safeLevelNumber = clamp(Number(levelNumber) || 1, 1, 9999);
  const safeStageNumber = clamp(Number(stageIndex) + 1 || 1, 1, STAGES_PER_LEVEL);
  return `./images/level/lvl_${safeLevelNumber}_${safeStageNumber}.png`;
}

function normalizeStageImagePath(value, fallback = '') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return candidate || fallback;
}

function setDebugStatus(text, isError = false) {
  debugStatus.textContent = text;
  debugStatus.classList.toggle('error', Boolean(isError));
}

function makeBlankStage(levelNumber = 1, stageIndex = 0) {
  return {
    ballColor: 'yellow',
    start: { x: 0.14, y: 0.84 },
    image: defaultStageImagePath(levelNumber, stageIndex),
    polygon: defaultPolygon(),
    gates: [],
    holes: [],
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
    stages: Array.from({ length: STAGES_PER_LEVEL }, (_, stageIndex) => makeBlankStage(number, stageIndex))
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

function gateNormalizationContext(polygon, obstacles = []) {
  const fieldEdgeCount = Math.max(1, Array.isArray(polygon) ? polygon.length : 0);
  const obstacleEdgeCounts = Array.isArray(obstacles)
    ? obstacles.map((obstacle) => Math.max(1, Array.isArray(obstacle?.polygon) ? obstacle.polygon.length : 0))
    : [];

  return {
    fieldEdgeCount,
    obstacleEdgeCounts
  };
}

function normalizeGate(gate, context) {
  const safeContext = {
    fieldEdgeCount: Math.max(1, Number(context?.fieldEdgeCount) || 1),
    obstacleEdgeCounts: Array.isArray(context?.obstacleEdgeCounts) ? context.obstacleEdgeCounts : []
  };

  let target = gate?.target === 'obstacle' ? 'obstacle' : 'field';
  let obstacleIndex = Number.isFinite(Number(gate?.obstacleIndex))
    ? Math.floor(Number(gate.obstacleIndex))
    : -1;

  if (target === 'obstacle') {
    if (obstacleIndex < 0 || obstacleIndex >= safeContext.obstacleEdgeCounts.length) {
      target = 'field';
      obstacleIndex = -1;
    }
  } else {
    obstacleIndex = -1;
  }

  const edgeCount = target === 'obstacle'
    ? Math.max(1, safeContext.obstacleEdgeCounts[obstacleIndex] || 1)
    : safeContext.fieldEdgeCount;

  let edge = Number.isFinite(Number(gate?.edge))
    ? Math.floor(Number(gate.edge))
    : LEGACY_SIDE_TO_EDGE[gate?.side] ?? 0;

  edge = clamp(edge, 0, Math.max(0, edgeCount - 1));

  const size = clamp(Number(gate?.size) || 0.24, 0.05, 0.95);
  const half = size * 0.5;
  const at = clamp(Number(gate?.at) || 0.5, half, 1 - half);
  const color = isValidColorToken(gate?.color) ? gate.color : 'yellow';

  return {
    target,
    obstacleIndex: target === 'obstacle' ? obstacleIndex : null,
    edge,
    at: round(at),
    size: round(size),
    color
  };
}

function normalizeStageGates(stage) {
  const context = gateNormalizationContext(stage.polygon, stage.obstacles);
  stage.gates = stage.gates.map((gate) => normalizeGate(gate, context));
}

function removeObstacleAndReindexGates(stage, obstacleIndex) {
  if (!Number.isInteger(obstacleIndex) || obstacleIndex < 0 || obstacleIndex >= stage.obstacles.length) {
    return;
  }

  stage.obstacles.splice(obstacleIndex, 1);
  stage.gates = stage.gates
    .filter((gate) => !(gate.target === 'obstacle' && gate.obstacleIndex === obstacleIndex))
    .map((gate) => {
      if (gate.target !== 'obstacle' || gate.obstacleIndex == null) return gate;
      if (gate.obstacleIndex < obstacleIndex) return gate;
      return {
        ...gate,
        obstacleIndex: gate.obstacleIndex - 1
      };
    });

  normalizeStageGates(stage);

  state.editor.selectedGateIndex = -1;
  state.editor.dragGate = null;
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

function normalizeHoleRadius(value, fallback = DEFAULT_HOLE_RADIUS) {
  const parsed = Number(value);
  const candidate = Number.isFinite(parsed) ? parsed : fallback;
  return round(clamp(candidate, MIN_HOLE_RADIUS, MAX_HOLE_RADIUS), 4);
}

function normalizeHole(hole) {
  if (!hole || !Number.isFinite(Number(hole.x)) || !Number.isFinite(Number(hole.y))) {
    return null;
  }

  return {
    x: round(clamp(Number(hole.x), 0, 1)),
    y: round(clamp(Number(hole.y), 0, 1)),
    r: normalizeHoleRadius(hole.r, DEFAULT_HOLE_RADIUS)
  };
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

function normalizeStage(stage, levelNumber = 1, stageIndex = 0) {
  const polygon = normalizePolygon(stage?.polygon || stage?.field?.polygon || stage?.field?.points);

  const ballColor = isValidColorToken(stage?.ballColor) ? stage.ballColor : 'yellow';
  const start = normalizeStart(stage?.start, polygon);
  const image = normalizeStageImagePath(
    stage?.image ?? stage?.levelImage ?? stage?.imagePath,
    defaultStageImagePath(levelNumber, stageIndex)
  );

  const obstacles = Array.isArray(stage?.obstacles)
    ? stage.obstacles.map(normalizeObstacle).filter(Boolean)
    : [];
  const holes = Array.isArray(stage?.holes)
    ? stage.holes.map(normalizeHole).filter(Boolean)
    : [];
  const gateContext = gateNormalizationContext(polygon, obstacles);

  const gates = Array.isArray(stage?.gates)
    ? stage.gates.map((gate) => normalizeGate(gate, gateContext))
    : [];

  return {
    ballColor,
    start,
    image,
    polygon,
    gates,
    holes,
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

function normalizeBallRadiusRatio(value) {
  const parsed = Number(value);
  const candidate = Number.isFinite(parsed) ? parsed : DEFAULT_COMMON_SETTINGS.physics.ballRadiusRatio;
  return round(clamp(candidate, 0.01, 0.2), 4);
}

function normalizeCommonSettings(raw) {
  return {
    physics: {
      impulse: normalizeImpulse(raw?.physics?.impulse),
      braking: normalizeBraking(raw?.physics?.braking),
      ballRadiusRatio: normalizeBallRadiusRatio(raw?.physics?.ballRadiusRatio)
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
    stages.push(normalizeStage(sourceStages[i] || makeBlankStage(number, i), number, i));
  }

  return {
    number,
    fileName: fileName || fileNameForLevel(number),
    background: visuals.background,
    field: visuals.field,
    stages
  };
}

function serializeStage(stage, levelNumber, stageIndex) {
  return {
    ballColor: stage.ballColor,
    start: {
      x: round(stage.start.x),
      y: round(stage.start.y)
    },
    image: normalizeStageImagePath(stage.image, defaultStageImagePath(levelNumber, stageIndex)),
    polygon: stage.polygon.map((point) => ({
      x: round(point.x),
      y: round(point.y)
    })),
    gates: stage.gates.map((gate) => {
      const serialized = {
        edge: Math.floor(gate.edge),
        at: round(gate.at),
        size: round(gate.size),
        color: gate.color
      };

      if (gate.target === 'obstacle' && Number.isInteger(gate.obstacleIndex)) {
        serialized.target = 'obstacle';
        serialized.obstacleIndex = Math.floor(gate.obstacleIndex);
      }

      return serialized;
    }),
    holes: stage.holes.map((hole) => ({
      x: round(hole.x),
      y: round(hole.y),
      r: normalizeHoleRadius(hole.r, DEFAULT_HOLE_RADIUS)
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
    stages: level.stages.map((stage, stageIndex) => serializeStage(stage, level.number, stageIndex))
  };
}

function serializeCommonSettings(settings) {
  return {
    physics: {
      impulse: normalizeImpulse(settings?.physics?.impulse),
      braking: normalizeBraking(settings?.physics?.braking),
      ballRadiusRatio: normalizeBallRadiusRatio(settings?.physics?.ballRadiusRatio)
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

function currentStageImagePath(level = null, stage = null, stageIndex = state.stageIndex) {
  const targetLevel = level || (state.levels.length ? currentLevel() : null);
  const targetStage = stage || (targetLevel ? targetLevel.stages[stageIndex] : null);
  const levelNumber = clamp(Number(targetLevel?.number) || 1, 1, 9999);

  return normalizeStageImagePath(
    targetStage?.image,
    defaultStageImagePath(levelNumber, stageIndex)
  );
}

function syncCurrentStageImage() {
  if (!state.levels.length) return;

  const level = currentLevel();
  const stage = currentStage();
  const imagePath = currentStageImagePath(level, stage, state.stageIndex);
  stage.image = imagePath;

  if (state.stageImage.src === imagePath && state.stageImage.image) return;

  state.stageImage.src = imagePath;
  state.stageImage.image = null;
  state.stageImage.isReady = false;

  const image = new Image();
  image.decoding = 'async';

  image.onload = () => {
    if (state.stageImage.src !== imagePath) return;
    state.stageImage.image = image;
    state.stageImage.isReady = true;
  };

  image.onerror = () => {
    if (state.stageImage.src !== imagePath) return;
    state.stageImage.image = null;
    state.stageImage.isReady = false;
  };

  image.src = imagePath;

  if (image.complete && image.naturalWidth > 0) {
    state.stageImage.image = image;
    state.stageImage.isReady = true;
  }
}

function ensureCurrentStageShape() {
  const stage = currentStage();
  stage.polygon = normalizePolygon(stage.polygon);
  stage.obstacles = stage.obstacles.map(normalizeObstacle).filter(Boolean);
  stage.holes = stage.holes.map(normalizeHole).filter(Boolean);
  normalizeStageGates(stage);
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
  normalizeStageGates(stage);
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

function rebuildWorldHoles() {
  const stage = currentStage();
  stage.holes = stage.holes.map(normalizeHole).filter(Boolean);

  const scale = Math.min(state.arena.w, state.arena.h);
  state.worldHoles = stage.holes.map((hole, index) => ({
    index,
    x: state.arena.x + hole.x * state.arena.w,
    y: state.arena.y + hole.y * state.arena.h,
    r: Math.max(2, hole.r * scale)
  }));
}

function updateBallRadiusFromCanvas() {
  const width = Number(state.canvasRect?.width);
  if (!Number.isFinite(width) || width <= 0) return;

  const ratio = normalizeBallRadiusRatio(state.commonSettings?.physics?.ballRadiusRatio);
  state.ball.r = clamp(width * ratio, 6, width * 0.25);
}

function syncBallWithStage() {
  const stage = currentStage();
  stage.start = normalizeStart(stage.start, stage.polygon);
  updateBallRadiusFromCanvas();

  state.ball.x = state.arena.x + stage.start.x * state.arena.w;
  state.ball.y = state.arena.y + stage.start.y * state.arena.h;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.moving = false;
  state.ball.renderScale = 1;
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

function gateEdgeRef(gate) {
  if (gate?.target === 'obstacle') {
    const obstacle = state.worldObstacles.find((entry) => entry.index === gate.obstacleIndex);
    if (!obstacle) return null;
    const edge = obstacle.edges[gate.edge] || obstacle.edges.find((entry) => entry.index === gate.edge);
    if (!edge) return null;

    return {
      target: 'obstacle',
      obstacleIndex: obstacle.index,
      edge
    };
  }

  const edge = state.worldPolygon.edges[gate?.edge] || state.worldPolygon.edges.find((entry) => entry.index === gate?.edge);
  if (!edge) return null;

  return {
    target: 'field',
    obstacleIndex: null,
    edge
  };
}

function gateSegment(gate) {
  const edgeRef = gateEdgeRef(gate);
  if (!edgeRef?.edge) return null;
  const edge = edgeRef.edge;

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
    nx: Number.isFinite(edge.inx) ? edge.inx : edge.ox,
    ny: Number.isFinite(edge.iny) ? edge.iny : edge.oy,
    color: colorValue(gate.color)
  };
}

function findGateHit(edgeIndex, t) {
  const stage = currentStage();

  for (const gate of stage.gates) {
    if (gate.target !== 'field' || gate.edge !== edgeIndex) continue;

    const span = gateSpan(gate);
    if (t >= span.center - span.half && t <= span.center + span.half) {
      return gate;
    }
  }

  return null;
}

function findGateHitOnObstacle(obstacleIndex, edgeIndex, t) {
  const stage = currentStage();

  for (const gate of stage.gates) {
    if (gate.target !== 'obstacle') continue;
    if (gate.obstacleIndex !== obstacleIndex || gate.edge !== edgeIndex) continue;

    const span = gateSpan(gate);
    if (t >= span.center - span.half && t <= span.center + span.half) {
      return gate;
    }
  }

  return null;
}

function findNearestGate(point, maxDistance = 26) {
  const stage = currentStage();
  let best = null;
  let bestDistance = maxDistance;

  stage.gates.forEach((gate, gateIndex) => {
    const segment = gateSegment(gate);
    if (!segment) return;

    const closest = pointToSegment(
      point,
      { x: segment.sx, y: segment.sy },
      { x: segment.ex, y: segment.ey }
    );

    if (closest.dist < bestDistance) {
      bestDistance = closest.dist;
      best = {
        gateIndex,
        distance: closest.dist
      };
    }
  });

  return best;
}

function removeGateByIndex(index) {
  const stage = currentStage();
  if (!Number.isInteger(index) || index < 0 || index >= stage.gates.length) {
    return false;
  }

  stage.gates.splice(index, 1);

  if (state.editor.selectedGateIndex === index) {
    state.editor.selectedGateIndex = -1;
  } else if (state.editor.selectedGateIndex > index) {
    state.editor.selectedGateIndex -= 1;
  }

  if (state.editor.dragGate?.gateIndex === index) {
    state.editor.dragGate = null;
  } else if (state.editor.dragGate?.gateIndex > index) {
    state.editor.dragGate.gateIndex -= 1;
  }

  return true;
}

function gateSideOptionValue(gate) {
  if (gate?.target === 'obstacle' && Number.isInteger(gate?.obstacleIndex)) {
    return `obstacle:${gate.obstacleIndex}:${gate.edge}`;
  }
  return `field:${gate?.edge ?? 0}`;
}

function decodeGateSideOptionValue(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value || value === 'auto') return null;

  if (/^\d+$/.test(value)) {
    return {
      target: 'field',
      obstacleIndex: null,
      edge: Math.floor(Number(value))
    };
  }

  const fieldMatch = /^field:(\d+)$/.exec(value);
  if (fieldMatch) {
    return {
      target: 'field',
      obstacleIndex: null,
      edge: Math.floor(Number(fieldMatch[1]))
    };
  }

  const obstacleMatch = /^obstacle:(\d+):(\d+)$/.exec(value);
  if (obstacleMatch) {
    return {
      target: 'obstacle',
      obstacleIndex: Math.floor(Number(obstacleMatch[1])),
      edge: Math.floor(Number(obstacleMatch[2]))
    };
  }

  return null;
}

function gateAttachmentLabel(gate) {
  if (gate?.target === 'obstacle' && Number.isInteger(gate?.obstacleIndex)) {
    return `препятствие=${gate.obstacleIndex + 1} ребро=${gate.edge + 1}`;
  }
  return `поле ребро=${gate.edge + 1}`;
}

function syncSelectedGateControls() {
  const stage = currentStage();
  const gate = stage.gates[state.editor.selectedGateIndex];
  if (!gate) {
    debugGateAt.value = formatDecimal(clamp(Number(debugGateAt.value) || 0.5, 0, 1), 2);
    return;
  }

  const gateColorOption = [...debugGateColor.options].find((option) => option.value === gate.color);
  if (gateColorOption) {
    debugGateColor.value = gate.color;
  }

  debugGateSize.value = formatDecimal(gate.size, 2);
  debugGateAt.value = formatDecimal(gate.at, 2);

  const gateEdgeValue = gateSideOptionValue(gate);
  if ([...debugGateSide.options].some((option) => option.value === gateEdgeValue)) {
    debugGateSide.value = gateEdgeValue;
  }
}

function setSelectedGate(index) {
  const stage = currentStage();
  if (!Number.isInteger(index) || index < 0 || index >= stage.gates.length) {
    state.editor.selectedGateIndex = -1;
    state.editor.dragGate = null;
    syncSelectedGateControls();
    renderDebugLists();
    return false;
  }

  state.editor.selectedGateIndex = index;
  state.editor.dragGate = null;
  syncSelectedGateControls();
  renderDebugLists();
  return true;
}

function applySelectedGateFromControls({ useEdge = true, useColor = true, useSize = true, useAt = true } = {}) {
  const stage = currentStage();
  const index = state.editor.selectedGateIndex;
  if (!Number.isInteger(index) || index < 0 || index >= stage.gates.length) {
    return false;
  }

  const selected = stage.gates[index];
  const parsedPlacement = decodeGateSideOptionValue(debugGateSide.value);
  const nextPlacement = useEdge && parsedPlacement
    ? parsedPlacement
    : {
      target: selected.target,
      obstacleIndex: selected.obstacleIndex,
      edge: selected.edge
    };

  const nextGate = normalizeGate({
    target: nextPlacement.target,
    obstacleIndex: nextPlacement.obstacleIndex,
    edge: nextPlacement.edge,
    at: useAt ? Number(debugGateAt.value) : selected.at,
    size: useSize ? Number(debugGateSize.value) : selected.size,
    color: useColor ? debugGateColor.value : selected.color
  }, gateNormalizationContext(stage.polygon, stage.obstacles));

  stage.gates[index] = nextGate;
  syncSelectedGateControls();
  renderDebugLists();
  return true;
}

function projectionOnGate(point, gate) {
  const edgeRef = gateEdgeRef(gate);
  if (!edgeRef?.edge) return 0.5;
  return pointToSegment(point, edgeRef.edge.a, edgeRef.edge.b).t;
}

function dragSelectedGate(point) {
  const drag = state.editor.dragGate;
  if (!drag) return;

  const stage = currentStage();
  const gate = stage.gates[drag.gateIndex];
  if (!gate) return;

  const span = gateSpan(gate);
  const at = clamp(projectionOnGate(point, gate), span.half, 1 - span.half);

  stage.gates[drag.gateIndex] = normalizeGate({
    ...gate,
    at: round(at)
  }, gateNormalizationContext(stage.polygon, stage.obstacles));

  state.editor.selectedGateIndex = drag.gateIndex;
  syncSelectedGateControls();
}

function findNearestHole(point, maxDistance = 18) {
  let best = null;
  let bestDistance = maxDistance;

  state.worldHoles.forEach((hole) => {
    const distance = Math.hypot(point.x - hole.x, point.y - hole.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = {
        holeIndex: hole.index,
        distance
      };
    }
  });

  return best;
}

function removeHoleByIndex(index) {
  const stage = currentStage();
  if (!Number.isInteger(index) || index < 0 || index >= stage.holes.length) {
    return false;
  }

  stage.holes.splice(index, 1);
  rebuildWorldHoles();

  if (state.editor.selectedHoleIndex === index) {
    state.editor.selectedHoleIndex = -1;
  } else if (state.editor.selectedHoleIndex > index) {
    state.editor.selectedHoleIndex -= 1;
  }

  if (state.editor.dragHole?.holeIndex === index) {
    state.editor.dragHole = null;
  } else if (state.editor.dragHole?.holeIndex > index) {
    state.editor.dragHole.holeIndex -= 1;
  }

  return true;
}

function setSelectedHole(index) {
  const stage = currentStage();
  if (!Number.isInteger(index) || index < 0 || index >= stage.holes.length) {
    state.editor.selectedHoleIndex = -1;
    state.editor.dragHole = null;
    renderDebugLists();
    return false;
  }

  state.editor.selectedHoleIndex = index;
  state.editor.dragHole = null;
  debugHoleRadius.value = formatDecimal(stage.holes[index].r, 3);
  renderDebugLists();
  return true;
}

function applySelectedHoleRadiusFromInput() {
  const stage = currentStage();
  const holeIndex = state.editor.selectedHoleIndex;
  if (!Number.isInteger(holeIndex) || holeIndex < 0 || holeIndex >= stage.holes.length) {
    return false;
  }

  stage.holes[holeIndex].r = normalizeHoleRadius(
    debugHoleRadius.value,
    stage.holes[holeIndex].r
  );
  debugHoleRadius.value = formatDecimal(stage.holes[holeIndex].r, 3);
  rebuildWorldHoles();
  renderDebugLists();
  return true;
}

function addHoleAtPoint(normalized) {
  const stage = currentStage();
  const hole = normalizeHole({
    x: normalized.x,
    y: normalized.y,
    r: debugHoleRadius.value
  });
  if (!hole) return false;

  stage.holes.push(hole);
  state.editor.selectedHoleIndex = stage.holes.length - 1;
  debugHoleRadius.value = formatDecimal(hole.r, 3);
  rebuildWorldHoles();
  renderDebugLists();
  return true;
}

function dragSelectedHole(normalized) {
  const drag = state.editor.dragHole;
  if (!drag) return;

  const stage = currentStage();
  const hole = stage.holes[drag.holeIndex];
  if (!hole) return;

  hole.x = round(clamp(normalized.x, 0, 1));
  hole.y = round(clamp(normalized.y, 0, 1));
  stage.holes[drag.holeIndex] = normalizeHole(hole);
  rebuildWorldHoles();
  state.editor.selectedHoleIndex = drag.holeIndex;
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
  debugBallRadiusRatio.value = formatDecimal(state.commonSettings.physics.ballRadiusRatio, 4);
}

function setCommonSettings(nextSettings) {
  state.commonSettings = normalizeCommonSettings(nextSettings);
  syncPhysicsInputs();
  updateBallRadiusFromCanvas();
}

function updatePhysicsSettingsFromInputs() {
  setCommonSettings({
    ...state.commonSettings,
    physics: {
      impulse: debugBallImpulse.value,
      braking: debugBallBraking.value,
      ballRadiusRatio: debugBallRadiusRatio.value
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

function updateCurrentStageImageFromInputs() {
  if (!state.levels.length) return true;

  const level = currentLevel();
  const stage = currentStage();
  const fallback = defaultStageImagePath(level.number, state.stageIndex);
  const rawImagePath = String(debugStageImage.value || '').trim();

  if (!rawImagePath) {
    debugStageImage.value = currentStageImagePath(level, stage, state.stageIndex);
    setDebugStatus('Путь к картинке этапа не должен быть пустым.', true);
    return false;
  }

  stage.image = normalizeStageImagePath(rawImagePath, fallback);
  debugStageImage.value = stage.image;
  syncCurrentStageImage();
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

  state.worldPolygon.edges.forEach((edge) => {
    const option = document.createElement('option');
    option.value = `field:${edge.index}`;
    option.textContent = `поле ребро ${edge.index + 1}`;
    debugGateSide.appendChild(option);
  });

  state.worldObstacles.forEach((obstacle) => {
    obstacle.edges.forEach((edge) => {
      const option = document.createElement('option');
      option.value = `obstacle:${obstacle.index}:${edge.index}`;
      option.textContent = `препятствие ${obstacle.index + 1} ребро ${edge.index + 1}`;
      debugGateSide.appendChild(option);
    });
  });

  const parsedPrevious = decodeGateSideOptionValue(previous);
  const normalizedPreviousValue = parsedPrevious ? gateSideOptionValue(parsedPrevious) : previous;

  if ([...debugGateSide.options].some((option) => option.value === normalizedPreviousValue)) {
    debugGateSide.value = normalizedPreviousValue;
    return;
  }

  const selectedGate = state.levels.length
    ? currentStage().gates[state.editor.selectedGateIndex]
    : null;
  const selectedGateValue = selectedGate ? gateSideOptionValue(selectedGate) : null;
  if (selectedGateValue && [...debugGateSide.options].some((option) => option.value === selectedGateValue)) {
    debugGateSide.value = selectedGateValue;
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

  if (
    state.editor.selectedGateIndex < 0
    || state.editor.selectedGateIndex >= stage.gates.length
  ) {
    state.editor.selectedGateIndex = -1;
  }

  if (
    state.editor.selectedHoleIndex < 0
    || state.editor.selectedHoleIndex >= stage.holes.length
  ) {
    state.editor.selectedHoleIndex = -1;
  }

  syncGateEdgeOptions();
  syncSelectedGateControls();

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
      const selected = index === state.editor.selectedGateIndex;
      text.textContent = `${selected ? '● ' : ''}${index + 1}. ${gateAttachmentLabel(gate)} | at=${gate.at.toFixed(2)} | size=${gate.size.toFixed(2)} | ${gate.color}`;

      const buttons = document.createElement('span');
      buttons.className = 'list-actions';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'pick-btn';
      editButton.dataset.gateSelect = String(index);
      editButton.textContent = selected ? 'Выбрано' : 'Выбрать';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-btn';
      removeButton.dataset.gateIndex = String(index);
      removeButton.textContent = 'Удалить';

      buttons.append(editButton, removeButton);
      li.append(text, buttons);
      debugGateList.appendChild(li);
    });
  }

  debugHoleList.innerHTML = '';
  if (!stage.holes.length) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = 'Дырок нет';
    debugHoleList.appendChild(li);
  } else {
    stage.holes.forEach((hole, index) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      const selected = index === state.editor.selectedHoleIndex;
      text.textContent = `${selected ? '● ' : ''}${index + 1}. x=${hole.x.toFixed(2)} y=${hole.y.toFixed(2)} r=${hole.r.toFixed(3)}`;

      const buttons = document.createElement('span');
      buttons.className = 'list-actions';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'pick-btn';
      editButton.dataset.holeSelect = String(index);
      editButton.textContent = selected ? 'Выбрано' : 'Выбрать';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-btn';
      removeButton.dataset.holeIndex = String(index);
      removeButton.textContent = 'Удалить';

      buttons.append(editButton, removeButton);
      li.append(text, buttons);
      debugHoleList.appendChild(li);
    });
  }

  if (state.editor.selectedHoleIndex >= 0 && stage.holes[state.editor.selectedHoleIndex]) {
    debugHoleRadius.value = formatDecimal(stage.holes[state.editor.selectedHoleIndex].r, 3);
  } else {
    debugHoleRadius.value = formatDecimal(
      normalizeHoleRadius(debugHoleRadius.value, DEFAULT_HOLE_RADIUS),
      3
    );
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
  debugStageImage.value = currentStageImagePath(level, stage, state.stageIndex);

  if (!Object.keys(COLOR_TOKENS).includes(debugGateColor.value)) {
    debugGateColor.value = stage.ballColor;
  }

  debugEditorMode.checked = state.editor.enabled;

  const toolButtons = debugToolRow.querySelectorAll('.tool-btn');
  toolButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === state.editor.tool);
  });

  syncGateEdgeOptions();
  syncSelectedGateControls();
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
  state.editor.dragGate = null;
  state.editor.selectedGateIndex = -1;
  state.editor.dragHole = null;
  state.editor.selectedHoleIndex = -1;
  state.editor.draftObstacle = null;
  hideLoseOverlay();

  rebuildWorldPolygon();
  rebuildWorldObstacles();
  rebuildWorldHoles();
  syncBallWithStage();
  applyLevelVisualSettings(currentLevel());
  syncCurrentStageImage();
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
  state.ball.renderScale = 1;
  showLoseOverlay();
}

function onHoleCaptured(hole) {
  if (state.stageLocked) return;

  state.stageLocked = true;
  state.dragging = false;
  state.pull.x = 0;
  state.pull.y = 0;
  state.ball.moving = false;
  state.ball.vx = 0;
  state.ball.vy = 0;

  const startX = state.ball.x;
  const startY = state.ball.y;
  const endX = hole.x;
  const endY = hole.y;
  const duration = 320;
  const startedAt = performance.now();

  const tick = () => {
    const now = performance.now();
    const t = clamp((now - startedAt) / duration, 0, 1);
    const eased = 1 - (1 - t) ** 3;

    state.ball.x = startX + (endX - startX) * eased;
    state.ball.y = startY + (endY - startY) * eased;
    state.ball.renderScale = Math.max(0.02, 1 - eased);
    drawScene();

    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }

    showLoseOverlay();
  };

  requestAnimationFrame(tick);
}

function handleHoleCollisions() {
  for (const hole of state.worldHoles) {
    const distance = Math.hypot(state.ball.x - hole.x, state.ball.y - hole.y);
    if (distance <= hole.r) {
      onHoleCaptured(hole);
      return true;
    }
  }

  return false;
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

      if (closest.dist <= state.ball.r + 0.05) {
        const gate = findGateHitOnObstacle(obstacle.index, closest.edgeIndex, closest.t);
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

    if (handleHoleCollisions()) {
      return;
    }
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

function drawReferenceBall(pulse = 0, pulseColor = '#fff') {
  const scale = clamp(Number(state.ball.renderScale) || 1, 0.02, 1.2);
  const radius = state.ball.r * scale + pulse * 7;
  const alpha = 1 - pulse;
  const cx = state.ball.x;
  const cy = state.ball.y;
  const color = state.ball.color;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.5, radius * 1.04, radius * 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(34, 63, 182, 0.45)';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.16, radius * 1.07, 0, Math.PI * 2);
  ctx.fillStyle = shadeColor(color, -55);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
  bodyGrad.addColorStop(0, shadeColor(color, 44));
  bodyGrad.addColorStop(0.62, shadeColor(color, 10));
  bodyGrad.addColorStop(1, shadeColor(color, -18));

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ballOutlineValue(state.ball.colorToken);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.28, cy - radius * 0.68, radius * 0.35, radius * 0.16, -0.45, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.fill();

  if (pulse > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, state.ball.r * scale + pulse * 20, 0, Math.PI * 2);
    ctx.strokeStyle = `${pulseColor}${Math.round(alpha * 210).toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawBall(pulse = 0, pulseColor = '#fff') {
  drawReferenceBall(pulse, pulseColor);
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

function drawDefaultGate(gate, opacity = 1) {
  const segment = gateSegment(gate);
  if (!segment) return;

  ctx.save();
  ctx.globalAlpha = clamp(Number(opacity) || 1, 0, 1);

  ctx.beginPath();
  ctx.moveTo(segment.sx, segment.sy);
  ctx.lineTo(segment.ex, segment.ey);
  ctx.lineCap = 'butt';
  ctx.lineWidth = 24;
  ctx.strokeStyle = shadeColor(segment.color, 40);
  ctx.stroke();

  ctx.restore();
}

function drawGate(gate, opacity = 1) {
  drawDefaultGate(gate, opacity);
}

function drawHoles(opacity = 1) {
  ctx.save();
  ctx.globalAlpha = clamp(Number(opacity) || 1, 0, 1);
  const verticalSquash = 0.84;

  for (const hole of state.worldHoles) {
    ctx.save();
    ctx.translate(hole.x, hole.y);
    ctx.scale(1, verticalSquash);

    const gradient = ctx.createRadialGradient(
      -hole.r * 0.2,
      -hole.r * 0.2,
      Math.max(1, hole.r * 0.1),
      0,
      0,
      hole.r
    );
    gradient.addColorStop(0, 'rgba(18, 20, 30, 0.88)');
    gradient.addColorStop(1, 'rgba(6, 7, 11, 0.98)');

    ctx.beginPath();
    ctx.ellipse(0, 0, hole.r, hole.r, 0, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawDefaultArena(points, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = clamp(Number(opacity) || 1, 0, 1);

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
    createPolygonPath(obstacle.points);
    ctx.fillStyle = '#c8d9ff';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(246, 248, 255, 0.9)';
    ctx.stroke();
  }

  ctx.restore();

  ctx.restore();
}

function drawArena(opacity = 1) {
  const points = state.worldPolygon.points;
  if (points.length < 3) return;

  drawDefaultArena(points, opacity);
}

function drawGameplayStageImage() {
  if (!state.stageImage.isReady || !state.stageImage.image) return;

  ctx.drawImage(
    state.stageImage.image,
    state.arena.x,
    state.arena.y,
    state.arena.w,
    state.arena.h
  );
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

  if (state.editor.tool === 'gate' || state.editor.selectedGateIndex >= 0) {
    stage.gates.forEach((gate, gateIndex) => {
      const segment = gateSegment(gate);
      if (!segment) return;

      const selected = gateIndex === state.editor.selectedGateIndex;
      ctx.beginPath();
      ctx.arc(segment.cx, segment.cy, selected ? 7 : 5.2, 0, Math.PI * 2);
      ctx.fillStyle = selected ? 'rgba(67, 222, 110, 0.95)' : 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = selected ? 'rgba(14, 114, 44, 0.95)' : 'rgba(22,58,140,0.92)';
      ctx.stroke();
    });
  }

  if (state.editor.tool === 'hole' || state.editor.selectedHoleIndex >= 0) {
    state.worldHoles.forEach((hole, holeIndex) => {
      const selected = holeIndex === state.editor.selectedHoleIndex;
      ctx.beginPath();
      ctx.arc(hole.x, hole.y, hole.r + (selected ? 6 : 4), 0, Math.PI * 2);
      ctx.lineWidth = selected ? 2.6 : 1.8;
      ctx.strokeStyle = selected ? 'rgba(67, 222, 110, 0.95)' : 'rgba(255, 255, 255, 0.62)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(hole.x, hole.y, selected ? 3.5 : 2.8, 0, Math.PI * 2);
      ctx.fillStyle = selected ? 'rgba(67, 222, 110, 0.95)' : 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
    });
  }

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

  drawGameplayStageImage();

  if (state.editor.enabled) {
    drawArena(EDITOR_ARENA_OPACITY);
    currentStage().gates.forEach((gate) => drawGate(gate, EDITOR_GATE_OPACITY));
  }
  drawHoles();
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

function gateEdgeCandidates() {
  const candidates = state.worldPolygon.edges.map((edge) => ({
    target: 'field',
    obstacleIndex: null,
    edge: edge.index,
    a: edge.a,
    b: edge.b
  }));

  state.worldObstacles.forEach((obstacle) => {
    obstacle.edges.forEach((edge) => {
      candidates.push({
        target: 'obstacle',
        obstacleIndex: obstacle.index,
        edge: edge.index,
        a: edge.a,
        b: edge.b
      });
    });
  });

  return candidates;
}

function resolveGatePlacement(point) {
  const candidates = gateEdgeCandidates();
  if (!candidates.length) {
    return {
      target: 'field',
      obstacleIndex: null,
      edge: 0
    };
  }

  if (debugGateSide.value !== 'auto') {
    const parsed = decodeGateSideOptionValue(debugGateSide.value);
    if (parsed) {
      const isAvailable = candidates.some((candidate) => (
        candidate.target === parsed.target
        && candidate.obstacleIndex === (parsed.obstacleIndex ?? null)
        && candidate.edge === parsed.edge
      ));
      if (isAvailable) {
        return parsed;
      }
    }
  }

  let bestCandidate = candidates[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate) => {
    const projected = pointToSegment(point, candidate.a, candidate.b);
    if (projected.dist < bestDistance) {
      bestDistance = projected.dist;
      bestCandidate = candidate;
    }
  });

  return {
    target: bestCandidate.target,
    obstacleIndex: bestCandidate.obstacleIndex,
    edge: bestCandidate.edge
  };
}

function projectionOnGatePlacement(point, placement) {
  const targetEdge = gateEdgeCandidates().find((candidate) => (
    candidate.target === placement.target
    && candidate.obstacleIndex === (placement.obstacleIndex ?? null)
    && candidate.edge === placement.edge
  ));

  if (!targetEdge) return 0.5;
  return pointToSegment(point, targetEdge.a, targetEdge.b).t;
}

function applyPolygonChange() {
  const stage = currentStage();
  stage.polygon = normalizePolygon(stage.polygon);
  normalizeStageGates(stage);
  stage.start = normalizeStart(stage.start, stage.polygon);

  rebuildWorldPolygon();
  rebuildWorldObstacles();
  rebuildWorldHoles();
  syncBallWithStage();
  syncDebugPanel();
  renderDebugLists();
}

function addGateAtPoint(point) {
  const stage = currentStage();
  const beforeCount = stage.gates.length;

  const placement = resolveGatePlacement(point);
  const baseAt = projectionOnGatePlacement(point, placement);

  const count = clamp(Math.floor(Number(debugGateCount.value) || 1), 1, 8);
  const size = clamp(Number(debugGateSize.value) || 0.24, 0.05, 0.95);
  const color = debugGateColor.value;

  const half = size * 0.5;
  const spacing = size * 1.1;

  for (let i = 0; i < count; i += 1) {
    const shift = (i - (count - 1) / 2) * spacing;
    const at = clamp(baseAt + shift, half, 1 - half);

    stage.gates.push({
      target: placement.target,
      obstacleIndex: placement.obstacleIndex,
      edge: placement.edge,
      at: round(at),
      size: round(size),
      color
    });
  }

  normalizeStageGates(stage);

  if (stage.gates.length > beforeCount) {
    state.editor.selectedGateIndex = stage.gates.length - 1;
    syncSelectedGateControls();
  }

  renderDebugLists();
  setDebugStatus(`Добавлено ворот: ${count}. Выберите ворота для редактирования позиции и размера.`);
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

  const nearestGate = findNearestGate(point, 36);
  if (nearestGate) {
    removeGateByIndex(nearestGate.gateIndex);
    syncSelectedGateControls();
    renderDebugLists();
    setDebugStatus('Ворота удалены.');
    return;
  }

  const nearestHole = findNearestHole(point, 24);
  if (nearestHole) {
    removeHoleByIndex(nearestHole.holeIndex);
    renderDebugLists();
    setDebugStatus('Дырка удалена.');
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
    removeObstacleAndReindexGates(stage, obstacleIndex);
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

  if (state.editor.tool === 'hole') {
    const holeHit = findNearestHole(point, 22);
    if (holeHit) {
      setSelectedHole(holeHit.holeIndex);
      state.editor.dragHole = { holeIndex: holeHit.holeIndex };
      setDebugStatus(`Перетаскивание дырки ${holeHit.holeIndex + 1}.`);
      return;
    }

    if (addHoleAtPoint(normalized)) {
      setDebugStatus('Дырка добавлена. Перетаскивайте её или меняйте радиус в панели.');
    }
    return;
  }

  if (state.editor.tool === 'gate') {
    const gateHit = findNearestGate(point, 22);
    if (gateHit) {
      setSelectedGate(gateHit.gateIndex);
      state.editor.dragGate = { gateIndex: gateHit.gateIndex };
      setDebugStatus(`Перетаскивание ворот ${gateHit.gateIndex + 1}.`);
      return;
    }

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
    return;
  }

  if (state.editor.tool === 'hole' && state.editor.dragHole) {
    dragSelectedHole(normalized);
    return;
  }

  if (state.editor.tool === 'gate' && state.editor.dragGate) {
    dragSelectedGate(point);
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
    return;
  }

  if (state.editor.tool === 'hole' && state.editor.dragHole) {
    const holeIndex = state.editor.dragHole.holeIndex;
    state.editor.dragHole = null;
    renderDebugLists();
    if (holeIndex >= 0) {
      setDebugStatus(`Позиция дырки ${holeIndex + 1} обновлена.`);
    }
    return;
  }

  if (state.editor.tool === 'gate' && state.editor.dragGate) {
    const gateIndex = state.editor.dragGate.gateIndex;
    state.editor.dragGate = null;
    renderDebugLists();
    if (gateIndex >= 0) {
      setDebugStatus(`Позиция ворот ${gateIndex + 1} обновлена.`);
    }
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
  updateBallRadiusFromCanvas();

  if (state.levels.length) {
    rebuildWorldPolygon();
    rebuildWorldObstacles();
    rebuildWorldHoles();
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
  state.editor.dragGate = null;
  state.editor.dragHole = null;
  if (tool !== 'obstacle') {
    state.editor.draftObstacle = null;
    state.editor.selectedObstacleIndex = -1;
  }
  if (tool !== 'hole') {
    state.editor.selectedHoleIndex = -1;
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

function remapDefaultStageImagesAfterLevelRenumber(level, oldLevelNumber, newLevelNumber) {
  if (!level || oldLevelNumber === newLevelNumber) return;

  level.stages.forEach((stage, stageIndex) => {
    const oldDefaultPath = defaultStageImagePath(oldLevelNumber, stageIndex);
    const newDefaultPath = defaultStageImagePath(newLevelNumber, stageIndex);
    const currentPath = normalizeStageImagePath(stage.image, oldDefaultPath);

    if (currentPath === oldDefaultPath) {
      stage.image = newDefaultPath;
    }
  });
}

async function saveCurrentLevel() {
  if (state.editor.isSaving) return;

  try {
    state.editor.isSaving = true;
    debugSaveBtn.disabled = true;
    if (!updateCurrentLevelColorsFromInputs()) return;
    if (!updateCurrentStageImageFromInputs()) return;

    const level = currentLevel();
    const currentNumber = clamp(Number(level.number) || 1, 1, 9999);
    const requestedNumber = clamp(Number(debugLevelNumber.value) || level.number, 1, 9999);

    remapDefaultStageImagesAfterLevelRenumber(level, currentNumber, requestedNumber);
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
    state.editor.dragGate = null;
    state.editor.selectedGateIndex = -1;
    state.editor.dragHole = null;
    state.editor.selectedHoleIndex = -1;

    if (state.editor.enabled) {
      state.ball.vx = 0;
      state.ball.vy = 0;
      state.ball.moving = false;
      setDebugStatus('Режим редактора включен.');
    } else {
      setDebugStatus('Режим редактора выключен.');
    }

    renderDebugLists();
    syncSelectedGateControls();
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
    currentLevel().stages[state.stageIndex] = makeBlankStage(currentLevel().number, state.stageIndex);
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

  debugBallRadiusRatio.addEventListener('change', () => {
    updatePhysicsSettingsFromInputs();
    setDebugStatus('Радиус шара обновлен. Нажмите "Сохранить настройки", чтобы записать в JSON.');
  });

  debugBackgroundColor.addEventListener('change', () => {
    if (!updateCurrentLevelColorsFromInputs()) return;
    setDebugStatus('Цвет фона уровня обновлен. Нажмите "Сохранить уровень в JSON".');
  });

  debugFieldColor.addEventListener('change', () => {
    if (!updateCurrentLevelColorsFromInputs()) return;
    setDebugStatus('Цвет игрового поля обновлен. Нажмите "Сохранить уровень в JSON".');
  });

  debugStageImage.addEventListener('change', () => {
    if (!updateCurrentStageImageFromInputs()) return;
    setDebugStatus('Картинка этапа обновлена. Нажмите "Сохранить уровень в JSON".');
  });

  debugGateSide.addEventListener('change', () => {
    if (state.editor.selectedGateIndex < 0) {
      setDebugStatus('Ребро выбрано для добавления новых ворот.');
      return;
    }
    if (!applySelectedGateFromControls({ useEdge: true, useColor: false, useSize: false, useAt: false })) return;
    setDebugStatus('Ребро выбранных ворот обновлено.');
  });

  debugGateColor.addEventListener('change', () => {
    if (state.editor.selectedGateIndex < 0) {
      setDebugStatus('Цвет применится к новым воротам.');
      return;
    }
    if (!applySelectedGateFromControls({ useEdge: false, useColor: true, useSize: false, useAt: false })) return;
    setDebugStatus('Цвет выбранных ворот обновлен.');
  });

  debugGateSize.addEventListener('change', () => {
    if (state.editor.selectedGateIndex < 0) {
      setDebugStatus('Размер применится к новым воротам.');
      return;
    }
    if (!applySelectedGateFromControls({ useEdge: false, useColor: false, useSize: true, useAt: true })) return;
    setDebugStatus('Размер выбранных ворот обновлен.');
  });

  debugGateAt.addEventListener('change', () => {
    if (state.editor.selectedGateIndex < 0) {
      setDebugStatus('Сначала выберите ворота в списке или на поле.', true);
      return;
    }
    if (!applySelectedGateFromControls({ useEdge: false, useColor: false, useSize: false, useAt: true })) return;
    setDebugStatus('Позиция выбранных ворот обновлена.');
  });

  debugHoleRadius.addEventListener('change', () => {
    if (state.editor.selectedHoleIndex < 0) {
      debugHoleRadius.value = formatDecimal(
        normalizeHoleRadius(debugHoleRadius.value, DEFAULT_HOLE_RADIUS),
        3
      );
      setDebugStatus('Радиус применится к новым дыркам.');
      return;
    }

    if (!applySelectedHoleRadiusFromInput()) return;
    setDebugStatus('Радиус выбранной дырки обновлен.');
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
    const removeButton = event.target.closest('button[data-gate-index]');
    if (removeButton) {
      const index = Number(removeButton.dataset.gateIndex);
      if (!Number.isInteger(index)) return;

      removeGateByIndex(index);
      syncSelectedGateControls();
      renderDebugLists();
      setDebugStatus('Ворота удалены.');
      return;
    }

    const selectButton = event.target.closest('button[data-gate-select]');
    if (!selectButton) return;

    const index = Number(selectButton.dataset.gateSelect);
    if (!Number.isInteger(index)) return;

    setEditorTool('gate');
    if (!setSelectedGate(index)) return;
    setDebugStatus(`Выбраны ворота ${index + 1}. Тяните их по ребру или меняйте размер/позицию в панели.`);
  });

  debugHoleList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('button[data-hole-index]');
    if (removeButton) {
      const index = Number(removeButton.dataset.holeIndex);
      if (!Number.isInteger(index)) return;

      removeHoleByIndex(index);
      renderDebugLists();
      setDebugStatus('Дырка удалена.');
      return;
    }

    const selectButton = event.target.closest('button[data-hole-select]');
    if (!selectButton) return;

    const index = Number(selectButton.dataset.holeSelect);
    if (!Number.isInteger(index)) return;

    setEditorTool('hole');
    if (!setSelectedHole(index)) return;
    setDebugStatus(`Выбрана дырка ${index + 1}. Перетаскивайте на поле или меняйте радиус.`);
  });

  debugObstacleList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('button[data-obstacle-index]');
    if (removeButton) {
      const index = Number(removeButton.dataset.obstacleIndex);
      if (!Number.isInteger(index)) return;

      removeObstacleAndReindexGates(currentStage(), index);
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
