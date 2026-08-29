import { Panel } from './Panel';
import { getLatest, useTick } from '../store';

export function Notes() {
  useTick(3);
  const notes = getLatest()?.notes ?? [];
  return (
    <Panel title="Race Engineer" span={6}>
      <div className="notes">
        {notes.length === 0 && (
          <div className="note empty">No issues flagged — balance, thermals and travel within target. Push harder to surface limits.</div>
        )}
        {notes.map((n, i) => (
          <div key={i} className={`note ${n.level}`}>{n.msg}</div>
        ))}
      </div>
    </Panel>
  );
}
