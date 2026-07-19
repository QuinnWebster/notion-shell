const { Client } = require("@notionhq/client");

function makeClient(token) {
  return new Client({ auth: token });
}

/**
 * Fetch ALL children of a block/page, transparently following pagination.
 */
async function listAllChildren(client, blockId) {
  const results = [];
  let cursor = undefined;

  do {
    const response = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return results;
}

/**
 * Split children into "directories" (sub-pages) and "files" (everything else).
 */
async function listDir(client, pageId) {
  const children = await listAllChildren(client, pageId);

  const dirs = [];
  const files = [];

  for (const block of children) {
    if (block.type === "child_page") {
      dirs.push({ id: block.id, title: block.child_page.title });
    } else if (block.type === "child_database") {
      dirs.push({ id: block.id, title: `${block.child_database.title} (db)` });
    } else {
      files.push({ id: block.id, type: block.type, text: blockToText(block) });
    }
  }

  return { dirs, files };
}

/**
 * Find a direct child (dir or file) of pageId matching a name (case-insensitive).
 */
async function findChildByName(client, pageId, name) {
  const { dirs } = await listDir(client, pageId);
  const lower = name.toLowerCase();
  return dirs.find((d) => d.title.toLowerCase() === lower);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    new Array(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[a.length][b.length];
}

async function findPage(
  client,
  startId,
  name,
  maxDepth,
  fuzzy = false,
  visitLimit,
) {
  const lower = name.toLowerCase();
  const stack = [{ id: startId, path: [] }];
  let visited = 0;
  const matches = [];

  while (stack.length > 0) {
    const { id, path } = stack.pop();
    if (path.length >= maxDepth || visited >= visitLimit) continue;

    visited++;
    const { dirs } = await listDir(client, id);

    for (const d of dirs) {
      const newPath = [...path, d.title];

      const title = d.title.toLowerCase();

      const isMatch = fuzzy
        ? levenshtein(title, lower) <=
          Math.max(1, Math.floor(title.length * 0.2))
        : title.includes(lower);

      if (isMatch) {
        matches.push({ id: d.id, path: newPath });
      }

      stack.push({ id: d.id, path: newPath });
    }
  }

  return matches;
}

/** Extract plain text from a block's rich_text array, if it has one. */
function blockToText(block) {
  const richTextField = block[block.type];
  if (!richTextField || !Array.isArray(richTextField.rich_text)) {
    if (block.type === "code" && richTextField?.rich_text) {
      return richTextField.rich_text.map((t) => t.plain_text).join("");
    }
    return `[${block.type}]`;
  }
  const text = richTextField.rich_text.map((t) => t.plain_text).join("");
  return text || `[${block.type}]`;
}

/** Render all text-bearing children of a page as a readable "cat" dump. */
async function catPage(client, pageId) {
  const children = await listAllChildren(client, pageId);
  const lines = [];

  for (const block of children) {
    switch (block.type) {
      case "heading_1":
        lines.push(`# ${blockToText(block)}`);
        break;
      case "heading_2":
        lines.push(`## ${blockToText(block)}`);
        break;
      case "heading_3":
        lines.push(`### ${blockToText(block)}`);
        break;
      case "bulleted_list_item":
        lines.push(`- ${blockToText(block)}`);
        break;
      case "numbered_list_item":
        lines.push(`1. ${blockToText(block)}`);
        break;
      case "to_do":
        lines.push(
          `[${block.to_do.checked ? "x" : " "}] ${blockToText(block)}`,
        );
        break;
      case "quote":
        lines.push(`> ${blockToText(block)}`);
        break;
      case "code":
        lines.push("```");
        lines.push(blockToText(block));
        lines.push("```");
        break;
      case "paragraph":
        lines.push(blockToText(block));
        break;
      case "child_page":
        lines.push(`[dir] ${block.child_page.title}`);
        break;
      default:
        lines.push(`[${block.type}]`);
    }
  }

  return lines.join("\n");
}

/** Create a new sub-page (Notion "directory") under pageId. */
async function createChildPage(client, pageId, title) {
  const page = await client.pages.create({
    parent: { page_id: pageId },
    properties: {
      title: {
        title: [{ text: { content: title } }],
      },
    },
  });
  return { id: page.id, title };
}

module.exports = {
  makeClient,
  listDir,
  findChildByName,
  // findRecursive,
  findPage,
  catPage,
  createChildPage,
};
