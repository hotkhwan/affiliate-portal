# KWANNI Mission Zero Alpha

This UI validates one behavior loop for a beginner:

`manual product → consent → product reference → mission → three-shot guide → upload → draft/caption → export → mark posted → record result → next action`

The browser calls the reviewed `llm-api` Mission Zero contract under `/dev/llm-api/v1` by default. `NUXT_PUBLIC_MISSION_API_BASE` may select a different same-environment base path without putting credentials in public runtime configuration.

## Product boundaries

- Thai, consumer-first guidance; no prompt or model controls are exposed.
- The first value is available before credits or payment.
- Copy does not promise sales, income, or automatic earnings.
- Caption generation may use the local service or deterministic fallback; either path presents the same user flow.
- The shared Qwen runtime acts through multiple internal roles and returns a versioned provider-neutral Production Spec. Model names, prompts, and provider controls are not exposed to beginners.
- At least one real product-reference image is required before draft generation. It anchors the Product Bible without making ShotVL or any cloud renderer a blocking UI dependency.
- Raw media and export targets use SeaweedFS S3-compatible object storage through the API. The browser never receives storage credentials.
- Alpha capture accepts JPEG, PNG, and MP4 files up to the API contract limit of 8 MB per shot; product references also accept WebP.
- After all required media exists, the user must pass a dedicated review step and may replace any reference or shot before draft generation.
- Export is asynchronous. The UI displays queued/running/failed state, refreshes the saved mission, and offers a download only when the API returns a real `downloadUrl`.
- Posting remains manual. The user records the platform and may optionally record the public post URL.
- Views, clicks, and sales are optional observed results; the API enforces `views >= clicks >= sales >= 0` and returns the next action. No result is treated as guaranteed income.
- The installable mobile shell supports keyboard focus, reduced motion, resumable browser state, explicit retries, and a Service Worker that never caches Mission API requests.

## Alpha evidence

Measure from real sessions rather than feature count:

- whether a beginner understands the product in one minute;
- mission start and completion;
- time to the first draft;
- first exported file and first real post;
- Day 2 and Day 7 return;
- where the user needs human help.

The client stores an opaque Alpha identity, active mission ID, and unfinished product form in browser local storage. A central API-client identity callback supplies `X-Authenticated-User-ID` on every Mission request; it is intentionally isolated so a platform JWT adapter can replace it. The API owns mission authorization and consent evidence. The UI requires acceptance of Privacy Notice `2026-08-08` before creation. Product data and media are sent only after that action.
