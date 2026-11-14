# Relay One — Browser Walkie-Talkie

A simple **two-person push-to-talk web app** for testing between phones, tablets, and desktop browsers. This repository is the **Slot-26 prototype**, not the future authenticated work radio.

## Try it on two devices

The complete app is in **[index.html](index.html)**. No build tooling or hosting server is required for the static page; GitHub Pages can serve it over HTTPS.

### Publish using GitHub Pages

1. Open [this repository's Pages settings](https://github.com/auxz2jz/Slot-26/settings/pages).
2. Under **Build and deployment**, set **Source: Deploy from a branch**.
3. Choose **main**, then **/(root)** and click **Save**.
4. After GitHub reports a successful Pages deployment, open **https://auxz2jz.github.io/Slot-26/**. The URL does not work until Pages is activated.

### Connect

1. On device A, open the published page, enter a display name, and tap **Create channel & enable microphone**.
2. Allow microphone access, then tap **Copy** to share the private invitation link.
3. On device B, open that *exact* link in a supported browser. Enter a name and tap **Join channel & enable microphone**.
4. After both show **Connected**, press and **hold** the big microphone button to speak, and release to listen.
5. If the receiving device is silent, tap **Enable speaker**, and check volume/audio output.

For a realistic test, put one phone on Wi-Fi and another on cellular. Keep the browsers foregrounded and screens awake. If testing nearby, use headphones to avoid feedback.

## How it works

- WebRTC sends **encrypted peer-to-peer audio** between browsers.
- The external, free **PeerJS Cloud** service is used for connection signaling, and public STUN servers assist with NAT traversal.
- Only **one other participant** can join a given randomly generated invitation room.
- Local microphone tracks start muted and are enabled only while you hold push-to-talk.
- There is no database, account requirement, audio recording, or paid server for this prototype.

## Important limitations

- This is **not** an emergency radio or a security-grade work communication system.
- The room URL is a **bearer invitation**: anyone who has it may try joining. Do not share sensitive workplace details.
- PeerJS Cloud is third-party infrastructure and has no service guarantee.
- Without a TURN relay, some cellular/corporate network combinations may fail. A dedicated work version needs TURN and authenticated signaling.
- Mobile browsers may interrupt audio when the screen locks, the tab is backgrounded, or the OS reclaims the microphone.
- The prototype doesn't provide server-enforced channel arbitration, dispatcher features, or user accounts.

## Next stage

Once both devices work, we can extend Slot-26 with user authentication, persistent channels, dispatcher administration, a dedicated WebRTC signaling/TURN server, better reconnection, and communication auditing, with proper privacy controls.

**Source note:** This repository uses a complete standalone `index.html` containing the HTML, CSS, and JavaScript. It loads PeerJS version 1.5.5 from a CDN. The optional local-development files and test utilities are available in the source archive from the original project draft.
