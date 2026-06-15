import { Target, X, Plus, Trash2, Check, Circle, Trophy, Skull, ScrollText, Flag } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import type { Objective } from '@/types';

/**
 * Guided game-design editor. Walks the user through the pieces that turn a scene
 * into a *game*: a one-line concept, win/lose conditions, house rules, and a list
 * of trackable objectives. Objectives defined here show up in the node editor
 * (Complete / Add Progress / Is Complete / Progress nodes) so behaviours can be
 * wired to the game's goals, and the runtime tracks them during play.
 */

const PRIORITIES: { value: Objective['priority']; label: string; hint: string }[] = [
  { value: 'primary', label: 'Primary', hint: 'Required to win' },
  { value: 'secondary', label: 'Secondary', hint: 'Encouraged, not required' },
  { value: 'bonus', label: 'Bonus', hint: 'Optional extra challenge' },
];

/** A small checklist that nudges the user toward a complete design. */
function Completeness() {
  const design = useEditorStore((s) => s.design);
  const items: { ok: boolean; label: string }[] = [
    { ok: design.pitch.trim().length > 0, label: 'A one-line concept' },
    { ok: design.winCondition.trim().length > 0, label: 'A win condition' },
    { ok: design.loseCondition.trim().length > 0, label: 'A lose / fail condition' },
    { ok: design.objectives.length > 0, label: 'At least one objective' },
    { ok: design.objectives.some((o) => o.priority === 'primary'), label: 'A primary objective' },
    { ok: design.rules.length > 0, label: 'At least one rule' },
  ];
  const done = items.filter((i) => i.ok).length;
  return (
    <div className="goals-checklist">
      <div className="goals-checklist-head">
        Design completeness <span>{done}/{items.length}</span>
      </div>
      <ul>
        {items.map((i) => (
          <li key={i.label} className={i.ok ? 'ok' : ''}>
            {i.ok ? <Check size={13} /> : <Circle size={13} />} {i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ObjectiveCard({ obj }: { obj: Objective }) {
  const { updateObjective, removeObjective } = useEditorStore();
  return (
    <div className="objective-card">
      <div className="objective-row">
        <Flag size={14} className="objective-icon" />
        <input
          className="objective-title"
          placeholder="Objective title (e.g. Collect all coins)"
          value={obj.title}
          onChange={(e) => updateObjective(obj.id, { title: e.target.value })}
        />
        <button className="objective-del" title="Delete objective" onClick={() => removeObjective(obj.id)}>
          <Trash2 size={14} />
        </button>
      </div>
      <textarea
        className="objective-desc"
        placeholder="What does the player need to do, and why does it matter?"
        rows={2}
        value={obj.description}
        onChange={(e) => updateObjective(obj.id, { description: e.target.value })}
      />
      <div className="objective-controls">
        <label>
          Priority
          <select
            value={obj.priority}
            onChange={(e) => updateObjective(obj.id, { priority: e.target.value as Objective['priority'] })}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value} title={p.hint}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tracking
          <select
            value={obj.metric}
            onChange={(e) => updateObjective(obj.id, { metric: e.target.value as Objective['metric'] })}
          >
            <option value="flag">Done / not done</option>
            <option value="counter">Count to target</option>
          </select>
        </label>
        {obj.metric === 'counter' && (
          <label>
            Target
            <input
              type="number"
              min={1}
              value={obj.target}
              onChange={(e) => updateObjective(obj.id, { target: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
          </label>
        )}
        <label className="grow">
          Reward
          <input
            placeholder="optional — e.g. unlock the gate"
            value={obj.reward}
            onChange={(e) => updateObjective(obj.id, { reward: e.target.value })}
          />
        </label>
      </div>
      <code className="objective-ref" title="Reference this objective from nodes / code">
        id: {obj.id}
      </code>
    </div>
  );
}

export function GoalsEditor() {
  const showDesign = useEditorStore((s) => s.showDesign);
  const setShowDesign = useEditorStore((s) => s.setShowDesign);
  const design = useEditorStore((s) => s.design);
  const updateDesign = useEditorStore((s) => s.updateDesign);
  const addObjective = useEditorStore((s) => s.addObjective);

  if (!showDesign) return null;

  const setRule = (i: number, value: string) => {
    const rules = design.rules.slice();
    rules[i] = value;
    updateDesign({ rules });
  };
  const addRule = () => updateDesign({ rules: [...design.rules, ''] });
  const removeRule = (i: number) => updateDesign({ rules: design.rules.filter((_, idx) => idx !== i) });

  return (
    <div className="sc-backdrop" onClick={() => setShowDesign(false)}>
      <div className="sc-modal goals-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Game design">
        <header className="sc-head">
          <div className="sc-title">
            <Target size={17} />
            <span>Game Design</span>
          </div>
          <button className="sc-close" onClick={() => setShowDesign(false)} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="goals-body">
          <Completeness />

          <section className="goals-section">
            <h4>Concept</h4>
            <p className="goals-hint">In one sentence, what is this game?</p>
            <input
              className="goals-input"
              placeholder="e.g. A cat platformer where you collect 10 fish before the timer runs out."
              value={design.pitch}
              onChange={(e) => updateDesign({ pitch: e.target.value })}
            />
          </section>

          <section className="goals-section two-col">
            <div>
              <h4><Trophy size={14} /> Win condition</h4>
              <textarea
                className="goals-input"
                rows={3}
                placeholder="When does the player win?"
                value={design.winCondition}
                onChange={(e) => updateDesign({ winCondition: e.target.value })}
              />
            </div>
            <div>
              <h4><Skull size={14} /> Lose condition</h4>
              <textarea
                className="goals-input"
                rows={3}
                placeholder="When does the player fail?"
                value={design.loseCondition}
                onChange={(e) => updateDesign({ loseCondition: e.target.value })}
              />
            </div>
          </section>

          <section className="goals-section">
            <div className="goals-section-head">
              <h4><Target size={14} /> Objectives</h4>
              <button className="goals-add" onClick={addObjective}>
                <Plus size={13} /> Add objective
              </button>
            </div>
            <p className="goals-hint">
              The trackable goals of your game. Each one shows up in the node editor so behaviours can complete it or
              react to it. All <strong>primary</strong> objectives complete = the game is won.
            </p>
            {design.objectives.length === 0 && (
              <div className="goals-empty">No objectives yet. Add one to give the player something to do.</div>
            )}
            {design.objectives.map((o) => (
              <ObjectiveCard key={o.id} obj={o} />
            ))}
          </section>

          <section className="goals-section">
            <div className="goals-section-head">
              <h4><ScrollText size={14} /> Rules</h4>
              <button className="goals-add" onClick={addRule}>
                <Plus size={13} /> Add rule
              </button>
            </div>
            <p className="goals-hint">The constraints that shape play — e.g. "you can't jump while carrying a key".</p>
            {design.rules.map((rule, i) => (
              <div className="goals-rule" key={i}>
                <span className="goals-rule-num">{i + 1}</span>
                <input value={rule} placeholder="Describe a rule…" onChange={(e) => setRule(i, e.target.value)} />
                <button className="objective-del" title="Delete rule" onClick={() => removeRule(i)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </section>
        </div>

        <footer className="sc-foot">
          This design is saved with your game and shared across scenes. Use the <strong>Objective</strong> nodes in the
          node editor to complete goals or branch on whether they're done.
        </footer>
      </div>
    </div>
  );
}
