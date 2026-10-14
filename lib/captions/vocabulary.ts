"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { DEMO_MODE } from "@/lib/demo";

/** As many terms as Deepgram takes per stream, and the longest a term may be (as the API allows). */
export const MAX_TERMS = 100;
export const MAX_TERM_LENGTH = 60;

/**
 * Terms typed or pasted in: split on commas and new lines, trimmed, each once (ignoring case),
 * added after those already in the list. Anything longer than a term is left out.
 */
export function addTerms(list: string[], typed: string): string[] {
  const out = [...list];
  const seen = new Set(list.map((t) => t.toLowerCase()));
  for (const raw of typed.split(/[,\n]/)) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || t.length > MAX_TERM_LENGTH || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_TERMS);
}

const key = (editionId: string | undefined) => [
  "admin",
  "caption-vocabulary",
  editionId ?? "none",
];

/** An event's caption vocabulary (`GET /captions/vocabulary/:editionId`). */
export function useCaptionVocabulary(editionId: string | undefined) {
  return useQuery({
    queryKey: key(editionId),
    queryFn: () =>
      DEMO_MODE
        ? Promise.resolve(["full product"])
        : api.get<string[]>(`/captions/vocabulary/${editionId}`),
    enabled: Boolean(editionId),
  });
}

/** Replaces an event's caption vocabulary; used from the next session that goes live. */
export function useSetCaptionVocabulary(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (terms: string[]) =>
      DEMO_MODE
        ? Promise.resolve(terms)
        : api.put<string[]>(`/captions/vocabulary/${editionId}`, { terms }),
    onSuccess: (saved) => client.setQueryData(key(editionId), saved),
  });
}
