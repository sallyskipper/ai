"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { createOrderAction, quoteAction } from "@/actions/orders";
import type { MinPriceResult } from "@/lib/domain/pricing";
import { AGENTS, COACHING_TYPES, COMM_OPTIONS, MAPS, RANKS, REGIONS, rankIndex } from "@/lib/valorant";
import { formatCents } from "@/lib/money";
import { btnClass } from "./ui";
import { Spinner } from "./forms";

type Svc = { slug: string; kind: "SOLO_RANK_UP" | "DUO_RANK_UP" | "COACHING"; name: string; tagline: string; rules: string; bookable: boolean; floorPriceCents: number };

const KIND_COPY = {
  SOLO_RANK_UP: "Solo rank up with an approved provider.",
  DUO_RANK_UP: "You play on your own account with a provider in your party.",
  COACHING: "Improve your own gameplay with an experienced coach.",
};

function RankSelect({ value, onChange, id, min }: { value: string; onChange: (v: string) => void; id: string; min?: string }) {
  const from = min ? rankIndex(min) + 1 : 0;
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {RANKS.slice(from).map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function OrderForm({ services, initialSlug, defaultRegion }: { services: Svc[]; initialSlug?: string; defaultRegion: string }) {
  const firstBookable = services.find((s) => s.bookable)?.slug ?? services[0]?.slug;
  const [slug, setSlug] = useState(services.find((s) => s.slug === initialSlug && s.bookable)?.slug ?? firstBookable);
  const service = services.find((s) => s.slug === slug)!;

  const [region, setRegion] = useState(defaultRegion);
  const [notes, setNotes] = useState("");
  const [deadline, setDeadline] = useState("");
  const [budget, setBudget] = useState("");

  // Rank up
  const [currentRank, setCurrentRank] = useState("Gold 1");
  const [targetRank, setTargetRank] = useState("Platinum 1");
  const [queue, setQueue] = useState<"Competitive" | "Premier">("Competitive");
  const [timeframeDays, setTimeframeDays] = useState(7);
  const [preferences, setPreferences] = useState<string[]>([]);
  // Duo
  const [mode, setMode] = useState<"TARGET_RANK" | "GAMES">("TARGET_RANK");
  const [games, setGames] = useState(5);
  const [server, setServer] = useState("");
  const [schedule, setSchedule] = useState("");
  const [communication, setCommunication] = useState<string[]>(["Discord voice"]);
  // Coaching
  const [coachingType, setCoachingType] = useState("LIVE_1ON1");
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [sessions, setSessions] = useState(1);
  const [agent, setAgent] = useState("");
  const [map, setMap] = useState("");
  const [goals, setGoals] = useState("");

  useEffect(() => {
    if (rankIndex(targetRank) <= rankIndex(currentRank)) setTargetRank(RANKS[Math.min(rankIndex(currentRank) + 1, RANKS.length - 1)]);
  }, [currentRank, targetRank]);

  const details = useMemo(() => {
    if (service.kind === "SOLO_RANK_UP") return { currentRank, desiredRank: targetRank, queue, preferences, timeframeDays };
    if (service.kind === "DUO_RANK_UP")
      return { currentRank, mode, ...(mode === "TARGET_RANK" ? { targetRank } : { games }), server: server || "Any", schedule: schedule || "Flexible", communication };
    return { coachingType, currentRank, sessionMinutes, sessions, agent: agent || undefined, map: map || undefined, goals: goals || "-" };
  }, [service.kind, currentRank, targetRank, queue, preferences, timeframeDays, mode, games, server, schedule, communication, coachingType, sessionMinutes, sessions, agent, map, goals]);

  const [quote, setQuote] = useState<MinPriceResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  useEffect(() => {
    if (!service.bookable) return;
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      const r = await quoteAction(slug, details);
      if (cancelled) return;
      setQuoting(false);
      if (r.ok) { setQuote(r.data!); setQuoteError(null); } else { setQuote(null); setQuoteError(r.error); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [slug, details, service.bookable]);

  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (publish: boolean) => {
    setError(null);
    start(async () => {
      const finalDetails =
        service.kind === "DUO_RANK_UP" ? { ...details, server, schedule } : service.kind === "COACHING" ? { ...details, goals } : details;
      const r = await createOrderAction({ serviceSlug: slug, region, details: finalDetails, notes, deadline, budget, publish });
      if (r && !r.ok) setError(r.error);
    });
  };

  const budgetCents = budget ? Math.round(Number(budget) * 100) : null;
  const budgetTooLow = quote && budgetCents !== null && budgetCents < quote.minPriceCents;
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {/* 1. Service */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold"><span className="text-red">01</span> · Choose a service</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {services.map((s) => (
              <button
                key={s.slug}
                type="button"
                disabled={!s.bookable}
                onClick={() => setSlug(s.slug)}
                className={clsx(
                  "relative rounded-lg border p-4 text-left transition-all",
                  s.slug === slug ? "border-red bg-red/5 shadow-[0_0_0_1px_#E50914]" : "border-line bg-ink hover:border-line-strong",
                  !s.bookable && "cursor-not-allowed opacity-50",
                )}
              >
                <p className="font-display font-semibold">{s.name}</p>
                <p className="mt-1 text-xs text-muted">{KIND_COPY[s.kind]}</p>
                {!s.bookable && <p className="mt-2 text-[11px] font-semibold text-warn">Pending compliance review</p>}
              </button>
            ))}
          </div>
        </section>

        {/* 2. Requirements */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold"><span className="text-red">02</span> · {service.kind === "COACHING" ? "Coaching details" : "Your progression"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Current rank" htmlFor="currentRank"><RankSelect id="currentRank" value={currentRank} onChange={setCurrentRank} /></Field>

            {service.kind === "SOLO_RANK_UP" && (
              <>
                <Field label="Desired rank" htmlFor="targetRank"><RankSelect id="targetRank" value={targetRank} onChange={setTargetRank} min={currentRank} /></Field>
                <Field label="Queue" htmlFor="queue">
                  <select id="queue" className="input" value={queue} onChange={(e) => setQueue(e.target.value as "Competitive")}>
                    <option>Competitive</option><option>Premier</option>
                  </select>
                </Field>
                <Field label="Requested timeframe (days)" htmlFor="tf">
                  <input id="tf" type="number" min={1} max={60} className="input" value={timeframeDays} onChange={(e) => setTimeframeDays(Number(e.target.value))} />
                </Field>
                <div className="sm:col-span-2">
                  <p className="label">Service preferences</p>
                  <div className="flex flex-wrap gap-2">
                    {["Specific agents", "Stream games", "No voice chat", "Offline mode"].map((p) => (
                      <button key={p} type="button" onClick={() => toggle(preferences, p, setPreferences)} className={clsx("rounded-md border px-3 py-1.5 text-sm", preferences.includes(p) ? "border-red/60 bg-red/10 text-text" : "border-line text-muted hover:border-line-strong")}>{p}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {service.kind === "DUO_RANK_UP" && (
              <>
                <Field label="Goal type">
                  <div className="grid grid-cols-2 gap-2">
                    {(["TARGET_RANK", "GAMES"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setMode(m)} className={clsx("h-10 rounded-md border text-sm", mode === m ? "border-red bg-red/10" : "border-line text-muted hover:border-line-strong")}>
                        {m === "TARGET_RANK" ? "Target rank" : "Number of games"}
                      </button>
                    ))}
                  </div>
                </Field>
                {mode === "TARGET_RANK" ? (
                  <Field label="Target rank" htmlFor="targetRank"><RankSelect id="targetRank" value={targetRank} onChange={setTargetRank} min={currentRank} /></Field>
                ) : (
                  <Field label="Number of games" htmlFor="games"><input id="games" type="number" min={1} max={100} className="input" value={games} onChange={(e) => setGames(Number(e.target.value))} /></Field>
                )}
                <Field label="Server" htmlFor="server" hint="e.g. Virginia, Frankfurt"><input id="server" className="input" value={server} onChange={(e) => setServer(e.target.value)} maxLength={60} /></Field>
                <Field label="Preferred play schedule" htmlFor="schedule"><input id="schedule" className="input" placeholder="Weeknights 7–11pm EST" value={schedule} onChange={(e) => setSchedule(e.target.value)} maxLength={300} /></Field>
                <div className="sm:col-span-2">
                  <p className="label">Communication</p>
                  <div className="flex flex-wrap gap-2">
                    {COMM_OPTIONS.map((c) => (
                      <button key={c} type="button" onClick={() => toggle(communication, c, setCommunication)} className={clsx("rounded-md border px-3 py-1.5 text-sm", communication.includes(c) ? "border-red/60 bg-red/10 text-text" : "border-line text-muted hover:border-line-strong")}>{c}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {service.kind === "COACHING" && (
              <>
                <Field label="Coaching type" htmlFor="ctype">
                  <select id="ctype" className="input" value={coachingType} onChange={(e) => setCoachingType(e.target.value)}>
                    {COACHING_TYPES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Session length" htmlFor="len">
                  <select id="len" className="input" value={sessionMinutes} onChange={(e) => setSessionMinutes(Number(e.target.value))}>
                    {[30, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                  </select>
                </Field>
                <Field label="Number of sessions" htmlFor="sessions"><input id="sessions" type="number" min={1} max={20} className="input" value={sessions} onChange={(e) => setSessions(Number(e.target.value))} /></Field>
                <Field label="Agent focus (optional)" htmlFor="agent">
                  <select id="agent" className="input" value={agent} onChange={(e) => setAgent(e.target.value)}>
                    <option value="">Any</option>
                    {AGENTS.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </Field>
                <Field label="Map focus (optional)" htmlFor="map">
                  <select id="map" className="input" value={map} onChange={(e) => setMap(e.target.value)}>
                    <option value="">Any</option>
                    {MAPS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="What do you want to improve?" htmlFor="goals">
                    <textarea id="goals" rows={3} className="input" maxLength={1000} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. I die first in most rounds on attack; want to fix entry timing on Jett." />
                  </Field>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 3. Logistics */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold"><span className="text-red">03</span> · Region, timing & budget</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Region" htmlFor="region">
              <select id="region" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
                {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Deadline (optional)" htmlFor="deadline"><input id="deadline" type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
            <Field label="Your budget (optional, USD)" htmlFor="budget" hint={quote ? `Must be at least ${formatCents(quote.minPriceCents)}` : undefined}>
              <input id="budget" inputMode="decimal" className={clsx("input", budgetTooLow && "border-red")} value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 60" />
            </Field>
            <div className="sm:col-span-3">
              <Field label="Additional requirements" htmlFor="notes" hint="Do not include passwords or account credentials. Redline never asks for them.">
                <textarea id="notes" rows={3} className="input" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </div>
        </section>
      </div>

      {/* Summary */}
      <aside className="xl:sticky xl:top-20 xl:self-start">
        <div className="card overflow-hidden">
          <div className="border-b border-line bg-coal px-5 py-4">
            <p className="text-[11px] font-semibold tracking-wider text-faint uppercase">Order summary</p>
            <p className="mt-1 font-display text-lg font-semibold">{service.name}</p>
            {service.kind !== "COACHING" ? (
              <p className="mt-1 text-sm text-muted">
                {currentRank} → {service.kind === "DUO_RANK_UP" && mode === "GAMES" ? `${games} games` : targetRank}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">{COACHING_TYPES.find((c) => c.code === coachingType)?.name} · {sessions} × {sessionMinutes} min</p>
            )}
          </div>
          <div className="px-5 py-4">
            <div className="flex items-end justify-between">
              <span className="text-sm text-muted">Minimum accepted price</span>
              <span className="flex items-center gap-2 font-display text-2xl font-bold tabular-nums">
                {quoting && <Spinner className="text-faint" />}
                {quote ? formatCents(quote.minPriceCents) : "—"}
              </span>
            </div>
            {quote && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
                {quote.lines.map((l) => (
                  <li key={l.label} className="flex justify-between">
                    <span>{l.label} × {l.quantity}</span>
                    <span className="tabular-nums">{formatCents(l.quantity * l.unitCents)}</span>
                  </li>
                ))}
                {quote.floorCents > quote.computedCents && (
                  <li className="flex justify-between text-warn"><span>Service minimum applies</span><span>{formatCents(quote.floorCents)}</span></li>
                )}
              </ul>
            )}
            {quoteError && <p className="mt-3 text-sm text-red-hot">{quoteError}</p>}
            <p className="mt-4 text-xs text-faint">Providers can offer this price or more — never less. You choose which offer to accept; you won&apos;t be charged until you do.</p>
          </div>
          <div className="border-t border-line px-5 py-4">
            <p className="label">Service rules</p>
            <p className="text-xs whitespace-pre-line text-muted">{service.rules}</p>
          </div>
          <div className="space-y-2 border-t border-line px-5 py-4">
            {error && <p role="alert" className="text-sm text-red-hot">{error}</p>}
            <button type="button" disabled={pending || !quote || !!budgetTooLow} onClick={() => submit(true)} className={clsx(btnClass("primary", "lg"), "w-full")}>
              {pending && <Spinner />} Post order for offers
            </button>
            <button type="button" disabled={pending || !quote} onClick={() => submit(false)} className={clsx(btnClass("secondary"), "w-full")}>
              Save as draft
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
