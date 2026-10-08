// Acme Bank: a React Native app with a Get help button.
//
// Your backend creates the support session (POST /v1/support/sessions with a
// secret key) and hands the app the embed token; here it comes from the text
// field or a deep link. The red "card number" is a <GaiaDeskMasked>: your
// support team sees it painted black. The Buy button counts presses, so a
// guided session's click shows up (Android delivers it; on iOS a
// TouchableOpacity is not a UIKit control, so the customer gets a "Tap here"
// hint, `hint_shown`).
//
// Test hooks (deep links, e.g. `xcrun simctl openurl booted
// 'acmebank://start?token=gdemb_…&server=http://127.0.0.1:9000&test_consent=1&capture=snapshot'`
// or `adb shell am start -a android.intent.action.VIEW -d 'acmebank://start?…'`):
//   acmebank://start?token=…&server=…&guided=1&test_consent=1&capture=snapshot|replayKit
//       press Get help (test_consent=1 answers the consent dialog "Share": tests only)
//   acmebank://stop, acmebank://pause, acmebank://resume
// Every event is logged as one JSON line prefixed `GaiaDeskDemo `.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmbedError, GaiaDeskEmbed, GaiaDeskMasked } from '@gaiadesk/embed-react-native';
import type { CaptureMethod, EmbedEvent, EmbedSession } from '@gaiadesk/embed-react-native';

const COMPANY = 'Acme';

function emit(o: Record<string, unknown>): void {
  console.log(`GaiaDeskDemo ${JSON.stringify(o)}`);
}

interface HelpRequest {
  token: string;
  server?: string;
  guided: boolean;
  testConsent: boolean;
  captureMethod?: CaptureMethod;
}

// React Native's URLSearchParams has no `get`: a small query parser instead.
function parseLink(url: string): { cmd: string; params: Map<string, string> } | null {
  const m = /^acmebank:\/\/([a-z]+)\/?(?:\?(.*))?$/.exec(url);
  if (!m) return null;
  const params = new Map<string, string>();
  for (const pair of (m[2] ?? '').split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
    params.set(k, i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')));
  }
  return { cmd: m[1], params };
}

export default function App(): React.JSX.Element {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(`Press Get help to share this app with ${COMPANY} support.`);
  const [bought, setBought] = useState(0);
  const help = useRef<EmbedSession | null>(null);

  const onEvent = useCallback((e: EmbedEvent) => {
    emit(e);
    if (e.type === 'code') setStatus(`Your support code: ${e.code}`);
    if (e.type === 'joined') setStatus(`${e.agent ?? 'An agent'} is viewing this app.`);
    if (e.type === 'ended') {
      setStatus(`Sharing ended (${e.reason}).`);
      help.current = null;
    }
  }, []);

  const getHelp = useCallback(
    async (req: HelpRequest) => {
      try {
        const agreed = req.testConsent || (await GaiaDeskEmbed.requestConsent(COMPANY, { guided: req.guided }));
        if (!agreed) {
          setStatus('Nothing was shared.');
          return;
        }
        help.current = await GaiaDeskEmbed.start(
          {
            embedToken: req.token,
            company: COMPANY,
            server: req.server,
            guided: req.guided,
            captureMethod: Platform.OS === 'ios' ? req.captureMethod : undefined,
          },
          { consentGranted: agreed },
          onEvent,
        );
      } catch (e) {
        const err = e instanceof EmbedError ? e : EmbedError.from(e);
        emit({ start_error: err.code, message: err.message });
        setStatus(`Could not start: ${err.message}`);
      }
    },
    [onEvent],
  );

  useEffect(() => {
    GaiaDeskEmbed.buildInfo().then(
      (build) => emit({ type: 'demo', build }),
      (e: unknown) => emit({ type: 'demo', build_error: String(e) }),
    );
    const handle = (url: string | null): void => {
      const link = url ? parseLink(url) : null;
      if (!link) return;
      const p = link.params;
      if (link.cmd === 'start') {
        const t = p.get('token') ?? '';
        setToken(t);
        const method = p.get('capture');
        void getHelp({
          token: t,
          server: p.get('server') ?? undefined,
          guided: p.get('guided') === '1',
          testConsent: p.get('test_consent') === '1',
          captureMethod: method === 'snapshot' || method === 'replayKit' ? method : undefined,
        });
      } else if (link.cmd === 'stop') help.current?.stop();
      else if (link.cmd === 'pause') help.current?.setPaused(true);
      else if (link.cmd === 'resume') help.current?.setPaused(false);
    };
    Linking.getInitialURL().then(handle, () => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [getHelp]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Acme Bank</Text>
      <View style={styles.row}>
        <GaiaDeskMasked style={styles.card} testID="card">
          <Text style={styles.cardText}>Card 4242 4242 4242 4242</Text>
        </GaiaDeskMasked>
        <View style={styles.blue} testID="blue" />
      </View>
      <Pressable
        style={styles.button}
        testID="buy"
        onPress={() => {
          const next = bought + 1;
          setBought(next);
          emit({ bought: next });
        }}
      >
        <Text style={styles.buttonText}>Buy ({bought})</Text>
      </Pressable>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="gdemb_… (from your backend)"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable style={styles.button} testID="get-help" onPress={() => void getHelp({ token, guided: false, testConsent: false })}>
        <Text style={styles.buttonText}>Get help</Text>
      </Pressable>
      <Text style={styles.status}>{status}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'rgb(52, 199, 89)', padding: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: 'black', marginTop: 40 },
  row: { flexDirection: 'row', marginTop: 16 },
  card: { width: 200, height: 120, backgroundColor: 'red', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardText: { color: 'white' },
  blue: { width: 110, height: 120, backgroundColor: 'blue' },
  button: { width: 160, height: 50, marginTop: 16, backgroundColor: 'white', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: 17, color: 'black' },
  input: { marginTop: 16, height: 44, backgroundColor: 'white', paddingHorizontal: 10, borderRadius: 6 },
  status: { marginTop: 16, color: 'black' },
});
