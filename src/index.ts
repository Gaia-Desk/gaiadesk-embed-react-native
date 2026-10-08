// @gaiadesk/embed-react-native: a "Get help" button for your React Native
// app. Your customer agrees, and your support team sees the app's screen in
// the GaiaDesk console. A typed layer over GaiaDesk's iOS (GaiaDeskEmbed pod)
// and Android (net.gaiadesk:embed-android) embed SDKs.
//
// What the native library enforces (no wrapper can skip it): it refuses to
// start without consent; frames are sent only while the SDK's "Sharing with
// <company> · Stop" indicator is on screen; masked regions are painted out of
// every frame before it is encoded; input is off unless you allow `guided`
// AND the session is "cobrowse".

import { reactNativeBridge } from './bridge.ts';
import { setBridgeProvider } from './embed.ts';
import { installMaskTriggers } from './triggers.ts';

setBridgeProvider(reactNativeBridge);
installMaskTriggers();

export { GaiaDeskEmbed, MASK_REFRESH_MS, maskedOnScroll, requestMaskRefresh, useBridge } from './embed.ts';
export type { BuildInfo } from './embed.ts';
export { EmbedSession } from './session.ts';
export type { EmbedListener } from './session.ts';
export { EmbedError } from './errors.ts';
export { EVENT_NAME, parseEvent } from './events.ts';
export type { EmbedEvent, EmbedState, EndReason, SessionMode } from './events.ts';
export { nativeConfig } from './config.ts';
export type { Capture, CaptureMethod, Consent, ConsentOptions, EmbedOptions, Rect } from './config.ts';
export { GaiaDeskMasked, measureRect, refreshMasks, useGaiaDeskMask } from './masks.tsx';
export type { GaiaDeskMask, Measurable } from './masks.tsx';
export type { Bridge, NativeEmbedModule } from './native.ts';
