const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", ".nshrc.json");

const DEFAULTS = {
  applicationType: "web",
};

const VALID_KEYS = {
  applicationType: ["web", "app"],
};

function isValidKey(key, value) {
  return VALID_KEYS[key]?.includes(value) ?? false;
}

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
  VALID_KEYS,
  isValidKey,
};
