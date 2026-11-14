# Relay One — Group Web Walkie-Talkie (Slot-26)

**Version 4:** A lightweight browser walkie-talkie that supports **up to 6 people in one saved channel**. It has reusable room links, a local profile (name and color), a live participant roster, and a prominent **ON THE AIR** speaker name. Everyone holds to talk and releases to listen.

**Open:** https://auxz2jz.github.io/Slot-26/

The earlier successful two-person implementation is preserved as [legacy-v3.html](legacy-v3.html) (or https://auxz2jz.github.io/Slot-26/legacy-v3.html). The v3 and v4 signaling IDs are different, so use v4 on all devices for group calls.

## Quick setup: create a permanent channel

1. Open the main page in Chrome, Safari, or a supported mobile browser. Use HTTPS and allow microphone access when you join.
2. Set your **name/callsign** (for example, Officer 1) and **display color**. These preferences are saved in this browser.
3. Under **Create a new channel**, enter a name like `Dispatch`, `Patrol`, or `Friends` and press **Create**.
4. The new channel appears under **Saved channels**. Press **Link** to copy its invitation **before** going live, and text the link to other people.
5. Press **Join** to activate your microphone and enter the channel. Your friend taps the invitation and then **Join** on their own device.
6. Everyone can press and **hold** the talk button. The current speaker's name appears in the **ON THE AIR** area and is highlighted in the roster. Release to listen.

**Next time:** No need to generate another invitation. Each device can open the main page and tap **Join** on its saved channel. The same link can be reused indefinitely as long as the channel ID remains saved or bookmarked. A receiving device saves the channel locally when it opens the invite.

The first device that joins an empty room becomes the temporary channel coordinator. That device handles group membership and speaker arbitration. It does not have to be the original creator. If it leaves, the remaining devices attempt to elect a replacement and reconnect.

## Customize profile and channels

- **Name/callsign** and one of six colors are saved on each device. Names and colors are shared with connected participants.
- A channel has a customizable title when created, a private random room ID, and a **permanent reuseable link**.
- Multiple channels can be stored on one device. Use **Leave** or **Switch or edit channels** to return to the channel list.
- **Forget** (×) removes only the channel shortcut from the local browser; it **does not delete the room**, revoke an invitation link, or kick other people out.
- Browser settings that clear site data or private/incognito sessions can erase saved channels and the user profile; save the invitation separately as a backup.

## Technical design

- **PeerJS 1.5.5** and **WebRTC** connect participants browser-to-browser, with microphone tracks normally muted.
- **PeerJS Cloud** supplies free third-party signaling; public STUN servers assist in connection setup.
- Audio is a **small full mesh**: each person exchanges a direct WebRTC audio stream with every other person. A six-person channel can require **15 distinct audio connections** overall (5 per person).
- One participant temporarily coordinates membership, publishes the roster, and grants a single push-to-talk speaker at a time.
- Temporary network interruptions trigger signaling recovery and reconnect attempts. When coordinator disappears, participants attempt to select another coordinator.
- The app uses **localStorage** for saved rooms and profile settings; there is no database or account login.

## Limitations and cautions

- This is a **prototype**, not a production security/dispatch system or emergency radio.
- **There is no authentication or authorization**: anyone with the room link can join if the channel has an available seat, and link sharing is not protected.
- Peer-to-peer WebRTC may fail for some LTE/carrier or workplace NAT configurations. A **TURN relay** is needed for reliable connectivity across restrictive networks.
- A group mesh uses more bandwidth and battery than a two-person call. Performance with six phones has **not** been field-tested.
- The browser must remain foregrounded and awake on many Android/iOS devices. iOS background/screen-lock restrictions can suspend audio.
- All devices should update to V4. The old V3 two-person page remains independently accessible.
- Saved rooms are not centrally managed: users can rename their own local shortcuts only by removing and recreating/bookmarking a link; centralized channel policies require the future server.
- The coordinator's browser may briefly interrupt a group when it leaves and a successor is elected.
- This version does not record audio, provide administrative audit trails, or retain user accounts.

## Troubleshooting

**No one else found:** Ensure all phones use the same permanent invite link, that all have V4 loaded, and at least one browser stays open. Tap **Reconnect** if someone has recently closed the page.

**No sound but names appear:** Tap **Enable speaker**. Check that the phone is not muted and the browser has microphone permission; use headphones when nearby. Check whether the status says audio is still linking.

**Works on Wi-Fi but not LTE:** The carrier's network may prevent direct WebRTC peer connections. The next phase needs a managed signaling service and TURN relay (for example coturn).

**Want the simpler version?** Open [the V3 two-person backup](legacy-v3.html).

## Test and deployment

The app is static: GitHub Pages deploys `index.html`, `app.js`, `room-utils.mjs`, and `styles.css` from `main` / `(root)`.

For utility tests in a Node environment with Web Crypto support:

```bash
node --test tests/rooms.test.mjs
```

The source passed JavaScript syntax checks; utility checks passed for room IDs, saved channel deduplication, links, and profiles. A mocked three-browser signaling/audio simulation successfully created a full three-way mesh, granted one speaker, displayed that speaker's name on all three devices, and cleared it on release. **A real multi-device field test is still needed.**

## Next production phase

For Zak's Security One or other work deployments: authenticated users, centrally managed persistent channel membership, a dedicated secure signaling service, server-issued TURN credentials, privacy-aware administrative controls, dispatch/group switching, and a server-forwarded audio architecture when groups outgrow a browser mesh.
