/*装配 NativeWind 所需的 Babel preset，保持 Expo 默认转译链路。 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
