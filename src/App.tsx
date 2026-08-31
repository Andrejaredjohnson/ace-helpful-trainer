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
  savedAt?: number;
}

/** Resume a dropped session only briefly; a stale open starts at the beginning. */
const RESUME_WINDOW_MS = 30 * 60 * 1000;

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
      const fresh = typeof p.savedAt === 'number' && Date.now() - p.savedAt < RESUME_WINDOW_MS;
      if (p && typeof p.scenarioIndex === 'number' && Array.isArray(p.skipped) && p.phase !== 'design' && fresh) {
        return p;
      }
    }
  } catch {
    /* fresh start */
  }
  return freshProgress();
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, savedAt: Date.now() }));
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

  const chatMode = progress.phase === 'chat' || progress.phase === 'tutorial';

  // Keep the chat screen sized to the visible viewport so the mobile keyboard
  // compresses the layout instead of pushing the conversation out of view.
  useEffect(() => {
    if (!chatMode || !window.visualViewport) return;
    const vv = window.visualViewport;
    const apply = () => {
      document.documentElement.style.setProperty('--app-height', `${vv.height}px`);
      window.scrollTo(0, 0);
    };
    apply();
    vv.addEventListener('resize', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      document.documentElement.style.removeProperty('--app-height');
    };
  }, [chatMode]);

  return (
    <div className={chatMode ? 'shell chat-mode' : 'shell'}>
      <header className="topbar">
        <button className="brand" onClick={() => update({ phase: 'landing' })} aria-label="Home">
          <img className="brand-logo" src="/ace-logo.png" alt="Ace" />
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
          onRestart={() => {
            const cleared = freshProgress('chat');
            saveProgress(cleared);
            setProgress(cleared);
          }}
          onDesign={openDesign}
        />
      )}

      {progress.phase === 'design' && <Design />}

      {!chatMode && (
        <footer className="foot">
          A personal training design sample by Andre Johnson. Not an official Ace Hardware product.
        </footer>
      )}
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
          <span className="callout-tag">Tutorial</span>
          <p>{current.text}</p>
          <button className="btn-primary callout-next" onClick={() => setStep((s) => s + 1)}>
            {current.next}
          </button>
        </div>
      )}

      {showFeedback ? (
        <div className="callout">
          <span className="callout-tag">Tutorial</span>
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
        {evaluation && (
          <Feedback ev={evaluation} isLast={props.isLast} onRetry={props.onRetry} onNext={props.onNext} />
        )}
        <div ref={endRef} />
      </div>

      {!ended && !evaluation && (
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
              onFocus={() => {
                setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 300);
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
  onRestart,
  onDesign,
}: {
  progress: Progress;
  onRestart: () => void;
  onDesign: () => void;
}) {
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

      <button className="btn-primary" onClick={onDesign}>
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

      <div className="author">
        <img className="author-pic" src="/profile.jpg" alt="Andre Johnson" />
        <div>
          <strong>Andre Johnson</strong>
          <span>Ace Hardware store manager</span>
        </div>
      </div>

      <section>
        <h3>Training employees can do while on the floor</h3>
        <p>
          We usually don&rsquo;t have enough employees working to pull someone off the floor for
          training. So I built a training employees can do while they&rsquo;re on the floor,
          between helping customers. It&rsquo;s easy to pick up, and just as easy to put away the
          moment a customer walks up; progress saves itself, so nothing is lost.
        </p>
      </section>

      <section>
        <h3>Practice beats presentation</h3>
        <p>
          Reading about what you&rsquo;re supposed to do is not the same as doing it. It&rsquo;s
          far more helpful to practice in a scenario that&rsquo;s as realistic as possible, and
          repetition is what makes employees confident enough to use the skill with a real
          customer.
        </p>
      </section>

      <section>
        <h3>Less is more</h3>
        <p>
          The training is deliberately simple and succinct so it quickly turns into real action:
          one page that teaches the principle, then immediately practicing it. A manager could
          hand this to the whole team on a given day and have everyone finished that same day.
        </p>
      </section>

      <section>
        <h3>Where this app could go next</h3>
        <p>
          This tool focuses on one specific skill, suggesting additional items. But every aspect
          of customer service could be practiced this same way: handling customer complaints,
          asking open-ended questions about a project, and more.
        </p>
      </section>
    </main>
  );
}
