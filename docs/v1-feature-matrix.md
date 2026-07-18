# Campus Exchange V1 feature matrix

Status values are `complete`, `incomplete`, or `missing`. Readiness is `yes`, `partial`, or `no`. This matrix is the release source of truth for Steps 1-3 and must be updated in the same change that changes a feature's readiness.

The release column distinguishes Step 1 foundations from Step 2 complete feature delivery and Step 3 production hardening. `Required` means the feature must be complete before public V1 release even when its full UX is scheduled after Step 1.

| Area | Capability | Current status | Backend | Web | Mobile | Automated coverage | Release requirement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Identity | Reviewed-domain student registration | complete | yes | yes | partial | contract, unit, pgTAP, E2E | Required |
| Identity | Sign-in, recovery, onboarding, logout | complete | yes | yes | partial | contract, unit, E2E | Required |
| Identity | Staff invitation and MFA enforcement | complete | yes | yes | partial | contract, pgTAP | Required |
| Identity | Server-derived campus and immutable username | complete | yes | yes | yes | pgTAP, contract | Required |
| Profiles | Basic handle/display name/avatar/banner | incomplete | partial | yes | partial | unit, pgTAP indirect | Step 1 foundation |
| Profiles | Bio, academic field, graduation privacy, interests | missing | no | no | no | none | Step 1 foundation; Step 2 UX |
| Profiles | Visibility and activity sections | missing | no | no | no | none | Step 1 foundation; Step 2 UX |
| Profiles | Mutual friends and organization memberships | missing | no | no | no | none | Required |
| Profiles | Safe same-campus/network projections without email | incomplete | yes | yes | partial | pgTAP | Step 1 harden |
| Friends | Send/accept/decline/cancel/remove | missing | no | no | no | none | Step 1 foundation; Step 2 UX |
| Friends | Incoming/outgoing lists, counts, mutuals | missing | no | no | no | none | Required |
| Friends | Duplicate/contradiction/block prevention | missing | no | no | no | none | Step 1 foundation |
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
| Events | Organization-owned events/activity | missing | no | no | no | none | Required |
| Discussions | Communities/memberships/ownership | complete | yes | yes | partial | contract, unit, pgTAP | Required |
| Discussions | Posts/media/votes/saves/ranking/search | complete | yes | yes | partial | contract, unit, pgTAP | Required |
| Discussions | Threaded comments and moderation | complete | yes | yes | partial | unit, pgTAP | Required |
| Organizations | Profiles, campus/network status, links/media | missing | no | no | no | none | Step 1 foundation; Step 2 UX |
| Organizations | Owner/admin/officer/member roles | missing | no | no | no | none | Step 1 foundation |
| Organizations | Join requests, invitations, membership policy | missing | no | no | no | none | Step 1 foundation; Step 2 UX |
| Organizations | Posts, events, discussions, reporting/suspension | missing | no | no | no | none | Required |
| Social | Profile and organization text/image posts | missing | no | no | no | none | Step 1 foundation; Step 2 UX |
| Social | Campus/network/friends visibility | missing | no | no | no | none | Step 1 foundation |
| Social | Reactions, comments, replies, edit, soft delete | missing | no | no | no | none | Required |
| Social | Visibility-aware paginated feeds | missing | no | no | no | none | Step 1 foundation; Step 2 UX |
| Search | Marketplace search | complete | yes | yes | partial | unit, pgTAP | Required |
| Search | People and discussion search | incomplete | yes | yes | partial | unit, pgTAP | Required |
| Search | Unified multi-entity search | missing | no | no | no | none | Step 1 foundation; Step 2 UX |
| Search | Blocking/visibility applied in trusted layer | incomplete | partial | partial | partial | pgTAP | Step 1 harden |
| Notifications | In-app list/read state | complete | yes | yes | partial | unit, pgTAP | Required |
| Notifications | Preferences/quiet hours/outbox delivery | complete | yes | yes | partial | worker unit, pgTAP | Required |
| Notifications | V1 category taxonomy | incomplete | partial | partial | partial | worker unit | Step 1 foundation |
| Safety | Global blocking | complete | yes | yes | partial | pgTAP | Required |
| Safety | Reporting and protected snapshots | complete | yes | yes | partial | contract, pgTAP | Required |
| Moderation | Campus/platform roles, AAL2, audit | complete | yes | yes | partial | contract, pgTAP | Required |
| Moderation | Organization moderation boundaries | missing | no | no | no | none | Step 1 foundation |
| Navigation | Consistent desktop shell | incomplete | n/a | partial | n/a | unit | Step 1 complete |
| Navigation | Mobile bottom nav/drawer | incomplete | n/a | partial | partial | E2E public only | Step 1 complete |
| Navigation | All V1 areas, global search/create/context | missing | n/a | no | no | none | Step 1 complete |
| Design system | Tokens, light/dark, focus, responsive shell | incomplete | n/a | partial | partial | theme unit | Step 1 complete |
| Design system | Complete accessible primitive set | missing | n/a | no | no | none | Step 1 complete |
| Design system | Domain cards/media/confirmation states | incomplete | n/a | partial | partial | sparse unit | Step 1 complete |
| Web migration | Public/auth pages on final system | incomplete | n/a | partial | partial | public E2E | Step 1 complete |
| Web migration | All authenticated/staff pages on final system | incomplete | n/a | partial | partial | none for auth layouts | Step 1 complete |
| Shared architecture | Contracts and domain packages | incomplete | partial | yes | partial | unit/contract | Step 1 complete |
| Shared architecture | API client, validation, tokens, analytics, shared types, testing | missing | no | no | no | none | Step 1 complete |
| Shared architecture | Mobile architecture/configuration | missing | n/a | n/a | no | none | Step 1 complete |
| Operations | Outbox retry/dead-letter and retention | complete | yes | n/a | yes | worker unit, pgTAP | Required |
| Operations | CI reset/lint/pgTAP/type/lint/unit/build/E2E/audit | complete | yes | yes | partial | CI | Step 1 gate |
| Quality | RLS campus isolation | complete for existing models | yes | n/a | yes | pgTAP | Required |
| Quality | Friends/org/social/search RLS isolation | missing | no | n/a | no | none | Step 1 gate |
| Quality | Design-system accessibility and layouts | missing | n/a | no | no | public E2E only | Step 1 gate |

## Step ownership

- Step 1 moves every `Step 1 complete`, `Step 1 foundation`, `Step 1 harden`, and `Step 1 gate` row to the required readiness without shipping disconnected UI.
- Step 2 completes the user-facing friends, organizations, social feed, expanded profiles, unified search, and notification workflows on web and mobile clients.
- Step 3 finishes operational hardening, release validation, production smoke, performance measurement, store/deployment readiness, and any remaining `partial` coverage.

No row may be marked complete based only on a schema, mock screen, or visual component. Completion requires an integrated authorized path, working empty/loading/error states, and the listed minimum automated coverage.

