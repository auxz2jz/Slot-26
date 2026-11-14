# Relay One — Future Ideas & Development Backlog

**Captured:** 2026-11-14
**Status:** Parking-lot / future planning. Do **not** treat these ideas as committed features or deploy them without further discussion.

## Immediate project scope

Relay One is currently an independent experimental browser-based group radio app hosted at https://auxz2jz.github.io/Slot-26/ in GitHub repo `auxz2jz/Slot-26`. The developer is prototyping on personal devices (Samsung Galaxy S22 Ultra and Google Pixel 8 Pro, plus occasional iPhone testing) before any official employee application project. The intended formal employee application will be separately discussed with the employer/boss, including through the boss's own ChatGPT account. Do not assume an organization has approved deployment.

**User direction on 2026-11-14:** Return to developing the current standalone GitHub app. Put hardware radio gateways and offline/production server architecture on hold; merely retain them as ideas. Avoid unnecessary changes to the live app while documenting these plans.

Current experimental features as of V6.2: ten fixed shared channels, five public and five demo PIN-protected, up to five joined concurrently, per-channel PTT and monitoring, Compact/Detailed display modes, estimated WebRTC session and per-device cumulative usage counters, and a connection diagnostic log. The prototype uses GitHub Pages, PeerJS Cloud signaling, public STUN, direct peer-to-peer WebRTC audio, and no trustworthy backend access enforcement. Read the current code before changing behavior because this document may become outdated.

## Future site-based radio groups

- Keep stable channel IDs internally, but give shared, centrally managed, administrator-approved display names and site assignments, e.g. General, Dispatch, Patrol, Government Center, Fairgrounds, other site groups.
- The current app's fixed channel names cannot yet be edited by users; site aliases were proposed, not added to the current app.
- Regular employees should see only assigned site groups (plus any authorized general groups), with the default channel automatically selected based on their active shift and site.
- Patrol users should see/join/monitor all authorized patrol site channels; Administration should have organization-wide management as permitted. Permissions for supervisors/patrol and administrators should be explicitly assigned rather than assumed for every employee.
- Supervisors could monitor several groups at once but transmit to only one clearly selected group at a time. Avoid a cluttered dashboard for site-based staff.
- Site-specific shift-rotated four-digit PINs were proposed as additional convenience controls. A PIN or knowledge of the URL alone must not grant access; production design requires real account login, server-side authorization for join/listen/transmit, rate limits, and permission checks on both signaling and media access. Current client-side PIN checks are **not secure**.

## Interface and workflow ideas

- Preserve a reversible Compact/Detailed toggle to compare dense channel rows with fuller cards.
- Explore right-handed, left-handed, and large centered PTT positioning for thumb operation on mobile; provide strong current-target-channel indication.
- Prefer a dedicated Dispatch contact/priority call or emergency attention feature with clear authorization and accidental-activation protections.
- Keep network and audio diagnostics, browser session/cumulative radio traffic estimates, voice link state, and a microphone/speaker self-test.
- Continue field testing single-channel vs multi-channel reliability, especially Samsung-to-Pixel on Wi-Fi versus Verizon mobile connectivity.
- Avoid reporting WebRTC traffic estimates as exact Verizon-carrier billing/data consumption.

## Wired and Bluetooth accessories (later testing)

- Test ordinary USB-C wired headsets and microphones on USB-C-equipped Android and iPhone devices; audio routing is generally feasible for compatible devices.
- Explore wired USB-C push-to-talk headset/accessories, including relatively inexpensive ~$40 devices seen by the user. A dedicated button generally needs device/protocol-specific native integration: it cannot be assumed to work in the browser because the headset's audio works.
- Explore Bluetooth earpieces, shoulder speaker microphones, dedicated wireless PTT buttons, and hands-free options.
- For eventual Android employee app, a native bridge/service may handle compatible external PTT-button events, audio routing, background operation and disconnect safety. iOS PTT accessory support may differ.
- Desired use: small discreet earpiece/mic, possibly handheld palm-size microphone or lapel PTT. Optional multi-button physical devices could route one button to the employee's site and another to Dispatch, if safe/feasible.

## Fully offline site network (defer)

- Idea: install a Wi-Fi router/AP at a site (possibly elevated around 10 feet) and connect employee phones locally, with **no outside internet**.
- Run the local website/app assets, signaling server, employee account/permissions, channel registry, and optional TURN/SFU media services on Raspberry Pi 4/5 or small mini PC.
- For offline functionality, self-host PeerServer or appropriate alternative; bundle all JS locally (no CDN), avoid reliance on cloud STUN, solve locally trusted HTTPS for browser microphone access, and ensure local networking without Wi-Fi client isolation.
- Direct local WebRTC peer-to-peer voice may be sufficient for initial small testing; an SFU/media server becomes more useful for larger group fan-out and multi-channel monitoring.
- Pi 5 could be a starting platform for a small experimental site; an Intel N100-class mini PC (8–16 GB RAM) could offer headroom for SFU, control services and future gateway. These are **not benchmarked capacity guarantees**.
- A truly air-gapped site cannot speak to off-site users while isolated. Connected mode could bridge local and central authenticated services through a controlled link/VPN; local users should keep talking during internet outages. Any failover between local and connected modes needs separate design and testing.
- No specialized RF/server hardware required for an internet-only software radio; reliable networking and secure operations matter.

## Optional conventional two-way radio bridge (defer; user explicitly parked this)

- User's organization has **Baofeng** handheld two-way radios (exact models and radio service/frequencies not yet confirmed).
- A **Radio-over-IP (RoIP) gateway** could connect a conventional radio to one Relay One group on a local Pi/mini PC, carrying RF receive audio to phones and, with authorized PTT control, phone audio back to the radio transmitter.
- Many Baofeng UV-5R / UV-82 / BF-888S models use a Kenwood K1 two-pin speaker/mic connector, but **verify the exact unit and connector before selecting hardware**.
- Potential hardware: dedicated compatible radio, purpose-built isolated audio / PTT interface, USB sound interface and interface wiring for received audio (RX), microphone drive (TX), carrier/squelch detection (COS/COR), and PTT switch.
- VOX may be an initial prototype option, but carrier/squelch indication plus commanded fail-safe PTT are preferable for reliable full-duplex-of-control (half-duplex RF) behavior. Avoid feedback/echo loops, stuck transmit, and unsafe direct radio-to-computer audio wiring.
- SvxLink on Linux/Raspberry Pi is a possible reference for interfacing with RF radios; not selected as production Relay One software.
- Before any actual RF retransmission, identify and verify the specific Baofeng model, radio service and frequencies, transmitter authorization, and applicable FCC/regulatory requirements. Do not assume a radio gateway is permitted on FRS, GMRS, amateur or Part 90 business frequencies without checking their rules.
- **No implementation or purchase decisions for physical radio bridging now.**

## Future production architecture (defer)

- GitHub Pages may continue as an experimental static frontend; future employee app requires authenticated backend, central site/channel mapping, audit-friendly admin management and verified per-user media permissions.
- PeerJS Cloud signaling/direct P2P lacks production access control and multi-user reliability guarantees. Evaluate self-hosted signaling, TURN (connectivity relay), and SFU (scalable audio distribution), while explicitly distinguishing these roles.
- Local-only and connected modes should ideally share a common radio protocol and client interface, even if their backend deployments differ.
- Plan site-scoped role-based permissions, shift assignments, rotating codes where justified, monitoring rights, time limits, emergency handling, and backup/failover.
- The user is developing ideas in a personal prototype **not yet building a company-deployed service**.

## Next conversation focus

Return to the live GitHub Pages V6.2 prototype. Continue testing and improving UX, audio reliability, channel behavior, and data usage instrumentation; discuss immediate priorities with the user. Do not start server procurement, authentication migrations or Baofeng gateway code unless user later explicitly resumes those workstreams.
