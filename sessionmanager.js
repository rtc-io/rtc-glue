/* jshint node: true */
/* global io: false */
'use strict';

var eve = require('eve');
var EventEmitter = require('events').EventEmitter;
var rtc = require('rtc');
var debug = require('cog/logger')('glue-sessionmanager');
var createSignaller = require('rtc-signaller');
var extend = require('cog/extend');
var util = require('util');

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

  EventEmitter.call(this);

  // initialise the room and our role
  this.room = config.room;
  this.role = config.role;

  // save the config
  this.cfg = config;

  // initialise our peers list
  this.peers = {};

  // initialise the streams data list
  this.streams = {};

  // initialise the session manager to expect at least one stream
  this.streamCount = config.streamcount;
  this.streamReadyCount = 0;

  // create our underlying socket connection
  this.socket = new Primus(config.signalhost);
  this.socket.on('open', this.emit.bind(this, 'active'));

  // initialise the channels configuration
  this.channels = [].concat(config.channels || []);

  // create our signalling interface
  this.signaller = createSignaller(this.socket);

  // hook up signaller events
  this._bindEvents(this.signaller, config);
}

module.exports = SessionManager;
util.inherits(SessionManager, EventEmitter);

/**
  #### announce()

  Announce ourselves on the signalling channel
**/
SessionManager.prototype.announce = function(targetId) {
  var scope = targetId ? this.signaller.to(targetId) : this.signaller;

  debug('announcing self to: ' + (targetId || 'all'));
  scope.announce({ room: this.room, role: this.role });
};

/**
  #### broadcast(stream)

  Broadcast a stream to our connected peers.

**/
SessionManager.prototype.broadcast = function(stream, data) {
  var peers = this.peers;
  var mgr = this;

  function connectPeer(peer, peerId) {
    mgr.tagStream(stream, peerId, data);

    try {
      peer.addStream(stream);
    }
    catch (e) {
      debug('captured error attempting to add stream: ', e);
    }

    // if the streams ready === the stream count then connect
    debug('checking stream ready count ok: ', mgr.streamReadyCount === mgr.streamCount, mgr.streamCount, mgr.streamReadyCount);
    if (mgr.streamReadyCount === mgr.streamCount) {
      mgr._sendReady(peerId);
      mgr._connectWhenReady(peerId);
    }
  }

  // increment the stream ready count
  this.streamReadyCount += 1;

  // add to existing streams
  debug('broadcasting stream ' + stream.id + ' to existing peers');
  Object.keys(peers).forEach(function(peerId) {
    if (peers[peerId]) {
      debug('broadcasting to peer: ' + peerId);
      connectPeer(peers[peerId], peerId);
    }
  });

  // when a new peer arrives, add it to that peer also
  eve.on('glue.peer.join', function(peer, peerId) {
    debug('peer ' + peerId + ' joined, connecting to stream: ' + stream.id);

    connectPeer(peer, peerId);
  });

  // when the stream ends disconnect the listener
  // TODO: use addEventListener once supported
  stream.onended = function() {
    eve.off('glue.peer.join', connectPeer);
  };
};

/**
  #### getStreamData(stream, callback)

  Given the input stream `stream`, return the data for the stream.  The
  provided `callback` will not be called until relevant data is held by
  the session manager.

**/
SessionManager.prototype.getStreamData = function(stream, callback) {
  var id = stream && stream.id;
  var data = this.streams[id];

  // if we don't have an id, then abort
  if (! id) {
    return;
  }

  // if we have data already, return it
  if (data) {
    callback(data);
  }
  // otherwise, wait for the data to be created
  else {
    eve.once('glue.streamdata.' + id, callback);
  }
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

SessionManager.prototype._bindEvents = function(signaller, opts) {
  var mgr = this;

  // TODO: extract the meaningful parts from the config
  // var opts = this.cfg;
  debug('initializing event handlers');

  // when we get a ready message, flag that the peer that sent that
  // message is ready to connect
  signaller.on('peer:ready', function(srcData) {
    // flag the peer as ready
    (mgr.peers[srcData && srcData.id] || {})._ready = true;

    // connect when ready
    mgr._connectWhenReady(srcData.id);
  });

  signaller.on('peer:announce', function(data) {
    var ns = 'glue.peer.join.' + (data.role || 'none')
    var peer;
    var monitor;

    // if the room does not match our room
    // OR, we already have an active peer for that id, then abort
    debug('captured announce event for peer: ' + data.id);
    if (data.room !== mgr.room) {
      return debug('received announce for incorrect room');
    }

    if (mgr.peers[data.id]) {
      return debug('known peer');
    }

    // create our peer connection
    peer = mgr.peers[data.id] = rtc.createConnection(
      opts,
      opts.constraints
    );

    // initialise the peer ready flag as false
    peer._ready = false;

    // tag the peer with the announce role
    peer._role = data.role || 'none';

    // if we are working in a 0 streams environment, then send ready immediately
    if (mgr.streamCount === 0) {
      mgr._sendReady(data.id);
    }

    eve('glue.peer.join.' + peer._role, null, peer, data.id);
  });

  signaller.on('peer:leave', function(id) {
    // get the peer
    var peer = mgr.peers[id];
    debug('captured leave event for peer: ' + id);

    // if this is a peer we know about, then close and send a notification
    if (peer) {
      peer.close();
      mgr.peers[id] = undefined;

      // trigger the notification
      eve('glue.peer.leave', null, peer, id);
    }
  });

  signaller.on('streamdata', function(data, src) {
    // save the stream data to the local stream
    mgr.streams[data.id] = data;
    eve('glue.streamdata.' + data.id, null, data);
  });
};

SessionManager.prototype._connectWhenReady = function(peerId) {
  var isMaster = this.signaller.isMaster(peerId);
  var peer = this.peers[peerId];
  var monitor;

  if (peer && peer._ready && this.streamReadyCount === this.streamCount) {
    // create data channels if master
    if (isMaster) {
      this.channels.forEach(this._initChannel.bind(this, peerId));
    }
    else {
      peer.ondatachannel = this._handleDataChannel.bind(this, peerId);
    }

    // couple the connections
    monitor = rtc.couple(peer, peerId, this.signaller, this.cfg);

    // wait for the monitor to tell us we have an active connection
    // before attempting to bind to any UI elements
    monitor.once('active', function() {
      eve('glue.peer.active.' + peer._role, null, peer, peerId);
    });

    // if we are the master, then create the offer
    if (this.signaller.isMaster(peerId)) {
      monitor.createOffer();
    }
  }

  return monitor;
};

SessionManager.prototype._initChannel = function(peerId, config) {
  var peer = this.peers[peerId];

  // TODO: handle more complicated args
  return this._monitorChannel(peer.createDataChannel(config.name), peerId);
};

SessionManager.prototype._handleDataChannel = function(peerId, evt) {
  this._monitorChannel(evt.channel, peerId);
};

SessionManager.prototype._monitorChannel = function(channel, peerId) {
  // create the channelOpen function
  var emitChannelOpen = function() {
    eve('glue.' + channel.label + ':open', null, channel, peerId);
  };

  debug('channel ' + channel.label + ' discovered for peer: ' + peerId, channel);
  if (channel.readyState === 'open') {
    return emitChannelOpen();
  }

  channel.onopen = emitChannelOpen;
};

SessionManager.prototype._sendReady = function(peerId) {
  var peer = this.peers[peerId];

  // if this is an unknown peer, then abort
  if (! peer) {
    return;
  }

  // send the ready flag
  debug('sending ready signal to: ' + peerId);
  this.signaller.to(peerId).send('/peer:ready');
};