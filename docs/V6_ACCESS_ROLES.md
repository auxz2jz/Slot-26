# Relay One — Proposed Server-Backed User Roles and Channel Rules

## Current state

Version 6 is a **working concept** hosted as a public static webpage. Every visitor sees the same 10 numbered channels. Channels 1–5 are open; 6–10 require preset 4-digit PINs, verified in the client before joining. Up to 5 rooms may be connected at once. Each room's speaker activity, call alerts, roster, and audio are limited to active members of that room.

**No accounts, real administrators, trusted PIN management, or server-enforced permissions exist yet.** Do not treat the browser-only PINs as secure workplace access control.

## Proposed roles

| Capability | Regular radio user | Patrol supervisor | Office administrator |
|---|---|---|---|
| See available channel names | Only permitted channels | Assigned + supervised channels | All |
| Join an open channel | If assigned | If assigned | If assigned |
| Join a restricted channel | If assigned and PIN/approval satisfied | If assigned or authorized by policy | If permitted by policy |
| Transmit in a joined channel | Yes | Yes | Yes |
| Listen/monitor a joined channel | Yes | Yes | Yes |
| Monitor several channels simultaneously | Only assigned channels | Assigned/supervised channels | Authorized channels |
| See a different channel's speaker/activity | No | Only if authorized | Only if authorized |
| Create/rename channels | No | Optional delegated right | Yes |
| Set/reset channel PIN | No | Optional delegated right | Yes |
| Add/remove user memberships | No | Optional delegated right | Yes |
| Revoke a user session | No | Optional delegated right | Yes |
| See channel-wide call logs | Own permitted events | Supervised channels only | Assigned organizational scope |

## Proposed server-enforced access

1. Require signed-in verified identities; user-visible callsign is editable but independent of immutable account ID.
2. Maintain channels, memberships, monitoring grants, and role assignments in a database, not the downloaded webpage.
3. Authorize **every** action at the server: join, publish audio, subscribe to audio, view roster/speaker status, send call alert, and administer PINs.
4. Use short-lived, scoped WebRTC tokens, TURN credentials, and channel permissions. Revocation should terminate active media subscriptions, not merely hide UI controls.
5. Rate-limit PIN guesses, hash PINs server-side, permit PIN resets, and consider longer passcodes or account-only access for private operational channels.
6. Separate **channel presence metadata** from global presence; never broadcast Channel B's active status, membership, speaker, or calls to Channel A unless the receiving user is explicitly authorized for B.
7. Define supervisor/dispatcher monitoring as an auditable, narrowly scoped permission rather than a universal bypass.
8. Keep PINs and account secrets out of public source code, URLs, browser storage, and client-visible diagnostic logs.
9. Use an SFU/media router for group voice, especially when users monitor 5+ channels, and a TURN relay for cellular/corporate connectivity.
10. Add actionable notifications and background-mode support per Android/iPhone capabilities. A PWA alone does not guarantee persistent background microphone access.

## Priority build order

- Phase A: identities, backend session management, membership storage, and server-enforced channel access.
- Phase B: per-channel monitoring permissions, supervisor/office role management, PIN rotation, and revoke controls.
- Phase C: scalable multi-channel media routing and reliable reconnection.
- Phase D: direct calls, call acknowledgment, priority alerts, presence history, and appropriate audit functions.

Use this proposal as the authorization specification before implementing any private workplace deployment.
