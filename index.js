/* jshint node: true */
'use strict';

var qsa = require('cog/qsa');
var media = require('rtc/media');
var captureConfig = require('rtc-captureconfig');

var reSep = /[\s\,]\s*/;
var selectorElements = '*[rtc-capture], *[rtc-remote]';

/**
  # rtc-glue

  Glue is a high-level approach to building WebRTC applications. It is
  primarily designed for web application coders who would prefer to spend
  their time in HTML and CSS rather than JS.

  ## Example Usage

  Glue works by looking for HTML tags that follow particular conventions
  with regards to named attributed, etc.  For instance, consider the
  following HTML:

  <<< examples/simple.html

**/
var glue = module.exports = function(scope, opts) {
  // initialise the remote elements
  qsa('*[rtc-remote]', scope).forEach(initRemote);

  // initialise the capture elements
  qsa('*[rtc-capture]', scope).forEach(initCapture);
};

/**
  ### initRemote(el) __internal__

  Handle the initialization of a rtc-remote target
**/
function initRemote(el) {
  console.log('initializing remote el: ', el);
}

/**
  ### initCapture(el) __internal__

  Handle the initialization of an rtc-capture target
**/
function initCapture(el) { 
  // read the capture instructions
  var configText = el.getAttribute('rtc-capture') || '';
  var res = el.getAttribute('rtc-resolution') || el.getAttribute('rtc-res');
  var fps = el.getAttribute('rtc-fps');

  res && (configText += ' min:' + res + ' max:' + res);
  fps && (configText += ' minfps:' + fps + ' maxfps:' + fps);

  // patch in a capture method to the element
  el.capture = enableCapture(el, captureConfig(configText));

  // trigger capture
  el.capture();
}

/** internal helpers */

function enableCapture(el, config) {
  return function(callback) {
    var stream = media({ constraints: config.toConstraints() });

    // render the stream to the target element
    stream.render(el);

    // emit a capture event through the element
    stream.on('capture', function(stream) {
      // dispatch the capture event
      el.dispatchEvent(new CustomEvent('capture', {
        detail: { stream: stream }
      }));

      // trigger the callback if one supplied
      if (typeof callback == 'function') {
        callback(stream);
      }
    });
  };
}