import { EXAMPLE_SPELLS, parseMagicScript, summarizeSpell } from "./magic-script.js";

const WORLD_WIDTH = 100;
const WORLD_HEIGHT = 70;
const CASTER = { x: 8, y: 52 };
const COST_NORMALIZER = 8;
const STORAGE_KEYS = {
  currentSource: "tmf.magicScript.currentSource",
  savedSpells: "tmf.magicScript.savedSpells",
  discoveries: "tmf.discoveries",
  autoRun: "tmf.magicScript.autoRun"
};

const state = {
  data: null,
  substancesByType: new Map(),
  world: [],
  source: EXAMPLE_SPELLS[0].source,
  parseResult: null,
  compiledSpell: null,
  activeExample: "iceball",
  activeChallenge: "free",
  aim: { x: 50, y: 35 },
  running: true,
  autoRun: true,
  speed: 1,
  lastFrame: 0,
  lastMetricUpdate: 0,
  lastCast: null,
  lastMetrics: null,
  autoRunTimer: 0,
  discoveries: new Set(),
  canvas: {
    dpr: 1,
    width: 0,
    height: 0
  }
};

const els = {};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  try {
    state.data = await loadGameData();
  } catch (error) {
    showFatalError(error);
    return;
  }

  indexData();
  loadLocalState();
  resetWorld(false);
  bindEvents();
  buildStaticControls();
  compileSource({ scheduleRun: false });
  renderAll();
  resizeCanvas();
  runCompiledSpell({ resetBefore: true, silent: true });
  state.lastFrame = performance.now();
  requestAnimationFrame(gameLoop);
}

function cacheElements() {
  els.canvas = document.querySelector("#worldCanvas");
  els.spellCodeInput = document.querySelector("#spellCodeInput");
  els.compileBadge = document.querySelector("#compileBadge");
  els.compilerOutput = document.querySelector("#compilerOutput");
  els.spellSummary = document.querySelector("#spellSummary");
  els.targetCount = document.querySelector("#targetCount");
  els.manaMetric = document.querySelector("#manaMetric");
  els.castMetric = document.querySelector("#castMetric");
  els.gradeMetric = document.querySelector("#gradeMetric");
  els.meterFill = document.querySelector("#meterFill");
  els.castButton = document.querySelector("#castButton");
  els.runSpellButton = document.querySelector("#runSpellButton");
  els.resetWorldButton = document.querySelector("#resetWorldButton");
  els.toggleRunButton = document.querySelector("#toggleRunButton");
  els.stepButton = document.querySelector("#stepButton");
  els.speedSelect = document.querySelector("#speedSelect");
  els.autoRunToggle = document.querySelector("#autoRunToggle");
  els.exampleList = document.querySelector("#exampleList");
  els.challengeSelect = document.querySelector("#challengeSelect");
  els.challengeStatus = document.querySelector("#challengeStatus");
  els.spellNameInput = document.querySelector("#spellNameInput");
  els.saveSpellButton = document.querySelector("#saveSpellButton");
  els.exportButton = document.querySelector("#exportButton");
  els.importButton = document.querySelector("#importButton");
  els.shareCodeBox = document.querySelector("#shareCodeBox");
  els.savedSpells = document.querySelector("#savedSpells");
  els.aimChip = document.querySelector("#aimChip");
  els.storyTitle = document.querySelector("#storyTitle");
  els.storyLine = document.querySelector("#storyLine");
  els.toast = document.querySelector("#toast");
  els.ctx = els.canvas.getContext("2d");
}

async function loadGameData() {
  const [substances, challenges] = await Promise.all([
    loadJson("./src/data/substances.json"),
    loadJson("./src/data/challenges.json")
  ]);

  return { substances, challenges };
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} 파일을 읽지 못했습니다.`);
  }
  return response.json();
}

function indexData() {
  for (const substance of state.data.substances.types) {
    state.substancesByType.set(substance.type, substance);
  }
}

function loadLocalState() {
  const savedSource = localStorage.getItem(STORAGE_KEYS.currentSource);
  if (savedSource) {
    state.source = savedSource;
    state.activeExample = "";
  }

  const savedAutoRun = localStorage.getItem(STORAGE_KEYS.autoRun);
  state.autoRun = savedAutoRun === null ? true : savedAutoRun === "true";

  const discoveries = safeJsonParse(localStorage.getItem(STORAGE_KEYS.discoveries));
  if (Array.isArray(discoveries)) {
    state.discoveries = new Set(discoveries);
  }
}

function bindEvents() {
  window.addEventListener("resize", resizeCanvas);

  els.spellCodeInput.addEventListener("input", () => {
    state.source = els.spellCodeInput.value;
    state.activeExample = "";
    persistSource();
    compileSource({ scheduleRun: true });
    renderAll();
  });

  els.castButton.addEventListener("click", () => runCompiledSpell({ resetBefore: false }));
  els.runSpellButton.addEventListener("click", () => runCompiledSpell({ resetBefore: true }));
  els.resetWorldButton.addEventListener("click", () => resetWorld(true));
  els.toggleRunButton.addEventListener("click", () => {
    state.running = !state.running;
    renderPlaybackButton();
  });
  els.stepButton.addEventListener("click", () => {
    updateWorld(1 / 24);
    renderAll();
  });
  els.speedSelect.addEventListener("change", () => {
    state.speed = Number(els.speedSelect.value);
  });
  els.autoRunToggle.addEventListener("change", () => {
    state.autoRun = els.autoRunToggle.checked;
    localStorage.setItem(STORAGE_KEYS.autoRun, String(state.autoRun));
    if (state.autoRun) scheduleAutoRun();
  });
  els.challengeSelect.addEventListener("change", () => {
    state.activeChallenge = els.challengeSelect.value;
    renderMetrics();
  });

  els.saveSpellButton.addEventListener("click", saveCurrentSpell);
  els.savedSpells.addEventListener("click", handleSavedSpellClick);
  els.exportButton.addEventListener("click", exportSpellCode);
  els.importButton.addEventListener("click", importSpellCode);

  bindCanvasInput();
}

function bindCanvasInput() {
  let dragging = false;

  const updateAimFromEvent = (event) => {
    const rect = els.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WORLD_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
    state.aim.x = clamp(x, 2, WORLD_WIDTH - 2);
    state.aim.y = clamp(y, 2, WORLD_HEIGHT - 2);
    renderAimChip();
    renderMetrics();
  };

  els.canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    els.canvas.setPointerCapture(event.pointerId);
    updateAimFromEvent(event);
  });

  els.canvas.addEventListener("pointermove", (event) => {
    if (dragging || event.pointerType === "mouse") {
      updateAimFromEvent(event);
    }
  });

  els.canvas.addEventListener("pointerup", () => {
    dragging = false;
  });

  els.canvas.addEventListener("pointercancel", () => {
    dragging = false;
  });
}

function buildStaticControls() {
  els.challengeSelect.replaceChildren();
  for (const challenge of state.data.challenges.challenges) {
    const option = document.createElement("option");
    option.value = challenge.id;
    option.textContent = challenge.name;
    els.challengeSelect.append(option);
  }
  els.challengeSelect.value = state.activeChallenge;

  renderExampleButtons();
}

function compileSource({ scheduleRun }) {
  state.parseResult = parseMagicScript(state.source);
  state.compiledSpell = state.parseResult.ok ? state.parseResult.spell : null;
  if (state.compiledSpell) {
    els.spellNameInput.value = els.spellNameInput.value || state.compiledSpell.name;
  }
  if (scheduleRun && state.autoRun) {
    scheduleAutoRun();
  }
}

function scheduleAutoRun() {
  clearTimeout(state.autoRunTimer);
  state.autoRunTimer = setTimeout(() => {
    if (state.compiledSpell) {
      runCompiledSpell({ resetBefore: true, silent: true });
    }
  }, 520);
}

function renderAll() {
  els.spellCodeInput.value = state.source;
  els.autoRunToggle.checked = state.autoRun;
  renderPlaybackButton();
  renderExampleButtons();
  renderCompilerOutput();
  renderSpellSummary();
  renderMetrics();
  renderSavedSpells();
  renderAimChip();
  renderWorld();
}

function renderPlaybackButton() {
  els.toggleRunButton.textContent = state.running ? "Ⅱ" : "▶";
  els.toggleRunButton.title = state.running ? "시뮬레이션 일시정지" : "시뮬레이션 재생";
}

function renderExampleButtons() {
  els.exampleList.replaceChildren();
  for (const example of EXAMPLE_SPELLS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example-button";
    button.classList.toggle("is-active", example.id === state.activeExample);
    button.textContent = example.name;
    button.addEventListener("click", () => {
      state.source = example.source;
      state.activeExample = example.id;
      els.spellNameInput.value = example.name;
      persistSource();
      compileSource({ scheduleRun: false });
      resetWorld(false);
      renderAll();
      runCompiledSpell({ resetBefore: false, silent: true });
      showToast(`${example.name} 코드를 불러왔습니다.`);
    });
    els.exampleList.append(button);
  }
}

function renderCompilerOutput() {
  const result = state.parseResult;
  els.compileBadge.classList.toggle("is-ok", Boolean(result?.ok));
  els.compileBadge.classList.toggle("is-error", Boolean(result && !result.ok));
  els.compilerOutput.classList.toggle("is-ok", Boolean(result?.ok));
  els.compilerOutput.classList.toggle("is-error", Boolean(result && !result.ok));

  if (!result) {
    els.compileBadge.textContent = "대기";
    els.compilerOutput.textContent = "소스 코드를 기다리는 중입니다.";
    return;
  }

  if (result.ok) {
    const warningText = result.warnings.length ? ` · ${result.warnings.join(" ")}` : "";
    els.compileBadge.textContent = "컴파일 완료";
    els.compilerOutput.textContent = `${result.spell.commandCount}개 명령을 실행 가능한 마법으로 컴파일했습니다.${warningText}`;
    return;
  }

  els.compileBadge.textContent = "오류";
  els.compilerOutput.textContent = result.errors
    .map((error) => (error.line ? `line ${error.line}: ${error.message}` : error.message))
    .join("\n");
}

function renderSpellSummary() {
  els.spellSummary.replaceChildren();
  if (!state.compiledSpell) {
    els.spellSummary.textContent = "컴파일 가능한 마법이 없습니다.";
    return;
  }

  for (const [key, value] of summarizeSpell(state.compiledSpell)) {
    const code = document.createElement("code");
    code.textContent = `${key}: ${value}`;
    els.spellSummary.append(code);
  }
}

function renderMetrics() {
  const metrics = calculateMetrics();
  state.lastMetrics = metrics;

  els.targetCount.textContent = `대상 ${metrics.targetCount}`;
  els.manaMetric.textContent = String(Math.round(metrics.mana));
  els.castMetric.textContent = `${metrics.castTime.toFixed(1)}s`;
  els.gradeMetric.textContent = metrics.grade;
  els.meterFill.style.width = `${Math.min(100, metrics.mana / 3)}%`;
  renderChallengeStatus(metrics);
}

function renderAimChip() {
  els.aimChip.textContent = `x ${state.aim.x.toFixed(0)} · y ${state.aim.y.toFixed(0)}`;
}

function renderChallengeStatus(metrics = state.lastMetrics) {
  const challenge = getActiveChallenge();
  if (!challenge) return;

  if (challenge.id === "free") {
    const discoveryCount = state.discoveries.size;
    const recent = state.lastCast ? state.lastCast.summary : "최근 실행 없음";
    els.challengeStatus.textContent = `${challenge.goal} 발견 ${discoveryCount}종 · ${recent}`;
    return;
  }

  const parts = challenge.targets.map((target) => {
    const count = countWorld(target);
    return `${formatTargetName(target)} ${count}/${target.count}`;
  });
  const complete = isChallengeComplete(challenge);
  const medal = complete && metrics.mana <= challenge.medal.mana && metrics.castTime <= challenge.medal.castTime;
  els.challengeStatus.textContent = `${challenge.goal} · ${parts.join(" · ")} · ${medal ? "최적화 달성" : complete ? "달성" : "진행 중"}`;
}

function gameLoop(now) {
  const elapsed = Math.min(0.05, (now - state.lastFrame) / 1000);
  state.lastFrame = now;

  if (state.running) {
    updateWorld(elapsed * state.speed);
  }

  if (now - state.lastMetricUpdate > 180) {
    state.lastMetricUpdate = now;
    renderMetrics();
  }

  renderWorld();
  requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.canvas.dpr = dpr;
  state.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  state.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  els.canvas.width = state.canvas.width;
  els.canvas.height = state.canvas.height;
  renderWorld();
}

function resetWorld(showMessage) {
  state.world = createWorld(20260607);
  state.lastCast = null;
  if (showMessage) showToast("실험장을 초기화했습니다.");
  renderAll();
}

function createWorld(seed) {
  const random = mulberry32(seed);
  const objects = [];
  let id = 1;

  const addObject = (type, x, y, options = {}) => {
    const substance = state.substancesByType.get(type);
    objects.push({
      id: id++,
      type,
      state: substance.baseState,
      x,
      y,
      vx: options.vx ?? (random() - 0.5) * 2.2,
      vy: options.vy ?? (random() - 0.5) * 2.2,
      mass: options.mass ?? 1,
      momentum: options.momentum ?? 0.55 + random() * 0.32,
      temperature: options.temperature ?? 288 + random() * 18,
      charge: options.charge ?? 0,
      cohesion: options.cohesion ?? random() * 0.12,
      flash: 0,
      age: random() * 10
    });
  };

  for (let i = 0; i < 54; i += 1) {
    addObject("H2O", 20 + random() * 58, 34 + random() * 26, {
      temperature: 288 + random() * 14,
      momentum: 0.48 + random() * 0.3
    });
  }

  for (let i = 0; i < 46; i += 1) {
    addObject("AIR", 10 + random() * 82, 8 + random() * 43, {
      mass: 0.5,
      temperature: 292 + random() * 12,
      momentum: 0.6 + random() * 0.4,
      vy: (random() - 0.5) * 1.2
    });
  }

  for (let i = 0; i < 34; i += 1) {
    addObject("EARTH", 12 + random() * 76, 52 + random() * 14, {
      mass: 1.6,
      temperature: 285 + random() * 10,
      momentum: 0.28 + random() * 0.18,
      cohesion: 0.18 + random() * 0.18
    });
  }

  for (const object of objects) {
    updateObjectState(object);
  }
  return objects;
}

function updateWorld(dt) {
  for (const object of state.world) {
    object.age += dt;

    const ambient = object.type === "EARTH" ? 286 : 294;
    object.temperature += (ambient - object.temperature) * 0.018 * dt;
    object.charge *= Math.pow(0.986, dt * 60);
    object.cohesion *= Math.pow(0.996, dt * 60);

    const drift = Math.sin(object.age * 1.7 + object.id) * 0.035;
    if (object.type === "AIR") {
      object.vx += drift * dt * 12;
      object.vy += Math.cos(object.age * 1.3 + object.id) * 0.025 * dt * 12;
    }

    if (object.state === "vapor" || object.state === "mist") {
      object.vy -= 0.45 * dt;
      object.vx += drift * dt * 6;
    }

    if (object.state === "plasma") {
      const dx = object.x - state.aim.x;
      const dy = object.y - state.aim.y;
      const length = Math.hypot(dx, dy) || 1;
      object.vx += (-dy / length) * 1.8 * dt;
      object.vy += (dx / length) * 1.8 * dt;
      object.flash = Math.max(object.flash, 0.5);
    }

    const drag = object.state === "ice" || object.state === "stone" ? 0.88 : 0.975;
    object.vx *= Math.pow(drag, dt * 60);
    object.vy *= Math.pow(drag, dt * 60);
    object.x += object.vx * dt;
    object.y += object.vy * dt;

    bounceObject(object);
    object.momentum = clamp(Math.hypot(object.vx, object.vy) / 8 + object.momentum * 0.985, 0, 2.4);
    object.flash = Math.max(0, object.flash - dt * 2.4);
    updateObjectState(object);
  }

  applyAggregation(dt);
}

function bounceObject(object) {
  const radius = getObjectRadius(object);
  if (object.x < radius) {
    object.x = radius;
    object.vx = Math.abs(object.vx) * 0.75;
  }
  if (object.x > WORLD_WIDTH - radius) {
    object.x = WORLD_WIDTH - radius;
    object.vx = -Math.abs(object.vx) * 0.75;
  }
  if (object.y < radius) {
    object.y = radius;
    object.vy = Math.abs(object.vy) * 0.75;
  }
  if (object.y > WORLD_HEIGHT - radius) {
    object.y = WORLD_HEIGHT - radius;
    object.vy = -Math.abs(object.vy) * 0.75;
  }
}

function applyAggregation(dt) {
  for (let i = 0; i < state.world.length; i += 1) {
    const a = state.world[i];
    const ruleA = state.substancesByType.get(a.type).aggregation;
    if (!ruleA || a.cohesion < ruleA.cohesionMin || a.state !== ruleA.state) continue;

    for (let j = i + 1; j < state.world.length; j += 1) {
      const b = state.world[j];
      if (a.type !== b.type || b.state !== ruleA.state || b.cohesion < ruleA.cohesionMin) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.01 || distance > ruleA.radius) continue;

      const pull = (1 - distance / ruleA.radius) * 0.36 * dt;
      a.x += dx * pull;
      a.y += dy * pull;
      b.x -= dx * pull;
      b.y -= dy * pull;
      a.vx *= 0.98;
      a.vy *= 0.98;
      b.vx *= 0.98;
      b.vy *= 0.98;
    }
  }
}

function updateObjectState(object) {
  const substance = state.substancesByType.get(object.type);
  if (!substance) return;

  const previousState = object.state;
  for (const transition of substance.transitions) {
    if (matchesWhen(object, transition.when)) {
      object.state = transition.state;
      break;
    }
  }

  if (previousState !== object.state) {
    state.discoveries.add(`${object.type}:${object.state}`);
    persistDiscoveries();
    object.flash = 1;
  }
}

function runCompiledSpell({ resetBefore, silent = false }) {
  if (!state.compiledSpell) {
    showToast("컴파일 오류를 먼저 해결해야 합니다.");
    return;
  }

  if (resetBefore) {
    state.world = createWorld(20260607);
    state.lastCast = null;
  }

  const metrics = calculateMetrics();
  const { targets } = selectTargets();
  const spell = state.compiledSpell;
  const effectScale = spell.output.effectScale ?? 1;

  for (const target of targets) {
    for (const effect of spell.effects) {
      applyEffect(target, effect, effectScale);
    }

    if (spell.output.anchor) {
      target.vx *= 0.32;
      target.vy *= 0.32;
      target.momentum *= 0.75;
      target.cohesion += 0.18;
    }

    updateObjectState(target);
    target.flash = 1;
  }

  if (spell.output.mode === "bloom") {
    applyBloom(targets);
  }

  state.lastCast = {
    time: performance.now(),
    targetIds: new Set(targets.map((target) => target.id)),
    summary: `${spell.name} · 마나 ${Math.round(metrics.mana)} · 대상 ${targets.length}`
  };

  state.running = true;
  renderAll();

  const challenge = getActiveChallenge();
  if (!silent) {
    if (challenge && challenge.id !== "free" && isChallengeComplete(challenge)) {
      showToast(`${challenge.name} 도전 달성`);
    } else {
      showToast(`${spell.name} 실행: ${targets.length}개 대상`);
    }
  }
}

function applyEffect(target, effect, scale) {
  const value = effect.value * scale;
  if (effect.op === "add") {
    target[effect.attr] = clampAttribute(effect.attr, (target[effect.attr] ?? 0) + value);
    return;
  }

  if (effect.op === "set") {
    target[effect.attr] = clampAttribute(effect.attr, value);
    return;
  }

  if (effect.op === "pushTowardAim") {
    const dx = state.aim.x - CASTER.x;
    const dy = state.aim.y - CASTER.y;
    const length = Math.hypot(dx, dy) || 1;
    target.vx += (dx / length) * value;
    target.vy += (dy / length) * value;
    clampVelocity(target);
    return;
  }

  if (effect.op === "swirl") {
    const dx = target.x - state.aim.x;
    const dy = target.y - state.aim.y;
    const length = Math.hypot(dx, dy) || 1;
    target.vx += (-dy / length) * value;
    target.vy += (dx / length) * value;
    clampVelocity(target);
  }
}

function applyBloom(primaryTargets) {
  const primaryIds = new Set(primaryTargets.map((target) => target.id));
  for (const object of state.world) {
    if (primaryIds.has(object.id)) continue;
    const distance = distanceToAim(object);
    if (distance > 18) continue;
    const strength = (1 - distance / 18) * 0.9;
    const dx = object.x - state.aim.x;
    const dy = object.y - state.aim.y;
    const length = Math.hypot(dx, dy) || 1;
    object.vx += (dx / length) * strength * 2;
    object.vy += (dy / length) * strength * 2;
    object.momentum = clamp(object.momentum + strength * 0.12, 0, 2.4);
    object.flash = Math.max(object.flash, strength * 0.6);
  }
}

function calculateMetrics() {
  if (!state.compiledSpell) {
    return {
      mana: 0,
      castTime: 0,
      targetCount: 0,
      inRangeCount: 0,
      grade: "-",
      selection: { inRange: [], targets: [] }
    };
  }

  const spell = state.compiledSpell;
  const selection = selectTargets();
  const filterCost = Math.max(0.2, spell.filters.length);
  const formulaCost = spell.effects.reduce((sum, effect) => sum + estimateEffectComplexity(effect), 0);

  let mana = 0;
  for (const target of selection.targets) {
    const substance = state.substancesByType.get(target.type);
    for (const effect of spell.effects) {
      const attr = effect.attr === "velocity" ? "velocity" : effect.attr;
      const weight = state.data.substances.manaWeights[attr] ?? 1;
      const magnitude = estimateMagnitude(effect, target);
      mana += magnitude * weight * (substance?.difficulty ?? 1);
    }
  }

  mana = (mana / COST_NORMALIZER) * (spell.output.manaMultiplier ?? 1);
  const castTime =
    (0.32 +
      (spell.range.scanFactor ?? 1) * 0.42 +
      selection.inRange.length * filterCost * 0.012 +
      formulaCost * 0.17) *
    (spell.output.castMultiplier ?? 1);

  return {
    mana,
    castTime,
    targetCount: selection.targets.length,
    inRangeCount: selection.inRange.length,
    grade: gradeMetrics(mana, castTime),
    selection
  };
}

function gradeMetrics(mana, castTime) {
  const challenge = getActiveChallenge();
  if (challenge && challenge.id !== "free" && isChallengeComplete(challenge)) {
    if (mana <= challenge.medal.mana && castTime <= challenge.medal.castTime) return "S";
    return "A";
  }

  const score = mana + castTime * 35;
  if (score < 90) return "S";
  if (score < 160) return "A";
  if (score < 250) return "B";
  return "C";
}

function estimateEffectComplexity(effect) {
  if (effect.op === "pushTowardAim" || effect.op === "swirl") return 2.3;
  if (effect.op === "set") return 1.7;
  return 1.2;
}

function estimateMagnitude(effect, target) {
  if (effect.op === "set") {
    return Math.abs(effect.value - (target[effect.attr] ?? 0));
  }
  return Math.abs(effect.cost ?? effect.value);
}

function selectTargets() {
  if (!state.compiledSpell) return { inRange: [], targets: [] };
  const spell = state.compiledSpell;
  const inRange = state.world.filter((object) => isInRange(object, spell.range));
  const targets = inRange.filter((object) => spell.filters.every((filter) => matchesFilter(object, filter)));
  return { inRange, targets };
}

function isInRange(object, range) {
  if (!range) return false;

  if (range.shape === "circle") {
    return distanceToAim(object) <= range.radius;
  }

  if (range.shape === "rect") {
    return (
      Math.abs(object.x - state.aim.x) <= range.width / 2 &&
      Math.abs(object.y - state.aim.y) <= range.height / 2
    );
  }

  if (range.shape === "lane") {
    const distance = distanceToSegment(object, CASTER, state.aim);
    return distance <= range.width / 2;
  }

  return false;
}

function matchesFilter(object, filter) {
  return compareRule(object[filter.field], filter.op, filter.value);
}

function matchesWhen(object, when) {
  return Object.entries(when).every(([key, value]) => {
    if (key === "temperatureMax") return object.temperature <= value;
    if (key === "temperatureMin") return object.temperature >= value;
    if (key === "momentumMax") return object.momentum <= value;
    if (key === "momentumMin") return object.momentum >= value;
    if (key === "chargeMin") return object.charge >= value;
    if (key === "chargeMax") return object.charge <= value;
    if (key === "cohesionMin") return object.cohesion >= value;
    if (key === "cohesionMax") return object.cohesion <= value;
    return true;
  });
}

function compareRule(actual, op, expected) {
  if (op === "==" || op === "eq") return actual === expected;
  if (op === "!=" || op === "neq") return actual !== expected;
  if (op === "<" || op === "lt") return actual < expected;
  if (op === "<=" || op === "lte") return actual <= expected;
  if (op === ">" || op === "gt") return actual > expected;
  if (op === ">=" || op === "gte") return actual >= expected;
  return false;
}

function renderWorld() {
  const ctx = els.ctx;
  const { width, height, dpr } = state.canvas;
  if (!width || !height) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  const cssWidth = width / dpr;
  const cssHeight = height / dpr;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  drawBackground(ctx, cssWidth, cssHeight);
  drawRangeOverlay(ctx, cssWidth, cssHeight);
  drawAggregationLinks(ctx, cssWidth, cssHeight);

  const selection = state.lastMetrics?.selection ?? selectTargets();
  const targetIds = new Set(selection.targets.map((object) => object.id));
  const recentIds = state.lastCast?.targetIds ?? new Set();

  for (const object of state.world) {
    drawObject(ctx, object, cssWidth, cssHeight, targetIds.has(object.id), recentIds.has(object.id));
  }

  drawCaster(ctx, cssWidth, cssHeight);
  drawAim(ctx, cssWidth, cssHeight);
  drawCastRipple(ctx, cssWidth, cssHeight);
  ctx.restore();
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0b1116");
  gradient.addColorStop(1, "#11191f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  const step = Math.max(24, width / 16);
  for (let x = 0; x <= width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawRangeOverlay(ctx, width, height) {
  const range = state.compiledSpell?.range;
  if (!range) return;

  const aim = toScreen(state.aim, width, height);
  ctx.save();
  ctx.strokeStyle = "rgba(72,199,216,0.52)";
  ctx.fillStyle = "rgba(72,199,216,0.08)";
  ctx.lineWidth = 2;

  if (range.shape === "circle") {
    const radius = (range.radius / WORLD_WIDTH) * width;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (range.shape === "rect") {
    const rectWidth = (range.width / WORLD_WIDTH) * width;
    const rectHeight = (range.height / WORLD_HEIGHT) * height;
    ctx.beginPath();
    ctx.rect(aim.x - rectWidth / 2, aim.y - rectHeight / 2, rectWidth, rectHeight);
    ctx.fill();
    ctx.stroke();
  }

  if (range.shape === "lane") {
    const caster = toScreen(CASTER, width, height);
    const laneWidth = (range.width / WORLD_WIDTH) * width;
    ctx.lineCap = "round";
    ctx.lineWidth = laneWidth;
    ctx.strokeStyle = "rgba(72,199,216,0.12)";
    ctx.beginPath();
    ctx.moveTo(caster.x, caster.y);
    ctx.lineTo(aim.x, aim.y);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(72,199,216,0.62)";
    ctx.beginPath();
    ctx.moveTo(caster.x, caster.y);
    ctx.lineTo(aim.x, aim.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAggregationLinks(ctx, width, height) {
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i < state.world.length; i += 1) {
    const a = state.world[i];
    if (a.cohesion < 0.5 && a.state !== "ice" && a.state !== "stone") continue;
    for (let j = i + 1; j < state.world.length; j += 1) {
      const b = state.world[j];
      if (a.type !== b.type || a.state !== b.state) continue;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance > 5.8) continue;
      const pa = toScreen(a, width, height);
      const pb = toScreen(b, width, height);
      ctx.strokeStyle = a.state === "ice" ? "rgba(155,232,255,0.18)" : "rgba(247,199,95,0.15)";
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawObject(ctx, object, width, height, selected, recent) {
  const point = toScreen(object, width, height);
  const radius = getObjectRadius(object) * (width / WORLD_WIDTH);
  const colors = getStateColors(object);

  ctx.save();
  if (object.flash > 0 || recent) {
    ctx.globalAlpha = 0.18 + object.flash * 0.28;
    ctx.fillStyle = colors.glow;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * (3 + object.flash * 1.5), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = object.state === "air" ? 0.72 : 0.95;
  ctx.fillStyle = colors.fill;
  ctx.strokeStyle = selected ? "#f7c75f" : colors.stroke;
  ctx.lineWidth = selected ? 2 : 1;

  if (object.type === "EARTH") {
    ctx.beginPath();
    ctx.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    ctx.fill();
    ctx.stroke();
  } else if (object.state === "ice" || object.state === "glass") {
    drawDiamond(ctx, point.x, point.y, radius * 1.35);
  } else {
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (object.charge > 0.45) {
    ctx.strokeStyle = `rgba(206, 142, 255, ${Math.min(0.8, object.charge / 3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * (1.7 + Math.sin(object.age * 8) * 0.18), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDiamond(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawCaster(ctx, width, height) {
  const caster = toScreen(CASTER, width, height);
  ctx.save();
  ctx.strokeStyle = "rgba(247,199,95,0.75)";
  ctx.fillStyle = "rgba(247,199,95,0.13)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(caster.x, caster.y, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(caster.x, caster.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawAim(ctx, width, height) {
  const aim = toScreen(state.aim, width, height);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(aim.x - 10, aim.y);
  ctx.lineTo(aim.x + 10, aim.y);
  ctx.moveTo(aim.x, aim.y - 10);
  ctx.lineTo(aim.x, aim.y + 10);
  ctx.stroke();
  ctx.restore();
}

function drawCastRipple(ctx, width, height) {
  if (!state.lastCast) return;
  const age = (performance.now() - state.lastCast.time) / 1000;
  if (age > 0.7) return;

  const aim = toScreen(state.aim, width, height);
  ctx.save();
  ctx.strokeStyle = `rgba(247,199,95,${0.55 * (1 - age / 0.7)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(aim.x, aim.y, 10 + age * 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function getStateColors(object) {
  const palette = {
    water: { fill: "#4fb2ff", stroke: "#8cd4ff", glow: "#4fb2ff" },
    ice: { fill: "#9be8ff", stroke: "#e7fbff", glow: "#9be8ff" },
    vapor: { fill: "#d7dde2", stroke: "#ffffff", glow: "#d7dde2" },
    air: { fill: "#b7c8d6", stroke: "#e4eef4", glow: "#b7c8d6" },
    mist: { fill: "#c9edf3", stroke: "#ffffff", glow: "#c9edf3" },
    plasma: { fill: "#ce8eff", stroke: "#f1dcff", glow: "#ce8eff" },
    dust: { fill: "#b78b57", stroke: "#d6ad74", glow: "#b78b57" },
    stone: { fill: "#87776a", stroke: "#c0b3a6", glow: "#b78b57" },
    glass: { fill: "#7ee3cf", stroke: "#d9fff6", glow: "#7ee3cf" }
  };
  return palette[object.state] ?? palette.air;
}

function getObjectRadius(object) {
  if (object.type === "EARTH") return object.state === "glass" ? 1.25 : 1.08;
  if (object.state === "vapor" || object.state === "air") return 0.9;
  if (object.state === "ice") return 1.18;
  return 1.02;
}

function toScreen(point, width, height) {
  return {
    x: (point.x / WORLD_WIDTH) * width,
    y: (point.y / WORLD_HEIGHT) * height
  };
}

function distanceToAim(object) {
  return Math.hypot(object.x - state.aim.x, object.y - state.aim.y);
}

function distanceToSegment(point, start, end) {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const lengthSq = vx * vx + vy * vy || 1;
  const t = clamp((wx * vx + wy * vy) / lengthSq, 0, 1);
  const projection = { x: start.x + t * vx, y: start.y + t * vy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function getActiveChallenge() {
  return state.data.challenges.challenges.find((challenge) => challenge.id === state.activeChallenge);
}

function isChallengeComplete(challenge) {
  if (!challenge.targets.length) return false;
  return challenge.targets.every((target) => countWorld(target) >= target.count);
}

function countWorld(target) {
  return state.world.filter((object) => compareRule(object[target.field], target.op, target.value)).length;
}

function formatTargetName(target) {
  if (target.field === "state") {
    const names = {
      ice: "얼음",
      vapor: "증기",
      plasma: "플라즈마",
      glass: "유리"
    };
    return names[target.value] ?? target.value;
  }
  return target.value;
}

function saveCurrentSpell() {
  const name = els.spellNameInput.value.trim() || state.compiledSpell?.name || "UntitledSpell";
  const saves = getSavedSpells();
  const entry = {
    id: `spell-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
    source: state.source
  };
  saves.unshift(entry);
  localStorage.setItem(STORAGE_KEYS.savedSpells, JSON.stringify(saves.slice(0, 24)));
  renderSavedSpells();
  showToast(`${name} 저장 완료`);
}

function renderSavedSpells() {
  const saves = getSavedSpells();
  els.savedSpells.replaceChildren();
  for (const save of saves) {
    const item = document.createElement("div");
    item.className = "saved-item";

    const copy = document.createElement("div");
    const created = new Date(save.createdAt).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    copy.innerHTML = `<strong></strong><span>${created}</span>`;
    copy.querySelector("strong").textContent = save.name;
    item.append(copy);

    const actions = document.createElement("div");
    actions.className = "chip-actions";
    actions.append(makeSaveButton("load", save.id, "열기"));
    actions.append(makeSaveButton("delete", save.id, "×"));
    item.append(actions);
    els.savedSpells.append(item);
  }
}

function makeSaveButton(action, id, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.dataset.saveId = id;
  button.textContent = label;
  return button;
}

function handleSavedSpellClick(event) {
  const button = event.target.closest("[data-save-id]");
  if (!button) return;
  const saves = getSavedSpells();
  const save = saves.find((item) => item.id === button.dataset.saveId);
  if (!save) return;

  if (button.dataset.action === "load") {
    state.source = save.source;
    state.activeExample = "";
    els.spellNameInput.value = save.name;
    persistSource();
    compileSource({ scheduleRun: false });
    resetWorld(false);
    renderAll();
    runCompiledSpell({ resetBefore: false, silent: true });
    showToast(`${save.name} 열기 완료`);
  }

  if (button.dataset.action === "delete") {
    const nextSaves = saves.filter((item) => item.id !== save.id);
    localStorage.setItem(STORAGE_KEYS.savedSpells, JSON.stringify(nextSaves));
    renderSavedSpells();
  }
}

async function exportSpellCode() {
  const code = encodeSpellSource({
    name: els.spellNameInput.value.trim() || state.compiledSpell?.name || "UntitledSpell",
    source: state.source
  });
  els.shareCodeBox.value = code;
  try {
    await navigator.clipboard.writeText(code);
    showToast("공유 코드를 복사했습니다.");
  } catch {
    showToast("공유 코드를 만들었습니다.");
  }
}

function importSpellCode() {
  const code = els.shareCodeBox.value.trim();
  if (!code) {
    showToast("불러올 코드를 입력하세요.");
    return;
  }

  try {
    const payload = decodeSpellSource(code);
    if (!payload.source || typeof payload.source !== "string") {
      throw new Error("소스 코드 형식이 다릅니다.");
    }
    state.source = payload.source;
    state.activeExample = "";
    els.spellNameInput.value = payload.name || "";
    persistSource();
    compileSource({ scheduleRun: false });
    resetWorld(false);
    renderAll();
    runCompiledSpell({ resetBefore: false, silent: true });
    showToast("공유 코드를 불러왔습니다.");
  } catch (error) {
    showToast(error.message || "코드를 읽지 못했습니다.");
  }
}

function encodeSpellSource(payload) {
  const json = JSON.stringify({ v: 2, ...payload });
  return btoa(unescape(encodeURIComponent(json))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeSpellSource(code) {
  const normalized = code.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(decodeURIComponent(escape(atob(padded))));
}

function getSavedSpells() {
  const saves = safeJsonParse(localStorage.getItem(STORAGE_KEYS.savedSpells));
  return Array.isArray(saves) ? saves.filter((save) => typeof save.source === "string") : [];
}

function persistSource() {
  localStorage.setItem(STORAGE_KEYS.currentSource, state.source);
}

function persistDiscoveries() {
  localStorage.setItem(STORAGE_KEYS.discoveries, JSON.stringify([...state.discoveries]));
}

function clampAttribute(attr, value) {
  if (attr === "temperature") return clamp(value, 120, 900);
  if (attr === "momentum") return clamp(value, 0, 2.4);
  if (attr === "charge") return clamp(value, 0, 3.2);
  if (attr === "cohesion") return clamp(value, 0, 1.4);
  return value;
}

function clampVelocity(object) {
  const speed = Math.hypot(object.vx, object.vy);
  if (speed <= 18) return;
  object.vx = (object.vx / speed) * 18;
  object.vy = (object.vy / speed) * 18;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mulberry32(seed) {
  let value = seed;
  return function random() {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2200);
}

function showFatalError(error) {
  document.body.innerHTML = `
    <main style="max-width:720px;margin:10vh auto;padding:24px;color:#eef5f8;font-family:system-ui;background:#171d22;border:1px solid #34414b">
      <h1>산식의 마법사</h1>
      <p>게임 데이터를 읽는 중 문제가 발생했습니다.</p>
      <pre style="white-space:pre-wrap;color:#f7c75f">${error.message}</pre>
      <p>로컬 서버에서 실행하면 JSON 데이터가 정상적으로 로드됩니다.</p>
    </main>
  `;
}
