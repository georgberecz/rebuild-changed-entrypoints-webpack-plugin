<div align="center">
  <!-- replace with accurate logo e.g from https://worldvectorlogo.com/ -->
  <a href="https://github.com/webpack/webpack">
    <img width="200" height="200" vspace="" hspace="25"
      src="https://cdn.rawgit.com/webpack/media/e7485eb2/logo/icon.svg">
  </a>
  <h1>Rebuild-Changed-Entrypoints-Webpack-Plugin</h1>
  <p>A webpack plugin that makes webpack only build entrypoints with changed files/dependencies (therefore, skipping entrypoints with no changes).<p>
</div>

## Install

```
yarn add -D rebuild-changed-entrypoints-webpack-plugin
```

```
npm install rebuild-changed-entrypoints-webpack-plugin --save-dev
```

## Usage

```javascript
const RebuildChangedPlugin = require('rebuild-changed-entrypoints-webpack-plugin');

// Webpack configuration
module.exports = {
  //...
  plugins: [
    new RebuildChangedPlugin({
      cacheDirectory: __dirname,
    }),
  ],
  //...
};
```

## Options

There are some options you can pass to modify the behavior of the plugin.

| Attribute        | Type                           | Required                      | Description                                                                                                                                                                    |
| ---------------- | ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| _cacheDirectory_ | `{String}`                     | **True**                      | Specifies the path, where the cache directory `.webpack-changed-plugin-cache` will be generated                                                                                |
| _logLevel_       | `{"none" | "error" | "debug"}` | **False** - default: `"none"` | Specifies the logLevel for the console output. <br> `"none"` - No logging <br> `"error"` - Only error logs <br> `"debug"` - Prints very detailed information about the process |

**webpack.config.js**

```javascript
plugins: [
    new RebuildChangedPlugin({
      cacheDirectory: __dirname,
    }),
  ],
```

## How it works

(1) Build up Cache

The plugin hooks into the webpack compilation process. So, after the dependency tree is build, we cache the corresponding dependencies of every entrypoint and their last modification dates by writing this information to a JSON.

(2) Use cache to determine rebuild targets

When webpack tries to rebuild an entrypoint, we check whether the cache holds information for that entry. If there is information and neither a dependenciy from nor the entrypoint itself changed, it is skipped.

No magic :)

## Motivation

This plugin was written to speed up the build process for the development setup in a gulp environment. For development we use `gulp.watch` to rebuild according files. However, the watcher does not know about entrypoints and their corresponding dependencies.

However, there might be other use cases, where this plugin makes sense.

This plugin probably **does not** make sense, when you use the webpack-dev-server.
