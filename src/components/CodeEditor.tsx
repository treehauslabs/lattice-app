import { useRef, useCallback } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  error?: string | null
}

export function CodeEditor({ value, onChange, error }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  const lineCount = value.split('\n').length

  const syncScroll = useCallback(() => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const updated = value.substring(0, start) + '  ' + value.substring(end)
      onChange(updated)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col">
      <div className="flex min-h-[420px] max-h-[calc(100vh-340px)]">
        <div
          ref={gutterRef}
          className="select-none text-right pr-3 pl-4 py-4 text-[11px] leading-[1.5rem] text-zinc-600 border-r border-zinc-800/60 bg-zinc-950/80 overflow-hidden flex-shrink-0"
          aria-hidden
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="flex-1 bg-transparent text-zinc-200 text-sm font-mono px-4 py-4 leading-[1.5rem] resize-none outline-none overflow-auto scrollbar-thin"
          style={{ tabSize: 2 }}
        />
      </div>
      <div className={`flex items-center gap-2 px-4 py-2 text-[11px] border-t transition-colors ${
        error
          ? 'border-red-500/20 bg-red-500/5 text-red-400'
          : 'border-zinc-800/60 bg-zinc-900/40 text-emerald-500'
      }`}>
        {error ? (
          <><AlertCircle size={11} /> {error}</>
        ) : (
          <><CheckCircle2 size={11} /> Valid</>
        )}
      </div>
    </div>
  )
}
