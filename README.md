# @gaiadesk/embed-react-native

A **"Get help" button for your React Native app**. Your customer taps it and agrees; your app's
screen is shared with **your** support team, who see it in the GaiaDesk console's Support page
and, if you allow it, guide it: tap, scroll and type **inside your app only**.

- TypeScript, typed events, no JS dependencies. A TurboModule under the new architecture, a
  classic native module under the old one.
- Over GaiaDesk's native embed SDKs: the **`GaiaDeskEmbed`** pod on iOS and
  **`net.gaiadesk:embed-android`** on Android.
- Consent first: the SDK's own consent dialog, or yours.
- An always-visible **"Sharing with Acme · Stop"** indicator, owned by the SDK, for as long as
  anything is shared.
- Only your app by default. Views you mask (card numbers, balances) are **painted black in every
  frame** before it is encoded.
- View-only unless you opt in; guided input is delivered inside your app, never through the
  system's input stream.

```sh
npm install @gaiadesk/embed-react-native
```

React Native 0.74 or later (new or old architecture). Not available in Expo Go (it is native
code); in an Expo app use a development build.

### iOS

```sh
cd ios && pod install
```

`pod install` pulls the `GaiaDeskEmbed` pod (the Swift SDK and its prebuilt
`GaiaDeskEmbedFFI.xcframework`) through this package's `GaiaDeskEmbedReactNative` pod. iOS 15.1 or
later. The app's own screen only, always (see Capture).

### Android

Autolinking adds the module; it depends on **`net.gaiadesk:embed-android:0.1.0`** from Maven
Central, so keep `mavenCentral()` in your repositories (React Native templates have it). The SDK
needs **`minSdkVersion 26`** (Android 8.0): set it in `android/build.gradle`. Nothing to add to your
manifest unless you opt into sharing the whole screen (see Capture).

## Quick start

Your server creates a support session with a secret API key (scope `support`) and hands the app its
`embed_token`:

```sh
curl -s -X POST https://api.gaiadesk.net/v1/support/sessions \
  -H "Authorization: Bearer $GAIADESK_API_KEY" -H "Content-Type: application/json" \
  -d '{"mode": "view", "customer": {"name": "Ada", "plan": "pro"}}'
# → {"id": "ss_…", "join_code": "123456789", "embed_token": "gdemb_…", …}
```

Then, in the app:

```tsx
import { EmbedError, GaiaDeskEmbed, GaiaDeskMasked } from "@gaiadesk/embed-react-native";

async function getHelp(embedToken: string) {
  // 1. Ask (the SDK's dialog; or show your own).
  const agreed = await GaiaDeskEmbed.requestConsent("Acme");
  if (!agreed) return;

  // 2. Start, with the answer.
  try {
    const help = await GaiaDeskEmbed.start(
      { embedToken, company: "Acme" },
      { consentGranted: agreed },
      (e) => {
        if (e.type === "code") console.log("support code", e.code);
        if (e.type === "joined") console.log(e.agent ?? "an agent", "is viewing");
      },
    );
    console.log("ended:", await help.ended);
  } catch (e) {
    if (e instanceof EmbedError) console.error(e.code, e.message); // bad_token, consent_required, busy, …
    else throw e;
  }
}

// 3. Anything sensitive: wrap it.
<GaiaDeskMasked style={styles.card}>
  <Text>Card 4242 4242 4242 4242</Text>
</GaiaDeskMasked>
```

`example/` is a complete app ("Acme Bank"): a masked card, a Buy button, a token field and Get
help.

## Consent is required

`start` refuses (`EmbedError` with code `consent_required`) unless `consentGranted` is literally
`true`, and that must be your user's answer to a consent dialog: `GaiaDeskEmbed.requestConsent`
(the SDK's: a `UIAlertController` on iOS, an `AlertDialog` on Android) or your own. This package
checks it, and the native library checks it again: that is the real gate. Say who will see what,
and whether they can act. With `capture: "screen"` (Android), Android asks again with its own
screen-capture dialog.

## Masking

Masked regions are painted black **before** a frame is encoded; the support team never receives
them.

- **`<GaiaDeskMasked>`**: a `View` (every View prop) that is masked while it is mounted.
- **`useGaiaDeskMask()`**: for your own view: `const mask = useGaiaDeskMask();` then
  `<View ref={mask.ref} onLayout={mask.onLayout} collapsable={false}>`.
- **`masks`** in the start options and **`session.setMaskedRects(rects)`**: rects you measured
  yourself (`{ x, y, w, h }`, `measureInWindow`'s layout units). `setMaskedRects` replaces the
  earlier set; `[]` clears it. Marked views stay masked on top.

Marked views are measured with `measureInWindow` when they lay out, right before `start` (so they
cover the very first frame), and every 500 ms while a session runs (a scroll moves views without a
layout). Call `refreshMasks()` after a change you want covered at once. Units are React Native
layout units: points on iOS (what the SDK takes), dp on Android (the native module multiplies by the
display density and adds the visible frame's offset in the window, rounding outward).

## Guided mode

Sessions are **view-only by default**. Guided input (the agent taps, scrolls, types and presses a
few keys) needs **both** `guided: true` in your options **and** a `"cobrowse"` support session
(your backend's `mode`). Even then a request is applied only inside your app, while it is in
front, not under a mask, at most 20 a second. Your customer can **Pause control** on the indicator;
you can too, with `session.setPaused(true)`. Every request is reported as an `action` event.

- **Android: full**, in-process delivery to your views (React Native's included).
- **iOS: partial.** iOS has no public way to synthesise a touch, so the SDK uses UIKit's public
  API: UIKit controls (buttons, switches, segmented controls), text fields and text views, table
  and collection cells, and scroll views get real delivery; typing goes into the first responder.
  Anything else, which includes most React Native touchables (`Pressable`, `TouchableOpacity`), gets
  a **"Tap here"** ring for your customer instead, reported as `applied: false, reason:
  "hint_shown"`.

## The indicator

While anything is shared the SDK shows its own **"Sharing with <company> · Stop"** indicator (in
guided sessions also Pause / Allow control). Frames are sent only while it is on screen. Stop ends
everything; you get `ended` with reason `stopped`.

## Capture

| | iOS | Android |
|---|---|---|
| default | this app only: `captureMethod: "replayKit"` (ReplayKit in-app capture: exactly what the app shows; iOS asks once to allow recording the app) | `capture: "app"`: your activity's window (PixelCopy; no permission, no system dialog) |
| alternative | `captureMethod: "snapshot"`: a snapshot of the app's windows, no system prompt; misses some video/Metal content. Use it in the Simulator (no ReplayKit there) | `capture: "screen"`: the whole screen through MediaProjection (opt-in; Android asks the user too) |
| refused | `capture: "screen"` (`bad_config`: the iOS embed never shares outside the app) | `captureMethod` (`bad_config`: iOS only) |

For `capture: "screen"` add to your app's `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
```

Without them the session fails with `capture_failed`. Pass `capture: "screen"` to
`requestConsent` as well, so the dialog says the whole screen is shared.

## API

| | |
|---|---|
| `GaiaDeskEmbed.start(options, { consentGranted }, onEvent?)` | `Promise<EmbedSession>`; rejects with `EmbedError` (`.code`) |
| `session.on(listener)` | listen to events; returns an unsubscribe function |
| `session.stop()` | end the session (safe to call again); `ended` follows with `app_stopped` |
| `session.setMaskedRects(rects)` | replace your masked rects (`{ x, y, w, h }[]`, layout units) |
| `session.setPaused(paused)` | pause or resume guided input |
| `session.ended` | a promise of the end reason, resolved exactly once |
| `session.isEnded`, `session.sessionId` | whether it is over; the session id once `code` arrived |
| `GaiaDeskEmbed.requestConsent(company, { guided?, capture? })` | `Promise<boolean>`: the SDK's consent dialog |
| `GaiaDeskEmbed.buildInfo()` | `Promise<{ version, testSource, codec, os, arch }>` of the native library |
| `GaiaDeskEmbed.current` | the running session, if any |
| `<GaiaDeskMasked>`, `useGaiaDeskMask()`, `refreshMasks()` | masking (above) |

| Option | |
|---|---|
| `embedToken` | `gdemb_…`, from your backend |
| `company` | shown on the consent dialog and the indicator |
| `server` | the GaiaDesk server (default `https://gaiadesk.net`) |
| `guided` | allow guided input (default `false`) |
| `fps` | 1 to 30 (default 15) |
| `masks` | `{ x, y, w, h }[]` in layout units, masked from the first frame |
| `capture` | `"app"` (default) or `"screen"` (Android only) |
| `captureMethod` | `"replayKit"` (default) or `"snapshot"` (iOS only) |

| Event | |
|---|---|
| `state` | `{ state }`: `starting`, `waiting`, `connected`, `ended` |
| `code` | `{ code, sessionId, mode }`: the session is up; `code` is the support code your customer reads to the agent; `mode` is `view` or `cobrowse` |
| `joined` / `left` | `{ agent }` (the agent's email, or `null`) / `{}` |
| `control` | `{ allowed }`: guided input paused (`false`) or allowed again |
| `action` | `{ action, applied, reason }`: an agent's request and what became of it (`reason`: `view_only`, `control_paused`, `rate_limited`, `not_focused`, `outside_app`, `masked`, `embed_ui`, `unsupported`, `hint_shown` (iOS), …) |
| `error` | `{ code, message }`; `ended` follows when it was fatal |
| `ended` | `{ reason }`: `stopped`, `app_stopped`, `disconnected`, `expired` or `error`. Always last, exactly once |

Events arrive on the JS thread, in order. Types this version does not know are ignored.

Refusal codes include `consent_required`, `bad_token`, `bad_server`, `bad_config`, `bad_rects`,
`busy` (one session at a time: the native SDKs enforce it), `no_activity` (Android: no activity in
front), `not_linked` (the native module is missing from the build) and `unsupported_platform`.

Reloading the JS bundle stops a running session (nothing keeps sharing without your app's JS).

## Development

```sh
npm ci
npm test            # node:test over the TypeScript layer with a fake native module (Node 22.6+)
npm run typecheck
npm run build       # lib/
```

The example (create its native projects first: `npx @react-native-community/cli init AcmeBank
--version 0.76.9`, then copy `ios/` and `android/` into `example/`, add the `acmebank` URL scheme
and set Android `minSdkVersion` 26):

```sh
npm run build && cd example && npm install && npm run pods && npm run ios   # or: npm run android
```

It logs one `GaiaDeskDemo {json}` line per event. Deep links drive it:
`acmebank://start?token=gdemb_…&server=…&guided=1&capture=snapshot` (and, for automated tests only,
`&test_consent=1`), `acmebank://stop`, `acmebank://pause`, `acmebank://resume`.

## Licences

- This package (the TypeScript, the iOS and Android module sources and the example): **MIT**
  (`LICENSE`).
- The native library the SDKs bundle (`GaiaDeskEmbedFFI.xcframework` in the GaiaDeskEmbed pod,
  `libgaiadesk_embed.so` in net.gaiadesk:embed-android): closed source, under the **GaiaDesk Native
  Binary Licence** (`LICENSE-BINARY`).
