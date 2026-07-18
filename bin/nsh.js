#!/usr/bin/env node
require("dotenv").config();

const { exec } = require("child_process");
const readline = require("readline");
const {
  makeClient,
  listDir,
  findChildByName,
  findRecursive,
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

// async function cmdCat(args) {
//   const target = args[0];
//   if (!target) {
//     console.log("usage: cat <page-name>");
//     return;
//   }
//   const match = await findChildByName(client, cwd().id, target);
//   if (!match) {
//     console.log(`cat: no such page: ${target}`);
//     return;
//   }
//   const text = await catPage(client, match.id);
//   console.log(text || "(no text content)");
// }

// async function cmdFind(args) {
//   const target = args[0];
//   if (!target) {
//     console.log("usage: find <page-name>");
//     return;
//   }
//   console.log(`searching from ${pwdString()} ...`);
//   const result = await findRecursive(client, cwd().id, target);
//   if (!result) {
//     console.log(`find: no match for "${target}" within search depth`);
//     return;
//   }
//   console.log(`found: /${result.path.join("/")}`);
//   console.log(`pageId: ${result.id}`);
//   console.log(`url: https://www.notion.so/${result.id.replace(/-/g, "")}`);
// }

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

function cmdOpenWeb() {
  const url = `https://www.notion.so/${cwd().id.replace(/-/g, "")}`;
  console.log(`opening ${pwdString()} ...`);
  openUrl(url);
}

function cmdOpenApp() {
  const url = `notion://www.notion.so/${cwd().id.replace(/-/g, "")}`;
  console.log(`syncing Notion app to ${pwdString()} ...`);
  openUrl(url);
}

function cmdOpen() {
  if (process.env.APPLICATION_TYPE === "app") {
    cmdOpenApp();
  } else if (process.env.APPLICATION_TYPE === "web") {
    cmdOpenWeb();
  } else {
    console.log(
      "APPLICATION_TYPE env var not set. Set it to either 'desktop' or 'web'.",
    );
  }
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
      // "cat <name>     print text content of a sub-page",
      // "find <name>    recursively search for a sub-page by name",
      "help           show this message",
      "exit | quit    leave the shell",
    ].join("\n"),
  );
}

async function handleLine(line) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
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
        cmdOpen();
        break;
      // case "cat":
      //   await cmdCat(args);
      //   break;
      // case "find":
      //   await cmdFind(args);
      //   break;
      case "help":
        cmdHelp();
        break;
      case "clear":
      case "cls":
        console.clear();
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
  const parts = line.trim().split(/\s+/);

  if (parts.length === 1) {
    const partial = parts[0];
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
