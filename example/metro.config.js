// Metro (requires a JS config file). @gaiadesk/embed-react-native is the
// repository root (a `file:..` dependency: run `npm run build` there first);
// React and React Native resolve only from this app, so there is one copy.
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
    blockList: [new RegExp(`${path.join(root, 'node_modules').replace(/[/\\]/g, '[/\\\\]')}[/\\\\].*`)],
  },
});
