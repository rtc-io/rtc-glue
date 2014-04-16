/* jshint node: true */
/* global window: false */
/* global document: false */
/* global location: false */
/* global CustomEvent: false */
/* global io: false */
'use strict';

var async = require('async');
var url = require('url');
var qsa = require('fdom/qsa');
var meta = require('fdom/meta');
var extend = require('cog/extend');
var defaults = require('cog/defaults');
var debug = require('cog/logger')('rtc-glue');
var media = require('rtc-media');
var captureConfig = require('rtc-captureconfig');
var transform = require('sdp-transform');
var resetEl = require('rtc-core/reset');
// var liner = require('sdp-lines');

var reSep = /[\s\,]\s*/;
var reTrailingSlash = /\/$/;
var reSemiColonDelim = /\;\s*/;

var getSources = require('./lib/get-sources.js');
var capture = require('./lib/capture');

// initialise some query selectors
var SELECTOR_DC = 'meta[name="rtc-data"],meta[name="rtc-channel"]';

require('cog/logger').enable('rtc-glue');

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

  ## Conferencing Example

  The following is a simple example of conferencing using some hosted rtc.io
  signalling:

  <<< examples/conference-simple.html

  ## Getting Glue

  Primarily glue is designed for use in a standalone situation, and thus
  comes pre-packaged in a UMDjs
  [distribution](https://github.com/rtc-io/rtc-glue/tree/master/dist). If
  you prefer working with browserify, then it will still work quite nicely
  and you should just `npm install rtc-glue` like you would with other
  modules of the rtc.io suite.

  ## Running the Examples

  This module of the [rtc.io](https://rtc.io/) suite is a little different
  to others in that it comes with a ready to run js file.  Simply start
  a webserver in the root of the directory after cloning.  If you are looking
  for a good one, I'd recommend [st](https://github.com/isaacs/st).

  ## Targeted Media Capture

  The draft
  [Media Capture spec](http://dev.w3.org/2011/webrtc/editor/getusermedia.html)
  introduces the ability to query media devices on the machine.  This is
  currently available through the `MediaStreamTrack.getSources` function.

  If available then you can target the capture of a particular input device
  through the use of a numbered device capture specification.  For example:

  ```html
  <video rtc-capture="camera:1"></video>
  ```

  Would atttempt to capture the 2nd (0-indexed) camera available on the
  machine (if it is able to query devices).  The following is a larger
  example:

  <<< examples/capture-multicam.html

  ## On Custom Attributes

  While we haven't 100% decided we are leaning towards the use of custom
  `rtc-*` attributes for influencing the behaviour of the `rtc-glue` library.
  While currently this is in violation with the HTML5 spec, it is an area
  of active discussion in W3C land (given [AngularJS](http://angularjs.org/)
  has adopted the `ng-*` attributes and is proving popular).

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

  #### rtc-data

  From version `0.9` of glue you can also specify one or more `rtc-data` meta
  tags that are used to specify data channels that you want configured for
  your application.  When a connection is established between peers, the
  connections are created with the appropriate data channels.

  When the data channel is open and available for communication a
  `<channelname>:open` glue event is triggered (consistent with the behaviour
  of the [rtc-quickconnect](https://github.com/rtc-io/rtc-quickconnect))
  module.

  An example of using data channels is shown below:

  <<< examples/datachannel-events.html

  ## Reference

  ### Element Attributes

  #### rtc-capture

  The presence of the `rtc-capture` attribute in a `video` or `audio` element
  indicates that it is a getUserMedia capture target.

  #### rtc-peer

  To be completed.

**/
var glue = module.exports = function(qc, opts) {
  var debugTarget;
  var channels = qsa(SELECTOR_DC).map(readChannelConfig);
  var metadata = meta(/^rtc-(.*)$/);

  // initialise the scope (defaulting to document.body)
  var scope = (opts || {}).scope || document.body;

  // initialise the remote elements
  var peers = qsa('*[rtc-peer]', scope).map(initPeer(qc));

  // get sources
  getSources(function(sources) {
    async.map(qsa('*[rtc-capture]', scope), capture(sources), function(err, streams) {
      if (err) {
        return console.error(err);
      }

      // broadcast the stream
      streams.forEach(qc.addStream);
    });
  });

  // add the metadata to the profile
  if (metadata.role) {
    qc.profile({ role: metadata.role });
  }

  console.log(metadata);
};

/**
  ### Internal Functions
**/

function readChannelConfig(el) {
  var content = (el || {}).content || '';
  var params = content.split(reSemiColonDelim);

  return {
    name: params[0]
  };
}

function initPeer(qc) {
  return function(el) {
    var propValue = el.getAttribute('rtc-peer');
    var targetStream = el.getAttribute('rtc-stream');
    var peerRoles = propValue ? propValue.split(reSep) : [];

    // create a data container that we will attach to the element
    if (! el._rtc) {
      el._rtc = {};
    }

    function attachStream(stream) {
      debug('attaching stream');
      media(stream).render(el);
      el._rtc.streamId = stream.id;
    }

    function addStream(stream, peer) {
      // if we don't have a stream or already have a stream id then bail
      if (el._rtc.streamId) {
        return;
      }

      // if we have a particular target stream, then go looking for it
      if (targetStream) {
        debug('requesting stream data');
        // sessionMgr.getStreamData(stream, function(data) {
        //   debug('got stream data', data);

        //   // if it's a match, then attach
        //   if (data && data.name === targetStream) {
        //     attachStream(stream);
        //   }
        // });
      }
      // otherwise, automatically associate with the element
      else {
        attachStream(stream);
      }
    }

    qc.on('call:started', function(id, pc, data) {
      var roleIdx = peerRoles.indexOf(data.role);
      debug('call started with peer: ' + id + ', checking element carefactor', data);

      // if we don't have a valid role, and required one then do nothing
      if (roleIdx < 0 && peerRoles.length !== 0) {
        return;
      }

      // if the element already has a peer, then do nothing
      if (el._rtc.peerId) {
        return;
      }

      debug('peer active', pc.getRemoteStreams());

      // associate the peer id with the element
      el._rtc.peerId = id;


      // add existing streams
      pc.getRemoteStreams().forEach(addStream);
    });

    qc.on('call:ended', function(id) {
      debug('captured call:ended for peer: ' + id);
      if (el._rtc.peerId === id) {
        // reset the target media element
        resetEl(el);

        // reset the rtc data
        el._rtc = {};
      }
    });

    return el;
  };
}


/** internal helpers */

function generateRoomName() {
  location.hash = Math.pow(2, 53) * Math.random();

  return location.hash.slice(1);
}
