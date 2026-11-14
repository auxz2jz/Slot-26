# Relay One — Version 5 roadmap

Status: planning / phased implementation. The current published app is the **V4.1 prototype**, with up to six people in one active channel, saved reusable links, device-local callsign/color, PIN-derived channel separation, and optional incoming/transmit squawk preferences.

## Goals selected for future versions

1. **User accounts and callsigns:** Verified login identities, permission roles, editable names, colors, and online status.
2. **Managed channel membership:** Admin chooses exact users per channel; users may be in overlapping channels. Link and PIN alone do not override membership.
3. **Independent channel PTT buttons:** A separate talk control for each assigned channel. No audio, roster, or on-air indicator shared with nonmembers.
4. **Call alerts:** Short beep, long beep, and individual/channel attention signals, with acknowledgment and mute preferences.
5. **Simultaneous monitoring:** Listen to several permitted channels while sending PTT to only the selected channel.
6. **Direct private calls:** One-to-one voice outside group channels, with explicit recipient authorization.
7. **Active speaker / history:** Prominent caller name, per-channel speaker indicators, recent events without automatic voice recording.
8. **Connection resilience and diagnostics:** Recovery through LTE/Wi-Fi handoffs, TURN fallback, reconnection logs and browser limitations.
9. **Priority/emergency signaling:** Clearly labeled, permission-gated alert modes with anti-abuse controls. Not a substitute for emergency communications.
10. **Installable mobile experience:** PWA shortcut, notifications where available, compatible speaker/output controls. Background microphone/audio limitations must be tested per OS/browser.
11. **Optional tone before voice:** Keep V4.1 squawk option; move the tone into a managed media stream if iOS/Android background reliability requires it.
12. **Channel security and privacy:** Server-enforced ACLs, protected presence, least-privilege media routing, TLS, audit policies, PIN change/revoke and rate limiting.

## Architecture path

A browser-only PIN is a provisional shared secret. The dedicated version requires an authentication service, a database for accounts/channel ACLs, an application server for signal and PTT permissions, a TURN relay for restricted networks, and a group media router/SFU for scalability. Do not claim that V4.1 PIN protection provides verified user identity or server-enforced authorization.

## Non-negotiable privacy behavior

A member of Channel A **must not** be told that Channel B is active unless they are explicitly authorized for B. Channel B's audio, active speaker, roster, status notifications, and call tones remain limited to B's authorized membership. A person who belongs to A and B may monitor both as permitted but sees each channel's activity separately.

## Testing

Preserve [the working V4 group radio](../legacy-v4.html) and [V3 two-user backup](../legacy-v3.html) while developing. Run device tests on Chrome Android, Pixel LTE, and iPhone Safari. Validate wrong PIN, unauthorized membership, revoked users, backgrounded devices, simultaneous channels, overlapping memberships, and channel-only alert delivery.
