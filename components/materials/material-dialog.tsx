'use client';

import { DocumentArrowUpIcon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useId, useState, type DragEvent } from 'react';

import { describedBy, Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { emptyMaterial, fileProblem, formatBytes, KIND_LABEL, KINDS, materialFormOf, materialSchema, sourceLabel, type Material, type MaterialForm, type Source } from '@/lib/materials/materials';
import type { MaterialSave } from '@/lib/materials/use-materials';
import { cn } from '@/lib/utils';

type Errors = Partial<Record<keyof MaterialForm, string>>;

/**
 * Add a material to a session, or edit one. A new one is an uploaded PDF (organisers) or a link.
 * Editing an uploaded material changes its details and can replace the file; its stored key is
 * never overwritten with the signed address the list hands out.
 */
export function MaterialDialog({
  open,
  material,
  sessionTitle,
  canUpload,
  progress,
  pending,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  material: Material | null;
  sessionTitle: string;
  canUpload: boolean;
  /** Upload progress 0–1 while a file is on its way, else null. */
  progress: number | null;
  pending: boolean;
  error: string | null;
  onSave: (save: Omit<MaterialSave, 'id'>) => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;
  const [form, setForm] = useState<MaterialForm>(() => emptyMaterial(canUpload));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [dragging, setDragging] = useState(false);
  const [openedFor, setOpenedFor] = useState<Material | null | undefined>(undefined);
  const uploaded = !!material && sourceLabel(material.url) === 'Uploaded PDF';

  if (open && openedFor !== material) {
    setOpenedFor(material);
    setForm(material ? { ...materialFormOf(material), source: uploaded ? 'upload' : 'link', url: uploaded ? '' : material.url } : emptyMaterial(canUpload));
    setFile(null);
    setErrors({});
  }

  const set = <K extends keyof MaterialForm>(key: K, value: MaterialForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const pick = (picked: File | undefined) => {
    if (!picked) return;
    const problem = fileProblem(picked);
    if (problem) {
      setErrors((e) => ({ ...e, hasFile: problem }));
      return;
    }
    setFile(picked);
    setErrors((e) => ({ ...e, hasFile: undefined }));
    setForm((f) => ({ ...f, hasFile: true, sizeLabel: formatBytes(picked.size), title: f.title || picked.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ') }));
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  };

  return (
    <FormDialog
      open={open}
      icon={DocumentTextIcon}
      title={material ? 'Edit material' : 'Add material'}
      subtitle={`For “${sessionTitle}”.`}
      pending={pending}
      submitLabel={progress !== null ? `Uploading ${Math.round(progress * 100)}%` : material ? 'Save' : 'Add material'}
      error={error}
      onClose={() => {
        setOpenedFor(undefined);
        onClose();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        // An uploaded material being edited keeps its file unless a new one was picked.
        const check = uploaded && !file ? { ...form, hasFile: true } : form;
        const parsed = materialSchema.safeParse(check);
        if (!parsed.success) {
          const next: Errors = {};
          for (const issue of parsed.error.issues) next[issue.path[0] as keyof MaterialForm] ??= issue.message;
          setErrors(next);
          return;
        }
        const d = parsed.data;
        onSave({ title: d.title, kind: d.kind, sizeLabel: d.sizeLabel, ...(d.source === 'link' ? { link: d.url } : file ? { file } : {}) });
      }}
    >
      {!material && canUpload && (
        <div role="radiogroup" aria-label="Source" className="flex gap-2">
          {(['upload', 'link'] as Source[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={form.source === s}
              onClick={() => set('source', s)}
              className={cn(
                'h-9 rounded-lg border px-3 text-sm transition-colors',
                form.source === s ? 'border-primary bg-primary-soft/50 font-medium text-primary' : 'border-border text-[#525252] hover:border-[#bdbdbd]',
              )}
            >
              {s === 'upload' ? 'Upload a PDF' : 'Add a link'}
            </button>
          ))}
        </div>
      )}

      {form.source === 'upload' ? (
        <div>
          {uploaded && !file && (
            <p className="mb-2 flex items-center gap-2 text-sm text-[#525252]">
              <DocumentTextIcon className="size-4" /> Current file kept. Drop a new PDF to replace it.
            </p>
          )}
          <label
            htmlFor={id('file')}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
              errors.hasFile ? 'border-danger' : dragging ? 'border-primary bg-primary-soft/40' : 'border-[#bdbdbd] hover:border-primary',
            )}
          >
            {file ? (
              <>
                <DocumentTextIcon className="size-6 text-primary" />
                <span className="text-sm text-ink">{file.name}</span>
                <span className="text-xs text-[#7c7c7c]">{formatBytes(file.size)} · click to choose another</span>
              </>
            ) : (
              <>
                <DocumentArrowUpIcon className="size-6 text-[#7c7c7c]" />
                <span className="text-sm text-ink">Drop a PDF here, or click to choose</span>
                <span className="text-xs text-[#7c7c7c]">Slides exported to PDF work best. Up to 50 MB.</span>
              </>
            )}
            <input id={id('file')} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {progress !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1f1f1]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          {errors.hasFile && <p className="mt-1 text-xs text-danger">{errors.hasFile}</p>}
        </div>
      ) : (
        <Field id={id('url')} label="Link" error={errors.url} hint={!canUpload ? 'Only organisers can upload files; add a link to where it is shared.' : undefined}>
          <TextInput
            id={id('url')}
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            invalid={!!errors.url}
            maxLength={1000}
            aria-describedby={describedBy(id('url'), errors.url, !canUpload ? 'hint' : undefined)}
          />
        </Field>
      )}

      <Field id={id('title')} label="Title" error={errors.title}>
        <TextInput id={id('title')} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Opening plenary slides" invalid={!!errors.title} maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('kind')} label="Kind">
          <Select id={id('kind')} value={form.kind} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} onChange={(v) => set('kind', v)} />
        </Field>
        <Field id={id('size')} label="Size" optional error={errors.sizeLabel} hint={form.source === 'upload' ? 'Filled in from the file.' : 'For example “45 min”.'}>
          <TextInput id={id('size')} value={form.sizeLabel} onChange={(e) => set('sizeLabel', e.target.value)} placeholder="2.4 MB" invalid={!!errors.sizeLabel} maxLength={20} />
        </Field>
      </div>

      {file && (
        <button type="button" onClick={() => { setFile(null); set('hasFile', false); }} className="-mt-2 flex items-center gap-1 self-start text-xs text-[#525252] hover:text-ink">
          <XMarkIcon className="size-3.5" /> Remove the chosen file
        </button>
      )}
    </FormDialog>
  );
}
