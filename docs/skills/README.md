# Assistant skills for Marten

Instructions an assistant can follow on a schedule against Marten's MCP
server. They use only Marten's own tools, so they work with any assistant that
can connect to a remote MCP server. Connection details are in
[AI connections](../agent-access.md).

| Skill                                     | What it does                                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [marten-cleanup](marten-cleanup/SKILL.md) | Weekly review: merchant names and logos, categories, tags, notes, rules, marking rows reviewed, and optional balance, statement and credit-score snapshots. |

Every skill needs a connection with **Read and edit** access. Choose **While
it's in use** under Keep access so a weekly task does not expire. Each change
is listed under Settings → AI connections → Recent activity with the
connection's name, and values an assistant saves say who saved them.

## Claude

1. Add Marten as a custom connector (Settings → Connectors → Add custom
   connector) with the MCP URL from Marten's Settings → AI connections, then
   sign in and allow editing.
2. Upload the skill: zip the `marten-cleanup` folder and add it under
   Settings → Capabilities → Skills, or place the folder in
   `~/.claude/skills/` for Claude Code.
3. For a schedule, create a scheduled task in Claude (or Cowork) with the
   prompt "Run the marten-cleanup skill" and a weekly cadence.

## ChatGPT

1. Add Marten as a custom connector (developer mode → Connectors → Create)
   with the MCP URL, choose OAuth, sign in and allow editing.
2. Create a scheduled task (Tasks, weekly). Paste the body of
   [SKILL.md](marten-cleanup/SKILL.md) below the frontmatter as the task
   prompt, and select the Marten connector for the task. ChatGPT's own
   balances and credit score can feed the Snapshot section.

## Grok

1. Add a custom MCP connector with the MCP URL. Grok registers itself with
   Marten (dynamic client registration) and sends you to Marten's approval
   screen, where it is labeled **Unverified app**; check the callback host
   before approving.
2. Create an automation (scheduled task) with the SKILL.md body as its
   instructions and the Marten connector enabled.

## Meta Muse

1. In Marten, Settings → AI connections → Access keys → **Create key**, with
   **Read and edit** access. Copy the key; it is shown once.
2. Add a custom connector in Muse with the MCP URL as the server and the
   header `Authorization: Bearer <key>`.
3. Paste the SKILL.md body into the scheduled task prompt.

Assistant menus change often; follow each vendor's current guide for the
exact controls. Real ChatGPT, Claude, Grok and Muse runs of this skill have
not been verified yet (see [verification](../verification.md)).
