# Relay One — Site-based radio group proposal

Status: **design concept only** (not currently activated). Version 6.2 retains the same ten shared numbered channels and PINs on all devices.

## Recommendation

Keep a stable underlying **radio channel number**, but show a meaningful **site or function name** beside it. In the interface, a numbered channel and a "site group" are the same technical object: one independent voice room, with its own membership, monitoring selection, Hold Talk, Call alert, PIN/access rule, and active speaker display.

Examples:
- `CH 01 — General`: users who need a broad shared channel
- `CH 02 — Dispatch`: dispatch and field users
- `CH 03 — Patrol`: active general patrol group
- `CH 04 — Staff`: coordination / backup
- `CH 05 — Events`: temporary event radio
- `CH 06 — Government Center`: site-specific private group
- `CH 07 — Fairgrounds`: site-specific private group
- `CH 08 — Course Site`: site-specific placeholder; confirm site label with operator
- `CH 09 — Site 4`: placeholder for another private assignment
- `CH 10 — Supervisors`: administrative coordination

These names are **proposals**, not confirmed operational assignments. Do not silently rename the actual application channels until the operator approves the naming plan. Existing shared channels should not be recreated as new IDs when labels change; the labels should be centrally published for all devices.

## Proposed access workflow

1. An administrator assigns a user to one or more sites using a backend access list.
2. The user signs in with a verified account, and the dashboard lists only the site channels authorized for that account.
3. If the site uses a temporary four-digit PIN, the user enters it **in addition to** their authenticated membership. The server validates the PIN, enforces throttling, and grants a short-lived room permission.
4. One person can join multiple authorized site groups, switch Monitor independently, and use the dedicated Talk button for the intended site without cross-channel audio.
5. Patrol supervisors or dispatchers may receive explicitly assigned permission to monitor all relevant site rooms. Regular staff cannot subscribe to unassigned room media, roster, speaker state, or activity notices.

## Per-shift PIN changes

If PINs change per shift, the server should:
- create or rotate the code at a scheduled shift handoff;
- deliver the code via an approved internal method, not public source;
- invalidate previous codes and optionally disconnect/revalidate existing sessions;
- log permitted administrative changes without storing the cleartext code in public files;
- lock out or rate-limit guessed PINs;
- apply individual account permissions *independently* of the site code.

A four-digit PIN has 10,000 combinations, so it is suitable as a convenience/access signal only when rate-limited and combined with accounts; it is not strong authentication on its own. On the current static GitHub Pages prototype, PINs are client-side checked and cannot be made secure or changed per shift without a trusted server.

## Layout idea

For compact viewing, show `[✓] CH 06 · Government Center   ● Connected` above a small row of `Focus | Hold Talk | Call | Monitor`. Detailed mode can expand participant roster and stream status. Preserve existing phone-friendly hold-to-talk targets.

## Deployment order

First field-test V6.2's compact design and measured data usage on Samsung Galaxy S22 Ultra and Pixel 8 Pro. Next agree on ten shared site/function labels. Then implement server-side identity, administration, and site membership before attempting enforceable per-shift PIN rotation or all-channel monitoring.
