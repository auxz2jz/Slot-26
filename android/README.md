# Relay One Android APK (V6.18 radio, Android 0.1.0)

## What this is

This Android project packages the **existing live Relay One web radio** at https://auxz2jz.github.io/Slot-26/ in a dedicated, microphone-enabled Android WebView. It does not replace the shared PeerJS signaling protocol, channel names, PINs, audio messages or existing UI. Basic/Advanced channels, scan, monitor, PTT, tones, captions (subject to WebView support), headset controls (where Android supplies key events), and all one-report diagnostics continue to use the live website.

This app is **network-dependent**. It is not a bundled offline clone. Updates to the GitHub Pages radio appear in the APK when it loads online. Android System WebView must be installed and up to date.

## Android native additions

- Native WebView microphone permission for the **trusted GitHub Pages origin only**. Android's one-time RECORD_AUDIO runtime permission is requested when needed. Other WebView permission resources are denied.
- Optional READ_PHONE_STATE permission prompted at first launch for SIM operator and coarse radio/data type. This is **not** permission to access phone numbers, identifiers or the data-plan account. It is safe to deny; radio still works. Signal strength is only included if Android exposes it.
- Android network transport, system-validated internet status, captive-portal flag, metered state, device make/model/OS, and app UID total sent/received bytes since this app launch.
- App UID bytes **combine Wi-Fi and cellular**. Neither Android nor a regular app can read remaining carrier data, billing, plan caps or throttling.
- Bounded native network event history while the app is running and last saved snapshot across restarts.
- The existing **Save report** button writes the entire global diagnostic report, including the native section, to Downloads/Relay-One. No separate test controls.
- Physical headset hook/programmable KEYCODE_BUTTON_1 is surfaced as the learnable `RelayNativePTT` keyboard code while the app is foregrounded. Proprietary Bluetooth buttons may not send an Android key event.
- The page keeps the display awake while open; native code does **not** claim reliable background or lock-screen radio. The audio system, operating system and WebView may suspend the page when backgrounded.

## Build with GitHub Actions

Open **Actions → Build Relay One Android APK → latest successful run → Artifacts → Relay-One-Android-APK**. The ZIP contains `app-debug.apk`. For a more direct download, the workflow creates a public GitHub Release at `android-v0.1.0` if the build succeeds.

This uses Android Gradle Plugin **8.9.2**, Gradle **8.11.1**, Java **17**, SDK **35**, min SDK **26**. APK package name is `com.zaksecurity.relayone`.

### Signing

The first build is debug-signed by GitHub Actions, not production-signed. The runner generates a new debug signing certificate for each new build. **A later build with a different certificate cannot update an earlier install in place.** For durable upgrades, set up your private production signing key in GitHub Actions secrets and produce a release-signed artifact. Never commit a private signing key to a public repository.

### Security / privacy

This is an app using a live trusted website, so the site and any libraries it loads have the same WebView privileges as the visible radio. The native Javascript bridge has only two bounded methods: get sanitized diagnostic text and save a bounded text report; no telephony identifiers, credentials, location, messages, or PINs are exposed. The WebView blocks top-level navigation to unrelated hosts and denies all media permissions other than microphone capture for its own trusted origin.

### Limitations to verify on actual phones

Android WebView might not implement SpeechRecognition, all audio output-routing features or every WebRTC API Chrome supports. Always test on each target handset for simultaneous channel audio, external PTT headsets, microphone start/stop, media playback, Whisper Worker/model downloads, and downloads. TURN is not configured. Cellular service and plan availability are not under the app's control.
