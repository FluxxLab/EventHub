# GS-26 Admin Console — Engineering Guidelines

> Inherited from the Maizube ERP frontend (11 Aug 2026) — the principles are
> project-agnostic and apply here unchanged.

> **Read this before writing a line of code.** Same principles as the backend
> (`PIC-Gs26-BACKEND` — its CLAUDE.md architecture rules) — SOLID, DRY, clean
> architecture, race-condition safety, config-in-environment — but expressed in
> the way they actually manifest in a **Next.js 16 / React 19 / TanStack Query**
> app. Where the backend says "transaction + row lock", the frontend says
> "cancel the stale request and disable the button". The goal is the same:
> correct under concurrency, configurable, cheap to change.

**Stack:** Next.js 16 (App Router) · React 19 · TanStack Query · TypeScript ·
Tailwind / shadcn-ui. Data layer in `lib/` (`api/`, `services/`, `hooks/`,
`providers/`, `types/`, `utils/`).

**Companion docs:** `Pitfalls.MD` (aesthetic/sandbox/font pitfalls — still
applies); this file governs **architecture, data, and correctness**.

---

## ⭐ The Quality Bar — 9/10, at all times (non-negotiable)

This app must sit at **9/10 or above on every dimension, on every commit** — the
standing state, not a one-off cleanup. A change that would drop any dimension
below 9 is **not done**, even if the feature "works" in `next dev`.

**The rule:** if you can't keep it at 9, don't merge it. Fix the gap in the same
change, or don't make the change.

### What 9/10 requires per dimension

| Dimension | The 9/10 bar | Enforced by |
|---|---|---|
| **Build & types** | `pnpm build` is clean (it runs the type-check). **Never trust `next dev` alone** — it skips type-checking and hides real bugs. **Zero** `any` without a justified, commented cast. | CI: `pnpm build` |
| **Tests** | Components/hooks with logic ship with tests; the race paths (stale-response, double-submit, optimistic rollback) are tested. A bug fix adds a test that fails before and passes after. | CI: test run |
| **Data layer** | **All** server I/O goes through `lib/api/client.ts` — no raw `fetch()` in components, no `process.env.NEXT_PUBLIC_*` outside the client. Reads via TanStack Query hooks; writes via `useMutation`. | review (§3) |
| **Concurrency** | Stale responses can't win (query keys / AbortController); mutation controls disabled while pending; optimistic updates roll back on error (§5). | review |
| **Validation / errors** | Every form validated with a zod schema before submit; `ApiError` surfaced by status, never swallowed (§6). | review |
| **UX / a11y** | Every async view handles loading / empty / error / success; accessible by default (§7). | review |
| **Config** | Only `NEXT_PUBLIC_*` reaches the browser, read in one place; never a secret behind that prefix; prod sets the API URL explicitly (§4). | review |
| **Docs** | This file stays accurate; a change that invalidates a rule updates it in the same PR. | review |

### How we hold the line
- **CI is the floor, not the ceiling.** Green `pnpm build` (type-check + build) is the *minimum* to merge — wired in `.github/workflows/ci.yml`. Never weaken a gate to push a merge through.
- **"Compiles in dev" ≠ "works."** The recurring failure here was type errors and runtime bugs hidden because the team only ran `next dev`. Run the production build.
- **Leave it ≥9.** Touched a component below bar (raw `fetch`, no validation)? Bring it up to standard as part of your change.
- **No silent debt.** A temporary drop below 9 is a tracked, dated item with a removal condition — never an unremarked regression.

> Current standing (2026-06-21): production build is green; all raw-`fetch`
> callers route through the client; Vitest suite in CI (API client, utils, zod
> schemas); `zod` validation on the careers, expenses and customers forms.
> **CI lint is now a blocking gate** — 0 error-level problems. `no-explicit-any`,
> `no-unused-vars`, and the React Compiler readiness rules
> (`set-state-in-effect`, `static-components`, `preserve-manual-memoization`) are
> **warnings = tracked debt** (~514), not blockers; pay them down as you touch
> files. **`zod` validation now covers ~all data-entry forms** (38/39; the one
> exception is the onboarding checklist, which has no create form). **160 Vitest
> tests** (transport, 8 data hooks, a component, and the validation schemas).
> Open follow-ups: broaden component/hook test breadth and chip away at the
> `any` warning debt. New forms MUST ship with a `zod` schema + the `safeParse`
> gate (see `lib/validation/` and any wired form, e.g. `finance/grn`).

---

## 0. Definition of Done (the checklist)

A change is **not done** until all of these are true:

- [ ] It compiles & lints: `pnpm build` and `pnpm lint` are clean (no `any`, no unused).
- [ ] **All server data goes through `lib/api/client.ts`** — no raw `fetch()` and no `process.env.NEXT_PUBLIC_API_URL` in a component (see §3).
- [ ] Reads use a **TanStack Query** hook with a stable query key; writes use **`useMutation`** (see §5).
- [ ] **Every submit/mutation control is disabled while pending** — no double-submit (§5.2).
- [ ] Any request tied to changing input (search, filters) **cancels or supersedes** stale responses (§5.1).
- [ ] Every async view renders **loading / empty / error** states — never a bare spinner-forever.
- [ ] Form input is validated with a **zod schema** before submit (§6).
- [ ] No business/money math in components — it lives in `lib/utils` and is reused (§3).
- [ ] `'use client'` is only on components that actually need interactivity (§1).
- [ ] Accessible: labels, focus states, keyboard operable, semantic elements (§7).

---

## 1. Architecture

### 1.1 Server vs Client Components
- **Default to Server Components.** Add `'use client'` only when the component
  needs state, effects, event handlers, or browser APIs.
- Keep `'use client'` at the **leaves**. Don't mark a whole page client just
  because one button is interactive — push the interactivity into a small child.
- Fetch read-only data in Server Components / server code where you can; use
  client-side TanStack Query for interactive, user-specific, or frequently
  refetched data.

### 1.2 The layering (mirror of the backend's controller→service→repo)
```
Component (UI)  →  Query/Mutation hook (lib/hooks)  →  Service (lib/services)  →  api client (lib/api/client.ts)
```
- **Components** render and handle interaction. No `fetch`, no URL building, no
  data transformation beyond display formatting.
- **Hooks** (`lib/hooks`) wrap TanStack Query — own query keys, caching,
  invalidation. This is the only place components get server data.
- **Services** (`lib/services`) own endpoint paths and request/response shapes.
- **`lib/api/client.ts`** is the single transport: base URL, auth, refresh,
  timeouts, error mapping. Nothing else talks to the network.

### 1.3 Folders
- `lib/types` — shared TypeScript types mirroring backend DTOs.
- `lib/utils` — pure helpers (formatting, money, dates). No React.
- `lib/providers` — React context/providers (QueryClient, auth, theme).
- `app/` — routes only; co-locate route-specific UI under the route folder.

### 1.4 Component decomposition — no God components
A `page.tsx` is a **thin container**: it wires data hooks, owns only top-level
URL/query state, and *composes* children. Everything else is extracted.

**Hard rules (enforced in review):**
- A `page.tsx` ≤ ~120 lines and ≤ ~6 `useState`. More than that means a
  sub-component or a hook is hiding inside it.
- **Form state lives in a hook,** not the page. Ten `useState` fields →
  one `use<Entity>Form` hook returning `{ values, setField, errors, submit, … }`
  with the zod validation and payload-building inside it. No field-`useState` soup.
- **Open/close state → `useDisclosure()`** (`lib/hooks`). No bespoke
  `const [xOpen, setXOpen] = useState(false)` per modal/dropdown.
- **Presentational pieces are co-located** under `app/<route>/_components/`
  (`<Feature>Toolbar`, `<Feature>Table`, `<Feature>FormModal`, …), each
  props-in / callbacks-out, ≤ ~150 lines, no data fetching.
- **Cross-feature UI is shared,** not copy-pasted: `components/ui/`
  (`ConfirmDialog`, `KebabMenu`, …) and `lib/ui/styles.ts` for the repeated
  inline-style tokens.

**Reference implementation:** `app/dashboard/finance/customers/` — a 410-line,
26-`useState` God page decomposed into a 106-line container (4 `useState`),
`_components/{CustomersToolbar,CustomersTable,CustomerFormModal}`, and the
reusable `useDisclosure` / `useCustomerForm` / `ConfirmDialog` / `KebabMenu`
layer. **Copy this shape when refactoring or building a CRUD page.**

---

## 2. SOLID (applied to React)

- **S — Single Responsibility:** a component either fetches *or* presents, ideally
  not both. A 400-line page that fetches, transforms, and renders three sections
  is three components + one hook.
- **O — Open/Closed:** extend via props/composition and new variants, not by
  adding another `if (variant === ...)` ladder inside one mega-component.
- **L — Liskov:** a `<Button variant="x">` must behave like a button everywhere
  it's used; don't special-case it to swallow clicks.
- **I — Interface Segregation:** components take the **props they use**, not a
  whole entity "just in case". Narrow props = reusable component.
- **D — Dependency Inversion:** components depend on hooks/services (injected via
  imports), never on `fetch`/URLs directly — so the data source can change once.

---

## 3. DRY — one source of truth

- **One API client.** Every network call routes through `lib/api/client.ts`.
  Raw `fetch()` in a component or `process.env.NEXT_PUBLIC_API_URL` in a page is
  a defect — it duplicates auth, refresh, timeout, and error handling that the
  client already does correctly.
  > Live cleanup target: ~10 files still use raw `fetch`, and `NavBar`,
  > `AuthGuard`, and the payslip/interview/offer pages reference the API URL
  > directly. Route them through the client + a service.
- **One query key per resource**, defined once (e.g. `lib/hooks/keys.ts`), so
  invalidation is consistent and typo-proof.
- **One formatter** for money/dates/status — in `lib/utils`, imported everywhere.
  Never re-implement currency formatting per page.
- **Types mirror the backend** in `lib/types`; don't redeclare an `Invoice` shape
  in five components.

---

## 4. Config (Twelve-Factor III, frontend form)

- The **only** runtime config the browser sees is `NEXT_PUBLIC_*` env vars, read
  in exactly one place (`lib/api/client.ts` for the API base URL). Components
  never read `process.env` directly.
- Provide `.env.local.example` listing the `NEXT_PUBLIC_*` keys; never commit real
  `.env.local`.
- The `|| 'http://localhost:3001'` fallback in the client is fine for local dev,
  but production builds must set `NEXT_PUBLIC_API_URL` explicitly — don't let prod
  silently ship the localhost default.
- **Never put secrets in `NEXT_PUBLIC_*`** — anything with that prefix is shipped
  to the browser in plaintext. Secrets stay server-side.

---

## 5. Concurrency & Race Conditions (the real frontend meat)

> The frontend's equivalent of "two requests hit the same row". These bugs are
> silent: stale data wins, a duplicate is created, the UI desyncs from the server.

### 5.1 Stale responses must not win (out-of-order async)
The classic `useEffect` fetch race — type fast in a search box and an **older**
response arrives **after** a newer one, overwriting it. Two correct fixes:
- **Preferred — TanStack Query with the input in the query key.** Query keys make
  responses self-cancelling; the cache only keeps the key you're on.
  ```ts
  useQuery({ queryKey: ['products', { search }], queryFn: () => productService.list({ search }) });
  ```
- **Raw effect (only if you must):** abort the previous request.
  ```ts
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal).catch((e) => { if (e.name !== 'AbortError') setError(e); });
    return () => ctrl.abort();
  }, [search]);
  ```
Never set state from a fetch without guarding that it's still the current one.

### 5.2 No double-submit
- A button that triggers a mutation is **disabled while `isPending`**:
  ```tsx
  <Button disabled={mutation.isPending} onClick={() => mutation.mutate(payload)}>Save</Button>
  ```
- For money/stock actions (create payment, approve, submit production report),
  this is mandatory — the backend now guards these too (backend §5), but the UI
  must not fire two requests in the first place.

### 5.3 Mutations invalidate, they don't hand-patch
- After a successful `useMutation`, `invalidateQueries` the affected keys so the UI
  reflects the server's committed truth — don't manually mutate cached arrays.
  ```ts
  useMutation({ mutationFn: productService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }) });
  ```

### 5.4 Optimistic updates must roll back
- If you optimistically update, snapshot the previous value in `onMutate`, restore
  it in `onError`, and reconcile in `onSettled`. No optimistic update without a
  rollback path.

### 5.5 Single-flight for shared async (already done — keep it)
- `lib/api/client.ts` already de-dupes token refresh via one shared
  `refreshPromise` so a burst of 401s triggers **one** refresh. Reuse this pattern
  for any other "many callers, one in-flight operation" case.

### 5.6 Stale closures
- Effects/callbacks that read state must list it in deps (or use the functional
  updater `setX(prev => ...)`). A handler capturing a stale `count` is a race.

---

## 6. Validation & Errors

- **Validate at the boundary with zod.** One schema per form; parse before
  submit; show field errors inline. (No validation lib is installed yet — add
  `zod` + `react-hook-form`.) Never rely on the backend to be the first validator.
- **Surface errors, don't swallow.** The client throws `ApiError(status, message)`
  — show its message in a toast/inline, branch on `status` (401 → re-auth, 403 →
  not-allowed, 422 → field errors). Never `catch {}` into silence.
- **Money** is integer minor units or a decimal helper in `lib/utils` — never raw
  float math in a component.

---

## 7. UX States & Accessibility

- Every async view handles **loading / empty / error / success** distinctly. An
  empty list and a failed request are not the same screen.
- Accessible by default: real `<button>`/`<a>`, `<label htmlFor>` on inputs,
  visible focus states, keyboard operability, `aria-*` only when semantics need it.
- Respect `prefers-reduced-motion`; don't animate layout-shifting properties (see
  `Pitfalls.MD` §9).

---

## 8. Testing

- Test hooks/services in isolation (mock the client): query keys, error mapping,
  optimistic rollback.
- Test the **race paths**: a search that fires twice resolves to the latest; a
  double-clicked submit fires one mutation.
- A bug fix ships with a test that fails before and passes after.

---

## 9. Conventions

- TypeScript strict; **no `any`** — type API responses via `lib/types`.
- Components `PascalCase`; hooks `useX`; files match the existing folder's
  convention — be consistent within a folder.
- Tailwind for styling; shadcn-ui for primitives; no inline magic numbers for
  z-index/spacing — use the scale (see `Pitfalls.MD` §7).
- Keep `Pitfalls.MD` in mind for fonts, imports, overflow, and aesthetics.
- Commits: imperative, scoped (`feat(dashboard): ...`, `fix(api): ...`).

---

### Reference implementations in this repo
- **The one transport (route everything through it):** `lib/api/client.ts`
  — base URL from env, `ApiError`, `AbortController` timeout, single-flight
  token refresh, 401 retry. This is the §5.5 pattern done right.
- **Services:** `lib/services/*.service.ts`
- **Validation (copy this):** `lib/validation/recruitment.ts` + `lib/validation/helpers.ts`,
  wired into `app/careers/[id]/apply/page.tsx` (zod `safeParse` gate + inline
  field errors). Extend the same pattern to every other form (§6).
- **Tests (copy this):** `lib/api/client.test.ts`, `lib/utils/format.test.ts`,
  `lib/validation/recruitment.test.ts` (Vitest). Add tests alongside new code.
- **Still to fix:** roll `zod` out to the remaining forms; clean the ~295 lint
  errors so CI lint can become a blocking gate.
