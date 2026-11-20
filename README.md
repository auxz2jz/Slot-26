# Relay One — Incoming radio and reachability diagnostics (V6.17)

**Main website:** https://auxz2jz.github.io/Slot-26/

## V6.17 — Receive-side disconnect investigation

Automatic incoming-control timeline records requests at the coordinator, floor updates and transitions at receivers, joins, stream arrival, audio track mute/unmute/end, playback readiness, data/voice closures, heartbeat timeouts, approximate heartbeat RTT and recent activity. Temporary radio labels correlate data and voice links locally only. No new radio protocol messages, audio content, callsigns or raw IDs in this new timeline. An optional five-second same-site HTTPS reachability check (off by default) or manual check helps distinguish website reachability from PeerJS/ICE failures. Requests use small uncached text resource, a 3.5-second timeout and no credentials. Success tests this site only; failure is not proof of cellular loss. All reports remain global. Preserve V6.16 at https://auxz2jz.github.io/Slot-26/legacy-v6-16.html.

## V6.16 — Cellular and multi-peer investigation

Global diagnostics now includes UA client hints (model/OS/browser where exposed), operator-entered phone/carrier/radio/signal, network-estimate changes, UTC markers, signaling/ICE/PC/gathering state, selected candidate types and protocol, RTT, inbound interval loss, jitter, remote RTT/loss when available, candidate-pair throughput and data-channel states. Peer links receive temporary per-page labels only. The existing usage-meter four-second getStats cycle is reused; no traffic probes or transport changes. Up to 90 snapshots and 180 network events retained in RAM. No raw stats report, address, port, SDP, URLs, peer IDs or audio exported by the new diagnostics. All existing diagnostic copy buttons return the full report; Save report (.txt) is available for email attachment. Chrome cannot reliably report actual LTE/5G, carrier or signal strength; enter the optional details manually. Use test-start and problem markers on each device. Prior V6.15 backup: https://auxz2jz.github.io/Slot-26/legacy-v6-15.html.


This is a browser-based push-to-talk prototype for a shared set of **ten fixed channels**. Every user sees the exact same channels. No individual invitation, channel creation, or channel distribution is required.

## V6.15 — Finished controls above development divider

Three top-level buttons activate or disable on-device speech-to-text, enable or disable headset PTT (detects and safely verifies an unbound button first), and toggle physical microphone release between transmissions. Speech activation uses the same Whisper loader and browser cache, reusing the active model if already loaded; the main control says Activating rather than Downloading. Original advanced model, microphone and headset controls, all tests, data meter, global diagnostics and rollback links remain below the prominent testing divider. The live radio, conversation, profile and channel manager stay above it. No changes to transmit-ready tone generation, media transport or microphone acquisition behavior. Quick control states and actions are included in global diagnostics.

## V6.14 — Global diagnostics and local transmit-ready sound

All diagnostic copy controls export the same report, including channel and WebRTC status, microphone mode and timings, headset events, scan and speech-to-text, byte estimates, and tone requests, scheduling, oscillator completion, and failures. The ready cue is independently enabled for both microphone modes and plays only after authorized local TX begins. A standalone test requests the sound without joining or opening the microphone. If Web Audio is suspended, the cue waits for resume instead of silently returning; a late cue is discarded if the transmission has ended. Android/Chrome controls physical audio routing; even oscillator completion is not proof of audible headset output.

**Development rule:** every new or changed feature must add its safe settings/state, relevant events, errors and timings to the global diagnostics where applicable. Do not log PINs, peer/device IDs, conversation text or recorded audio. All feature-specific copy controls must export global diagnostics.

## V6.13 — Restore optional microphone-off mode with distinct live indicators

The proven V6.12 headset detection remains independent of microphone activation. Default is original always-ready audio, using a NEW microphone-mode storage key so older experimental settings cannot silently switch it on. Enable “Turn microphone off between transmissions” to use the previous silent Web Audio standby method and acquire the mic only when transmitting; mode changes rejoin channels. PTT only may have device startup delay; wait for red TRANSMITTING. Optional ready beep and timing diagnostics are restored. On-screen indicators distinguish green connected, blue microphone ready/muted, gray off, amber starting/waiting and red transmitting. The headset toggle works with either mic mode; external button identification is retained from V6.12. The Android system microphone privacy indicator is controlled by the OS, not Relay One. Actual remote reception and handset audio routing still need device testing.

Rollback: https://auxz2jz.github.io/Slot-26/legacy-v6-12.html

## V6.12 — Controlled rollback to original V6.7 microphone

The active radio is rebuilt from the saved V6.7 index, script and stylesheet rather than the V6.8–6.11 microphone activation work. No PTT-only microphone switch, silent Web Audio placeholder, microphone start-up delay settings, or ready-cue changes remain in the active version. The microphone is acquired at join and stays open, muted when idle; the original shared-track Whisper code remains. The sole added feature is external headset button detection/control with a simple enable checkbox.

Hold the physical button for one second, release, and enable the detected binding. A short pulse (including the observed 145 ms MediaPlayPause) maps to press-on/press-off automatically; a genuine held keyboard event maps to hold/release. Detection never transmits. External controls call the original startPTT/releaseTalk path, with a fixed 30-second safety timeout, touchscreen stop, and loss-of-focus release. Actual headset compatibility still needs testing; rollback does not make Android expose the physical hold duration. Audio routing remains Android/Chrome's responsibility.

Previous V6.11 preserved: https://auxz2jz.github.io/Slot-26/legacy-v6-11.html
Pure V6.7: https://auxz2jz.github.io/Slot-26/legacy-v6-7.html

## V6.11 — External headset press-to-toggle mode (archived)

Some Android USB-C PTT headsets present only a standardized MediaPlayPause pulse (observed 144–145 ms regardless of the physical hold duration). Select **Press to toggle** in External USB-C / headset PTT, run Detect button and save the matching pulse, then enable external PTT. The next pulse starts transmission and its keyup does not stop it; a second press stops transmission. Hold mode still requires a verified 250 ms or longer press/release pair. Changing modes clears the old binding to prevent a pulse accidentally becoming a hold binding.

Both microphone modes and existing local Whisper use the same radio path. Always-ready is recommended for fast start; PTT-only still incurs Android microphone startup. Toggle mode defaults to a 30-second limit (15/30/45 seconds selectable); lose-focus/page-hidden, touchscreen Talk or STOP EXTERNAL TRANSMISSION, disabling the feature, or the next key pulse all stop it. A short high ready cue when voice is enabled and a low stop cue are optional and use Android's current audio output route. Hardware testing is required; no claim of actual physical hold detection, screen-off routing, or earbud routing. Rollback: https://auxz2jz.github.io/Slot-26/legacy-v6-10.html

## V6.10 — External USB-C / headset PTT (browser compatibility test)

Connect the headset and expand **External USB-C / headset PTT**. **Detect button** listens for browser keyboard/HID-style press AND release events for 20 seconds without transmitting. Hold the button for one second during detection. Matching events less than 250 ms apart are rejected as possibly synthetic media taps. Once a real hold is verified, save the binding and explicitly enable it. The selected channel's usual PTT, microphone mode and Whisper paths are used. Repeat events, editable fields, and unrelated pointer releases are handled; losing focus, hiding the page, or a 45-second maximum hold releases Talk. A fresh release is required after a watchdog stop.

Android may consume headset media/volume commands without exposing them to Chrome. A one-shot media action is insufficient for hold-to-talk. There is no claim of native USB access or screen-off operation. **Check audio devices** lists endpoints exposed by Chrome without additional microphone permission; the OS/browser chooses the actual route. Hardware diagnostics omit audio, transcripts, device IDs and PINs; headset support still requires a physical-device test.

Rollback: https://auxz2jz.github.io/Slot-26/legacy-v6-9.html

## V6.9 — PTT-only microphone readiness and measured activation (experimental)

Android Chrome requires time to open a microphone that has been completely closed. Early speech spoken immediately after pressing Talk cannot be retroactively captured; a short transmission may be partially silent even though the Whisper model works. A Samsung report showed that the spoken count “one two three four” could be captured only as “three four” in PTT-only mode, while always-ready mode worked normally.

V6.9 improves usability and diagnostics while keeping both microphone modes intact:
- In **PTT-only mode**, the Talk button now displays **MIC STARTING…** until the microphone is actually acquired, and **TRANSMITTING** only after both the radio floor and outgoing track are enabled.
- An optional **Play a short beep when PTT-only microphone is ready** checkbox (on by default) plays a brief quiet local ready tone after the outgoing radio track is enabled. Turn this off for silent operation. Wait for the tone or the displayed **TRANSMITTING** state before beginning a transmission.
- **Speech diagnostics** now include measured elapsed milliseconds from Talk press to microphone acquisition and from Talk press to transmit-ready, plus the count of quick releases before readiness, and timestamped `PTT MIC PRESS`, `PTT MIC ACQUIRED`, and `PTT TRANSMIT READY` events. These diagnostics contain no spoken words.
- These changes do not claim to remove Android’s cold microphone activation delay. If immediate speech onset is essential, **leave PTT-only unchecked** to use the fast always-ready mode.
- Always-ready mode, WebRTC audio, Whisper model choices, and the mic-off behavior when idle are otherwise unchanged. The new controls and lifecycle events have automated tests; timing and audio cues still need verification on actual phones.
- Rollback: https://auxz2jz.github.io/Slot-26/legacy-v6-8.html

## V6.8 — Opt-in PTT-only microphone activation

By default, Relay One retains its original fastest-PTT behavior: when a user joins a channel, Chrome acquires the microphone and keeps its track open but **disabled/muted** until Talk is pressed. This remains the default if the new checkbox is not checked.

A new setting under the handheld radio controls, **Turn microphone off until PTT is pressed**, lets operators choose stronger idle microphone privacy:
- **Unchecked — always ready:** on join the actual microphone stays open; audio transmits only on authorized PTT. This has lower talk-start latency.
- **Checked — PTT only:** channel joins create a silent Web Audio placeholder track to maintain the existing PeerJS audio calls **without requesting microphone access**. On Talk press, `getUserMedia` is requested (may show browser permission prompt), the microphone is routed into the already-connected audio stream after floor authorization, and on release the mic input is disconnected and all physical microphone tracks are stopped. A slow/late permission response is cancelled when the button was already released. Receiving/monitoring remains connected while the microphone is off.
- Changing the setting while channels are joined briefly disconnects/rejoins the selected channels, since their outgoing track type changes. Per-PTT calls do **not** renegotiate the network stream.
- The checkbox is saved on this browser. Mode switches during PTT or another join are declined until idle, with a visible notification.
- The existing on-device Whisper path records the channel's outgoing stream **only during authorized PTT**, including when using the new mic activation mode; captions are still processed after releasing Talk.
- Real device microphone activation is not instantaneous. First words can be cut off if spoken before audio activation finishes. Keep Talk pressed, wait for TRANSMITTING on screen, then speak, or leave the box **unchecked** for time-critical radio uses.
- Speech and connection diagnostics include the microphone mode and whether the physical mic is currently open. In PTT-only mode, an active *silent outgoing WebRTC track* is not an active microphone capture.
- Web Audio / browser background execution can vary by platform. If PTT-only mode fails to activate on a specific phone, uncheck it and verify the original always-ready PTT works.
- **Backup:** https://auxz2jz.github.io/Slot-26/legacy-v6-7.html

## V6.7 — Optional shared-microphone, on-device speech-to-text (experimental)

**Motivation:** Android Chrome could recognize speech in the isolated browser test with no radio channel joined, but not while Relay One's WebRTC channel microphone was open. Chrome for Android does not currently support passing an existing audio track to the built-in SpeechRecognition API. V6.7 adds an alternative that shares the radio microphone and performs local inference instead of trying to open a second microphone.

**What changed:**
- The default for new users is now **On-device Whisper** (English, `onnx-community/whisper-tiny.en`, via pinned Transformers.js 3.7.6). The old **Browser recognition — legacy** mode remains selectable for regression testing.
- Enable **Transcribe my PTT speech**, choose **On-device Whisper**, and explicitly tap **Download / load on-device speech model**. The model and runtime may download tens of megabytes; downloads are **never** started automatically merely by joining or enabling captions. Models can be cached by the browser.
- Once the model reports **ready**, join a radio channel and hold PTT. Live WebRTC voice uses the same pre-existing connection and microphone track as before.
- When the **transmit floor is granted**, the app clones that same microphone track for a temporary MediaRecorder capture. No additional `getUserMedia` request is made. On PTT release the capture stops, is decoded to 16 kHz PCM in memory and sent to a dedicated module Web Worker for Whisper inference. Processing can take seconds or longer. The result is sent over existing channel PeerJS data connections just like prior captions and retains callsign/channel/sent/received labels.
- Long messages are split into up to three 24-second tasks (max 72 s processed). No audio blobs are stored or uploaded. Only transcript text is optionally saved on the device if **Keep transcript** is enabled.
- Speech diagnostics report on-device model load, recording start, byte count, decoded audio level, queue and inference results; failures are visible rather than silently producing an empty text window. The old **Test browser speech (legacy)** is still available to diagnose the separate microphone API; it does not test on-device Whisper.
- This is an **experimental client-side speech model**, not a guarantee of success on Android: a one-time model download, CPU/RAM cost, and mobile browser decoding/worker limitations may prevent it from working or affect other tasks under load. If it fails, turn the caption switch off; existing PTT is unaffected by disabling transcription. We have automated JavaScript and simulated audio tests, but no physical Android microphone/model test has yet been performed. Test initially while stationary and not relying on the system for urgent communications.
- Model assets are downloaded from Hugging Face and the Transformers.js runtime from jsDelivr. Spoken audio for **on-device mode** is not uploaded to either; the **legacy mode** may use a browser provider's cloud speech service.
- **Rollback:** https://auxz2jz.github.io/Slot-26/legacy-v6-6.html

## V6.6 — Speech recognition diagnostics and isolated device test

An initial single-phone test showed a radio session could join and PTT could start/stop, yet no caption appeared. Previously the general connection log did not distinguish speech-recognition API support, engine-start, microphone-audio events, voice floor status, final/interim recognition, or recognizer errors. Error messages could also disappear when a recognizer stopped.

**New troubleshooting tools:**
- Expand **Radio conversation → Speech-to-text diagnostics**.
- Read **API available/unavailable**, attempt/start/audio/speech/final/error counts, last state and last error.
- **Test speech recognition** starts a **local-only** test independently of PTT and even with zero radios joined. Say a short phrase; tap again to stop. Recognized words appear only in the test preview: no radio transmission, no message in conversation history, no transcript sent to peers.
- **Copy speech diagnostics** exports browser API presence, user setting, voice/recognizer state, counters, error codes and timestamped recognition lifecycle events. **No transcripts, callsigns, room IDs, PINs, voice or actual speech text are included.** Existing **Copy diagnostic log** also appends the speech diagnostic report.
- When PTT is held with transcription enabled, the log tracks recognition request, `start`, audio-start, speech-start, interim/final results, errors, stop, and whether the actual radio voice floor activated.
- Error messages persist after recognition ends. An unsupported API or no detected speech is distinguished from a successful transcript.
- PTT audio, channel/scan logic, and voice negotiation are unchanged. Transcription remains optional; it is not guaranteed by browser/API support alone.

**Suggested single-device test:** Join Channel 01, enable **Transcribe my PTT speech**, hold Talk and speak for a few seconds, release, then expand **Speech-to-text diagnostics** and copy the output. If recognition doesn't start, tap **Test speech recognition** and speak to determine whether the browser speech API works at all on that phone.

**Rollback:** https://auxz2jz.github.io/Slot-26/legacy-v6-5.html

## V6.5 — Experimental per-channel speech-to-text conversation panel

The existing fast PeerJS/WebRTC PTT audio path is **unchanged**. An optional and independent text path sends **final recognized words** over existing room PeerJS data connections; no extra media negotiation, audio buffering, central server, transcription API key, or modified PTT codec is required.

- New **Radio conversation** panel on the main screen, directly beneath the handheld radio. It is vertically scrollable and shows each utterance, channel name, local timestamp, and speaker's callsign. A **non-modal floating text popup** can also display recent messages automatically; tap **Text** near the radio's top controls to open it or **Hide** to minimize. The **Pop up new messages** toggle defaults to on and is saved per browser. When caption text finishes during held PTT, the popup waits until Talk is released rather than obscuring controls.
- **Transcribe my PTT speech** is **off by default**. On supported browsers, the transmitting user can opt in, and the browser SpeechRecognition API starts during PTT. It stops at release and final transcript chunks can arrive after release. Voice keeps working if caption recognition fails.
- Local screen: `You · Patrol 1`, **SENT**; listener screen: `Patrol 1`, **RECEIVED**. The receiver does **not** need speech recognition enabled to see captions that the sender successfully generated.
- Incoming captions are accepted only from members of a joined, monitored channel. A muted/unjoined channel cannot populate the local log. Text is displayed with `textContent`, not parsed as HTML.
- Incoming transcript data is kept in the browser's current page session by default (up to the latest **120 messages**). The **Keep transcript on this device** switch is separately opt-in and persists its own copy in localStorage. **Clear conversation** deletes the current log and its local saved copy; **Copy transcript** provides a text export.
- Browser **SpeechRecognition** / **webkitSpeechRecognition** support is inconsistent across Android, iPhone, and desktop browsers. Some browser implementations use an external online speech service, which may send speech audio to the browser provider. Some phones may be unable to recognize while a WebRTC mic is in use. The live voice radio should remain available even when speech text does not work. Test both the Samsung S22 Ultra and Pixel 8 Pro, along with iPhone, individually; this feature is a best-effort prototype rather than guaranteed production transcription.
- Recognition is imperfect (especially with noise, names and radio jargon), so transcripts must not be treated as verified official incident logs. The app does not store or retransmit voice recordings for transcription.
- Captions are only sent to peers currently connected on that channel, not to a central transcript database. No message history is synchronized with late joiners. Local browser storage is not encrypted separately beyond the browser's storage controls and may not be suitable for confidential work communications.
- Existing Basic/Advanced, Scan, monitoring, left/right PTT and per-channel floor control are unchanged.

**Rollback:** https://auxz2jz.github.io/Slot-26/legacy-v6-4.html

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
