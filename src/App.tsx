import { useEffect, useRef, useState } from 'react';
import { SCENARIOS, type Scenario } from '../shared/scenarios';

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

type Phase = 'landing' | 'chat' | 'feedback' | 'done' | 'design';

interface Progress {
  phase: Phase;
  scenarioIndex: number;
  transcripts: Record<string, ChatMessage[]>;
  evaluations: Record<string, Evaluation>;
}

const STORAGE_KEY = 'ace-helpful-trainer-v1';

const RATING_META: Record<Evaluation['rating'], { label: string; color: string; bg: string }> = {
  nailed_it: { label: 'Nailed it', color: '#1E7A46', bg: '#E7F3EC' },
  solid: { label: 'Solid', color: '#8A6100', bg: '#FBF3DC' },
  missed: { label: 'Missed the moment', color: '#A84300', bg: '#FBEADF' },
  off_track: { label: 'Off track', color: '#B00016', bg: '#FBE3E6' },
};

// ---------- persistence (droppable by design) ----------

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      if (p && typeof p.scenarioIndex === 'number' && p.phase !== 'design') return p;
    }
  } catch {
    /* fresh start */
  }
  return { phase: 'landing', scenarioIndex: 0, transcripts: {}, evaluations: {} };
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* fine */
  }
}

// ---------- api ----------

async function api(body: object): Promise<{ text?: string; evaluation?: Evaluation; error?: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Something went sideways — try again.');
  }
  return res.json();
}

// ---------- small pieces ----------

function Avatar({ s, size = 44 }: { s: Scenario; size?: number }) {
  // Placeholder until real photos arrive: colored disc + initials.
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: s.avatarColor, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {s.initials}
    </div>
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

  const openDesign = () => {
    setReturnPhase(progress.phase);
    setProgress((p) => ({ ...p, phase: 'design' }));
  };
  const closeDesign = () => setProgress((p) => ({ ...p, phase: returnPhase }));

  return (
    <div className="shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => update({ phase: 'landing' })}
          aria-label="Home"
        >
          <span className="brand-mark">H</span>
          <span className="brand-name">Helpful&nbsp;Trainer</span>
        </button>
        {progress.phase !== 'design' && progress.phase !== 'landing' && progress.phase !== 'done' && (
          <span className="topbar-step">
            Customer {progress.scenarioIndex + 1} of {SCENARIOS.length}
          </span>
        )}
        <button className="linkish" onClick={progress.phase === 'design' ? closeDesign : openDesign}>
          {progress.phase === 'design' ? 'Back' : 'Why it works'}
        </button>
      </header>

      {progress.phase === 'landing' && (
        <Landing
          hasProgress={Object.keys(progress.evaluations).length > 0 || (progress.transcripts[scenario.id]?.length ?? 0) > 1}
          onStart={(fresh) => {
            if (fresh) {
              const cleared: Progress = { phase: 'chat', scenarioIndex: 0, transcripts: {}, evaluations: {} };
              saveProgress(cleared);
              setProgress(cleared);
            } else {
              update({ phase: Object.keys(progress.evaluations).length >= SCENARIOS.length ? 'done' : 'chat' });
            }
          }}
        />
      )}

      {(progress.phase === 'chat' || progress.phase === 'feedback') && (
        <Trainer
          key={scenario.id}
          scenario={scenario}
          savedTranscript={progress.transcripts[scenario.id]}
          savedEvaluation={progress.evaluations[scenario.id]}
          phase={progress.phase}
          onTranscript={(msgs) =>
            update({ transcripts: { ...progress.transcripts, [scenario.id]: msgs } })
          }
          onEvaluated={(ev) =>
            update({
              phase: 'feedback',
              evaluations: { ...progress.evaluations, [scenario.id]: ev },
            })
          }
          onRetry={() => {
            const t = { ...progress.transcripts };
            delete t[scenario.id];
            const e = { ...progress.evaluations };
            delete e[scenario.id];
            update({ phase: 'chat', transcripts: t, evaluations: e });
          }}
          onNext={() => {
            if (progress.scenarioIndex + 1 < SCENARIOS.length) {
              update({ phase: 'chat', scenarioIndex: progress.scenarioIndex + 1 });
            } else {
              update({ phase: 'done' });
            }
          }}
          isLast={progress.scenarioIndex + 1 >= SCENARIOS.length}
        />
      )}

      {progress.phase === 'done' && (
        <Done
          evaluations={progress.evaluations}
          onRestart={() => {
            const cleared: Progress = { phase: 'chat', scenarioIndex: 0, transcripts: {}, evaluations: {} };
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

function Landing({ hasProgress, onStart }: { hasProgress: boolean; onStart: (fresh: boolean) => void }) {
  return (
    <main className="card landing">
      <p className="kicker">5-minute practice · 3 customers</p>
      <h1>
        Nobody comes in for a roller.
        <br />
        They come in to paint a room.
      </h1>
      <p className="lede">
        When we hand a customer the item and nothing else, they end up making a second trip — and
        the second trip usually isn&rsquo;t to us. Suggesting the one thing they&rsquo;ll be glad
        they didn&rsquo;t forget is the difference between ringing up a product and actually helping
        with a project. Three customers are about to walk in: answer their question, then suggest
        one complementary item that fits &mdash; and you&rsquo;ll get honest feedback on how it landed.
      </p>
      <button className="btn-primary" onClick={() => onStart(!hasProgress ? true : false)}>
        {hasProgress ? 'Pick up where you left off' : 'Meet your first customer'}
      </button>
      {hasProgress && (
        <button className="linkish sub" onClick={() => onStart(true)}>
          Start over instead
        </button>
      )}
    </main>
  );
}

// ---------- trainer (chat + feedback) ----------

function Trainer(props: {
  scenario: Scenario;
  savedTranscript?: ChatMessage[];
  savedEvaluation?: Evaluation;
  phase: 'chat' | 'feedback';
  isLast: boolean;
  onTranscript: (msgs: ChatMessage[]) => void;
  onEvaluated: (ev: Evaluation) => void;
  onRetry: () => void;
  onNext: () => void;
}) {
  const { scenario } = props;
  const [messages, setMessages] = useState<ChatMessage[]>(
    props.savedTranscript?.length ? props.savedTranscript : [{ role: 'customer', text: scenario.opener }],
  );
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'reply' | 'evaluate' | null>(null);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, props.phase]);

  const employeeTurns = messages.filter((m) => m.role === 'employee').length;

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'employee', text }];
    setMessages(next);
    props.onTranscript(next);
    setDraft('');
    setError('');
    setBusy('reply');
    try {
      const { text: reply } = await api({ scenarioId: scenario.id, messages: next, mode: 'reply' });
      if (reply) {
        const withReply: ChatMessage[] = [...next, { role: 'customer', text: reply }];
        setMessages(withReply);
        props.onTranscript(withReply);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const evaluate = async () => {
    if (busy) return;
    setError('');
    setBusy('evaluate');
    try {
      const { evaluation } = await api({ scenarioId: scenario.id, messages, mode: 'evaluate' });
      if (evaluation) props.onEvaluated(evaluation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="trainer">
      <div className="persona-strip">
        <Avatar s={scenario} />
        <div>
          <strong>{scenario.name}</strong>
          <span className="persona-bio">{scenario.bio}</span>
        </div>
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
        {error && <p className="error">{error}</p>}
        <div ref={endRef} />
      </div>

      {props.phase === 'chat' ? (
        <div className="composer">
          {employeeTurns > 0 && (
            <button className="btn-finish" onClick={evaluate} disabled={busy !== null}>
              {busy === 'evaluate' ? 'Your coach is thinking…' : "I'm done — how'd I do?"}
            </button>
          )}
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
              placeholder={employeeTurns === 0 ? 'How do you respond?' : 'Keep the conversation going…'}
              rows={2}
              disabled={busy !== null}
            />
            <button className="btn-send" onClick={send} disabled={busy !== null || !draft.trim()} aria-label="Send">
              ➤
            </button>
          </div>
        </div>
      ) : (
        props.savedEvaluation && (
          <Feedback ev={props.savedEvaluation} isLast={props.isLast} onRetry={props.onRetry} onNext={props.onNext} />
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
  return (
    <div className="feedback">
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
  evaluations,
  onRestart,
  onDesign,
}: {
  evaluations: Record<string, Evaluation>;
  onRestart: () => void;
  onDesign: () => void;
}) {
  return (
    <main className="card landing">
      <p className="kicker">That&rsquo;s the whole thing — about five minutes</p>
      <h1>Three customers, three chances to save a second trip.</h1>
      <ul className="recap">
        {SCENARIOS.map((s) => {
          const ev = evaluations[s.id];
          const meta = ev ? (RATING_META[ev.rating] ?? RATING_META.solid) : null;
          return (
            <li key={s.id}>
              <Avatar s={s} size={32} />
              <span className="recap-name">{s.name.split(' ')[0]}</span>
              {meta && (
                <span className="rating-pill small" style={{ color: meta.color, background: meta.bg }}>
                  {meta.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="lede">
        Same skill, three very different people — because the item is never the hard part. Reading
        the project behind it is.
      </p>
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

      <section>
        <h3>It lives on the floor</h3>
        <p>
          Training that requires a back room and a spare hour doesn&rsquo;t happen — we need people
          on the floor. This runs on a scan gun, a floor terminal, or a phone, one scenario at a
          time. And it&rsquo;s <strong>droppable</strong>: a real customer walks up, you set it
          down, help them, and pick up exactly where you left off. Progress saves itself.
        </p>
      </section>

      <section>
        <h3>Practice beats presentation</h3>
        <p>
          Click-next modules test whether you can find the Next button. Here you type what
          you&rsquo;d actually say, to a customer with an actual personality, and the feedback
          responds to <em>your</em> words. That&rsquo;s retrieval practice on the real behavior —
          the same rep you&rsquo;ll perform an hour later in aisle 12.
        </p>
      </section>

      <section>
        <h3>Helping, not selling</h3>
        <p>
          The rubric behind the feedback has one acid test: <strong>would the customer have had to
          make a second trip without this item?</strong> If yes, suggesting it is service. If no,
          it&rsquo;s an upsell wearing a helpful costume — and the coach scores it that way.
          Answer the question first, tie the suggestion to their project, keep it easy to decline.
        </p>
      </section>

      <section>
        <h3>Almost nothing to read</h3>
        <p>
          Three sentences up front, then a customer. That&rsquo;s deliberate: every paragraph of
          preamble costs completions, and a training tool nobody finishes teaches nobody anything.
          The theory lives back here, where the curious can find it — not in front of the learner.
        </p>
      </section>

      <section>
        <h3>Where it would go next</h3>
        <p>
          More scenarios by department, voices for the customers, a manager view of common misses
          across the team, and rotating &ldquo;standout catches&rdquo; drawn from real floor
          situations — the wallpaper detail, the third flapper — because the best training material
          is the stuff that actually happens.
        </p>
      </section>

      <p className="byline">
        Built by Andre Johnson — Ace Hardware store manager. Every scenario is something I&rsquo;ve
        watched happen on my own sales floor.
      </p>
    </main>
  );
}
