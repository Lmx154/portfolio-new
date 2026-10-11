import { useEffect, useState } from 'react';

const TIME_ZONE = 'America/Chicago';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

const readout = () => {
  const parts = formatter.formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
};

/** Live "LOCAL 14:32 CDT" readout, refreshed on each minute boundary. */
const LocalClock = ({ className = '' }: { className?: string }) => {
  // Fixed placeholder so the prerendered HTML and the hydrating render match;
  // the effect fills in the real time.
  const [time, setTime] = useState('--:--');

  useEffect(() => {
    let timer: number;
    const tick = () => {
      setTime(readout());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <span className={className}>
      LOCAL <span className="text-neutral-300 tabular-nums">{time}</span>
    </span>
  );
};

export default LocalClock;
