/**
 * Notice card (UI-7) — the LIMITED BANDWIDTH CONSOLE, the page a phone gets
 * instead of the desktop. main.tsx's viewport gate mounts this INSTEAD of the
 * boot/desktop graph (never alongside it): on a phone this card IS the page.
 *
 * Anatomy — one beveled console plate on the warm near-black hold:
 *
 *   ┌ notice-plate (bevel-raised, single column) ─────────────┐
 *   │  LIMITED BANDWIDTH CONSOLE      ← h1, the plate engraving│
 *   │  ┌ phosphor well (POST-style) ────────────────────────┐ │
 *   │  │ BANDWIDTH CHECK ..... LIMITED                      │ │
 *   │  │ HANDHELD VIEWPORT DETECTED                         │ │
 *   │  │ This console requires a larger viewport — the      │ │
 *   │  │ archive is best experienced on a desktop. ▮        │ │
 *   │  └ (scanlines) ───────────────────────────────────────┘ │
 *   │  SCIENCE OFFICER                                        │
 *   │  Unassigned Officer ← pack name / stand-in              │
 *   │  [AWAITING OFFICER MANIFEST — placeholder mode only]    │
 *   │  CONTACT CHANNELS (nav)                                 │
 *   │  [brass row: EMAIL / rosa@example.com]  ≥44px targets   │
 *   │  HOLD/OS 0.1.0 · The Survey Archive  ← colophon         │
 *   └─────────────────────────────────────────────────────────┘
 *
 * - Semantics: the card is the whole page for phone users — one h1, a nav
 *   with a real list for the channels, landmark structure (main/nav/footer),
 *   focus-visible rides the global in-world ring, and the only motion is the
 *   well's warm-up + the caret blink (both collapse under reduced motion via
 *   the global kill-switch).
 * - Portrait-first: single column, reading type ≥16px, channel rows ≥44px
 *   touch targets, everything wraps (`overflow-wrap: anywhere`) so there is
 *   no horizontal scroll even at 320px; the plate centers with `margin: auto`
 *   so short landscape viewports scroll instead of clipping.
 * - PLACEHOLDER LAW (about precedent): stand-ins render, nothing from an
 *   unfiled pack is forwarded, and the dashed awaiting notice explains the
 *   empty seat.
 */

import { getContent, isPlaceholderContent } from '../../lib/content'
import {
  AWAITING_BODY,
  AWAITING_TITLE,
  EMPTY_CHANNELS,
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  NOTICE_ARCHIVE_NAME,
  NOTICE_MESSAGE,
  NOTICE_OS_NAME,
  NOTICE_OS_VERSION,
  NOTICE_STATUS_LINE,
  NOTICE_STATUS_QUALIFIER,
  NOTICE_TITLE,
  linkDomain,
  noticeView,
  type NoticeView,
} from './notice-model'
import './notice.css'

/** The pack resolves once per build (immutable display data; MF-3's seam). */
const VIEW: NoticeView = noticeView(getContent(), isPlaceholderContent())

/** The mounted page: reads the ambient content seam, nothing else. */
export function NoticeCard() {
  return <NoticePlate view={VIEW} />
}

/** The card document itself — presentational, proven against fixture packs. */
export function NoticePlate({ view }: { readonly view: NoticeView }) {
  return (
    <main className="notice" data-notice-card>
      <section className="notice-plate bevel-raised" aria-labelledby="notice-title">
        <h1 className="notice-title" id="notice-title" data-notice-title>
          {NOTICE_TITLE}
        </h1>

        {/* -- the phosphor well: the POST the handheld link actually gets -- */}
        <div className="well notice-well" data-notice-well>
          <p className="notice-post-line" data-notice-status>
            {NOTICE_STATUS_LINE}
          </p>
          <p className="notice-post-line" data-notice-qualifier>
            {NOTICE_STATUS_QUALIFIER}
          </p>
          <p className="notice-post-msg" data-notice-message>
            {NOTICE_MESSAGE}
            <span className="notice-caret" aria-hidden="true" />
          </p>
          <div className="scanlines" aria-hidden="true" />
        </div>

        {/* -- the officer's name (pack name, or the stand-in seat) --------- */}
        <section className="notice-officer" aria-labelledby="notice-officer-legend">
          <h2 className="notice-legend engraved" id="notice-officer-legend">
            Science Officer
          </h2>
          <p className="notice-name" data-notice-name>
            {view.name}
          </p>
        </section>

        {/* -- the placeholder notice (stand-ins, never markers) ------------ */}
        {view.placeholder && (
          <div className="notice-awaiting" data-notice-awaiting role="note">
            <p className="notice-awaiting-title">{AWAITING_TITLE}</p>
            <p className="notice-awaiting-body">{AWAITING_BODY}</p>
          </div>
        )}

        {/* -- contact channels: brass rows, real anchors ------------------- */}
        <nav className="notice-channels" aria-labelledby="notice-channels-legend">
          <h2 className="notice-legend engraved" id="notice-channels-legend">
            Contact Channels
          </h2>
          {view.links.length === 0 ? (
            <p className="notice-empty" data-notice-empty>
              {EMPTY_CHANNELS}
            </p>
          ) : (
            <ul className="notice-channel-list">
              {view.links.map((link) => (
                <li key={link.url}>
                  <a
                    className="notice-link"
                    data-notice-link
                    href={link.url}
                    target={EXTERNAL_LINK_TARGET}
                    rel={EXTERNAL_LINK_REL}
                  >
                    <span className="notice-link-label">{link.label}</span>
                    <span className="notice-link-domain" data-notice-domain>
                      {linkDomain(link.url)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {/* -- HOLD/OS colophon (digits ride B612, the measuring law) -------- */}
        <footer className="notice-colophon" data-notice-colophon>
          <p className="notice-colophon-line">
            {NOTICE_OS_NAME}{' '}
            <span className="notice-colophon-version" data-notice-colophon-version>
              {NOTICE_OS_VERSION}
            </span>
            <span aria-hidden="true">{' · '}</span>
            {NOTICE_ARCHIVE_NAME}
          </p>
        </footer>
      </section>
    </main>
  )
}
