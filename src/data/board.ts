import type { BoardData } from "react-kanban-kit";

// react-kanban-kit uses a FLAT normalized map: root -> columns -> cards,
// all keyed by id. totalChildrenCount is maintained by us (drives the counts).

export type Label = { text: string; color: string };

export interface CardContent {
  labels?: Label[];
  date?: string;
  description?: string;
  image?: string;
}

// A friendlier nested shape we author by hand, then flatten below.
const columns: {
  id: string;
  title: string;
  cards: { id: string; title: string; content?: CardContent }[];
}[] = [
  {
    id: "todo",
    title: "Todo",
    cards: [
      { id: "c11", title: "Audit competitor onboarding flows" },
      { id: "c12", title: "Draft Q3 design OKRs" },
      { id: "c5", title: "Prioritize design backlog based on business needs" },
    ],
  },
  {
    id: "in-progress",
    title: "In progress",
    cards: [
      {
        id: "c1",
        title: "Update design style guide with new color palette",
        content: { labels: [{ text: "Design", color: "#6ea8fe" }] },
      },
      {
        id: "c2",
        title: "Conduct usability testing for mobile app prototype",
        content: { labels: [{ text: "User Research", color: "#f7826b" }] },
      },
      { id: "c3", title: "Update the fonts from Comic Sans to Inter." },
      { id: "c4", title: "Collaborate with content strategist on product copy" },
    ],
  },
  {
    id: "completed",
    title: "Completed",
    cards: [
      { id: "c9", title: "Prepare assets for developer handoff" },
      { id: "c10", title: "Review design system accessibility guidelines" },
      {
        id: "c6",
        title: "Create a new landing page redesign",
        content: { labels: [{ text: "Design", color: "#6ea8fe" }] },
      },
      {
        id: "c7",
        title: "Update the fonts on the app store screenshots.",
        content: { labels: [{ text: "Marketing", color: "#f7826b" }] },
      },
    ],
  },
];

export const CARD_TYPE = "card";

export function buildBoard(): BoardData {
  const data: BoardData = {
    root: {
      id: "root",
      title: "Root",
      parentId: null,
      children: columns.map((c) => c.id),
      totalChildrenCount: columns.length,
    },
  };

  for (const col of columns) {
    data[col.id] = {
      id: col.id,
      title: col.title,
      parentId: "root",
      children: col.cards.map((c) => c.id),
      totalChildrenCount: col.cards.length,
    };
    for (const card of col.cards) {
      data[card.id] = {
        id: card.id,
        title: card.title,
        parentId: col.id,
        children: [],
        totalChildrenCount: 0,
        type: CARD_TYPE,
        content: card.content ?? {},
      };
    }
  }

  return data;
}

export function totalCards(data: BoardData): number {
  return data.root.children.reduce(
    (sum, colId) => sum + (data[colId]?.children.length ?? 0),
    0
  );
}
