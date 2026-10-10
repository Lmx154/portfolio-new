type Props = {
  /** Two-digit section index shown as a telemetry prefix ("01"). */
  index: string;
  title: string;
  /** Optional right-hand readout, e.g. "05 posts". */
  meta?: string;
  className?: string;
};

/**
 * Section title in the mission-control style: mono index, display title, a
 * hairline rule, and an optional mono readout at the end of the rule.
 */
const SectionHeading = ({ index, title, meta, className = '' }: Props) => (
  <div className={`flex items-end gap-4 sm:gap-6 ${className}`}>
    <div className="min-w-0">
      <div className="label-mono text-signal/80 mb-2">{index} /</div>
      <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-light tracking-[0.1em] text-white text-legible sm:whitespace-nowrap uppercase">
        {title}
      </h2>
    </div>
    <div className="flex-1 flex items-center gap-3 pb-2 sm:pb-3 min-w-[2rem]">
      <div className="h-px flex-1 bg-gradient-to-r from-white/20 via-white/10 to-transparent" />
      {meta && <span className="label-mono text-neutral-400 whitespace-nowrap hidden sm:inline">{meta}</span>}
    </div>
  </div>
);

export default SectionHeading;
