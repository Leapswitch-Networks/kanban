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

export interface ApiCard {
  id: number;
  title: string;
  description: string | null;
  stage: "todo" | "in_progress" | "completed";
}

const columns = [
  { id: "todo", title: "Todo", apiStage: "todo" },
  { id: "in-progress", title: "In progress", apiStage: "in_progress" },
  { id: "completed", title: "Completed", apiStage: "completed" },
] as const;

export const CARD_TYPE = "card";

export function buildBoard(cards: ApiCard[] = []): BoardData {
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
    const columnCards = cards.filter((card) => card.stage === col.apiStage);
    data[col.id] = {
      id: col.id,
      title: col.title,
      parentId: "root",
      children: columnCards.map((card) => `c${card.id}`),
      totalChildrenCount: columnCards.length,
    };
    for (const card of columnCards) {
      data[`c${card.id}`] = {
        id: `c${card.id}`,
        title: card.title,
        parentId: col.id,
        children: [],
        totalChildrenCount: 0,
        type: CARD_TYPE,
        content: { description: card.description ?? "" },
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
