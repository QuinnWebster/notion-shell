const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", ".nshrc.json");

const CONFIG_SCHEMA = {
  applicationType: {
    type: "enum",
    options: ["web", "app"],
    default: "web",
  },
  maxDepth: {
    type: "number",
    min: 1,
    max: 20,
    default: 10,
  },
  visitLimit: {
    type: "number",
    min: 1,
    max: 100,
    default: 100,
  },
};

function isValidValue(key, value) {
  const schema = CONFIG_SCHEMA[key];
  if (!schema) return false;

  if (schema.type === "enum") {
    return schema.options.includes(value);
  }

  if (schema.type === "number") {
    const n = Number(value);
    return Number.isInteger(n) && n >= schema.min && n <= schema.max;
  }

  return false;
}

const DEFAULTS = Object.fromEntries(
  Object.entries(CONFIG_SCHEMA).map(([key, schema]) => [key, schema.default]),
);

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    console.error(`warning: failed to read ${CONFIG_PATH}, using defaults`);
    return { ...DEFAULTS };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = {
  loadConfig,
  saveConfig,
  CONFIG_PATH,
  CONFIG_SCHEMA,
  isValidValue,
};
