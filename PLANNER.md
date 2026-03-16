# Planner Spec

## Goal

Build and rebuild the future schedule from one atomic planning transaction per user/runtime event.
The planner should:

- preserve immutable history and protected future blocks
- allocate work using deadline sections and required-share scoring
- materialize work chunks and rest only after section allocation
- use fit mode to salvage boundary-constrained dead regions
- warn only after the packed schedule is known

## Immutable Prefix

These blocks are off-bounds during a rebuild:

- blocks entirely in the past
- the current active or paused block
- manual future blocks
- completed or skipped blocks
- fixed template blocks such as sleep and recurring fixed events

Future scheduled template/planner work and break blocks are deletable and regenerated.

## Sections

Let deadlines be `d1 < d2 < ... < dk`. Add a pseudo-deadline `H` for undated work.

Sections are:

- `S1 = [now, d1)`
- `S2 = [d1, d2)`
- ...
- `S{k+1} = [dk, H)`

Each section tracks:

- immutable boundaries split into free windows
- scoring work capacity

Scoring work capacity is derived from free wall-clock minutes using the default work/break ratio.
This is used only for allocation pressure, not as a hard packing limit.

## Task Pressure

For a task with deadline `dj`:

- `eligible_capacity = cumulative scoring capacity up to dj - total estimated minutes of earlier-deadline tasks`
- `required_share = estimated_minutes / max(eligible_capacity, 1)`

Tasks are ordered by:

1. priority
2. required share
3. earlier deadline
4. stable original order

If earlier-deadline work already exceeds cumulative capacity, the planner records a theoretical overflow warning but still produces a best-effort schedule.

## Allocation

Tasks are first assigned to deadline sections.

- work due in section `Sj` is placed in `Sj` first
- overflow spills backward into earlier sections
- no-deadline tasks spill into the pseudo-deadline section and earlier leftover capacity

This produces per-task allocated minutes for each section.

## Integrated Section Packing

Section packing is one integrated step:

1. take the next task from the main ordering list
2. place its next chunk if it fits the current free window
3. add mandatory minimum break after the chunk when possible
4. accumulate preferred ratio-rest demand as a soft target
5. if the next main-list chunk does not fit, switch to fit mode

### Chunking

Allocated minutes are split into the minimum number of near-equal chunks under the maximum work block length.

Example:

- 100 minutes with a 90 minute max becomes `50 + 50`

### Rest

- minimum rest is hard
- ratio-based rest is soft/compressible
- leftover free time inside a window becomes planner break/slack

If even minimum rest prevents packing, the planner raises a packing overflow warning.
If only preferred ratio-rest is compressed, the planner raises a softer warning.

## Fit Mode

Fit mode exists only to fill dead regions created by immutable boundaries.

- consider only remaining unmapped chunks in the section
- sort by priority first, then chunk length from longest to shortest
- place the first chunk that fits
- repeat until nothing fits

This keeps high-priority work preferred while still salvaging otherwise dead pockets of time.

## Diff Model

The planner should be treated as the canonical future plan generator.
Over time, frontend/UI layers can use planner output to compute semantic diffs such as:

- insert block
- delete block
- move block
- resize block
- split task across multiple chunks
- compress preferred rest

The current backend implementation already persists regenerated planner blocks and warnings from a single rebuild transaction.

## Runtime Adjustments

Short runtime actions do not immediately trigger a full rebuild.

- extending the current block first borrows time from future planner rest up to the next immutable boundary
- completing early first donates reclaimed time into future rest, capped by the configured rest multiplier
- pausing borrows from the immediately following rest first, then proportionally from later rest before the next immutable boundary
- overdue work blocks raise a decision prompt instead of auto-completing immediately
- if the user does nothing, overdue work passively consumes available rest until the next work block takes over
- if the user explicitly continues, elapsed overtime is treated the same as an extension and can trigger a planner rebuild if local rest is exhausted

These adjustments never shrink a rest block below the configured minimum rest.

If local rest adjustment cannot satisfy the change cleanly, the backend falls back to a planner rebuild with the current block preserved.

## Emergency Blocks

Emergency blocks are explicit manual interruptions with their own source type.

- they are capped by a user preference
- they trigger a rebuild of future planner blocks around the emergency window
- process enforcement stays active during the emergency block, except for the configured emergency app allowlist
