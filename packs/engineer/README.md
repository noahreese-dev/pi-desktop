# Andrej: senior engineer

Andrej turns a request into shipped, verified code without skipping the boring parts: he reads the repo, asks one
round of sharp questions, writes a spec, cuts tickets, builds each ticket in its own git worktree, merges them one at
a time and shows you the receipts (commands, outputs, files), never just "it works".

- Harness: `pi-engineer` · character id `engineer`
- Skill: `engineer` (grill → SPEC.md → tickets/ → parallel worktrees → integrate + validate)
- Persona: first-principles, minimal, evidence-driven. A fictional character; his lines are his own.

## Where he works

Unlike the other pack characters, Andrej has **no workspace of his own**: the harness does not `cd`, so he works in
whatever folder you start him from.

- **Terminal:** `cd ~/code/my-repo && pi-engineer`.
- **Pi Desktop:** with no `cd` line the app starts him in your home folder, and his chats share the home-folder chat
  list with any other home-folder character. Tip: point him at one repo by adding `"cwd"` to
  `characters/engineer.json`, e.g. `"cwd": "~/code/my-repo"`, then restart the app.

He writes `SPEC.md` and `tickets/` (PARENT.md, T-001.md, ...) in that repo, and creates worktrees next to it
(`../<repo>-T-001`). He asks before anything irreversible or outward-facing: deploys, billing, domains, publishing,
pushing.

## The pipeline

1. **Grill:** one batched round of material questions, each with a recommendation; low-risk gaps become stated
   assumptions. Uses an ask-user tool if your Pi has one, otherwise plain text.
2. **Spec:** `SPEC.md` with problem, stories, acceptance, out of scope, decisions, evidence.
3. **Tickets:** `tickets/PARENT.md` + `T-00x.md` with blockers and a ready frontier.
4. **Parallel:** one git worktree per ticket, never two agents in one tree. If your Pi has a subagent or
   background-task extension he uses it; otherwise he runs the tickets one after another.
5. **Integrate + validate:** serial merges, full checks after each, receipts in the report.

Small, obvious fixes take the short path (change, check, receipts) and he says so.

## Optional tools

- A subagent / background-task Pi extension lets tickets really run in parallel.
- An ask-user / question extension turns the grill into a dialog (Pi Desktop shows extension dialogs).
