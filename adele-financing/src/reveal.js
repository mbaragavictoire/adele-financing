/**
 * Scroll-reveal behaviour.
 *
 * Rather than editing every page to add attributes, this observes the existing
 * card/section/image elements and reveals each one the first time it enters the
 * viewport. Page markup, content and routes are untouched.
 *
 * Each element is revealed exactly once and then left alone: the observer stops
 * watching it as soon as it has fired, so nothing re-animates on scroll.
 */

/** Cards and tiles: fade up as they scroll into view. */
const FADE_UP =
  '.feature-card, .step-card, .value-card, .service-card, .team-member, .product-card, .apply-step, .service-item'

/** Images: fade with a small horizontal offset. */
const FADE_X = '.team-member-photo, .chairperson-message-photo, .team-chairman-photo'

/** Headings and large blocks: fade only, no movement. */
const FADE_ONLY = '.section-head, .reveal-section, .page-head'

/** Grids whose card children should enter one beat apart. */
const STAGGER_PARENTS = '.features, .steps, .values, .team-row, .apply-steps'

/** Delay step between adjacent cards, and the cap so long rows stay responsive. */
const STAGGER_STEP_MS = 80
const STAGGER_MAX_INDEX = 6

let observer = null

/** Set the moment the observer reports an element as visible. */
let observerHasFired = false

/** Pending safety-net timer for the current route. */
let failsafe = null

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function markRevealed(el) {
  el.classList.add('is-revealed')
}

function getObserver() {
  if (observer) return observer

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observerHasFired = true
        markRevealed(entry.target)
        observer.unobserve(entry.target)
      }
    },
    {
      // Begin slightly before the element reaches the fold so the animation has
      // finished by the time the visitor's eye arrives.
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.05,
    },
  )

  return observer
}

/**
 * Marks up the elements inside a route so they can be revealed later.
 * Idempotent: already-revealed elements are skipped.
 * @param {HTMLElement} root
 */
function prepare(root) {
  // Adjacent cards in the same grid enter a beat apart rather than all at once.
  for (const parent of root.querySelectorAll(STAGGER_PARENTS)) {
    parent.querySelectorAll(FADE_UP).forEach((card, index) => {
      const step = Math.min(index, STAGGER_MAX_INDEX)
      card.style.setProperty('--reveal-delay', `${step * STAGGER_STEP_MS}ms`)
    })
  }

  for (const el of root.querySelectorAll(FADE_UP)) {
    if (el.classList.contains('is-revealed')) continue
    el.classList.add('reveal')
  }

  for (const el of root.querySelectorAll(FADE_ONLY)) {
    if (el.classList.contains('is-revealed')) continue
    el.classList.add('reveal', 'reveal-soft')
  }

  // Images fade in from the side. A photo inside a card that is itself revealing
  // inherits that card's delay, so the two move as one instead of the photo
  // sliding in while its card is still off-screen.
  for (const el of root.querySelectorAll(FADE_X)) {
    if (el.classList.contains('is-revealed')) continue
    el.classList.add('reveal', 'reveal-x')
    const card = el.closest(FADE_UP)
    if (card?.style.getPropertyValue('--reveal-delay')) {
      el.style.setProperty('--reveal-delay', card.style.getPropertyValue('--reveal-delay'))
    }
  }
}

/**
 * Reveals everything still hidden. Used as a last resort so content can never
 * be left invisible by a failed observer.
 * @param {HTMLElement} root
 */
function revealAll(root) {
  for (const el of root.querySelectorAll(
    '.reveal:not(.is-revealed), .reveal-section:not(.is-revealed)',
  )) {
    markRevealed(el)
  }
}

/**
 * Arranges a safety net for the current route. Content is only force-revealed
 * if the observer has not fired at all by then, which means it is not working.
 * If it is working normally the timer is cleared and scrolling keeps its
 * animation.
 * @param {HTMLElement} root
 */
function scheduleFailsafe(root) {
  clearTimeout(failsafe)
  failsafe = setTimeout(() => {
    if (!observerHasFired) revealAll(root)
  }, 2500)
}

/**
 * Prepares and observes the elements on the current route.
 * @param {HTMLElement} root
 */
export function observeReveal(root) {
  if (!root) return

  clearTimeout(failsafe)
  observerHasFired = false

  // Reduced motion means no animation, so content must be visible immediately.
  if (prefersReducedMotion()) {
    revealAll(root)
    return
  }

  prepare(root)

  const targets = root.querySelectorAll('.reveal:not(.is-revealed)')
  if (targets.length === 0) return

  const io = getObserver()
  for (const el of targets) io.observe(el)

  scheduleFailsafe(root)
}

/** Reveals anything already on screen at load, without waiting for a scroll. */
export function revealAboveTheFold(root) {
  if (!root) return
  const viewportHeight = window.innerHeight || 0
  for (const el of root.querySelectorAll(
    '.reveal:not(.is-revealed), .reveal-section:not(.is-revealed)',
  )) {
    if (el.getBoundingClientRect().top < viewportHeight) markRevealed(el)
  }
}

/** Releases the pending safety net when leaving a route. */
export function cancelRevealFailsafe() {
  clearTimeout(failsafe)
}