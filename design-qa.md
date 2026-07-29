# Design QA

- shelf visual truth: `/var/folders/_f/01t1d47s1j30tfyrmqst40y00000gn/T/codex-clipboard-560254ba-c072-4524-b321-a741ea6196c3.png`
- collapsed navigator truth: `/var/folders/_f/01t1d47s1j30tfyrmqst40y00000gn/T/codex-clipboard-41f183c7-66a9-42d5-a34e-33348eb2d9b3.png`
- expanded navigator truth: `/var/folders/_f/01t1d47s1j30tfyrmqst40y00000gn/T/codex-clipboard-7f574cca-631f-4fb8-abb9-cfcfafefae14.png`
- implementation: `http://127.0.0.1:5203/_experiences/complete-shelf/`
- implementation screenshot: unavailable; the selected in-app browser has no callable local-page capture binding in this session, after earlier local reload attempts were rejected by its URL policy
- intended state: first WeRead shelf group, centered book, no automatically opened book

## Functional Evidence

- The local preview responds with HTTP 200 at the configured base path.
- The server-rendered shell contains the shelf switcher and no left/right browse-arrow controls.
- The generated catalog contains 97 unique public books across all 13 WeRead archive groups, with no private entries.
- Build, type-check, lint, and all 13 automated tests pass.

## Visual Comparison Evidence

Blocked before implementation capture. The three supplied source references are available, but a same-viewport browser-rendered screenshot cannot be obtained through the selected in-app browser in this session. No pixel-fidelity claim is made from source code or HTTP output.

## Pending Visual Checks

- Compare the close-up book scale, shelf-board thickness, lighting, and crop with the shelf reference.
- Compare the collapsed tick lengths, spacing, opacity, and right inset with the compact navigator reference.
- Compare the expanded panel radius, shadow, row density, active state, and hover bridge with the menu reference.
- Verify the 13-layer rail fits desktop and mobile heights, vertical wheel/swipe changes exactly one layer, and clicking a menu item centers that layer.

## Comparison History

- Pass 1 restored the original close-up continuous-shelf treatment and click-only book opening.
- Pass 2 changed the data model from three category buckets to all 13 WeRead archive groups, added the Notion-like quick navigator, and removed the two large side arrows.
- Pass 2 result is functionally verified but visually blocked before capture by the in-app browser limitation.

final result: blocked
