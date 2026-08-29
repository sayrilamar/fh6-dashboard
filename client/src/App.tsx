import { useState } from 'react';
import { TopBar } from './components/TopBar';
import { EngineCluster } from './components/EngineCluster';
import { PowerBand } from './components/PowerBand';
import { Tires } from './components/Tires';
import { GripBalance } from './components/GripBalance';
import { TractionCircle } from './components/TractionCircle';
import { Suspension } from './components/Suspension';
import { Inputs } from './components/Inputs';
import { Attitude } from './components/Attitude';
import { Laps } from './components/Laps';
import { Notes } from './components/Notes';
import { Engineer } from './components/Sessions';

export type View = 'live' | 'engineer';

export default function App() {
  // Live telemetry and post-session analysis are separate workspaces — the live
  // monitor stays uncluttered, and the report gets room to be readable.
  const [view, setView] = useState<View>('live');

  return (
    <div className="app">
      <TopBar view={view} onView={setView} />
      {view === 'live' ? (
        <div className="grid">
          <EngineCluster />
          <PowerBand />

          <Tires />
          <GripBalance />
          <TractionCircle />
          <Suspension />

          <Inputs />
          <Attitude />
          <Laps />
          <Notes />
        </div>
      ) : (
        <Engineer />
      )}
    </div>
  );
}
