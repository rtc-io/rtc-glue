/* jshint node: true */
'use strict';

var media = require('rtc-media');
var captureConfig = require('rtc-captureconfig');

module.exports = function(sources) {
  return function(el, callback) {
    // read the capture instructions
    var configText = el.getAttribute('rtc-capture') || '';
    var res = el.getAttribute('rtc-resolution') || el.getAttribute('rtc-res');
    var fps = el.getAttribute('rtc-fps');
    var constraints;

    if (res) {
      configText += ' min:' + res + ' max:' + res;
    }

    if (fps) {
      configText += ' minfps:' + fps + ' maxfps:' + fps;
    }

    // generate the constraints with capture config
    constraints = captureConfig(configText).toConstraints({ sources: sources });

    // capture media
    media({ constraints: constraints })
      // handle events
      .on('error', callback)
      .on('capture', function(stream) {
        callback(null, stream);
      })
      // render to the target element
      .render(el);
  };
}