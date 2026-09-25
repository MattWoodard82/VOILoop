// InfoTooltip.jsx
// Reusable (i) icon + popover for metric labels. Tap-to-open first (mobile-safe),
// works fine on desktop too. Pair with metricDefinitions.js.
//
// Usage:
//   <MetricLabel>
//     Recovery Score <InfoTooltip metricKey="recoveryScore" />
//   </MetricLabel>

import { useState, useRef, useEffect, useId } from 'react';
import { METRIC_DEFINITIONS } from './metricDefinitions';

/**
 * @param {{
 *   metricKey?: string,
 *   definition?: { label: string, whatItIs: string, whyItMatters?: string }
 * }} props
 */
export function InfoTooltip({ metricKey, definition }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef(null);
  const tooltipId = useId();
  const def = definition ?? METRIC_DEFINITIONS[metricKey];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setPinned(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  if (!def) {
    console.warn(`InfoTooltip: no definition found for metricKey "${metricKey}"`);
    return null;
  }

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-block', marginLeft: 4 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
    >
      <button
        type="button"
        aria-label={`What is ${def.label}?`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) setOpen(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setPinned(false);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (pinned) {
            setOpen(false);
            setPinned(false);
          } else {
            setOpen(true);
            setPinned(true);
          }
        }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#A5ACAF',
          fontSize: 13,
          padding: 0,
          lineHeight: 1,
        }}
      >
        ⓘ
      </button>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          style={{
            position: 'absolute',
            top: '120%',
            left: 0,
            zIndex: 20,
            width: 'min(280px, calc(100vw - 32px))',
            background: '#001a33',
            border: '1px solid #0a3560',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            lineHeight: 1.5,
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <div>{def.whatItIs}</div>
          {def.whyItMatters && (
            <div style={{ marginTop: 6, color: '#A5ACAF' }}>{def.whyItMatters}</div>
          )}
        </div>
      )}
    </span>
  );
}
