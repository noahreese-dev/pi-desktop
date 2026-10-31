---
name: findings-list
description: Maintain FINDINGS.md, the user's curated list of history findings that carry real weight. Use when a finding is well evidenced and has been discussed, when the user says add that, note that, that's a finding, or asks what we have found so far.
---

# Findings list

`FINDINGS.md` in the workspace is **not a notebook**. A finding goes in only when it passes all three gates:

1. **Weight:** backed by named primary sources at exact locations (or a reviewed research packet), with
   independence checked. Confidence `moderate` or higher, **or** a firmly established negative or `unknown` that took
   real work to establish (for example, "no source within a century of the event mentions it").
2. **Discussed:** you and the user went over it in this conversation or one you can point to (a file in `notes/`,
   a packet in `research/`). Not just something a search returned.
3. **The user says yes:** propose the exact entry text and wait for an OK. Never add silently.

If a finding passes 1 and 2 but the user has not answered, put it under **Candidates** at the bottom and say so in
one line. The user can promote, edit or drop candidates.

## Entry format (one per finding)

```markdown
### <Short plain-language finding>
- **Finding:** one or two sentences, stated at exactly the strength the evidence allows.
- **Class:** documented_historical_event | early_community_belief | historical_inference | theological_affirmation
- **Confidence:** <label> because <one line>.
- **Key sources:** primary (work, location, link) · scholarship (author, work, year, link).
- **Independent routes:** <n> (how counted).
- **Discussed:** <date>, <where: this session / notes file / packet>. **Added:** <date>, approved by the user.
- **Would change if:** <what evidence would move it>.
```

## Housekeeping

- Group entries under topic headings (by period, region or theme: *Roman Empire*, *Medieval England*, *Early Qin
  and Han*, ...).
- If later evidence weakens an entry, do not delete it: add a dated **Revised:** line and propose the change to the
  user.
- Keep `INDEX.md` pointing at the entry.
