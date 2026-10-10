import { useEffect, useState, type CSSProperties } from 'react';
import ProjectPicker from './components/ProjectPicker';
import Dashboard from './components/Dashboard';
import Overview from './components/Overview';
import Help from './components/Help';
import Editor from './components/Editor';
import ProjectsEditor from './components/ProjectsEditor';
import GalleryEditor from './components/GalleryEditor';
import AboutEditor from './components/AboutEditor';
import HomeEditor from './components/HomeEditor';
import PreviewServer from './components/PreviewServer';
import Publish from './components/Publish';
import MediaLibrary from './components/MediaLibrary';
import { AssetPickerProvider } from './components/AssetPicker';
import { Icon } from './components/icons';
import { gitFetch, gitSyncStatus } from './api';
import { NAV_GROUPS, SECTION_COLOR, type Section } from './nav';

const STORAGE_KEY = 'portfolio-cms.repo';

const THEME_KEY = 'portfolio-cms.theme';
type Theme = 'dark' | 'light';

export default function App() {
  const [repo, setRepo] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [section, setSection] = useState<Section>('dashboard');
  const [behind, setBehind] = useState(0);
  const [slug, setSlug] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'));

  useEffect(() => {
    if (repo) localStorage.setItem(STORAGE_KEY, repo);
  }, [repo]);

  // On open, quietly check whether another computer has published since, so a
  // stale checkout is nudged to sync before starting a big change. Failures
  // (offline, no upstream, not a repo) are ignored; Publish handles the real sync.
  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    (async () => {
      try {
        await gitFetch(repo);
        const s = await gitSyncStatus(repo);
        if (!cancelled) setBehind(s.behind);
      } catch { /* offline or no remote — ignore */ }
    })();
    return () => { cancelled = true; };
  }, [repo]);

  // Opening the Publish tab shows the real status, so clear the nudge dot.
  useEffect(() => { if (section === 'publish') setBehind(0); }, [section]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function go(next: Section, nextSlug?: string) {
    setSection(next);
    setSlug(nextSlug ?? null);
  }

  if (!repo) {
    return <ProjectPicker recent={localStorage.getItem(STORAGE_KEY)} onOpen={setRepo} />;
  }

  return (
    <AssetPickerProvider repo={repo}>
      <div className="layout">
        <div className="sidebar">
          <div className="brand">Portfolio CMS</div>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="nav-group" style={{ '--g': group.color } as CSSProperties}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className={`nav-item ${section === item.key ? 'active' : ''}`}
                  onClick={() => go(item.key)}
                >
                  <span className="nav-ico"><Icon name={item.icon} size={16} /></span>
                  {item.label}
                  {item.key === 'publish' && behind > 0 && (
                    <span className="nav-dot" title={`${behind} update${behind === 1 ? '' : 's'} from another computer`} />
                  )}
                </button>
              ))}
            </div>
          ))}
          <div className="repo" title={repo}>{repo}</div>
          <div className="sidebar-foot">
            <button className="small ghost" onClick={() => { setRepo(null); setSlug(null); }}>Change repo</button>
            <button
              className="theme-toggle"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle light/dark theme"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>
          </div>
        </div>

        <div className="main" style={{ '--section': SECTION_COLOR[section] } as CSSProperties}>
          {section === 'dashboard' && <Overview repo={repo} onNavigate={go} />}
          {section === 'media' && <MediaLibrary repo={repo} />}
          {section === 'help' && <Help onNavigate={go} />}
          {section === 'home' && <HomeEditor repo={repo} />}
          {section === 'blog' && (slug
            ? <Editor repo={repo} slug={slug} onBack={() => setSlug(null)} />
            : <Dashboard repo={repo} onOpenPost={setSlug} />)}
          {section === 'projects' && <ProjectsEditor repo={repo} />}
          {section === 'community' && <GalleryEditor repo={repo} />}
          {section === 'about' && <AboutEditor repo={repo} />}
          {section === 'preview' && <PreviewServer repo={repo} />}
          {section === 'publish' && <Publish repo={repo} />}
        </div>
      </div>
    </AssetPickerProvider>
  );
}
