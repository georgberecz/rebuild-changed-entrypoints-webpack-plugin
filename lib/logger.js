/* eslint-disable no-console */

let logLevel = 'none';

function log(data) {
  if (logLevel === 'debug') console.log(data);
}

function error(data) {
  if (logLevel === 'debug' || logLevel === 'error') console.error(data);
}

function setLogLevel(level) {
  logLevel = level;
}

module.exports = {
  setLogLevel,
  log,
  error,
};
