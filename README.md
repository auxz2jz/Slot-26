# Relay One — Handheld Radio and Visual Scan (Version 6.4)

**Main website:** https://auxz2jz.github.io/Slot-26/

This is a browser-based push-to-talk prototype for a shared set of **ten fixed channels**. Every user sees the exact same channels. No individual invitation, channel creation, or channel distribution is required.

## V6.4 — Handheld radio interface and visual scan

The live GitHub Pages prototype now opens to a phone-friendly, handheld-style radio face:

- **Center LCD** shows the channel number/title (site name when separately configured), joined status, people, and on-air user. **CH − / CH +** and horizontal screen swipes let users browse allowed channels.
- **Large side PTT** defaults to the right and can be switched to the left. The choice persists on this browser. The PTT target always has an explicit channel number.
- **Join/Leave**, **Monitor**, and **Call** buttons act on the channel displayed in manual mode. The existing Basic (01–02) / Advanced (01–10) mode switch remains available on the main radio screen.
- **Scan** is a **visual-only simulation**: it cycles the LCD through *joined, monitored* channels without leaving or rejoining them, muting channels, or renegotiating media. All those monitored WebRTC audio sessions stay connected and audible, as before.
- On **incoming PTT activity on any joined, monitored channel**, the LCD immediately presents the active channel; the PTT target intentionally switches to it so the operator can reply. The display holds briefly after transmission stops and then resumes its visual scan. Unjoined and unmonitored channels do not trigger this.
- **Safety rule:** During the idle scan animation, the display may preview a different channel, but the physical **PTT target remains fixed and explicitly labeled**. PTT transmission cannot be silently redirected by the visual sweep. Join/Leave, Monitor and Call buttons are disabled while scanning to avoid actions on an animated preview; pressing channel navigation exits Scan and resumes manual selection.
- Profiles, diagnostics, usage estimates, full channel manager and the Compact/Detailed list controls are still available below the main radio, with profile and channel manager collapsed by default.
- **Existing microphone and PeerJS/WebRTC behavior is unchanged:** joined channels still acquire a microphone track but keep it disabled until PTT. This release does **not** add a mic-on-demand feature or promise mobile background-audio reliability.
- The prototype has not been changed into a production authenticated employee radio system. Browser PINs are still nonsecure demos.

**Rollback:** https://auxz2jz.github.io/Slot-26/legacy-v6-3.html

## V6.3 — Basic and Advanced radio modes (GitHub Pages prototype)

Relay One now has an in-page **Radio Mode** switch above the existing Compact/Detailed channel layout controls:

- **Basic (default):** only Channels **01–02** appear and may be joined, up to **two simultaneous joined channels**.
- **Advanced:** all **ten existing shared channels** appear; up to **five simultaneous joined channels**; Channels 06–10 retain their existing demonstration PIN check.
- **Mode selection is saved locally** in the browser and can differ between devices. The same underlying channels, room IDs, and voice links are used in both modes: a Basic user on Channel 01 can communicate with an Advanced user on Channel 01.
- **Switching from Advanced to Basic** actively disconnects any joined Channels 03–10 and clears their selected-for-restore state; this prevents hidden listening/transmission. Channels 01–02 remain connected. Switching back to Advanced makes all channels available again, but does not automatically rejoin the channels that were disconnected.
- Compact/Detailed mode is an independent display-density preference and is still available in either radio mode.
- The setting is **not employee authentication or access control**. Both radio modes are user-selectable on the public prototype, and server-enforced site permissions would be required for any eventual employee deployment.

**Version 6.2 backup:** https://auxz2jz.github.io/Slot-26/legacy-v6-2.html

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

## V6.1: Pixel / Samsung multi-channel reliability update

This patch responds to a real-device report: Pixel 8 Pro on Wi-Fi can communicate with Samsung Galaxy S22 Ultra in one channel, but voice becomes unstable when both phones simultaneously join a second channel.

- **Staggered media negotiation:** across every active channel on one device, outgoing WebRTC audio connections are started sequentially with a short settling delay. This reduces simultaneous ICE/DTLS negotiation pressure on mobile browsers.
- **Connection diagnostics:** expand **Connection diagnostics** at the bottom of the radio page. It records timestamps, channel number, signaling open/close, WebRTC stream availability, ICE state changes, reconnection attempts, microphone PTT start/stop, and browser online/offline changes. Tap **Copy diagnostic log** to share the report for investigation, or **Clear log**.
- The log is in memory only and is not uploaded. It does not intentionally include PINs, user names, room identifiers, voice, or recorded audio. Do not paste private browser/device information from elsewhere into the log.
- The network information API may supply a rough connection type in some browsers but **cannot reliably reveal cellular signal bars, Verizon's data limit, or Android modem connectivity**.
- **Audio state:** a channel shows **Linking audio** when signaling has connected but some expected voice streams have not. Its details show the number of voice streams ready. “Connected” with multiple participants now means corresponding media streams were received.
- **Recovery:** failed or timed-out media calls pause before retrying with backoff; transient ICE `disconnected` states are observed and not immediately torn down. Signaling reconnect attempts are throttled to reduce reconnect loops.

### Reproduce and collect diagnostics

1. Reload the updated webpage on **both** devices. Leave any leftover active radio channels or close old tabs.
2. Put Pixel 8 Pro on stable Wi-Fi and keep the Samsung on its chosen connection.
3. Join **Channel 01** on the Pixel and then Samsung; verify both indicate voice links **1/1 ready**. Hold Talk in both directions.
4. Join **Channel 02** on the Pixel and wait for its signaling. Join Channel 02 on Samsung. Wait for both channels to show **1/1 ready** before trying PTT again.
5. If either becomes stuck in **Linking audio**, shows ICE `failed`/`disconnected`, or displays **BROWSER OFFLINE**, open **Connection diagnostics** on each phone and use **Copy diagnostic log**.
6. Keep notes on exactly which phone lost audio and whether its Android 5G/LTE icon or Wi-Fi indicator also disappeared. The in-page browser status is not a substitute for Android's modem indicators.

Automated tests validate logic and simulated PeerJS links, **not** physical 5G/LTE handoffs, real mobile audio hardware, or five-channel reliability. TURN/SFU and a backend remain longer-term priorities.

## V6.2 — Radio data usage and compact channel layout

### Data usage meter

The **Estimated radio data** card at the top of the main dashboard displays:

- **This session:** estimated radio bytes sent and received since the webpage loaded.
- **Saved on this device:** estimated WebRTC traffic accumulated across visits in this browser (localStorage). Use **Reset saved** to start the stored meter over without clearing the current session.
- **Current rate:** approximate recent combined incoming/outgoing media throughput in kilobits per second (kbps), sampled every four seconds while the page runs.

Measurements use `RTCPeerConnection.getStats()` reports for audio `inbound-rtp` / `outbound-rtp` and WebRTC data channels when exposed by the browser. It counts deltas on each distinct peer connection, so successive polls do not repeatedly count the same media. Counters are stored on the current device's browser only, not uploaded or synchronized to other devices.

**These are estimates, not the data Verizon charges you for.** Measurements can omit PeerJS's WebSocket signaling, STUN/ICE/DTLS/SRTP, UDP/IP or retransmission overhead, unreported data-channel traffic, connection packets between samples, initial app downloads, and all other phone data. A web app generally cannot know whether specific WebRTC traffic traveled over cellular or Wi-Fi, and a backgrounded mobile browser may throttle the four-second sampling loop. Check your carrier app for actual data allowances and billed traffic.

### Compact / Detailed layouts

Under **Choose your channels**, select **Compact** for short, vertically stacked radio rows or **Detailed** to return to the expanded cards. Compact keeps Join checkbox, current speaker/channel activity, Focus, Hold Talk, Call, and Monitor sound available; it hides the extended participant list and status paragraphs until Detailed is selected. Your preference is saved in this browser. Both layouts use the same underlying channels and voice connections.

### Site group design proposal (not deployed yet)

For actual site work, we recommend maintaining the fixed radio channel numbers behind the scenes, but giving each channel a **shared, administrator-assigned site label** such as Government Center, Fairgrounds, or Course. The numbers remain useful as radio-style identifiers and for debugging, while the site name tells staff where transmissions go.

A practical design is to reserve several channels for General / Dispatch / All Patrol and dedicate the remaining channels to specific sites. Staff join the site channels they are assigned to; authorized supervisors may monitor several sites simultaneously. PINs can be rotated per shift if there is an authenticated backend and an administrative console to distribute/authorize changes. **The current public static webpage cannot securely rotate PINs or enforce permissions**, and the public four-digit PIN verifiers remain bypassable. Don't change the preset PINs in published code for real confidential work; use verified accounts and server-side channel permissions for that phase.

The site-name idea is recorded in `docs/SITE_CHANNELS.md`; this version leaves all ten shared channel names intact until the site plan is selected and tested.

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
