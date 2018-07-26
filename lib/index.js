const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const logger = require('./logger');
const fsStat = promisify(fs.stat);

const CACHE_DIRECTORY = './.webpack-changed-plugin-cache';
const CACHE_FILE_NAME = '/cache.json';

// There also has to be an option to re-build everything based on
// variable supplied by options
// (E.g. think of rebuild based on process.env.theme)
class RebuildChangedWebpackPlugin {
  constructor({ cacheDirectory, logLevel = 'none' }) {
    logger.setLogLevel(logLevel);
    logger.log("Create RebuildChangedWebpackPlugin");
    this.cache = null;
    this.cachePath = path.join(cacheDirectory, CACHE_DIRECTORY);
    if (!fs.existsSync(this.cachePath)) {
      logger.log(`Cache directory does not exist. Create at ${this.cachePath}`);
      fs.mkdirSync(this.cachePath);
    }
  }

  getCache() {
    // If cache is not loaded yet, we try to load it
    if (!this.cache) {
      logger.log(
        `Try to load cache at ${path.join(this.cachePath, CACHE_FILE_NAME)}`
      );

      try {
        const data = fs.readFileSync(
          path.join(this.cachePath, CACHE_FILE_NAME),
          'utf-8'
        );
        this.cache = JSON.parse(data);
      } catch (err) {
        if (err.code === 'ENOENT') {
          logger.log('No cache file found');
          this.cache = {};
        } else throw err;
      }
    }

    return this.cache;
  }

  hasToRebuildEntry(entryName, entryDependency) {
    logger.log(`Rebuild ${entryName}?`);
    const cache = this.getCache();
    // No cached value for the entry -> we rebuild the entry
    if (!cache[entryName]) {
      logger.log(`Rebuild: No cache entry for ${entryName}`);
      return true;
    }

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
        logger.log(
          `Rebuild: Entryfile ${entryName} was modified: ${entryMTime} - ${
            cache[entryName][dependencyFile]
          }`
        );
        logger.log(`Changes in: ${dependencyFile}`);
        return true;
      }
    }

    // Check whether dependencies from entrypoint changed -> if yes: rebuild
    for (const dependencyFile of Object.keys(cache[entryName])) {
      const dependencyMTime = this.getSyncMTimeForFilePath(dependencyFile);
      if (dependencyMTime !== cache[entryName][dependencyFile]) {
        logger.log(
          `Rebuild: Dependency ${dependencyFile} was modified: ${dependencyMTime} - ${
            cache[entryName][dependencyFile]
          }`
        );
        return true;
      }
    }

    logger.log(`No Rebuild: No changes for dependencies of ${entryName}`);
    return false;
  }

  getSyncMTimeForFilePath(filePath) {
    // Get the last modified date for a specific file
    try {
      const stats = fs.statSync(filePath);

      return stats.mtime.getTime();
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.log('Could not get mTime: File not found!');
      } else throw err;

      return -1;
    }
  }

  async getAsyncMTimeForFilePath(filePath) {
    // Get the last modified date for a specific file
    try {
      const stats = await fsStat(filePath);

      return stats.mtime.getTime();
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.log('Could not get mTime: File not found!');
      } else throw err;

      return -1;
    }
  }

  async generateCache(entryPointInformation) {
    logger.log('Generate new cache');
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
        logger.log(`Rewrite cache for ${name}`);
        logger.log(`New dependency cache: ${JSON.stringify(dependencyCache)}`);
        cacheJSON[name] = dependencyCache;
      })
    );

    return cacheJSON;
  }

  // Define the `apply` method
  apply(compiler) {
    compiler.hooks.compilation.tap(
      'RebuildChangedEntrypointsPlugin',
      compilation => {
        // Reset cache
        this.cache = null;

        const actualAddEntry = compilation.addEntry.bind(compilation);

        // Patch addEntry from compilation object with cache filter
        compilation.addEntry = (context, dep, name, done) => {
          // Check whether we have to rebuild entry
          if (this.hasToRebuildEntry(name, dep)) {
            logger.log(`Rebuild ${name}`);
            // Entry or dependencies have changed -> rebuild entry
            actualAddEntry(context, dep, name, done);
          } else {
            // No changes -> no need to rebuild
            done();
          }
        };
      }
    );

    compiler.hooks.make.tapAsync(
      'RebuildChangedEntrypointsPlugin',
      (compilation, done) => {
        compilation.hooks.afterOptimizeChunks.tap(
          'RebuildChangedEntrypointsPlugin',
          (_, chunkGroups) => {
            // After chunkgroups for entrypoints are assembled, we want to cache them
            const entryPointInformation = [];

            chunkGroups.forEach(entryPoint => {
              // Use Set to get rid of duplicate file paths
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
            if (entryPointInformation.length > 0) {
              logger.log("At least one entrypoint changed: generate new cache");
              this.generateCache(entryPointInformation).then(cacheJSON => {
                logger.log('Write new cache to disk');
                fs.writeFile(
                  path.join(this.cachePath, CACHE_FILE_NAME),
                  JSON.stringify(cacheJSON),
                  'utf-8',
                  err => {
                    if (err) {
                      logger.error('Was not able to write cache file to disk');
                      logger.error(err);
                    }
                  }
                );
              });
            } else logger.log("No changes: Do not generate new cache");
          }
        );
        done();
      }
    );
  }
}

module.exports = RebuildChangedWebpackPlugin;
