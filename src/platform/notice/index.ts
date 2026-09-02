/**
 * Notice platform (UI-7) — the phone viewport gate + the LIMITED BANDWIDTH
 * CONSOLE card. Composition root (src/main.tsx) is the only production
 * consumer: it asks the gate at boot (before any desktop side effect) and
 * swaps cleanly both ways across the 1024px floor. See gate.ts for the
 * mechanism law and NoticeCard.tsx for the card's anatomy.
 */

export { NoticeCard, NoticePlate } from './NoticeCard'
export {
  createViewportGate,
  FULL_EXPERIENCE_FLOOR_PX,
  isPhoneViewport,
  PHONE_GATE_QUERY,
  type PhoneListener,
  type ViewportGate,
} from './gate'
export { noticeView, STANDIN_NAME, type NoticeView } from './notice-model'
