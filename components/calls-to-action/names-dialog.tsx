'use client';

import { MagnifyingGlassIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Tag } from '@/components/ui/tag';
import { renameIds, type Person } from '@/lib/calls-to-action/names';
import { cn } from '@/lib/utils';

const label = (name: string, organisation: string | null) => (organisation ? `${name}, ${organisation}` : name);

/**
 * Every speaker named on the calls, with look-alike spellings grouped at the top. Setting a
 * person's name and organisation spells them that way on all their cards, and the AI spells
 * them that way from then on.
 */
export function NamesDialog({
  open,
  people,
  onRename,
  onClose,
}: {
  open: boolean;
  people: Person[];
  /** Saves the spelling on the given calls; resolves when done. */
  onRename: (ids: string[], name: string, organisation: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const baseId = useId();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyOf = (p: Person) => p.spellings.map((s) => s.ids[0]).join(',');
  const words = query.trim().toLowerCase();
  const shown = words ? people.filter((p) => p.spellings.some((s) => label(s.name, s.organisation).toLowerCase().includes(words))) : people;
  const lookAlikes = people.filter((p) => p.spellings.length > 1).length;

  const edit = (p: Person) => {
    // the fullest spelling is usually the right one: "Christopher" over "Chris"
    const best = [...p.spellings].sort((a, b) => b.name.length - a.name.length || b.ids.length - a.ids.length)[0]!;
    setEditing(keyOf(p));
    setName(best.name);
    setOrganisation(best.organisation ?? p.spellings.find((s) => s.organisation)?.organisation ?? '');
    setError(null);
  };
  const save = (p: Person) => {
    const ids = renameIds(p, name, organisation.trim() || null);
    if (!name.trim()) return setError('Type the name.');
    if (!ids.length) return setEditing(null);
    setSaving(true);
    setError(null);
    onRename(ids, name.trim(), organisation.trim() || null)
      .then(() => setEditing(null))
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };
  const enterSaves = (p: Person) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    save(p);
  };

  return (
    <FormDialog
      open={open}
      icon={UserGroupIcon}
      title="Speaker names"
      subtitle={`${people.length} ${people.length === 1 ? 'person' : 'people'} named on the calls${lookAlikes ? ` · ${lookAlikes} spelled more than one way` : ''}`}
      pending={false}
      submitLabel="Done"
      error={null}
      onClose={onClose}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onClose();
      }}
    >
      <p className="text-sm text-ink-soft">
        Captions often mishear names. Fix one here and it changes on every card, in the deck and in the report. The AI then spells new finds the same way.
      </p>
      <TextInput icon={MagnifyingGlassIcon} aria-label="Find a name" placeholder="Find a name or organisation" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
      {shown.length === 0 ? (
        <p className="text-sm text-hint">{people.length ? 'No name matches.' : 'Nobody is named on the calls yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((p) => {
            const k = keyOf(p);
            const open = editing === k;
            const several = p.spellings.length > 1;
            const ids = open ? renameIds(p, name, organisation.trim() || null) : [];
            return (
              <li key={k} className={cn('rounded-lg border p-3', several ? 'border-warning/50 bg-warning-soft/30' : 'border-border')}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 text-sm">
                    {several && (
                      <Tag tone="gold" className="mb-1">
                        Probably one person
                      </Tag>
                    )}
                    {p.spellings.map((s) => (
                      <p key={`${s.name}|${s.organisation}`} className="text-ink">
                        {label(s.name, s.organisation)} <span className="text-hint">· {s.ids.length} card{s.ids.length === 1 ? '' : 's'}</span>
                      </p>
                    ))}
                  </div>
                  {!open && (
                    <button type="button" onClick={() => edit(p)} className={several ? buttonClass({ className: 'h-8 shrink-0' }) : buttonClass({ style: 'outline', color: 'gray', className: 'h-8 shrink-0' })}>
                      {several ? 'Fix' : 'Edit'}
                    </button>
                  )}
                </div>
                {open && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                    {several && (
                      <div className="flex flex-wrap gap-2">
                        {p.spellings.map((s) => (
                          <button
                            key={`${s.name}|${s.organisation}`}
                            type="button"
                            onClick={() => {
                              setName(s.name);
                              setOrganisation(s.organisation ?? '');
                            }}
                            className={buttonClass({ style: 'soft', color: 'gray', className: 'h-7 text-xs' })}
                          >
                            Use “{label(s.name, s.organisation)}”
                          </button>
                        ))}
                      </div>
                    )}
                    <Field id={`${baseId}-${k}-name`} label="Name">
                      <TextInput id={`${baseId}-${k}-name`} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onKeyDown={enterSaves(p)} autoFocus />
                    </Field>
                    <Field id={`${baseId}-${k}-org`} label="Organisation" optional>
                      <TextInput id={`${baseId}-${k}-org`} value={organisation} maxLength={200} onChange={(e) => setOrganisation(e.target.value)} onKeyDown={enterSaves(p)} />
                    </Field>
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={saving || !name.trim()} onClick={() => save(p)} className={buttonClass({ className: 'h-8' })}>
                        {saving ? 'Saving…' : ids.length ? `Save on ${ids.length} card${ids.length === 1 ? '' : 's'}` : 'No change'}
                      </button>
                      <button type="button" disabled={saving} onClick={() => setEditing(null)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </FormDialog>
  );
}
