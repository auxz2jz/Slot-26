# Relay One — Browser Walkie-Talkie (Slot-26)

Two-person, browser-based, **push-to-talk** voice prototype. The single file [index.html](index.html) is ready for GitHub Pages. No build tooling or accounts are needed for this test.

## Published site

Once GitHub Pages is enabled for the `main` branch at `/(root)`, open:
**https://auxz2jz.github.io/Slot-26/**

If you have not yet enabled it: [Settings → Pages](https://github.com/auxz2jz/Slot-26/settings/pages) → **Deploy from a branch** → **main** → **/(root)** → **Save**.

## Recommended two-phone setup (v2)

**On Phone 1 — channel owner**

1. Open the website in Chrome or another supported browser.
2. Tap **Get invite link before connecting**. Do this **before** activating the microphone.
3. Tap **Copy** or **Share** and text that exact invitation to Phone 2.
4. Return to the webpage and tap **Start radio & enable microphone**. Allow the microphone.
5. Leave the webpage foregrounded, with the screen on, for the best results.

**On Phone 2 — invited visitor**

1. Open the link received by text (ideally directly in Chrome, not inside an in-app browser).
2. Enter your name and tap **Join channel & enable microphone**.
3. Allow microphone permissions, then wait until both phones show **Connected**.
4. **Hold to talk, release to listen.** Use the Enable speaker control if the sound does not play.

For a meaningful internet test, put one phone on Wi-Fi and the other on cellular. If testing nearby, use headphones to avoid feedback.

## Connection recovery in v2

- The owner has a reserved channel host ID; each visitor now receives a **fresh temporary ID** when reconnecting. A previous visitor's stale ID no longer falsely claims the second seat.
- The owner allows only **one responsive visitor at a time**. A visitor whose connection has not responded for approximately **12 seconds** is released. An additional real, connected visitor is not displaced.
- Both devices exchange periodic ping/pong messages to detect dead connections.
- The app retries signaling after temporary network trouble or returning to the foreground.
- There is a manual **Reconnect** button if mobile network recovery stalls.
- If a previous *owner* session is still occupying the host ID on the external signaling server, the app retries claiming it. This can take time until the old server session expires.
- Use **Leave** and then **Start radio** to reset microphone permission/session state if necessary.

The owner URL contains `host=1`; the copied visitor invitation does **not**. **Share only the link provided by the Copy/Share buttons**, not the address bar URL from the owner's page.

## Privacy and limitations

- WebRTC transports encrypted audio browser-to-browser; public PeerJS Cloud handles connection signaling and public STUN servers help establish a direct connection.
- This demo has **no authentication**. Anyone with the invitation can attempt to enter a channel, and the owner URL is not a secure credential.
- Some Wi-Fi/cellular combinations require a TURN relay. The prototype does not configure one, so connectivity is not guaranteed on every network.
- Mobile browsers may throttle or suspend pages in the background or with screens locked, interrupting audio and signaling.
- Do not use this as an emergency communications system, or for sensitive workplace traffic. This is a proof-of-concept test, not a production radio network.

## Planned work version

Dedicated authenticated signaling and TURN servers, user login, channel membership/permissions, dispatcher functions, reconnect management, and testing on the actual employee devices.

## Testing status

The JavaScript syntax was checked using Node.js. A two-device event simulation verified that two participants connect, a third cannot enter while the channel is occupied, invitation links can be created before joining, and a returning visitor gets a new ID. **Real phone-to-phone audio/network behavior must still be tested.**
