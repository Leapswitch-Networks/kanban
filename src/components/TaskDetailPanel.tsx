import { Calendar, Tag, MoreHorizontal, X, MessageSquare } from "lucide-react";
import type { BoardItem } from "react-kanban-kit";
import type { CardContent } from "../data/board";

interface Props {
  card: BoardItem | null;
  onClose: () => void;
}

export function TaskDetailPanel({ card, onClose }: Props) {
  if (!card) return null;
  const content = (card.content ?? {}) as CardContent;
  const date = content.date ?? "Mar, 30, 2024";
  const description = content.description ?? card.title;

  return (
    <div className="detail-panel glass glass--strong" role="dialog" aria-label={card.title}>
      <div className="detail-toolbar">
        <div className="detail-toolbar-left">
          <button className="icon-btn" aria-label="Set date"><Calendar size={16} /></button>
          <button className="icon-btn" aria-label="Add label"><Tag size={16} /></button>
          <button className="icon-btn" aria-label="More"><MoreHorizontal size={16} /></button>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="detail-date">
        <Calendar size={13} />
        <span>{date}</span>
      </div>

      <p className="detail-description">{description}</p>

      <div className="detail-image">
        <img
          src="https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=640&q=80&auto=format&fit=crop"
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>

      <div className="detail-comment">
        <span className="avatar avatar--pink avatar--sm">J</span>
        <div className="comment-input">
          <MessageSquare size={15} />
          <span>Leave a comment</span>
        </div>
      </div>
    </div>
  );
}
