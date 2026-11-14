# Relay One — Multi-Channel Walkie-Talkie (Version 5 Prototype)

**Website:** https://auxz2jz.github.io/Slot-26/

Relay One is a browser walkie-talkie. **Version 5 keeps up to five channels connected simultaneously in one dashboard**, with a separate Hold Talk button and Monitor checkbox beside every group. Each room supports up to **six active participants**; participants may belong to overlapping rooms. The owner/operator can join several rooms and broadcast to only the room whose Talk button they hold.

This remains a browser-only **prototype without verified employee accounts**. Do not use it for emergency traffic or confidential workplace conversations.

## Get started

1. Open the website in a modern Chrome, Safari, or supported browser over HTTPS.
2. Set your name/callsign and optional display color.
3. Under **Add a Channel**, enter a title such as Patrol, Dispatch, or Special Team.
4. Optionally tick **Require a channel PIN**. New and existing protected rooms allow **4–12 numeric digits**. A four-digit PIN is convenient but weak; longer PINs are preferable.
5. Click **Create**. Use **Copy link** next to the group to share its reusable invitation. Tell invitees the PIN separately (never embed the PIN in the URL).
6. Click **Join** beside each channel you want to connect. Repeat for up to five channels without leaving the page.
7. Choose which joined channels you want to hear by ticking **Monitor sound**. Use **Monitor all** or **Mute all** as shortcuts.
8. **Hold Talk** beside a channel to speak **only to that group**. All other group microphone tracks stay muted, and other monitored channel speakers are temporarily muted locally while transmitting to reduce audio bleed. Release to listen again.
9. Click **Focus** on an active channel if you want to use the large **Quick Radio** talk button for it.
10. Click **Call** beside a connected group to send its members an optional attention beep, but not other channels.

### When you return

The browser remembers your saved channels, monitor choices, profile, and which rooms were joined. Because browsers require microphone access and may suspend background pages, **press Restore joined** after a refresh/reopen to reconnect those rooms. Protected rooms ask for the PIN again; PINs are retained only in memory during the current page session.

Press **Leave** beside a channel to disconnect that group without disconnecting any of the other groups.

### PIN protection / room privacy

- Every room has a unique invitation ID. Protected rooms derive a separate WebRTC signaling namespace from the combination of room ID and PIN using PBKDF2.
- The link contains the public room ID and a `secure=1` indicator **but never the PIN or derived namespace**. The PIN is not persisted in localStorage.
- Only browsers joined to the same channel namespace exchange their audio, member roster, active-speaker information, and call/PTT messages.
- Simply saving a channel does not join it or reveal active conversations.
- People belonging to several groups see the activity only for groups they have actually joined. Switching Monitor off silences that group's sound on the local device; it does not forcibly disconnect the group.
- An incorrect PIN can look like an empty channel, because **there is no central server to verify PINs**.
- PINs are **not server-enforced authentication**, and a four-digit PIN offers only 10,000 combinations. There is no server-side access control, PIN rate limiting, or user revocation. Real private work use requires authenticated accounts and server-managed channel membership. A participant can independently record or relay a conversation.

### Audio architecture / isolation

- The app obtains microphone permission once and creates an **independent cloned audio track per joined channel**. All cloned tracks start disabled; the track for a granted Talk button is the only track enabled while transmitting.
- Each joined channel maintains separate PeerJS signaling, presence, current talker, and WebRTC audio connections. Its participants have no access to other channels unless they separately join those rooms.
- When transmitting, all **other joined groups are locally ducked/muted** to reduce accidental acoustic retransmission of another group through the phone speaker and microphone.
- The first participant in each room becomes its temporary PTT coordinator. When that user leaves or disconnects, remaining devices attempt to reconnect/elect a new one.
- PeerJS Cloud signaling and public STUN are prototype dependencies. There is **no TURN relay**, so some LTE/carrier/corporate networks will fail direct connections.
- **Up to five simultaneous rooms** is an application limit, not a performance guarantee. A six-person room is already a peer-to-peer mesh; several monitored rooms may create many WebRTC connections and consume significant battery/data.
- Some iOS/Android versions suspend audio, microphones, and network traffic while the browser is backgrounded or the screen locks. Background operation is not guaranteed.

### Controls

| Control | What it does |
|---|---|
| Join / Leave | Starts or ends just that room |
| Hold Talk (per group) | Transmits to that group only, one group at a time |
| Monitor sound | Hear or mute that group's incoming audio |
| Focus | Selects the group for the large Quick Radio talk button |
| Call | Sends a channel-local attention alert |
| Copy link | Copies a reusable, PIN-free invitation |
| Set PIN | Moves an open channel into a PIN-derived namespace after leaving it |
| Monitor all / Mute all | Sets local monitoring preferences |
| Enable speakers | Attempts to enable remote playback on the current device |
| Restore joined | Reconnects previously joined groups following page reload |
| Forget | Removes only a saved shortcut from this device; does not revoke its link |

### Optional sounds

- **Squawk before I transmit:** sends a small PTT-start signal to the **selected group only**, and starts microphone transmission after a short delay.
- **Hear incoming squawks:** allows each listener to disable incoming PTT tones.
- **Hear channel call alerts:** enables/disables the short attention beep sent by the group's Call button.

Tones are synthesized by the receiving browser and may be suppressed during mobile backgrounding.

## Versions and rollback

- **Current:** [Version 5 main multi-channel dashboard](index.html).
- **Previous:** [Version 4.1 single-channel group radio with PIN and squawk](legacy-v4-1.html).
- **Earlier:** [Version 4 group radio](legacy-v4.html).
- **Two-person:** [Version 3 walkie-talkie](legacy-v3.html).

The earlier versions have independent JavaScript, styles and PIN utility backups so later changes do not break their files.

## Testing

GitHub Actions runs `node --check` syntax checks and `node --test tests/*.test.mjs`. The tests cover saved rooms and PIN IDs, plus simulated three-browser audio meshes across two overlapping groups. The simulation validates separate channel tracks, channel-local PTT, temporary muting of other monitored channels during transmission, and monitor restoration afterward.

**These are automated simulations, not a substitute for testing actual Android and iPhone devices**—especially five concurrent rooms, LTE handoffs, and background audio.

## Future server-backed version

Verified employee/user accounts, administrator-assigned overlapping memberships, server-validated PINs and room permissions, direct private calls, user management, individual revocation, secure call events, push notifications, TURN for mobile networks, and an SFU/media router for scalable multi-channel dispatch.

See [Version 5 roadmap](docs/V5_ROADMAP.md).
