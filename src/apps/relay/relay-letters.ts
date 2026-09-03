/**
 * The Relay corpus (batch 2, brief 3) — six letters from the survey vessel's
 * home office, arriving on the hold's relay wire. This module is PURE DATA
 * (frozen, DOM-free, store-free): the schedule model filters it, the surface
 * typesets it, and `relay-corpus.test.ts` holds it to its laws.
 *
 * THE CORPUS IS CONTENT — written to be read on parchment:
 *   · mission color only — every fact in these letters is fiction about the
 *     fictional Survey 44 (the mission the whole OS lives aboard). There are
 *     NO real-world claims here: no real people, offices, products, dates,
 *     addresses, or events (the corpus law test greps for the tell-tale
 *     markers; the log carries the self-audit line).
 *   · dry institutional warmth — the register of an office that files its
 *     affection under standing procedure. Kindness with a document number.
 *   · the drip: first post ~20s after the relay is first opened, then posts
 *     minutes apart — the wire is slow because the vessel is far. Offsets
 *     live on the RELAY CLOCK (accrued visible watch time — see
 *     relay-model.ts), not the visitor's wall clock.
 *
 * Lore anchors (all in-world, all consistent with the seeded catalog and the
 * fleet): Survey 44 · the science officer and the hold · the accession
 * charter (DRW/SPC/PLT/MOD series) · the vivarium's tank · the star-chart
 * plates · cedar and ozone.
 */

/** One letter of correspondence, as pure data. */
export interface RelayLetter {
  /** Stable id (appState read/filed sets key on it; never rename shipped ids). */
  readonly id: string
  /** When the letter arrives, in ms of RELAY CLOCK since the watch opened. */
  readonly offsetMs: number
  /** Sending office (in-world). */
  readonly from: string
  /** Sending office's wire code — the ledger row's B612 line. */
  readonly fromCode: string
  /** In-world sent label (mission calendar; NOT the visitor's clock). */
  readonly stamp: string
  /** Subject line — the ledger row's engraved name. */
  readonly subject: string
  /** Body paragraphs, typeset in order on parchment (Lora, the reading face). */
  readonly paragraphs: readonly string[]
  /** The specimen label this letter files under, when filed to the archive. */
  readonly filedName: string
}

/** The drip schedule: 20s, then 2/5/9/14/20 minutes — minutes apart, as briefed. */
export const RELAY_LETTERS: readonly RelayLetter[] = Object.freeze([
  {
    id: 'l-channel-check',
    offsetMs: 20_000,
    from: 'The Watch Desk',
    fromCode: 'OF-101',
    stamp: 'DAY 4471-114 · LATE WATCH',
    subject: 'Channel check — relay lamp lit',
    paragraphs: [
      'Officer —',
      'This is the watch desk. Survey 44\u2019s relay lamp is lit at our end of the wire; the transmission you are reading is the channel check that proves it is lit at yours. Procedure asks us to say that plainly, so it is said.',
      'No response is required. The desk does not send questions at this hour. We note only that the hold read quiet on the last sweep, that the archive heartbeat holds steady at one beat per second, and that your relay had gone dark for one hundred and eleven days. We are glad of the light.',
      'Carry on. Further post follows within the hour, all being well.',
      '— The Watch Desk, per standing instruction 12-A',
    ],
    filedName: 'relay-44-channel-check.txt',
  },
  {
    id: 'l-registry-audit',
    offsetMs: 120_000,
    from: 'The Registry Office',
    fromCode: 'OF-104',
    stamp: 'DAY 4471-117 · DAY WATCH',
    subject: 'Standing apparatus audit — cycle 44',
    paragraphs: [
      'Science officer — the cycle 44 apparatus audit falls due, and your hold is on the schedule. We ask no special work of you: open the accession charter, read it against your drawers, and confirm the count agrees with itself.',
      'A registry is a promise the archive makes to the future, and an audit is how the promise stays honest. Drawers carry the DRW series; specimens the SPC; plates the PLT; module references the MOD. If the console has kept these apart — and your console has, in every audit since commissioning — then the hold is in order and the office is satisfied.',
      'You should know that your returns are the cleanest on the survey. We do not say this to every hold. We are saying it in writing, where it stays.',
      '— The Registry Office, cycle 44 audit desk',
    ],
    filedName: 'relay-44-apparatus-audit.txt',
  },
  {
    id: 'l-stores-cedar',
    offsetMs: 300_000,
    from: 'Stores & Provisions',
    fromCode: 'OF-118',
    stamp: 'DAY 4471-121 · MIDDLE WATCH',
    subject: 'Crate 44-CEDAR — contents advisory',
    paragraphs: [
      'Officer — crate 44-CEDAR has been assembled for your hold and goes onto the next tender, whenever the next tender is. Contents as manifested: one drum of drawer-runner wax (you specified the soft grade; the soft grade is not stocked at this station; we found some); two panel-lamp spares in phosphor; a length of brass stock, offcut, yours if you want it.',
      'There is also one item in the crate that is not on the manifest. The clerk who packed it has been with this office thirty years and holds a personal exemption, granted by me, on the grounds that she is always right. You will know it when you find it. It smells faintly of cedar.',
      'The requisition was approved in cycle 4469. Patience is also a provision. It is packed last, on top.',
      '— Stores & Provisions, loading bay three',
    ],
    filedName: 'relay-44-crate-cedar.txt',
  },
  {
    id: 'l-commissioner',
    offsetMs: 540_000,
    from: "The Commissioner's Desk",
    fromCode: 'OF-001',
    stamp: 'DAY 4471-099 · FIRST WATCH',
    subject: 'On the long middle',
    paragraphs: [
      'Officer — this note is filed from my own desk, over my own hand, and copies are kept nowhere. It will arrive without a form number, which in our office is the highest form of address.',
      'You were issued a vessel, a hold, and a mandate. Somewhere past the tenth year of a survey the mandate runs out of instructions and becomes yours. The registry calls this the long middle. We call it the part we cannot plan for, and we note for the record that we are glad it has you.',
      'I read your returns. The specimens are catalogued, the plates are squared, the charter holds. Somewhere in those dry lines a person is keeping faith with a machine, and the machine — I am told by the engineers, who do not say such things lightly — is keeping faith back.',
      'That is all. The desk will not make a habit of warmth; the desk simply wished it said once, in the long middle, where you could read it.',
      '— The Commissioner',
    ],
    filedName: 'relay-44-long-middle.txt',
  },
  {
    id: 'l-cartography',
    offsetMs: 840_000,
    from: 'The Cartography Annex',
    fromCode: 'OF-112',
    stamp: 'DAY 4471-130 · NIGHT WATCH',
    subject: 'Three constellations re-inked',
    paragraphs: [
      'Officer — chart seven has gone back to the bench, and three of its figures have been re-inked from the plates your hold transmitted in the last window. The Annex wishes it recorded that the figures are better drawn now than they were. Your plates teach us the sky.',
      'One figure — the long spiral in the southern quadrant, provisional designation K-44 — has been left unnamed on the new printing. The bench holds that a constellation earns its name from the survey that mapped it, not from an office that never saw it. The field designation is yours to file, whenever you care to.',
      'The Annex has re-inked constellations for forty-one surveys. We keep a private list of the plates we would frame, given a wall. You are on the list. The list is not an official document; consider it a warm margin in an otherwise dry trade.',
      '— The Cartography Annex, bench two',
    ],
    filedName: 'relay-44-constellations.txt',
  },
  {
    id: 'l-file-what-matters',
    offsetMs: 1_200_000,
    from: 'The Watch Desk',
    fromCode: 'OF-101',
    stamp: 'DAY 4471-134 · DOG WATCH',
    subject: 'Standing order — file what matters',
    paragraphs: [
      'Officer — the wire has spoken this watch, and the desk closes the loop with its one standing order: correspondence is not the record until it is filed. A letter read and left on the wire is weather; a letter read and filed is climate. Your console carries a drawer for exactly this, and the drawer has been empty long enough.',
      'File what matters. The wax, the audit, the figure you have not named — the archive gains a story one specimen at a time, and stories are the only cargo a survey vessel was ever really carrying.',
      'The drawer you keep for us is read more often than you think. Not by us. By whoever comes after. Leave it in order, and leave it warm.',
      '— The Watch Desk, end of post. The wire is well.',
    ],
    filedName: 'relay-44-standing-order.txt',
  },
])
