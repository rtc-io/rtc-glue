/* jshint node: true */
/* global io: false */
'use strict';

var eve = require('eve');
var rtc = require('rtc');
var createSignaller = require('rtc/signaller');
var extend = require('cog/extend');

/**
  ### SessionManager

  The SessionManager class assists with interacting with the signalling
  server and creating peer connections between valid parties.  It uses
  eve to create a decoupled way to get peer information.

**/
function SessionManager(config) {
  if (! (this instanceof SessionManager)) {
    return new SessionManager(config);
  }

  // initialise the room and our role
  this.room = config.room;
  this.role = config.role;

  // save the config
  this.cfg = config;

  // initialise our peers list
  this.peers = {};

  // create our underlying socket connection
  this.socket = new Primus(config.signalhost);

  // create our signalling interface
  this.signaller = createSignaller(this.socket);

  // hook up signaller events
  this._bindEvents(this.signaller);
}

module.exports = SessionManager;

/**
  #### announce()

  Announce ourselves on the signalling channel
**/
SessionManager.prototype.announce = function() {
  this.signaller.announce({ room: this.room, role: this.role });
};

/**
  #### broadcast(stream)

  Broadcast a stream to our connected peers.

**/
SessionManager.prototype.broadcast = function(stream, data) {
  var peers = this.peers;
  var mgr = this;

  // add to existing streams
  console.log(Object.keys(peers));
  Object.keys(peers).forEach(function(peerId) {
    mgr.tagStream(stream, peerId, data);
    peers[peerId].addStream(stream);
  });

  // when a new peer arrives, add it to that peer also
  eve.on('glue.peer.join', function(peer, peerId) {
    console.log('peer joined: ' + peerId);

    mgr.tagStream(stream, peerId, data);
    peer.addStream(stream);
  });
};

/**
  #### tagStream(stream, targetId, data)

  The tagStream is used to pass stream identification information along to the
  target peer.  This information is useful when a particular remote media
  element is expecting the contents of a particular capture target.

**/
SessionManager.prototype.tagStream = function(stream, targetId, data) {
  this.signaller.to(targetId).send('/streamdata', extend({}, data, {
    id: stream.id,
    label: stream.label
  }));
};

/* internal methods */

SessionManager.prototype._bindEvents = function(signaller) {
  var mgr = this;

  // TODO: extract the meaningful parts from the config
  // var opts = this.cfg;

  signaller.on('announce', function(data) {
    var ns = 'glue.peer.join.' + (data.role || 'none')
    var peer;
    var monitor;

    // if the room does not match our room
    // OR, we already have an active peer for that id, then abort
    if (data.room !== mgr.room) {
      return console.log('received announce for incorrect room');
    }

    if (mgr.peers[data.id]) {
      return console.log('known peer');
    }

    console.log('received announce');

    // create our peer connection
    peer = mgr.peers[data.id] = rtc.createConnection();

    // couple the connections
    monitor = rtc.couple(peer, { id: data.id }, signaller);

    // wait for the monitor to tell us we have an active connection
    // before attempting to bind to any UI elements
    monitor.once('active', function() {
      eve('glue.peer.active.' + (data.role || 'none'), null, peer, data.id);
    });

    eve('glue.peer.join.' + (data.role || 'none'), null, peer, data.id);

    // announce ourself
    mgr.announce();
  });

  signaller.on('leave', function(id) {
    // get the peer
    var peer = mgr.peers[id];

    // if this is a peer we know about, then close and send a notification
    if (peer) {
      peer.close();
      mgr.peers[id] = undefined;

      // trigger the notification
      eve('glue.peer.leave', null, peer, id);
    }
  });

  signaller.on('streamdata', function(data) {
    console.log('got stream data', data, arguments);
  });
};