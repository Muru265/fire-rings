import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import AskPanel from './AskPanel'
import type { DataMode } from '../lib/types'

export default function AskDrawer({ region, question, onClose, mode }: { region: string; question?: string; onClose: () => void; mode?: DataMode }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ask-h">
      <button className="absolute inset-0 bg-black/50" aria-label="Close Ask Fire Rings" onClick={onClose} tabIndex={-1} />
      <aside className="fade-up relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto border-l border-border bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="eyebrow">AI analyst</p>
            <h2 id="ask-h" className="mt-1 font-display text-xl font-bold">Ask Fire Rings</h2>
          </div>
          <button ref={closeRef} onClick={onClose} className="rounded-sm border border-border-strong px-2.5 py-1 text-sm text-muted hover:text-text" aria-label="Close (Esc)">✕</button>
        </div>
        <AskPanel initialRegion={region} initialQuestion={question} compact mode={mode} />
      </aside>
    </div>
  , document.body)
}
