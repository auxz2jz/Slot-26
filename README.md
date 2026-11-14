# Relay One — Ten-Channel Shared Radio (Version 6 Concept)

**Main website:** https://auxz2jz.github.io/Slot-26/

This is a browser-based push-to-talk prototype for a shared set of **ten fixed channels**. Every user sees the exact same channels. No individual invitation, channel creation, or channel distribution is required.

## Radio channel plan

| Channel | Access | How users join |
|---|---|---|
| 01–05 | Open prototype channels | Check the channel selector |
| 06–10 | PIN-protected prototype channels | Check selector and enter a preset 4-digit PIN |

Up to **five selected channels** can remain connected concurrently on a device. Each channel supports up to six participants with the current browser-to-browser WebRTC mesh. One person can join channels 01, 02 and 07, another can join 02 and 07, and each can listen to only the channels they joined. Push-to-talk and call alerts operate per channel.

## Instructions for regular users

1. Open the main website in a supported browser (Chrome on Android or Safari on iPhone).
2. Enter a name/callsign and optionally choose a display color.
3. In the **Choose your channels** section, **check** one to five channels to join.
4. To join channels 06–10, enter the assigned PIN when requested. The client checks the PIN and **rejects incorrect entries before opening any channel session**.
5. Use **Monitor sound** only on channels you have joined to choose what you hear.
6. **Hold Talk** beside one channel to transmit only there. Keep other channels connected. **Call** sends an optional attention tone only on the selected channel.
7. **Focus** selects a joined channel for the large top push-to-talk button.
8. The browser remembers selected channels. On a later visit, press **Restore selected** to reconnect them; protected rooms ask for a PIN if the page was reloaded.
9. Uncheck a channel to leave it without affecting the others.

### Privacy behavior

- Channels are separate WebRTC groups: speakers, participant names, call alerts and audio are shared only with active members of that channel.
- A device that has not joined a channel does not display its current speaker, members or channel activity.
- **Monitor sound** is disabled until the user joins the corresponding channel. **Monitor joined** and **Mute joined** affect only rooms the device actually joined.
- When transmitting into one room, other monitored rooms are temporarily silenced on the transmitting device to reduce unintended acoustic feedback.
- PINs are never included in a URL or permanently saved in browser localStorage.

## Administration design: planned, not yet deployed

The eventual office/patrol administrator account will be able to assign users to channels, set and revoke PINs, rename channels, manage access rules, and monitor authorized channels. Regular users will be able to select only channels for which their account has permission and will not have PIN-management or all-channel administrative monitoring controls.

**Version 6 deliberately does not implement login, administrator identity, server-side permissions, or PIN modification by end users.** All ten channel identifiers and PIN check material are publicly distributed to browsers because this is a static GitHub Pages application.

### Critical security limitation

The V6 PIN check is only a **client-side concept demonstration**. The four-digit PIN verifiers in the public application can be guessed or bypassed by a determined user; a four-digit PIN has only 10,000 possibilities. Peer-to-peer WebRTC encrypts media in transit, but without a server to verify identities, regulate login attempts, and grant channel membership, it cannot enforce organizational privacy. Do not send confidential or operational security traffic through this prototype.

The five preset demo PINs are kept out of this public README. The person running the demo should distribute them privately to test participants. To change any preset PIN or channel configuration presently requires updating and redeploying the application; a true administrator console is a separate server-backed phase.

## Background and connection reliability

This system uses PeerJS Cloud signaling, Google STUN, and direct peer-to-peer media. LTE and corporate NAT restrictions can stop direct calls without a TURN server. Mobile browsers (especially iPhone) may suspend signaling or microphone permissions in the background. A dedicated service with TURN, server-enforced membership and an SFU/media router is required for a reliable workplace radio.

## Earlier versions

- [Version 5 — self-created channels and multi-group push-to-talk](legacy-v5.html)
- [Version 4.1 — one joined group with PIN and squawk](legacy-v4-1.html)
- [Version 4 — original group proof of concept](legacy-v4.html)
- [Version 3 — two-person prototype](legacy-v3.html)

## Tests

GitHub Actions runs syntax checks and `node --test tests/*.test.mjs`. The tests validate ten identical fixed channels, the five protected selectors, PIN rejection, and independent group microphone tracks. This is mocked signaling/audio testing only, not a verified multi-phone field test.

Future architectural priorities are documented in [V5 roadmap](docs/V5_ROADMAP.md).
