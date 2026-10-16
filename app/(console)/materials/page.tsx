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
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { MaterialDialog } from '@/components/materials/material-dialog';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { SegmentedTabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import { Tooltip } from '@/components/ui/tooltip';
import type { HeroIcon } from '@/lib/nav';
import { runsEvents, useSession } from '@/lib/auth/session';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { KIND_LABEL, moveMaterial, sourceLabel, type Material, type MaterialKind } from '@/lib/materials/materials';
import { useMaterialActions, useMaterials } from '@/lib/materials/use-materials';
import type { Session } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

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
        <a href={material.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[0.9375rem] text-ink hover:text-primary hover:underline">
          <span className="line-clamp-2 sm:truncate">{material.title}</span>
          <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0 text-hint" />
        </a>
        <p className="truncate text-xs text-hint">
          {KIND_LABEL[material.kind]} · {sourceLabel(material.url)}
          {material.sizeLabel && ` · ${material.sizeLabel}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <div className="mr-1 flex flex-col opacity-40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label={`Move “${material.title}” up`} className="rounded p-0.5 text-ink-soft hover:text-ink disabled:opacity-30">
            <ChevronUpIcon className="size-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={`Move “${material.title}” down`} className="rounded p-0.5 text-ink-soft hover:text-ink disabled:opacity-30">
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
        <Tooltip label="Edit">
          <button type="button" onClick={onEdit} aria-label={`Edit “${material.title}”`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
            <PencilSquareIcon className="size-4" />
          </button>
        </Tooltip>
        <Tooltip label="Remove">
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove “${material.title}”`}

            className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}
          >
            <TrashIcon className="size-4" />
          </button>
        </Tooltip>
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
  const add = (
    <button type="button" onClick={() => setEditing({ material: null })} className={buttonClass({ className: 'h-9' })}>
      <PlusIcon className="size-4" />
      Add material
    </button>
  );

  return (
    <Panel
      title={session.title}
      count={materials.data ? list.length : undefined}
      description={
        <>
          Day {session.day} · {hm(session.startsAt)}–{hm(session.endsAt)} · {session.room}
        </>
      }
      actions={add}
      className="flex flex-col"
    >
      {materials.isPending ? (
        <LoadingRows rows={2} />
      ) : materials.isError && !materials.data ? (
        <ErrorState title="Materials could not load" error={materials.error} onRetry={() => void materials.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={PaperClipIcon} title="Nothing attached yet" body="Add the slides, a paper or the recording; delegates find them on the session in the app." action={add} />
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
        onConfirm={() => removing && remove.mutate({ id: removing.id }, { onSuccess: () => setRemoving(null), onError: (e) => toast.push({ title: 'Not removed', body: e.message }) })}
      >
        It disappears from the session in the app.
      </ConfirmDialog>
    </Panel>
  );
}

export default function MaterialsPage() {
  const auth = useSession();
  const canUpload = auth.status === 'signed-in' && runsEvents(auth.user.tier);
  const working = useWorkingEdition();
  const editions = working.editions;
  const edition = working.edition;
  const sessions = useSessions(edition?.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const all = useMemo(() => (sessions.data ?? []).filter((s) => s.type !== 'break').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), [sessions.data]);
  const days = [...new Set(all.map((s) => s.day))].sort((a, b) => a - b);
  const [dayParam, setDayParam] = useUrlParam<string>('day', 'all', ['all', ...days.map(String)]);
  const day = dayParam === 'all' ? 'all' : Number(dayParam);
  const q = search.trim().toLowerCase();
  const shown = all.filter((s) => (day === 'all' || s.day === day) && (!q || s.title.toLowerCase().includes(q) || s.room.toLowerCase().includes(q)));
  const selected = all.find((s) => s.id === picked) ?? shown[0] ?? all[0] ?? null;

  if (editions.isPending || sessions.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-xl" />;
  if (!selected) {
    return (
      <EmptyState
        framed
        icon={PaperClipIcon}
        title="No sessions yet"
        body="Materials are attached to sessions; add sessions on the Programme page first."
        action={
          <Link href="/programme" className={buttonClass()}>
            Go to Programme
          </Link>
        }
        className="mx-auto w-full max-w-lg"
      />
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Panel
        title="Sessions"
        count={all.length}
        toolbar={
          <div className="flex w-full flex-col gap-3">
            <TextInput icon={MagnifyingGlassIcon} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a session" aria-label="Find a session" />
            {days.length > 1 && (
              <SegmentedTabs label="Day" options={[{ value: 'all', label: 'All' }, ...days.map((d) => ({ value: String(d), label: `Day ${d}` }))]} value={dayParam} onChange={setDayParam} />
            )}
          </div>
        }
      >
        <ul className="max-h-[calc(100dvh-20rem)] divide-y divide-border overflow-y-auto scrollbar-thin">
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={s.id === selected.id}
                onClick={() => setPicked(s.id)}
                className={cn('block w-full border-l-2 px-4 py-3 text-left transition-colors', s.id === selected.id ? 'border-primary bg-primary-soft/50' : 'border-transparent hover:bg-surface-soft')}
              >
                <span className="block truncate text-sm text-ink">{s.title}</span>
                <span className="block text-xs text-hint">
                  Day {s.day} · {hm(s.startsAt)} · {s.room}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-hint">No session matches.</li>}
        </ul>
      </Panel>

      {/* Keyed so each session starts with its own list and dialogs. */}
      <SessionMaterials key={selected.id} session={selected} canUpload={canUpload} />
    </div>
  );
}
