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


## Version 4.1 — protected channels and radio squawk

### Channel PINs

- In **Create a new channel**, select **Require channel PIN** and enter an **8–12 digit numeric PIN**. The existing saved-channel **Lock** action also lets you protect an open channel.
- Text the **reusable Link** and tell members the **PIN separately** (ideally using a different communication method). Invite URLs contain `secure=1`, but **never contain the PIN or PIN-derived WebRTC room ID**.
- Every member enters the same PIN when they join. A separate deterministic PBKDF2-derived signaling namespace is used for each combination of channel ID and PIN; a device with a wrong PIN reaches a **different isolated session**, not the actual channel.
- PINs are held in memory during an open page session, but are **not saved in persistent localStorage**; after a reload, members must enter the PIN again.
- Locking an existing room moves the protected group to a new namespace. **Reshare the new protected link and PIN**; previously shared unprotected invitations do not grant access to the protected session.
- In this browser-only prototype, an incorrect PIN may look like an **empty channel** rather than displaying "Wrong PIN". Ask another member to confirm the PIN if you cannot see them.
- **Important:** A shared PIN is **not a verified user account**, and this scheme does not provide server-side authorization, PIN attempt rate limits, membership revocation, or assurance against determined attackers. Use a dedicated server with authenticated user identities and permissions for private work communications.

### Channel activity privacy

The client connects to **one selected channel at a time**. It does not send participant rosters, active speaker names, PTT activity, or WebRTC voice to other channels. PIN-protected rooms have distinct signaling namespaces. A user who is a member of multiple channels can join one, leave, then join another; **simultaneous channel monitoring and per-channel PTT buttons are planned for the later server-backed release**.

Audio and control data use WebRTC's encrypted transport, but encryption does not authenticate human identity or prevent a legitimate member from recording or forwarding audio.

### Optional PTT-start squawk

While in a radio channel, select **Send a short squawk when I start talking** to notify listeners. Listeners may independently uncheck **Play incoming squawks from this channel**. The squawk lasts about **0.2 seconds**, and the sender's microphone opens about **0.28 seconds** after winning the channel's talk floor, so the alert should precede the message. The tone is synthesized locally by the receiving browser; it is **not** yet injected into the outgoing voice stream. Some phones may suppress the tone when the page is backgrounded or audio permissions are restricted.

### Automated checks

GitHub Actions runs JavaScript syntax and room/PIN tests from [checks.yml](.github/workflows/checks.yml). Source files and local tests are published in this repository; over-the-air PIN protection and background tone behavior still require real device testing.

## Next production phase

For Zak's Security One or other work deployments: authenticated users, centrally managed persistent channel membership, a dedicated secure signaling service, server-issued TURN credentials, privacy-aware administrative controls, dispatch/group switching, and a server-forwarded audio architecture when groups outgrow a browser mesh.
