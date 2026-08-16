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
      <label className="px-1 text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div
        className={`flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-transparent bg-input/60 p-2 transition-shadow focus-within:ring-2 focus-within:ring-ring ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        {values.map((tag) => (
          <span
            key={tag}
            className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs ${chipClass}`}
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              disabled={disabled}
              className="inline-flex size-6 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 disabled:cursor-not-allowed"
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
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-base text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed sm:text-sm"
        />
      </div>
    </div>
  )
}
