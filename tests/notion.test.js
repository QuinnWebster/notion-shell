const { listDir, findChildByName, createChildPage } = require("../lib/notion");

/**
 * Build a fake Notion client whose blocks.children.list paginates
 * through the given pages of blocks.
 */
function makeFakeClient(pages) {
  let call = 0;
  return {
    blocks: {
      children: {
        list: jest.fn(async () => {
          const page = pages[call];
          call += 1;
          return page;
        }),
      },
    },
    pages: {
      create: jest.fn(async ({ parent, properties }) => ({
        id: "new-page-id",
        parent,
        properties,
      })),
    },
  };
}

describe("listDir", () => {
  test("splits child_page/child_database into dirs, everything else into files", async () => {
    const client = makeFakeClient([
      {
        has_more: false,
        next_cursor: null,
        results: [
          { id: "1", type: "child_page", child_page: { title: "Projects" } },
          {
            id: "2",
            type: "child_database",
            child_database: { title: "Tasks" },
          },
          {
            id: "3",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "Hello world" }] },
          },
        ],
      },
    ]);

    const { dirs, files } = await listDir(client, "root");

    expect(dirs).toEqual([
      { id: "1", title: "Projects" },
      { id: "2", title: "Tasks (db)" },
    ]);
    expect(files).toHaveLength(1);
    expect(files[0].text).toBe("Hello world");
  });

  test("follows pagination across multiple pages", async () => {
    const client = makeFakeClient([
      {
        has_more: true,
        next_cursor: "cursor-1",
        results: [
          { id: "1", type: "child_page", child_page: { title: "Page A" } },
        ],
      },
      {
        has_more: false,
        next_cursor: null,
        results: [
          { id: "2", type: "child_page", child_page: { title: "Page B" } },
        ],
      },
    ]);

    const { dirs } = await listDir(client, "root");

    expect(client.blocks.children.list).toHaveBeenCalledTimes(2);
    expect(dirs.map((d) => d.title)).toEqual(["Page A", "Page B"]);
  });

  test("falls back to a [type] placeholder for blocks with no rich_text", async () => {
    const client = makeFakeClient([
      {
        has_more: false,
        next_cursor: null,
        results: [{ id: "1", type: "divider", divider: {} }],
      },
    ]);

    const { files } = await listDir(client, "root");
    expect(files[0].text).toBe("[divider]");
  });
});

describe("findChildByName", () => {
  test("matches case-insensitively", async () => {
    const client = makeFakeClient([
      {
        has_more: false,
        next_cursor: null,
        results: [
          { id: "1", type: "child_page", child_page: { title: "Roadmap" } },
        ],
      },
    ]);

    const match = await findChildByName(client, "root", "ROADMAP");
    expect(match).toEqual({ id: "1", title: "Roadmap" });
  });

  test("returns undefined when nothing matches", async () => {
    const client = makeFakeClient([
      { has_more: false, next_cursor: null, results: [] },
    ]);

    const match = await findChildByName(client, "root", "Nope");
    expect(match).toBeUndefined();
  });
});

describe("createChildPage", () => {
  test("sends the correct parent and title payload", async () => {
    const client = makeFakeClient([]);

    const page = await createChildPage(client, "parent-id", "New Folder");

    expect(client.pages.create).toHaveBeenCalledWith({
      parent: { page_id: "parent-id" },
      properties: {
        title: { title: [{ text: { content: "New Folder" } }] },
      },
    });
    expect(page).toEqual({ id: "new-page-id", title: "New Folder" });
  });
});
