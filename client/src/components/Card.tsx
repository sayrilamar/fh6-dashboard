import type { ReactNode } from 'react';

export type Status = 'ok' | 'warn' | 'crit' | 'info' | 'mute';

// Section card for the engineering workspace. Every report section gets the same
// chrome: accent rule, title, one-line "what this is for", and an at-a-glance
// status pill — so you can tell sections apart and know what each is used for.
export function Card({
  id,
  title,
  sub,
  status,
  statusLabel,
  children,
}: {
  id?: string;
  title: string;
  sub?: string;
  status?: Status;
  statusLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="card" id={id}>
      <header className="card-head">
        <span className="ttl">{title}</span>
        {sub && <span className="sub">{sub}</span>}
        <span style={{ flex: 1 }} />
        {statusLabel && <span className={`pill ${status ?? 'mute'}`}>{statusLabel}</span>}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

// Sub-heading inside a card.
export function SectionHead({ children }: { children: ReactNode }) {
  return <div className="sec-head">{children}</div>;
}

// Compact metric tile. `hand` marks a value that gets typed into the tuning sheet.
export function Tile({
  label,
  value,
  unit,
  sub,
  hand,
  cell,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  hand?: boolean;
  cell?: string;
}) {
  return (
    <div className={`tile${hand ? ' hand' : ''}`}>
      <div className="lbl">
        {label}
        {cell && <span className="cellref">{cell}</span>}
      </div>
      <div className="val">
        {value}
        {unit && <span className="u">{unit}</span>}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
