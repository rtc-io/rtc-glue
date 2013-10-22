/* jshint node: true */
'use strict';

var eve = require('eve');
var quickconnect = require('rtc-quickconnect');
var sessions = {};

/**
  ### sessionmanager

  Session management for a glue application.
**/

/**
  #### createSession()
**/
var createSession = exports.createSession = function() {
  // TODO: check metadata for options
  var session = quickconnect({
    sdpfilter: function(sdpText, conn, type) {
      // parse the sdp into a JSON representation
      var sdp = liner(sdpText);
      // var sdp = transform.parse(sdpText);

      // trigger the sdp transformation pipeline,
      // pass by reference so a bit hacky
      eve('glue.sdp.' + type, null, sdp, conn, type);

      // send back the sdp data
      return sdp.toString(); // transform.write(sdp, { outerOrder: ['v', 'o', 's', 't', 'i', 'u', 'e', 'p', 'c', 'b', 'z', 'a', 'r'] });
    }
  });

  return session;
}

/**
  #### getOrCreateSession(remoteId)
**/
exports.getOrCreateSession = function(remoteId) {

};