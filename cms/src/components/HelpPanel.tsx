import { Icon } from './icons';

/**
 * Collapsible "How this screen works" helper shown at the top of an editor.
 * Collapsed by default (native <details>), tinted with the active section color.
 */
export default function HelpPanel({
  title = 'How this screen works',
  intro,
  steps,
}: {
  title?: string;
  intro?: string;
  steps?: string[];
}) {
  return (
    <details className="help-panel">
      <summary>
        <span className="hp-ico"><Icon name="help" size={16} /></span>
        {title}
        <span className="hp-chev"><Icon name="chevron" size={16} /></span>
      </summary>
      <div className="hp-body">
        {intro && <p className="hp-intro">{intro}</p>}
        {steps && steps.length > 0 && (
          <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        )}
      </div>
    </details>
  );
}
