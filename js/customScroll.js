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

export function attachCustomScrollbar(scroller, host, opts = {}) {
  if (!scroller || !host) return null;

  const thumb = document.createElement('div');
  thumb.className = 'cscroll-thumb';
  host.appendChild(thumb);

  const inst = {
    scroller, host, thumb,
    contentSelector: opts.contentSelector || null,
    contentPad: opts.contentPad ?? 8,
  };
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

function updateThumb({ scroller, host, thumb, contentSelector, contentPad }) {
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

  // Horizontal: by default the thumb hugs the scroller's right edge like a
  // normal scrollbar. When a contentSelector is given (the result ranking
  // list, whose rows are fixed-width with short names left-floating in empty
  // space), anchor the thumb just past the widest row's *actual* content
  // instead — so it sits right next to the names regardless of name length and
  // reads as the list's own scroll, not a far-right bar near the buttons.
  let leftPx = relLeft + scrRect.width - 7;
  if (contentSelector) {
    let maxRight = 0;
    scroller.querySelectorAll(contentSelector).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) maxRight = r.right;
    });
    if (maxRight > 0) {
      // Clamp so the anchored thumb never spills past the scroller's edge.
      leftPx = Math.min((maxRight - hostRect.left) + contentPad, leftPx);
    }
  }
  thumb.style.left = `${leftPx}px`;
  thumb.classList.add('visible');
}

// Re-measure every attached indicator — call after a layout/visibility change
// the observers might miss (e.g. the result overlay fading in).
export function refreshScrollbars() {
  instances.forEach(i => i.update());
}
