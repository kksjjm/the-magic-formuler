const RANGE_DEFAULT = { shape: "circle", radius: 22, scanFactor: 1 };

const OUTPUTS = {
  release: {
    mode: "release",
    label: "즉시 출력",
    manaMultiplier: 1,
    castMultiplier: 1,
    effectScale: 1
  },
  focus: {
    mode: "focus",
    label: "정밀 출력",
    manaMultiplier: 0.82,
    castMultiplier: 1.28,
    effectScale: 0.86
  },
  bloom: {
    mode: "bloom",
    label: "확산 출력",
    manaMultiplier: 1.18,
    castMultiplier: 0.9,
    effectScale: 1.08
  },
  anchor: {
    mode: "anchor",
    label: "고정 출력",
    manaMultiplier: 1.06,
    castMultiplier: 1.12,
    effectScale: 0.96,
    anchor: true
  }
};

const FIELD_TYPES = {
  type: "text",
  state: "text",
  momentum: "number",
  temperature: "number",
  charge: "number",
  cohesion: "number",
  mass: "number"
};

const EFFECT_ATTRS = new Set(["momentum", "temperature", "charge", "cohesion"]);
const OPERATORS = new Set(["==", "!=", "<", "<=", ">", ">="]);
const SET_OPERATORS = new Set(["=", "+=", "-="]);

export const EXAMPLE_SPELLS = [
  {
    id: "iceball",
    name: "아이스볼",
    source: `spell Iceball {
  range circle 22
  target type == H2O
  set momentum -= 0.60
  set temperature -= 68
  set cohesion += 0.28
  push aim 8.5
  output release
}`
  },
  {
    id: "steam-fountain",
    name: "증기분수",
    source: `spell SteamFountain {
  range circle 14
  target type == H2O
  set temperature += 150
  set momentum += 0.42
  push aim 7
  output bloom
}`
  },
  {
    id: "static-ring",
    name: "정전기 고리",
    source: `spell StaticRing {
  range rect 76 46
  target type == AIR
  set charge += 1.35
  set temperature += 34
  swirl 5.2
  output bloom
}`
  },
  {
    id: "glass-seed",
    name: "유리 씨앗",
    source: `spell GlassSeed {
  range circle 13
  target type == EARTH
  set temperature += 150
  set charge += 0.75
  set cohesion += 0.22
  output focus
}`
  }
];

export function parseMagicScript(source) {
  const spell = {
    name: "UntitledSpell",
    range: { ...RANGE_DEFAULT },
    filters: [],
    effects: [],
    output: { ...OUTPUTS.release },
    commandCount: 0
  };
  const errors = [];
  const warnings = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = stripComment(lines[index]).trim();
    if (!line || line === "{" || line === "}") continue;

    const tokens = line.split(/\s+/);
    const command = tokens[0]?.toLowerCase();

    try {
      if (command === "spell") {
        parseSpellHeader(line, tokens, spell);
        continue;
      }

      if (command === "range") {
        spell.range = parseRange(tokens, lineNumber);
        spell.commandCount += 1;
        continue;
      }

      if (command === "target") {
        spell.filters.push(parseTarget(tokens, lineNumber));
        spell.commandCount += 1;
        continue;
      }

      if (command === "set") {
        spell.effects.push(parseSet(tokens, lineNumber));
        spell.commandCount += 1;
        continue;
      }

      if (command === "push") {
        spell.effects.push(parsePush(tokens, lineNumber));
        spell.commandCount += 1;
        continue;
      }

      if (command === "swirl") {
        spell.effects.push(parseSwirl(tokens, lineNumber));
        spell.commandCount += 1;
        continue;
      }

      if (command === "output") {
        spell.output = parseOutput(tokens, lineNumber);
        spell.commandCount += 1;
        continue;
      }

      throw new SyntaxError(`알 수 없는 명령 "${tokens[0]}"`);
    } catch (error) {
      errors.push({ line: lineNumber, message: error.message });
    }
  }

  if (spell.effects.length === 0) {
    errors.push({ line: 0, message: "set, push, swirl 중 하나 이상의 효과가 필요합니다." });
  }

  if (spell.filters.length === 0) {
    warnings.push("target이 없으면 범위 안의 모든 물질에 적용됩니다.");
  }

  if (spell.effects.length > 16) {
    errors.push({ line: 0, message: "효과 명령은 16개까지만 허용됩니다." });
  }

  if (spell.filters.length > 8) {
    errors.push({ line: 0, message: "target 조건은 8개까지만 허용됩니다." });
  }

  return {
    ok: errors.length === 0,
    spell,
    errors,
    warnings
  };
}

export function summarizeSpell(spell) {
  if (!spell) return [];
  const range = describeRange(spell.range);
  const targets = spell.filters.length
    ? spell.filters.map((filter) => `${filter.field} ${filter.op} ${filter.value}`).join(" && ")
    : "all";
  const effects = spell.effects.map(describeEffect).join("; ");
  return [
    ["name", spell.name],
    ["range", range],
    ["target", targets],
    ["effect", effects],
    ["output", spell.output.mode]
  ];
}

function stripComment(line) {
  return line.replace(/\/\/.*$/, "").replace(/#.*$/, "");
}

function parseSpellHeader(line, tokens, spell) {
  if (tokens.length < 2) {
    throw new SyntaxError("spell 뒤에 이름이 필요합니다.");
  }
  const name = line
    .replace(/^spell\s+/i, "")
    .replace(/\{$/, "")
    .trim();
  if (!/^[A-Za-z_][A-Za-z0-9_\- ]{0,31}$/.test(name)) {
    throw new SyntaxError("마법 이름은 영문, 숫자, 공백, _, - 조합으로 32자까지 가능합니다.");
  }
  spell.name = name;
}

function parseRange(tokens, lineNumber) {
  const shape = tokens[1]?.toLowerCase();
  if (shape === "circle") {
    const radius = parsePositiveNumber(tokens[2], lineNumber, "반지름");
    return {
      shape,
      radius: clamp(radius, 4, 42),
      scanFactor: 0.35 + radius / 24
    };
  }

  if (shape === "rect") {
    const width = parsePositiveNumber(tokens[2], lineNumber, "너비");
    const height = parsePositiveNumber(tokens[3], lineNumber, "높이");
    return {
      shape,
      width: clamp(width, 8, 92),
      height: clamp(height, 8, 64),
      scanFactor: 0.4 + (width * height) / 1800
    };
  }

  if (shape === "lane") {
    const width = parsePositiveNumber(tokens[2], lineNumber, "폭");
    return {
      shape,
      width: clamp(width, 4, 32),
      scanFactor: 0.35 + width / 30
    };
  }

  throw new SyntaxError("range는 circle, rect, lane 중 하나여야 합니다.");
}

function parseTarget(tokens, lineNumber) {
  const [, field, op, ...rawValue] = tokens;
  if (!field || !op || rawValue.length === 0) {
    throw new SyntaxError("target 문법은 target field operator value 입니다.");
  }
  if (!FIELD_TYPES[field]) {
    throw new SyntaxError(`target field "${field}"는 지원하지 않습니다.`);
  }
  if (!OPERATORS.has(op)) {
    throw new SyntaxError(`target operator "${op}"는 지원하지 않습니다.`);
  }

  const joinedValue = rawValue.join(" ");
  return {
    field,
    op,
    value: FIELD_TYPES[field] === "number" ? parseNumber(joinedValue, lineNumber, field) : joinedValue
  };
}

function parseSet(tokens, lineNumber) {
  const [, attr, op, rawValue] = tokens;
  if (!attr || !op || rawValue === undefined) {
    throw new SyntaxError("set 문법은 set attr += number 입니다.");
  }
  if (!EFFECT_ATTRS.has(attr)) {
    throw new SyntaxError(`set attr "${attr}"는 지원하지 않습니다.`);
  }
  if (!SET_OPERATORS.has(op)) {
    throw new SyntaxError(`set operator "${op}"는 지원하지 않습니다.`);
  }

  const value = parseNumber(rawValue, lineNumber, attr);
  if (op === "=") {
    return {
      type: "set",
      attr,
      op: "set",
      value,
      line: lineNumber,
      cost: attr === "temperature" ? Math.abs(value - 294) : Math.abs(value)
    };
  }

  return {
    type: "set",
    attr,
    op: "add",
    value: op === "-=" ? -Math.abs(value) : value,
    line: lineNumber,
    cost: Math.abs(value)
  };
}

function parsePush(tokens, lineNumber) {
  const target = tokens[1]?.toLowerCase();
  if (target !== "aim") {
    throw new SyntaxError("push는 push aim number 형식만 지원합니다.");
  }
  const value = parsePositiveNumber(tokens[2], lineNumber, "push");
  return {
    type: "vector",
    attr: "velocity",
    op: "pushTowardAim",
    value: clamp(value, 0, 18),
    line: lineNumber,
    cost: value
  };
}

function parseSwirl(tokens, lineNumber) {
  const value = parsePositiveNumber(tokens[1], lineNumber, "swirl");
  return {
    type: "vector",
    attr: "velocity",
    op: "swirl",
    value: clamp(value, 0, 18),
    line: lineNumber,
    cost: value
  };
}

function parseOutput(tokens, lineNumber) {
  const mode = tokens[1]?.toLowerCase();
  if (!OUTPUTS[mode]) {
    throw new SyntaxError(`line ${lineNumber}: output은 release, focus, bloom, anchor 중 하나여야 합니다.`);
  }
  return { ...OUTPUTS[mode] };
}

function parseNumber(value, lineNumber, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new SyntaxError(`line ${lineNumber}: ${label} 값은 숫자여야 합니다.`);
  }
  return number;
}

function parsePositiveNumber(value, lineNumber, label) {
  const number = parseNumber(value, lineNumber, label);
  if (number <= 0) {
    throw new SyntaxError(`line ${lineNumber}: ${label} 값은 0보다 커야 합니다.`);
  }
  return number;
}

function describeRange(range) {
  if (range.shape === "circle") return `circle ${range.radius}`;
  if (range.shape === "rect") return `rect ${range.width} ${range.height}`;
  if (range.shape === "lane") return `lane ${range.width}`;
  return "unknown";
}

function describeEffect(effect) {
  if (effect.op === "pushTowardAim") return `push aim ${effect.value}`;
  if (effect.op === "swirl") return `swirl ${effect.value}`;
  if (effect.op === "set") return `set ${effect.attr} = ${effect.value}`;
  const sign = effect.value < 0 ? "-=" : "+=";
  return `set ${effect.attr} ${sign} ${Math.abs(effect.value)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
