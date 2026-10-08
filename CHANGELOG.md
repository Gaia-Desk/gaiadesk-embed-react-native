# Changelog

## 0.1.0

The first release: GaiaDesk's built-in help desk for React Native apps, over the iOS
(`GaiaDeskEmbed` pod) and Android (`net.gaiadesk:embed-android`) embed SDKs.

- `GaiaDeskEmbed.start(options, { consentGranted }, onEvent?)` resolving to an `EmbedSession` with
  `.on()`, `.stop()`, `.setMaskedRects()`, `.setPaused()` and `.ended` (a promise of the end
  reason); refusals as `EmbedError` with a stable `code`.
- `GaiaDeskEmbed.requestConsent(company, { guided, capture })`: the SDK's consent dialog, resolving with a single-use `Consent` (or null); `recordConsent` after your own dialog; `start` takes only a `Consent`.
- `GaiaDeskEmbed.buildInfo()`.
- Typed events (`state`, `code`, `joined`, `left`, `control`, `action`, `error`, `ended`) with a
  strict parser that ignores types it does not know.
- `<GaiaDeskMasked>` and `useGaiaDeskMask()`: views measured with `measureInWindow` and masked from
  the first frame, kept current while a session runs.
- Per-platform options checked in JS: `capture: "screen"` (Android only) and `captureMethod`
  (iOS only).
- Native modules: a TurboModule (codegen spec `src/NativeGaiaDeskEmbed.ts`) with an old
  architecture fallback; iOS in ObjC++ and Swift (`GaiaDeskEmbedReactNative` pod), Android in
  Kotlin. A JS reload stops a running session.
- `example/`: "Acme Bank", with a masked card number and a Buy button.
