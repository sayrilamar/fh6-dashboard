---
id: FH6-34
title: Ask before recording when a planned change isn't entered on the pre-run card
type: bug
labels: [escape, pre-run, planner]
modules: [client/src/prerun.ts, client/src/components/PreRunTune.tsx, client/src/components/Sessions.tsx, tests/unit]
depends_on: []
created: 2026-10-30
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-34 — Ask before recording when a planned change isn't entered on the pre-run card

As the driver, I want the pre-run card to catch a planned change I made in the
game but didn't type into the card, so that the run isn't recorded at the old
value and the report doesn't repeat a change I already made.

## Why (found 2026-10-30)

Before the 14:34 run of car #1335 (Mazda 787B), the driver set brake balance
61 % in the game, as the report recommended. The card still held 67 % from
the previous run when "Confirm & record" was pressed.
- **The run was saved at 67**, so the next report said "Brake balance
  67 % → 61 %" again.
- **The bisection kept the wrong bracket** (55–67 instead of 55–61).
- **The car had changed:** brake slip moved from 90 % / 21 % to 83 % / 26 %
  (front / rear), exactly what a rearward balance change does.

The card already offers "Apply them" for the planner's changes. Nothing
stops a confirm without them.

## Acceptance criteria

- **AC-1** Pressing "Confirm & record" while any of this run's planned
  changes is not in its box does not record yet. The card asks, listing each
  such change: its label, the value entered and the planned value.
- **AC-2** The question has three answers:
  - **"Yes, I made them"** records the planned values.
  - **"No, record as entered"** records the boxes as they are.
  - **"Back"** returns to the card without recording.
- **AC-3** No question when every planned change is entered, when there are
  none, or for "Skip & record".
- **AC-4** Unit tests cover which planned changes count as not entered.
  Treating an entered change as missing, or a missing one as entered, must
  fail them.
- **AC-5** The 14:34 run's record is corrected to brake balance 61, in both
  the summary and the recording's header.
- **AC-6** Live check on an isolated server: leave a planned change out,
  press "Confirm & record", answer "Yes", and confirm the recording saved the
  planned value.

## Done (2026-10-30)

- **AC-1 / AC-3:** `unenteredChanges()` in `client/src/prerun.ts` lists this
  run's planned changes (not blocked, and with a target on the card) whose
  box doesn't hold the target. An empty or unreadable box counts as not
  entered.
  - **One list:** the pre-run card's "Apply it / Apply them" bar and the
    confirm check use the same list.
  - **The question:** "Confirm & record" with anything on that list replaces
    the footer buttons with "This run's planned change isn't entered here:
    · Brake balance 61 → 58. Did you make it in the game?"
  - **No question** with nothing on the list, or for "Skip & record".
- **AC-2:** the three answers:
  - **"Yes, I made it/them"** records the boxes with the planned values
    filled in.
  - **"No, record as entered"** records the boxes as they are.
  - **"Back"** closes the question without recording.
- **AC-4:** `tests/unit/prerun-confirm.test.ts` has 6 tests. The suite is
  161/161, and the client type-check and build pass. Four mutants each fail a
  test:
  - an entered change counted as missing
  - a missing change counted as entered
  - a change with no target counted
  - an unreadable box read as a number
- **AC-5:** the 14:34 run of car #1335
  (`2026-10-30T19-34-49-484Z`) is corrected from brake balance 67 to 61.
  - **The fix:** both the summary and the recording's `session-meta`
    header. The 3,233 frames are byte-identical, and both originals were
    backed up first.
  - **Evidence:** its brake slip (83 % / 26 %) matches the next run, which
    was correctly saved at 61 (87 % / 26 %), not the 67 % runs before it
    (90 % / 21 %).
  - **Result:** the 14:34 report reviews "Brake balance 67 → 61". The 14:40
    report now offers 61 % → 58 %, "bracketed between 55 and 61".
- **AC-6, live on an isolated server copy:** 22 Mazda summaries and a
  simulator patched to car #1335, in a scratch folder.
  - The card showed the planner bar "Brake balance 61% → 58%" with 61 in the
    box.
  - Confirm & record asked the question, and Back closed it without
    recording.
  - Confirm & record → "Yes, I made it" recorded a run whose tune saved
    `balance: 58`, with the other 32 settings unchanged.
  - No console errors.
- **Also:** change reviews for gearing printed the raw key ("finalDrive
  3.55 → 3.48"). They now say "Final drive"; a gearbox change reads "Gear
  spacing (1st ÷ top)".
- **Gap:** the card's question has no component test (`PreRunTune.tsx` is
  not imported by the suite). Its rule is unit-tested, and the flow was
  checked live. The "No, record as entered" path is the old confirm and
  wasn't re-run live.
