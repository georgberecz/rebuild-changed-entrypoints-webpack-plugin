const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const fsStat = promisify(fs.stat);

const CACHE_FILE_NAME = '/cache.json';
// There also has to be an option to re-build everything based on
// variable supplied by options
// (E.g. think of rebuild based on process.env.theme)
class ChangedFilesWebpackPlugin {
  constructor({ cacheDirectory }) {
    this.cache = null;
    this.options = {};
    this.options.cacheDirectory = path.join(
      cacheDirectory,
      './.webpack-changed-plugin-cache'
    );
    if (!fs.existsSync(this.options.cacheDirectory)) {
      fs.mkdirSync(this.options.cacheDirectory);
    }
  }

  getCache() {
    // If cache is not loaded yet, we try to load it
    if (!this.cache) {
      try {
        const data = fs.readFileSync(
          path.join(this.options.cacheDirectory, CACHE_FILE_NAME),
          'utf-8'
        );
        this.cache = JSON.parse(data);
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log('No cache file found. Rebuild everything.');
          this.cache = {};
        } else throw err;
      }
    }

    return this.cache;
  }

  hasToRebuildEntry(entryName, entryDependency) {
    const cache = this.getCache();

    // Check if there is a cache: no cache -> we rebuild
    if (!cache) return true;

    // No cached value for the entry -> we rebuild the entry
    if (!cache[entryName]) return true;

    let singleEntryDependencies = [];
    // Normalize MultiEntryDependency and SingleEntryDependency
    if (entryDependency.type === 'multi entry') {
      singleEntryDependencies = entryDependency.dependencies;
    } else {
      singleEntryDependencies = [entryDependency];
    }

    // Check whether entrypoint file did change -> if yes: rebuild
    for (const dependency of singleEntryDependencies) {
      const dependencyFile = dependency.request;
      const entryMTime = this.getSyncMTimeForFilePath(dependencyFile);

      // Entry file modification time differs from cache -> rebuild
      if (entryMTime !== cache[entryName][dependencyFile]) {
        console.log(
          `${entryName} was modified: ${entryMTime} - ${
            cache[entryName][dependencyFile]
          }`
        );
        return true;
      }
    }

    // Check whether dependencies from entrypoint changed -> if yes: rebuild
    for (const dependencyFile of Object.keys(cache[entryName])) {
      const dependencyMTime = this.getSyncMTimeForFilePath(dependencyFile);
      if (dependencyMTime !== cache[entryName][dependencyFile]) {
        console.log(
          `${dependencyFile} was modified: ${dependencyMTime} - ${
            cache[entryName][dependencyFile]
          }`
        );
        return true;
      }
    }

    return false;
  }

  getSyncMTimeForFilePath(filePath) {
    // Get the last modified date for a specific file
    try {
      const stats = fs.statSync(filePath);

      return stats.mtime.getTime();
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('Could not get mTime: File not found!');
      } else throw err;

      return -1;
    }
  }

  async getAsyncMTimeForFilePath(filePath) {
    // Get the last modified date for a specific file
    try {
      const stats = await fsStat(filePath);

      return stats.mtime.getTime();
    } catch (e) {
      console.error(e);

      return -1;
    }
  }

  async generateCache(entryPointInformation) {
    let cacheJSON = {};

    // If there was a cache, we use it as baseline and overwrite if necessary
    // TODO: Currently, old entries will never be removed: We would need to track all the entries that were initially supposed to be build
    if (this.cache) {
      cacheJSON = { ...this.cache };
    }

    // Iterate over all entrypoints and extract cache-relevant values
    // from every dependency
    await Promise.all(
      entryPointInformation.map(async ({ name, dependencySet }) => {
        let dependencyCache = {};
        await Promise.all(
          Array.from(dependencySet).map(async filePath => {
            dependencyCache[filePath] = await this.getAsyncMTimeForFilePath(
              filePath
            );
          })
        );
        cacheJSON[name] = dependencyCache;
      })
    );

    return cacheJSON;
  }

  // Define the `apply` method
  apply(compiler) {
    compiler.hooks.compilation.tap('RebuildChangedEntrypointsPlugin', compilation => {
      const actualAddEntry = compilation.addEntry.bind(compilation);

      // Patch addEntry from compilation object with cache filter
      compilation.addEntry = (context, dep, name, done) => {
        // Check whether we have to rebuild entry
        if (this.hasToRebuildEntry(name, dep)) {
          // console.log(`Rebuild ${name}`);
          // Entry or dependencies have changed -> rebuild entry
          actualAddEntry(context, dep, name, done);
        } else {
          // No changes -> no need to rebuild
          done();
        }
      };
    });

    compiler.hooks.make.tapAsync(
      'RebuildChangedEntrypointsPlugin',
      (compilation, done) => {
        compilation.hooks.afterOptimizeChunks.tap(
          'RebuildChangedEntrypointsPlugin',
          (_, chunkGroups) => {
            // After chunkgroups for entrypoints are assembled, we want to cache them
            const entryPointInformation = [];

            chunkGroups.forEach(entryPoint => {
              // Use set to get rid of duplicate file paths
              const dependencySet = new Set();

              // For each entrypoint, go through all the dependencies and extract
              // file path (resource) of dependency
              entryPoint.runtimeChunk.getModules().forEach(module => {
                const identifier = module.identifier();

                // We only look into normal & external modules
                if (identifier.startsWith('external')) {
                  if (module.issuer.resource !== undefined)
                    dependencySet.add(module.issuer.resource);
                } else if (!identifier.startsWith('multi')) {
                  if (module.resource !== undefined)
                    dependencySet.add(module.resource);
                }
              });
              entryPointInformation.push({
                name: entryPoint.name,
                dependencySet,
              });
            });
            // Generate new cache based on entrypoints & their dependencies
            this.generateCache(entryPointInformation).then(cacheJSON => {
              fs.writeFile(
                path.join(this.options.cacheDirectory, CACHE_FILE_NAME),
                JSON.stringify(cacheJSON),
                'utf-8',
                err => {
                  if (err) {
                    console.error(err);
                  }
                }
              );
            });
          }
        );
        done();
      }
    );
  }
}

module.exports = ChangedFilesWebpackPlugin;
