import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

export default function Sheet({ title, close, children, busy = false }: { title: string; close: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog?.close(); document.body.style.overflow = before; previous?.focus() }
  }, [])
  return <dialog ref={ref} className="sheet" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) close() }}
    onClick={event => { if (event.target === ref.current && !busy) { const rect = ref.current.getBoundingClientRect(); if (event.clientY < rect.top || event.clientX < rect.left || event.clientX > rect.right) close() } }}>
    <div className="sheet-header"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close" onClick={close} disabled={busy}>×</button></div>
    {children}
  </dialog>
}
