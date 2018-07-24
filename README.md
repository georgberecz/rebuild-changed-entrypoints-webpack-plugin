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

(not yet - soon™)

```
yarn add -D rebuild-changed-entrypoints-webpack-plugin
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

TODO

## How it works

1.  Build up Cache

The plugin hooks into the webpack compilation process. So, after the dependency tree is build, we cache the corresponding dependencies of every entrypoint and their last modification dates by writing this information to a JSON.

2.  Use cache to determine rebuild targets

When webpack tries to rebuild an entrypoint, we check whether the cache holds information for that entry. If there is information and neither a dependenciy from nor the entrypoint itself changed, it is skipped.

No magic :)

## Motivation

This plugin was written to speed up the build process for the development setup in a gulp environment. For development we use `gulp.watch` to rebuild according files. However, the watcher does not know about entrypoints and their corresponding dependencies.

There might be other use cases, where this plugin makes sense: e.g. when

This plugin probably does not make sense, when you use the webpack-dev-server.
