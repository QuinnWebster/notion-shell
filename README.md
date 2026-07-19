# notion-shell (nsh)

A little CLI that lets you browse around your Notion workspace like it's a filesystem. `cd` into pages, `ls` to see what's inside, `mkdir` to create new sub-pages, all from your terminal instead of clicking through Notion's UI.

I made this because I got tired of Notion's page-in-page-out navigation.

## Setup

You'll need Node 18+ and a Notion account.

**1. Clone it and install deps**

**2. Make a Notion integration**

Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new internal integration. Copy the secret it gives you — that's your `NOTION_TOKEN`.

**3. Share a page with your integration**

Open the page you want to use as your root in Notion → ••• menu → Connections → add your integration.

**4. Grab the page ID**

Copy the URL of that page. The page ID is the string of characters at the end, after the last dash, before any ? query params. That's your NOTION_ROOT_PAGE_ID.

**5. Set up your env file**

```bash
cp .env.example .env
```

Then open `.env` and fill in:

```
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_ROOT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**6. Link it so you can just type `nsh` to open the shell**

```bash
npm link
```

This makes the `nsh` command available globally on your machine, pointing back at this folder. You only need to do this once (re-run it if you move the project folder somewhere else).

**7. Run it**

```bash
nsh
```

## Config

`open` needs to know whether to launch pages in your browser or hand off to the Notion desktop app. That's controlled by a small config file at `~/.nshrc.json`, set from inside the shell:

```
config set applicationType web
config set applicationType app
```

Defaults to `web` if you never set it. You can check the current value with:

```
config get applicationType
```

## Why I built this

Honestly, mostly for myself — I live in the terminal for everything else, so having Notion be the one thing I had to alt-tab and click through for felt off. Figured other people who think the same way might find it useful too.

## Roadmap

### TODO

- Better handling of Notion databases (right now they just show up as directories, which isn't quite right)
- Maybe a config file so you can save multiple roots and switch between workspaces
- Add more tests

If you use this and hit something annoying or missing, open an issue and I'll take a look.

## License

MIT — do whatever you want with it.
