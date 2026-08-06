# KWANNI Mission Zero Alpha

This UI validates one behavior loop for a beginner:

`manual product → mission → three-shot guide → upload → draft/caption → export plan → mark posted`

The browser calls the reviewed `llm-api` Mission Zero contract under `/v1`. `NUXT_PUBLIC_MISSION_API_BASE` may select a different same-environment base path without putting credentials in public runtime configuration.

## Product boundaries

- Thai, consumer-first guidance; no prompt or model controls are exposed.
- The first value is available before credits or payment.
- Copy does not promise sales, income, or automatic earnings.
- Caption generation may use the local service or deterministic fallback; either path presents the same user flow.
- Raw media and export targets use SeaweedFS S3-compatible object storage through the API. The browser never receives storage credentials.
- Alpha uploads accept JPEG, PNG, and MP4 files up to the API contract limit of 8 MB per shot.
- Alpha reserves a deterministic vertical MP4 export plan. Actual FFmpeg rendering and a signed download endpoint remain later acceptance gates and are not claimed by this UI.
- Posting remains manual. The user records the platform and may optionally record the public post URL.

## Alpha evidence

Measure from real sessions rather than feature count:

- whether a beginner understands the product in one minute;
- mission start and completion;
- time to the first draft;
- first export plan and first real post;
- Day 2 and Day 7 return;
- where the user needs human help.

The current client stores only an opaque Alpha user ID and active mission ID in browser local storage. Product data and media are sent to the API. Privacy notice, consent, authenticated profile binding, real export/download, and analytics are required before expanding beyond the controlled Alpha.
