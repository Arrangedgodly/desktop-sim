# Self-hosted typefaces — provenance

All files are Google Fonts pre-built **latin-subset WOFF2** files, downloaded once from the
Google Fonts CSS API v2 (immutable per-version `fonts.gstatic.com` URLs) and committed here so
the console ships with zero third-party font requests (offline dev, CSP-clean, exact pinning).
License for every face: **SIL Open Font License 1.1** — the license text travels alongside the
files it covers (OFL requires this for redistribution). No modification or re-subsetting was
performed, so the Reserved Font Name clause is untouched.

| Face / role | File(s) | Weight | Bytes | Source URL (fetched 2026-09-01) | License |
|---|---|---|---|---|---|
| Chakra Petch — LABEL/UI (engraved legends, tracked caps) | `chakra-petch-latin-400.woff2` | 400 | 9,728 | `https://fonts.gstatic.com/s/chakrapetch/v13/cIf6MapbsEk7TDLdtEz1BwkWn6pgar3I1A.woff2` | OFL 1.1 (`OFL-ChakraPetch.txt`, © 2018 Chakra Petch Project Authors) |
| Chakra Petch — LABEL/UI | `chakra-petch-latin-600.woff2` | 600 | 10,040 | `https://fonts.gstatic.com/s/chakrapetch/v13/cIflMapbsEk7TDLdtEz1BwkeQI51R5_F_gUk0w.woff2` | OFL 1.1 (same) |
| Lora — CONTENT (parchment reading surfaces) | `lora-latin-var-400-700.woff2` | 400–700 (variable) | 37,792 | `https://fonts.gstatic.com/s/lora/v37/0QIvMX1D_JOuMwr7I_FMl_E.woff2` | OFL 1.1 (`OFL-Lora.txt`, © 2011 Cyreal) |
| B612 Mono — MONO/timecode (ALL digits in readouts) | `b612-mono-latin-400.woff2` | 400 | 12,156 | `https://fonts.gstatic.com/s/b612mono/v16/kmK_Zq85QVWbN1eW6lJV0A7diOdDtw.woff2` | OFL 1.1 (`OFL-B612Mono.txt`, © 2012 Airbus / ENAC + intactile DESIGN) |
| B612 Mono — MONO | `b612-mono-latin-700.woff2` | 700 | 12,156 | `https://fonts.gstatic.com/s/b612mono/v16/kmK6Zq85QVWbN1eW6lJV0A7diOdDtw.woff2` | OFL 1.1 (same) |

**Total font payload: 81,872 bytes (80.0 KB)** — budget ≤ 150 KB (Thor, asserted by
`src/styles/fonts.test.ts`). Selection rationale + measurements: `docs/ultron/research/ui1-typefaces.md`.

The CSS API request set that produced these URLs (Chrome UA, `display=swap`):

- `https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;600&display=swap`
- `https://fonts.googleapis.com/css2?family=Lora:wght@400..700&display=swap`
- `https://fonts.googleapis.com/css2?family=B612+Mono:wght@400;700&display=swap`

Only the `/* latin */` subset blocks were taken; the `unicode-range` from those blocks is
re-declared verbatim in `../fonts.css` so the browser fetches a face only when the page
actually uses a covered codepoint. Non-latin subsets (thai, cyrillic, vietnamese, …) were
deliberately not fetched — this is a single-language (English) portfolio.
