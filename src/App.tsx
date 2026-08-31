import { useEffect, useRef, useState } from 'react';
import { SCENARIOS, TUTORIAL_CUSTOMER, type Scenario } from '../shared/scenarios';

// ---------- types ----------

interface ChatMessage {
  role: 'customer' | 'employee';
  text: string;
}

interface Evaluation {
  rating: 'nailed_it' | 'solid' | 'missed' | 'off_track';
  headline: string;
  what_worked: string;
  coaching: string;
  other_ideas: string[];
}

type Phase = 'landing' | 'tutorial' | 'chat' | 'done' | 'design';

interface Progress {
  phase: Phase;
  scenarioIndex: number;
  transcripts: Record<string, ChatMessage[]>;
  evaluations: Record<string, Evaluation>;
  skipped: string[];
  submittedName?: string;
}

const STORAGE_KEY = 'ace-helpful-trainer-v2';

const RATING_META: Record<Evaluation['rating'], { label: string; color: string; bg: string }> = {
  nailed_it: { label: 'Nailed it', color: '#1E7A46', bg: '#E7F3EC' },
  solid: { label: 'Solid', color: '#8A6100', bg: '#FBF3DC' },
  missed: { label: 'Missed the moment', color: '#A84300', bg: '#FBEADF' },
  off_track: { label: 'Off track', color: '#B00016', bg: '#FBE3E6' },
};

// ---------- persistence (droppable by design) ----------

function freshProgress(phase: Phase = 'landing'): Progress {
  return { phase, scenarioIndex: 0, transcripts: {}, evaluations: {}, skipped: [] };
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      if (p && typeof p.scenarioIndex === 'number' && Array.isArray(p.skipped) && p.phase !== 'design') return p;
    }
  } catch {
    /* fresh start */
  }
  return freshProgress();
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* fine */
  }
}

// ---------- api ----------

async function api(
  body: object,
): Promise<{ text?: string; offerMade?: boolean; evaluation?: Evaluation; error?: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Something went sideways. Try again.');
  }
  return res.json();
}

// ---------- small pieces ----------

function Avatar({ s, size = 44 }: { s: Scenario; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="avatar"
        style={{ width: size, height: size, background: s.avatarColor, fontSize: size * 0.4 }}
        aria-hidden="true"
      >
        {s.initials}
      </div>
    );
  }
  return (
    <img
      className="avatar avatar-img"
      src={`/avatars/${s.id}.jpg`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

function Dots() {
  return (
    <span className="dots" aria-label="typing">
      <i /> <i /> <i />
    </span>
  );
}

// ---------- app ----------

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [returnPhase, setReturnPhase] = useState<Phase>('landing');

  const update = (patch: Partial<Progress>) => {
    setProgress((prev) => {
      const next = { ...prev, ...patch };
      saveProgress(next);
      return next;
    });
  };

  const scenario = SCENARIOS[progress.scenarioIndex] ?? SCENARIOS[0];

  const advance = (extra: Partial<Progress> = {}) => {
    if (progress.scenarioIndex + 1 < SCENARIOS.length) {
      update({ ...extra, phase: 'chat', scenarioIndex: progress.scenarioIndex + 1 });
    } else {
      update({ ...extra, phase: 'done' });
    }
  };

  const openDesign = () => {
    setReturnPhase(progress.phase);
    setProgress((p) => ({ ...p, phase: 'design' }));
  };
  const closeDesign = () => setProgress((p) => ({ ...p, phase: returnPhase }));

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => update({ phase: 'landing' })} aria-label="Home">
          <span className="brand-mark">H</span>
          <span className="brand-name">Helpful&nbsp;Trainer</span>
        </button>
        {progress.phase === 'chat' && (
          <span className="topbar-step">
            Customer {progress.scenarioIndex + 1} of {SCENARIOS.length}
          </span>
        )}
        {progress.phase === 'tutorial' && <span className="topbar-step">How it works</span>}
        <button className="linkish" onClick={progress.phase === 'design' ? closeDesign : openDesign}>
          {progress.phase === 'design' ? 'Back' : 'Why it works'}
        </button>
      </header>

      {progress.phase === 'landing' && (
        <Landing
          onStart={() => {
            const cleared = freshProgress('tutorial');
            saveProgress(cleared);
            setProgress(cleared);
          }}
        />
      )}

      {progress.phase === 'tutorial' && <Tutorial onDone={() => update({ phase: 'chat' })} />}

      {progress.phase === 'chat' && (
        <Trainer
          key={scenario.id}
          scenario={scenario}
          savedTranscript={progress.transcripts[scenario.id]}
          savedEvaluation={progress.evaluations[scenario.id]}
          isLast={progress.scenarioIndex + 1 >= SCENARIOS.length}
          onTranscript={(msgs) => update({ transcripts: { ...progress.transcripts, [scenario.id]: msgs } })}
          onEvaluated={(ev) => update({ evaluations: { ...progress.evaluations, [scenario.id]: ev } })}
          onRetry={() => {
            const t = { ...progress.transcripts };
            delete t[scenario.id];
            const e = { ...progress.evaluations };
            delete e[scenario.id];
            update({ transcripts: t, evaluations: e });
          }}
          onSkip={() => {
            advance({ skipped: [...progress.skipped.filter((id) => id !== scenario.id), scenario.id] });
          }}
          onNext={() => advance()}
        />
      )}

      {progress.phase === 'done' && (
        <Done
          progress={progress}
          onSubmitted={(name) => update({ submittedName: name })}
          onRestart={() => {
            const cleared = freshProgress('chat');
            saveProgress(cleared);
            setProgress(cleared);
          }}
          onDesign={openDesign}
        />
      )}

      {progress.phase === 'design' && <Design />}

      <footer className="foot">
        A personal training design sample by Andre Johnson, Ace Hardware store manager. Not an
        official Ace Hardware product.
      </footer>
    </div>
  );
}

// ---------- landing ----------

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <main className="card landing">
      <img className="hero" src="/hero.jpg" alt="An Ace associate helping a customer in the aisle" />
      <h1>Helpful Suggestions 101</h1>
      <p className="lede">
        When helping a customer find an item, always remember to suggest another item they may need
        for their project. If they ask for a PVC fitting, suggest glue. If they are buying paint,
        suggest brushes and rollers.
      </p>
      <h2 className="why-head">Why do we do this?</h2>
      <section className="why">
        <h3>It improves the customer experience</h3>
        <p>
          One extra suggestion saves them a second trip to the store, and it shows you care about
          their whole project, not just the item on their list.
        </p>
      </section>
      <section className="why">
        <h3>It improves store performance</h3>
        <p>Every extra dollar added to the average sale is worth about $50,000 at year end.</p>
      </section>
      <button className="btn-primary" onClick={onStart}>
        Let&rsquo;s Practice
      </button>
    </main>
  );
}

// ---------- tutorial ----------

type TutStep =
  | { kind: 'callout'; text: string; next: string }
  | { kind: 'type'; text: string }
  | { kind: 'customer'; text: string }
  | { kind: 'feedback' };

const TUTORIAL_STEPS: TutStep[] = [
  {
    kind: 'callout',
    text: "This is Rita. She wants paint. It's your job to help her find it: type what you'd say to her right here.",
    next: 'Next',
  },
  { kind: 'type', text: "Come on over to the paint counter and we'll get it mixed for you." },
  { kind: 'customer', text: 'Oh wonderful, thank you dear.' },
  {
    kind: 'callout',
    text: 'You may need to ask a follow-up question about the project to figure out the best item to suggest.',
    next: 'Next',
  },
  { kind: 'type', text: 'So are you repainting the whole kitchen?' },
  {
    kind: 'customer',
    text: "The whole thing, floor to ceiling. Honestly I'm just worried about getting paint all over my counters.",
  },
  {
    kind: 'callout',
    text: "There it is. She's worried about the mess, so suggest something that solves it.",
    next: 'Next',
  },
  {
    kind: 'type',
    text: "Then let's grab you a drop cloth and some painter's tape. Your counters will never know it happened.",
  },
  { kind: 'customer', text: 'Perfect. Drop cloth and tape it is, my counters thank you!' },
  {
    kind: 'callout',
    text: "Sometimes the customer will want the extra item, sometimes they won't. Either way it's a win, because either way we were helpful.",
    next: 'Next',
  },
  { kind: 'feedback' },
];

const TUTORIAL_FEEDBACK: Evaluation = {
  rating: 'nailed_it',
  headline: 'Found the paint, asked one good question, and saved her counters.',
  what_worked:
    'You helped with the paint first, and your follow-up question surfaced what Rita was actually worried about, so the drop cloth and tape landed as help, not a pitch.',
  coaching: 'That is the whole rep. Answer, ask if you need to, offer one thing that fits.',
  other_ideas: [
    'A roller and tray set, since a whole kitchen is a lot of wall',
    'Stir sticks and a can opener, small stuff people forget',
  ],
};

function Tutorial({ onDone }: { onDone: () => void }) {
  const scenario = TUTORIAL_CUSTOMER;
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'customer', text: scenario.opener }]);
  const [draft, setDraft] = useState('');
  const [customerTyping, setCustomerTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const current = TUTORIAL_STEPS[step];
  const showFeedback = current?.kind === 'feedback';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, draft, step, customerTyping]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (current.kind === 'type') {
      const text = current.text;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i = reduced ? text.length : i + 1;
        setDraft(text.slice(0, i));
        if (i < text.length) {
          timers.push(setTimeout(tick, 28));
        } else {
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              setDraft('');
              setMessages((m) => [...m, { role: 'employee', text }]);
              setStep((s) => s + 1);
            }, 500),
          );
        }
      };
      timers.push(setTimeout(tick, 500));
    }

    if (current.kind === 'customer') {
      setCustomerTyping(true);
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setCustomerTyping(false);
          setMessages((m) => [...m, { role: 'customer', text: current.text }]);
          setStep((s) => s + 1);
        }, 900),
      );
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <main className="trainer">
      <div className="persona-strip">
        <Avatar s={scenario} />
        <div>
          <strong>{scenario.name}</strong>
          <span className="persona-bio">Came in for {scenario.item}</span>
        </div>
      </div>

      <div className="chat" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble-row ${m.role}`}>
            {m.role === 'customer' && <Avatar s={scenario} size={28} />}
            <div className={`bubble ${m.role}`}>{m.text}</div>
          </div>
        ))}
        {customerTyping && (
          <div className="bubble-row customer">
            <Avatar s={scenario} size={28} />
            <div className="bubble customer">
              <Dots />
            </div>
          </div>
        )}
        {showFeedback && (
          <div className="feedback tut-feedback">
            <span
              className="rating-pill"
              style={{ color: RATING_META.nailed_it.color, background: RATING_META.nailed_it.bg }}
            >
              {RATING_META.nailed_it.label}
            </span>
            <h2>{TUTORIAL_FEEDBACK.headline}</h2>
            <p>
              <strong>What worked:</strong> {TUTORIAL_FEEDBACK.what_worked}
            </p>
            <p>
              <strong>Coach&rsquo;s note:</strong> {TUTORIAL_FEEDBACK.coaching}
            </p>
            <div className="ideas">
              <strong>Also would&rsquo;ve landed:</strong>
              <ul>
                {TUTORIAL_FEEDBACK.other_ideas.map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {current?.kind === 'callout' && (
        <div className="callout">
          <p>{current.text}</p>
          <button className="btn-primary callout-next" onClick={() => setStep((s) => s + 1)}>
            {current.next}
          </button>
        </div>
      )}

      {showFeedback ? (
        <div className="callout">
          <p>After every customer, your coach tells you how the suggestion landed. Ready?</p>
          <button className="btn-primary callout-next" onClick={onDone}>
            Your turn
          </button>
        </div>
      ) : (
        <div className="composer">
          <div className="input-row">
            <textarea value={draft} readOnly placeholder="How do you respond?" rows={2} aria-label="Demo chat input" />
            <button className="btn-send" disabled aria-label="Send">
              &#10148;
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ---------- trainer ----------

function Trainer(props: {
  scenario: Scenario;
  savedTranscript?: ChatMessage[];
  savedEvaluation?: Evaluation;
  isLast: boolean;
  onTranscript: (msgs: ChatMessage[]) => void;
  onEvaluated: (ev: Evaluation) => void;
  onRetry: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  const { scenario } = props;
  const [messages, setMessages] = useState<ChatMessage[]>(
    props.savedTranscript?.length ? props.savedTranscript : [{ role: 'customer', text: scenario.opener }],
  );
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'reply' | 'evaluate' | null>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const evaluation = props.savedEvaluation;
  const employeeTurns = messages.filter((m) => m.role === 'employee').length;
  const MAX_EMPLOYEE_TURNS = 4;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, evaluation]);

  async function evaluate(msgs: ChatMessage[]) {
    setEnded(true);
    setBusy('evaluate');
    setError('');
    try {
      const { evaluation: ev } = await api({ scenarioId: scenario.id, messages: msgs, mode: 'evaluate' });
      if (ev) props.onEvaluated(ev);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || ended || evaluation) return;
    const withMine: ChatMessage[] = [...messages, { role: 'employee', text }];
    setMessages(withMine);
    props.onTranscript(withMine);
    setDraft('');
    setError('');
    setBusy('reply');
    let finalMsgs = withMine;
    let offered = false;
    try {
      const { text: bounce, offerMade } = await api({ scenarioId: scenario.id, messages: withMine, mode: 'reply' });
      offered = offerMade === true;
      if (bounce) {
        finalMsgs = [...withMine, { role: 'customer', text: bounce }];
        setMessages(finalMsgs);
        props.onTranscript(finalMsgs);
      }
    } catch {
      // The bounce is color, not substance. If it fails, count the turn and move on.
    }
    const turns = withMine.filter((m) => m.role === 'employee').length;
    if (offered || turns >= MAX_EMPLOYEE_TURNS) {
      await evaluate(finalMsgs);
    } else {
      setBusy(null);
    }
  };

  return (
    <main className="trainer">
      <div className="persona-strip">
        <Avatar s={scenario} />
        <div>
          <strong>{scenario.name}</strong>
          <span className="persona-bio">Came in for {scenario.item}</span>
        </div>
        {!ended && !evaluation && (
          <button className="linkish skip" onClick={props.onSkip}>
            Skip
          </button>
        )}
      </div>

      <div className="chat" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble-row ${m.role}`}>
            {m.role === 'customer' && <Avatar s={scenario} size={28} />}
            <div className={`bubble ${m.role}`}>{m.text}</div>
          </div>
        ))}
        {busy === 'reply' && (
          <div className="bubble-row customer">
            <Avatar s={scenario} size={28} />
            <div className="bubble customer">
              <Dots />
            </div>
          </div>
        )}
        {busy === 'evaluate' && <p className="thinking">Your coach is looking it over&hellip;</p>}
        {error && (
          <div className="error-block">
            <p className="error">{error}</p>
            <button className="btn-secondary" onClick={() => evaluate(messages)}>
              Try the feedback again
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!ended && !evaluation ? (
        <div className="composer">
          <div className="input-row">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={employeeTurns === 0 ? 'How do you respond?' : 'Keep helping…'}
              rows={2}
              disabled={busy !== null}
            />
            <button className="btn-send" onClick={send} disabled={busy !== null || !draft.trim()} aria-label="Send">
              &#10148;
            </button>
          </div>
        </div>
      ) : (
        evaluation && (
          <Feedback ev={evaluation} isLast={props.isLast} onRetry={props.onRetry} onNext={props.onNext} />
        )
      )}
    </main>
  );
}

// ---------- feedback ----------

function Feedback({
  ev,
  isLast,
  onRetry,
  onNext,
}: {
  ev: Evaluation;
  isLast: boolean;
  onRetry: () => void;
  onNext: () => void;
}) {
  const meta = RATING_META[ev.rating] ?? RATING_META.solid;
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  return (
    <div className="feedback" ref={cardRef}>
      <span className="rating-pill" style={{ color: meta.color, background: meta.bg }}>
        {meta.label}
      </span>
      <h2>{ev.headline}</h2>
      {ev.what_worked && (
        <p>
          <strong>What worked:</strong> {ev.what_worked}
        </p>
      )}
      {ev.coaching && (
        <p>
          <strong>Coach&rsquo;s note:</strong> {ev.coaching}
        </p>
      )}
      {ev.other_ideas?.length > 0 && (
        <div className="ideas">
          <strong>Also would&rsquo;ve landed:</strong>
          <ul>
            {ev.other_ideas.map((idea, i) => (
              <li key={i}>{idea}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="feedback-actions">
        <button className="btn-secondary" onClick={onRetry}>
          Run it again
        </button>
        <button className="btn-primary" onClick={onNext}>
          {isLast ? 'Wrap up' : 'Next customer'}
        </button>
      </div>
    </div>
  );
}

// ---------- done ----------

function Done({
  progress,
  onSubmitted,
  onRestart,
  onDesign,
}: {
  progress: Progress;
  onSubmitted: (name: string) => void;
  onRestart: () => void;
  onDesign: () => void;
}) {
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const clean = name.trim();
    if (!clean || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clean,
          results: SCENARIOS.map((s) => ({
            customer: s.name,
            rating: progress.evaluations[s.id]?.rating ?? (progress.skipped.includes(s.id) ? 'skipped' : 'none'),
          })),
        }),
      });
      if (!res.ok) throw new Error();
      onSubmitted(clean);
    } catch {
      setError('That did not go through. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="card landing">
      <p className="kicker">That&rsquo;s the whole thing</p>
      <h1>Three customers, three saved trips.</h1>
      <ul className="recap">
        {SCENARIOS.map((s) => {
          const ev = progress.evaluations[s.id];
          const meta = ev ? (RATING_META[ev.rating] ?? RATING_META.solid) : null;
          const wasSkipped = progress.skipped.includes(s.id);
          return (
            <li key={s.id}>
              <Avatar s={s} size={32} />
              <span className="recap-name">{s.name}</span>
              {meta ? (
                <span className="rating-pill small" style={{ color: meta.color, background: meta.bg }}>
                  {meta.label}
                </span>
              ) : wasSkipped ? (
                <span className="rating-pill small muted">Skipped</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {progress.submittedName ? (
        <div className="submit-box submitted">
          <h3>Submitted</h3>
          <p>
            Nice work, {progress.submittedName}. Your completion is recorded so your manager knows
            this training is done.
          </p>
        </div>
      ) : (
        <div className="submit-box">
          <h3>Submit your completion</h3>
          <p>Enter your name so your manager knows you finished the training.</p>
          <div className="submit-row">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="Your name"
              maxLength={80}
              autoComplete="name"
            />
            <button className="btn-primary submit-btn" onClick={submit} disabled={sending || !name.trim()}>
              {sending ? 'Submitting…' : 'Submit'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      <button className="linkish sub" onClick={onDesign}>
        Why it&rsquo;s built this way
      </button>
      <button className="linkish sub" onClick={onRestart}>
        Run all three again
      </button>
    </main>
  );
}

// ---------- design rationale ----------

function Design() {
  return (
    <main className="card design">
      <p className="kicker">Design notes</p>
      <h1>Why it&rsquo;s built this way</h1>

      <section>
        <h3>One rep, drilled</h3>
        <p>
          This trains exactly one behavior: a customer asks for a product, you answer, and you
          offer one item that goes with it. Ask about their project first if that helps you land
          on something useful; the conversation runs until you&rsquo;ve made an offer. No branching
          plots, no puzzles. The scenario is the product. Keeping the rep small is what makes it
          repeatable, and repeatable is what makes it a habit.
        </p>
      </section>

      <section>
        <h3>It lives on the floor</h3>
        <p>
          Training that requires a back room and a spare hour doesn&rsquo;t happen. We need people
          on the floor. This runs on a scan gun, a floor terminal, or a phone, one customer at a
          time, about forty seconds each. And it&rsquo;s droppable: a real customer walks up, you
          set it down, help them, and pick up exactly where you left off. Progress saves itself.
        </p>
      </section>

      <section>
        <h3>Practice beats presentation</h3>
        <p>
          Click-next modules test whether you can find the Next button. Here you type what
          you&rsquo;d actually say, and the feedback responds to <em>your</em> words. That&rsquo;s
          retrieval practice on the real behavior: the same rep you&rsquo;ll perform an hour later
          in aisle 12.
        </p>
      </section>

      <section>
        <h3>Helping, not selling</h3>
        <p>
          The feedback runs on one acid test: <strong>would the customer have had to make a second
          trip without this item?</strong> If yes, suggesting it is service. If no, it&rsquo;s an
          upsell wearing a helpful costume, and the coach scores it that way. There&rsquo;s no
          answer key. Any item that genuinely fits, framed around how it gets used, wins.
        </p>
      </section>

      <section>
        <h3>Almost nothing to read</h3>
        <p>
          A few sentences up front, then a customer. Every paragraph of preamble costs completions,
          and a training tool nobody finishes teaches nobody anything. The theory lives back here,
          where the curious can find it, not in front of the learner.
        </p>
      </section>

      <section>
        <h3>Where it would go next</h3>
        <p>
          More products, rotated daily so the rep never goes stale. Voices for the customers. A
          manager view of common misses across the team. Then a more advanced tool for a harder
          skill: scenarios where the customer&rsquo;s real problem hides behind their question, and
          the practice is finding the project behind the purchase. This one stays focused on the
          single rep.
        </p>
      </section>

      <p className="byline">
        Built by Andre Johnson, Ace Hardware store manager. The suggestion habit is the cheapest
        revenue and loyalty lever on my floor, and the least practiced.
      </p>
    </main>
  );
}
