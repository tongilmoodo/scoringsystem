'use client';

import { useCallback, useEffect, useState } from 'react';

export const SUPPORTED = ['en', 'sw', 'fr', 'es'] as const;
export type Lang = (typeof SUPPORTED)[number];

// Static base dictionaries for common labels. Anything missing is translated
// dynamically with Gemini via /api/translate and cached in localStorage.
const DICTS: Record<Lang, Record<string, string>> = {
  en: {},
  sw: {
    Court: 'Uwanja',
    Match: 'Pambano',
    'No active match': 'Hakuna pambano linaloendelea',
    Fouls: 'Makosa',
    Start: 'Anza',
    Pause: 'Simamisha',
    Reset: 'Weka upya',
    'End Match': 'Maliza Pambano',
    Undo: 'Tendua',
    Lock: 'Funga',
    'Blue Wins': 'Bluu Ameshinda',
    'Red Wins': 'Nyekundu Ameshinda',
    Cancel: 'Ghairi',
    Online: 'Mtandaoni',
    Offline: 'Nje ya mtandao',
    LOCKED: 'IMEFUNGWA',
    'Last actions': 'Vitendo vya mwisho',
    'No actions yet': 'Hakuna vitendo bado',
    Foul: 'Kosa',
  },
  fr: {
    Court: 'Terrain',
    Match: 'Match',
    'No active match': 'Aucun match en cours',
    Fouls: 'Fautes',
    Start: 'D\u00e9marrer',
    Pause: 'Pause',
    Reset: 'R\u00e9initialiser',
    'End Match': 'Terminer le match',
    Undo: 'Annuler',
    Lock: 'Verrouiller',
    'Blue Wins': 'Victoire Bleu',
    'Red Wins': 'Victoire Rouge',
    Cancel: 'Annuler',
    Online: 'En ligne',
    Offline: 'Hors ligne',
    LOCKED: 'VERROUILL\u00c9',
    'Last actions': 'Derni\u00e8res actions',
    'No actions yet': 'Aucune action',
    Foul: 'Faute',
  },
  es: {
    Court: 'Cancha',
    Match: 'Combate',
    'No active match': 'Sin combate activo',
    Fouls: 'Faltas',
    Start: 'Iniciar',
    Pause: 'Pausa',
    Reset: 'Reiniciar',
    'End Match': 'Finalizar combate',
    Undo: 'Deshacer',
    Lock: 'Bloquear',
    'Blue Wins': 'Gana Azul',
    'Red Wins': 'Gana Rojo',
    Cancel: 'Cancelar',
    Online: 'En l\u00ednea',
    Offline: 'Sin conexi\u00f3n',
    LOCKED: 'BLOQUEADO',
    'Last actions': '\u00daltimas acciones',
    'No actions yet': 'Sin acciones a\u00fan',
    Foul: 'Falta',
  },
};

export function useTranslation(labels: string[] = []) {
  const [lang, setLang] = useState<Lang>('en');
  const [dynamic, setDynamic] = useState<Record<string, string>>({});

  // Detect browser language on mount.
  useEffect(() => {
    const detected = navigator.language.slice(0, 2) as Lang;
    if (SUPPORTED.includes(detected)) setLang(detected);
  }, []);

  // Translate labels missing from the static dictionary via Gemini.
  useEffect(() => {
    if (lang === 'en' || labels.length === 0) return;
    const missing = labels.filter((s) => !DICTS[lang][s]);
    if (missing.length === 0) return;
    const cacheKey = `i18n:${lang}`;
    let cached: Record<string, string> = {};
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey) ?? '{}');
    } catch {
      /* ignore */
    }
    const still = missing.filter((s) => !cached[s]);
    if (still.length === 0) {
      setDynamic(cached);
      return;
    }
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: still, lang }),
    })
      .then((r) => (r.ok ? r.json() : { translations: {} }))
      .then(({ translations }) => {
        const merged = { ...cached, ...(translations ?? {}) };
        localStorage.setItem(cacheKey, JSON.stringify(merged));
        setDynamic(merged);
      })
      .catch(() => setDynamic(cached));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const t = useCallback((s: string) => DICTS[lang][s] ?? dynamic[s] ?? s, [lang, dynamic]);

  return { t, lang };
}
