import { useState } from 'react';
import { getLatest, send, useMeta, useTick } from '../store';
import { PreRunTune } from './PreRunTune';
import type { EventType, TuneLimits, TuneSnapshot } from '../types';

const CLASS_NAMES: Record<number, string> = {
  0: 'D', 1: 'C', 2: 'B', 3: 'A', 4: 'S1', 5: 'S2', 6: 'X',
};

const CAR_NAME_KEY = 'fh6.carName';

export function TopBar({ view, onView }: { view: 'live' | 'engineer'; onView: (v: 'live' | 'engineer') => void }) {
  const meta = useMeta();
  useTick(4);
  const t = getLatest()?.t;
  const rec = meta.recording;

  const [carName, setCarName] = useState(() => localStorage.getItem(CAR_NAME_KEY) || '');
  const updateCarName = (v: string) => {
    setCarName(v);
    localStorage.setItem(CAR_NAME_KEY, v);
  };

  const live = meta.connected;
  const dotClass = !meta.wsOpen ? '' : live ? 'on' : 'warn';
  const statusText = !meta.wsOpen ? 'server offline' : live ? 'telemetry live' : 'waiting for game';

  const [askTune, setAskTune] = useState(false);

  const toggleRecord = () => {
    if (rec.recording || rec.armed) {
      send({ type: 'record-stop' });
      return;
    }
    // Confirm the tune that's on the car first — that pairing is what lets the report
    // learn a step size instead of creeping by a fixed nudge.
    setAskTune(true);
  };

  const beginRecording = (tune: TuneSnapshot, limits: TuneLimits, eventType: EventType | null) => {
    setAskTune(false);
    // Only name + tune are sent — the server takes the car identity (drivetrain,
    // cylinders, …) from the first real telemetry frame, so pressing RECORD on a
    // race grid still captures the launch with the correct car.
    send({
      type: 'record-start',
      meta: {
        carName: carName.trim() || undefined,
        tune: Object.keys(tune).length ? tune : undefined,
        limits: Object.keys(limits).length ? limits : undefined,
        eventType: eventType ?? undefined, // FH6-28
      },
    });
  };

  // Auto-detected fingerprint from telemetry (no name is sent by the game).
  const fingerprint = t
    ? `${CLASS_NAMES[t.carClass] ?? '?'} ${t.carPI || ''} · #${t.carOrdinal}`
    : '—';

  return (
    <div className="topbar">
      <h1>FH6 · Race Engineer</h1>

      <nav className="tabs">
        <button className={`tab ${view === 'live' ? 'active' : ''}`} onClick={() => onView('live')}>
          Live
        </button>
        <button className={`tab ${view === 'engineer' ? 'active' : ''}`} onClick={() => onView('engineer')}>
          Tuning Report
          {meta.sessions.length > 0 && <span className="tab-badge">{meta.sessions.length}</span>}
        </button>
      </nav>

      <div className="tag">
        <span>CAR</span>
        <input
          className="car-input"
          value={carName}
          onChange={(e) => updateCarName(e.target.value)}
          placeholder="Name your car…"
          spellCheck={false}
        />
      </div>
      <div className="tag">
        <span>CLASS / ID</span>
        <b>{fingerprint}</b>
      </div>
      <div className="tag">
        <span>DRIVE</span>
        <b>{t ? `${t.drivetrain} · ${t.numCylinders}cyl` : '—'}</b>
      </div>

      <div className="spacer" />

      <span className="status-dot">
        <span className={`dot ${dotClass}`} />
        {statusText}
      </span>

      <button className={`btn rec ${rec.recording ? 'active' : ''} ${rec.armed ? 'armed' : ''}`} onClick={toggleRecord}>
        {rec.recording ? `● REC ${rec.durationSec ?? 0}s` : rec.armed ? '◌ ARMED · waiting for car' : '○ RECORD'}
      </button>

      {askTune && <PreRunTune onConfirm={beginRecording} onCancel={() => setAskTune(false)} />}
    </div>
  );
}
