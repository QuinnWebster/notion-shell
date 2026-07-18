#!/usr/bin/env node
require("dotenv").config();

const {
  loadConfig,
  saveConfig,
  CONFIG_PATH,
  VALID_KEYS,
  isValidKey,
} = require("../lib/config");

let config = loadConfig();

const { exec } = require("child_process");
const readline = require("readline");
const {
  makeClient,
  listDir,
  findChildByName,
  // findRecursive,
  findPage,
  catPage,
  createChildPage,
} = require("../lib/notion");

const TOKEN = process.env.NOTION_TOKEN;
const ROOT_ID = process.env.NOTION_ROOT_PAGE_ID;

if (!TOKEN || !ROOT_ID) {
  console.error(
    "Missing config. Set both env vars before running:\n" +
      "  NOTION_TOKEN=secret_...        (your internal integration token)\n" +
      "  NOTION_ROOT_PAGE_ID=...        (the page ID to treat as your root '/')\n\n" +
      "Also make sure that page is shared with your integration in Notion\n",
  );
  process.exit(1);
}

const client = makeClient(TOKEN);

// Breadcrumb stack: [{ id, title }], root implicit as path[0]
let path = [{ id: ROOT_ID, title: "/" }];

function cwd() {
  return path[path.length - 1];
}

function pwdString() {
  if (path.length === 1) return "/";
  return (
    "/" +
    path
      .slice(1)
      .map((p) => p.title)
      .join("/")
  );
}

function openUrl(url) {
  const platform = process.platform;
  const cmd =
    platform === "win32"
      ? `start "" "${url}"`
      : platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) console.error(`open: failed to launch browser: ${err.message}`);
  });
}

async function resolvePath(target) {
  let stack;
  let segments;

  if (target.startsWith("/")) {
    stack = [path[0]];
    segments = target.slice(1).split("/").filter(Boolean);
  } else {
    stack = [...path]; // copy of current breadcrumb, so we don't mutate real path
    segments = target.split("/").filter(Boolean);
  }

  for (const seg of segments) {
    if (seg === "..") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const current = stack[stack.length - 1];
    const match = await findChildByName(client, current.id, seg);
    if (!match) return null;
    stack.push({ id: match.id, title: match.title });
  }

  return stack[stack.length - 1];
}

async function cmdLs(args) {
  const showAll = args.includes("-a");
  const { dirs, files } = await listDir(client, cwd().id);

  dirs.forEach((d) => console.log(`\x1b[34m${d.title}/\x1b[0m`));
  if (showAll) {
    files.forEach((f) => console.log(`${f.text.slice(0, 60)}`));
  }
  if (dirs.length === 0 && (!showAll || files.length === 0)) {
    console.log("(empty)");
  }
}

async function cmdCd(args) {
  const target = args[0];
  if (!target || target === "~" || target === "/") {
    path = [path[0]];
    return;
  }
  if (target === "..") {
    if (path.length > 1) path.pop();
    return;
  }

  const match = await findChildByName(client, cwd().id, target);
  if (!match) {
    console.log(`cd: no such folder: ${target}`);
    return;
  }
  path.push({ id: match.id, title: match.title });
}

async function cmdCat(args) {
  const target = args[0];
  if (!target) {
    console.log("usage: cat <page-name>");
    return;
  }
  const match = await findChildByName(client, cwd().id, target);
  if (!match) {
    console.log(`cat: no such page: ${target}`);
    return;
  }
  const text = await catPage(client, match.id);
  console.log(text || "(no text content)");
}

async function cmdFindPage(args) {
  const fuzzy = args.includes("-f");
  const target = args.filter((a) => a !== "-f").join(" ");

  if (!target) {
    console.log("usage: findPAge <page-name>");
    return;
  }
  console.log(`searching from ${pwdString()} ... \n`);
  const results = await findPage(client, cwd().id, target, 10, fuzzy);
  if (results.length === 0) {
    console.log(`findPage: no match for "${target}" within search depth`);
    return;
  }
  results.forEach((result) => {
    console.log(`found: /${result.path.join("/")}`);
    console.log(`url: https://www.notion.so/${result.id.replace(/-/g, "")} \n`);
  });
}

async function cmdMkdir(args) {
  const name = args.join(" ");
  if (!name) {
    console.log("usage: mkdir <name>");
    return;
  }
  const existing = await findChildByName(client, cwd().id, name);
  if (existing) {
    console.log(`mkdir: "${name}" already exists`);
    return;
  }
  await createChildPage(client, cwd().id, name);
  console.log(`created "${name}"`);
}

function cmdOpenWeb(target) {
  const url = `https://www.notion.so/${target.id.replace(/-/g, "")}`;
  console.log(`opening ${target.title} ...`);
  openUrl(url);
}

function cmdOpenApp(target) {
  const url = `notion://www.notion.so/${target.id.replace(/-/g, "")}`;
  console.log(`syncing Notion app to ${target.title} ...`);
  openUrl(url);
}

async function cmdOpen(args) {
  let target;

  if (args[0]) {
    const resolved = await resolvePath(args[0]);
    if (!resolved) {
      console.log(`open: no such page: ${args[0]}`);
      return;
    }
    target = resolved;
  } else {
    target = { id: cwd().id, title: pwdString() };
  }

  if (config.applicationType === "app") {
    cmdOpenApp(target);
  } else if (config.applicationType === "web") {
    cmdOpenWeb(target);
  } else {
    console.log(
      `applicationType not set in ${CONFIG_PATH}. Run: config set applicationType web|app`,
    );
  }
}

function cmdConfig(args) {
  const [action, key, value] = args;

  if (action === "get") {
    if (!key) {
      console.log("usage: config get <key>");
      return;
    }
    if (!(key in VALID_KEYS)) {
      console.log(
        `config: unknown key "${key}". valid keys: ${Object.keys(VALID_KEYS).join(", ")}`,
      );
      return;
    }
    console.log(config[key] ?? "(not set)");
    return;
  }
  if (action === "set") {
    if (!(key in VALID_KEYS)) {
      console.log(
        `config: unknown key "${key}". valid keys: ${Object.keys(VALID_KEYS).join(", ")}`,
      );
      return;
    }
    if (!isValidKey(key, value)) {
      console.log(
        `config: invalid value "${value}" for ${key}. valid values: ${VALID_KEYS[key].join(", ")}`,
      );
      return;
    }
    config[key] = value;
    saveConfig(config);
    console.log(`set ${key} = ${value}`);
    return;
  }
  console.log("usage: config get <key> | config set <key> <value>");
}

function cmdHelp() {
  console.log(
    [
      "ls [-a]        list sub-pages in current page (-a also lists text blocks)",
      "cd <name>      move into a sub-page",
      "cd ..          move up one level",
      "cd / | cd      return to root",
      "pwd            print current path",
      "mkdir <name>   create a new sub-page",
      "open           open the current page in your browser",
      "cat <name>     print text content of a sub-page",
      "findPage <name>  recursively search for a sub-page by name",
      "config get <key>          view a config value",
      "config set <key> <value>  set a config value (e.g. config set applicationType app)",
      "help           show this message",
      "exit | quit    leave the shell",
    ].join("\n"),
  );
}

async function handleLine(line) {
  const parts = tokenize(line.trim());
  if (parts.length === 0) return;
  const [cmd, ...args] = parts;

  try {
    switch (cmd) {
      case "ls":
        await cmdLs(args);
        break;
      case "cd":
        await cmdCd(args);
        break;
      case "pwd":
        console.log(pwdString());
        break;
      case "mkdir":
        await cmdMkdir(args);
        break;
      case "open":
        await cmdOpen(args);
        break;
      case "cat":
        await cmdCat(args);
        break;
      case "findPage":
        await cmdFindPage(args);
        break;
      case "help":
        cmdHelp();
        break;
      case "clear":
      case "cls":
        console.clear();
        break;
      case "config":
        cmdConfig(args);
        break;
      case "exit":
      case "quit":
        rl.close();
        return;
      default:
        console.log(`nsh: command not found: ${cmd} (try 'help')`);
    }
  } catch (err) {
    console.error(`error: ${err.message}`);
  }
}

function tokenize(line) {
  const tokens = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

// This should be in a seperate config file
const NO_ARG_COMPLETE = new Set(["cd", "cat", "find"]);
const ALL_COMMANDS = [
  "ls",
  "cd",
  "pwd",
  "cat",
  "find",
  "mkdir",
  "open",
  "clear",
  "cls",
  "help",
  "exit",
  "quit",
];

function completer(line, callback) {
  const parts = tokenize(line);

  if (parts.length === 0 || (parts.length === 1 && !line.endsWith(" "))) {
    const partial = parts[0] || "";
    const hits = ALL_COMMANDS.filter((c) => c.startsWith(partial));
    return callback(null, [hits, partial]);
  }

  const cmd = parts[0];
  const partial = parts[parts.length - 1];

  if (!NO_ARG_COMPLETE.has(cmd)) {
    return callback(null, [[], partial]);
  }

  listDir(client, cwd().id)
    .then(({ dirs }) => {
      const names = dirs.map((d) => d.title);
      const hits = names.filter((n) =>
        n.toLowerCase().startsWith(partial.toLowerCase()),
      );
      callback(null, [hits, partial]);
    })
    .catch((err) => callback(null, [[], partial]));
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "",
  completer,
});

console.log("notion-shell — type 'help' for commands, 'exit' to quit\n");

function prompt() {
  rl.setPrompt(`nsh:${pwdString()} $ `);
  rl.prompt();
}

rl.on("line", async (line) => {
  await handleLine(line);
  prompt();
});

rl.on("close", () => {
  console.log("\ngoodbye");
  process.exit(0);
});

prompt();
