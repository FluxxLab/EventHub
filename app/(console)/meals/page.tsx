'use client';

import { BuildingStorefrontIcon, CakeIcon, CheckCircleIcon, ClipboardDocumentIcon, LinkIcon, NoSymbolIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useState, type FormEvent } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Panel } from '@/components/ui/panel';
import { DeleteDialog, RowActions } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { tabId, tabPanelId, UnderlineTabs } from '@/components/ui/tabs';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { QUARTER_HOURS } from '@/lib/calendar';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { counterLink, mealProblem, mealState, mealToForm, mealWindow, toMealBody, type Meal, type MealCounter, type MealForm, type MealState } from '@/lib/meals/meals';
import { useMealActions, useMeals } from '@/lib/meals/use-meals';
import { useNow } from '@/lib/use-now';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const th = 'h-12 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
const td = 'border-b border-divider px-4 py-3 text-sm text-ink-soft';
const TIMES = QUARTER_HOURS.map((t) => ({ value: t, label: t }));
const STATE: Record<MealState, { label: string; tone: TagTone }> = {
  upcoming: { label: 'Later', tone: 'gray' },
  serving: { label: 'Serving now', tone: 'green' },
  done: { label: 'Finished', tone: 'primary' },
};

/**
 * Meals: what the event serves and when, and the food counters that serve it. Each counter gets a
 * private link; catering staff open it on a phone and scan delegates' ticket QRs, and each person on
 * a ticket collects each meal once.
 */
export default function MealsPage() {
  const page = usePageEdition();
  return (
    <EventBar page={page} note="Meals and food counters">
      {(editionId) => <Board edition={page.list.find((e) => e.id === editionId)!} />}
    </EventBar>
  );
}

const TABS = [
  { value: 'meals', label: 'Meals', icon: CakeIcon },
  { value: 'counters', label: 'Food counters', icon: BuildingStorefrontIcon },
] as const;
type Tab = (typeof TABS)[number]['value'];
const TAB_VALUES: readonly Tab[] = TABS.map((t) => t.value);

function Board({ edition }: { edition: Edition }) {
  // Meals and food counters, one at a time, as Ticketing shows tiers and sales.
  const [tab, setTab] = useUrlParam<Tab>('tab', 'meals', TAB_VALUES);
  const board = useMeals(edition.id);
  const actions = useMealActions(edition.id);
  const toast = useToast();
  const now = useNow(30_000);
  const [editing, setEditing] = useState<{ meal: Meal | null } | null>(null);
  const [deleting, setDeleting] = useState<Meal | null>(null);
  const [addingCounter, setAddingCounter] = useState(false);
  const [removingCounter, setRemovingCounter] = useState<MealCounter | null>(null);
  const [link, setLink] = useState<{ counter: string; url: string } | null>(null);

  if (board.isPending) return <LoadingRows className="rounded-xl border border-border bg-surface" />;
  if (board.isError) return <ErrorState framed title="Meals could not load." error={board.error} onRetry={() => void board.refetch()} />;
  const { meals, counters, people } = board.data;
  const addMeal = (
    <button type="button" onClick={() => setEditing({ meal: null })} className={buttonClass()}>
      <PlusIcon className="size-4" /> Add meal
    </button>
  );
  const addCounter = (
    <button type="button" onClick={() => setAddingCounter(true)} className={buttonClass({ style: 'soft', color: 'primary' })}>
      <PlusIcon className="size-4" /> Add counter
    </button>
  );
  const showLink = (counter: string, key: string) => setLink({ counter, url: counterLink(window.location.origin, key) });

  return (
    <div className="flex flex-col gap-5">
      <UnderlineTabs label="Meals sections" idBase="meals" options={TABS.map((t) => ({ ...t, count: t.value === 'meals' ? meals.length : counters.length }))} value={tab} onChange={setTab} />
      <div id={tabPanelId('meals', tab)} role="tabpanel" aria-labelledby={tabId('meals', tab)}>
        {tab === 'meals' && (
          <Panel title="Meals" description={`${people.toLocaleString('en-GB')} ${people === 1 ? 'person holds' : 'people hold'} tickets. Each collects each meal once.`} actions={addMeal}>
            {meals.length === 0 ? (
              <EmptyState icon={CakeIcon} title="No meals yet" body="Add each meal the event serves, with its serving window." action={addMeal} />
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse">
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        Meal
                      </th>
                      <th scope="col" className={th}>
                        Served
                      </th>
                      <th scope="col" className={th}>
                        Status
                      </th>
                      <th scope="col" className={cn(th, 'w-64')}>
                        Collected
                      </th>
                      <th scope="col" className={cn(th, 'w-24')}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {meals.map((m) => {
                      const state = STATE[mealState(m, now)];
                      const share = people ? Math.min(100, Math.round((m.served / people) * 100)) : 0;
                      return (
                        <tr key={m.id} className="last:[&>td]:border-b-0">
                          <td className={cn(td, 'font-medium text-ink')}>{m.name}</td>
                          <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{mealWindow(m)}</td>
                          <td className={td}>
                            <Tag tone={state.tone} dot>
                              {state.label}
                            </Tag>
                          </td>
                          <td className={td}>
                            <div className="flex items-center gap-3">
                              <div className="h-2 flex-1 rounded-full bg-surface-soft" aria-hidden>
                                <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                              </div>
                              {/* a fixed width, so every row's bar starts and ends in line */}
                              <span className="w-28 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-ink">
                                {m.served.toLocaleString('en-GB')} of {people.toLocaleString('en-GB')}
                              </span>
                            </div>
                          </td>
                          <td className={cn(td, 'text-right')}>
                            <RowActions
                              name={m.name}
                              onEdit={() => setEditing({ meal: m })}
                              onDelete={() => {
                                actions.remove.reset();
                                setDeleting(m);
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {tab === 'counters' && (
          <Panel title="Food counters" description="Each gets a private link catering staff open on a phone to scan tickets." actions={addCounter}>
            {counters.length === 0 ? (
              <EmptyState icon={BuildingStorefrontIcon} title="No counters yet" body="Add one for each place food is handed out." action={addCounter} />
            ) : (
              <ul className="divide-y divide-divider">
                {counters.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{c.name}</p>
                      <p className="text-xs tabular-nums text-hint">{c.served.toLocaleString('en-GB')} plates served</p>
                    </div>
                    <Tag tone={c.linkOn ? 'green' : 'gray'} dot>
                      {c.linkOn ? 'Link on' : 'Link off'}
                    </Tag>
                    <RowActions
                      name={c.name}
                      actions={[
                        {
                          label: c.linkOn ? 'New link' : 'Switch on',
                          icon: LinkIcon,
                          disabled: actions.newLink.isPending,
                          onSelect: () => actions.newLink.mutate(c.id, { onSuccess: ({ key }) => showLink(c.name, key), onError: (e) => toast.push({ title: 'No new link', body: e.message }) }),
                        },
                        ...(c.linkOn
                          ? [
                              {
                                label: 'Switch off',
                                icon: NoSymbolIcon,
                                disabled: actions.unlink.isPending,
                                onSelect: () =>
                                  actions.unlink.mutate(c.id, {
                                    onSuccess: () =>
                                      toast.push({ title: 'Link switched off', leading: { kind: 'icon' as const, icon: NoSymbolIcon }, body: `${c.name} can’t scan until you make a new link.` }),
                                  }),
                              },
                            ]
                          : []),
                      ]}
                      onDelete={() => setRemovingCounter(c)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <MealDialog
        key={editing?.meal?.id ?? 'new'}
        open={!!editing}
        meal={editing?.meal ?? null}
        firstDay={edition.startsAt}
        pending={actions.save.isPending}
        error={actions.save.error?.message ?? null}
        onClose={() => {
          setEditing(null);
          actions.save.reset();
        }}
        onSave={(body) =>
          actions.save.mutate(
            { id: editing?.meal?.id, body },
            {
              onSuccess: (saved) => {
                setEditing(null);
                toast.push({ title: editing?.meal ? 'Meal saved' : 'Meal added', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: `${saved.name}: ${mealWindow(saved)}.` });
              },
            },
          )
        }
      />
      <CounterDialog
        open={addingCounter}
        pending={actions.addCounter.isPending}
        error={actions.addCounter.error?.message ?? null}
        onClose={() => {
          setAddingCounter(false);
          actions.addCounter.reset();
        }}
        onSave={(name) =>
          actions.addCounter.mutate(name, {
            onSuccess: ({ counter, key }) => {
              setAddingCounter(false);
              showLink(counter.name, key);
            },
          })
        }
      />
      <LinkDialog link={link} onClose={() => setLink(null)} />
      <DeleteDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? 'this meal'}?`}
        pending={actions.remove.isPending}
        refusal={actions.remove.error?.message ?? null}
        onCancel={() => {
          setDeleting(null);
          actions.remove.reset();
        }}
        onConfirm={() =>
          deleting &&
          actions.remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.push({ title: 'Meal deleted', leading: { kind: 'icon', icon: TrashIcon }, body: `${deleting.name} is off the list.` });
              setDeleting(null);
            },
          })
        }
      >
        Only a meal nobody has collected yet can be deleted. Once plates have gone out, change its times instead.
      </DeleteDialog>
      <DeleteDialog
        open={!!removingCounter}
        title={`Remove ${removingCounter?.name ?? 'this counter'}?`}
        pending={actions.removeCounter.isPending}
        refusal={actions.removeCounter.error?.message ?? null}
        onCancel={() => {
          setRemovingCounter(null);
          actions.removeCounter.reset();
        }}
        onConfirm={() =>
          removingCounter &&
          actions.removeCounter.mutate(removingCounter.id, {
            onSuccess: () => {
              toast.push({ title: 'Counter removed', leading: { kind: 'icon', icon: TrashIcon }, body: `${removingCounter.name}’s link stops working. Plates it served stay counted.` });
              setRemovingCounter(null);
            },
          })
        }
      >
        Its link stops working at once. Plates it already served stay counted under their meals.
      </DeleteDialog>
    </div>
  );
}

function MealDialog({
  open,
  meal,
  firstDay,
  pending,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  meal: Meal | null;
  firstDay: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: ReturnType<typeof toMealBody>) => void;
}) {
  const [initial] = useState<MealForm>(() => (meal ? mealToForm(meal) : { name: '', date: firstDay.slice(0, 10), start: '12:00', end: '14:00' }));
  const [form, setForm] = useState<MealForm>(initial);
  const dirty = (Object.keys(initial) as (keyof MealForm)[]).some((k) => form[k] !== initial[k]);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof MealForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProblem(null);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const why = mealProblem(form);
    if (why) return setProblem(why);
    onSave(toMealBody(form));
  };
  return (
    <FormDialog
      open={open}
      icon={CakeIcon}
      title={meal ? 'Edit meal' : 'Add meal'}
      subtitle="Counters can serve it only in this window."
      pending={pending}
      submitLabel={meal ? 'Save' : 'Add meal'}
      error={problem ?? error}
      dirty={dirty}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="meal-name" label="Meal" className="sm:col-span-2">
          <TextInput id="meal-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Lunch, Day 1" maxLength={120} autoFocus />
        </Field>
        <Field id="meal-date" label="Day" className="sm:col-span-2">
          <TextInput id="meal-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field id="meal-start" label="Serving starts">
          <Select id="meal-start" value={form.start} options={TIMES} onChange={(v) => set('start', v)} />
        </Field>
        <Field id="meal-end" label="Serving ends">
          <Select id="meal-end" value={form.end} options={TIMES} onChange={(v) => set('end', v)} />
        </Field>
      </div>
    </FormDialog>
  );
}

function CounterDialog({ open, pending, error, onClose, onSave }: { open: boolean; pending: boolean; error: string | null; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <FormDialog
      open={open}
      icon={LinkIcon}
      title="Add counter"
      subtitle="A place food is handed out. You get its scanner link next."
      pending={pending}
      submitLabel="Add counter"
      error={problem ?? error}
      dirty={name.trim() !== ''}
      onClose={() => {
        setName('');
        onClose();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setProblem('Name the counter, such as “Main Hall” or “Garden terrace”.');
        onSave(name.trim());
        setName('');
      }}
    >
      <Field id="counter-name" label="Counter">
        <TextInput
          id="counter-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setProblem(null);
          }}
          placeholder="Main Hall"
          maxLength={120}
          autoFocus
        />
      </Field>
    </FormDialog>
  );
}

/** The counter's link, shown once: only its fingerprint is stored. */
function LinkDialog({ link, onClose }: { link: { counter: string; url: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <FormDialog
      open={!!link}
      icon={LinkIcon}
      title={`Scanner link: ${link?.counter ?? ''}`}
      subtitle="Send it to the counter’s staff. Shown only now; a new link switches this one off."
      pending={false}
      submitLabel="Done"
      error={null}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        setCopied(false);
        onClose();
      }}
    >
      <div className="flex flex-col gap-2">
        <input
          readOnly
          value={link?.url ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 w-full rounded-lg border border-border bg-surface-soft px-3 font-mono text-xs text-ink"
          aria-label="Scanner link"
        />
        <button
          type="button"
          onClick={() =>
            link &&
            void navigator.clipboard
              .writeText(link.url)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
          className={buttonClass({ style: 'soft', color: 'primary', className: 'self-start' })}
        >
          <ClipboardDocumentIcon className="size-4" /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </FormDialog>
  );
}
