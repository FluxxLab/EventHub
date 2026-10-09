'use client';

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { DEMO_MODE } from "../demo";
import type {Session, Speaker} from "../programme/programme";


/**
 * Who speaks into microphone in a session (`PUT /sessions/:id/mics`) one of the sesion's
 * speakers, or a label such as "Audience". Mic numbers are the sound desk's chanels for the room
 */
export type SessionMic = {mic: number; speakerId: string | null; label: string | null};

/**
 * the most chanels a sound desk can offer a room, as the API alloes.
 */
export const MAX_MICS = 32;

/**
 * The label  offered for the audience handhwld mic
 */
export const AUDIENCE = 'Audience';

/**
 * The namea mic carries in captions: its speaker's, else its label, else "Mic 3. "
 */
export function micName(mic: SessionMic | undefined, speakers: Pick<Speaker, 'id' | 'name'>[], number: number): string {

    const speaker = mic?.speakerId ? speakers.find((s) => s.id === mic.speakerId) : undefined;
   return speaker?.name ?? mic?.label ?? `Mic ${number}`;
};


/**
 * the next free mic number afer those in use(1 when none).
 */
export const nextMic = (mics: Pick<SessionMic, 'mic'>[]) => {
    for (let n = 1; n <= MAX_MICS; n++) if (!mics.some((m) => m.mic === n)) return n;
    return null;
}

/**
 * Saves a session's mics to the API; the edition's programme refresshed with them.
 */
export function useSetSessionMics(editionId: string | undefined){
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ sessionId, mics}:{sessionId: string; mics: SessionMic[]} ) =>
            DEMO_MODE ? Promise.resolve(mics) : api.put<SessionMic[]>(`/sessions/${sessionId}/mics`, {mics}),
        onSuccess: (saved, {sessionId}) => {
            client.setQueryData<Session[]>(['admin', 'session',  editionId ?? 'none'], (was) => was?.map((s) => (s.id === sessionId ? {...s, mics: saved} : s)))
        },
    });
}