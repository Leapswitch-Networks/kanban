import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Kanban, dropHandler } from "react-kanban-kit";
import type { BoardData, BoardItem } from "react-kanban-kit";
import Editor from "react-simple-wysiwyg";
import type { ContentEditableEvent } from "react-simple-wysiwyg";
import { Search } from "lucide-react";
import { buildBoard, CARD_TYPE } from "./data/board";
import type { CardContent } from "./data/board";
import namesData from "./data/namesData.json";
import "./glass.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Polls the FastAPI health endpoint; true only while it responds OK.
function htmlToText(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent?.trim() ?? "";
}

function getApiCardId(cardId: string | number) {
  const numericId = Number(String(cardId).replace(/^c/, ""));
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

function getApiStage(columnId: string | number) {
  return String(columnId).replaceAll("-", "_");
}

function fuzzyMatches(name: string, query: string) {
  const normalizedName = name.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return false;
  if (normalizedName.includes(normalizedQuery)) return true;

  let queryIndex = 0;
  for (const char of normalizedName) {
    if (char === normalizedQuery[queryIndex]) queryIndex += 1;
    if (queryIndex === normalizedQuery.length) return true;
  }
  return false;
}

function useApiHealth(intervalMs = 5000) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;

    const check = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(`${API_URL}/api/health`, { signal: controller.signal });
        if (active) setConnected(res.ok);
      } catch {
        if (active) setConnected(false);
      } finally {
        clearTimeout(timer);
      }
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return connected;
}

export default function App() {
  const [data, setData] = useState<BoardData>(() => buildBoard());
  const [selected, setSelected] = useState<BoardItem | null>(null);
  const [newCardColumnId, setNewCardColumnId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const memberSearchRef = useRef<HTMLDivElement | null>(null);
  const apiConnected = useApiHealth();
  const isEditingCard = selected !== null || newCardColumnId !== null;
  const memberSuggestions = useMemo(
    () => namesData.filter((name) => fuzzyMatches(name, memberSearch)).slice(0, 6),
    [memberSearch]
  );

  useEffect(() => {
    const closeSuggestions = (event: PointerEvent) => {
      if (!memberSearchRef.current?.contains(event.target as Node)) {
        setShowMemberSuggestions(false);
        setActiveSuggestionIndex(-1);
      }
    };

    document.addEventListener("pointerdown", closeSuggestions);
    return () => document.removeEventListener("pointerdown", closeSuggestions);
  }, []);


  useEffect(() => {
    const lists = document.querySelectorAll<HTMLElement>(".rkk-glass .rkk-column-content-list");
    const cleanup: (() => void)[] = [];

    data.root.children.forEach((columnId, index) => {
      const list = lists[index];
      const column = data[columnId];
      if (!list || !column) return;
      let scrollTimer: ReturnType<typeof window.setTimeout> | undefined;
      const showScrollbarWhileScrolling = () => {
        list.classList.add("is-scrolling");
        if (scrollTimer) window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => list.classList.remove("is-scrolling"), 900);
      };

      list.tabIndex = 0;
      list.setAttribute("role", "region");
      list.setAttribute("aria-label", `Scrollable ${column.title} column cards`);
      list.addEventListener("scroll", showScrollbarWhileScrolling, { passive: true });
      cleanup.push(() => {
        if (scrollTimer) window.clearTimeout(scrollTimer);
        list.classList.remove("is-scrolling");
        list.removeEventListener("scroll", showScrollbarWhileScrolling);
      });
    });

    return () => cleanup.forEach((cleanupList) => cleanupList());
  }, [data]);

  const closeTaskEditor = () => {
    setSelected(null);
    setNewCardColumnId(null);
    setSaveError("");
  };

  const openTaskEditor = (card: BoardItem) => {
    const content = (card.content ?? {}) as CardContent;
    setSelected(card);
    setNewCardColumnId(null);
    setEditorTitle(card.title);
    setEditorDescription(content.description ?? "");
    setSaveError("");
  };

  const openNewTaskEditor = (columnId: string | number) => {
    setSelected(null);
    setNewCardColumnId(String(columnId));
    setEditorTitle("");
    setEditorDescription("");
    setSaveError("");
  };

  const saveTaskEditor = async () => {
    if (isSavingTask) return;
    const title = htmlToText(editorTitle);
    if (!title) {
      setSaveError("Please enter a task title before saving.");
      return;
    }

    setIsSavingTask(true);
    setSaveError("");

    try {
      if (newCardColumnId) {
        const response = await fetch(`${API_URL}/api/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: editorDescription,
            stage: getApiStage(newCardColumnId),
          }),
        });
        if (!response.ok) throw new Error(`Create failed with status ${response.status}`);
        const createdCard = (await response.json()) as { id: number; title: string; description: string | null };
        const cardId = `c${createdCard.id}`;

        setData((currentData) => {
          const column = currentData[newCardColumnId];
          return {
            ...currentData,
            [newCardColumnId]: {
              ...column,
              children: [...column.children, cardId],
              totalChildrenCount: column.totalChildrenCount + 1,
            },
            [cardId]: {
              id: cardId,
              title: createdCard.title,
              parentId: newCardColumnId,
              children: [],
              totalChildrenCount: 0,
              type: CARD_TYPE,
              content: { description: createdCard.description ?? "" },
            },
          };
        });
        closeTaskEditor();
        return;
      }

      if (!selected) return;
      const apiCardId = getApiCardId(selected.id);
      if (!apiCardId) {
        setSaveError("This card cannot be saved because it does not have a database id.");
        return;
      }

      const response = await fetch(`${API_URL}/api/cards/${apiCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: editorDescription }),
      });
      if (!response.ok) throw new Error(`Save failed with status ${response.status}`);

      setData((currentData) => {
        const currentCard = currentData[selected.id];
        const content = (currentCard.content ?? {}) as CardContent;
        return {
          ...currentData,
          [selected.id]: {
            ...currentCard,
            title,
            content: { ...content, description: editorDescription },
          },
        };
      });
      closeTaskEditor();
    } catch {
      setSaveError("Could not save this card to the API. Please check the backend connection.");
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleMemberSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showMemberSuggestions || memberSuggestions.length === 0) {
      if (event.key === "ArrowDown" && memberSuggestions.length > 0) {
        event.preventDefault();
        setShowMemberSuggestions(true);
        setActiveSuggestionIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((index) => (index + 1) % memberSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((index) =>
        index <= 0 ? memberSuggestions.length - 1 : index - 1
      );
    } else if (
      event.key === "Enter" &&
      activeSuggestionIndex >= 0 &&
      activeSuggestionIndex < memberSuggestions.length
    ) {
      event.preventDefault();
      setMemberSearch(memberSuggestions[activeSuggestionIndex]);
      setShowMemberSuggestions(false);
      setActiveSuggestionIndex(-1);
    } else if (event.key === "Escape") {
      setShowMemberSuggestions(false);
      setActiveSuggestionIndex(-1);
    }
  };

  const configMap = useMemo(
    () => ({
      [CARD_TYPE]: {
        isDraggable: true,
        render: ({ data: card }: { data: BoardItem }) => {
          const content = (card.content ?? {}) as CardContent;
          return (
            <div className="kanban-card" role="link" aria-label={`Open ${card.title}`}>
              <p className="kanban-card-title">{card.title}</p>
              {content.labels && content.labels.length > 0 && (
                <div className="kanban-card-labels">
                  {content.labels.map((l) => (
                    <span className="label" key={l.text}>
                      <span className="label-dot" style={{ background: l.color }} />
                      {l.text}
                    </span>
                  ))}
                </div>
              )}
              {content.date && (
                <div className="kanban-card-date">
                  <span className="cal-glyph" />
                  {content.date}
                </div>
              )}
            </div>
          );
        },
      },
    }),
    []
  );

  return (
    <div className="scene">
      {!isEditingCard && (
        <div className="search-container">
          <div className="member-search-wrap" ref={memberSearchRef}>
            <div className="board-search">
              <Search size={17} className="board-search-icon" />
              <input
                className="board-search-input"
                type="search"
                placeholder="Search members"
                aria-label="Search members"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                name="member-search"
                value={memberSearch}
                onChange={(event) => {
                  setMemberSearch(event.target.value);
                  setShowMemberSuggestions(true);
                  setActiveSuggestionIndex(-1);
                }}
                onFocus={() => setShowMemberSuggestions(true)}
                onKeyDown={handleMemberSearchKeyDown}
                aria-autocomplete="list"
                aria-controls="member-search-suggestions"
                aria-expanded={showMemberSuggestions && memberSuggestions.length > 0}
                aria-activedescendant={
                  activeSuggestionIndex >= 0 && activeSuggestionIndex < memberSuggestions.length
                    ? `member-suggestion-${activeSuggestionIndex}`
                    : undefined
                }
              />
            </div>
            {showMemberSuggestions && memberSuggestions.length > 0 && (
              <div
                id="member-search-suggestions"
                className="member-suggestions glass glass--strong"
                role="listbox"
                aria-label="Member suggestions"
              >
                {memberSuggestions.map((name, index) => (
                  <button
                    id={`member-suggestion-${index}`}
                    type="button"
                    className={`member-suggestion ${index === activeSuggestionIndex ? "member-suggestion--active" : ""}`}
                    key={name}
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    onClick={() => {
                      setMemberSearch(name);
                      setShowMemberSuggestions(false);
                      setActiveSuggestionIndex(-1);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`board glass glass--medium ${isEditingCard ? "board--editor" : ""}`}>
        {isEditingCard ? (
          <div className="task-editor-screen">
            <div className="task-editor-header">
              <button
                className="task-editor-back"
                type="button"
                onClick={closeTaskEditor}
                disabled={isSavingTask}
              >
                Back to board
              </button>
            </div>

            <div className="task-editor-field">
              <label className="task-editor-label" htmlFor="task-title-editor">
                Task Title
              </label>
              <Editor
                id="task-title-editor"
                className="task-editor task-editor--title"
                value={editorTitle}
                placeholder="Enter task title"
                onChange={(event: ContentEditableEvent) => setEditorTitle(event.target.value)}
              />
            </div>

            <div className="task-editor-field">
              <label className="task-editor-label" htmlFor="task-description-editor">
                Task Description
              </label>
              <Editor
                id="task-description-editor"
                className="task-editor task-editor--description"
                value={editorDescription}
                placeholder="Enter task description"
                onChange={(event: ContentEditableEvent) =>
                  setEditorDescription(event.target.value)
                }
              />
            </div>

            {saveError && <p className="task-editor-error">{saveError}</p>}

            <div className="task-editor-actions">
              <button
                className="task-editor-save"
                type="button"
                onClick={saveTaskEditor}
                disabled={isSavingTask}
              >
                {isSavingTask ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="board-body">
            <Kanban
              dataSource={data}
              configMap={configMap}
              virtualization={false}
              cardsGap={12}
              rootClassName="rkk-glass"
              onCardClick={(_e, card) => openTaskEditor(card as BoardItem)}
              onCardMove={(move) =>
                setData((d) =>
                  dropHandler(
                    move,
                    d,
                    () => {},
                    (target) => ({ ...target, totalChildrenCount: target.totalChildrenCount + 1 }),
                    (source) => ({ ...source, totalChildrenCount: source.totalChildrenCount - 1 })
                  )
                )
              }
              allowListFooter={() => true}
              renderListFooter={(column) => (
                <button
                  className="column-add-card"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openNewTaskEditor(column.id);
                  }}
                >
                  Add Task
                </button>
              )}
              renderColumnHeader={(column) => (
                <div className="column-header">
                  <span className="column-title">{column.title}</span>
                  <span className="column-count">{column.children.length}</span>
                </div>
              )}
            />
          </div>
        )}
      </div>

      <div className="api-status-container">
        <div
          className={`api-status ${apiConnected ? "api-status--online" : "api-status--offline"}`}
          title={apiConnected ? "Connected to API" : "API unreachable"}
        >
          <span className="api-status-dot" />
          <span className="api-status-label">{apiConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

    </div>
  );
}
