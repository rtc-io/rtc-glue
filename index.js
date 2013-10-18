/* jshint node: true */
'use strict';

var qsa = require('cog/qsa');
var media = require('rtc/media');
var captureConfig = require('rtc-captureconfig');
var quickconnect = require('rtc-quickconnect');

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

  <<< examples/capture-only.html

  It is then possible to tweak the `getUserMedia` constraints using some
  flags in the `rtc-capture` attribute:

  <<< examples/capture-tweakres.html

  For those who prefer using separate attributes, you can achieve similar
  behaviour using the `rtc-resolution` (or `rtc-res`) attribute:

  <<< examples/res-attribute.html

  ## Getting Glue

  Primarily glue is designed for use in a standalone situation, and thus
  comes pre-packaged in a UMDjs
  [distribution](https://github.com/rtc-io/rtc-glue/tree/master/dist). If
  you prefer working with browserify, then it will still work quite nicely
  and you should just `npm install rtc-glue` like you would with other
  modules of the rtc.io suite.

  ## On Custom Attributes

  While we haven't 100% decided we are leaning towards the use of custom
  `rtc-*` attributes for influencing the behaviour of the `rtc-glue` library.
  While currently this is in violation with the HTML5 spec, it is an area
  of active discussion in W3C land (given [AngularJS](http://angularjs.org/)
  has adopted the `ng-*` attributes and is proving popular).

  ## Reference

  ### Element Attributes

  #### rtc-capture

  The presence of the `rtc-capture` attribute in a `video` or `audio` element
  indicates that it is a getUserMedia capture target.

  #### rtc-remote

  To be completed.

  ### Document Metadata

  In the `rtc-glue` library we use document level `<meta>` tags to provide
  glue with configuration information.  There are a number of configurable
  options, each which is used in the form of:

  ```html
  <meta name="rtc-%flagname%" content="config content" />
  ```

  #### rtc-room

  A custom room that new conversations will be created in.  If not specified
  this will default to a value of `auto`.

  #### rtc-role

  In some conference scenarios, different participants are assigned different
  roles (e.g. student/teacher, consultant/customer, etc).  By specifying the
  `rtc-role` metadata you this role information will be announced as part
  of the `rtc-quickconnect` initialization.

**/
var glue = module.exports = function(scope, opts) {
  // initialise the remote elements
  qsa('*[rtc-remote]', scope).forEach(initRemote);

  // initialise the capture elements
  qsa('*[rtc-capture]', scope).forEach(initCapture);
};

// autoload glue
if (typeof window != 'undefined') {
  window.addEventListener('load', function(evt) {
    glue();
  });
}

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