import { toArabicTime } from '../lib/utils'
import { useState } from 'react'

export default function EntryItem({ entry, onReply, isChild = false, highlighted = false, hasChildren = false, childrenCount = 0, children = [] }) {
  const [showChildren, setShowChildren] = useState(false)

  return (
    <>
      <div
        className={`border-border rounded-[var(--radius-sm)] p-3 mb-2 flex flex-col relative transition-colors
          ${isChild ? 'mr-5 border-r-[2px] border-r-divider' : 'mx-4 border-r-[2px]'}
          ${highlighted ? 'bg-bg-elevated' : 'bg-surface'}`}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            {entry.is_open_event && <span className="text-[10px]">🔴</span>}
            {entry.processing_status && entry.processing_status !== 'done' ? (
              <span className="text-[10px] text-text-muted animate-pulse">جاري التحليل...</span>
            ) : (
              <div className="flex gap-1 flex-wrap">
                {entry.tags?.slice(0, 3).map(t => (
                  <span key={t} className="text-[10px] bg-bg-elevated text-text-secondary px-1.5 py-0.5 rounded">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isChild && onReply && (
              <button
                type="button"
                onClick={() => onReply(entry.id, entry.text)}
                className="text-text-muted hover:text-primary transition-colors"
                aria-label="رد على هذا الإدخال"
              >
                <span className="material-symbols-outlined text-[16px]">reply</span>
              </button>
            )}
            <span className="text-[12px] text-text-muted shrink-0">
              {toArabicTime(entry.created_at)}
            </span>
          </div>
        </div>
        <p className="text-sm text-text-primary line-clamp-2">{entry.text}</p>
        {!isChild && hasChildren && (
          <button
            type="button"
            onClick={() => setShowChildren(!showChildren)}
            className="mt-2 text-[12px] text-text-secondary hover:text-primary transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">
              {showChildren ? 'expand_less' : 'expand_more'}
            </span>
            {childrenCount} رد{childrenCount > 1 ? 'ود' : ''}
          </button>
        )}
      </div>
      {showChildren && children.map(child => (
        <EntryItem
          key={child.id}
          entry={child}
          isChild={true}
          onReply={onReply}
          highlighted={highlighted}
        />
      ))}
    </>
  )
}
