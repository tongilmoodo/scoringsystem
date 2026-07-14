'use client';

import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, getFlagEmoji } from '@/lib/countries';

/** Searchable country combobox backed by the COUNTRIES list. Stores the ISO code. */
export default function CountrySelect({
  value,
  onChange,
  placeholder = 'Country',
}: {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = COUNTRIES.find((c) => c.code === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q)
    : COUNTRIES;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-left"
      >
        {selected ? (
          <span>{getFlagEmoji(selected.code)} {selected.name}</span>
        ) : (
          <span className="text-gray-500">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country..."
            className="sticky top-0 w-full border-b border-gray-700 bg-gray-900 px-3 py-2 outline-none"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-gray-400 hover:bg-gray-800"
            >
              Clear selection
            </button>
          )}
          {filtered.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                onChange(c.code);
                setOpen(false);
                setQuery('');
              }}
              className="block w-full px-3 py-2 text-left hover:bg-gray-800"
            >
              {getFlagEmoji(c.code)} {c.name} <span className="text-gray-500">({c.code})</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-2 text-gray-500">No matches</p>}
        </div>
      )}
    </div>
  );
}
