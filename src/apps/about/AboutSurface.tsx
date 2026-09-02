/**
 * About surface (AP-5) — THE SCIENCE OFFICER'S NAMEPLATE MANIFEST, the most
 * crafted single surface in the product: a museum plaque meets a ship's
 * commissioning plate. Singleton window (the manifest's `singleton: true`;
 * every re-open raises the one window — this component manages none of it).
 * Mounted lazy in its own chunk.
 *
 * Anatomy — the brief's duality, one document:
 *
 *   ┌ the parchment sheet (the archive's reading side) ───────────────┐
 *   │ ┌ BRASS COMMISSIONING PLATE, riveted to the sheet ────────────┐ │
 *   │ │  SCIENCE OFFICER · NAMEPLATE MANIFEST      (setting screws) │ │
 *   │ │  Rosa Vega                              ← Lora, engraved    │ │
 *   │ │  @vega-cartograph                      ← handle             │ │
 *   │ │  Maps for places that do not exist     ← mission statement   │ │
 *   │ │  [ MOD-0001 · LOG/2087-03-14 09:37Z ]  ← the stamp, pressed │ │
 *   │ └─────────────────────────────────────────────────────────────┘ │
 *   │  (AWAITING OFFICER MANIFEST — placeholder mode only)            │
 *   │  LEDGER NOTE ──────────────────────────  ← pasted specimen label│
 *   │  The bio, Lora on parchment, generous leading.                  │
 *   │  CONTACT CHANNELS                                                │
 *   │  [rivet] EMAIL      rosa@example.com            ● [rivet]        │
 *   │  [rivet] GITHUB     github.com                  ● [rivet]        │
 *   │  APPARATUS / PURSUITS — engraved chips (pack provides → shown)  │
 *   │  — the mission-log line, small italic at the foot               │
 *   └──────────────────────────────────────────────────────────────────┘
 *   ┌ THIS CONSOLE (dark chrome colophon — the machine, not the officer) ┐
 *   │ HOLD/OS 0.1.0 · REACT · TYPESCRIPT · VITE                          │
 *   │ You are inside the exhibit itself — …                              │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * - PLACEHOLDER LAW: while isPlaceholderContent(), the plate renders
 *   in-world stand-ins ("Unassigned Officer", manifest pending) and NEVER a
 *   raw `[REPLACE VIA CONTENT PACK]` marker — a recruiter must never see
 *   template debris (manifestView enforces this by construction).
 * - The commissioning stamp cites the archive's own record: the nameplate
 *   specimen's accession code + accessionedAt, read from the LIVE FS store
 *   (the one place the archive keeps accession truth). No record → `LOG/—`.
 * - External channels are real anchors: target _blank + rel noopener
 *   noreferrer, hover/focus lights the row's phosphor lamp (the brief's
 *   sanctioned lamp class, seated in its own tiny well), and the in-world
 *   focus ring (brass, via .parchment-surface) rides focus-visible.
 * - One authored moment: the stamp PRESSES IN on mount (transform+opacity,
 *   exponential ease-out; the global reduced-motion switch collapses it to
 *   the pressed state).
 */

import { useFSStore } from '../../platform/stores'
import { getContent, isPlaceholderContent } from '../../lib/content'
import {
  AWAITING_BODY,
  AWAITING_TITLE,
  BUILT_WITH,
  COLOPHON_NOTE,
  COLOPHON_OS_NAME,
  COLOPHON_OS_VERSION,
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  commissioning,
  linkDomain,
  manifestView,
  nameplateSpecimen,
  type Commissioning,
  type ManifestView,
} from './about-model'
import './about.css'

/** The pack resolves once per build (immutable display data; MF-3's seam). */
const VIEW: ManifestView = manifestView(getContent(), isPlaceholderContent())

/**
 * The mounted surface: the platform's window, reading the ambient seams
 * (content pack + live FS) and handing them to the document.
 */
export default function AboutSurface() {
  // The commissioning record rides the LIVE archive: the nameplate specimen
  // is the manifest's own accession record (deleting the desktop reference
  // soft-degrades the stamp to LOG/—, never to a lie).
  const fs = useFSStore((s) => s.fs)
  const record = commissioning(nameplateSpecimen(fs.nodes))
  return <NameplateManifest view={VIEW} commissioning={record} />
}

/** The manifest document itself — presentational, proven against fixtures. */
export function NameplateManifest({
  view,
  commissioning,
}: {
  readonly view: ManifestView
  readonly commissioning: Commissioning
}) {
  const hasChips = view.skills.length > 0 || view.interests.length > 0
  return (
    <div className="about" data-about-surface>
      <div className="about-scroll parchment-surface">
        {/* -- the brass commissioning plate ------------------------------ */}
        <header className="about-plate">
          <span className="about-rivet about-rivet--tl" aria-hidden="true" />
          <span className="about-rivet about-rivet--tr" aria-hidden="true" />
          <span className="about-rivet about-rivet--bl" aria-hidden="true" />
          <span className="about-rivet about-rivet--br" aria-hidden="true" />
          <p className="about-plate-legend">Science Officer · Nameplate Manifest</p>
          <h1 className="about-name" data-about-name>
            {view.name}
          </h1>
          {view.handle.length > 0 && (
            <p className="about-handle" data-about-handle>
              {view.handle}
            </p>
          )}
          <p className="about-tagline" data-about-tagline>
            {view.tagline}
          </p>
          <p className="about-stamp" data-about-stamp>
            {commissioning.accession !== null && (
              <span className="about-stamp-code" data-about-stamp-code>
                {commissioning.accession}
              </span>
            )}
            <span className="about-stamp-log" data-about-stamp-log>
              {commissioning.stamp}
            </span>
          </p>
        </header>

        {/* -- the placeholder notice (stand-ins, never markers) ----------- */}
        {view.placeholder && (
          <div className="about-awaiting" data-about-awaiting role="note">
            <p className="about-awaiting-title">{AWAITING_TITLE}</p>
            <p className="about-awaiting-body">{AWAITING_BODY}</p>
          </div>
        )}

        {/* -- the ledger note (bio as a pasted specimen label) ------------ */}
        <section className="about-note" aria-labelledby="about-note-legend">
          <h2 className="about-note-legend engraved--parchment" id="about-note-legend">
            Ledger Note
          </h2>
          <p className="about-bio" data-about-bio>
            {view.bio}
          </p>
        </section>

        {/* -- contact channels: brass plate-riveted rows ------------------ */}
        <section className="about-channels" aria-labelledby="about-channels-legend">
          <h2 className="about-legend engraved--parchment" id="about-channels-legend">
            Contact Channels
          </h2>
          {view.links.length === 0 ? (
            <p className="about-empty" data-about-empty>
              No channels riveted to this manifest yet.
            </p>
          ) : (
            <ul className="about-channel-list">
              {view.links.map((link) => (
                <li key={link.url}>
                  <a
                    className="about-link"
                    data-about-link
                    href={link.url}
                    target={EXTERNAL_LINK_TARGET}
                    rel={EXTERNAL_LINK_REL}
                  >
                    <span className="about-rivet about-rivet--row" aria-hidden="true" />
                    <span className="about-link-label">{link.label}</span>
                    <span className="about-link-domain" data-about-domain>
                      {linkDomain(link.url)}
                    </span>
                    <span className="about-lamp" aria-hidden="true" />
                    <span className="about-rivet about-rivet--row" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* -- apparatus & pursuits: engraved chips (pack provides → shown) - */}
        {hasChips && (
          <section className="about-chips-section" aria-labelledby="about-chips-legend">
            <h2 className="about-legend engraved--parchment" id="about-chips-legend">
              Apparatus &amp; Pursuits
            </h2>
            <div className="about-chip-groups">
              {view.skills.length > 0 && <ChipGroup label="Apparatus" items={view.skills} />}
              {view.interests.length > 0 && <ChipGroup label="Pursuits" items={view.interests} />}
            </div>
          </section>
        )}

        {/* -- the mission-log line, quiet at the sheet's foot ------------- */}
        {view.missionLog.length > 0 && (
          <p className="about-missionlog" data-about-missionlog>
            {view.missionLog}
          </p>
        )}
      </div>

      {/* -- THIS CONSOLE: the machine's colophon, dark chrome -------------- */}
      <footer className="about-colophon" data-about-colophon>
        <p className="about-colophon-legend engraved">This Console</p>
        <p className="about-colophon-line">
          {COLOPHON_OS_NAME}{' '}
          <span className="about-colophon-version" data-about-colophon-version>
            {COLOPHON_OS_VERSION}
          </span>
          <span className="about-colophon-sep" aria-hidden="true">
            {' · '}
          </span>
          {BUILT_WITH.join(' · ').toUpperCase()}
        </p>
        <p className="about-colophon-note" data-about-colophon-note>
          {COLOPHON_NOTE}
        </p>
      </footer>
    </div>
  )
}

/** One engraved chip cluster (apparatus = skills, pursuits = interests). */
function ChipGroup({
  label,
  items,
}: {
  readonly label: string
  readonly items: readonly string[]
}) {
  return (
    <div className="about-chip-group">
      <p className="about-chip-legend">{label}</p>
      <ul className="about-chips">
        {items.map((item) => (
          <li key={item} className="about-chip engraved--parchment" data-about-chip>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
