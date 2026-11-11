'use client'

import { useMemo } from 'react'

/**
 * The same reference while the value is unchanged (compared as JSON). A project patch rebuilds the
 * nested objects of the key it writes — e.g. saving a run's result rewrites `simSettings` — and a
 * simulation must not restart for that. Serialises only when the reference changes, never per frame.
 */
export function useByValue<T>(v: T): T {
  const json = useMemo(() => JSON.stringify(v), [v])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => v, [json])
}
