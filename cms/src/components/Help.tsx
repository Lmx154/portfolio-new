import { useMemo, useState, type CSSProperties } from 'react';
import { GUIDES, SECTION_COLOR, SECTION_ICON, SECTION_LABEL, type Section } from '../nav';
import { Icon, type IconName } from './icons';

/** The four-step loop every change follows, each pointing at its tab. */
const FLOW: { key: Section; icon: IconName; title: string; desc: string }[] = [
  { key: 'blog', icon: 'blog', title: '1 · Edit', desc: 'Pick a tab on the left (Home, Blog, Projects, Community, About) and change the content.' },
  { key: 'home', icon: 'file', title: '2 · Save', desc: 'Each editor has a Save button — it writes the change to your computer.' },
  { key: 'preview', icon: 'preview', title: '3 · Preview', desc: 'Open Preview to see the real site with your changes.' },
  { key: 'publish', icon: 'publish', title: '4 · Publish', desc: 'Open Publish and click “Publish changes” to make it live.' },
];

function TabChip({ tab }: { tab: Section }) {
  return (
    <span className="tab-chip" style={{ '--c': SECTION_COLOR[tab] } as CSSProperties}>
      <span className="tc-ico"><Icon name={SECTION_ICON[tab]} size={12} /></span>
      {SECTION_LABEL[tab]}
    </span>
  );
}

export default function Help({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [q, setQ] = useState('');

  const guides = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return GUIDES;
    return GUIDES.filter((g) => {
      const hay = [g.title, ...g.steps, ...g.tabs.map((t) => SECTION_LABEL[t])].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [q]);

  return (
    <div className="app">
      <div className="topbar"><h1 style={{ fontWeight: 400 }}>Help</h1></div>
      <div className="content">
        <div className="container">
          <p className="help-lead">
            This guide explains how to run your portfolio's content. The left sidebar is grouped by color:
            <b> Content</b> (home text, blog, projects, community, about), <b>Assets</b> (the media library),
            and <b>Ship</b> (preview &amp; go live). Every change follows the same four steps:
          </p>

          <div className="flow">
            {FLOW.map((f) => (
              <div
                key={f.title}
                className="flow-step"
                style={{ '--section': SECTION_COLOR[f.key] } as CSSProperties}
              >
                <div className="fs-k"><span className="fs-ico"><Icon name={f.icon} size={15} /></span>{f.title}</div>
                <div className="fs-d">{f.desc}</div>
              </div>
            ))}
          </div>

          <div className="section-title">Common tasks ({guides.length})</div>

          <div className="help-search">
            <span className="hs-ico"><Icon name="search" size={16} /></span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tasks — e.g. “new post”, “3D model”, “publish”…"
            />
          </div>

          {guides.length === 0 ? (
            <div className="empty">No tasks match “{q}”.</div>
          ) : (
            guides.map((g) => {
              const primary = g.tabs[0];
              return (
                <details className="guide-card" key={g.id}>
                  <summary>
                    <span className="gc-title">{g.title}</span>
                    <span className="gc-chips">{g.tabs.map((t) => <TabChip key={t} tab={t} />)}</span>
                    <span className="gc-chev"><Icon name="chevron" size={16} /></span>
                  </summary>
                  <div className="guide-body">
                    <ol>{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                    <button
                      className="guide-go"
                      style={{ '--c': SECTION_COLOR[primary] } as CSSProperties}
                      onClick={() => onNavigate(primary)}
                    >
                      Go to {SECTION_LABEL[primary]}
                      <span className="gg-ico"><Icon name="arrow" size={15} /></span>
                    </button>
                  </div>
                </details>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
