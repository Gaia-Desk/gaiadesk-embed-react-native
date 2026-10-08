// React Native events that move views without telling them (the keyboard,
// a rotation or window resize, the app coming back): each one re-measures the
// marked views at once, between the session's polls.

import { AppState, Dimensions, Keyboard } from 'react-native';

import { requestMaskRefresh } from './embed.ts';

let installed = false;

/** Listen once, for the app's lifetime (cheap: nothing runs without a session). */
export function installMaskTriggers(): void {
  if (installed) return;
  installed = true;
  Dimensions.addEventListener('change', requestMaskRefresh);
  for (const e of ['keyboardDidShow', 'keyboardDidHide', 'keyboardDidChangeFrame'] as const) Keyboard.addListener(e, requestMaskRefresh);
  AppState.addEventListener('change', requestMaskRefresh);
}
