# Stories

This folder is the project's work tracker. There is no external issue
tracker: every story is a markdown file, and the folder it sits in is its
status.

```
stories/
  todo/   stories not finished yet (including ones in progress)
  done/   finished stories
```

## Rules

- **One file per story**, named `<ID>-<slug>.md`, for example
  `FH6-3-toe-sign-unit-tests.md`.
- **IDs are `FH6-<n>`.** The next ID is the highest number in *either* folder,
  plus one. IDs are never reused, even if a story is deleted or merged.
- **Starting a story:** set `started:` to the date.
- **Finishing a story:**
  1. Set `completed:` to the date.
  2. Make sure `points:` holds the number the team chose.
  3. Move the file with `git mv stories/todo/<file> stories/done/`.

  Commit the move together with the work it records.
- **Splitting a story:** create the children with new IDs, then delete the
  parent or move it to `done/` with a note that it was split into them.
- **No people.** There is no assignee or author field. Stories describe work,
  not who did it (`.assert-iq/governance.md` § 5).
- **Escaped defects** are stories too: `type: bug` with the label `escape`.
  That gives `/estimate-story` and `/analyze-escaped-defect` something to count.
- **Traceability:** code and tests that implement a story cite its ID, as in
  `// qi-trace: FH6-3`.

## Front matter

```yaml
---
id: FH6-0
title: Short imperative title
type: story              # story | bug | chore | spike
labels: [testing]
modules: [client/src/example.ts]   # paths the story touches
depends_on: []           # IDs that must be done first
created: 2026-10-29
started: null
completed: null
points: null             # the team's pick, from inside the estimate range
estimate:                # written by /estimate-story
  id: <uuid in .assert-iq/estimates/archive/>
  date: 2026-10-29
  range: "1-3"
  confidence: medium     # high | medium | low
  verdict: estimable     # estimable | split | refine_first
  anchor: "5cf8628 (1)"
---
```

`points`, `type`, `labels`, `modules`, `started` and `completed` are what
`/estimate-story` reads as delivery history once stories reach `done/`. Keep
them accurate, because they become the anchor for future estimates.

## Body

```markdown
# FH6-0 — Title

As the developer, I want …, so that ….

## Acceptance criteria

- **AC-1** …

## Notes

## Estimate (YYYY-MM-DD)
```

## Listing work

```bash
grep -H '^title:' stories/todo/*.md
```
