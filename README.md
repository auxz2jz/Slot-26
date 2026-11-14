# Relay One — two-device web walkie-talkie

A browser-based, **two-person, half-duplex push-to-talk prototype** that runs as a static site. No login, build tooling, database, or paid server is required for a first test. The site uses **WebRTC for encrypted audio**, the free public **PeerJS Cloud** for connection signaling, and STUN for typical NAT traversal. The free cloud is a prototype dependency, not an uptime guarantee.

## How to test on two devices (GitHub Pages)

1. The `index.html` file in this repository is the complete standalone web app.
2. Open the repository's **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, `main`, `/(root)` and **Save**.
4. Visit **`https://auxz2jz.github.io/Slot-26/`** once GitHub reports that Pages is published.
5. On device 1, enter a name and tap **Create channel & enable microphone**. Grant microphone permission. Tap **Copy**, then message the invitation link to device 2.
6. On device 2, open the invitation in Chrome or Safari and tap **Join channel & enable microphone**. Grant microphone permission.
7. When both show **Connected**, **hold** the large button to talk; **release** to listen. If you can't hear anything, tap **Enable speaker**.
8. Test one phone on cellular data and the other on Wi-Fi. Keep both screens awake and use headphones if the devices are near each other.

GitHub Pages is **HTTPS**, which is required for microphone access. Opening `index.html` locally as a file is not a supported two-device test; likewise plain HTTP on another device's LAN IP usually cannot access the microphone.

## What it does

- Two devices per private invitation, with 128-bit randomly generated room tokens.
- Hold-to-talk / release-to-listen, with local microphone muted by default.
- Encrypted WebRTC browser-to-browser audio.
- Connection/waiting/receiving/transmitting statuses.
- Simple display names, copyable invitation URL, speaker-enabling button, disconnect and retry.
- Automatically tries to reconnect the second device after a dropped first-device connection.
- Supports phone browsers or desktop Chrome/Safari/Edge/Firefox with internet access.
- Optional self-hosted signaling server skeleton in [`server/`](server/README.md).

## Limitations and security

- **Prototype only:** No accounts, no login, no dispatcher, no multi-user channels, no admin controls, no emergency communication guarantee, and no recorded audio.
- Room links are private *by secrecy*, not by accounts. Anyone with an invitation link can attempt to join. Do not use for sensitive workplace traffic.
- PeerJS Cloud is a third-party signaling service. Audio is encrypted in WebRTC; TURN relay would carry encrypted media if deployed later.
- This version has no TURN relay. Some restrictive corporate/cellular networks will fail to connect despite both users being online. Add a real TURN service when deploying to your dedicated server.
- Phone OS/browser backgrounding, screen locking, power saving, or other apps taking the microphone can interrupt calls. This is not a native always-on radio.
- One client is role A and the other is role B. Extremely simultaneous claims/presses may cause a brief overlap; this is not a server-controlled radio floor.
- The example optional PeerServer has no authentication and should not be exposed as a production service without security controls.

## Troubleshooting

- **Microphone button fails:** Open the site using `https://`, check permissions and reload. Try Chrome/Safari rather than an in-app browser.
- **Second user cannot join / room full:** First user may have another tab or browser still connected. Close old tabs or create a new channel.
- **Waiting forever:** Check both devices have internet; try Wi-Fi or cellular, and open the invite URL precisely. Restricted NATs may require TURN (not included).
- **Connected but silent:** Tap **Enable speaker**, check volume/Bluetooth route, talk on one device at a time and release the button after speaking.
- **Call stops when phone locks:** Leave the browser foregrounded and keep the screen awake.
- **Need a different signaling server:** Update `config.js` peerServer options and set up the optional `server/` service behind TLS.

## Developer testing

No build step is needed for GitHub Pages. `standalone/index.html` is a ready-to-upload, self-contained edition of the app (except the pinned PeerJS CDN dependency). Local development on the **same machine** can use `python -m http.server 8080` then `http://localhost:8080/`; for other devices use the hosted HTTPS site.

Pure utility tests (Node.js 20+):

```bash
node --test tests/*.test.mjs
```

All project source code is yours to modify. PeerJS is an open-source dependency loaded from a pinned CDN URL.