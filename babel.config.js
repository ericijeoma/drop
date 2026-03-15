module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    plugins: [
      'babel-plugin-react-compiler', 
      'react-native-reanimated/plugin', // must be last
    ],
  };
};