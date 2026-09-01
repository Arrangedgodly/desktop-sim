# Author Content Pack — HOLD/OS

Every word in this OS that is about **you** comes from one file. This template
collects those words, once. Fill it in, hand it back, and the About nameplate,
the Project Browser catalog cards, the phone notice card, the README, and the
desktop's Projects drawer all pick it up. Nothing about you is invented in your
absence: until this comes back filled, those surfaces display clearly-marked
placeholders.

**Time:** about 10 minutes.
**How to fill in:** type your answer on the line starting with `→` (replace the
`→` itself or keep it — either is fine). Keep the headings; they are how the
answers get mapped. If an optional block doesn't apply to you, write `—` on its
line or delete the whole block.
**What happens next:** a fill task transcribes your answers into
`content/author.json` — you never write JSON yourself.
**Rule of honesty:** short and true beats polished and vague. If you'd rather
not show a field, leave it out; absence is handled gracefully.

---

## 1 · You

### Name — required
The name on the science officer's nameplate.
→ [YOUR FULL NAME, OR THE NAME YOU WORK UNDER]

### Handle — optional
How you're known on code sites — shown beside your name when present.
→ [e.g. @your-name — OR WRITE "—"]

### Tagline — required
One line under your name. About 5–12 words; what you make or care about.
→ [ONE LINE, e.g. "Builds small, careful tools for ordinary people" — in your words]

### Bio — required
2–4 sentences. Who you are, what you make, and one detail that makes it yours
(a method, an obsession, a place). This is the only long-form text about you,
so make it count.
→ [SENTENCE 1.]
→ [SENTENCE 2.]
→ [SENTENCE 3 — optional.]
→ [SENTENCE 4 — optional.]

---

## 2 · Contact links

The links on the nameplate (and the phone notice card). 1–4 links.
Each needs a **Label** (the words shown) and a **URL** (the full address,
including `https://` or `mailto:`).
Copy the block between the ✂ lines for each extra link.

✂ - - - - - - - - - - - - - - - - - - - - - - - -
### Link 1
Label: → [e.g. Email / Website / GitHub / LinkedIn]
URL:  → [e.g. mailto:you@example.com OR https://github.com/your-name]
✂ - - - - - - - - - - - - - - - - - - - - - - - -

### Link 2
Label: → [LABEL — OR DELETE THIS BLOCK]
URL:  → [URL — OR DELETE THIS BLOCK]

### Link 3
Label: → [LABEL — OR DELETE THIS BLOCK]
URL:  → [URL — OR DELETE THIS BLOCK]

### Link 4
Label: → [LABEL — OR DELETE THIS BLOCK]
URL:  → [URL — OR DELETE THIS BLOCK]

---

## 3 · Projects

The catalogued exhibits — the work visitors are coming to see. 2–4 projects
is the sweet spot; 1 is fine, 6 is the ceiling.
Each project becomes one specimen card in the Project Browser and one `.txt`
specimen in the desktop's Projects drawer.
Copy the whole block between the ✂ lines for each project.

✂ - - - - - - - - - - - - - - - - - - - - - - - -
### Project 1
Slot id: exhibit-01  ← already filled; leave as-is unless told otherwise

Name — required
→ [PROJECT NAME]

One-line description — required
→ [WHAT IT IS / DOES, ONE LINE]

Tech tags — required, 2–4, comma-separated
→ [e.g. React, TypeScript, WebAudio — yours]

Live URL — optional
The deployed site, full address. Leave blank if not deployed.
→ [https://… — OR "—"]

Repo URL — optional
Source the curious can read. Leave blank if private.
→ [https://… — OR "—"]

Screenshot path — optional
A picture of the project. If you have one, say where it is
(e.g. `content/screenshots/myproject.png`) and drop the file there; the fill
task wires it in. Leave blank to skip — cards look fine without.
→ [PATH — OR "—"]

Story — optional, one paragraph
Why this project exists, what it taught you, or a war story from building it.
3–6 sentences. Shown as the card's reverse side.
→ [PARAGRAPH — OR DELETE THIS FIELD]
✂ - - - - - - - - - - - - - - - - - - - - - - - -

✂ - - - - - - - - - - - - - - - - - - - - - - - -
### Project 2
Slot id: exhibit-02  ← already filled

Name
→ [PROJECT NAME — OR DELETE THIS WHOLE BLOCK]

One-line description
→ [ONE LINE]

Tech tags
→ [2–4, COMMA-SEPARATED]

Live URL
→ [URL — OR "—"]

Repo URL
→ [URL — OR "—"]

Screenshot path
→ [PATH — OR "—"]

Story
→ [PARAGRAPH — OR DELETE THIS FIELD]
✂ - - - - - - - - - - - - - - - - - - - - - - - -

(Copy a ✂ block again for Project 3, 4, … and renumber the heading. New
slot ids will be assigned for you: exhibit-03, exhibit-04, …)

---

## 4 · Skills & interests — optional

Two short lists, shown on the nameplate beneath the bio. Comma-separated,
plain words, no proficiency bars — the archive doesn't grade its officers.

Skills (things you work with)
→ [e.g. TypeScript, Rust, animation, accessibility — yours — OR DELETE]

Interests (things you follow)
→ [e.g. old computers, field recording, maps — yours — OR DELETE]

---

## 5 · Mission-log line — optional, flavor

One line the console prints as if the archive itself had logged it — the
in-world voice, dry and observational, not a slogan. It appears in small type
on the nameplate. Write it in that voice, or leave it out and the OS keeps
its silence.
→ [ONE LINE, e.g. "All specimens accounted for; the survey continues." — yours]

---

## Where each field appears in the OS

Nothing you write here is wasted, and nothing appears somewhere surprising.
Field-by-field:

| Field | Where it surfaces |
|---|---|
| Name | About nameplate (AP-5) · phone notice card (UI-7) · README |
| Handle | About nameplate, beside the name |
| Tagline | About nameplate · README subtitle |
| Bio | About nameplate · README |
| Contact links | About nameplate (each becomes a safe external link) · phone notice card (primary link) · README |
| Project name | Project Browser card title (AP-6) · Projects drawer specimen label |
| Project one-line description | Project Browser card · README project list |
| Project tech tags | Project Browser card chips |
| Project live URL | Project Browser "Open live site" (external, new tab) · README |
| Project repo URL | Project Browser "Read the source" (external, new tab) · README |
| Project screenshot | Project Browser card illustration |
| Project story | Project Browser card reverse side |
| Skills | About nameplate |
| Interests | About nameplate |
| Mission-log line | About nameplate footer, small type |

Until this template comes back filled, every surface above shows
`[REPLACE VIA CONTENT PACK (MF-3)]`-marked placeholders — visible on purpose,
so an unfilled archive can't masquerade as a real one.
