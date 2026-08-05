// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // firepit-provider and the cache-settings provider deliberately call
      // setState inside effects (e.g. hydration async chains, ref-driven
      // refresh callbacks); the rule flags these but the state updates are
      // idempotent and guarded by mounted/cancelled refs.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
