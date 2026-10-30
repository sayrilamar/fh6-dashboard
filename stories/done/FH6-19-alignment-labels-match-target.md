---
id: FH6-19
title: Make the alignment, ARB and spring rows label the move to their actual target
type: bug
labels: [escape, tuning-report]
modules: [client/src/handling.ts, client/src/components/Sessions.tsx, tests/unit/handling-move.test.ts]
depends_on: [FH6-2, FH6-17]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate: null        # not run through /estimate-story
---

# FH6-19 — Make the alignment, ARB and spring rows label the move to their actual target

As the driver, I want the change printed beside each target to be the change
to that target, so that I know what to dial in without guessing which of
two numbers is right.

## What happened (escape, found 2026-10-29)

The Alignment, ARB & Springs rows (the `HANDLING_FIELDS.map` render in
`client/src/components/Sessions.tsx`) build the target, the change label, the
hold state and the colour from the symptom's own step, `base + d`. Then they
swap in the planner's bisection target, and the label, hold state and colour
are left behind. On car #634's 6:09 PM run:

| Row | Target shown | Label shown | Real change |
|---|---|---|---|
| Rear · Toe | 0° → −0.3° | −0.1 | −0.3 |
| Front · ARB | 34.3 → 40 | +1.7 | +5.7 |

There are two more defects of the same kind:

- **Spring rows (`pct` mode)** take "hold" from the symptom's delta, not the
  final target. A planned spring move on a row whose own delta is 0 would
  read "hold".
- **ARB rows (step 1)** round every target to a whole number, including holds.
  FH6 ARBs have 0.1 resolution (this tune: 34.3 / 35.3), so a hold on 34.3
  would show "34, −0.3". It is the same phantom move FH6-18 removed from
  Damping. The `handlingTarget()` pre-fill chain rounded the same way.

## Acceptance criteria

- **AC-1** The label, hold state and colour come from the final target, the
  planner's when there is one:
  - Rear toe 0 → −0.3 reads −0.3.
  - Front ARB 34.3 → 40 reads +5.7.
  - Spring rows keep their percentage style.
- **AC-2** A planned move is never labelled "hold". A row with no delta and
  no plan reads "hold" and keeps the driver's value exactly (ARB 34.3 stays
  34.3).
- **AC-3** `abs` rows (toe, camber, caster, ARB) move at FH6's 0.1
  resolution: ARB 34.3 + 2 → 36.3, not 36.
- **AC-4** The row render and `handlingTarget()` share one function, so the
  report and the pre-fill chain can't disagree.
- **AC-5** `npm run test:unit` passes, and putting the old row logic back
  fails the new tests.

## Done (2026-10-29)

- **New `handlingMove(field, current, delta, planned)` in `client/src/handling.ts`.**
  It carries a `qi-trace` marker for FH6-19 and returns the target, label,
  hold state and direction, all derived from the final target (AC-1).
  - **`abs` rows:** a zero delta keeps the value exactly. A real move lands
    on 0.1, within the field's rails (AC-2, AC-3).
  - **`pct` rows:** a planned move too small for a whole percent reads
    "+<1%", never "hold" (AC-2).
  - `r1` was hoisted to module level for this, and `handlingDeltas` is
    unchanged.
- **`client/src/components/Sessions.tsx`:**
  - The row render and `handlingTarget()` both call `handlingMove()` (AC-4).
  - The ARB inputs' `step` is now 0.1, so the browser treats a 34.3 entry as
    valid.
- **`tests/unit/handling-move.test.ts`:** 9 tests built from the 6:09 PM run.
  - Suite: 59/59.
  - With the old row logic put back as a function, 8 of the 9 fail (AC-5).
    The toe-step test passes either way, because toe already rounded to 0.1.
- **Live check, 6:09 PM run:**
  - rear toe → −0.3° labelled −0.3
  - front ARB 34.3 → 40 labelled +5.7
  - rear ARB 35.3 → 29 labelled −6.3
  - camber, caster and springs all read "hold" at their entered values
  - no number on the page shows float noise

### Scope notes

- The Ride Height and Aero rows still take "hold" from the symptom's own
  delta (`held = dd.d === 0`) before swapping in the planner's target. Their
  percentage label is already computed from the final target, so the only
  exposure is a planned move on a row whose own delta is 0, which would read
  "hold". This was not seen on any recorded run and is left as is.
