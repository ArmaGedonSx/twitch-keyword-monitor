'use client'

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

type TagInputProps = {
  label: string
  placeholder: string
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
  accent?: 'primary' | 'accent'
}

export function TagInput({
  label,
  placeholder,
  values,
  onChange,
  disabled,
  accent = 'primary',
}: TagInputProps) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const parts = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = Array.from(new Set([...values, ...parts]))
    onChange(next)
    setDraft('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  function remove(tag: string) {
    onChange(values.filter((v) => v !== tag))
  }

  const chipClass =
    accent === 'accent'
      ? 'bg-accent/15 text-accent border-accent/30'
      : 'bg-primary/15 text-primary border-primary/30'

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg border border-input bg-input/40 p-2 transition-colors focus-within:border-ring ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        {values.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs ${chipClass}`}
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              disabled={disabled}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 disabled:cursor-not-allowed"
              aria-label={`${tag} eltávolítása`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
          disabled={disabled}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  )
}
