"use strict";

const workletsPluginPath = require.resolve("react-native-worklets/plugin");
const workletsPluginOptions = {
    bundleMode: true,
    strictGlobal: true,
};
const isDEV = process.env.APP_ENV !== "production";
if (isDEV) {
    module.exports = (api) => {
        api.cache(true);
        return {
            presets: ["babel-preset-expo"],
            plugins: [
                "@babel/plugin-syntax-dynamic-import",
                [workletsPluginPath, workletsPluginOptions],
            ],
        };
    };
} else {
    module.exports = (api) => {
        api.cache(true);
        return {
            presets: ["babel-preset-expo"],
            plugins: [
                "@babel/plugin-syntax-dynamic-import",
                [workletsPluginPath, workletsPluginOptions],
                "transform-remove-console",
            ],
            compact: true,
            minified: true,
            comments: false,
        };
    };
}
