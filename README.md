# Kanban Glass (visionOS style) — react-kanban-kit

A visionOS / Apple Vision Pro style glassmorphic Kanban board matching the reference mockup,
built on **react-kanban-kit** for the drag-and-drop mechanics with custom CSS for the glass look.

## Run

```bash
npm install
npm run dev
```

Open the printed localhost URL.

## What's from the library vs. custom

- **react-kanban-kit**: columns, cards, card + column drag-and-drop, `dropHandler` reducer,
  counts, structure. Configured entirely through render functions so it doesn't fight the styling.
- **Custom CSS (`src/glass.css`)**: the whole visionOS look — layered frosted glass
  (board → columns → cards), the dark opaque cards that give the design its contrast,
  browser chrome, label pills, avatar stack, home affordance.
- **Custom components**: `TaskDetailPanel` (the floating popover), the card + column-header
  render functions in `App.tsx`, and the flat `BoardData` builder in `src/data/board.ts`.

## Key files

- `src/App.tsx` — browser chrome, board header, `<Kanban>` wiring, card renderer
- `src/data/board.ts` — authors a friendly nested structure and flattens it to the
  library's normalized `BoardData` map (root → columns → cards)
- `src/components/TaskDetailPanel.tsx` — the right-side detail popover
- `src/glass.css` — all the visual design

## Notes worth knowing

- **Background matters.** Glassmorphism only looks good over rich content. Swap the
  `.scene` background image in `glass.css` for your own photo. A gradient fallback is
  included so it never looks flat if the image fails to load.
- **Cards are opaque on purpose.** `backdrop-filter` is expensive and misbehaves inside
  scrolling/transformed containers, so only the board and columns are frosted; cards use a
  solid dark tint. This is what makes the contrast in the mockup work.
- **Virtualization is off** (`virtualization={false}`) to avoid transform/backdrop-filter
  interaction. Turn it back on if you load large columns and test for flicker.
- Click any card to open its detail panel; drag cards between columns.
