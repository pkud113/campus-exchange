# Campus Exchange mobile foundation

Step 1 intentionally contains architecture and shared configuration only. Step 2 will select and initialize the supported React Native/Expo runtime without importing DOM components from `apps/web`.

The mobile dependency boundary is:

- consume `contracts`, `domain`, `api-client`, `validation`, `design-tokens`, `analytics`, and `shared-types`;
- adapt design tokens to native styles and accessibility APIs;
- provide secure platform storage for Supabase sessions and never persist service credentials;
- use the same `/api/v1` contracts, idempotency keys, error envelope, analytics names, and visibility semantics as web;
- implement iOS/Android navigation and UI natively rather than sharing HTML/CSS components.

Native configuration, deep links, push-notification credentials, camera/photo permissions, and app-store metadata are deferred until the runtime is selected in Step 2. No production control depends on this package in Step 1.
