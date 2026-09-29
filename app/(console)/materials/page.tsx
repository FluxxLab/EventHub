'use client';

import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentTextIcon,
  FilmIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  NewspaperIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PlusIcon,
  PresentationChartBarIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { MaterialDialog } from '@/components/materials/material-dialog';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toaster';
import { Tooltip } from '@/components/ui/tooltip';
import type { HeroIcon } from '@/lib/nav';
import { runsEvents, useSession } from '@/lib/auth/session';
import { useEditions } from '@/lib/events/use-editions';
import { KIND_LABEL, moveMaterial, sourceLabel, type Material, type MaterialKind } from '@/lib/materials/materials';
import { useMaterialActions, useMaterials } from '@/lib/materials/use-materials';
import type { Session } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const KIND_ICON: Record<MaterialKind, HeroIcon> = {
  slides: PresentationChartBarIcon,
  paper: DocumentTextIcon,
  communique: NewspaperIcon,
  recording: FilmIcon,
  link: LinkIcon,
  other: PaperClipIcon,
};

function MaterialRow({
  material,
  first,
  last,
  onMove,
  onEdit,
  onDelete,
}: {
  material: Material;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = KIND_ICON[material.kind];
  return (
    <li className="group flex items-center gap-4 px-6 py-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft/60 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <a href={material.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[15px] text-ink hover:text-primary hover:underline">
          <span className="line-clamp-2 sm:truncate">{material.title}</span>
          <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0 text-[#7c7c7c]" />
        </a>
        <p className="truncate text-xs text-[#7c7c7c]">
          {KIND_LABEL[material.kind]} · {sourceLabel(material.url)}
          {material.sizeLabel && ` · ${material.sizeLabel}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <div className="mr-1 flex flex-col opacity-40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label={`Move “${material.title}” up`} className="rounded p-0.5 text-[#525252] hover:text-ink disabled:opacity-30">
            <ChevronUpIcon className="size-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={`Move “${material.title}” down`} className="rounded p-0.5 text-[#525252] hover:text-ink disabled:opacity-30">
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
        <Tooltip label="Edit"><button type="button" onClick={onEdit} aria-label={`Edit “${material.title}”`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
          <PencilSquareIcon className="size-4" />
        </button></Tooltip>
        <Tooltip label="Remove"><button
          type="button"
          onClick={onDelete}
          aria-label={`Remove “${material.title}”`}
         
          className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}
        >
          <TrashIcon className="size-4" />
        </button></Tooltip>
      </div>
    </li>
  );
}

function SessionMaterials({ session, canUpload }: { session: Session; canUpload: boolean }) {
  const materials = useMaterials(session.id);
  const [progress, setProgress] = useState<number | null>(null);
  const { save, remove, reorder } = useMaterialActions(session.id, setProgress);
  const toast = useToast();
  const [editing, setEditing] = useState<{ material: Material | null } | null>(null);
  const [removing, setRemoving] = useState<Material | null>(null);
  const list = materials.data ?? [];

  return (
    <section aria-labelledby="session-title" className={cn(cardClass, 'flex flex-col')}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 id="session-title" className="text-lg text-ink">
            {session.title}
          </h2>
          <p className="text-sm text-[#7c7c7c]">
            Day {session.day} · {hm(session.startsAt)}–{hm(session.endsAt)} · {session.room}
          </p>
        </div>
        <button type="button" onClick={() => setEditing({ material: null })} className={buttonClass({ className: 'h-9' })}>
          <PlusIcon className="size-4" />
          Add material
        </button>
      </header>

      {materials.isPending ? (
        <div className="flex flex-col gap-3 p-6">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : materials.isError && !materials.data ? (
        <p role="alert" className="p-6 text-sm text-danger">
          {materials.error.message}
        </p>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <PaperClipIcon className="size-8 text-[#7c7c7c]" />
          <p className="max-w-sm text-sm text-[#7c7c7c]">Nothing attached yet. Add the slides, a paper or the recording, and delegates find them on the session in the app.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((m, i) => (
            <MaterialRow
              key={m.id}
              material={m}
              first={i === 0}
              last={i === list.length - 1}
              onMove={(direction) => reorder.mutate(moveMaterial(list, m.id, direction), { onError: (e) => toast.push({ title: 'Order not saved', body: e.message }) })}
              onEdit={() => setEditing({ material: m })}
              onDelete={() => setRemoving(m)}
            />
          ))}
        </ul>
      )}

      <MaterialDialog
        open={!!editing}
        material={editing?.material ?? null}
        sessionTitle={session.title}
        canUpload={canUpload}
        progress={progress}
        pending={save.isPending}
        error={save.error?.message ?? null}
        onSave={(body) =>
          save.mutate(
            { ...body, id: editing?.material?.id, sortOrder: editing?.material ? undefined : list.length },
            {
              onSuccess: () => {
                setEditing(null);
                save.reset();
              },
            },
          )
        }
        onClose={() => {
          setEditing(null);
          save.reset();
        }}
      />
      <ConfirmDialog
        open={!!removing}
        title={`Remove “${removing?.title ?? ''}”?`}
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={remove.isPending}
        tone="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          remove.mutate(
            { id: removing.id },
            { onSuccess: () => setRemoving(null), onError: (e) => toast.push({ title: 'Not removed', body: e.message }) },
          )
        }
      >
        It disappears from the session in the app.
      </ConfirmDialog>
    </section>
  );
}

export default function MaterialsPage() {
  const auth = useSession();
  const canUpload = auth.status === 'signed-in' && runsEvents(auth.user.tier);
  const editions = useEditions();
  const edition = editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const sessions = useSessions(edition?.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [day, setDay] = useState<number | 'all'>('all');

  const all = useMemo(() => (sessions.data ?? []).filter((s) => s.type !== 'break').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), [sessions.data]);
  const days = [...new Set(all.map((s) => s.day))].sort((a, b) => a - b);
  const q = search.trim().toLowerCase();
  const shown = all.filter((s) => (day === 'all' || s.day === day) && (!q || s.title.toLowerCase().includes(q) || s.room.toLowerCase().includes(q)));
  const selected = all.find((s) => s.id === picked) ?? shown[0] ?? all[0] ?? null;

  if (editions.isPending || sessions.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (!selected) {
    return (
      <div className={cn(cardClass, 'mx-auto max-w-lg p-10 text-center')}>
        <PaperClipIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 font-medium text-ink">No sessions yet</p>
        <p className="mt-1 text-sm text-[#7c7c7c]">Materials are attached to sessions. Add sessions on the Programme page first.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <section aria-label="Sessions" className={cardClass}>
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <TextInput icon={MagnifyingGlassIcon} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a session" aria-label="Find a session" />
          {days.length > 1 && (
            <div role="radiogroup" aria-label="Day" className="flex w-fit gap-1 rounded-lg bg-[#f1f1f1] p-1">
              {(['all', ...days] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={day === d}
                  onClick={() => setDay(d)}
                  className={cn('rounded-md px-3 py-1 text-sm', day === d ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252] hover:text-ink')}
                >
                  {d === 'all' ? 'All' : `Day ${d}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <ul className="max-h-[calc(100dvh-20rem)] divide-y divide-border overflow-y-auto scrollbar-thin">
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={s.id === selected.id}
                onClick={() => setPicked(s.id)}
                className={cn('block w-full border-l-2 px-4 py-3 text-left transition-colors', s.id === selected.id ? 'border-primary bg-primary-soft/50' : 'border-transparent hover:bg-[#f6f6f6]')}
              >
                <span className="block truncate text-sm text-ink">{s.title}</span>
                <span className="block text-xs text-[#7c7c7c]">
                  Day {s.day} · {hm(s.startsAt)} · {s.room}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-[#7c7c7c]">No session matches.</li>}
        </ul>
      </section>

      {/* Keyed so each session starts with its own list and dialogs. */}
      <SessionMaterials key={selected.id} session={selected} canUpload={canUpload} />
    </div>
  );
}
