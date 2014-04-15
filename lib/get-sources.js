var canGetSources = typeof MediaStreamTrack != 'undefined' &&
  typeof MediaStreamTrack.getSources == 'function';

module.exports = function(callback) {
  if (! canGetSources) {
    return callback();
  }

  // otherwise get media sources
  MediaStreamTrack.getSources(callback);
};