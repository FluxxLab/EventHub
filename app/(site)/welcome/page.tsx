import {
  BanknotesIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ComputerDesktopIcon,
  LanguageIcon,
  LifebuoyIcon,
  QrCodeIcon,
  SparklesIcon,
  TicketIcon,
} from '@heroicons/react/24/outline';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DemoForm } from '@/components/site/demo-form';
import { NewsletterForm } from '@/components/site/newsletter-form';
import { buttonClass } from '@/components/ui/button';
import { SALES_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: 'PIC Events · Event software for Nigerian organisers' },
  description: 'Registration, naira ticketing, check-in, badges, live sessions in Nigerian languages and sponsor leads, in one platform from the Policy Innovation Centre.',
};

/*
 * The product site's home page, from the "home-template" design: a light page (#F6F6F6) with a
 * white navigation bar, a split hero (copy and demo form left, product picture right) and feature
 * rows that alternate sides. Adapted to PIC: navy for actions, text no heavier than medium, and the
 * pictures are the product itself (built from its own screens' parts), not stock photos.
 */

const NAV = [
  { href: '#features', label: 'Features', icon: ComputerDesktopIcon, caret: true },
  { href: '#why', label: 'Why us', icon: SparklesIcon },
  { href: '#plans', label: 'Pricing', icon: BanknotesIcon },
  { href: '#contact', label: 'Support', icon: LifebuoyIcon },
];

export default function WelcomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-[#f6f6f6] text-ink">
      <NavBar />
      <Hero />
      <Features />
      <Plans />
      <FooterSection />
    </div>
  );
}

/* ------------------------------------------------------------------ navigation */

function NavBar() {
  return (
    <header className="sticky top-0 z-20 flex h-24 w-full items-center justify-between gap-6 border-b border-[#f1f1f1] bg-background px-5 md:px-20">
      <Link href="/welcome" className="flex items-center gap-1">
        <span className="flex size-12 items-center justify-center rounded-lg p-1">
          <Image src="/pic-logo.png" alt="" width={40} height={40} className="size-10 object-contain" priority />
        </span>
        <span className="text-base font-medium">PIC Events</span>
      </Link>
      <nav aria-label="Site" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
        {NAV.map(({ href, label, icon: Icon, caret }) => (
          <a key={href} href={href} className="flex items-center gap-1 rounded p-3 text-sm font-medium hover:bg-[#f1f1f1]">
            <Icon className="size-5" aria-hidden />
            {label}
            {caret && <ChevronDownIcon className="size-3" aria-hidden />}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <Link href="/sign-in" className="text-sm hover:underline">
          Log in
        </Link>
        <a href="#demo" className={buttonClass({ style: 'outline', color: 'primary', className: 'h-10' })}>
          Book a demo
        </a>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="relative isolate w-full max-w-[1440px] overflow-hidden">
      {/* the template's soft radial light from the top */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(59%_59%_at_50%_3%,#e3e6ec_0%,#f6f6f6_100%)]" aria-hidden />
      <div className="grid lg:min-h-[600px] lg:grid-cols-2">
        <div id="demo" className="flex scroll-mt-28 flex-col items-start justify-center gap-5 px-5 py-12 md:px-20">
          <h1 className="max-w-[560px] text-4xl font-medium leading-tight tracking-[-0.02em] text-balance md:text-5xl md:leading-[60px]">Run your whole event on one platform, priced in naira</h1>
          <p className="max-w-[560px] text-lg leading-[30px] text-[#525252] md:text-xl">
            Registration, ticketing, check-in, badges, live sessions and sponsor leads, built by the Policy Innovation Centre for events in Nigeria.
          </p>
          <DemoForm />
        </div>
        <div className="flex items-center p-6">
          <HeroPicture />
        </div>
      </div>
    </section>
  );
}

/** The console's dashboard card beside the delegate app's ticket: what an organiser and a delegate each see. */
function HeroPicture() {
  return (
    <Frame className="relative min-h-[420px] w-full lg:h-[552px]">
      <div className="absolute left-6 right-6 top-6 rounded-lg border border-border bg-surface shadow-sm sm:right-auto sm:w-[78%]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium">GS-27 Gender and Inclusion Summit</p>
          <span className="rounded-full border border-success bg-success-soft px-2 text-xs text-success">Live</span>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {[
            ['Tickets sold', '2,418'],
            ['Checked in', '1,976'],
            ['Sponsor leads', '612'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-surface-soft p-3">
              <p className="text-xs text-[#7c7c7c]">{label}</p>
              <p className="mt-1 text-xl font-medium tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col px-4 pb-4 text-sm">
          {[
            ['09:00', 'Opening plenary', 'Main Hall', 'On now'],
            ['10:30', 'Digital IDs and the last mile', 'Hall A', 'Next'],
            ['12:00', 'Women in trade finance', 'Hall B', 'Later'],
          ].map(([time, title, room, state]) => (
            <div key={title} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-t border-divider py-2">
              <span className="tabular-nums text-[#7c7c7c]">{time}</span>
              <span className="truncate">
                {title} <span className="text-[#7c7c7c]">· {room}</span>
              </span>
              <span className={state === 'On now' ? 'text-xs text-success' : 'text-xs text-[#7c7c7c]'}>{state}</span>
            </div>
          ))}
        </div>
      </div>
      <Phone className="absolute bottom-6 right-6 hidden sm:flex">
        <TicketCard />
      </Phone>
    </Frame>
  );
}

/* ------------------------------------------------------------------ features */

function Features() {
  return (
    <section id="features" className="flex w-full max-w-[1440px] scroll-mt-24 flex-col items-center py-12">
      <div className="flex flex-col items-center gap-2.5 px-5 py-6 text-center">
        <h2 className="text-4xl font-medium tracking-[-0.02em] md:text-6xl md:leading-[72px]">Everything the day needs</h2>
        <p className="text-lg text-[#7c7c7c]">From the first ticket to the last certificate.</p>
      </div>

      <FeatureRow
        title="Tickets people pay for in naira"
        text="Ticket types, vouchers and invitations, paid through Flutterwave. Delegates get a signed QR ticket in the app and by email."
        picture={<TicketPicture />}
        action={
          <a href="#plans" className={buttonClass({ className: 'h-10' })}>
            <TicketIcon className="size-5" aria-hidden />
            See pricing
          </a>
        }
      />
      <FeatureRow
        flip
        title="Check-in in seconds"
        text="A staffed desk and a self check-in kiosk, both reading the same QR. The badge prints as the delegate walks up."
        picture={<CheckInPicture />}
        action={
          <Checklist
            items={['Scan with any laptop camera or a hand scanner', 'Badges printed silently, no print dialog', 'Your own badge design and artwork', 'Venue screens with what is on in every room']}
          />
        }
      />
      <FeatureRow
        title="Sessions in the languages people speak"
        text="Live captions translated into Hausa, Igbo, Yoruba, Nigerian Pidgin and French, beside questions from the floor, polls and moderated discussion."
        picture={<CaptionsPicture />}
        action={
          <p className="flex items-center gap-2 text-sm text-[#525252]">
            <LanguageIcon className="size-5 text-primary" aria-hidden />
            Five languages, live, on every delegate’s phone
          </p>
        }
      />
      <FeatureRow
        flip
        title="Sponsors leave with their leads"
        text="Each exhibition booth gets its own link to scan delegates’ badges. Sponsors take away a lead report; organisers see which booths drew the room."
        picture={<LeadsPicture />}
        action={<Checklist items={['A private scanning link per booth', 'Name, role, organisation and email, with consent', 'A report per sponsor after the event']} />}
      />
    </section>
  );
}

function FeatureRow({ title, text, picture, action, flip = false }: { title: string; text: string; picture: ReactNode; action?: ReactNode; flip?: boolean }) {
  return (
    <div className="grid w-full lg:min-h-[450px] lg:grid-cols-2">
      <div className={`flex flex-col items-start justify-center gap-3 px-5 py-10 md:px-20 lg:py-12 ${flip ? 'lg:order-2' : ''}`}>
        <h3 className="max-w-[560px] text-3xl font-medium tracking-[-0.02em] text-balance md:text-5xl md:leading-[60px]">{title}</h3>
        <p className="max-w-[560px] text-lg leading-7 text-[#525252]">{text}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
      <div className={`flex p-4 ${flip ? 'lg:order-1' : ''}`}>{picture}</div>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-1.5 text-sm">
          <CheckCircleIcon className="size-8 shrink-0 text-success" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ pictures, from the product's own parts */

function Frame({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`overflow-hidden rounded-xl bg-[#e8ebf1] ${className}`}>{children}</div>;
}

function Phone({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`w-[220px] flex-col gap-3 rounded-[28px] border-[6px] border-ink bg-surface p-3 shadow-xl ${className}`}>
      <div className="mx-auto h-1.5 w-16 rounded-full bg-divider" aria-hidden />
      {children}
    </div>
  );
}

/** A QR-like grid, drawn as a picture only: not a scannable code. */
function FakeQr({ size = 120 }: { size?: number }) {
  const cells = Array.from({ length: 121 }, (_, i) => ((i * 7919) % 13 < 6 ? 1 : 0) as number);
  return (
    <div className="grid grid-cols-11 gap-px rounded bg-white p-1.5" style={{ width: size, height: size }} aria-hidden>
      {cells.map((on, i) => (
        <span key={i} className={on ? 'bg-ink' : 'bg-white'} />
      ))}
    </div>
  );
}

function TicketCard() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-3 text-center">
      <p className="text-xs text-[#7c7c7c]">GS-27 · Delegate</p>
      <FakeQr size={116} />
      <p className="text-sm font-medium">Hauwa Bello</p>
      <p className="text-xs text-[#7c7c7c]">7–8 Sep · Transcorp Hilton, Abuja</p>
    </div>
  );
}

function TicketPicture() {
  return (
    <Frame className="flex min-h-[340px] w-full items-center justify-center gap-6 p-6 lg:h-[418px]">
      <Phone className="flex">
        <TicketCard />
      </Phone>
      <div className="hidden w-56 flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm sm:flex">
        <p className="text-sm font-medium">Order paid</p>
        {[
          ['Delegate × 2', '₦90,000'],
          ['Voucher GS27-NGO', '−₦18,000'],
        ].map(([a, b]) => (
          <p key={a} className="flex justify-between text-sm">
            <span className="text-[#525252]">{a}</span>
            <span className="tabular-nums">{b}</span>
          </p>
        ))}
        <p className="flex justify-between border-t border-divider pt-2 text-sm font-medium">
          <span>Total</span>
          <span className="tabular-nums">₦72,000</span>
        </p>
      </div>
    </Frame>
  );
}

function CheckInPicture() {
  return (
    <Frame className="flex min-h-[340px] w-full items-center justify-center gap-6 p-6 lg:h-[418px]">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
        <QrCodeIcon className="size-10 text-primary" aria-hidden />
        <CheckCircleIcon className="-mt-2 size-14 text-success" aria-hidden />
        <div>
          <p className="text-xs uppercase tracking-widest text-success">You’re checked in</p>
          <p className="mt-1 text-2xl font-medium">Welcome, Ibrahim!</p>
        </div>
        <div className="w-40 rounded-md border border-border p-3 text-left shadow-sm">
          <div className="h-2 w-12 rounded bg-primary" aria-hidden />
          <p className="mt-3 text-sm font-medium">Ibrahim Musa</p>
          <p className="text-xs text-[#7c7c7c]">Kano State Ministry of Women Affairs</p>
          <p className="mt-3 inline-block rounded-full bg-primary px-2 text-[10px] uppercase tracking-wide text-on-primary">Speaker</p>
        </div>
        <p className="text-xs text-[#7c7c7c]">Printing your badge…</p>
      </div>
    </Frame>
  );
}

function CaptionsPicture() {
  const lines: [string, string][] = [
    ['EN', 'Inclusion that scales has to mean budget lines, not pilots.'],
    ['HA', 'Haɗa kowa da kowa yana nufin kasafin kuɗi, ba gwaji kawai ba.'],
    ['YO', 'Ìfisí tó gbòòrò gbọ́dọ̀ túmọ̀ sí ìnáwó, kì í ṣe àdánwò lásán.'],
  ];
  return (
    <Frame className="flex min-h-[340px] w-full items-center justify-center p-6 lg:h-[418px]">
      <Phone className="flex w-[260px]">
        <p className="text-xs text-[#7c7c7c]">Main Hall · Live</p>
        <p className="text-sm font-medium">Opening plenary</p>
        <div className="flex gap-1 text-[10px]">
          {['EN', 'HA', 'IG', 'YO', 'PCM', 'FR'].map((l, i) => (
            <span key={l} className={i === 1 ? 'rounded-full bg-primary px-1.5 py-0.5 text-on-primary' : 'rounded-full bg-surface-soft px-1.5 py-0.5 text-[#525252]'}>
              {l}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-surface-soft p-2.5">
          {lines.map(([code, text]) => (
            <p key={code} className="text-xs leading-5">
              <span className="mr-1 text-[#7c7c7c]">{code}</span>
              {text}
            </p>
          ))}
        </div>
        <p className="text-[10px] text-[#7c7c7c]">Live captions, generated automatically. Example translations.</p>
      </Phone>
    </Frame>
  );
}

function LeadsPicture() {
  return (
    <Frame className="flex min-h-[340px] w-full items-center justify-center p-6 lg:h-[418px]">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Booth 14 · Leads</p>
          <span className="text-xs text-[#7c7c7c] tabular-nums">48 today</span>
        </div>
        {[
          ['Ngozi Eze', 'Programme Lead, UN Women Nigeria'],
          ['Samuel Adeyemi', 'Lecturer, Lagos Business School'],
          ['Chioma Okafor', 'Founder, Safe Rides NG'],
          ['Kwame Mensah', 'Economist, AfDB'],
        ].map(([name, role]) => (
          <div key={name} className="flex items-center gap-3 border-t border-divider px-4 py-2.5 first:border-t-0">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs text-primary">
              {name
                .split(' ')
                .map((w) => w[0])
                .join('')}
            </span>
            <div className="min-w-0">
              <p className="text-sm">{name}</p>
              <p className="truncate text-xs text-[#7c7c7c]">{role}</p>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ plans and footer */

const PLANS = [
  { name: 'Single event', who: 'A one-off conference or summit', items: ['Registration, naira ticketing, check-in', 'Delegate app for the event', 'Badges and venue screens'] },
  { name: 'Organisation', who: 'Several events a year', items: ['Everything in Single event', 'Email campaigns and certificates', 'Sponsor leads and reports'] },
  { name: 'Summit', who: 'Flagship, multi-day, multi-room', items: ['Everything in Organisation', 'Live translated captions', 'On-site support and your branding'] },
];

function Plans() {
  return (
    <section id="plans" className="flex w-full max-w-[1440px] scroll-mt-24 flex-col gap-8 px-5 py-16 md:px-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-medium tracking-[-0.02em] md:text-5xl">Priced in naira, billed in naira</h2>
        <p className="max-w-2xl text-lg text-[#525252]">No dollar card, no exchange-rate surprises. Tell us about your event and we will quote for it.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div key={plan.name} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6">
            <div>
              <p className="text-xl font-medium">{plan.name}</p>
              <p className="text-sm text-[#7c7c7c]">{plan.who}</p>
            </div>
            <Checklist items={plan.items} />
          </div>
        ))}
      </div>
      <a href="#demo" className={buttonClass({ className: 'h-10 self-start' })}>
        Get a quote
      </a>
    </section>
  );
}

/** The template's footer section: the newsletter band, then the footer's brand block and link columns. */
function FooterSection() {
  return (
    <div className="flex w-full flex-col items-center gap-3 pt-20">
      <Newsletter />
      <Footer />
    </div>
  );
}

function Newsletter() {
  return (
    <section aria-labelledby="newsletter-title" className="grid w-full max-w-[1440px] rounded-[20px] lg:min-h-[418px] lg:grid-cols-2">
      <div className="flex flex-col items-start gap-5 rounded-2xl px-5 py-12 md:px-20">
        <span className="flex size-20 items-center justify-center rounded-lg p-1">
          <Image src="/pic-logo.png" alt="" width={72} height={72} className="size-[72px] object-contain" />
        </span>
        <h2 id="newsletter-title" className="max-w-[420px] text-3xl font-medium leading-[44px] tracking-[-0.02em] text-balance md:text-4xl">
          Notes for people who run events
        </h2>
        <p className="max-w-[420px] text-lg leading-[30px] text-[#525252] md:text-xl">What worked at PIC’s summits, and what is new in PIC Events. Monthly, at most.</p>
        <NewsletterForm />
      </div>
      <div className="flex p-4">
        <DisplayBoardPicture />
      </div>
    </section>
  );
}

/** The venue display board: every room, what is on now and what is next. */
function DisplayBoardPicture() {
  const rows: [string, string, string, string][] = [
    ['Main Hall', 'Opening plenary', '15 min left', '12:00 Lunch'],
    ['Hall A', 'Digital IDs and the last mile', 'On now', '14:00 Data for inclusion'],
    ['Hall B', 'Nothing on', 'Free', '13:00 Women in trade finance'],
  ];
  return (
    <div className="flex min-h-[320px] w-full items-center justify-center rounded-2xl bg-[#525252] p-6 lg:h-[386px]">
      <div className="w-full max-w-lg rounded-lg bg-surface p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/pic-logo.png" alt="" width={28} height={28} className="size-7 object-contain" />
            <p className="text-sm font-medium">Day 1 · rooms</p>
          </div>
          <p className="text-2xl font-medium tabular-nums">10:45</p>
        </div>
        <div className="mt-3 grid grid-cols-[5rem_1fr_auto] gap-x-3 text-xs">
          {['Room', 'Now', 'Up next'].map((h) => (
            <span key={h} className="pb-1.5 text-[#7c7c7c]">
              {h}
            </span>
          ))}
          {rows.map(([room, now, status, next]) => (
            <div key={room} className="col-span-3 grid grid-cols-subgrid items-center border-t border-divider py-2">
              <span className="font-medium">{room}</span>
              <span className="min-w-0 truncate">
                {now}{' '}
                <span className={status === 'Free' ? 'ml-1 rounded-full border border-border px-1.5 text-[10px] text-[#7c7c7c]' : 'ml-1 rounded-full border border-success bg-success-soft px-1.5 text-[10px] text-success'}>{status}</span>
              </span>
              <span className="truncate text-[#525252]">{next}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#plans' },
      { label: 'Book a demo', href: '#demo' },
      { label: 'Log in', href: '/sign-in' },
    ],
  },
  {
    title: 'For organisers',
    links: [
      { label: 'Naira ticketing', href: '#features' },
      { label: 'Check-in and badges', href: '#features' },
      { label: 'Live captions', href: '#features' },
      { label: 'Sponsor leads', href: '#features' },
    ],
  },
  {
    title: 'For delegates',
    links: [
      { label: 'Your ticket', href: '#features' },
      { label: 'Captions in your language', href: '#features' },
    ],
  },
];

function Footer() {
  return (
    <footer id="contact" className="w-full scroll-mt-24 bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 px-5 py-6 md:flex-row md:justify-between md:gap-12 md:px-20">
        <div className="flex max-w-[300px] flex-col gap-3">
          <div className="flex items-center gap-1">
            <Image src="/pic-logo.png" alt="" width={32} height={32} className="size-8 object-contain" />
            <span className="text-base font-medium">PIC Events</span>
          </div>
          <p className="text-xs leading-[18px] text-[#7c7c7c]">
            Event software from the Policy Innovation Centre, built for conferences and summits in Nigeria: naira ticketing, check-in, live sessions in Nigerian languages and sponsor leads.
          </p>
          {SALES_EMAIL && <p className="select-all text-sm text-[#525252]">{SALES_EMAIL}</p>}
          <p className="text-xs text-[#7c7c7c]">© {new Date().getFullYear()} Policy Innovation Centre</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:gap-16">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-2">
              <p className="text-base font-medium text-primary">{col.title}</p>
              {col.links.map((link) =>
                link.href.startsWith('/') ? (
                  <Link key={link.label} href={link.href} className="text-sm hover:underline">
                    {link.label}
                  </Link>
                ) : (
                  <a key={link.label} href={link.href} className="text-sm hover:underline">
                    {link.label}
                  </a>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
