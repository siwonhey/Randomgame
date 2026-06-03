// ═══════════════════════════════════════════
// CUSTOM SCROLL INDICATOR
// iOS Safari renders the native scrollbar as a touch-only overlay that fades
// away, so users can't tell a list is scrollable without poking it. This draws
// a thin thumb on the scroller's right edge that:
//   • appears automatically only when the content overflows (scrollable), and
//   • stays visible (doesn't fade) while it's scrollable.
// It's a pure indicator (not draggable) — native touch/wheel scrolling drives
// it. The thumb is positioned relative to `host` (a non-scrolling ancestor) so
// it lands at the *list's* right edge, not the page edge.
// ═══════════════════════════════════════════

const instances = [];

export function attachCustomScrollbar(scroller, host) {
  if (!scroller || !host) return null;

  const thumb = document.createElement('div');
  thumb.className = 'cscroll-thumb';
  host.appendChild(thumb);

  const inst = { scroller, host, thumb };
  inst.update = () => updateThumb(inst);

  scroller.addEventListener('scroll', inst.update, { passive: true });
  window.addEventListener('resize', inst.update);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(inst.update).observe(scroller);
  }
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(inst.update).observe(scroller, { childList: true, subtree: true });
  }

  instances.push(inst);
  inst.update();
  return inst;
}

function updateThumb({ scroller, host, thumb }) {
  const sh = scroller.scrollHeight;
  const ch = scroller.clientHeight;

  // Not scrollable (or hidden) → no indicator.
  if (sh <= ch + 2 || ch === 0) {
    thumb.classList.remove('visible');
    return;
  }

  const hostRect = host.getBoundingClientRect();
  const scrRect = scroller.getBoundingClientRect();
  const relTop = scrRect.top - hostRect.top;
  const relLeft = scrRect.left - hostRect.left;

  const trackH = ch;
  const thumbH = Math.max(28, (ch / sh) * trackH);
  const maxThumbTravel = trackH - thumbH;
  const scrolled = scroller.scrollTop / (sh - ch);          // 0 → 1

  thumb.style.height = `${thumbH}px`;
  thumb.style.top = `${relTop + scrolled * maxThumbTravel}px`;
  thumb.style.left = `${relLeft + scrRect.width - 7}px`;
  thumb.classList.add('visible');
}

// Re-measure every attached indicator — call after a layout/visibility change
// the observers might miss (e.g. the result overlay fading in).
export function refreshScrollbars() {
  instances.forEach(i => i.update());
}
