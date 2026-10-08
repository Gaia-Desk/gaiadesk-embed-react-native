// Secret fields (a PIN, a one-time code, a password): while focus is in one,
// the agent's guided typing and keys are refused (`masked`).

import { forwardRef, useCallback } from 'react';
import { TextInput } from 'react-native';
import type { NativeSyntheticEvent, TextInputFocusEventData, TextInputProps } from 'react-native';

import { GaiaDeskEmbed } from './embed.ts';

type FocusEvent = NativeSyntheticEvent<TextInputFocusEventData>;

function tell(secret: boolean): void {
  try {
    GaiaDeskEmbed.setSecretFocus(secret);
  } catch {
    // not linked / not a phone: nothing to tell
  }
}

/** `onFocus` / `onBlur` for your own secret field (they call yours too). */
export function useGaiaDeskSecretFocus(onFocus?: (e: FocusEvent) => void, onBlur?: (e: FocusEvent) => void) {
  return {
    onFocus: useCallback(
      (e: FocusEvent) => {
        tell(true);
        onFocus?.(e);
      },
      [onFocus],
    ),
    onBlur: useCallback(
      (e: FocusEvent) => {
        tell(false);
        onBlur?.(e);
      },
      [onBlur],
    ),
  };
}

/** A TextInput for secrets: `secureTextEntry` by default, and guided typing is refused while it has focus. */
export const GaiaDeskSecretInput = forwardRef<TextInput, TextInputProps>(function GaiaDeskSecretInput(props, ref) {
  const focus = useGaiaDeskSecretFocus(props.onFocus, props.onBlur);
  return <TextInput secureTextEntry {...props} ref={ref} onFocus={focus.onFocus} onBlur={focus.onBlur} />;
});
