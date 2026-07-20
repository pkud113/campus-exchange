# Campus Exchange V1 feature matrix

Status values are `complete`, `incomplete`, or `missing`. Readiness is `yes`, `partial`, or `no`. This matrix is the release source of truth for Steps 1-3 and must be updated in the same change that changes a feature's readiness.

The release column distinguishes Step 1 foundations from Step 2 complete feature delivery and Step 3 production hardening. `Required` means the feature must be complete before public V1 release even when its full UX is scheduled after Step 1.

| Area | Capability | Current status | Backend | Web | Mobile | Automated coverage | Release requirement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Identity | Reviewed-domain student registration | complete | yes | yes | partial | contract, unit, pgTAP, E2E | Required |
| Identity | Sign-in, recovery, onboarding, logout | complete | yes | yes | partial | contract, unit, E2E | Required |
| Identity | Staff invitation and MFA enforcement | complete | yes | yes | partial | contract, pgTAP | Required |
| Identity | Server-derived campus and immutable username | complete | yes | yes | yes | pgTAP, contract | Required |
| Profiles | Basic handle/display name/avatar/banner | complete | yes | yes | partial | unit, pgTAP | Step 1 foundation |
| Profiles | Bio, academics, interests, and field-level privacy | complete | yes | yes | partial | contract, unit, pgTAP | Required; mobile parity Step 3 |
| Profiles | Posts gallery, Listings, Events, and About tabs | complete | yes | yes | partial | contract, unit, pgTAP; authenticated E2E pending | Required |
| Profiles | Mutual friends and organization memberships | complete | yes | yes | partial | unit, pgTAP | Required |
| Profiles | Safe same-campus/network projections without email | complete | yes | yes | partial | pgTAP | Required |
| Friends | Send/accept/decline/cancel/remove | complete | yes | yes | partial | contract, pgTAP | Step 1 foundation; Step 2 UX |
| Friends | Incoming/outgoing lists, counts, mutuals | incomplete | partial | yes | partial | pgTAP | Required |
| Friends | Duplicate/contradiction/block prevention | complete | yes | yes | yes | pgTAP | Step 1 foundation |
| Marketplace | Browse/search/filter/detail | complete | yes | yes | partial | unit, pgTAP, E2E public shell | Required |
| Marketplace | Create/edit/soft-delete/lifecycle | complete | yes | yes | partial | unit, pgTAP | Required |
| Marketplace | Favorites | complete | yes | yes | partial | pgTAP indirect | Required |
| Marketplace | Campus/network visibility and exchange methods | complete | yes | yes | partial | contract, pgTAP | Required |
| Messaging | Contextual message requests | complete | yes | yes | partial | contract, pgTAP | Required |
| Messaging | Accept/decline/idempotent first message | complete | yes | yes | partial | pgTAP | Required |
| Messaging | Conversations, unread, Realtime | complete | yes | yes | partial | unit, pgTAP | Required |
| Messaging | Dedicated request management UX | incomplete | yes | partial | no | pgTAP | Step 2 polish |
| Events | Browse/create/edit/RSVP | complete | yes | yes | partial | contract, pgTAP | Required |
| Events | Campus/network visibility | complete | yes | yes | partial | pgTAP | Required |
| Events | Organization-owned events/activity | complete | yes | yes | partial | contract, pgTAP | Required |
| Discussions | Communities/memberships/ownership | complete | yes | yes | partial | contract, unit, pgTAP | Required |
| Discussions | Posts/media/votes/saves/ranking/search | complete | yes | yes | partial | contract, unit, pgTAP | Required |
| Discussions | Threaded comments and moderation | complete | yes | yes | partial | unit, pgTAP | Required |
| Organizations | Workspace home, campus/network status, links/media | complete | yes | yes | partial | contract, pgTAP | Required |
| Organizations | Categories, text/announcement/restricted channels, Realtime | complete | yes | yes | partial | pgTAP; authenticated E2E pending | Required |
| Organizations | Owner/admin/moderator/officer/member roles and overrides | complete for built-ins | yes | yes | partial | contract, pgTAP | Required; custom-role editor Step 2 |
| Organizations | Join requests, invitations, bans, ownership transfer | complete | yes | yes | partial | contract, pgTAP | Required |
| Organizations | Posts, events, reporting, audit, safety restrictions | complete | yes | yes | partial | pgTAP | Required |
| Social | Profile and organization text/image posts | complete | yes | yes | partial | contract, pgTAP | Required |
| Social | Campus/network/friends visibility | complete | yes | yes | yes | pgTAP | Step 1 foundation |
| Social | Reactions, comments, replies, report, edit, soft delete | complete | yes | yes | partial | contract, pgTAP | Required |
| Social | Visibility-aware paginated feeds | complete | yes | yes | partial | pgTAP | Step 1 foundation; Step 2 UX |
| Search | Marketplace search | complete | yes | yes | partial | unit, pgTAP | Required |
| Search | People and discussion search with responsive action cards | complete | yes | yes | partial | unit, pgTAP; viewport E2E pending | Required |
| Search | Unified multi-entity search | complete | yes | yes | partial | contract, pgTAP | Step 1 foundation; Step 2 UX |
| Search | Blocking/visibility applied in trusted layer | complete | yes | yes | yes | pgTAP | Step 1 harden |
| Notifications | In-app list/read state | complete | yes | yes | partial | unit, pgTAP | Required |
| Notifications | Preferences/quiet hours/outbox delivery | complete | yes | yes | partial | worker unit, pgTAP | Required |
| Notifications | V1 category taxonomy | complete | yes | yes | yes | worker unit, pgTAP | Step 1 foundation |
| Safety | Global blocking | complete | yes | yes | partial | pgTAP | Required |
| Safety | Reporting and protected snapshots | complete | yes | yes | partial | contract, pgTAP | Required |
| Moderation | Campus/platform roles, AAL2, audit | complete | yes | yes | partial | contract, pgTAP | Required |
| Moderation | Unified cases, evidence, organization/social actions, appeals/reversal | complete core | yes | yes | partial | contract, pgTAP | Required; advanced queue facets Step 2 |
| Registration | Precise institution/domain outcome codes and copy | complete | yes | yes | partial | contract, unit, pgTAP, public E2E | Required |
| Navigation | Consistent desktop shell | complete | n/a | yes | n/a | unit | Step 1 complete |
| Navigation | Mobile bottom nav/drawer | complete | n/a | yes | partial | unit, desktop/mobile E2E | Step 1 complete |
| Navigation | All V1 areas, global search/create/context | complete | n/a | yes | partial | unit | Step 1 complete |
| Design system | Tokens, light/dark, focus, responsive shell | complete | n/a | yes | yes | token/theme unit, E2E | Step 1 complete |
| Design system | Complete accessible primitive set | complete | n/a | yes | partial | component unit, axe E2E | Step 1 complete |
| Design system | Domain cards/media/confirmation states | complete | n/a | yes | partial | component unit | Step 1 complete |
| Web migration | Public/auth pages on final system | complete | n/a | yes | partial | desktop/mobile axe E2E | Step 1 complete |
| Web migration | All authenticated/staff pages on final system | complete | n/a | yes | partial | shell/navigation unit, build | Step 1 complete |
| Shared architecture | Contracts and domain packages | complete | yes | yes | yes | unit/contract | Step 1 complete |
| Shared architecture | API client, validation, tokens, analytics, shared types, testing | complete | yes | yes | yes | unit/contract | Step 1 complete |
| Shared architecture | Mobile architecture/configuration | complete | n/a | n/a | yes | type/build | Step 1 complete |
| Operations | Outbox retry/dead-letter and retention | complete | yes | n/a | yes | worker unit, pgTAP | Required |
| Operations | CI reset/lint/pgTAP/type/lint/unit/build/E2E/audit | complete | yes | yes | partial | CI | Step 1 gate |
| Quality | RLS campus isolation | complete for existing models | yes | n/a | yes | pgTAP | Required |
| Quality | Friends/org/social/search RLS isolation | complete | yes | n/a | yes | pgTAP | Step 1 gate |
| Quality | Design-system accessibility and layouts | complete | n/a | yes | partial | component unit, desktop/mobile axe E2E | Step 1 gate |

## Step ownership

- Step 1 moves every `Step 1 complete`, `Step 1 foundation`, `Step 1 harden`, and `Step 1 gate` row to the required readiness without shipping disconnected UI.
- Step 2 completes the remaining custom-role/member-override settings, advanced moderation queue facets, authenticated end-to-end fixture coverage, message-request polish, and optional channel-reaction/notification-preference work listed in [the product-alignment correction](./v1-product-alignment.md).
- Step 3 finishes operational hardening, release validation, production smoke, performance measurement, store/deployment readiness, and any remaining `partial` coverage.

No row may be marked complete based only on a schema, mock screen, or visual component. Completion requires an integrated authorized path, working empty/loading/error states, and the listed minimum automated coverage.
