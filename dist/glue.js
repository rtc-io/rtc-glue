!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.glue=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* jshint node: true */
'use strict';

var eve = require('eve');
var rePrefixed = /^glue\./;

/**
  ## Events

  Glue uses [eve](https://github.com/adobe-webplatform/eve) under the hood,
  and exposes a simple interface to eve events through the `glue.events`
  interface.

  If using eve directly these events are namespaced with the prefix of
  `glue.` to avoid event name clashes on the bus, but you can use the
  `glue.events` endpoint to attach to eve without the namespace if you prefer.

  For example:

  <<< examples/event-namespacing.js

**/
['on', 'once', 'off'].forEach(function(method) {
  exports[method] = function(name, handler) {
    if (! rePrefixed.test(name)) {
      name = 'glue.' + name;
    }

    // register the handler
    eve[method](name, handler);
  };
});
},{"eve":7}],2:[function(require,module,exports){
/* jshint node: true */
/* global window: false */
/* global document: false */
/* global location: false */
/* global CustomEvent: false */
/* global io: false */
'use strict';

var async = require('async');
var url = require('url');
var eve = require('eve');
var qsa = require('fdom/qsa');
var on = require('fdom/on');
var extend = require('cog/extend');
var defaults = require('cog/defaults');
var logger = require('cog/logger');
var debug = logger('glue');
var signaller = require('rtc-signaller');
var media = require('rtc-media');
var captureConfig = require('rtc-captureconfig');
var transform = require('sdp-transform');
var resetEl = require('rtc-core/reset');
// var liner = require('sdp-lines');

var reSep = /[\s\,]\s*/;
var reTrailingSlash = /\/$/;
var canGetSources = typeof MediaStreamTrack != 'undefined' &&
  MediaStreamTrack.getSources;

// initialise our config (using rtc- named metadata tags)
var config = defaults({}, require('fdom/meta')(/^rtc-(.*)$/), {
  room: location.hash.slice(1),
  signalhost: location.origin || 'http://rtc.io/switchboard/'
});

var SessionManager = require('./sessionmanager');
var sessionMgr;
var sources;

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

  ## Reference

  ### Element Attributes

  #### rtc-capture

  The presence of the `rtc-capture` attribute in a `video` or `audio` element
  indicates that it is a getUserMedia capture target.

  #### rtc-peer

  To be completed.

**/
var glue = module.exports = function(scope, opts) {
  var startupOps = [];
  var debugTarget;

  // initialise the remote elements
  var peers = qsa('*[rtc-peer]', scope).map(initPeer);

  // if we have peers, then we are going to need primus
  if (peers.length > 0) {
    startupOps.push(loadPrimus);
  }

  // apply any external opts to the configuration
  extend(config, opts);

  // determine if we are debugging
  debugTarget = (config || {}).debug;
  if (debugTarget) {
    if (debugTarget === true) {
      logger.enable('*');
    }
    else if (Array.isArray(debugTarget)) {
      logger.enable.apply(logger, debugTarget);
    }
    else {
      logger.enable(debugTarget);
    }
  }

  // run the startup operations
  async.parallel(startupOps, function(err) {
    // TODO: check errors
    debug('startup ops completed, starting glue', config);
    eve('glue.ready');

    // if we don't have a room name, generate a room name
    if (! config.room) {
      config.room = generateRoomName();
    }

    // create the session manager
    sessionMgr = typeof Primus != 'undefined' && new SessionManager(config);

    if (sessionMgr) {
      sessionMgr.once('active', function() {
        qsa('*[rtc-capture]', scope).forEach(initCapture);

        // if we have any peers, then announce ourselves via the session manager
        if (peers.length > 0) {
          sessionMgr.announce();
        }

        // trigger a glue session active event
        eve('glue.connected', null, sessionMgr.signaller, sessionMgr);
      });
    }
    else {
      qsa('*[rtc-capture]', scope).forEach(initCapture);
    }
  });
};

// wire in the events helper
glue.events = require('./events');

// expose the config through glue
glue.config = config;

// autoload glue
if (typeof window != 'undefined') {
  on('load', window, function() {
    // check if we can autoload
    if (config.autoload === undefined || config.autoload) {
      glue();
    }
  });
}

/**
  ### Internal Functions
**/

/**
  #### initPeer(el)

  Handle the initialization of a rtc-remote target
**/
function initPeer(el) {
  var propValue = el.getAttribute('rtc-peer');
  var targetStream = el.getAttribute('rtc-stream');
  var peerRoles = propValue ? propValue.split(reSep) : ['*'];

  // create a data container that we will attach to the element
  var data = el._rtc || (el._rtc = {});

  function attachStream(stream) {
    debug('attaching stream');
    media(stream).render(el);
    data.streamId = stream.id;
  }

  function addStream(stream, peer) {
    // if we don't have a stream or already have a stream id then bail
    if (data.streamId) {
      return;
    }

    // if we have a particular target stream, then go looking for it
    if (targetStream) {
      debug('requesting stream data');
      sessionMgr.getStreamData(stream, function(data) {
        debug('got stream data', data);

        // if it's a match, then attach
        if (data && data.name === targetStream) {
          attachStream(stream);
        }
      });
    }
    // otherwise, automatically associate with the element
    else {
      attachStream(stream);
    }
  }

  // iterate through the peers and monitor events for that peer
  peerRoles.forEach(function(role) {
    eve.on('glue.peer.active.' + role, function(peer, peerId) {
      // if the element already has a peer, then do nothing
      if (data.peerId) {
        return;
      }

      debug('peer active', peer.getRemoteStreams());

      // associate the peer id with the element
      data.peerId = peerId;

      // add existing streams
      [].slice.call(peer.getRemoteStreams()).forEach(addStream);

      // listen for add straem events
      peer.addEventListener('addstream', function(evt) {
        addStream(evt.stream, peer);
      });
    });
  });

  eve.on('glue.peer.leave', function(peer, peerId) {
    // if the peer leaving matches the remote peer, then cleanup
    if (data.peerId === peerId) {
      // reset the target media element
      resetEl(el);

      // reset the rtc data
      data = el._rtc = {};
    }
  });

  return el;
}

/**
  #### initCapture(el)

  Handle the initialization of an rtc-capture target
**/
function initCapture(el) {
  // read the capture instructions
  var configText = el.getAttribute('rtc-capture') || '';
  var res = el.getAttribute('rtc-resolution') || el.getAttribute('rtc-res');
  var fps = el.getAttribute('rtc-fps');

  if (res) {
    configText += ' min:' + res + ' max:' + res;
  }

  if (fps) {
    configText += ' minfps:' + fps + ' maxfps:' + fps;
  }

  // patch in a capture method to the element
  el.capture = enableCapture(el, captureConfig(configText));

  // trigger capture
  el.capture(function(stream) {
    // broadcast the stream through the session manager
    if (sessionMgr) {
      sessionMgr.broadcast(stream, { name: el.id });
    }
  });
}

/** internal helpers */

function enableCapture(el, config) {

  function cap(callback) {
    var stream = media({
      constraints: config.toConstraints({
        sources: sources
      })
    });

    // render the stream to the target element
    stream.render(el);

    // capture and report errors
    stream.on('error', function(err) {
      console.log(
        'Error attempting to capture media, requested constraints',
        stream.constraints
      );
    });

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
  }

  return function(callback) {
    // if we already have sources, or cannot get source information
    // then skip straight to capture
    if (sources || (! canGetSources)) {
      return cap(callback);
    }

    // get and update sources
    MediaStreamTrack.getSources(function(s) {
      // update the sources
      sources = s;

      // capture
      cap(callback)
    });
  };
}

function generateRoomName() {
  location.hash = Math.pow(2, 53) * Math.random();

  return location.hash.slice(1);
}

function loadPrimus(callback) {
  return signaller.loadPrimus(config.signalhost, callback);
}
},{"./events":1,"./sessionmanager":58,"async":3,"cog/defaults":4,"cog/extend":5,"cog/logger":6,"eve":7,"fdom/meta":8,"fdom/on":9,"fdom/qsa":10,"rtc-captureconfig":11,"rtc-core/reset":13,"rtc-media":14,"rtc-signaller":20,"sdp-transform":54,"url":67}],3:[function(require,module,exports){
var process=require("__browserify_process");/*global setImmediate: false, setTimeout: false, console: false */
(function () {

    var async = {};

    // global on the server, window in the browser
    var root, previous_async;

    root = this;
    if (root != null) {
      previous_async = root.async;
    }

    async.noConflict = function () {
        root.async = previous_async;
        return async;
    };

    function only_once(fn) {
        var called = false;
        return function() {
            if (called) throw new Error("Callback was already called.");
            called = true;
            fn.apply(root, arguments);
        }
    }

    //// cross-browser compatiblity functions ////

    var _each = function (arr, iterator) {
        if (arr.forEach) {
            return arr.forEach(iterator);
        }
        for (var i = 0; i < arr.length; i += 1) {
            iterator(arr[i], i, arr);
        }
    };

    var _map = function (arr, iterator) {
        if (arr.map) {
            return arr.map(iterator);
        }
        var results = [];
        _each(arr, function (x, i, a) {
            results.push(iterator(x, i, a));
        });
        return results;
    };

    var _reduce = function (arr, iterator, memo) {
        if (arr.reduce) {
            return arr.reduce(iterator, memo);
        }
        _each(arr, function (x, i, a) {
            memo = iterator(memo, x, i, a);
        });
        return memo;
    };

    var _keys = function (obj) {
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                keys.push(k);
            }
        }
        return keys;
    };

    //// exported async module functions ////

    //// nextTick implementation with browser-compatible fallback ////
    if (typeof process === 'undefined' || !(process.nextTick)) {
        if (typeof setImmediate === 'function') {
            async.nextTick = function (fn) {
                // not a direct alias for IE10 compatibility
                setImmediate(fn);
            };
            async.setImmediate = async.nextTick;
        }
        else {
            async.nextTick = function (fn) {
                setTimeout(fn, 0);
            };
            async.setImmediate = async.nextTick;
        }
    }
    else {
        async.nextTick = process.nextTick;
        if (typeof setImmediate !== 'undefined') {
            async.setImmediate = setImmediate;
        }
        else {
            async.setImmediate = async.nextTick;
        }
    }

    async.each = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        _each(arr, function (x) {
            iterator(x, only_once(function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback(null);
                    }
                }
            }));
        });
    };
    async.forEach = async.each;

    async.eachSeries = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        var iterate = function () {
            iterator(arr[completed], function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback(null);
                    }
                    else {
                        iterate();
                    }
                }
            });
        };
        iterate();
    };
    async.forEachSeries = async.eachSeries;

    async.eachLimit = function (arr, limit, iterator, callback) {
        var fn = _eachLimit(limit);
        fn.apply(null, [arr, iterator, callback]);
    };
    async.forEachLimit = async.eachLimit;

    var _eachLimit = function (limit) {

        return function (arr, iterator, callback) {
            callback = callback || function () {};
            if (!arr.length || limit <= 0) {
                return callback();
            }
            var completed = 0;
            var started = 0;
            var running = 0;

            (function replenish () {
                if (completed >= arr.length) {
                    return callback();
                }

                while (running < limit && started < arr.length) {
                    started += 1;
                    running += 1;
                    iterator(arr[started - 1], function (err) {
                        if (err) {
                            callback(err);
                            callback = function () {};
                        }
                        else {
                            completed += 1;
                            running -= 1;
                            if (completed >= arr.length) {
                                callback();
                            }
                            else {
                                replenish();
                            }
                        }
                    });
                }
            })();
        };
    };


    var doParallel = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.each].concat(args));
        };
    };
    var doParallelLimit = function(limit, fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [_eachLimit(limit)].concat(args));
        };
    };
    var doSeries = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.eachSeries].concat(args));
        };
    };


    var _asyncMap = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (err, v) {
                results[x.index] = v;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    };
    async.map = doParallel(_asyncMap);
    async.mapSeries = doSeries(_asyncMap);
    async.mapLimit = function (arr, limit, iterator, callback) {
        return _mapLimit(limit)(arr, iterator, callback);
    };

    var _mapLimit = function(limit) {
        return doParallelLimit(limit, _asyncMap);
    };

    // reduce only has a series version, as doing reduce in parallel won't
    // work in many situations.
    async.reduce = function (arr, memo, iterator, callback) {
        async.eachSeries(arr, function (x, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    };
    // inject alias
    async.inject = async.reduce;
    // foldl alias
    async.foldl = async.reduce;

    async.reduceRight = function (arr, memo, iterator, callback) {
        var reversed = _map(arr, function (x) {
            return x;
        }).reverse();
        async.reduce(reversed, memo, iterator, callback);
    };
    // foldr alias
    async.foldr = async.reduceRight;

    var _filter = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.filter = doParallel(_filter);
    async.filterSeries = doSeries(_filter);
    // select alias
    async.select = async.filter;
    async.selectSeries = async.filterSeries;

    var _reject = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (!v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.reject = doParallel(_reject);
    async.rejectSeries = doSeries(_reject);

    var _detect = function (eachfn, arr, iterator, main_callback) {
        eachfn(arr, function (x, callback) {
            iterator(x, function (result) {
                if (result) {
                    main_callback(x);
                    main_callback = function () {};
                }
                else {
                    callback();
                }
            });
        }, function (err) {
            main_callback();
        });
    };
    async.detect = doParallel(_detect);
    async.detectSeries = doSeries(_detect);

    async.some = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (v) {
                    main_callback(true);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(false);
        });
    };
    // any alias
    async.any = async.some;

    async.every = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (!v) {
                    main_callback(false);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(true);
        });
    };
    // all alias
    async.all = async.every;

    async.sortBy = function (arr, iterator, callback) {
        async.map(arr, function (x, callback) {
            iterator(x, function (err, criteria) {
                if (err) {
                    callback(err);
                }
                else {
                    callback(null, {value: x, criteria: criteria});
                }
            });
        }, function (err, results) {
            if (err) {
                return callback(err);
            }
            else {
                var fn = function (left, right) {
                    var a = left.criteria, b = right.criteria;
                    return a < b ? -1 : a > b ? 1 : 0;
                };
                callback(null, _map(results.sort(fn), function (x) {
                    return x.value;
                }));
            }
        });
    };

    async.auto = function (tasks, callback) {
        callback = callback || function () {};
        var keys = _keys(tasks);
        if (!keys.length) {
            return callback(null);
        }

        var results = {};

        var listeners = [];
        var addListener = function (fn) {
            listeners.unshift(fn);
        };
        var removeListener = function (fn) {
            for (var i = 0; i < listeners.length; i += 1) {
                if (listeners[i] === fn) {
                    listeners.splice(i, 1);
                    return;
                }
            }
        };
        var taskComplete = function () {
            _each(listeners.slice(0), function (fn) {
                fn();
            });
        };

        addListener(function () {
            if (_keys(results).length === keys.length) {
                callback(null, results);
                callback = function () {};
            }
        });

        _each(keys, function (k) {
            var task = (tasks[k] instanceof Function) ? [tasks[k]]: tasks[k];
            var taskCallback = function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                if (err) {
                    var safeResults = {};
                    _each(_keys(results), function(rkey) {
                        safeResults[rkey] = results[rkey];
                    });
                    safeResults[k] = args;
                    callback(err, safeResults);
                    // stop subsequent errors hitting callback multiple times
                    callback = function () {};
                }
                else {
                    results[k] = args;
                    async.setImmediate(taskComplete);
                }
            };
            var requires = task.slice(0, Math.abs(task.length - 1)) || [];
            var ready = function () {
                return _reduce(requires, function (a, x) {
                    return (a && results.hasOwnProperty(x));
                }, true) && !results.hasOwnProperty(k);
            };
            if (ready()) {
                task[task.length - 1](taskCallback, results);
            }
            else {
                var listener = function () {
                    if (ready()) {
                        removeListener(listener);
                        task[task.length - 1](taskCallback, results);
                    }
                };
                addListener(listener);
            }
        });
    };

    async.waterfall = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor !== Array) {
          var err = new Error('First argument to waterfall must be an array of functions');
          return callback(err);
        }
        if (!tasks.length) {
            return callback();
        }
        var wrapIterator = function (iterator) {
            return function (err) {
                if (err) {
                    callback.apply(null, arguments);
                    callback = function () {};
                }
                else {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var next = iterator.next();
                    if (next) {
                        args.push(wrapIterator(next));
                    }
                    else {
                        args.push(callback);
                    }
                    async.setImmediate(function () {
                        iterator.apply(null, args);
                    });
                }
            };
        };
        wrapIterator(async.iterator(tasks))();
    };

    var _parallel = function(eachfn, tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            eachfn.map(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            eachfn.each(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.parallel = function (tasks, callback) {
        _parallel({ map: async.map, each: async.each }, tasks, callback);
    };

    async.parallelLimit = function(tasks, limit, callback) {
        _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
    };

    async.series = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            async.mapSeries(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            async.eachSeries(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.iterator = function (tasks) {
        var makeCallback = function (index) {
            var fn = function () {
                if (tasks.length) {
                    tasks[index].apply(null, arguments);
                }
                return fn.next();
            };
            fn.next = function () {
                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
            };
            return fn;
        };
        return makeCallback(0);
    };

    async.apply = function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function () {
            return fn.apply(
                null, args.concat(Array.prototype.slice.call(arguments))
            );
        };
    };

    var _concat = function (eachfn, arr, fn, callback) {
        var r = [];
        eachfn(arr, function (x, cb) {
            fn(x, function (err, y) {
                r = r.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, r);
        });
    };
    async.concat = doParallel(_concat);
    async.concatSeries = doSeries(_concat);

    async.whilst = function (test, iterator, callback) {
        if (test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.whilst(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doWhilst = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            if (test()) {
                async.doWhilst(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.until = function (test, iterator, callback) {
        if (!test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.until(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doUntil = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            if (!test()) {
                async.doUntil(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.queue = function (worker, concurrency) {
        if (concurrency === undefined) {
            concurrency = 1;
        }
        function _insert(q, data, pos, callback) {
          if(data.constructor !== Array) {
              data = [data];
          }
          _each(data, function(task) {
              var item = {
                  data: task,
                  callback: typeof callback === 'function' ? callback : null
              };

              if (pos) {
                q.tasks.unshift(item);
              } else {
                q.tasks.push(item);
              }

              if (q.saturated && q.tasks.length === concurrency) {
                  q.saturated();
              }
              async.setImmediate(q.process);
          });
        }

        var workers = 0;
        var q = {
            tasks: [],
            concurrency: concurrency,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
              _insert(q, data, false, callback);
            },
            unshift: function (data, callback) {
              _insert(q, data, true, callback);
            },
            process: function () {
                if (workers < q.concurrency && q.tasks.length) {
                    var task = q.tasks.shift();
                    if (q.empty && q.tasks.length === 0) {
                        q.empty();
                    }
                    workers += 1;
                    var next = function () {
                        workers -= 1;
                        if (task.callback) {
                            task.callback.apply(task, arguments);
                        }
                        if (q.drain && q.tasks.length + workers === 0) {
                            q.drain();
                        }
                        q.process();
                    };
                    var cb = only_once(next);
                    worker(task.data, cb);
                }
            },
            length: function () {
                return q.tasks.length;
            },
            running: function () {
                return workers;
            }
        };
        return q;
    };

    async.cargo = function (worker, payload) {
        var working     = false,
            tasks       = [];

        var cargo = {
            tasks: tasks,
            payload: payload,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
                if(data.constructor !== Array) {
                    data = [data];
                }
                _each(data, function(task) {
                    tasks.push({
                        data: task,
                        callback: typeof callback === 'function' ? callback : null
                    });
                    if (cargo.saturated && tasks.length === payload) {
                        cargo.saturated();
                    }
                });
                async.setImmediate(cargo.process);
            },
            process: function process() {
                if (working) return;
                if (tasks.length === 0) {
                    if(cargo.drain) cargo.drain();
                    return;
                }

                var ts = typeof payload === 'number'
                            ? tasks.splice(0, payload)
                            : tasks.splice(0);

                var ds = _map(ts, function (task) {
                    return task.data;
                });

                if(cargo.empty) cargo.empty();
                working = true;
                worker(ds, function () {
                    working = false;

                    var args = arguments;
                    _each(ts, function (data) {
                        if (data.callback) {
                            data.callback.apply(null, args);
                        }
                    });

                    process();
                });
            },
            length: function () {
                return tasks.length;
            },
            running: function () {
                return working;
            }
        };
        return cargo;
    };

    var _console_fn = function (name) {
        return function (fn) {
            var args = Array.prototype.slice.call(arguments, 1);
            fn.apply(null, args.concat([function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _each(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            }]));
        };
    };
    async.log = _console_fn('log');
    async.dir = _console_fn('dir');
    /*async.info = _console_fn('info');
    async.warn = _console_fn('warn');
    async.error = _console_fn('error');*/

    async.memoize = function (fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || function (x) {
            return x;
        };
        var memoized = function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            var key = hasher.apply(null, args);
            if (key in memo) {
                callback.apply(null, memo[key]);
            }
            else if (key in queues) {
                queues[key].push(callback);
            }
            else {
                queues[key] = [callback];
                fn.apply(null, args.concat([function () {
                    memo[key] = arguments;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                      q[i].apply(null, arguments);
                    }
                }]));
            }
        };
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    };

    async.unmemoize = function (fn) {
      return function () {
        return (fn.unmemoized || fn).apply(null, arguments);
      };
    };

    async.times = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.map(counter, iterator, callback);
    };

    async.timesSeries = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.mapSeries(counter, iterator, callback);
    };

    async.compose = function (/* functions... */) {
        var fns = Array.prototype.reverse.call(arguments);
        return function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            async.reduce(fns, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([function () {
                    var err = arguments[0];
                    var nextargs = Array.prototype.slice.call(arguments, 1);
                    cb(err, nextargs);
                }]))
            },
            function (err, results) {
                callback.apply(that, [err].concat(results));
            });
        };
    };

    var _applyEach = function (eachfn, fns /*args...*/) {
        var go = function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            return eachfn(fns, function (fn, cb) {
                fn.apply(that, args.concat([cb]));
            },
            callback);
        };
        if (arguments.length > 2) {
            var args = Array.prototype.slice.call(arguments, 2);
            return go.apply(this, args);
        }
        else {
            return go;
        }
    };
    async.applyEach = doParallel(_applyEach);
    async.applyEachSeries = doSeries(_applyEach);

    async.forever = function (fn, callback) {
        function next(err) {
            if (err) {
                if (callback) {
                    return callback(err);
                }
                throw err;
            }
            fn(next);
        }
        next();
    };

    // AMD / RequireJS
    if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return async;
        });
    }
    // Node.js
    else if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
    }
    // included directly via <script> tag
    else {
        root.async = async;
    }

}());

},{"__browserify_process":62}],4:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
## cog/defaults

```js
var defaults = require('cog/defaults');
```

### defaults(target, *)

Shallow copy object properties from the supplied source objects (*) into
the target object, returning the target object once completed.  Do not,
however, overwrite existing keys with new values:

```js
defaults({ a: 1, b: 2 }, { c: 3 }, { d: 4 }, { b: 5 }));
```

See an example on [requirebin](http://requirebin.com/?gist=6079475).
**/
module.exports = function(target) {
  // ensure we have a target
  target = target || {};

  // iterate through the sources and copy to the target
  [].slice.call(arguments, 1).forEach(function(source) {
    if (! source) {
      return;
    }

    for (var prop in source) {
      if (target[prop] === void 0) {
        target[prop] = source[prop];
      }
    }
  });

  return target;
};
},{}],5:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
## cog/extend

```js
var extend = require('cog/extend');
```

### extend(target, *)

Shallow copy object properties from the supplied source objects (*) into
the target object, returning the target object once completed:

```js
extend({ a: 1, b: 2 }, { c: 3 }, { d: 4 }, { b: 5 }));
```

See an example on [requirebin](http://requirebin.com/?gist=6079475).
**/
module.exports = function(target) {
  [].slice.call(arguments, 1).forEach(function(source) {
    if (! source) {
      return;
    }

    for (var prop in source) {
      target[prop] = source[prop];
    }
  });

  return target;
};
},{}],6:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## cog/logger

  ```js
  var logger = require('cog/logger');
  ```

  Simple browser logging offering similar functionality to the
  [debug](https://github.com/visionmedia/debug) module.

  ### Usage

  Create your self a new logging instance and give it a name:

  ```js
  var debug = logger('phil');
  ```

  Now do some debugging:

  ```js
  debug('hello');
  ```

  At this stage, no log output will be generated because your logger is
  currently disabled.  Enable it:

  ```js
  logger.enable('phil');
  ```

  Now do some more logger:

  ```js
  debug('Oh this is so much nicer :)');
  // --> phil: Oh this is some much nicer :)
  ```

  ### Reference
**/

var active = [];
var unleashListeners = [];
var targets = [ console ];

/**
  #### logger(name)

  Create a new logging instance.
**/
var logger = module.exports = function(name) {
  // initial enabled check
  var enabled = checkActive();

  function checkActive() {
    return enabled = active.indexOf('*') >= 0 || active.indexOf(name) >= 0;
  }

  // register the check active with the listeners array
  unleashListeners[unleashListeners.length] = checkActive;

  // return the actual logging function
  return function() {
    var args = [].slice.call(arguments);

    // if we have a string message
    if (typeof args[0] == 'string' || (args[0] instanceof String)) {
      args[0] = name + ': ' + args[0];
    }

    // if not enabled, bail
    if (! enabled) {
      return;
    }

    // log
    targets.forEach(function(target) {
      target.log.apply(target, args);
    });
  };
};

/**
  #### logger.reset()

  Reset logging (remove the default console logger, flag all loggers as
  inactive, etc, etc.
**/
logger.reset = function() {
  // reset targets and active states
  targets = [];
  active = [];

  return logger.enable();
};

/**
  #### logger.to(target)

  Add a logging target.  The logger must have a `log` method attached.

**/
logger.to = function(target) {
  targets = targets.concat(target || []);

  return logger;
};

/**
  #### logger.enable(names*)

  Enable logging via the named logging instances.  To enable logging via all
  instances, you can pass a wildcard:

  ```js
  logger.enable('*');
  ```

  __TODO:__ wildcard enablers
**/
logger.enable = function() {
  // update the active
  active = active.concat([].slice.call(arguments));

  // trigger the unleash listeners
  unleashListeners.forEach(function(listener) {
    listener();
  });

  return logger;
};
},{}],7:[function(require,module,exports){
// Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
// http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ┌────────────────────────────────────────────────────────────┐ \\
// │ Eve 0.4.2 - JavaScript Events Library                      │ \\
// ├────────────────────────────────────────────────────────────┤ \\
// │ Author Dmitry Baranovskiy (http://dmitry.baranovskiy.com/) │ \\
// └────────────────────────────────────────────────────────────┘ \\

(function (glob) {
    var version = "0.4.2",
        has = "hasOwnProperty",
        separator = /[\.\/]/,
        wildcard = "*",
        fun = function () {},
        numsort = function (a, b) {
            return a - b;
        },
        current_event,
        stop,
        events = {n: {}},
    /*\
     * eve
     [ method ]

     * Fires event with given `name`, given scope and other parameters.

     > Arguments

     - name (string) name of the *event*, dot (`.`) or slash (`/`) separated
     - scope (object) context for the event handlers
     - varargs (...) the rest of arguments will be sent to event handlers

     = (object) array of returned values from the listeners
    \*/
        eve = function (name, scope) {
			name = String(name);
            var e = events,
                oldstop = stop,
                args = Array.prototype.slice.call(arguments, 2),
                listeners = eve.listeners(name),
                z = 0,
                f = false,
                l,
                indexed = [],
                queue = {},
                out = [],
                ce = current_event,
                errors = [];
            current_event = name;
            stop = 0;
            for (var i = 0, ii = listeners.length; i < ii; i++) if ("zIndex" in listeners[i]) {
                indexed.push(listeners[i].zIndex);
                if (listeners[i].zIndex < 0) {
                    queue[listeners[i].zIndex] = listeners[i];
                }
            }
            indexed.sort(numsort);
            while (indexed[z] < 0) {
                l = queue[indexed[z++]];
                out.push(l.apply(scope, args));
                if (stop) {
                    stop = oldstop;
                    return out;
                }
            }
            for (i = 0; i < ii; i++) {
                l = listeners[i];
                if ("zIndex" in l) {
                    if (l.zIndex == indexed[z]) {
                        out.push(l.apply(scope, args));
                        if (stop) {
                            break;
                        }
                        do {
                            z++;
                            l = queue[indexed[z]];
                            l && out.push(l.apply(scope, args));
                            if (stop) {
                                break;
                            }
                        } while (l)
                    } else {
                        queue[l.zIndex] = l;
                    }
                } else {
                    out.push(l.apply(scope, args));
                    if (stop) {
                        break;
                    }
                }
            }
            stop = oldstop;
            current_event = ce;
            return out.length ? out : null;
        };
		// Undocumented. Debug only.
		eve._events = events;
    /*\
     * eve.listeners
     [ method ]

     * Internal method which gives you array of all event handlers that will be triggered by the given `name`.

     > Arguments

     - name (string) name of the event, dot (`.`) or slash (`/`) separated

     = (array) array of event handlers
    \*/
    eve.listeners = function (name) {
        var names = name.split(separator),
            e = events,
            item,
            items,
            k,
            i,
            ii,
            j,
            jj,
            nes,
            es = [e],
            out = [];
        for (i = 0, ii = names.length; i < ii; i++) {
            nes = [];
            for (j = 0, jj = es.length; j < jj; j++) {
                e = es[j].n;
                items = [e[names[i]], e[wildcard]];
                k = 2;
                while (k--) {
                    item = items[k];
                    if (item) {
                        nes.push(item);
                        out = out.concat(item.f || []);
                    }
                }
            }
            es = nes;
        }
        return out;
    };
    
    /*\
     * eve.on
     [ method ]
     **
     * Binds given event handler with a given name. You can use wildcards “`*`” for the names:
     | eve.on("*.under.*", f);
     | eve("mouse.under.floor"); // triggers f
     * Use @eve to trigger the listener.
     **
     > Arguments
     **
     - name (string) name of the event, dot (`.`) or slash (`/`) separated, with optional wildcards
     - f (function) event handler function
     **
     = (function) returned function accepts a single numeric parameter that represents z-index of the handler. It is an optional feature and only used when you need to ensure that some subset of handlers will be invoked in a given order, despite of the order of assignment. 
     > Example:
     | eve.on("mouse", eatIt)(2);
     | eve.on("mouse", scream);
     | eve.on("mouse", catchIt)(1);
     * This will ensure that `catchIt()` function will be called before `eatIt()`.
	 *
     * If you want to put your handler before non-indexed handlers, specify a negative value.
     * Note: I assume most of the time you don’t need to worry about z-index, but it’s nice to have this feature “just in case”.
    \*/
    eve.on = function (name, f) {
		name = String(name);
		if (typeof f != "function") {
			return function () {};
		}
        var names = name.split(separator),
            e = events;
        for (var i = 0, ii = names.length; i < ii; i++) {
            e = e.n;
            e = e.hasOwnProperty(names[i]) && e[names[i]] || (e[names[i]] = {n: {}});
        }
        e.f = e.f || [];
        for (i = 0, ii = e.f.length; i < ii; i++) if (e.f[i] == f) {
            return fun;
        }
        e.f.push(f);
        return function (zIndex) {
            if (+zIndex == +zIndex) {
                f.zIndex = +zIndex;
            }
        };
    };
    /*\
     * eve.f
     [ method ]
     **
     * Returns function that will fire given event with optional arguments.
	 * Arguments that will be passed to the result function will be also
	 * concated to the list of final arguments.
 	 | el.onclick = eve.f("click", 1, 2);
 	 | eve.on("click", function (a, b, c) {
 	 |     console.log(a, b, c); // 1, 2, [event object]
 	 | });
     > Arguments
	 - event (string) event name
	 - varargs (…) and any other arguments
	 = (function) possible event handler function
    \*/
	eve.f = function (event) {
		var attrs = [].slice.call(arguments, 1);
		return function () {
			eve.apply(null, [event, null].concat(attrs).concat([].slice.call(arguments, 0)));
		};
	};
    /*\
     * eve.stop
     [ method ]
     **
     * Is used inside an event handler to stop the event, preventing any subsequent listeners from firing.
    \*/
    eve.stop = function () {
        stop = 1;
    };
    /*\
     * eve.nt
     [ method ]
     **
     * Could be used inside event handler to figure out actual name of the event.
     **
     > Arguments
     **
     - subname (string) #optional subname of the event
     **
     = (string) name of the event, if `subname` is not specified
     * or
     = (boolean) `true`, if current event’s name contains `subname`
    \*/
    eve.nt = function (subname) {
        if (subname) {
            return new RegExp("(?:\\.|\\/|^)" + subname + "(?:\\.|\\/|$)").test(current_event);
        }
        return current_event;
    };
    /*\
     * eve.nts
     [ method ]
     **
     * Could be used inside event handler to figure out actual name of the event.
     **
     **
     = (array) names of the event
    \*/
    eve.nts = function () {
        return current_event.split(separator);
    };
    /*\
     * eve.off
     [ method ]
     **
     * Removes given function from the list of event listeners assigned to given name.
	 * If no arguments specified all the events will be cleared.
     **
     > Arguments
     **
     - name (string) name of the event, dot (`.`) or slash (`/`) separated, with optional wildcards
     - f (function) event handler function
    \*/
    /*\
     * eve.unbind
     [ method ]
     **
     * See @eve.off
    \*/
    eve.off = eve.unbind = function (name, f) {
		if (!name) {
		    eve._events = events = {n: {}};
			return;
		}
        var names = name.split(separator),
            e,
            key,
            splice,
            i, ii, j, jj,
            cur = [events];
        for (i = 0, ii = names.length; i < ii; i++) {
            for (j = 0; j < cur.length; j += splice.length - 2) {
                splice = [j, 1];
                e = cur[j].n;
                if (names[i] != wildcard) {
                    if (e[names[i]]) {
                        splice.push(e[names[i]]);
                    }
                } else {
                    for (key in e) if (e[has](key)) {
                        splice.push(e[key]);
                    }
                }
                cur.splice.apply(cur, splice);
            }
        }
        for (i = 0, ii = cur.length; i < ii; i++) {
            e = cur[i];
            while (e.n) {
                if (f) {
                    if (e.f) {
                        for (j = 0, jj = e.f.length; j < jj; j++) if (e.f[j] == f) {
                            e.f.splice(j, 1);
                            break;
                        }
                        !e.f.length && delete e.f;
                    }
                    for (key in e.n) if (e.n[has](key) && e.n[key].f) {
                        var funcs = e.n[key].f;
                        for (j = 0, jj = funcs.length; j < jj; j++) if (funcs[j] == f) {
                            funcs.splice(j, 1);
                            break;
                        }
                        !funcs.length && delete e.n[key].f;
                    }
                } else {
                    delete e.f;
                    for (key in e.n) if (e.n[has](key) && e.n[key].f) {
                        delete e.n[key].f;
                    }
                }
                e = e.n;
            }
        }
    };
    /*\
     * eve.once
     [ method ]
     **
     * Binds given event handler with a given name to only run once then unbind itself.
     | eve.once("login", f);
     | eve("login"); // triggers f
     | eve("login"); // no listeners
     * Use @eve to trigger the listener.
     **
     > Arguments
     **
     - name (string) name of the event, dot (`.`) or slash (`/`) separated, with optional wildcards
     - f (function) event handler function
     **
     = (function) same return function as @eve.on
    \*/
    eve.once = function (name, f) {
        var f2 = function () {
            eve.unbind(name, f2);
            return f.apply(this, arguments);
        };
        return eve.on(name, f2);
    };
    /*\
     * eve.version
     [ property (string) ]
     **
     * Current version of the library.
    \*/
    eve.version = version;
    eve.toString = function () {
        return "You are running Eve " + version;
    };
    (typeof module != "undefined" && module.exports) ? (module.exports = eve) : (typeof define != "undefined" ? (define("eve", [], function() { return eve; })) : (glob.eve = eve));
})(this);

},{}],8:[function(require,module,exports){
/* jshint node: true */
'use strict';

var qsa = require('./qsa');
var reBool = /^(true|false)$/i

/**
  ### meta(regex?)

  Find all the `<meta>` tags that have a name attribute and collate as a
  simple JS objects whether the content of the tag is the value.

  <<< examples/meta.js

**/
module.exports = function(regex) {
  var data = {};

  // find all the meta tags with a name and extract the content
  qsa('meta[name]').forEach(function(tag) {
    var name = tag.getAttribute('name');
    var match = regex ? regex.exec(name) : [name, name];

    if (match) {
      data[match[1] || match[0]] = coerce(tag.getAttribute('content') || '');
    }
  });

  return data;
};

function coerce(value) {
  value = parseFloat(value) || value;

  if (reBool.test(value)) {
    value = value == 'true';
  }

  return value;
}
},{"./qsa":10}],9:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ### on

  ```
  f(name, => el, => cb)
  ```

  The `on` helper assists with working with DOM events and being able to map
  those to a node callback style function in the form:

  ```js
  function(err, evt) {
  }
  ```

  When the event is triggered by the `el` the callback is fired passing
  a null value to the `err` argument.

  <<< examples/on.js
**/
module.exports = function(name, el, callback) {
  function bind(t, trigger) {
    var buffered = [];

    function handleEvent(evt) {
      if (typeof trigger == 'function') {
        return trigger(null, evt);
      }

      // otherwise, buffer the event
      buffered[buffered.length] = evt;
    }

    // listen for events
    t.addEventListener(name, handleEvent);

    // if we have been provided a trigger function (not an array index)
    // then return the handle event call
    return typeof trigger == 'function' ? handleEvent : function(cb) {
      trigger = cb;

      // if we have a buffered results, trigger those now
      if (buffered.length > 0) {
        buffered.splice(0).forEach(function(evt) {
          cb(null, evt);
        });
      }
    };
  }

  return el ? bind(el, callback) : bind;
};
},{}],10:[function(require,module,exports){
/* jshint node: true */
/* global document: false */
'use strict';

var classSelectorRE = /^\.([\w\-]+)$/;
var idSelectorRE = /^#([\w\-]+)$/;
var tagSelectorRE = /^[\w\-]+$/;

/**
  ### qsa(selector, scope?)

  This function is used to get the results of the querySelectorAll output
  in the fastest possible way.  This code is very much based on the
  implementation in
  [zepto](https://github.com/madrobby/zepto/blob/master/src/zepto.js#L104),
  but perhaps not quite as terse.

  <<< examples/qsa.js

**/
module.exports = function(selector, scope) {
  var idSearch;

  // default the element to the document
  scope = scope || document;

  // determine whether we are doing an id search or not
  idSearch = scope === document && idSelectorRE.test(selector);

  // perform the search
  return idSearch ?
    // we are doing an id search, return the element search in an array
    [scope.getElementById(RegExp.$1)] :
    // not an id search, call the appropriate selector
    Array.prototype.slice.call(
        classSelectorRE.test(selector) ?
          scope.getElementsByClassName(RegExp.$1) :
            tagSelectorRE.test(selector) ?
              scope.getElementsByTagName(selector) :
              scope.querySelectorAll(selector)
    );
};
},{}],11:[function(require,module,exports){
/* jshint node: true */
'use strict';

var reSeparator = /[\,\s]\s*/;
var offFlags = ['false', 'none', 'off'];


/**
  # rtc-captureconfig

  This is a simple parser that takes a string of text and determines what
  that means in the context of WebRTC.

  ## Why?

  It provides a simple, textual way of describing your requirements for
  media capture.  Trying to remember the structure of the constraints object
  is painful.

  ## How

  A simple text string is converted to an intermediate JS object
  representation, which can then be converted to a getUserMedia constraints
  data structure using a `toConstraints()` call.

  For example, the following text input:

  ```
  camera min:1280x720 max:1280x720 min:15fps max:25fps
  ```

  Is converted into an intermedia representation (via the `CaptureConfig`
  utility class) that looks like the following:

  ```js
  {
    camera: 0,
    microphone: 0,
    res: {
      min: { w: 1280, h: 720 },
      max: { w: 1280, h: 720 }
    },

    fps: {
      min: 15,
      max: 25
    }
  }
  ```

  Which in turn is converted into the following media constraints for
  a getUserMedia call:

  ```js
  {
    audio: true,
    video: {
      mandatory: {
        minFrameRate: 15,
        maxFrameRate: 25,

        minWidth: 1280,
        minHeight: 720,
        maxWidth: 1280,
        maxHeight: 720
      },

      optional: []
    }
  }
  ```

  ### Experimental: Targeted Device Capture

  While the `rtc-captureconfig` module itself doesn't contain any media
  identification logic, it is able to the sources information from a
  `MediaStreamTrack.getSources` call to generate device targeted constraints.

  For instance, the following example demonstrates how we can request
  `camera:1` (the 2nd video device on our local machine) when we are making
  a getUserMedia call:

  <<< examples/camera-two.js

  It's worth noting that if the requested device does not exist on the
  machine (in the case above, if your machine only has a single webcam - as
  is common) then no device selection constraints will be generated (i.e.
  the standard `{ video: true, audio: true }` constraints will be returned
  from the `toConstraints` call).

  ### Experimental: Screen Capture

  If you are working with chrome and serving content of a HTTPS connection,
  then you will be able to experiment with experimental getUserMedia screen
  capture.

  In the simplest case, screen capture can be invoked by using the capture
  string of:

  ```
  screen
  ```

  Which generates the following contraints:

  ```js
  {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'screen'
      },

      optional: []
    }
  }
  ```

  ## Reference

**/

module.exports = function(input) {
  // create a new configuration object using defaults
  var config = new CaptureConfig();

  // process each of the directives
  (input || '').split(reSeparator).forEach(function(directive) {
    // now further split the directive on the : character
    var parts = directive.split(':');
    var method = config[(parts[0] || '').toLowerCase()];

    // if we have the method apply
    if (typeof method == 'function') {
      method.apply(config, parts.slice(1));
    }
  });

  return config;
};

/**
  ### CaptureConfig

  This is a utility class that is used to update capture configuration
  details and is able to generate suitable getUserMedia constraints based
  on the configuration.

**/
function CaptureConfig() {
  if (! (this instanceof CaptureConfig)) {
    return new CaptureConfig();
  }

  // initialise the base config
  this.cfg = {
    microphone: true
  };
}

/**
  #### camera(index)

  Update the camera configuration to the specified index
**/
CaptureConfig.prototype.camera = function(index) {
  this.cfg.camera = trueOrValue(index);
};

/**
  #### microphone(index)

  Update the microphone configuration to the specified index
**/
CaptureConfig.prototype.microphone = function(index) {
  this.cfg.microphone = trueOrValue(index);
};

/**
  #### screen(target)

  Specify that we would like to capture the screen
**/
CaptureConfig.prototype.screen = function() {
  // unset the microphone config
  delete this.cfg.microphone;

  // set the screen configuration
  this.cfg.screen = true;
};

/**
  #### max(data)

  Update a maximum constraint.  If an fps constraint this will be directed
  to the `maxfps` modifier.

**/
CaptureConfig.prototype.max = function(data) {
  var res;

  // if this is an fps specification parse
  if (data.slice(-3).toLowerCase() == 'fps') {
    return this.maxfps(data);
  }

  // parse the resolution
  res = this._parseRes(data);

  // initialise the fps config stuff
  this.cfg.res = this.cfg.res || {};
  this.cfg.res.max = res;
};

/**
  #### maxfps(data)

  Update the maximum fps
**/
CaptureConfig.prototype.maxfps = function(data) {
  // ensure we have an fps component
  this.cfg.fps = this.cfg.fps || {};

  // set the max fps
  this.cfg.fps.max = parseFloat(data.slice(0, -3));
};

/**
  #### min(data)

  Update a minimum constraint.  This can be either related to resolution
  or FPS.
**/
CaptureConfig.prototype.min = function(data) {
  var res;

  // if this is an fps specification parse
  if (data.slice(-3).toLowerCase() == 'fps') {
    return this.minfps(data);
  }

  // parse the resolution
  res = this._parseRes(data);

  // initialise the fps config stuff
  this.cfg.res = this.cfg.res || {};

  // add the min
  this.cfg.res.min = res;
};

/**
  #### minfps(data)

  Update the minimum fps
**/
CaptureConfig.prototype.minfps = function(data) {
  // ensure we have an fps component
  this.cfg.fps = this.cfg.fps || {};

  // set the max fps
  this.cfg.fps.min = parseFloat(data.slice(0, -3));
};

/**
  #### toConstraints(opts?)

  Convert the internal configuration object to a valid media constraints
  representation.  In compatible browsers a list of media sources can
  be passed through in the `opts.sources` to create contraints that will
  target a specific device when captured.

  <<< examples/capture-targets.js

**/
CaptureConfig.prototype.toConstraints = function(opts) {
  var cfg = this.cfg;
  var constraints = {
    audio: cfg.microphone === true ||
      (typeof cfg.microphone == 'number' && cfg.microphone >= 0),

    video: cfg.camera === true || cfg.screen ||
      (typeof cfg.camera == 'number' && cfg.camera >= 0)
  };

  // mandatory constraints
  var m = {
    video: {},
    audio: {}
  };

  // optional constraints
  var o = {
    video: [],
    audio: []
  };

  var sources = (opts || {}).sources || [];
  var cameras = sources.filter(function(info) {
    return info && info.kind === 'video';
  });
  var microphones = sources.filter(function(info) {
    return info && info.kind === 'audio';
  });
  var selectedSource;

  function complexConstraints(target) {
    if (constraints[target] && typeof constraints[target] != 'object') {
      constraints[target] = {
        mandatory: m[target],
        optional: o[target]
      };
    }
  }

  // fps
  if (cfg.fps) {
    complexConstraints('video');
    cfg.fps.min && (m.video.minFrameRate = cfg.fps.min);
    cfg.fps.max && (m.video.maxFrameRate = cfg.fps.max);
  }

  // min res specified
  if (cfg.res && cfg.res.min) {
    complexConstraints('video');
    m.video.minWidth = cfg.res.min.w;
    m.video.minHeight = cfg.res.min.h;
  }

  // max res specified
  if (cfg.res && cfg.res.max) {
    complexConstraints('video');
    m.video.maxWidth = cfg.res.max.w;
    m.video.maxHeight = cfg.res.max.h;
  }

  // input camera selection
  if (typeof cfg.camera == 'number' && cameras.length) {
    selectedSource = cameras[cfg.camera];

    if (selectedSource) {
      complexConstraints('video');
      o.video.push({ sourceId: selectedSource.id });
    }
  }

  // input microphone selection
  if (typeof cfg.microphone == 'number' && microphones.length) {
    selectedSource = microphones[cfg.microphone];

    if (selectedSource) {
      complexConstraints('audio');
      o.audio.push({ sourceId: selectedSource.id });
    }
  }

  // if we have screen constraints, make magic happen
  if (typeof cfg.screen != 'undefined') {
    complexConstraints('video');
    m.video.chromeMediaSource = 'screen';
  }

  return constraints;
};

/**
  ### "Internal" methods
**/

/**
  #### _parseRes(data)

  Parse a resolution specifier (e.g. 1280x720) into a simple JS object
  (e.g. { w: 1280, h: 720 })
**/
CaptureConfig.prototype._parseRes = function(data) {
  // split the data on the 'x' character
  var parts = data.split('x');

  // if we don't have two parts, then complain
  if (parts.length < 2) {
    throw new Error('Invalid resolution specification: ' + data);
  }

  // return the width and height object
  return {
    w: parseInt(parts[0], 10),
    h: parseInt(parts[1], 10)
  };
};

/* internal helper */

function trueOrValue(val) {
  if (typeof val == 'string' && offFlags.indexOf(val.toLowerCase()) >= 0) {
    return false;
  }

  return val === undefined || val === '' || parseInt(val || 0, 10);
}
},{}],12:[function(require,module,exports){
/* jshint node: true */
/* global window: false */
/* global navigator: false */

'use strict';

/**
## rtc-core/detect

A browser detection helper for accessing prefix-free versions of the various
WebRTC types.

### Example Usage

If you wanted to get the native `RTCPeerConnection` prototype in any browser
you could do the following:

```js
var detect = require('rtc-core/detect'); // also available in rtc/detect
var RTCPeerConnection = detect('RTCPeerConnection');
```

This would provide whatever the browser prefixed version of the
RTCPeerConnection is available (`webkitRTCPeerConnection`,
`mozRTCPeerConnection`, etc).
**/
var detect = module.exports = function(target, prefixes) {
  var prefixIdx;
  var prefix;
  var testName;
  var hostObject = this || (typeof window != 'undefined' ? window : undefined);

  // if we have no host object, then abort
  if (! hostObject) {
    return;
  }

  // initialise to default prefixes
  // (reverse order as we use a decrementing for loop)
  prefixes = (prefixes || ['ms', 'o', 'moz', 'webkit']).concat('');

  // iterate through the prefixes and return the class if found in global
  for (prefixIdx = prefixes.length; prefixIdx--; ) {
    prefix = prefixes[prefixIdx];

    // construct the test class name
    // if we have a prefix ensure the target has an uppercase first character
    // such that a test for getUserMedia would result in a
    // search for webkitGetUserMedia
    testName = prefix + (prefix ?
                            target.charAt(0).toUpperCase() + target.slice(1) :
                            target);

    if (typeof hostObject[testName] != 'undefined') {
      // update the last used prefix
      detect.browser = detect.browser || prefix.toLowerCase();

      // return the host object member
      return hostObject[target] = hostObject[testName];
    }
  }
};

// detect mozilla (yes, this feels dirty)
detect.moz = typeof navigator != 'undefined' && !!navigator.mozGetUserMedia;

// initialise the prefix as unknown
detect.browser = undefined;
},{}],13:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## rtc-core/reset

  This is a simple, cross-browser method for resetting a media element
  back to a initial state after having media attached.

**/
module.exports = function(el) {
  // remove the source
  el.src = null;

  // check for moz
  if (el.mozSrcObject) {
    el.mozSrcObject = null;
  }

  // check for currentSrc
  if (el.currentSrc) {
    el.currentSrc = null;
  }

  // return the input (map friendly)
  return el;
};
},{}],14:[function(require,module,exports){
/* jshint node: true */
/* global navigator: false */
/* global window: false */
/* global document: false */
/* global MediaStream: false */
/* global HTMLVideoElement: false */
/* global HTMLAudioElement: false */

/**
  # rtc-media

  Simple [getUserMedia](http://dev.w3.org/2011/webrtc/editor/getusermedia.html)
  cross-browser wrappers.  Part of the [rtc.io](http://rtc.io/) suite, which is
  sponsored by [NICTA](http://opennicta.com) and released under an
  [Apache 2.0 license](/LICENSE).

  ## Example Usage

  Capturing media on your machine is as simple as:

  ```js
  require('rtc-media')();
  ```

  While this will in fact start the user media capture process, it won't
  do anything with it.  Lets take a look at a more realistic example:

  <<< examples/render-to-body.js

  [run on requirebin](http://requirebin.com/?gist=6085450)

  In the code above, we are creating a new instance of our userMedia wrapper
  using the `media()` call and then telling it to render to the
  `document.body` once video starts streaming.  We can further expand the
  code out to the following to aid our understanding of what is going on:

  <<< examples/capture-explicit.js

  The code above is written in a more traditional JS style, but feel free
  to use the first style as it's quite safe (thanks to some checks in the
  code).

  ### Events

  Once a media object has been created, it will provide a number of events
  through the standard node EventEmitter API.

  #### `capture`

  The `capture` event is triggered once the requested media stream has
  been captured by the browser.

  <<< examples/capture-event.js

  #### `render`

  The `render` event is triggered once the stream has been rendered
  to the any supplied (or created) video elements.

  While it might seem a little confusing that when the `render` event
  fires that it returns an array of elements rather than a single element
  (which is what is provided when calling the `render` method).

  This occurs because it is completely valid to render a single captured
  media stream to multiple media elements on a page.  The `render` event
  is reporting once the render operation has completed for all targets that
  have been registered with the capture stream.

  ## Reference

**/

'use strict';

var debug = require('cog/logger')('media');
var extend = require('cog/extend');
var detect = require('rtc-core/detect');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

// monkey patch getUserMedia from the prefixed version
navigator.getUserMedia = navigator.getUserMedia ||
  detect.call(navigator, 'getUserMedia');

// patch window url
window.URL = window.URL || detect('URL');

// patch media stream
window.MediaStream = detect('MediaStream');

/**
  ### media

  ```
  media(opts?)
  ```

  Capture media using the underlying
  [getUserMedia](http://www.w3.org/TR/mediacapture-streams/) API.

  The function accepts a single argument which can be either be:

  - a. An options object (see below), or;
  - b. An existing
    [MediaStream](http://www.w3.org/TR/mediacapture-streams/#mediastream) that
    the media object will bind to and provide you some DOM helpers for.

  The function supports the following options:

  - `capture` - Whether capture should be initiated automatically. Defaults
    to true, but toggled to false automatically if an existing stream is
    provided.

  - `muted` - Whether the video element created for this stream should be
    muted.  Default is true but is set to false when an existing stream is
    passed.

  - `constraints` - The constraint option allows you to specify particular
    media capture constraints which can allow you do do some pretty cool
    tricks.  By default, the contraints used to request the media are
    fairly standard defaults:

    ```js
      {
        video: {
          mandatory: {},
          optional: []
        },
        audio: true
      }
    ```

**/
function Media(opts) {
  if (! (this instanceof Media)) {
    return new Media(opts);
  }

  // inherited
  EventEmitter.call(this);

  // if the opts is a media stream instance, then handle that appropriately
  if (opts && opts instanceof MediaStream) {
    opts = {
      stream: opts,
      capture: false,
      muted: false
    };
  }

  // if we've been passed opts and they look like constraints, move things
  // around a little
  if (opts && (opts.audio || opts.video)) {
    opts = {
      constraints: opts
    };
  }

  // ensure we have opts
  opts = extend({}, {
    capture: true,
    muted: true,
    constraints: {
      video: {
        mandatory: {},
        optional: []
      },
      audio: true
    }
  }, opts);

  // save the constraints
  this.constraints = opts.constraints;

  // if a name has been specified in the opts, save it to the media
  this.name = opts.name;

  // initialise the stream to null
  this.stream = opts.stream || null;

  // initialise the muted state
  this.muted = typeof opts.muted == 'undefined' || opts.muted;

  // create a bindings array so we have a rough idea of where
  // we have been attached to
  // TODO: revisit whether this is the best way to manage this
  this._bindings = [];

  // if we are autostarting, capture media on the next tick
  if (opts.capture) {
    setTimeout(this.capture.bind(this), 0);
  }
}

util.inherits(Media, EventEmitter);
module.exports = Media;

/**
  ### capture

  ```
  capture(constraints, callback)
  ```

  Capture media.  If constraints are provided, then they will
  override the default constraints that were used when the media object was
  created.
**/
Media.prototype.capture = function(constraints, callback) {
  var media = this;
  var handleEnd = this.emit.bind(this, 'end');

  // if we already have a stream, then abort
  if (this.stream) { return; }

  // if no constraints have been provided, but we have
  // a callback, deal with it
  if (typeof constraints == 'function') {
    callback = constraints;
    constraints = this.constraints;
  }

  // if we have a callback, bind to the start event
  if (typeof callback == 'function') {
    this.once('capture', callback.bind(this));
  }

  // get user media, using either the provided constraints or the
  // default constraints
  navigator.getUserMedia(
    constraints || this.constraints,
    function(stream) {
      if (typeof stream.addEventListener == 'function') {
        stream.addEventListener('ended', handleEnd);
      }
      else {
        stream.onended = handleEnd;
      }

      // save the stream and emit the start method
      media.stream = stream;
      media.emit('capture', stream);
    },
    this._handleFail.bind(this)
  );
};

/**
  ### render

  ```js
  render(target, opts?, callback?)
  ```

  Render the captured media to the specified target element.  While previous
  versions of rtc-media accepted a selector string or an array of elements
  this has been dropped in favour of __one single target element__.

  If the target element is a valid MediaElement then it will become the
  target of the captured media stream.  If, however, it is a generic DOM
  element it will a new Media element will be created that using the target
  as it's parent.

  A simple example of requesting default media capture and rendering to the
  document body is shown below:

  <<< examples/render-to-body.js

  You may optionally provide a callback to this function, which is
  will be triggered once each of the media elements has started playing
  the stream:

  <<< examples/render-capture-callback.js

**/
Media.prototype.render = function(target, opts, callback) {
  // if the target is an array, extract the first element
  if (Array.isArray(target)) {
    // log a warning
    console.log('WARNING: rtc-media render (as of 1.x) expects a single target');
    target = target[0];
  }

  if (typeof opts == 'function') {
    callback = opts;
    opts = {};
  }

  // ensure we have opts
  opts = opts || {};

  // create the video / audio elements
  target = this._prepareElement(opts, target);

  // if no stream was specified, wait for the stream to initialize
  if (! this.stream) {
    this.once('capture', this._bindStream.bind(this));
  }
  // otherwise, bind the stream now
  else {
    this._bindStream(this.stream);
  }

  // if we have a callback then trigger on the render event
  if (typeof callback == 'function') {
    this.once('render', callback);
  }

  return target;
};

/**
  ### stop()

  Stop the media stream
**/
Media.prototype.stop = function(opts) {
  var media = this;

  if (! this.stream) { return; }

  // remove bindings
  this._unbind(opts);

  // stop the stream, and tell the world
  this.stream.stop();

  // on capture rebind
  this.once('capture', media._bindStream.bind(media));

  // remove the reference to the stream
  this.stream = null;
};

/**
  ## Debugging Tips

  Chrome and Chromium can both be started with the following flag:

  ```
  --use-fake-device-for-media-stream
  ```

  This uses a fake stream for the getUserMedia() call rather than attempting
  to capture the actual camera.  This is useful when doing automated testing
  and also if you want to test connectivity between two browser instances and
  want to distinguish between the two local videos.

  ## Internal Methods

  There are a number of internal methods that are used in the `rtc-media`
  implementation. These are outlined below, but not expected to be of
  general use.

**/

/**
  ### _prepareElement(opts, element)

  The prepareElement function is used to prepare DOM elements that will
  receive the media streams once the stream have been successfully captured.
**/
Media.prototype._prepareElement = function(opts, element) {
  var parent;
  var validElement = (element instanceof HTMLVideoElement) ||
        (element instanceof HTMLAudioElement);
  var preserveAspectRatio =
        typeof opts.preserveAspectRatio == 'undefined' ||
        opts.preserveAspectRatio;

  // perform some additional checks for things that "look" like a
  // media element
  validElement = validElement || (typeof element.play == 'function') && (
    typeof element.mozSrcObject != 'undefined' ||
    typeof element.src != 'undefined');

  // if the element is not a video element, then create one
  if (! validElement) {
    parent = element;

    // create a new video element
    // TODO: create an appropriate element based on the types of tracks
    // available
    element = document.createElement('video');

    // if we are preserving aspect ratio do that now
    if (preserveAspectRatio) {
      element.setAttribute('preserveAspectRatio', '');
    }

    // add to the parent
    parent.appendChild(element);
    element.setAttribute('data-playing', false);
  }

  // if muted, inject the muted attribute
  if (element && this.muted) {
    element.setAttribute('muted', '');
  }

  // flag the element as bound
  this._bindings.push({
    el: element,
    opts: opts
  });

  return element;
};

/**
  ### _bindStream(stream)

  Bind a stream to previously prepared DOM elements.

**/
Media.prototype._bindStream = function(stream) {
  var media = this;
  var elements = [];
  var waiting = [];

  function checkWaiting() {
    // if we have no waiting elements, but some elements
    // trigger the start event
    if (waiting.length === 0 && elements.length > 0) {
      media.emit('render', elements[0]);

      elements.map(function(el) {
        el.setAttribute('data-playing', true);
      });
    }
  }

  function playbackStarted(evt) {
    var el = evt.target || evt.srcElement;
    var videoIndex = elements.indexOf(el);

    if (videoIndex >= 0) {
      waiting.splice(videoIndex, 1);
    }

    el.removeEventListener('playing', playbackStarted);
    checkWaiting();
  }

  // iterate through the bindings and bind the stream
  elements = this._bindings.map(function(binding) {
    // check for mozSrcObject
    if (typeof binding.el.mozSrcObject != 'undefined') {
      binding.el.mozSrcObject = stream;
    }
    else {
      binding.el.src = media._createObjectURL(stream) || stream;
    }

    // attempt to play the video
    if (typeof binding.el.play == 'function') {
      binding.el.play();
    }

    return binding.el;
  });

  // find the elements we are waiting on
  waiting = elements.filter(function(el) {
    return el.readyState < 3; // readystate < HAVE_FUTURE_DATA
  });

  // wait for all the video elements
  waiting.map(function(el) {
    el.addEventListener('playing', playbackStarted, false);
  });

  checkWaiting();
};

/**
  ### _unbind()

  Gracefully detach elements that are using the stream from the
  current stream.
**/
Media.prototype._unbind = function(opts) {
  // ensure we have opts
  opts = opts || {};

  // iterate through the bindings and detach streams
  this._bindings.forEach(function(binding) {
    var element = binding.el;

    // remove the source
    element.src = null;

    // check for moz
    if (element.mozSrcObject) {
      element.mozSrcObject = null;
    }

    // check for currentSrc
    if (element.currentSrc) {
      element.currentSrc = null;
    }
  });
};

/**
  ### _createObjectUrl(stream)

  This method is used to create an object url that can be attached to a video
  or audio element.  Object urls are cached to ensure only one is created
  per stream.
**/
Media.prototype._createObjectURL = function(stream) {
  try {
    return window.URL.createObjectURL(stream);
  }
  catch (e) {
  }
};

/**
  ### _handleSuccess(stream)

  Handle the success condition of a `getUserMedia` call.

**/
Media.prototype._handleSuccess = function(stream) {
  // update the active stream that we are connected to
  this.stream = stream;

  // emit the stream event
  this.emit('stream', stream);
};

/**
  ### _handleFail(evt)

  Handle the failure condition of a `getUserMedia` call.

**/
Media.prototype._handleFail = function(err) {
  this.emit('error', err);
};
},{"cog/extend":5,"cog/logger":6,"events":59,"rtc-core/detect":12,"util":69}],15:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('rtc-signaller-announce');
var extend = require('cog/extend');
var roles = ['a', 'b'];

/**
  ### announce

  ```
  /announce|{"id": "...", ... }
  ```

  When an announce message is received by the signaller, the attached
  object data is decoded and the signaller emits an `announce` message.

  #### Events Triggered in response to `/announce`

  There are two different types of `peer:` events that can be triggered
  in on peer B to calling the `announce` method on peer A.

  - `peer:announce`

    The `peer:announce` event is triggered when a new peer has been
    discovered.  The data for the new peer (as an JS object) is provided
    as the first argument of the event handler.

  - `peer:update`

    If a peer "reannounces" then a `peer:update` event will be triggered
    rather than a `peer:announce` event.

**/
module.exports = function(signaller) {

  function copyData(target, source) {
    if (target && source) {
      for (var key in source) {
        if (key != 'clock') {
          target[key] = source[key];
        }
      }
    }

    return target;
  }

  return function(args, messageType, clock) {
    var data = args[0];
    var peer;

    // if we have valid data then process
    if (data && data.id) {
      // check to see if this is a known peer
      peer = signaller.peers.get(data.id);

      // if the peer is existing, then update the data
      if (peer) {
        debug('signaller: ' + signaller.id + ' received update, data: ', data);

        // update the data
        copyData(peer.data, data);

        // trigger the peer update event
        return signaller.emit('peer:update', data);
      }

      // create a new peer
      peer = {
        id: data.id,

        // initialise the local role index
        roleIdx: [data.id, signaller.id].sort().indexOf(data.id),

        // initialise the vector clock
        clock: clock || { a: 0, b: 0 },

        // initialise the peer data
        data: {}
      };

      // initialise the peer data
      copyData(peer.data, data);

      // set the peer data
      signaller.peers.set(data.id, peer);

      // if this is an initial announce message (no vector clock attached)
      // then send a announce reply
      if (! clock) {
        signaller
          .to(data.id)
          .send('/announce', signaller.attributes);
      }

      // emit a new peer announce event
      return signaller.emit('peer:announce', data, peer);
    }
  };
};
},{"cog/extend":21,"cog/logger":23}],16:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## signaller message handlers

**/

module.exports = function(signaller) {
  return {
    announce: require('./announce')(signaller),
    leave: require('./leave')(signaller),
    lock: require('./lock')(signaller),
    unlock: require('./unlock')(signaller)
  };
};
},{"./announce":15,"./leave":17,"./lock":18,"./unlock":19}],17:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ### leave

  ```
  /leave|{"id":"..."}
  ```

  When a leave message is received from a peer, we check to see if that is
  a peer that we are managing state information for and if we are then the
  peer state is removed.

  #### Events triggered in response to `/leave` messages

  The following event(s) are triggered when a `/leave` action is received
  from a peer signaller:

  - `peer:leave`

    The `peer:leave` event is emitted once a `/leave` message is captured
    from a peer.  Prior to the event being dispatched, the internal peers
    data in the signaller is removed but can be accessed in 2nd argument
    of the event handler.

**/
module.exports = function(signaller) {
  return function(args) {
    var data = args[0];
    var peer = signaller.peers.get(data && data.id);

    // remove the peer from the peers data
    if (peer) {
      signaller.peers.delete(data.id);
    }

    // emit the event
    signaller.emit('peer:leave', data.id, peer);
  };
};
},{}],18:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('rtc-signaller-lock');
var vc = require('vectorclock');
var FastMap = require('collections/fast-map');

/**
  ### lock

  ```
  /lock
  ```

  A `/lock` request can only be sent within the context of a `/to` message
  and thus must contain source data to be processed correctly.  The `/lock`
  message is used to coordinate betwen two remote peers in the case that
  both peers which to commence renegotiation at the same time.

  In the case that two peers attempt to renegotiate with each other at the
  same time, then the peer that has been identified as party `a` in the peer
  relationship will take on the role of the initiator in the negotiation and
  party `b` will respond to the offer sdp.

**/
module.exports = function(signaller) {
  return function(args, messageType, clock, srcState) {
    var clockComparison;
    var success = false;
    var label = args[0];

    // if we don't have a clock value or don't know about the source
    // then just drop the message
    if ((! clock) || (! srcState)) {
      return;
    }

    debug('received "' + label + '" lock request from src: ' + srcState.id);
    clockComparison = vc.compare(clock, srcState.clock);

    // if the remote clock is greater than the lock clock state
    // then the lock is automatically successful
    success = (! signaller.locks.get(label)) ||
      clockComparison > 0 ||
      (clockComparison === 0 && srcState.roleIdx === 0);

    debug('signaller ' + signaller.id + ' checking lock state');
    debug('clock value in message: ', clock);
    debug('cached peer clock state: ', srcState.clock);
    debug('clock comparison = ' + clockComparison + ' ok: ' + success, srcState);

    // if the lock is successful, then add the lock info to the srcState
    if (success) {
      // ensure we have a locks member
      srcState.locks = srcState.locks || new FastMap();

      // create the lock
      srcState.locks.set(label, { id: args[1] || '' });
    }

    // send the lock result
    signaller.to(srcState.id).send('/lockresult', {
      label: label,
      ok: success
    });
  };
};
},{"cog/logger":23,"collections/fast-map":25,"vectorclock":44}],19:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('rtc-signaller-lock');
var vc = require('vectorclock');

/**
  ### unlock

  ```
  /unlock|label
  ```

  Clear a remote lock

**/
module.exports = function(signaller) {
  return function(args, messageType, clock, srcState) {
    var label = args[0];
    var ok = false;

    // if we don't have a clock value or don't know about the source
    // then just drop the message
    if ((! clock) || (! srcState)) {
      return;
    }

    debug('received "' + label + '" unlock request from src: ' + srcState.id);

    // if the peer has an active lock, remove it
    if (srcState.locks) {
      // TODO: check for a matching lockid
      srcState.locks.delete(label);
      ok = true;
    }

    // send the lock message
    signaller.to(srcState.id).send('/unlockresult', {
      label: label,
      ok: ok
    });
  };
};
},{"cog/logger":23,"vectorclock":44}],20:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('rtc-signaller');
var EventEmitter = require('events').EventEmitter;
var uuid = require('uuid');
var extend = require('cog/extend');
var FastMap = require('collections/fast-map');
var vc = require('vectorclock');

/**
  # rtc-signaller

  The `rtc-signaller` module provides a transportless signalling
  mechanism for WebRTC.

  ## Purpose

  The signaller provides set of client-side tools that assist with the
  setting up an `PeerConnection` and helping them communicate. All that is
  required for the signaller to operate is a suitable messenger.

  A messenger is a simple object that implements node
  [EventEmitter](http://nodejs.org/api/events.html) style `on` events for
  `open`, `close`, `message` events, and also a `send` method by which
  data will be send "over-the-wire".

  By using this approach, we can conduct signalling over any number of
  mechanisms:

  - local, in memory message passing
  - via WebSockets and higher level abstractions (such as
    [primus](https://github.com/primus/primus))
  - also over WebRTC data-channels (very meta, and admittedly a little
    complicated).

  ## Getting Started

  To work with the signaller, you first need a messenger of some kind. If you
  have run up a version of the
  [rtc-switchboard](https://github.com/rtc-io/rtc-switchboard) somewhere then
  the following example should work:

  <<< examples/signalling-via-switchboard.js

  While the example above demonstrates communication between two endpoints
  via websockets, it does not go into detail on setting up a WebRTC peer
  connection (as that is significantly more involved).  If you are looking for
  an easy way to do this, I'd recommend checking out
  [rtc-quickconnect](https://github.com/rtc-io/rtc-quickconnect) or
  [rtc-glue](https://github.com/rtc-io/rtc-glue).

  ## Signal Flow Diagrams

  Displayed below are some diagrams how the signalling flow between peers
  behaves.  In each of the diagrams we illustrate three peers (A, B and C)
  participating discovery and coordinating RTCPeerConnection handshakes.

  In each case, only the interaction between the clients is represented not
  how a signalling server
  (such as [rtc-switchboard](https://github.com/rtc-io/rtc-switchboard)) would
  pass on broadcast messages, etc.  This is done for two reasons:

  1. It is out of scope of this documentation.
  2. The `rtc-signaller` has been designed to work without having to rely on
     any intelligence in the server side signalling component.  In the
     instance that a signaller broadcasts all messages to all connected peers
     then `rtc-signaller` should be smart enough to make sure everything works
     as expected.

  ### Peer Discovery / Announcement

  This diagram illustrates the process of how peer `A` announces itself to
  peers `B` and `C`, and in turn they announce themselves.

  ![](https://raw.github.com/rtc-io/rtc-signaller/master/docs/announce.png)

  ### Editing / Updating the Diagrams

  Each of the diagrams has been generated using
  [mscgen](http://www.mcternan.me.uk/mscgen/index.html) and the source for
  these documents can be found in the `docs/` folder of this repository.

  ## Reference

  The `rtc-signaller` module is designed to be used primarily in a functional
  way and when called it creates a new signaller that will enable
  you to communicate with other peers via your messaging network.

  ```js
  // create a signaller from something that knows how to send messages
  var signaller = require('rtc-signaller')(messenger);
  ```

**/
var sig = module.exports = function(messenger, opts) {

  // create the signaller
  var signaller = new EventEmitter();

  // initialise the id
  var id = signaller.id = uuid.v4();

  // initialise the attributes
  var attributes = signaller.attributes = {
    id: id
  };

  // create the peers map
  var peers = signaller.peers = new FastMap();

  // create our locks map
  var locks = signaller.locks = new FastMap();

  // initialise the data event name
  var dataEvent = (opts || {}).dataEvent || 'data';
  var writeMethod = (opts || {}).writeMethod || 'write';
  var closeMethod = (opts || {}).closeMethod || 'close';

  // extract the write and close function references
  var write = messenger[writeMethod];
  var close = messenger[closeMethod];

  // create the processor
  var processor = require('./processor')(signaller);

  // if the messenger doesn't provide a valid write method, then complain
  if (typeof write != 'function') {
    throw new Error('provided messenger does not implement a "' +
      writeMethod + '" write method');
  }

  function prepareArg(arg) {
    if (typeof arg == 'object' && (! (arg instanceof String))) {
      return JSON.stringify(arg);
    }
    else if (typeof arg == 'function') {
      return null;
    }

    return arg;
  }

  /**
    ### signaller#send(data)

    Send data over the messenging interface.
  **/
  var send = signaller.send = function() {
    // iterate over the arguments and stringify as required
    var args = [].slice.call(arguments);
    var dataline = args.map(prepareArg).filter(Boolean).join('|');

    // send the data over the messenger
    return write.call(messenger, dataline);
  };

  /**
    ### signaller#announce(data?)

    The `announce` function of the signaller will pass an `/announce` message
    through the messenger network.  When no additional data is supplied to
    this function then only the id of the signaller is sent to all active
    members of the messenging network.

    As a unique it is generally insufficient information to determine whether
    a peer is a good match for another (for instance,  you might be looking
    for other parties by name or role) it is generally a good idea to provide
    some additional information during this announce call:

    ```js
    signaller.announce({ role: 'translator' });
    ```

    __NOTE:__ In some particular messenger types may attach or infer
    additional data during the announce phase.  For instance, socket.io
    connections are generally organised into rooms which is inferred
    information that limits the messaging scope.
  **/
  signaller.announce = function(data, sender) {
    // update internal attributes
    extend(attributes, data, { id: id });

    // send the attributes over the network
    return (sender || send)('/announce', attributes);
  };

  /**
    ### signaller#leave()

    Leave the messenger mesh
  **/
  signaller.leave = function() {
    // send the leave signal
    send('/leave', { id: id });

    // call the close method
    if (typeof close == 'function') {
      close.call(messenger);
    }
  };

  /**
    ### signaller#lock(targetId, opts?, callback?)

    Attempt to get a temporary exclusive lock on the communication
    channel between the local signaller and the specified target peer id.
  **/
  signaller.lock = function(targetId, opts, callback) {
    var peer = peers.get(targetId);
    var activeLock;
    var lockid = uuid.v4();
    var label;

    function handleLockResult(src, result) {
      var ok = result && result.ok;

      // if the source does not match the target then abort
      if ((! src) || (src.id !== targetId)) {
        return;
      }

      // if the result label is not a match, then abort
      if ((! result) || (result.label !== label)) {
        return;
      }

      // don't listen for any further lock result messages
      signaller.removeListener('lockresult', handleLockResult);

      // if we don't have an error condition, create an active local lock
      if (ok) {
        locks.set(label, activeLock = { id: lockid });
      }
      // otherwise, delete the local provisional lock
      else if (activeLock) {
        locks.delete(label);
      }

      callback(ok ? null : new Error('could not acquire lock'));
    }

    // check for no label being supplied
    if (typeof opts == 'function') {
      callback = opts;
      opts = {};
    }

    // ensure we have a callback
    callback = callback || function() {};

    // if the peer is not known, then we cannot initiate a lock
    if (! peer) {
      return callback(new Error('unknown target id - cannot initiate lock'));
    }

    // create a default label if none provided
    label = (opts || {}).label || (opts || {}).name || 'default';

    // if we have a local lock already in place, then return ok
    activeLock = locks.get(label);
    if (activeLock && (! activeLock.provisional)) {
      return callback();
    }

    // ensure we have locks for the peer
    peer.locks = peer.locks || new FastMap();

    // if a remote lock is in place, error out
    if (peer.locks.get(label)) {
      return callback(new Error('remote lock in place, cannot request lock'));
    }

    // create a provisional lock
    locks.set(label, activeLock = { id: lockid, provisional: true });

    // wait for the lock result
    signaller.on('lockresult', handleLockResult);

    // send the lock message
    signaller.to(targetId).send('/lock', label, lockid);
  };

  /**
    ### signaller#to(targetId)

    The to method returns an encapsulated

  **/
  signaller.to = function(targetId) {
    // create a sender that will prepend messages with /to|targetId|
    var sender = function() {
      // get the peer (yes when send is called to make sure it hasn't left)
      var peer = signaller.peers.get(targetId);
      var args;

      if (! peer) {
        throw new Error('Unknown peer: ' + targetId);
      }

      args = [
        '/to',
        targetId,
        { id: signaller.id, clock: peer.clock }
      ].concat([].slice.call(arguments));

      // increment the peer clock, using the role of the local
      // signaller.  If the peer role is 0, then the signallers role is 1
      // and using xor (^) will generate the correct index
      vc.increment(peer, ['a', 'b'][peer.roleIdx ^ 1]);

      // write on next tick to ensure clock updates are handled correctly
      setTimeout(function() {
        var msg = args.map(prepareArg).filter(Boolean).join('|');
        debug('TX (' + targetId + '): ', msg);

        // include the current clock value in with the payload
        write.call(messenger, msg);
      }, 0);
    };

    return {
      announce: function(data) {
        return signaller.announce(data, sender);
      },

      send: sender,
    }
  };

  /**

    ### signaller#unlock(targetId, opts?)

  **/
  signaller.unlock = function(targetId, opts, callback) {
    var peer = peers.get(targetId);
    var label;

    function handleUnlockResult(src, result) {
      var ok = result && result.ok;

      // if not the correct source then abort
      if ((! src) || (src.id !== targetId)) {
        return;
      }

      // if this is not an unlock result for this label, then abort
      if ((! result) || (result.label !== label)) {
        return;
      }

      // remove the listener
      signaller.removeListener('unlockresult', handleUnlockResult);

      // if ok, remove our local lock
      if (ok) {
        locks.delete(label);
      }

      // trigger the callback
      callback(ok ? null : new Error('could not release lock: ' + label));
    }

    // handle the no opts case
    if (typeof opts == 'function') {
      callback = opts;
      opts = {};
    }

    // ensure we have a callback
    callback = callback || function() {};

    // set a default label value
    label = (opts || {}).label || (opts || {}).name || 'default';

    // if we have the peer and local lock then action the unlock
    if (peer && locks.get(label)) {
      signaller.on('unlockresult', handleUnlockResult);
      signaller.to(targetId).send('/unlock', label, locks.get(label));
    }
    else {
      return callback(new Error('no local lock with label ' + label));
    }
  };

  // handle message data events
  messenger.on(dataEvent, processor);

  return signaller;
};

sig.loadPrimus = require('./primus-loader');
},{"./primus-loader":45,"./processor":46,"cog/extend":21,"cog/logger":23,"collections/fast-map":25,"events":59,"uuid":43,"vectorclock":44}],21:[function(require,module,exports){
module.exports=require(5)
},{}],22:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## cog/jsonparse

  ```js
  var jsonparse = require('cog/jsonparse');
  ```

  ### jsonparse(input)

  This function will attempt to automatically detect stringified JSON, and
  when detected will parse into JSON objects.  The function looks for strings
  that look and smell like stringified JSON, and if found attempts to
  `JSON.parse` the input into a valid object.

**/
module.exports = function(input) {
  var isString = typeof input == 'string' || (input instanceof String);
  var reNumeric = /^\-?\d+\.?\d*$/;
  var shouldParse ;
  var firstChar;
  var lastChar;

  if ((! isString) || input.length < 2) {
    if (isString && reNumeric.test(input)) {
      return parseFloat(input);
    }

    return input;
  }

  // check for true or false
  if (input === 'true' || input === 'false') {
    return input === 'true';
  }

  // check for null
  if (input === 'null') {
    return null;
  }

  // get the first and last characters
  firstChar = input.charAt(0);
  lastChar = input.charAt(input.length - 1);

  // determine whether we should JSON.parse the input
  shouldParse =
    (firstChar == '{' && lastChar == '}') ||
    (firstChar == '[' && lastChar == ']');

  if (shouldParse) {
    try {
      return JSON.parse(input);
    }
    catch (e) {
      // apparently it wasn't valid json, carry on with regular processing
    }
  }


  return reNumeric.test(input) ? parseFloat(input) : input;
};
},{}],23:[function(require,module,exports){
module.exports=require(6)
},{}],24:[function(require,module,exports){
"use strict";

var Shim = require("./shim");
var GenericCollection = require("./generic-collection");
var GenericMap = require("./generic-map");
var PropertyChanges = require("./listen/property-changes");

// Burgled from https://github.com/domenic/dict

module.exports = Dict;
function Dict(values, getDefault) {
    if (!(this instanceof Dict)) {
        return new Dict(values, getDefault);
    }
    getDefault = getDefault || Function.noop;
    this.getDefault = getDefault;
    this.store = {};
    this.length = 0;
    this.addEach(values);
}

Dict.Dict = Dict; // hack so require("dict").Dict will work in MontageJS.

function mangle(key) {
    return "~" + key;
}

function unmangle(mangled) {
    return mangled.slice(1);
}

Object.addEach(Dict.prototype, GenericCollection.prototype);
Object.addEach(Dict.prototype, GenericMap.prototype);
Object.addEach(Dict.prototype, PropertyChanges.prototype);

Dict.prototype.constructClone = function (values) {
    return new this.constructor(values, this.mangle, this.getDefault);
};

Dict.prototype.assertString = function (key) {
    if (typeof key !== "string") {
        throw new TypeError("key must be a string but Got " + key);
    }
}

Dict.prototype.get = function (key, defaultValue) {
    this.assertString(key);
    var mangled = mangle(key);
    if (mangled in this.store) {
        return this.store[mangled];
    } else if (arguments.length > 1) {
        return defaultValue;
    } else {
        return this.getDefault(key);
    }
};

Dict.prototype.set = function (key, value) {
    this.assertString(key);
    var mangled = mangle(key);
    if (mangled in this.store) { // update
        if (this.dispatchesBeforeMapChanges) {
            this.dispatchBeforeMapChange(key, this.store[mangled]);
        }
        this.store[mangled] = value;
        if (this.dispatchesMapChanges) {
            this.dispatchMapChange(key, value);
        }
        return false;
    } else { // create
        if (this.dispatchesMapChanges) {
            this.dispatchBeforeMapChange(key, undefined);
        }
        this.length++;
        this.store[mangled] = value;
        if (this.dispatchesMapChanges) {
            this.dispatchMapChange(key, value);
        }
        return true;
    }
};

Dict.prototype.has = function (key) {
    this.assertString(key);
    var mangled = mangle(key);
    return mangled in this.store;
};

Dict.prototype["delete"] = function (key) {
    this.assertString(key);
    var mangled = mangle(key);
    if (mangled in this.store) {
        if (this.dispatchesMapChanges) {
            this.dispatchBeforeMapChange(key, this.store[mangled]);
        }
        delete this.store[mangle(key)];
        this.length--;
        if (this.dispatchesMapChanges) {
            this.dispatchMapChange(key, undefined);
        }
        return true;
    }
    return false;
};

Dict.prototype.clear = function () {
    var key, mangled;
    for (mangled in this.store) {
        key = unmangle(mangled);
        if (this.dispatchesMapChanges) {
            this.dispatchBeforeMapChange(key, this.store[mangled]);
        }
        delete this.store[mangled];
        if (this.dispatchesMapChanges) {
            this.dispatchMapChange(key, undefined);
        }
    }
    this.length = 0;
};

Dict.prototype.reduce = function (callback, basis, thisp) {
    for (var mangled in this.store) {
        basis = callback.call(thisp, basis, this.store[mangled], unmangle(mangled), this);
    }
    return basis;
};

Dict.prototype.reduceRight = function (callback, basis, thisp) {
    var self = this;
    var store = this.store;
    return Object.keys(this.store).reduceRight(function (basis, mangled) {
        return callback.call(thisp, basis, store[mangled], unmangle(mangled), self);
    }, basis);
};

Dict.prototype.one = function () {
    var key;
    for (key in this.store) {
        return this.store[key];
    }
};


},{"./generic-collection":27,"./generic-map":28,"./listen/property-changes":33,"./shim":40}],25:[function(require,module,exports){
"use strict";

var Shim = require("./shim");
var Set = require("./fast-set");
var GenericCollection = require("./generic-collection");
var GenericMap = require("./generic-map");
var PropertyChanges = require("./listen/property-changes");

module.exports = FastMap;

function FastMap(values, equals, hash, getDefault) {
    if (!(this instanceof FastMap)) {
        return new FastMap(values, equals, hash, getDefault);
    }
    equals = equals || Object.equals;
    hash = hash || Object.hash;
    getDefault = getDefault || Function.noop;
    this.contentEquals = equals;
    this.contentHash = hash;
    this.getDefault = getDefault;
    this.store = new Set(
        undefined,
        function keysEqual(a, b) {
            return equals(a.key, b.key);
        },
        function keyHash(item) {
            return hash(item.key);
        }
    );
    this.length = 0;
    this.addEach(values);
}

FastMap.FastMap = FastMap; // hack so require("fast-map").FastMap will work in MontageJS

Object.addEach(FastMap.prototype, GenericCollection.prototype);
Object.addEach(FastMap.prototype, GenericMap.prototype);
Object.addEach(FastMap.prototype, PropertyChanges.prototype);

FastMap.prototype.constructClone = function (values) {
    return new this.constructor(
        values,
        this.contentEquals,
        this.contentHash,
        this.getDefault
    );
};

FastMap.prototype.log = function (charmap, stringify) {
    stringify = stringify || this.stringify;
    this.store.log(charmap, stringify);
};

FastMap.prototype.stringify = function (item, leader) {
    return leader + JSON.stringify(item.key) + ": " + JSON.stringify(item.value);
}


},{"./fast-set":26,"./generic-collection":27,"./generic-map":28,"./listen/property-changes":33,"./shim":40}],26:[function(require,module,exports){
"use strict";

var Shim = require("./shim");
var Dict = require("./dict");
var List = require("./list");
var GenericCollection = require("./generic-collection");
var GenericSet = require("./generic-set");
var TreeLog = require("./tree-log");
var PropertyChanges = require("./listen/property-changes");

var object_has = Object.prototype.hasOwnProperty;

module.exports = FastSet;

function FastSet(values, equals, hash, getDefault) {
    if (!(this instanceof FastSet)) {
        return new FastSet(values, equals, hash, getDefault);
    }
    equals = equals || Object.equals;
    hash = hash || Object.hash;
    getDefault = getDefault || Function.noop;
    this.contentEquals = equals;
    this.contentHash = hash;
    this.getDefault = getDefault;
    this.buckets = new this.Buckets(null, this.Bucket);
    this.length = 0;
    this.addEach(values);
}

FastSet.FastSet = FastSet; // hack so require("fast-set").FastSet will work in MontageJS

Object.addEach(FastSet.prototype, GenericCollection.prototype);
Object.addEach(FastSet.prototype, GenericSet.prototype);
Object.addEach(FastSet.prototype, PropertyChanges.prototype);

FastSet.prototype.Buckets = Dict;
FastSet.prototype.Bucket = List;

FastSet.prototype.constructClone = function (values) {
    return new this.constructor(
        values,
        this.contentEquals,
        this.contentHash,
        this.getDefault
    );
};

FastSet.prototype.has = function (value) {
    var hash = this.contentHash(value);
    return this.buckets.get(hash).has(value);
};

FastSet.prototype.get = function (value) {
    var hash = this.contentHash(value);
    var buckets = this.buckets;
    if (buckets.has(hash)) {
        return buckets.get(hash).get(value);
    } else {
        return this.getDefault(value);
    }
};

FastSet.prototype['delete'] = function (value) {
    var hash = this.contentHash(value);
    var buckets = this.buckets;
    if (buckets.has(hash)) {
        var bucket = buckets.get(hash);
        if (bucket["delete"](value)) {
            this.length--;
            if (bucket.length === 0) {
                buckets["delete"](hash);
            }
            return true;
        }
    }
    return false;
};

FastSet.prototype.clear = function () {
    this.buckets.clear();
    this.length = 0;
};

FastSet.prototype.add = function (value) {
    var hash = this.contentHash(value);
    var buckets = this.buckets;
    if (!buckets.has(hash)) {
        buckets.set(hash, new this.Bucket(null, this.contentEquals));
    }
    if (!buckets.get(hash).has(value)) {
        buckets.get(hash).add(value);
        this.length++;
        return true;
    }
    return false;
};

FastSet.prototype.reduce = function (callback, basis /*, thisp*/) {
    var thisp = arguments[2];
    var buckets = this.buckets;
    var index = 0;
    return buckets.reduce(function (basis, bucket) {
        return bucket.reduce(function (basis, value) {
            return callback.call(thisp, basis, value, index++, this);
        }, basis, this);
    }, basis, this);
};

FastSet.prototype.one = function () {
    if (this.length > 0) {
        return this.buckets.one().one();
    }
};

FastSet.prototype.iterate = function () {
    return this.buckets.values().flatten().iterate();
};

FastSet.prototype.log = function (charmap, logNode, callback, thisp) {
    charmap = charmap || TreeLog.unicodeSharp;
    logNode = logNode || this.logNode;
    if (!callback) {
        callback = console.log;
        thisp = console;
    }
    callback = callback.bind(thisp);

    var buckets = this.buckets;
    var hashes = buckets.keys();
    hashes.forEach(function (hash, index) {
        var branch;
        var leader;
        if (index === hashes.length - 1) {
            branch = charmap.fromAbove;
            leader = ' ';
        } else if (index === 0) {
            branch = charmap.branchDown;
            leader = charmap.strafe;
        } else {
            branch = charmap.fromBoth;
            leader = charmap.strafe;
        }
        var bucket = buckets.get(hash);
        callback.call(thisp, branch + charmap.through + charmap.branchDown + ' ' + hash);
        bucket.forEach(function (value, node) {
            var branch, below;
            if (node === bucket.head.prev) {
                branch = charmap.fromAbove;
                below = ' ';
            } else {
                branch = charmap.fromBoth;
                below = charmap.strafe;
            }
            var written;
            logNode(
                node,
                function (line) {
                    if (!written) {
                        callback.call(thisp, leader + ' ' + branch + charmap.through + charmap.through + line);
                        written = true;
                    } else {
                        callback.call(thisp, leader + ' ' + below + '  ' + line);
                    }
                },
                function (line) {
                    callback.call(thisp, leader + ' ' + charmap.strafe + '  ' + line);
                }
            );
        });
    });
};

FastSet.prototype.logNode = function (node, write) {
    var value = node.value;
    if (Object(value) === value) {
        JSON.stringify(value, null, 4).split("\n").forEach(function (line) {
            write(" " + line);
        });
    } else {
        write(" " + value);
    }
};


},{"./dict":24,"./generic-collection":27,"./generic-set":30,"./list":31,"./listen/property-changes":33,"./shim":40,"./tree-log":41}],27:[function(require,module,exports){
"use strict";

module.exports = GenericCollection;
function GenericCollection() {
    throw new Error("Can't construct. GenericCollection is a mixin.");
}

GenericCollection.prototype.addEach = function (values) {
    if (values && Object(values) === values) {
        if (typeof values.forEach === "function") {
            values.forEach(this.add, this);
        } else if (typeof values.length === "number") {
            // Array-like objects that do not implement forEach, ergo,
            // Arguments
            for (var i = 0; i < values.length; i++) {
                this.add(values[i], i);
            }
        } else {
            Object.keys(values).forEach(function (key) {
                this.add(values[key], key);
            }, this);
        }
    }
    return this;
};

// This is sufficiently generic for Map (since the value may be a key)
// and ordered collections (since it forwards the equals argument)
GenericCollection.prototype.deleteEach = function (values, equals) {
    values.forEach(function (value) {
        this["delete"](value, equals);
    }, this);
    return this;
};

// all of the following functions are implemented in terms of "reduce".
// some need "constructClone".

GenericCollection.prototype.forEach = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    return this.reduce(function (undefined, value, key, object, depth) {
        callback.call(thisp, value, key, object, depth);
    }, undefined);
};

GenericCollection.prototype.map = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var result = [];
    this.reduce(function (undefined, value, key, object, depth) {
        result.push(callback.call(thisp, value, key, object, depth));
    }, undefined);
    return result;
};

GenericCollection.prototype.enumerate = function (start) {
    if (start == null) {
        start = 0;
    }
    var result = [];
    this.reduce(function (undefined, value) {
        result.push([start++, value]);
    }, undefined);
    return result;
};

GenericCollection.prototype.group = function (callback, thisp, equals) {
    equals = equals || Object.equals;
    var groups = [];
    var keys = [];
    this.forEach(function (value, key, object) {
        var key = callback.call(thisp, value, key, object);
        var index = keys.indexOf(key, equals);
        var group;
        if (index === -1) {
            group = [];
            groups.push([key, group]);
            keys.push(key);
        } else {
            group = groups[index][1];
        }
        group.push(value);
    });
    return groups;
};

GenericCollection.prototype.toArray = function () {
    return this.map(Function.identity);
};

// this depends on stringable keys, which apply to Array and Iterator
// because they have numeric keys and all Maps since they may use
// strings as keys.  List, Set, and SortedSet have nodes for keys, so
// toObject would not be meaningful.
GenericCollection.prototype.toObject = function () {
    var object = {};
    this.reduce(function (undefined, value, key) {
        object[key] = value;
    }, undefined);
    return object;
};

GenericCollection.prototype.filter = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var result = this.constructClone();
    this.reduce(function (undefined, value, key, object, depth) {
        if (callback.call(thisp, value, key, object, depth)) {
            result.add(value);
        }
    }, undefined);
    return result;
};

GenericCollection.prototype.every = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    return this.reduce(function (result, value, key, object, depth) {
        return result && callback.call(thisp, value, key, object, depth);
    }, true);
};

GenericCollection.prototype.some = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    return this.reduce(function (result, value, key, object, depth) {
        return result || callback.call(thisp, value, key, object, depth);
    }, false);
};

GenericCollection.prototype.all = function () {
    return this.every(Boolean);
};

GenericCollection.prototype.any = function () {
    return this.some(Boolean);
};

GenericCollection.prototype.min = function (compare) {
    compare = compare || this.contentCompare || Object.compare;
    var first = true;
    return this.reduce(function (result, value) {
        if (first) {
            first = false;
            return value;
        } else {
            return compare(value, result) < 0 ? value : result;
        }
    }, undefined);
};

GenericCollection.prototype.max = function (compare) {
    compare = compare || this.contentCompare || Object.compare;
    var first = true;
    return this.reduce(function (result, value) {
        if (first) {
            first = false;
            return value;
        } else {
            return compare(value, result) > 0 ? value : result;
        }
    }, undefined);
};

GenericCollection.prototype.sum = function (zero) {
    zero = zero === undefined ? 0 : zero;
    return this.reduce(function (a, b) {
        return a + b;
    }, zero);
};

GenericCollection.prototype.average = function (zero) {
    var sum = zero === undefined ? 0 : zero;
    var count = zero === undefined ? 0 : zero;
    this.reduce(function (undefined, value) {
        sum += value;
        count += 1;
    }, undefined);
    return sum / count;
};

GenericCollection.prototype.concat = function () {
    var result = this.constructClone(this);
    for (var i = 0; i < arguments.length; i++) {
        result.addEach(arguments[i]);
    }
    return result;
};

GenericCollection.prototype.flatten = function () {
    var self = this;
    return this.reduce(function (result, array) {
        array.forEach(function (value) {
            this.push(value);
        }, result, self);
        return result;
    }, []);
};

GenericCollection.prototype.zip = function () {
    var table = Array.prototype.slice.call(arguments);
    table.unshift(this);
    return Array.unzip(table);
}

GenericCollection.prototype.join = function (delimiter) {
    return this.reduce(function (result, string) {
        return result + delimiter + string;
    });
};

GenericCollection.prototype.sorted = function (compare, by, order) {
    compare = compare || this.contentCompare || Object.compare;
    // account for comparators generated by Function.by
    if (compare.by) {
        by = compare.by;
        compare = compare.compare || this.contentCompare || Object.compare;
    } else {
        by = by || Function.identity;
    }
    if (order === undefined)
        order = 1;
    return this.map(function (item) {
        return {
            by: by(item),
            value: item
        };
    })
    .sort(function (a, b) {
        return compare(a.by, b.by) * order;
    })
    .map(function (pair) {
        return pair.value;
    });
};

GenericCollection.prototype.reversed = function () {
    return this.constructClone(this).reverse();
};

GenericCollection.prototype.clone = function (depth, memo) {
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return this;
    }
    var clone = this.constructClone();
    this.forEach(function (value, key) {
        clone.add(Object.clone(value, depth - 1, memo), key);
    }, this);
    return clone;
};

GenericCollection.prototype.only = function () {
    if (this.length === 1) {
        return this.one();
    }
};

GenericCollection.prototype.iterator = function () {
    return this.iterate.apply(this, arguments);
};

require("./shim-array");


},{"./shim-array":36}],28:[function(require,module,exports){
"use strict";

var Object = require("./shim-object");
var MapChanges = require("./listen/map-changes");
var PropertyChanges = require("./listen/property-changes");

module.exports = GenericMap;
function GenericMap() {
    throw new Error("Can't construct. GenericMap is a mixin.");
}

Object.addEach(GenericMap.prototype, MapChanges.prototype);
Object.addEach(GenericMap.prototype, PropertyChanges.prototype);

// all of these methods depend on the constructor providing a `store` set

GenericMap.prototype.isMap = true;

GenericMap.prototype.addEach = function (values) {
    if (values && Object(values) === values) {
        if (typeof values.forEach === "function") {
            // copy map-alikes
            if (values.isMap === true) {
                values.forEach(function (value, key) {
                    this.set(key, value);
                }, this);
            // iterate key value pairs of other iterables
            } else {
                values.forEach(function (pair) {
                    this.set(pair[0], pair[1]);
                }, this);
            }
        } else {
            // copy other objects as map-alikes
            Object.keys(values).forEach(function (key) {
                this.set(key, values[key]);
            }, this);
        }
    }
    return this;
}

GenericMap.prototype.get = function (key, defaultValue) {
    var item = this.store.get(new this.Item(key));
    if (item) {
        return item.value;
    } else if (arguments.length > 1) {
        return defaultValue;
    } else {
        return this.getDefault(key);
    }
};

GenericMap.prototype.set = function (key, value) {
    var item = new this.Item(key, value);
    var found = this.store.get(item);
    var grew = false;
    if (found) { // update
        if (this.dispatchesMapChanges) {
            this.dispatchBeforeMapChange(key, found.value);
        }
        found.value = value;
        if (this.dispatchesMapChanges) {
            this.dispatchMapChange(key, value);
        }
    } else { // create
        if (this.dispatchesMapChanges) {
            this.dispatchBeforeMapChange(key, undefined);
        }
        if (this.store.add(item)) {
            this.length++;
            grew = true;
        }
        if (this.dispatchesMapChanges) {
            this.dispatchMapChange(key, value);
        }
    }
    return grew;
};

GenericMap.prototype.add = function (value, key) {
    return this.set(key, value);
};

GenericMap.prototype.has = function (key) {
    return this.store.has(new this.Item(key));
};

GenericMap.prototype['delete'] = function (key) {
    var item = new this.Item(key);
    if (this.store.has(item)) {
        var from = this.store.get(item).value;
        if (this.dispatchesMapChanges) {
            this.dispatchBeforeMapChange(key, from);
        }
        this.store["delete"](item);
        this.length--;
        if (this.dispatchesMapChanges) {
            this.dispatchMapChange(key, undefined);
        }
        return true;
    }
    return false;
};

GenericMap.prototype.clear = function () {
    var keys;
    if (this.dispatchesMapChanges) {
        this.forEach(function (value, key) {
            this.dispatchBeforeMapChange(key, value);
        }, this);
        keys = this.keys();
    }
    this.store.clear();
    this.length = 0;
    if (this.dispatchesMapChanges) {
        keys.forEach(function (key) {
            this.dispatchMapChange(key);
        }, this);
    }
};

GenericMap.prototype.reduce = function (callback, basis, thisp) {
    return this.store.reduce(function (basis, item) {
        return callback.call(thisp, basis, item.value, item.key, this);
    }, basis, this);
};

GenericMap.prototype.reduceRight = function (callback, basis, thisp) {
    return this.store.reduceRight(function (basis, item) {
        return callback.call(thisp, basis, item.value, item.key, this);
    }, basis, this);
};

GenericMap.prototype.keys = function () {
    return this.map(function (value, key) {
        return key;
    });
};

GenericMap.prototype.values = function () {
    return this.map(Function.identity);
};

GenericMap.prototype.entries = function () {
    return this.map(function (value, key) {
        return [key, value];
    });
};

// XXX deprecated
GenericMap.prototype.items = function () {
    return this.entries();
};

GenericMap.prototype.equals = function (that, equals) {
    equals = equals || Object.equals;
    if (this === that) {
        return true;
    } else if (Object.can(that, "every")) {
        return that.length === this.length && that.every(function (value, key) {
            return equals(this.get(key), value);
        }, this);
    } else {
        var keys = Object.keys(that);
        return keys.length === this.length && Object.keys(that).every(function (key) {
            return equals(this.get(key), that[key]);
        }, this);
    }
};

GenericMap.prototype.Item = Item;

function Item(key, value) {
    this.key = key;
    this.value = value;
}

Item.prototype.equals = function (that) {
    return Object.equals(this.key, that.key) && Object.equals(this.value, that.value);
};

Item.prototype.compare = function (that) {
    return Object.compare(this.key, that.key);
};


},{"./listen/map-changes":32,"./listen/property-changes":33,"./shim-object":38}],29:[function(require,module,exports){

var Object = require("./shim-object");

module.exports = GenericOrder;
function GenericOrder() {
    throw new Error("Can't construct. GenericOrder is a mixin.");
}

GenericOrder.prototype.equals = function (that, equals) {
    equals = equals || this.contentEquals || Object.equals;

    if (this === that) {
        return true;
    }
    if (!that) {
        return false;
    }

    var self = this;
    return (
        this.length === that.length &&
        this.zip(that).every(function (pair) {
            return equals(pair[0], pair[1]);
        })
    );
};

GenericOrder.prototype.compare = function (that, compare) {
    compare = compare || this.contentCompare || Object.compare;

    if (this === that) {
        return 0;
    }
    if (!that) {
        return 1;
    }

    var length = Math.min(this.length, that.length);
    var comparison = this.zip(that).reduce(function (comparison, pair, index) {
        if (comparison === 0) {
            if (index >= length) {
                return comparison;
            } else {
                return compare(pair[0], pair[1]);
            }
        } else {
            return comparison;
        }
    }, 0);
    if (comparison === 0) {
        return this.length - that.length;
    }
    return comparison;
};


},{"./shim-object":38}],30:[function(require,module,exports){

module.exports = GenericSet;
function GenericSet() {
    throw new Error("Can't construct. GenericSet is a mixin.");
}

GenericSet.prototype.union = function (that) {
    var union =  this.constructClone(this);
    union.addEach(that);
    return union;
};

GenericSet.prototype.intersection = function (that) {
    return this.constructClone(this.filter(function (value) {
        return that.has(value);
    }));
};

GenericSet.prototype.difference = function (that) {
    var union =  this.constructClone(this);
    union.deleteEach(that);
    return union;
};

GenericSet.prototype.symmetricDifference = function (that) {
    var union = this.union(that);
    var intersection = this.intersection(that);
    return union.difference(intersection);
};

GenericSet.prototype.equals = function (that, equals) {
    var self = this;
    return (
        Object.can(that, "reduce") &&
        this.length === that.length &&
        that.reduce(function (equal, value) {
            return equal && self.has(value, equals);
        }, true)
    );
};

// W3C DOMTokenList API overlap (does not handle variadic arguments)

GenericSet.prototype.contains = function (value) {
    return this.has(value);
};

GenericSet.prototype.remove = function (value) {
    return this["delete"](value);
};

GenericSet.prototype.toggle = function (value) {
    if (this.has(value)) {
        this["delete"](value);
    } else {
        this.add(value);
    }
};


},{}],31:[function(require,module,exports){
"use strict";

module.exports = List;

var Shim = require("./shim");
var GenericCollection = require("./generic-collection");
var GenericOrder = require("./generic-order");
var PropertyChanges = require("./listen/property-changes");
var RangeChanges = require("./listen/range-changes");

function List(values, equals, getDefault) {
    if (!(this instanceof List)) {
        return new List(values, equals, getDefault);
    }
    var head = this.head = new this.Node();
    head.next = head;
    head.prev = head;
    this.contentEquals = equals || Object.equals;
    this.getDefault = getDefault || Function.noop;
    this.length = 0;
    this.addEach(values);
}

List.List = List; // hack so require("list").List will work in MontageJS

Object.addEach(List.prototype, GenericCollection.prototype);
Object.addEach(List.prototype, GenericOrder.prototype);
Object.addEach(List.prototype, PropertyChanges.prototype);
Object.addEach(List.prototype, RangeChanges.prototype);

List.prototype.constructClone = function (values) {
    return new this.constructor(values, this.contentEquals, this.getDefault);
};

List.prototype.find = function (value, equals) {
    equals = equals || this.contentEquals;
    var head = this.head;
    var at = head.next;
    while (at !== head) {
        if (equals(at.value, value)) {
            return at;
        }
        at = at.next;
    }
};

List.prototype.findLast = function (value, equals) {
    equals = equals || this.contentEquals;
    var head = this.head;
    var at = head.prev;
    while (at !== head) {
        if (equals(at.value, value)) {
            return at;
        }
        at = at.prev;
    }
};

List.prototype.has = function (value, equals) {
    return !!this.find(value, equals);
};

List.prototype.get = function (value, equals) {
    var found = this.find(value, equals);
    if (found) {
        return found.value;
    }
    return this.getDefault(value);
};

// LIFO (delete removes the most recently added equivalent value)
List.prototype['delete'] = function (value, equals) {
    var found = this.findLast(value, equals);
    if (found) {
        if (this.dispatchesRangeChanges) {
            var plus = [];
            var minus = [value];
            this.dispatchBeforeRangeChange(plus, minus, found.index);
        }
        found['delete']();
        this.length--;
        if (this.dispatchesRangeChanges) {
            this.updateIndexes(found.next, found.index);
            this.dispatchRangeChange(plus, minus, found.index);
        }
        return true;
    }
    return false;
};

List.prototype.clear = function () {
    var plus, minus;
    if (this.dispatchesRangeChanges) {
        minus = this.toArray();
        plus = [];
        this.dispatchBeforeRangeChange(plus, minus, 0);
    }
    this.head.next = this.head.prev = this.head;
    this.length = 0;
    if (this.dispatchesRangeChanges) {
        this.dispatchRangeChange(plus, minus, 0);
    }
};

List.prototype.add = function (value) {
    var node = new this.Node(value)
    if (this.dispatchesRangeChanges) {
        node.index = this.length;
        this.dispatchBeforeRangeChange([value], [], node.index);
    }
    this.head.addBefore(node);
    this.length++;
    if (this.dispatchesRangeChanges) {
        this.dispatchRangeChange([value], [], node.index);
    }
    return true;
};

List.prototype.push = function () {
    var head = this.head;
    if (this.dispatchesRangeChanges) {
        var plus = Array.prototype.slice.call(arguments);
        var minus = []
        var index = this.length;
        this.dispatchBeforeRangeChange(plus, minus, index);
        var start = this.head.prev;
    }
    for (var i = 0; i < arguments.length; i++) {
        var value = arguments[i];
        var node = new this.Node(value);
        head.addBefore(node);
    }
    this.length += arguments.length;
    if (this.dispatchesRangeChanges) {
        this.updateIndexes(start.next, start.index === undefined ? 0 : start.index + 1);
        this.dispatchRangeChange(plus, minus, index);
    }
};

List.prototype.unshift = function () {
    if (this.dispatchesRangeChanges) {
        var plus = Array.prototype.slice.call(arguments);
        var minus = [];
        this.dispatchBeforeRangeChange(plus, minus, 0);
    }
    var at = this.head;
    for (var i = 0; i < arguments.length; i++) {
        var value = arguments[i];
        var node = new this.Node(value);
        at.addAfter(node);
        at = node;
    }
    this.length += arguments.length;
    if (this.dispatchesRangeChanges) {
        this.updateIndexes(this.head.next, 0);
        this.dispatchRangeChange(plus, minus, 0);
    }
};

List.prototype.pop = function () {
    var value;
    var head = this.head;
    if (head.prev !== head) {
        value = head.prev.value;
        if (this.dispatchesRangeChanges) {
            var plus = [];
            var minus = [value];
            var index = this.length - 1;
            this.dispatchBeforeRangeChange(plus, minus, index);
        }
        head.prev['delete']();
        this.length--;
        if (this.dispatchesRangeChanges) {
            this.dispatchRangeChange(plus, minus, index);
        }
    }
    return value;
};

List.prototype.shift = function () {
    var value;
    var head = this.head;
    if (head.prev !== head) {
        value = head.next.value;
        if (this.dispatchesRangeChanges) {
            var plus = [];
            var minus = [value];
            this.dispatchBeforeRangeChange(plus, minus, 0);
        }
        head.next['delete']();
        this.length--;
        if (this.dispatchesRangeChanges) {
            this.updateIndexes(this.head.next, 0);
            this.dispatchRangeChange(plus, minus, 0);
        }
    }
    return value;
};

List.prototype.peek = function () {
    if (this.head !== this.head.next) {
        return this.head.next.value;
    }
};

List.prototype.poke = function (value) {
    if (this.head !== this.head.next) {
        this.head.next.value = value;
    } else {
        this.push(value);
    }
};

List.prototype.one = function () {
    return this.peek();
};

// an internal utility for coercing index offsets to nodes
List.prototype.scan = function (at, fallback) {
    var head = this.head;
    if (typeof at === "number") {
        var count = at;
        if (count >= 0) {
            at = head.next;
            while (count) {
                count--;
                at = at.next;
                if (at == head) {
                    break;
                }
            }
        } else {
            at = head;
            while (count < 0) {
                count++;
                at = at.prev;
                if (at == head) {
                    break;
                }
            }
        }
        return at;
    } else {
        return at || fallback;
    }
};

// at and end may both be positive or negative numbers (in which cases they
// correspond to numeric indicies, or nodes)
List.prototype.slice = function (at, end) {
    var sliced = [];
    var head = this.head;
    at = this.scan(at, head.next);
    end = this.scan(end, head);

    while (at !== end && at !== head) {
        sliced.push(at.value);
        at = at.next;
    }

    return sliced;
};

List.prototype.splice = function (at, length /*...plus*/) {
    return this.swap(at, length, Array.prototype.slice.call(arguments, 2));
};

List.prototype.swap = function (start, length, plus) {
    var initial = start;
    // start will be head if start is null or -1 (meaning from the end), but
    // will be head.next if start is 0 (meaning from the beginning)
    start = this.scan(start, this.head);
    if (length == null) {
        length = Infinity;
    }
    plus = Array.from(plus);

    // collect the minus array
    var minus = [];
    var at = start;
    while (length-- && length >= 0 && at !== this.head) {
        minus.push(at.value);
        at = at.next;
    }

    // before range change
    var index, startNode;
    if (this.dispatchesRangeChanges) {
        if (start === this.head) {
            index = this.length;
        } else if (start.prev === this.head) {
            index = 0;
        } else {
            index = start.index;
        }
        startNode = start.prev;
        this.dispatchBeforeRangeChange(plus, minus, index);
    }

    // delete minus
    var at = start;
    for (var i = 0, at = start; i < minus.length; i++, at = at.next) {
        at["delete"]();
    }
    // add plus
    if (initial == null && at === this.head) {
        at = this.head.next;
    }
    for (var i = 0; i < plus.length; i++) {
        var node = new this.Node(plus[i]);
        at.addBefore(node);
    }
    // adjust length
    this.length += plus.length - minus.length;

    // after range change
    if (this.dispatchesRangeChanges) {
        if (start === this.head) {
            this.updateIndexes(this.head.next, 0);
        } else {
            this.updateIndexes(startNode.next, startNode.index + 1);
        }
        this.dispatchRangeChange(plus, minus, index);
    }

    return minus;
};

List.prototype.reverse = function () {
    if (this.dispatchesRangeChanges) {
        var minus = this.toArray();
        var plus = minus.reversed();
        this.dispatchBeforeRangeChange(plus, minus, 0);
    }
    var at = this.head;
    do {
        var temp = at.next;
        at.next = at.prev;
        at.prev = temp;
        at = at.next;
    } while (at !== this.head);
    if (this.dispatchesRangeChanges) {
        this.dispatchRangeChange(plus, minus, 0);
    }
    return this;
};

List.prototype.sort = function () {
    this.swap(0, this.length, this.sorted());
};

// TODO account for missing basis argument
List.prototype.reduce = function (callback, basis /*, thisp*/) {
    var thisp = arguments[2];
    var head = this.head;
    var at = head.next;
    while (at !== head) {
        basis = callback.call(thisp, basis, at.value, at, this);
        at = at.next;
    }
    return basis;
};

List.prototype.reduceRight = function (callback, basis /*, thisp*/) {
    var thisp = arguments[2];
    var head = this.head;
    var at = head.prev;
    while (at !== head) {
        basis = callback.call(thisp, basis, at.value, at, this);
        at = at.prev;
    }
    return basis;
};

List.prototype.updateIndexes = function (node, index) {
    while (node !== this.head) {
        node.index = index++;
        node = node.next;
    }
};

List.prototype.makeObservable = function () {
    this.head.index = -1;
    this.updateIndexes(this.head.next, 0);
    this.dispatchesRangeChanges = true;
};

List.prototype.iterate = function () {
    return new ListIterator(this.head);
};

function ListIterator(head) {
    this.head = head;
    this.at = head.next;
};

ListIterator.prototype.next = function () {
    if (this.at === this.head) {
        throw StopIteration;
    } else {
        var value = this.at.value;
        this.at = this.at.next;
        return value;
    }
};

List.prototype.Node = Node;

function Node(value) {
    this.value = value;
    this.prev = null;
    this.next = null;
};

Node.prototype['delete'] = function () {
    this.prev.next = this.next;
    this.next.prev = this.prev;
};

Node.prototype.addBefore = function (node) {
    var prev = this.prev;
    this.prev = node;
    node.prev = prev;
    prev.next = node;
    node.next = this;
};

Node.prototype.addAfter = function (node) {
    var next = this.next;
    this.next = node;
    node.next = next;
    next.prev = node;
    node.prev = this;
};


},{"./generic-collection":27,"./generic-order":29,"./listen/property-changes":33,"./listen/range-changes":34,"./shim":40}],32:[function(require,module,exports){
"use strict";

var WeakMap = require("weak-map");
var List = require("../list");

module.exports = MapChanges;
function MapChanges() {
    throw new Error("Can't construct. MapChanges is a mixin.");
}

var object_owns = Object.prototype.hasOwnProperty;

/*
    Object map change descriptors carry information necessary for adding,
    removing, dispatching, and shorting events to listeners for map changes
    for a particular key on a particular object.  These descriptors are used
    here for shallow map changes.

    {
        willChangeListeners:Array(Function)
        changeListeners:Array(Function)
    }
*/

var mapChangeDescriptors = new WeakMap();

MapChanges.prototype.getAllMapChangeDescriptors = function () {
    var Dict = require("../dict");
    if (!mapChangeDescriptors.has(this)) {
        mapChangeDescriptors.set(this, Dict());
    }
    return mapChangeDescriptors.get(this);
};

MapChanges.prototype.getMapChangeDescriptor = function (token) {
    var tokenChangeDescriptors = this.getAllMapChangeDescriptors();
    token = token || "";
    if (!tokenChangeDescriptors.has(token)) {
        tokenChangeDescriptors.set(token, {
            willChangeListeners: new List(),
            changeListeners: new List()
        });
    }
    return tokenChangeDescriptors.get(token);
};

MapChanges.prototype.addMapChangeListener = function (listener, token, beforeChange) {
    if (!this.isObservable && this.makeObservable) {
        // for Array
        this.makeObservable();
    }
    var descriptor = this.getMapChangeDescriptor(token);
    var listeners;
    if (beforeChange) {
        listeners = descriptor.willChangeListeners;
    } else {
        listeners = descriptor.changeListeners;
    }
    listeners.push(listener);
    Object.defineProperty(this, "dispatchesMapChanges", {
        value: true,
        writable: true,
        configurable: true,
        enumerable: false
    });

    var self = this;
    return function cancelMapChangeListener() {
        if (!self) {
            // TODO throw new Error("Can't remove map change listener again");
            return;
        }
        self.removeMapChangeListener(listener, token, beforeChange);
        self = null;
    };
};

MapChanges.prototype.removeMapChangeListener = function (listener, token, beforeChange) {
    var descriptor = this.getMapChangeDescriptor(token);

    var listeners;
    if (beforeChange) {
        listeners = descriptor.willChangeListeners;
    } else {
        listeners = descriptor.changeListeners;
    }

    var node = listeners.findLast(listener);
    if (!node) {
        throw new Error("Can't remove listener: does not exist.");
    }
    node["delete"]();
};

MapChanges.prototype.dispatchMapChange = function (key, value, beforeChange) {
    var descriptors = this.getAllMapChangeDescriptors();
    var changeName = "Map" + (beforeChange ? "WillChange" : "Change");
    descriptors.forEach(function (descriptor, token) {

        if (descriptor.isActive) {
            return;
        } else {
            descriptor.isActive = true;
        }

        var listeners;
        if (beforeChange) {
            listeners = descriptor.willChangeListeners;
        } else {
            listeners = descriptor.changeListeners;
        }

        var tokenName = "handle" + (
            token.slice(0, 1).toUpperCase() +
            token.slice(1)
        ) + changeName;

        try {
            // dispatch to each listener
            listeners.forEach(function (listener) {
                if (listener[tokenName]) {
                    listener[tokenName](value, key, this);
                } else if (listener.call) {
                    listener.call(listener, value, key, this);
                } else {
                    throw new Error("Handler " + listener + " has no method " + tokenName + " and is not callable");
                }
            }, this);
        } finally {
            descriptor.isActive = false;
        }

    }, this);
};

MapChanges.prototype.addBeforeMapChangeListener = function (listener, token) {
    return this.addMapChangeListener(listener, token, true);
};

MapChanges.prototype.removeBeforeMapChangeListener = function (listener, token) {
    return this.removeMapChangeListener(listener, token, true);
};

MapChanges.prototype.dispatchBeforeMapChange = function (key, value) {
    return this.dispatchMapChange(key, value, true);
};


},{"../dict":24,"../list":31,"weak-map":35}],33:[function(require,module,exports){
/*
    Based in part on observable arrays from Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

/*
    This module is responsible for observing changes to owned properties of
    objects and changes to the content of arrays caused by method calls.
    The interface for observing array content changes establishes the methods
    necessary for any collection with observable content.
*/

require("../shim");
var WeakMap = require("weak-map");

var object_owns = Object.prototype.hasOwnProperty;

/*
    Object property descriptors carry information necessary for adding,
    removing, dispatching, and shorting events to listeners for property changes
    for a particular key on a particular object.  These descriptors are used
    here for shallow property changes.

    {
        willChangeListeners:Array(Function)
        changeListeners:Array(Function)
    }
*/
var propertyChangeDescriptors = new WeakMap();

// Maybe remove entries from this table if the corresponding object no longer
// has any property change listeners for any key.  However, the cost of
// book-keeping is probably not warranted since it would be rare for an
// observed object to no longer be observed unless it was about to be disposed
// of or reused as an observable.  The only benefit would be in avoiding bulk
// calls to dispatchOwnPropertyChange events on objects that have no listeners.

/*
    To observe shallow property changes for a particular key of a particular
    object, we install a property descriptor on the object that overrides the previous
    descriptor.  The overridden descriptors are stored in this weak map.  The
    weak map associates an object with another object that maps property names
    to property descriptors.

    overriddenObjectDescriptors.get(object)[key]

    We retain the old descriptor for various purposes.  For one, if the property
    is no longer being observed by anyone, we revert the property descriptor to
    the original.  For "value" descriptors, we store the actual value of the
    descriptor on the overridden descriptor, so when the property is reverted, it
    retains the most recently set value.  For "get" and "set" descriptors,
    we observe then forward "get" and "set" operations to the original descriptor.
*/
var overriddenObjectDescriptors = new WeakMap();

module.exports = PropertyChanges;

function PropertyChanges() {
    throw new Error("This is an abstract interface. Mix it. Don't construct it");
}

PropertyChanges.debug = true;

PropertyChanges.prototype.getOwnPropertyChangeDescriptor = function (key) {
    if (!propertyChangeDescriptors.has(this)) {
        propertyChangeDescriptors.set(this, {});
    }
    var objectPropertyChangeDescriptors = propertyChangeDescriptors.get(this);
    if (!object_owns.call(objectPropertyChangeDescriptors, key)) {
        objectPropertyChangeDescriptors[key] = {
            willChangeListeners: [],
            changeListeners: []
        };
    }
    return objectPropertyChangeDescriptors[key];
};

PropertyChanges.prototype.hasOwnPropertyChangeDescriptor = function (key) {
    if (!propertyChangeDescriptors.has(this)) {
        return false;
    }
    if (!key) {
        return true;
    }
    var objectPropertyChangeDescriptors = propertyChangeDescriptors.get(this);
    if (!object_owns.call(objectPropertyChangeDescriptors, key)) {
        return false;
    }
    return true;
};

PropertyChanges.prototype.addOwnPropertyChangeListener = function (key, listener, beforeChange) {
    if (this.makeObservable && !this.isObservable) {
        this.makeObservable(); // particularly for observable arrays, for
        // their length property
    }
    var descriptor = PropertyChanges.getOwnPropertyChangeDescriptor(this, key);
    var listeners;
    if (beforeChange) {
        listeners = descriptor.willChangeListeners;
    } else {
        listeners = descriptor.changeListeners;
    }
    PropertyChanges.makePropertyObservable(this, key);
    listeners.push(listener);

    var self = this;
    return function cancelOwnPropertyChangeListener() {
        PropertyChanges.removeOwnPropertyChangeListener(self, key, listeners, beforeChange);
        self = null;
    };
};

PropertyChanges.prototype.addBeforeOwnPropertyChangeListener = function (key, listener) {
    return PropertyChanges.addOwnPropertyChangeListener(this, key, listener, true);
};

PropertyChanges.prototype.removeOwnPropertyChangeListener = function (key, listener, beforeChange) {
    var descriptor = PropertyChanges.getOwnPropertyChangeDescriptor(this, key);

    var listeners;
    if (beforeChange) {
        listeners = descriptor.willChangeListeners;
    } else {
        listeners = descriptor.changeListeners;
    }

    var index = listeners.lastIndexOf(listener);
    if (index === -1) {
        throw new Error("Can't remove listener: does not exist.");
    }
    listeners.splice(index, 1);

    if (descriptor.changeListeners.length + descriptor.willChangeListeners.length === 0) {
        PropertyChanges.makePropertyUnobservable(this, key);
    }
};

PropertyChanges.prototype.removeBeforeOwnPropertyChangeListener = function (key, listener) {
    return PropertyChanges.removeOwnPropertyChangeListener(this, key, listener, true);
};

PropertyChanges.prototype.dispatchOwnPropertyChange = function (key, value, beforeChange) {
    var descriptor = PropertyChanges.getOwnPropertyChangeDescriptor(this, key);

    if (descriptor.isActive) {
        return;
    }
    descriptor.isActive = true;

    var listeners;
    if (beforeChange) {
        listeners = descriptor.willChangeListeners;
    } else {
        listeners = descriptor.changeListeners;
    }

    var changeName = (beforeChange ? "Will" : "") + "Change";
    var genericHandlerName = "handleProperty" + changeName;
    var propertyName = String(key);
    propertyName = propertyName && propertyName[0].toUpperCase() + propertyName.slice(1);
    var specificHandlerName = "handle" + propertyName + changeName;

    try {
        // dispatch to each listener
        listeners.forEach(function (listener) {
            var thisp = listener;
            listener = (
                listener[specificHandlerName] ||
                listener[genericHandlerName] ||
                listener
            );
            if (!listener.call) {
                throw new Error("No event listener for " + specificHandlerName + " or " + genericHandlerName + " or call on " + listener);
            }
            listener.call(thisp, value, key, this);
        }, this);
    } finally {
        descriptor.isActive = false;
    }
};

PropertyChanges.prototype.dispatchBeforeOwnPropertyChange = function (key, listener) {
    return PropertyChanges.dispatchOwnPropertyChange(this, key, listener, true);
};

PropertyChanges.prototype.makePropertyObservable = function (key) {
    // arrays are special.  we do not support direct setting of properties
    // on an array.  instead, call .set(index, value).  this is observable.
    // 'length' property is observable for all mutating methods because
    // our overrides explicitly dispatch that change.
    if (Array.isArray(this)) {
        return;
    }

    if (!Object.isExtensible(this, key)) {
        throw new Error("Can't make property " + JSON.stringify(key) + " observable on " + this + " because object is not extensible");
    }

    var state;
    if (typeof this.__state__ === "object") {
        state = this.__state__;
    } else {
        state = {};
        if (Object.isExtensible(this, "__state__")) {
            Object.defineProperty(this, "__state__", {
                value: state,
                writable: true,
                enumerable: false
            });
        }
    }
    state[key] = this[key];

    // memoize overridden property descriptor table
    if (!overriddenObjectDescriptors.has(this)) {
        overriddenPropertyDescriptors = {};
        overriddenObjectDescriptors.set(this, overriddenPropertyDescriptors);
    }
    var overriddenPropertyDescriptors = overriddenObjectDescriptors.get(this);

    if (object_owns.call(overriddenPropertyDescriptors, key)) {
        // if we have already recorded an overridden property descriptor,
        // we have already installed the observer, so short-here
        return;
    }

    // walk up the prototype chain to find a property descriptor for
    // the property name
    var overriddenDescriptor;
    var attached = this;
    var formerDescriptor = Object.getOwnPropertyDescriptor(attached, key);
    do {
        overriddenDescriptor = Object.getOwnPropertyDescriptor(attached, key);
        if (overriddenDescriptor) {
            break;
        }
        attached = Object.getPrototypeOf(attached);
    } while (attached);
    // or default to an undefined value
    overriddenDescriptor = overriddenDescriptor || {
        value: undefined,
        enumerable: true,
        writable: true,
        configurable: true
    };

    if (!overriddenDescriptor.configurable) {
        throw new Error("Can't observe non-configurable properties");
    }

    // memoize the descriptor so we know not to install another layer,
    // and so we can reuse the overridden descriptor when uninstalling
    overriddenPropertyDescriptors[key] = overriddenDescriptor;

    // give up *after* storing the overridden property descriptor so it
    // can be restored by uninstall.  Unwritable properties are
    // silently not overriden.  Since success is indistinguishable from
    // failure, we let it pass but don't waste time on intercepting
    // get/set.
    if (!overriddenDescriptor.writable && !overriddenDescriptor.set) {
        return;
    }

    // TODO reflect current value on a displayed property

    var propertyListener;
    // in both of these new descriptor variants, we reuse the overridden
    // descriptor to either store the current value or apply getters
    // and setters.  this is handy since we can reuse the overridden
    // descriptor if we uninstall the observer.  We even preserve the
    // assignment semantics, where we get the value from up the
    // prototype chain, and set as an owned property.
    if ('value' in overriddenDescriptor) {
        propertyListener = {
            get: function () {
                return overriddenDescriptor.value
            },
            set: function (value) {
                if (value === overriddenDescriptor.value) {
                    return value;
                }
                PropertyChanges.dispatchBeforeOwnPropertyChange(this, key, overriddenDescriptor.value);
                overriddenDescriptor.value = value;
                state[key] = value;
                PropertyChanges.dispatchOwnPropertyChange(this, key, value);
                return value;
            },
            enumerable: overriddenDescriptor.enumerable,
            configurable: true
        };
    } else { // 'get' or 'set', but not necessarily both
        propertyListener = {
            get: function () {
                if (overriddenDescriptor.get) {
                    return overriddenDescriptor.get.apply(this, arguments);
                }
            },
            set: function (value) {
                var formerValue;

                // get the actual former value if possible
                if (overriddenDescriptor.get) {
                    formerValue = overriddenDescriptor.get.apply(this, arguments);
                }
                // call through to actual setter
                if (overriddenDescriptor.set) {
                    overriddenDescriptor.set.apply(this, arguments)
                }
                // use getter, if possible, to discover whether the set
                // was successful
                if (overriddenDescriptor.get) {
                    value = overriddenDescriptor.get.apply(this, arguments);
                    state[key] = value;
                }
                // if it has not changed, suppress a notification
                if (value === formerValue) {
                    return value;
                }
                PropertyChanges.dispatchBeforeOwnPropertyChange(this, key, formerValue);

                // dispatch the new value: the given value if there is
                // no getter, or the actual value if there is one
                PropertyChanges.dispatchOwnPropertyChange(this, key, value);
                return value;
            },
            enumerable: overriddenDescriptor.enumerable,
            configurable: true
        };
    }

    Object.defineProperty(this, key, propertyListener);
};

PropertyChanges.prototype.makePropertyUnobservable = function (key) {
    // arrays are special.  we do not support direct setting of properties
    // on an array.  instead, call .set(index, value).  this is observable.
    // 'length' property is observable for all mutating methods because
    // our overrides explicitly dispatch that change.
    if (Array.isArray(this)) {
        return;
    }

    if (!overriddenObjectDescriptors.has(this)) {
        throw new Error("Can't uninstall observer on property");
    }
    var overriddenPropertyDescriptors = overriddenObjectDescriptors.get(this);

    if (!overriddenPropertyDescriptors[key]) {
        throw new Error("Can't uninstall observer on property");
    }

    var overriddenDescriptor = overriddenPropertyDescriptors[key];
    delete overriddenPropertyDescriptors[key];

    var state;
    if (typeof this.__state__ === "object") {
        state = this.__state__;
    } else {
        state = {};
        if (Object.isExtensible(this, "__state__")) {
            Object.defineProperty(this, "__state__", {
                value: state,
                writable: true,
                enumerable: false
            });
        }
    }
    delete state[key];

    Object.defineProperty(this, key, overriddenDescriptor);
};

// constructor functions

PropertyChanges.getOwnPropertyChangeDescriptor = function (object, key) {
    if (object.getOwnPropertyChangeDescriptor) {
        return object.getOwnPropertyChangeDescriptor(key);
    } else {
        return PropertyChanges.prototype.getOwnPropertyChangeDescriptor.call(object, key);
    }
};

PropertyChanges.hasOwnPropertyChangeDescriptor = function (object, key) {
    if (object.hasOwnPropertyChangeDescriptor) {
        return object.hasOwnPropertyChangeDescriptor(key);
    } else {
        return PropertyChanges.prototype.hasOwnPropertyChangeDescriptor.call(object, key);
    }
};

PropertyChanges.addOwnPropertyChangeListener = function (object, key, listener, beforeChange) {
    if (!Object.isObject(object)) {
    } else if (object.addOwnPropertyChangeListener) {
        return object.addOwnPropertyChangeListener(key, listener, beforeChange);
    } else {
        return PropertyChanges.prototype.addOwnPropertyChangeListener.call(object, key, listener, beforeChange);
    }
};

PropertyChanges.removeOwnPropertyChangeListener = function (object, key, listener, beforeChange) {
    if (!Object.isObject(object)) {
    } else if (object.removeOwnPropertyChangeListener) {
        return object.removeOwnPropertyChangeListener(key, listener, beforeChange);
    } else {
        return PropertyChanges.prototype.removeOwnPropertyChangeListener.call(object, key, listener, beforeChange);
    }
};

PropertyChanges.dispatchOwnPropertyChange = function (object, key, value, beforeChange) {
    if (!Object.isObject(object)) {
    } else if (object.dispatchOwnPropertyChange) {
        return object.dispatchOwnPropertyChange(key, value, beforeChange);
    } else {
        return PropertyChanges.prototype.dispatchOwnPropertyChange.call(object, key, value, beforeChange);
    }
};

PropertyChanges.addBeforeOwnPropertyChangeListener = function (object, key, listener) {
    return PropertyChanges.addOwnPropertyChangeListener(object, key, listener, true);
};

PropertyChanges.removeBeforeOwnPropertyChangeListener = function (object, key, listener) {
    return PropertyChanges.removeOwnPropertyChangeListener(object, key, listener, true);
};

PropertyChanges.dispatchBeforeOwnPropertyChange = function (object, key, value) {
    return PropertyChanges.dispatchOwnPropertyChange(object, key, value, true);
};

PropertyChanges.makePropertyObservable = function (object, key) {
    if (object.makePropertyObservable) {
        return object.makePropertyObservable(key);
    } else {
        return PropertyChanges.prototype.makePropertyObservable.call(object, key);
    }
};

PropertyChanges.makePropertyUnobservable = function (object, key) {
    if (object.makePropertyUnobservable) {
        return object.makePropertyUnobservable(key);
    } else {
        return PropertyChanges.prototype.makePropertyUnobservable.call(object, key);
    }
};


},{"../shim":40,"weak-map":35}],34:[function(require,module,exports){
"use strict";

var WeakMap = require("weak-map");
var Dict = require("../dict");

var rangeChangeDescriptors = new WeakMap(); // {isActive, willChangeListeners, changeListeners}

module.exports = RangeChanges;
function RangeChanges() {
    throw new Error("Can't construct. RangeChanges is a mixin.");
}

RangeChanges.prototype.getAllRangeChangeDescriptors = function () {
    if (!rangeChangeDescriptors.has(this)) {
        rangeChangeDescriptors.set(this, Dict());
    }
    return rangeChangeDescriptors.get(this);
};

RangeChanges.prototype.getRangeChangeDescriptor = function (token) {
    var tokenChangeDescriptors = this.getAllRangeChangeDescriptors();
    token = token || "";
    if (!tokenChangeDescriptors.has(token)) {
        tokenChangeDescriptors.set(token, {
            isActive: false,
            changeListeners: [],
            willChangeListeners: []
        });
    }
    return tokenChangeDescriptors.get(token);
};

RangeChanges.prototype.addRangeChangeListener = function (listener, token, beforeChange) {
    // a concession for objects like Array that are not inherently observable
    if (!this.isObservable && this.makeObservable) {
        this.makeObservable();
    }

    var descriptor = this.getRangeChangeDescriptor(token);

    var listeners;
    if (beforeChange) {
        listeners = descriptor.willChangeListeners;
    } else {
        listeners = descriptor.changeListeners;
    }

    // even if already registered
    listeners.push(listener);
    Object.defineProperty(this, "dispatchesRangeChanges", {
        value: true,
        writable: true,
        configurable: true,
        enumerable: false
    });

    var self = this;
    return function cancelRangeChangeListener() {
        if (!self) {
            // TODO throw new Error("Range change listener " + JSON.stringify(token) + " has already been canceled");
            return;
        }
        self.removeRangeChangeListener(listener, token, beforeChange);
        self = null;
    };
};

RangeChanges.prototype.removeRangeChangeListener = function (listener, token, beforeChange) {
    var descriptor = this.getRangeChangeDescriptor(token);

    var listeners;
    if (beforeChange) {
        listeners = descriptor.willChangeListeners;
    } else {
        listeners = descriptor.changeListeners;
    }

    var index = listeners.lastIndexOf(listener);
    if (index === -1) {
        throw new Error("Can't remove listener: does not exist.");
    }
    listeners.splice(index, 1);
};

RangeChanges.prototype.dispatchRangeChange = function (plus, minus, index, beforeChange) {
    var descriptors = this.getAllRangeChangeDescriptors();
    var changeName = "Range" + (beforeChange ? "WillChange" : "Change");
    descriptors.forEach(function (descriptor, token) {

        if (descriptor.isActive) {
            return;
        } else {
            descriptor.isActive = true;
        }

        // before or after
        var listeners;
        if (beforeChange) {
            listeners = descriptor.willChangeListeners;
        } else {
            listeners = descriptor.changeListeners;
        }

        var tokenName = "handle" + (
            token.slice(0, 1).toUpperCase() +
            token.slice(1)
        ) + changeName;
        // notably, defaults to "handleRangeChange" or "handleRangeWillChange"
        // if token is "" (the default)

        // dispatch each listener
        try {
            listeners.forEach(function (listener) {
                if (listener[tokenName]) {
                    listener[tokenName](plus, minus, index, this, beforeChange);
                } else if (listener.call) {
                    listener.call(this, plus, minus, index, this, beforeChange);
                } else {
                    throw new Error("Handler " + listener + " has no method " + tokenName + " and is not callable");
                }
            }, this);
        } finally {
            descriptor.isActive = false;
        }
    }, this);
};

RangeChanges.prototype.addBeforeRangeChangeListener = function (listener, token) {
    return this.addRangeChangeListener(listener, token, true);
};

RangeChanges.prototype.removeBeforeRangeChangeListener = function (listener, token) {
    return this.removeRangeChangeListener(listener, token, true);
};

RangeChanges.prototype.dispatchBeforeRangeChange = function (plus, minus, index) {
    return this.dispatchRangeChange(plus, minus, index, true);
};


},{"../dict":24,"weak-map":35}],35:[function(require,module,exports){
// Copyright (C) 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Install a leaky WeakMap emulation on platforms that
 * don't provide a built-in one.
 *
 * <p>Assumes that an ES5 platform where, if {@code WeakMap} is
 * already present, then it conforms to the anticipated ES6
 * specification. To run this file on an ES5 or almost ES5
 * implementation where the {@code WeakMap} specification does not
 * quite conform, run <code>repairES5.js</code> first.
 *
 * <p> Even though WeakMapModule is not global, the linter thinks it
 * is, which is why it is in the overrides list below.
 *
 * @author Mark S. Miller
 * @requires crypto, ArrayBuffer, Uint8Array, navigator
 * @overrides WeakMap, ses, Proxy
 * @overrides WeakMapModule
 */

/**
 * This {@code WeakMap} emulation is observably equivalent to the
 * ES-Harmony WeakMap, but with leakier garbage collection properties.
 *
 * <p>As with true WeakMaps, in this emulation, a key does not
 * retain maps indexed by that key and (crucially) a map does not
 * retain the keys it indexes. A map by itself also does not retain
 * the values associated with that map.
 *
 * <p>However, the values associated with a key in some map are
 * retained so long as that key is retained and those associations are
 * not overridden. For example, when used to support membranes, all
 * values exported from a given membrane will live for the lifetime
 * they would have had in the absence of an interposed membrane. Even
 * when the membrane is revoked, all objects that would have been
 * reachable in the absence of revocation will still be reachable, as
 * far as the GC can tell, even though they will no longer be relevant
 * to ongoing computation.
 *
 * <p>The API implemented here is approximately the API as implemented
 * in FF6.0a1 and agreed to by MarkM, Andreas Gal, and Dave Herman,
 * rather than the offially approved proposal page. TODO(erights):
 * upgrade the ecmascript WeakMap proposal page to explain this API
 * change and present to EcmaScript committee for their approval.
 *
 * <p>The first difference between the emulation here and that in
 * FF6.0a1 is the presence of non enumerable {@code get___, has___,
 * set___, and delete___} methods on WeakMap instances to represent
 * what would be the hidden internal properties of a primitive
 * implementation. Whereas the FF6.0a1 WeakMap.prototype methods
 * require their {@code this} to be a genuine WeakMap instance (i.e.,
 * an object of {@code [[Class]]} "WeakMap}), since there is nothing
 * unforgeable about the pseudo-internal method names used here,
 * nothing prevents these emulated prototype methods from being
 * applied to non-WeakMaps with pseudo-internal methods of the same
 * names.
 *
 * <p>Another difference is that our emulated {@code
 * WeakMap.prototype} is not itself a WeakMap. A problem with the
 * current FF6.0a1 API is that WeakMap.prototype is itself a WeakMap
 * providing ambient mutability and an ambient communications
 * channel. Thus, if a WeakMap is already present and has this
 * problem, repairES5.js wraps it in a safe wrappper in order to
 * prevent access to this channel. (See
 * PATCH_MUTABLE_FROZEN_WEAKMAP_PROTO in repairES5.js).
 */

/**
 * If this is a full <a href=
 * "http://code.google.com/p/es-lab/wiki/SecureableES5"
 * >secureable ES5</a> platform and the ES-Harmony {@code WeakMap} is
 * absent, install an approximate emulation.
 *
 * <p>If WeakMap is present but cannot store some objects, use our approximate
 * emulation as a wrapper.
 *
 * <p>If this is almost a secureable ES5 platform, then WeakMap.js
 * should be run after repairES5.js.
 *
 * <p>See {@code WeakMap} for documentation of the garbage collection
 * properties of this WeakMap emulation.
 */
(function WeakMapModule() {
  "use strict";

  if (typeof ses !== 'undefined' && ses.ok && !ses.ok()) {
    // already too broken, so give up
    return;
  }

  /**
   * In some cases (current Firefox), we must make a choice betweeen a
   * WeakMap which is capable of using all varieties of host objects as
   * keys and one which is capable of safely using proxies as keys. See
   * comments below about HostWeakMap and DoubleWeakMap for details.
   *
   * This function (which is a global, not exposed to guests) marks a
   * WeakMap as permitted to do what is necessary to index all host
   * objects, at the cost of making it unsafe for proxies.
   *
   * Do not apply this function to anything which is not a genuine
   * fresh WeakMap.
   */
  function weakMapPermitHostObjects(map) {
    // identity of function used as a secret -- good enough and cheap
    if (map.permitHostObjects___) {
      map.permitHostObjects___(weakMapPermitHostObjects);
    }
  }
  if (typeof ses !== 'undefined') {
    ses.weakMapPermitHostObjects = weakMapPermitHostObjects;
  }

  // Check if there is already a good-enough WeakMap implementation, and if so
  // exit without replacing it.
  if (typeof WeakMap === 'function') {
    var HostWeakMap = WeakMap;
    // There is a WeakMap -- is it good enough?
    if (typeof navigator !== 'undefined' &&
        /Firefox/.test(navigator.userAgent)) {
      // We're now *assuming not*, because as of this writing (2013-05-06)
      // Firefox's WeakMaps have a miscellany of objects they won't accept, and
      // we don't want to make an exhaustive list, and testing for just one
      // will be a problem if that one is fixed alone (as they did for Event).

      // If there is a platform that we *can* reliably test on, here's how to
      // do it:
      //  var problematic = ... ;
      //  var testHostMap = new HostWeakMap();
      //  try {
      //    testHostMap.set(problematic, 1);  // Firefox 20 will throw here
      //    if (testHostMap.get(problematic) === 1) {
      //      return;
      //    }
      //  } catch (e) {}

      // Fall through to installing our WeakMap.
    } else {
      module.exports = WeakMap;
      return;
    }
  }

  var hop = Object.prototype.hasOwnProperty;
  var gopn = Object.getOwnPropertyNames;
  var defProp = Object.defineProperty;
  var isExtensible = Object.isExtensible;

  /**
   * Security depends on HIDDEN_NAME being both <i>unguessable</i> and
   * <i>undiscoverable</i> by untrusted code.
   *
   * <p>Given the known weaknesses of Math.random() on existing
   * browsers, it does not generate unguessability we can be confident
   * of.
   *
   * <p>It is the monkey patching logic in this file that is intended
   * to ensure undiscoverability. The basic idea is that there are
   * three fundamental means of discovering properties of an object:
   * The for/in loop, Object.keys(), and Object.getOwnPropertyNames(),
   * as well as some proposed ES6 extensions that appear on our
   * whitelist. The first two only discover enumerable properties, and
   * we only use HIDDEN_NAME to name a non-enumerable property, so the
   * only remaining threat should be getOwnPropertyNames and some
   * proposed ES6 extensions that appear on our whitelist. We monkey
   * patch them to remove HIDDEN_NAME from the list of properties they
   * returns.
   *
   * <p>TODO(erights): On a platform with built-in Proxies, proxies
   * could be used to trap and thereby discover the HIDDEN_NAME, so we
   * need to monkey patch Proxy.create, Proxy.createFunction, etc, in
   * order to wrap the provided handler with the real handler which
   * filters out all traps using HIDDEN_NAME.
   *
   * <p>TODO(erights): Revisit Mike Stay's suggestion that we use an
   * encapsulated function at a not-necessarily-secret name, which
   * uses the Stiegler shared-state rights amplification pattern to
   * reveal the associated value only to the WeakMap in which this key
   * is associated with that value. Since only the key retains the
   * function, the function can also remember the key without causing
   * leakage of the key, so this doesn't violate our general gc
   * goals. In addition, because the name need not be a guarded
   * secret, we could efficiently handle cross-frame frozen keys.
   */
  var HIDDEN_NAME_PREFIX = 'weakmap:';
  var HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'ident:' + Math.random() + '___';

  if (typeof crypto !== 'undefined' &&
      typeof crypto.getRandomValues === 'function' &&
      typeof ArrayBuffer === 'function' &&
      typeof Uint8Array === 'function') {
    var ab = new ArrayBuffer(25);
    var u8s = new Uint8Array(ab);
    crypto.getRandomValues(u8s);
    HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'rand:' +
      Array.prototype.map.call(u8s, function(u8) {
        return (u8 % 36).toString(36);
      }).join('') + '___';
  }

  function isNotHiddenName(name) {
    return !(
        name.substr(0, HIDDEN_NAME_PREFIX.length) == HIDDEN_NAME_PREFIX &&
        name.substr(name.length - 3) === '___');
  }

  /**
   * Monkey patch getOwnPropertyNames to avoid revealing the
   * HIDDEN_NAME.
   *
   * <p>The ES5.1 spec requires each name to appear only once, but as
   * of this writing, this requirement is controversial for ES6, so we
   * made this code robust against this case. If the resulting extra
   * search turns out to be expensive, we can probably relax this once
   * ES6 is adequately supported on all major browsers, iff no browser
   * versions we support at that time have relaxed this constraint
   * without providing built-in ES6 WeakMaps.
   */
  defProp(Object, 'getOwnPropertyNames', {
    value: function fakeGetOwnPropertyNames(obj) {
      return gopn(obj).filter(isNotHiddenName);
    }
  });

  /**
   * getPropertyNames is not in ES5 but it is proposed for ES6 and
   * does appear in our whitelist, so we need to clean it too.
   */
  if ('getPropertyNames' in Object) {
    var originalGetPropertyNames = Object.getPropertyNames;
    defProp(Object, 'getPropertyNames', {
      value: function fakeGetPropertyNames(obj) {
        return originalGetPropertyNames(obj).filter(isNotHiddenName);
      }
    });
  }

  /**
   * <p>To treat objects as identity-keys with reasonable efficiency
   * on ES5 by itself (i.e., without any object-keyed collections), we
   * need to add a hidden property to such key objects when we
   * can. This raises several issues:
   * <ul>
   * <li>Arranging to add this property to objects before we lose the
   *     chance, and
   * <li>Hiding the existence of this new property from most
   *     JavaScript code.
   * <li>Preventing <i>certification theft</i>, where one object is
   *     created falsely claiming to be the key of an association
   *     actually keyed by another object.
   * <li>Preventing <i>value theft</i>, where untrusted code with
   *     access to a key object but not a weak map nevertheless
   *     obtains access to the value associated with that key in that
   *     weak map.
   * </ul>
   * We do so by
   * <ul>
   * <li>Making the name of the hidden property unguessable, so "[]"
   *     indexing, which we cannot intercept, cannot be used to access
   *     a property without knowing the name.
   * <li>Making the hidden property non-enumerable, so we need not
   *     worry about for-in loops or {@code Object.keys},
   * <li>monkey patching those reflective methods that would
   *     prevent extensions, to add this hidden property first,
   * <li>monkey patching those methods that would reveal this
   *     hidden property.
   * </ul>
   * Unfortunately, because of same-origin iframes, we cannot reliably
   * add this hidden property before an object becomes
   * non-extensible. Instead, if we encounter a non-extensible object
   * without a hidden record that we can detect (whether or not it has
   * a hidden record stored under a name secret to us), then we just
   * use the key object itself to represent its identity in a brute
   * force leaky map stored in the weak map, losing all the advantages
   * of weakness for these.
   */
  function getHiddenRecord(key) {
    if (key !== Object(key)) {
      throw new TypeError('Not an object: ' + key);
    }
    var hiddenRecord = key[HIDDEN_NAME];
    if (hiddenRecord && hiddenRecord.key === key) { return hiddenRecord; }
    if (!isExtensible(key)) {
      // Weak map must brute force, as explained in doc-comment above.
      return void 0;
    }
    var gets = [];
    var vals = [];
    hiddenRecord = {
      key: key,   // self pointer for quick own check above.
      gets: gets, // get___ methods identifying weak maps
      vals: vals  // values associated with this key in each
                  // corresponding weak map.
    };
    defProp(key, HIDDEN_NAME, {
      value: hiddenRecord,
      writable: false,
      enumerable: false,
      configurable: false
    });
    return hiddenRecord;
  }


  /**
   * Monkey patch operations that would make their argument
   * non-extensible.
   *
   * <p>The monkey patched versions throw a TypeError if their
   * argument is not an object, so it should only be done to functions
   * that should throw a TypeError anyway if their argument is not an
   * object.
   */
  (function(){
    var oldFreeze = Object.freeze;
    defProp(Object, 'freeze', {
      value: function identifyingFreeze(obj) {
        getHiddenRecord(obj);
        return oldFreeze(obj);
      }
    });
    var oldSeal = Object.seal;
    defProp(Object, 'seal', {
      value: function identifyingSeal(obj) {
        getHiddenRecord(obj);
        return oldSeal(obj);
      }
    });
    var oldPreventExtensions = Object.preventExtensions;
    defProp(Object, 'preventExtensions', {
      value: function identifyingPreventExtensions(obj) {
        getHiddenRecord(obj);
        return oldPreventExtensions(obj);
      }
    });
  })();


  function constFunc(func) {
    func.prototype = null;
    return Object.freeze(func);
  }

  // Right now (12/25/2012) the histogram supports the current
  // representation. We should check this occasionally, as a true
  // constant time representation is easy.
  // var histogram = [];

  var OurWeakMap = function() {
    // We are currently (12/25/2012) never encountering any prematurely
    // non-extensible keys.
    var keys = []; // brute force for prematurely non-extensible keys.
    var vals = []; // brute force for corresponding values.

    function get___(key, opt_default) {
      var hr = getHiddenRecord(key);
      var i, vs;
      if (hr) {
        i = hr.gets.indexOf(get___);
        vs = hr.vals;
      } else {
        i = keys.indexOf(key);
        vs = vals;
      }
      return (i >= 0) ? vs[i] : opt_default;
    }

    function has___(key) {
      var hr = getHiddenRecord(key);
      var i;
      if (hr) {
        i = hr.gets.indexOf(get___);
      } else {
        i = keys.indexOf(key);
      }
      return i >= 0;
    }

    function set___(key, value) {
      var hr = getHiddenRecord(key);
      var i;
      if (hr) {
        i = hr.gets.indexOf(get___);
        if (i >= 0) {
          hr.vals[i] = value;
        } else {
//          i = hr.gets.length;
//          histogram[i] = (histogram[i] || 0) + 1;
          hr.gets.push(get___);
          hr.vals.push(value);
        }
      } else {
        i = keys.indexOf(key);
        if (i >= 0) {
          vals[i] = value;
        } else {
          keys.push(key);
          vals.push(value);
        }
      }
    }

    function delete___(key) {
      var hr = getHiddenRecord(key);
      var i;
      if (hr) {
        i = hr.gets.indexOf(get___);
        if (i >= 0) {
          hr.gets.splice(i, 1);
          hr.vals.splice(i, 1);
        }
      } else {
        i = keys.indexOf(key);
        if (i >= 0) {
          keys.splice(i, 1);
          vals.splice(i, 1);
        }
      }
      return true;
    }

    return Object.create(OurWeakMap.prototype, {
      get___:    { value: constFunc(get___) },
      has___:    { value: constFunc(has___) },
      set___:    { value: constFunc(set___) },
      delete___: { value: constFunc(delete___) }
    });
  };
  OurWeakMap.prototype = Object.create(Object.prototype, {
    get: {
      /**
       * Return the value most recently associated with key, or
       * opt_default if none.
       */
      value: function get(key, opt_default) {
        return this.get___(key, opt_default);
      },
      writable: true,
      configurable: true
    },

    has: {
      /**
       * Is there a value associated with key in this WeakMap?
       */
      value: function has(key) {
        return this.has___(key);
      },
      writable: true,
      configurable: true
    },

    set: {
      /**
       * Associate value with key in this WeakMap, overwriting any
       * previous association if present.
       */
      value: function set(key, value) {
        this.set___(key, value);
      },
      writable: true,
      configurable: true
    },

    'delete': {
      /**
       * Remove any association for key in this WeakMap, returning
       * whether there was one.
       *
       * <p>Note that the boolean return here does not work like the
       * {@code delete} operator. The {@code delete} operator returns
       * whether the deletion succeeds at bringing about a state in
       * which the deleted property is absent. The {@code delete}
       * operator therefore returns true if the property was already
       * absent, whereas this {@code delete} method returns false if
       * the association was already absent.
       */
      value: function remove(key) {
        return this.delete___(key);
      },
      writable: true,
      configurable: true
    }
  });

  if (typeof HostWeakMap === 'function') {
    (function() {
      // If we got here, then the platform has a WeakMap but we are concerned
      // that it may refuse to store some key types. Therefore, make a map
      // implementation which makes use of both as possible.

      function DoubleWeakMap() {
        // Preferable, truly weak map.
        var hmap = new HostWeakMap();

        // Our hidden-property-based pseudo-weak-map. Lazily initialized in the
        // 'set' implementation; thus we can avoid performing extra lookups if
        // we know all entries actually stored are entered in 'hmap'.
        var omap = undefined;

        // Hidden-property maps are not compatible with proxies because proxies
        // can observe the hidden name and either accidentally expose it or fail
        // to allow the hidden property to be set. Therefore, we do not allow
        // arbitrary WeakMaps to switch to using hidden properties, but only
        // those which need the ability, and unprivileged code is not allowed
        // to set the flag.
        var enableSwitching = false;

        function dget(key, opt_default) {
          if (omap) {
            return hmap.has(key) ? hmap.get(key)
                : omap.get___(key, opt_default);
          } else {
            return hmap.get(key, opt_default);
          }
        }

        function dhas(key) {
          return hmap.has(key) || (omap ? omap.has___(key) : false);
        }

        function dset(key, value) {
          if (enableSwitching) {
            try {
              hmap.set(key, value);
            } catch (e) {
              if (!omap) { omap = new OurWeakMap(); }
              omap.set___(key, value);
            }
          } else {
            hmap.set(key, value);
          }
        }

        function ddelete(key) {
          hmap['delete'](key);
          if (omap) { omap.delete___(key); }
        }

        return Object.create(OurWeakMap.prototype, {
          get___:    { value: constFunc(dget) },
          has___:    { value: constFunc(dhas) },
          set___:    { value: constFunc(dset) },
          delete___: { value: constFunc(ddelete) },
          permitHostObjects___: { value: constFunc(function(token) {
            if (token === weakMapPermitHostObjects) {
              enableSwitching = true;
            } else {
              throw new Error('bogus call to permitHostObjects___');
            }
          })}
        });
      }
      DoubleWeakMap.prototype = OurWeakMap.prototype;
      module.exports = DoubleWeakMap;

      // define .constructor to hide OurWeakMap ctor
      Object.defineProperty(WeakMap.prototype, 'constructor', {
        value: WeakMap,
        enumerable: false,  // as default .constructor is
        configurable: true,
        writable: true
      });
    })();
  } else {
    // There is no host WeakMap, so we must use the emulation.

    // Emulated WeakMaps are incompatible with native proxies (because proxies
    // can observe the hidden name), so we must disable Proxy usage (in
    // ArrayLike and Domado, currently).
    if (typeof Proxy !== 'undefined') {
      Proxy = undefined;
    }

    module.exports = OurWeakMap;
  }
})();

},{}],36:[function(require,module,exports){
"use strict";

/*
    Based in part on extras from Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

var Function = require("./shim-function");
var GenericCollection = require("./generic-collection");
var GenericOrder = require("./generic-order");
var WeakMap = require("weak-map");

module.exports = Array;

Array.empty = [];

if (Object.freeze) {
    Object.freeze(Array.empty);
}

Array.from = function (values) {
    var array = [];
    array.addEach(values);
    return array;
};

Array.unzip = function (table) {
    var transpose = [];
    var length = Infinity;
    // compute shortest row
    for (var i = 0; i < table.length; i++) {
        var row = table[i];
        table[i] = row.toArray();
        if (row.length < length) {
            length = row.length;
        }
    }
    for (var i = 0; i < table.length; i++) {
        var row = table[i];
        for (var j = 0; j < row.length; j++) {
            if (j < length && j in row) {
                transpose[j] = transpose[j] || [];
                transpose[j][i] = row[j];
            }
        }
    }
    return transpose;
};

function define(key, value) {
    Object.defineProperty(Array.prototype, key, {
        value: value,
        writable: true,
        configurable: true,
        enumerable: false
    });
}

define("addEach", GenericCollection.prototype.addEach);
define("deleteEach", GenericCollection.prototype.deleteEach);
define("toArray", GenericCollection.prototype.toArray);
define("toObject", GenericCollection.prototype.toObject);
define("all", GenericCollection.prototype.all);
define("any", GenericCollection.prototype.any);
define("min", GenericCollection.prototype.min);
define("max", GenericCollection.prototype.max);
define("sum", GenericCollection.prototype.sum);
define("average", GenericCollection.prototype.average);
define("only", GenericCollection.prototype.only);
define("flatten", GenericCollection.prototype.flatten);
define("zip", GenericCollection.prototype.zip);
define("enumerate", GenericCollection.prototype.enumerate);
define("group", GenericCollection.prototype.group);
define("sorted", GenericCollection.prototype.sorted);
define("reversed", GenericCollection.prototype.reversed);

define("constructClone", function (values) {
    var clone = new this.constructor();
    clone.addEach(values);
    return clone;
});

define("has", function (value, equals) {
    return this.find(value, equals) !== -1;
});

define("get", function (index, defaultValue) {
    if (+index !== index)
        throw new Error("Indicies must be numbers");
    if (!index in this) {
        return defaultValue;
    } else {
        return this[index];
    }
});

define("set", function (index, value) {
    this.splice(index, 1, value);
    return true;
});

define("add", function (value) {
    this.push(value);
    return true;
});

define("delete", function (value, equals) {
    var index = this.find(value, equals);
    if (index !== -1) {
        this.splice(index, 1);
        return true;
    }
    return false;
});

define("find", function (value, equals) {
    equals = equals || this.contentEquals || Object.equals;
    for (var index = 0; index < this.length; index++) {
        if (index in this && equals(this[index], value)) {
            return index;
        }
    }
    return -1;
});

define("findLast", function (value, equals) {
    equals = equals || this.contentEquals || Object.equals;
    var index = this.length;
    do {
        index--;
        if (index in this && equals(this[index], value)) {
            return index;
        }
    } while (index > 0);
    return -1;
});

define("swap", function (index, length, plus) {
    var args = Array.prototype.slice.call(arguments, 0, 2);
    if (plus) {
        if (!Array.isArray(plus)) {
            plus = Array.prototype.slice.call(plus);
        }
        args.push.apply(args, plus);
    }
    return this.splice.apply(this, args);
});

define("one", function () {
    for (var i in this) {
        if (Object.owns(this, i)) {
            return this[i];
        }
    }
});

define("clear", function () {
    this.length = 0;
    return this;
});

define("compare", function (that, compare) {
    compare = compare || Object.compare;
    var i;
    var length;
    var lhs;
    var rhs;
    var relative;

    if (this === that) {
        return 0;
    }

    if (!that || !Array.isArray(that)) {
        return GenericOrder.prototype.compare.call(this, that, compare);
    }

    length = Math.min(this.length, that.length);

    for (i = 0; i < length; i++) {
        if (i in this) {
            if (!(i in that)) {
                return -1;
            } else {
                lhs = this[i];
                rhs = that[i];
                relative = compare(lhs, rhs);
                if (relative) {
                    return relative;
                }
            }
        } else if (i in that) {
            return 1;
        }
    }

    return this.length - that.length;
});

define("equals", function (that, equals) {
    equals = equals || Object.equals;
    var i = 0;
    var length = this.length;
    var left;
    var right;

    if (this === that) {
        return true;
    }
    if (!that || !Array.isArray(that)) {
        return GenericOrder.prototype.equals.call(this, that);
    }

    if (length !== that.length) {
        return false;
    } else {
        for (; i < length; ++i) {
            if (i in this) {
                if (!(i in that)) {
                    return false;
                }
                left = this[i];
                right = that[i];
                if (!equals(left, right)) {
                    return false;
                }
            } else {
                if (i in that) {
                    return false;
                }
            }
        }
    }
    return true;
});

define("clone", function (depth, memo) {
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return this;
    }
    memo = memo || new WeakMap();
    var clone = [];
    for (var i in this) {
        if (Object.owns(this, i)) {
            clone[i] = Object.clone(this[i], depth - 1, memo);
        }
    };
    return clone;
});

define("iterate", function (start, end) {
    return new ArrayIterator(this, start, end);
});

define("Iterator", ArrayIterator);

function ArrayIterator(array, start, end) {
    this.array = array;
    this.start = start == null ? 0 : start;
    this.end = end;
};

ArrayIterator.prototype.next = function () {
    if (this.start === (this.end == null ? this.array.length : this.end)) {
        throw StopIteration;
    } else {
        return this.array[this.start++];
    }
};


},{"./generic-collection":27,"./generic-order":29,"./shim-function":37,"weak-map":35}],37:[function(require,module,exports){

module.exports = Function;

/**
    A utility to reduce unnecessary allocations of <code>function () {}</code>
    in its many colorful variations.  It does nothing and returns
    <code>undefined</code> thus makes a suitable default in some circumstances.

    @function external:Function.noop
*/
Function.noop = function () {
};

/**
    A utility to reduce unnecessary allocations of <code>function (x) {return
    x}</code> in its many colorful but ultimately wasteful parameter name
    variations.

    @function external:Function.identity
    @param {Any} any value
    @returns {Any} that value
*/
Function.identity = function (value) {
    return value;
};

/**
    A utility for creating a comparator function for a particular aspect of a
    figurative class of objects.

    @function external:Function.by
    @param {Function} relation A function that accepts a value and returns a
    corresponding value to use as a representative when sorting that object.
    @param {Function} compare an alternate comparator for comparing the
    represented values.  The default is <code>Object.compare</code>, which
    does a deep, type-sensitive, polymorphic comparison.
    @returns {Function} a comparator that has been annotated with
    <code>by</code> and <code>compare</code> properties so
    <code>sorted</code> can perform a transform that reduces the need to call
    <code>by</code> on each sorted object to just once.
 */
Function.by = function (by , compare) {
    compare = compare || Object.compare;
    by = by || Function.identity;
    var compareBy = function (a, b) {
        return compare(by(a), by(b));
    };
    compareBy.compare = compare;
    compareBy.by = by;
    return compareBy;
};

// TODO document
Function.get = function (key) {
    return function (object) {
        return Object.get(object, key);
    };
};


},{}],38:[function(require,module,exports){
"use strict";

var WeakMap = require("weak-map");

module.exports = Object;

/*
    Based in part on extras from Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

/**
    Defines extensions to intrinsic <code>Object</code>.
    @see [Object class]{@link external:Object}
*/

/**
    A utility object to avoid unnecessary allocations of an empty object
    <code>{}</code>.  This object is frozen so it is safe to share.

    @object external:Object.empty
*/
Object.empty = Object.freeze(Object.create(null));

/**
    Returns whether the given value is an object, as opposed to a value.
    Unboxed numbers, strings, true, false, undefined, and null are not
    objects.  Arrays are objects.

    @function external:Object.isObject
    @param {Any} value
    @returns {Boolean} whether the given value is an object
*/
Object.isObject = function (object) {
    return Object(object) === object;
};

/**
    Returns the value of an any value, particularly objects that
    implement <code>valueOf</code>.

    <p>Note that, unlike the precedent of methods like
    <code>Object.equals</code> and <code>Object.compare</code> would suggest,
    this method is named <code>Object.getValueOf</code> instead of
    <code>valueOf</code>.  This is a delicate issue, but the basis of this
    decision is that the JavaScript runtime would be far more likely to
    accidentally call this method with no arguments, assuming that it would
    return the value of <code>Object</code> itself in various situations,
    whereas <code>Object.equals(Object, null)</code> protects against this case
    by noting that <code>Object</code> owns the <code>equals</code> property
    and therefore does not delegate to it.

    @function external:Object.getValueOf
    @param {Any} value a value or object wrapping a value
    @returns {Any} the primitive value of that object, if one exists, or passes
    the value through
*/
Object.getValueOf = function (value) {
    if (Object.can(value, "valueOf")) {
        value = value.valueOf();
    }
    return value;
};

var hashMap = new WeakMap();
Object.hash = function (object) {
    if (Object.can(object, "hash")) {
        return "" + object.hash();
    } else if (Object(object) === object) {
        if (!hashMap.has(object)) {
            hashMap.set(object, Math.random().toString(36).slice(2));
        }
        return hashMap.get(object);
    } else {
        return "" + object;
    }
};

/**
    A shorthand for <code>Object.prototype.hasOwnProperty.call(object,
    key)</code>.  Returns whether the object owns a property for the given key.
    It does not consult the prototype chain and works for any string (including
    "hasOwnProperty") except "__proto__".

    @function external:Object.owns
    @param {Object} object
    @param {String} key
    @returns {Boolean} whether the object owns a property wfor the given key.
*/
var owns = Object.prototype.hasOwnProperty;
Object.owns = function (object, key) {
    return owns.call(object, key);
};

/**
    Returns whether a value implements a particular duck-type method.

    <p>To qualify as a duck-type method, the value in question must have a
    method by the given name on the prototype chain.  To distinguish it from
    a property of an object literal, the property must not be owned by the
    object directly.

    <p>A value that implements a method is not necessarily an object, for
    example, numbers implement <code>valueOf</code>, so this is function
    does not imply <code>Object.isObject</code> of the same value.

    @function external:Object.can
    @param {Any} value a value
    @param {String} name a method name
    @returns {Boolean} whether the given value implements the given method

*/
Object.can = function (object, name) {
    return (
        object != null && // false only for null *and* undefined
        typeof object[name] === "function" &&
        !owns.call(object, name)
    );
};

/**
    A utility that is like Object.owns but is also useful for finding
    properties on the prototype chain, provided that they do not refer to
    methods on the Object prototype.  Works for all strings except "__proto__".

    <p>Alternately, you could use the "in" operator as long as the object
    descends from "null" instead of the Object.prototype, as with
    <code>Object.create(null)</code>.  However,
    <code>Object.create(null)</code> only works in fully compliant EcmaScript 5
    JavaScript engines and cannot be faithfully shimmed.

    <p>If the given object is an instance of a type that implements a method
    named "has", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  In that
    case, the domain of the key depends on the instance.

    @param {Object} object
    @param {String} key
    @returns {Boolean} whether the object, or any of its prototypes except
    <code>Object.prototype</code>
    @function external:Object.has
*/
Object.has = function (object, key) {
    if (typeof object !== "object") {
        throw new Error("Object.has can't accept non-object: " + typeof object);
    }
    // forward to mapped collections that implement "has"
    if (Object.can(object, "has")) {
        return object.has(key);
    // otherwise report whether the key is on the prototype chain,
    // as long as it is not one of the methods on object.prototype
    } else if (typeof key === "string") {
        return key in object && object[key] !== Object.prototype[key];
    } else {
        throw new Error("Key must be a string for Object.has on plain objects");
    }
};

/**
    Gets the value for a corresponding key from an object.

    <p>Uses Object.has to determine whether there is a corresponding value for
    the given key.  As such, <code>Object.get</code> is capable of retriving
    values from the prototype chain as long as they are not from the
    <code>Object.prototype</code>.

    <p>If there is no corresponding value, returns the given default, which may
    be <code>undefined</code>.

    <p>If the given object is an instance of a type that implements a method
    named "get", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  In that
    case, the domain of the key depends on the implementation.  For a `Map`,
    for example, the key might be any object.

    @param {Object} object
    @param {String} key
    @param {Any} value a default to return, <code>undefined</code> if omitted
    @returns {Any} value for key, or default value
    @function external:Object.get
*/
Object.get = function (object, key, value) {
    if (typeof object !== "object") {
        throw new Error("Object.get can't accept non-object: " + typeof object);
    }
    // forward to mapped collections that implement "get"
    if (Object.can(object, "get")) {
        return object.get(key, value);
    } else if (Object.has(object, key)) {
        return object[key];
    } else {
        return value;
    }
};

/**
    Sets the value for a given key on an object.

    <p>If the given object is an instance of a type that implements a method
    named "set", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  As such,
    the key domain varies by the object type.

    @param {Object} object
    @param {String} key
    @param {Any} value
    @returns <code>undefined</code>
    @function external:Object.set
*/
Object.set = function (object, key, value) {
    if (Object.can(object, "set")) {
        object.set(key, value);
    } else {
        object[key] = value;
    }
};

Object.addEach = function (target, source) {
    if (!source) {
    } else if (Object.can(source, "forEach")) {
        // copy map-alikes
        if (typeof source.keys === "function") {
            source.forEach(function (value, key) {
                target[key] = value;
            });
        // iterate key value pairs of other iterables
        } else {
            source.forEach(function (pair) {
                target[pair[0]] = pair[1];
            });
        }
    } else {
        // copy other objects as map-alikes
        Object.keys(source).forEach(function (key) {
            target[key] = source[key];
        });
    }
    return target;
};

/**
    Iterates over the owned properties of an object.

    @function external:Object.forEach
    @param {Object} object an object to iterate.
    @param {Function} callback a function to call for every key and value
    pair in the object.  Receives <code>value</code>, <code>key</code>,
    and <code>object</code> as arguments.
    @param {Object} thisp the <code>this</code> to pass through to the
    callback
*/
Object.forEach = function (object, callback, thisp) {
    Object.keys(object).forEach(function (key) {
        callback.call(thisp, object[key], key, object);
    });
};

/**
    Iterates over the owned properties of a map, constructing a new array of
    mapped values.

    @function external:Object.map
    @param {Object} object an object to iterate.
    @param {Function} callback a function to call for every key and value
    pair in the object.  Receives <code>value</code>, <code>key</code>,
    and <code>object</code> as arguments.
    @param {Object} thisp the <code>this</code> to pass through to the
    callback
    @returns {Array} the respective values returned by the callback for each
    item in the object.
*/
Object.map = function (object, callback, thisp) {
    return Object.keys(object).map(function (key) {
        return callback.call(thisp, object[key], key, object);
    });
};

/**
    Returns the values for owned properties of an object.

    @function external:Object.map
    @param {Object} object
    @returns {Array} the respective value for each owned property of the
    object.
*/
Object.values = function (object) {
    return Object.map(object, Function.identity);
};

// TODO inline document concat
Object.concat = function () {
    var object = {};
    for (var i = 0; i < arguments.length; i++) {
        Object.addEach(object, arguments[i]);
    }
    return object;
};

Object.from = Object.concat;

/**
    Returns whether two values are identical.  Any value is identical to itself
    and only itself.  This is much more restictive than equivalence and subtly
    different than strict equality, <code>===</code> because of edge cases
    including negative zero and <code>NaN</code>.  Identity is useful for
    resolving collisions among keys in a mapping where the domain is any value.
    This method does not delgate to any method on an object and cannot be
    overridden.
    @see http://wiki.ecmascript.org/doku.php?id=harmony:egal
    @param {Any} this
    @param {Any} that
    @returns {Boolean} whether this and that are identical
    @function external:Object.is
*/
Object.is = function (x, y) {
    if (x === y) {
        // 0 === -0, but they are not identical
        return x !== 0 || 1 / x === 1 / y;
    }
    // NaN !== NaN, but they are identical.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    return x !== x && y !== y;
};

/**
    Performs a polymorphic, type-sensitive deep equivalence comparison of any
    two values.

    <p>As a basic principle, any value is equivalent to itself (as in
    identity), any boxed version of itself (as a <code>new Number(10)</code> is
    to 10), and any deep clone of itself.

    <p>Equivalence has the following properties:

    <ul>
        <li><strong>polymorphic:</strong>
            If the given object is an instance of a type that implements a
            methods named "equals", this function defers to the method.  So,
            this function can safely compare any values regardless of type,
            including undefined, null, numbers, strings, any pair of objects
            where either implements "equals", or object literals that may even
            contain an "equals" key.
        <li><strong>type-sensitive:</strong>
            Incomparable types are not equal.  No object is equivalent to any
            array.  No string is equal to any other number.
        <li><strong>deep:</strong>
            Collections with equivalent content are equivalent, recursively.
        <li><strong>equivalence:</strong>
            Identical values and objects are equivalent, but so are collections
            that contain equivalent content.  Whether order is important varies
            by type.  For Arrays and lists, order is important.  For Objects,
            maps, and sets, order is not important.  Boxed objects are mutally
            equivalent with their unboxed values, by virtue of the standard
            <code>valueOf</code> method.
    </ul>
    @param this
    @param that
    @returns {Boolean} whether the values are deeply equivalent
    @function external:Object.equals
*/
Object.equals = function (a, b, equals) {
    equals = equals || Object.equals;
    // unbox objects, but do not confuse object literals
    a = Object.getValueOf(a);
    b = Object.getValueOf(b);
    if (a === b)
        // 0 === -0, but they are not equal
        return a !== 0 || 1 / a === 1 / b;
    if (a === null || b === null)
        return a === b;
    if (Object.can(a, "equals"))
        return a.equals(b, equals);
    // commutative
    if (Object.can(b, "equals"))
        return b.equals(a, equals);
    if (typeof a === "object" && typeof b === "object") {
        var aPrototype = Object.getPrototypeOf(a);
        var bPrototype = Object.getPrototypeOf(b);
        if (
            aPrototype === bPrototype && (
                aPrototype === Object.prototype ||
                aPrototype === null
            )
        ) {
            for (var key in a) {
                if (!equals(a[key], b[key])) {
                    return false;
                }
            }
            for (var key in b) {
                if (!equals(a[key], b[key])) {
                    return false;
                }
            }
            return true;
        }
    }
    // NaN !== NaN, but they are equal.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    return a !== a && b !== b;
};

// Because a return value of 0 from a `compare` function  may mean either
// "equals" or "is incomparable", `equals` cannot be defined in terms of
// `compare`.  However, `compare` *can* be defined in terms of `equals` and
// `lessThan`.  Again however, more often it would be desirable to implement
// all of the comparison functions in terms of compare rather than the other
// way around.

/**
    Determines the order in which any two objects should be sorted by returning
    a number that has an analogous relationship to zero as the left value to
    the right.  That is, if the left is "less than" the right, the returned
    value will be "less than" zero, where "less than" may be any other
    transitive relationship.

    <p>Arrays are compared by the first diverging values, or by length.

    <p>Any two values that are incomparable return zero.  As such,
    <code>equals</code> should not be implemented with <code>compare</code>
    since incomparability is indistinguishable from equality.

    <p>Sorts strings lexicographically.  This is not suitable for any
    particular international setting.  Different locales sort their phone books
    in very different ways, particularly regarding diacritics and ligatures.

    <p>If the given object is an instance of a type that implements a method
    named "compare", this function defers to the instance.  The method does not
    need to be an owned property to distinguish it from an object literal since
    object literals are incomparable.  Unlike <code>Object</code> however,
    <code>Array</code> implements <code>compare</code>.

    @param {Any} left
    @param {Any} right
    @returns {Number} a value having the same transitive relationship to zero
    as the left and right values.
    @function external:Object.compare
*/
Object.compare = function (a, b) {
    // unbox objects, but do not confuse object literals
    // mercifully handles the Date case
    a = Object.getValueOf(a);
    b = Object.getValueOf(b);
    var aType = typeof a;
    var bType = typeof b;
    if (a === b)
        return 0;
    if (aType !== bType)
        return 0;
    if (aType === "number")
        return a - b;
    if (aType === "string")
        return a < b ? -1 : 1;
        // the possibility of equality elimiated above
    if (Object.can(a, "compare"))
        return a.compare(b);
    // not commutative, the relationship is reversed
    if (Object.can(b, "compare"))
        return -b.compare(a);
    return 0;
};

/**
    Creates a deep copy of any value.  Values, being immutable, are
    returned without alternation.  Forwards to <code>clone</code> on
    objects and arrays.

    @function external:Object.clone
    @param {Any} value a value to clone
    @param {Number} depth an optional traversal depth, defaults to infinity.
    A value of <code>0</code> means to make no clone and return the value
    directly.
    @param {Map} memo an optional memo of already visited objects to preserve
    reference cycles.  The cloned object will have the exact same shape as the
    original, but no identical objects.  Te map may be later used to associate
    all objects in the original object graph with their corresponding member of
    the cloned graph.
    @returns a copy of the value
*/
Object.clone = function (value, depth, memo) {
    value = Object.getValueOf(value);
    memo = memo || new WeakMap();
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return value;
    }
    if (Object.isObject(value)) {
        if (!memo.has(value)) {
            if (Object.can(value, "clone")) {
                memo.set(value, value.clone(depth, memo));
            } else {
                var prototype = Object.getPrototypeOf(value);
                if (prototype === null || prototype === Object.prototype) {
                    var clone = Object.create(prototype);
                    memo.set(value, clone);
                    for (var key in value) {
                        clone[key] = Object.clone(value[key], depth - 1, memo);
                    }
                } else {
                    throw new Error("Can't clone " + value);
                }
            }
        }
        return memo.get(value);
    }
    return value;
};

/**
    Removes all properties owned by this object making the object suitable for
    reuse.

    @function external:Object.clear
    @returns this
*/
Object.clear = function (object) {
    if (Object.can(object, "clear")) {
        object.clear();
    } else {
        var keys = Object.keys(object),
            i = keys.length;
        while (i) {
            i--;
            delete object[keys[i]];
        }
    }
    return object;
};


},{"weak-map":35}],39:[function(require,module,exports){

/**
    accepts a string; returns the string with regex metacharacters escaped.
    the returned string can safely be used within a regex to match a literal
    string. escaped characters are [, ], {, }, (, ), -, *, +, ?, ., \, ^, $,
    |, #, [comma], and whitespace.
*/
if (!RegExp.escape) {
    var special = /[-[\]{}()*+?.\\^$|,#\s]/g;
    RegExp.escape = function (string) {
        return string.replace(special, "\\$&");
    };
}


},{}],40:[function(require,module,exports){

var Array = require("./shim-array");
var Object = require("./shim-object");
var Function = require("./shim-function");
var RegExp = require("./shim-regexp");


},{"./shim-array":36,"./shim-function":37,"./shim-object":38,"./shim-regexp":39}],41:[function(require,module,exports){
"use strict";

module.exports = TreeLog;

function TreeLog() {
}

TreeLog.ascii = {
    intersection: "+",
    through: "-",
    branchUp: "+",
    branchDown: "+",
    fromBelow: ".",
    fromAbove: "'",
    fromBoth: "+",
    strafe: "|"
};

TreeLog.unicodeRound = {
    intersection: "\u254b",
    through: "\u2501",
    branchUp: "\u253b",
    branchDown: "\u2533",
    fromBelow: "\u256d", // round corner
    fromAbove: "\u2570", // round corner
    fromBoth: "\u2523",
    strafe: "\u2503"
};

TreeLog.unicodeSharp = {
    intersection: "\u254b",
    through: "\u2501",
    branchUp: "\u253b",
    branchDown: "\u2533",
    fromBelow: "\u250f", // sharp corner
    fromAbove: "\u2517", // sharp corner
    fromBoth: "\u2523",
    strafe: "\u2503"
};


},{}],42:[function(require,module,exports){
var global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};
var rng;

if (global.crypto && crypto.getRandomValues) {
  // WHATWG crypto-based RNG - http://wiki.whatwg.org/wiki/Crypto
  // Moderately fast, high quality
  var _rnds8 = new Uint8Array(16);
  rng = function whatwgRNG() {
    crypto.getRandomValues(_rnds8);
    return _rnds8;
  };
}

if (!rng) {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var  _rnds = new Array(16);
  rng = function() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      _rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return _rnds;
  };
}

module.exports = rng;


},{}],43:[function(require,module,exports){
var Buffer=require("__browserify_Buffer");//     uuid.js
//
//     Copyright (c) 2010-2012 Robert Kieffer
//     MIT License - http://opensource.org/licenses/mit-license.php

// Unique ID creation requires a high quality random # generator.  We feature
// detect to determine the best RNG source, normalizing to a function that
// returns 128-bits of randomness, since that's what's usually required
var _rng = require('./rng');

// Buffer class to use
var BufferClass = typeof(Buffer) == 'function' ? Buffer : Array;

// Maps for number <-> hex string conversion
var _byteToHex = [];
var _hexToByte = {};
for (var i = 0; i < 256; i++) {
  _byteToHex[i] = (i + 0x100).toString(16).substr(1);
  _hexToByte[_byteToHex[i]] = i;
}

// **`parse()` - Parse a UUID into it's component bytes**
function parse(s, buf, offset) {
  var i = (buf && offset) || 0, ii = 0;

  buf = buf || [];
  s.toLowerCase().replace(/[0-9a-f]{2}/g, function(oct) {
    if (ii < 16) { // Don't overflow!
      buf[i + ii++] = _hexToByte[oct];
    }
  });

  // Zero out remaining bytes if string was short
  while (ii < 16) {
    buf[i + ii++] = 0;
  }

  return buf;
}

// **`unparse()` - Convert UUID byte array (ala parse()) into a string**
function unparse(buf, offset) {
  var i = offset || 0, bth = _byteToHex;
  return  bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]];
}

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

// random #'s we need to init node and clockseq
var _seedBytes = _rng();

// Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
var _nodeId = [
  _seedBytes[0] | 0x01,
  _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]
];

// Per 4.2.2, randomize (14 bit) clockseq
var _clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;

// Previous uuid creation time
var _lastMSecs = 0, _lastNSecs = 0;

// See https://github.com/broofa/node-uuid for API details
function v1(options, buf, offset) {
  var i = buf && offset || 0;
  var b = buf || [];

  options = options || {};

  var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

  // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
  var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

  // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock
  var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

  // Time since last uuid creation (in msecs)
  var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

  // Per 4.2.1.2, Bump clockseq on clock regression
  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  }

  // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  // Per 4.2.1.2 Throw error if too many uuids are requested
  if (nsecs >= 10000) {
    throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;

  // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
  msecs += 12219292800000;

  // `time_low`
  var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff;

  // `time_mid`
  var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff;

  // `time_high_and_version`
  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
  b[i++] = tmh >>> 16 & 0xff;

  // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
  b[i++] = clockseq >>> 8 | 0x80;

  // `clock_seq_low`
  b[i++] = clockseq & 0xff;

  // `node`
  var node = options.node || _nodeId;
  for (var n = 0; n < 6; n++) {
    b[i + n] = node[n];
  }

  return buf ? buf : unparse(b);
}

// **`v4()` - Generate random UUID**

// See https://github.com/broofa/node-uuid for API details
function v4(options, buf, offset) {
  // Deprecated - 'format' argument, as supported in v1.2
  var i = buf && offset || 0;

  if (typeof(options) == 'string') {
    buf = options == 'binary' ? new BufferClass(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || _rng)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ii++) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || unparse(rnds);
}

// Export public API
var uuid = v4;
uuid.v1 = v1;
uuid.v4 = v4;
uuid.parse = parse;
uuid.unparse = unparse;
uuid.BufferClass = BufferClass;

module.exports = uuid;

},{"./rng":42,"__browserify_Buffer":61}],44:[function(require,module,exports){
// Params are containers,
// which have a clock key { clock: {} }

// increments the counter for nodeId
exports.increment = function(o, nodeId) {
  if(o.clock) {
    o.clock[nodeId] = (typeof o.clock[nodeId] == 'undefined' ? 1 : o.clock[nodeId] + 1);
  } else {
    o[nodeId] = (typeof o[nodeId] == 'undefined' ? 1 : o[nodeId] + 1);
  }
  return o;
};

function allKeys(a, b){
  var last = null;
  return Object.keys(a)
    .concat(Object.keys(b))
    .sort()
    .filter(function(item) {
      // to make a set of sorted keys unique, just check that consecutive keys are different
      var isDuplicate = (item == last);
      last = item;
      return !isDuplicate;
    });
}

// like a regular sort function, returns:
// if a < b: -1
// if a == b: 0
// if a > b: 1
// E.g. if used to sort an array of keys, will order them in ascending order (1, 2, 3 ..)
exports.ascSort = exports.compare = function(a, b) {
  var isGreater = false,
      isLess = false;

  // allow this function to be called with objects that contain clocks, or the clocks themselves
  if(a.clock) a = a.clock;
  if(b.clock) b = b.clock;

  allKeys(a, b).forEach(function(key) {
    var diff = (a[key] || 0) - (b[key] || 0);
    if(diff > 0) isGreater = true;
    if(diff < 0) isLess = true;
  });

  if(isGreater && isLess) return 0;
  if(isLess) return -1;
  if(isGreater) return 1;
  return 0; // neither is set, so equal
};

// sort in descending order (N, ... 3, 2, 1)
exports.descSort = function(a, b) {
  return 0 - exports.ascSort(a, b);
};

// equal, or not less and not greater than
exports.isConcurrent = function(a, b) {
  return !!(exports.compare(a, b) == 0);
};

// identical
exports.isIdentical = function(a, b) {
  // allow this function to be called with objects that contain clocks, or the clocks themselves
  if(a.clock) a = a.clock;
  if(b.clock) b = b.clock;

  return allKeys(a, b).every(function(key) {
    if(typeof a[key] == 'undefined' || typeof b[key] == 'undefined') return false;
    var diff = a[key] - b[key];
    if(diff != 0) return false;
    return true;
  });
};


// given two vector clocks, returns a new vector clock with all values greater than
// those of the merged clocks
exports.merge = function(a, b) {
  var last = null, result = {}, wantContainer = false;
  // allow this function to be called with objects that contain clocks, or the clocks themselves
  if(a.clock && b.clock) wantContainer = true;
  if(a.clock) a = a.clock;
  if(b.clock) b = b.clock;

  allKeys(a, b).forEach(function(key) {
    result[key] = Math.max(a[key] || 0, b[key] || 0);
  });
  if(wantContainer) {
    return { clock: result };
  }
  return result;
};

exports.GT = 1;
exports.LT = -1;
exports.CONCURRENT = 0;

},{}],45:[function(require,module,exports){
/* jshint node: true */
/* global document, location, Primus: false */
'use strict';

var url = require('url');
var reTrailingSlash = /\/$/;

/**
  ### signaller.loadPrimus(signalhost, callback)

**/
module.exports = function(signalhost, callback) {
  var script;
  var baseUrl;
  var basePath;
  var scriptSrc;

  // if the signalhost is a function, we are in single arg calling mode
  if (typeof signalhost == 'function') {
    callback = signalhost;
    signalhost = location.origin;
  }

  // read the base path
  baseUrl = signalhost.replace(reTrailingSlash, '');
  basePath = url.parse(signalhost).pathname;
  scriptSrc = baseUrl + '/rtc.io/primus.js';

  // look for the script first
  script = document.querySelector('script[src="' + scriptSrc + '"]');

  // if we found, the script trigger the callback immediately
  if (script && typeof Primus != 'undefined') {
    return callback(null, Primus);
  }

  // otherwise create the script and load primus
  script = document.createElement('script');
  script.src = scriptSrc;

  script.onerror = callback;
  script.onload = function() {
    // if we have a signalhost that is not basepathed at /
    // then tweak the primus prototype
    if (basePath !== '/') {
      Primus.prototype.pathname = basePath.replace(reTrailingSlash, '') +
        Primus.prototype.pathname;
    }

    callback(null, Primus);
  };

  document.body.appendChild(script);
};
},{"url":67}],46:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('rtc-signaller-processor');
var jsonparse = require('cog/jsonparse');
var vc = require('vectorclock');

/**
  ## signaller process handling

  When a signaller's underling messenger emits a `data` event this is
  delegated to a simple message parser, which applies the following simple
  logic:

  - Is the message a `/to` message. If so, see if the message is for this
    signaller (checking the target id - 2nd arg).  If so pass the
    remainder of the message onto the standard processing chain.  If not,
    discard the message.

  - Is the message a command message (prefixed with a forward slash). If so,
    look for an appropriate message handler and pass the message payload on
    to it.

  - Finally, does the message match any patterns that we are listening for?
    If so, then pass the entire message contents onto the registered handler.
**/
module.exports = function(signaller) {
  var id = signaller.id;
  var handlers = require('./handlers')(signaller);

  function sendEvent(parts, srcState, data) {
    // initialise the event name
    var evtName = parts[0].slice(1);

    // convert any valid json objects to json
    var args = parts.slice(1).map(jsonparse).concat(data);

    signaller.emit.apply(signaller, [evtName, srcState].concat(args));
  }

  return function(originalData) {
    var data = originalData;
    var isMatch = true;
    var parts;
    var handler;
    var srcData;
    var srcState;

    debug('signaller ' + signaller.id + ' received data: ' + originalData);

    // process /to messages
    if (data.slice(0, 3) === '/to') {
      isMatch = data.slice(4, id.length + 4) === id;
      if (isMatch) {
        parts = data.slice(5 + id.length).split('|').map(jsonparse);

        // get the source data
        srcData = parts[0];
        srcState = signaller.peers.get(srcData && srcData.id);

        // extract the vector clock and update the parts
        parts = parts.slice(1).map(jsonparse);
      }
    }

    // if this is not a match, then bail
    if (! isMatch) {
      return;
    }

    // chop the data into parts
    parts = parts || data.split('|').map(jsonparse);

    // if we have a specific handler for the action, then invoke
    if (parts[0].charAt(0) === '/') {
      // look for a handler for the message type
      handler = handlers[parts[0].slice(1)];

      if (typeof handler == 'function') {
        handler(
          parts.slice(1),
          parts[0].slice(1),
          srcData && srcData.clock,
          srcState
        );
      }
      else {
        sendEvent(parts, srcState, originalData);
      }
    }

    // if we have a clock value (and a source peer), then merge the clock
    if (srcData && srcData.clock && srcState) {
      srcState.clock = vc.merge(srcState.clock, srcData.clock);
    }
  };
};
},{"./handlers":16,"cog/jsonparse":22,"cog/logger":23,"vectorclock":44}],47:[function(require,module,exports){
/* jshint node: true */
/* global RTCIceCandidate: false */
/* global RTCSessionDescription: false */
'use strict';

var debug = require('cog/logger')('couple');
var async = require('async');
var monitor = require('./monitor');
var detect = require('./detect');

/**
  ## rtc/couple

  ### couple(pc, targetId, signaller, opts?)

  Couple a WebRTC connection with another webrtc connection identified by
  `targetId` via the signaller.

  The following options can be provided in the `opts` argument:

  - `sdpfilter` (default: null)

    A simple function for filtering SDP as part of the peer
    connection handshake (see the Using Filters details below).

  - `maxAttempts` (default: 1)

    How many times should negotiation be attempted.  This is
    **experimental** functionality for attempting connection negotiation
    if it fails.

  - `attemptDelay` (default: 3000)

    The amount of ms to wait between connection negotiation attempts.

  #### Example Usage

  ```js
  var couple = require('rtc/couple');

  couple(pc, '54879965-ce43-426e-a8ef-09ac1e39a16d', signaller);
  ```

  #### Using Filters

  In certain instances you may wish to modify the raw SDP that is provided
  by the `createOffer` and `createAnswer` calls.  This can be done by passing
  a `sdpfilter` function (or array) in the options.  For example:

  ```js
  // run the sdp from through a local tweakSdp function.
  couple(pc, '54879965-ce43-426e-a8ef-09ac1e39a16d', signaller, {
    sdpfilter: tweakSdp
  });
  ```

**/
function couple(conn, targetId, signaller, opts) {
  // create a monitor for the connection
  var mon = monitor(conn);
  var blockId;
  var stages = {};
  var localCandidates = [];
  var queuedCandidates = [];
  var sdpFilter = (opts || {}).sdpfilter;

  // retry implementation
  var maxAttempts = (opts || {}).maxAttempts || 1;
  var attemptDelay = (opts || {}).attemptDelay || 3000;
  var attempt = 1;
  var attemptTimer;
  var offerTimeout;

  // initilaise the negotiation helpers
  var createOffer = negotiate('createOffer');
  var createAnswer = negotiate('createAnswer');

  // initialise the processing queue (one at a time please)
  var q = async.queue(function(task, cb) {
    // if the task has no operation, then trigger the callback immediately
    if (typeof task.op != 'function') {
      return cb();
    }

    // process the task operation
    task.op(task, cb);
  }, 1);

  // initialise session description and icecandidate objects
  var RTCSessionDescription = (opts || {}).RTCSessionDescription ||
    detect('RTCSessionDescription');

  var RTCIceCandidate = (opts || {}).RTCIceCandidate ||
    detect('RTCIceCandidate');

  function abort(stage, sdp, cb) {
    var stageHandler = stages[stage];

    return function(err) {
      // log the error
      debug('captured error: ', err);
      q.push({ op: lockRelease });

      // reattempt coupling?
      if (stageHandler && attempt < maxAttempts && (! attemptTimer)) {
        attemptTimer = setTimeout(function() {
          attempt += 1;
          attemptTimer = 0;

          debug('reattempting connection (attempt: ' + attempt + ')');
          stageHandler();
        }, attemptDelay);
      }

      if (typeof cb == 'function') {
        cb(err);
      }
    };
  }

  function negotiate(methodName) {
    var hsDebug = require('cog/logger')('handshake-' + methodName);

    return function(task, cb) {
      // create the offer
      debug('calling ' + methodName);
      conn[methodName](
        function(desc) {

          // if a filter has been specified, then apply the filter
          if (typeof sdpFilter == 'function') {
            desc.sdp = sdpFilter(desc.sdp, conn, methodName);
          }

          // initialise the local description
          conn.setLocalDescription(
            desc,

            // if successful, then send the sdp over the wire
            function() {
              // send the sdp
              signaller.to(targetId).send('/sdp', desc);

              // callback
              cb();
            },

            // on error, abort
            abort(methodName, desc.sdp, cb)
          );
        },

        // on error, abort
        abort(methodName, '', cb)
      );
    };
  }

  function handleLocalCandidate(evt) {
    if (evt.candidate) {
      localCandidates.push(evt.candidate);
    }

    if (conn.iceGatheringState === 'complete') {
      debug('ice gathering state complete, sending candidates')
      signaller.to(targetId).send('/candidates', localCandidates.splice(0));
    }
  }

  function handleRemoteCandidate(targetId, data) {
    if (! conn.remoteDescription) {
      return queuedCandidates.push(data);
    }

    try {
      conn.addIceCandidate(new RTCIceCandidate(data));
    }
    catch (e) {
      debug('invalidate candidate specified: ', data);
    }
  }

  function handleRemoteCandidateArray(src, data) {
    if ((! src) || (src.id !== targetId)) {
      return;
    }

    data.forEach(function(candidate) {
      handleRemoteCandidate(targetId, candidate);
    });
  }

  function handleSdp(src, data) {
    // if the source is unknown or not a match, then abort
    if ((! src) || (src.id !== targetId)) {
      return;
    }

    // prioritize setting the remote description operation
    q.push({ op: function(task, cb) {
      // update the remote description
      // once successful, send the answer
      conn.setRemoteDescription(
        new RTCSessionDescription(data),

        function() {
          // apply any queued candidates
          queuedCandidates.splice(0).forEach(function(data) {
            debug('applying queued candidate');
            conn.addIceCandidate(new RTCIceCandidate(data));
          });

          // create the answer
          if (data.type === 'offer') {
            queue(createAnswer)();
          }

          // trigger the callback
          cb();
        },

        abort(data.type === 'offer' ? 'createAnswer' : 'createOffer', data.sdp, cb)
      );
    }});
  }

  function lockAcquire(task, cb) {
    debug('attempting to acquire negotiate lock with target: ' + targetId);
    signaller.lock(targetId, { label: 'negotiate' }, function(err) {
      if (err) {
        debug('error getting lock, resetting queue');
        queueReset();
      }

      cb(err);
    });
  }

  function lockRelease(task, cb) {
    signaller.unlock(targetId, { label: 'negotiate' }, cb);
  }

  function queue(negotiateTask) {
    return function() {
      q.push([
        { op: lockAcquire },
        { op: negotiateTask },
        { op: lockRelease }
      ]);
    };
  }

  function queueReset() {
    q.tasks.splice(0);
  }

  // if the target id is not a string, then complain
  if (typeof targetId != 'string' && (! (targetId instanceof String))) {
    throw new Error('2nd argument (targetId) should be a string');
  }

  // when regotiation is needed look for the peer
  conn.addEventListener('negotiationneeded', function() {
    debug('renegotiation required, will create offer in 50ms');
    clearTimeout(offerTimeout);
    offerTimeout = setTimeout(queue(createOffer), 50);
  });

  conn.addEventListener('icecandidate', handleLocalCandidate);

  // when we receive sdp, then
  signaller.on('sdp', handleSdp);
  signaller.on('candidate', handleRemoteCandidate);
  signaller.on('candidates', handleRemoteCandidateArray);

  // when the connection closes, remove event handlers
  mon.once('closed', function() {
    debug('closed');

    // remove listeners
    signaller.removeListener('sdp', handleSdp);
    signaller.removeListener('candidate', handleRemoteCandidate);
  });

  // patch in the create offer functions
  mon.createOffer = queue(createOffer);

  return mon;
}

module.exports = couple;
},{"./detect":48,"./monitor":51,"async":3,"cog/logger":53}],48:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## rtc/detect

  Provide the [rtc-core/detect](https://github.com/rtc-io/rtc-core#detect) 
  functionality.
**/
module.exports = require('rtc-core/detect');
},{"rtc-core/detect":12}],49:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('generators');
var detect = require('./detect');
var defaults = require('cog/defaults');

var mappings = {
  create: {
    // data enabler
    data: function(c) {
      if (! detect.moz) {
        c.optional = (c.optional || []).concat({ RtpDataChannels: true });
      }
    },

    dtls: function(c) {
      if (! detect.moz) {
        c.optional = (c.optional || []).concat({ DtlsSrtpKeyAgreement: true });
      }
    }
  }
};

// initialise known flags
var knownFlags = ['video', 'audio', 'data'];

/**
  ## rtc/generators

  The generators package provides some utility methods for generating
  constraint objects and similar constructs.

  ```js
  var generators = require('rtc/generators');
  ```

**/

/**
  ### generators.config(config)

  Generate a configuration object suitable for passing into an W3C
  RTCPeerConnection constructor first argument, based on our custom config.
**/
exports.config = function(config) {
  return defaults(config, {
    iceServers: []
  });
};

/**
  ### generators.connectionConstraints(flags, constraints)

  This is a helper function that will generate appropriate connection
  constraints for a new `RTCPeerConnection` object which is constructed
  in the following way:

  ```js
  var conn = new RTCPeerConnection(flags, constraints);
  ```

  In most cases the constraints object can be left empty, but when creating
  data channels some additional options are required.  This function
  can generate those additional options and intelligently combine any
  user defined constraints (in `constraints`) with shorthand flags that
  might be passed while using the `rtc.createConnection` helper.
**/
exports.connectionConstraints = function(flags, constraints) {
  var generated = {};
  var m = mappings.create;
  var out;

  // iterate through the flags and apply the create mappings
  Object.keys(flags || {}).forEach(function(key) {
    if (m[key]) {
      m[key](generated);
    }
  });

  // generate the connection constraints
  out = defaults({}, constraints, generated);
  debug('generated connection constraints: ', out);

  return out;
};

/**
  ### parseFlags(opts)

  This is a helper function that will extract known flags from a generic
  options object.
**/
var parseFlags = exports.parseFlags = function(options) {
  // ensure we have opts
  var opts = options || {};

  // default video and audio flags to true if undefined
  opts.video = opts.video || typeof opts.video == 'undefined';
  opts.audio = opts.audio || typeof opts.audio == 'undefined';

  return Object.keys(opts || {})
    .filter(function(flag) {
      return opts[flag];
    })
    .map(function(flag) {
      return flag.toLowerCase();
    })
    .filter(function(flag) {
      return knownFlags.indexOf(flag) >= 0;
    });
};
},{"./detect":48,"cog/defaults":52,"cog/logger":53}],50:[function(require,module,exports){
/* jshint node: true */

'use strict';

/**
  # rtc

  The `rtc` package is a convenience layer for working with the rtc.io toolkit.
  Consider it a boxed set of lego of the most common pieces required to build
  the front-end component of a WebRTC application.

  ## Getting Started

  TO BE COMPLETED.

**/

var gen = require('./generators');

// export detect
var detect = exports.detect = require('./detect');

// export cog logger for convenience
exports.logger = require('cog/logger');

// export peer connection
var RTCPeerConnection =
exports.RTCPeerConnection = detect('RTCPeerConnection');

// add the couple utility
exports.couple = require('./couple');

/**
  ## Factories
**/

/**
  ### createConnection(opts?, constraints?)

  Create a new `RTCPeerConnection` auto generating default opts as required.

  ```js
  var conn;

  // this is ok
  conn = rtc.createConnection();

  // and so is this
  conn = rtc.createConnection({
    iceServers: []
  });
  ```
**/
exports.createConnection = function(opts, constraints) {
  return new RTCPeerConnection(
    // generate the config based on options provided
    gen.config(opts),

    // generate appropriate connection constraints
    gen.connectionConstraints(opts, constraints)
  );
};
},{"./couple":47,"./detect":48,"./generators":49,"cog/logger":53}],51:[function(require,module,exports){
var process=require("__browserify_process");/* jshint node: true */
'use strict';

var debug = require('cog/logger')('monitor');
var EventEmitter = require('events').EventEmitter;
var W3C_STATES = {
  NEW: 'new',
  LOCAL_OFFER: 'have-local-offer',
  LOCAL_PRANSWER: 'have-local-pranswer',
  REMOTE_PRANSWER: 'have-remote-pranswer',
  ACTIVE: 'active',
  CLOSED: 'closed'
};

/**
  ## rtc/monitor

  In most current implementations of `RTCPeerConnection` it is quite
  difficult to determine whether a peer connection is active and ready
  for use or not.  The monitor provides some assistance here by providing
  a simple function that provides an `EventEmitter` which gives updates
  on a connections state.

  ### monitor(pc) -> EventEmitter

  ```js
  var monitor = require('rtc/monitor');
  var pc = new RTCPeerConnection(config);

  // watch pc and when active do something
  monitor(pc).once('active', function() {
    // active and ready to go
  });
  ```

  Events provided by the monitor are as follows:

  - `active`: triggered when the connection is active and ready for use
  - `stable`: triggered when the connection is in a stable signalling state
  - `unstable`: trigger when the connection is renegotiating.

  It should be noted, that the monitor does a check when it is first passed
  an `RTCPeerConnection` object to see if the `active` state passes checks.
  If so, the `active` event will be fired in the next tick.

  If you require a synchronous check of a connection's "openness" then
  use the `monitor.isActive` test outlined below.
**/
var monitor = module.exports = function(pc, tag) {
  // create a new event emitter which will communicate events
  var mon = new EventEmitter();
  var currentState = getState(pc);
  var isActive = mon.active = currentState === W3C_STATES.ACTIVE;

  function checkState() {
    var newState = getState(pc, tag);
    debug('captured state change, new state: ' + newState +
      ', current state: ' + currentState);

    // update the monitor active flag
    mon.active = newState === W3C_STATES.ACTIVE;

    // if we have a state change, emit an event for the new state
    if (newState !== currentState) {
      mon.emit(currentState = newState);
    }
  }

  // if the current state is active, trigger the active event
  if (isActive) {
    process.nextTick(mon.emit.bind(mon, W3C_STATES.ACTIVE, pc));
  }

  // start watching stuff on the pc
  pc.addEventListener('signalingstatechange', checkState);
  pc.addEventListener('iceconnectionstatechange', checkState);

  // patch in a stop method into the emitter
  mon.stop = function() {
    pc.removeEventListener('signalingstatechange', checkState);
    pc.removeEventListener('iceconnectionstatechange', checkState);
  };

  return mon;
};

/**
  ### monitor.getState(pc)

  Provides a unified state definition for the RTCPeerConnection based
  on a few checks.

  In emerging versions of the spec we have various properties such as
  `readyState` that provide a definitive answer on the state of the 
  connection.  In older versions we need to look at things like
  `signalingState` and `iceGatheringState` to make an educated guess 
  as to the connection state.
**/
var getState = monitor.getState = function(pc, tag) {
  var signalingState = pc && pc.signalingState;
  var iceGatheringState = pc && pc.iceGatheringState;
  var iceConnectionState = pc && pc.iceConnectionState;
  var localDesc;
  var remoteDesc;
  var state;
  var isActive;

  // if no connection return closed
  if (! pc) {
    return W3C_STATES.CLOSED;
  }

  // initialise the tag to an empty string if not provided
  tag = tag || '';

  // get the connection local and remote description
  localDesc = pc.localDescription;
  remoteDesc = pc.remoteDescription;

  // use the signalling state
  state = signalingState;

  // if state == 'stable' then investigate
  if (state === 'stable') {
    // initialise the state to new
    state = W3C_STATES.NEW;

    // if we have a local description and remote description flag
    // as pranswered
    if (localDesc && remoteDesc) {
      state = W3C_STATES.REMOTE_PRANSWER;
    }
  }

  // check to see if we are in the active state
  isActive = (state === W3C_STATES.REMOTE_PRANSWER) &&
    (iceConnectionState === 'connected');

  debug(tag + 'signaling state: ' + signalingState +
    ', iceGatheringState: ' + iceGatheringState +
    ', iceConnectionState: ' + iceConnectionState);
  
  return isActive ? W3C_STATES.ACTIVE : state;
};

/**
  ### monitor.isActive(pc) -> Boolean

  Test an `RTCPeerConnection` to see if it's currently open.  The test for
  "openness" looks at a combination of current `signalingState` and
  `iceGatheringState`.
**/
monitor.isActive = function(pc) {
  var isStable = pc && pc.signalingState === 'stable';

  // return with the connection is active
  return isStable && getState(pc) === W3C_STATES.ACTIVE;
};
},{"__browserify_process":62,"cog/logger":53,"events":59}],52:[function(require,module,exports){
module.exports=require(4)
},{}],53:[function(require,module,exports){
module.exports=require(6)
},{}],54:[function(require,module,exports){
var parser = require('./lib/parser');
var writer = require('./lib/writer');

exports.write = writer;
exports.parse = parser.parse;
exports.parseFmtpConfig = parser.parseFmtpConfig;
exports.parsePayloads = parser.parsePayloads;
exports.parseRemoteCandidates = parser.parseRemoteCandidates;

},{"./lib/parser":56,"./lib/writer":57}],55:[function(require,module,exports){
var grammar = module.exports = {
  v: [{
      name: 'version',
      reg: /^(\d*)$/
  }],
  o: [{ //o=- 20518 0 IN IP4 203.0.113.1
    // NB: sessionId will be a String in most cases because it is huge
    name: 'origin',
    reg: /^(\S*) (\d*) (\d*) (\S*) IP(\d) (.*)/,
    names: ['username', 'sessionId', 'sessionVersion', 'netType', 'ipVer', 'address'],
    format: "%s %s %d %s IP%d %s"
  }],
  // default parsing of these only (though some of these feel outdated)
  s: [{ name: 'name' }],
  i: [{ name: 'description' }],
  u: [{ name: 'uri' }],
  e: [{ name: 'email' }],
  p: [{ name: 'phone' }],
  z: [{ name: 'timezones' }], // TODO: this one can actually be parsed properly..
  r: [{ name: 'repeats' }],   // TODO: this one can also be parsed properly
  //k: [{}], // outdated thing ignored
  t: [{ //t=0 0
    name: 'timing',
    reg: /^(\d*) (\d*)/,
    names: ['start', 'stop'],
    format: "%d %d"
  }],
  c: [{ //c=IN IP4 10.47.197.26
      name: 'connection',
      reg: /^IN IP(\d) (.*)/,
      names: ['version', 'ip'],
      format: "IN IP%d %s"
  }],
  b: [{ //b=AS:4000
      push: 'bandwidth',
      reg: /^(TIAS|AS|CT|RR|RS)\:(\d*)/,
      names: ['type', 'limit'],
      format: "%s:%s"
  }],
  m: [{ //m=video 51744 RTP/AVP 126 97 98 34 31
      // NB: special - pushes to session
      // TODO: rtp/fmtp should be filtered by the payloads found here?
      reg: /^(\w*) (\d*) ([\w\/]*)\s?(.*)?/,
      names: ['type', 'port', 'protocol', 'payloads'],
      format: "%s %d %s %s"
  }],
  a: [
    { //a=rtpmap:110 MP4A-LATM/90000
      push: 'rtp',
      reg: /^rtpmap\:(\d*) (\w*)\/(\d*)/,
      names: ['payload', 'codec', 'rate'],
      format: "rtpmap:%d %s/%d"
    },
    { //a=fmtp:108 profile-level-id=24;object=23;bitrate=64000
      push: 'fmtp',
      reg: /^fmtp\:(\d*) (.*)/,
      names: ['payload', 'config'],
      format: "fmtp:%d %s"
    },
    { //a=rtcp-fb:98 trr-int 100
      push: 'rtcpFbTrrInt',
      reg: /^rtcp-fb\:(\*|\d*) trr-int (\d*)/,
      names: ['payload', 'value'],
      format: "rtcp-fb:%d trr-int %d"
    },
    { //a=rtcp-fb:98 nack rpsi
      push: 'rtcpFb',
      reg: /^rtcp-fb\:(\*|\d*) (\w*) ?(\w*)/,
      names: ['payload', 'type', 'subtype'],
      format: "rtcp-fb:%s %s %s"
    },
    { //a=extmap:2 urn:ietf:params:rtp-hdrext:toffset
      //a=extmap:1/recvonly URI-gps-string
      push: 'ext',
      reg: /^extmap:([a-zA-Z0-9_\/]*) ([^ ]*) ?(.*)/,
      names: ['value', 'uri', 'config'], // value may include "/direction" suffix
      format: "extmap:%s %s %s"
    },
    {
      //a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:PS1uQCVeeCFCanVmcjkpPywjNWhcYD0mXXtxaVBR|2^20|1:32
      push: 'crypto',
      reg: /^crypto:(\d*) ([a-zA-Z0-9_]*) ?([^ ]*) ?(.*)/,
      names: ['id', 'suite', 'config', 'sessionConfig'],
      format: "crypto:%d %s %s %s"
    },
    { //a=setup:actpass
      name: 'setup',
      reg: /^setup\:(\w*)/,
      format: "setup:%s"
    },
    { //a=mid:1
      name: 'mid',
      reg: /^mid\:(\w*)/,
      format: "mid:%s"
    },
    { //a=ptime:20
      name: 'ptime',
      reg: /^ptime\:(\d*)/,
      format: "ptime:%d"
    },
    { //a=maxptime:60
      name: 'maxptime',
      reg: /^maxptime\:(\d*)/,
      format: "maxptime:%d"
    },
    { //a=sendrecv
      name: 'sendrecv',
      reg: /^(sendrecv|recvonly|sendonly|inactive)/
    },
    { //a=ice-ufrag:F7gI
      name: 'iceUfrag',
      reg: /^ice-ufrag\:(.*)/,
      format: "ice-ufrag:%s"
    },
    { //a=ice-pwd:x9cml/YzichV2+XlhiMu8g
      name: 'icePwd',
      reg: /^ice-pwd\:(.*)/,
      format: "ice-pwd:%s"
    },
    { //a=fingerprint:SHA-1 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33
      name: 'fingerprint',
      reg: /^fingerprint\:(\S*) (.*)/,
      names: ['type', 'hash'],
      format: "fingerprint:%s %s"
    },
    { //a=candidate:0 1 UDP 2113667327 203.0.113.1 54400 typ host
      push: 'candidates',
      reg: /^candidate:(\S*) (\d*) (\S*) (\d*) (\S*) (\d*) typ (\S*)/,
      names: ['foundation', 'component', 'transport', 'priority', 'ip', 'port', 'type'],
      format: "candidate:%s %d %s %d %s %d typ %s"
    },
    { //a=remote-candidates:1 203.0.113.1 54400 2 203.0.113.1 54401 ...
      name: 'remoteCandidates',
      reg: /^remote-candidates:(.*)/,
      format: "remote-candidates:%s"
    },
    { //a=ice-options:google-ice
      name: 'iceOptions',
      reg: /^ice-options\:(.*)/,
      format: "ice-options:%s"
    },
    { //a=ssrc:2566107569 cname:t9YU8M1UxTF8Y1A1
      push: "ssrcs",
      reg: /^ssrc\:(\d*) ([a-zA-Z0-9_]*)\:(.*)/,
      names: ['id', 'attribute', 'value'],
      format: "ssrc:%d %s:%s"
    },
    { //a=msid-semantic: WMS Jvlam5X3SX1OP6pn20zWogvaKJz5Hjf9OnlV
      name: "msidSemantic",
      reg: /^msid-semantic\: (\w*) (.*)/,
      names: ['semantic', 'token'],
      format: "msid-semantic: %s %s" // space after ":" is not accidental
    },
    { //a=group:BUNDLE audio video
      push: 'groups',
      reg: /^group\:(\w*) (.*)/,
      names: ['type', 'mids'],
      format: "group:%s %s"
    },
    { //a=rtcp-mux
      name: 'rtcpMux',
      reg: /^(rtcp-mux)/
    }
  ]
};

// set sensible defaults to avoid polluting the grammar with boring details
Object.keys(grammar).forEach(function (key) {
  var objs = grammar[key];
  objs.forEach(function (obj) {
    if (!obj.reg) {
      obj.reg = /(.*)/;
    }
    if (!obj.format) {
      obj.format = "%s";
    }
  });
}); 

},{}],56:[function(require,module,exports){
var toIntIfInt = function (v) {
  return String(Number(v)) === v ? Number(v) : v;
};

var attachProperties = function (match, location, names, rawName) {
  if (rawName && !names) {
    location[rawName] = toIntIfInt(match[1]);
  }
  else {
    for (var i = 0; i < names.length; i += 1) {
      location[names[i]] = toIntIfInt(match[i+1]);
    }
  }
};

var parseReg = function (obj, location, content) {
  var needsBlank = obj.name && obj.names;
  if (obj.push && !location[obj.push]) {
    location[obj.push] = [];
  }
  else if (needsBlank && !location[obj.name]) {
    location[obj.name] = {};
  }
  var keyLocation = obj.push ?
    {} :  // blank object that will be pushed
    needsBlank ? location[obj.name] : location; // otherwise, named location or root

  attachProperties(content.match(obj.reg), keyLocation, obj.names, obj.name);

  if (obj.push) {
    location[obj.push].push(keyLocation);
  }
};

var grammar = require('./grammar');
var validLine = RegExp.prototype.test.bind(/^([a-z])=(.*)/);

exports.parse = function (sdp) {
  var session = {}
    , media = []
    , location = session; // points at where properties go under (one of the above)

  // parse lines we understand
  sdp.split('\n').filter(validLine).forEach(function (l) {
    var type = l[0];
    var content = l.slice(2);
    if (type === 'm') {
      media.push({rtp: [], fmtp: []});
      location = media[media.length-1]; // point at latest media line
    }

    for (var j = 0; j < (grammar[type] || []).length; j += 1) {
      var obj = grammar[type][j];
      if (obj.reg.test(content)) {
        return parseReg(obj, location, content);
      }
    }
  });

  session.media = media; // link it up
  return session;
};

var fmtpReducer = function (acc, expr) {
  var s = expr.split('=');
  if (s.length === 2) {
    acc[s[0]] = toIntIfInt(s[1]);
  }
  return acc;
};

exports.parseFmtpConfig = function (str) {
  return str.split(';').reduce(fmtpReducer, {});
};

exports.parsePayloads = function (str) {
  return str.split(' ').map(Number);
};

exports.parseRemoteCandidates = function (str) {
  var candidates = [];
  var parts = str.split(' ').map(toIntIfInt);
  for (var i = 0; i < parts.length; i += 3) {
    candidates.push({
      component: parts[i],
      ip: parts[i + 1],
      port: parts[i + 2]
    });
  }
  return candidates;
};

},{"./grammar":55}],57:[function(require,module,exports){
var grammar = require('./grammar');
var format = require('util').format;

var makeLine = function (type, obj, location) {
  var args = [type + '=' + obj.format];
  if (obj.names) {
    for (var i = 0; i < obj.names.length; i += 1) {
      var n = obj.names[i];
      if (obj.name) {
        args.push(location[obj.name][n]);
      }
      else { // for mLine and push attributes
        args.push(location[obj.names[i]]);
      }
    }
  }
  else {
    args.push(location[obj.name]);
  }
  return format.apply(null, args);
};

// RFC specified order
// TODO: extend this with all the rest
var defaultOuterOrder = [
  'v', 'o', 's', 'i',
  'u', 'e', 'p', 'c',
  'b', 't', 'r', 'z', 'a'
];
var defaultInnerOrder = ['i', 'c', 'b', 'a'];


module.exports = function (session, opts) {
  opts = opts || {};
  // ensure certain properties exist
  if (session.version == null) {
    session.version = 0; // "v=0" must be there (only defined version atm)
  }
  if (session.name == null) {
    session.name = " "; // "s= " must be there if no meaningful name set
  }
  session.media.forEach(function (mLine) {
    if (mLine.payloads == null) {
      mLine.payloads = "";
    }
  });

  var outerOrder = opts.outerOrder || defaultOuterOrder;
  var innerOrder = opts.innerOrder || defaultInnerOrder;
  var sdp = [];

  // loop through outerOrder for matching properties on session
  outerOrder.forEach(function (type) {
    grammar[type].forEach(function (obj) {
      if (obj.name in session) {
        sdp.push(makeLine(type, obj, session));
      }
      else if (obj.push in session) {
        session[obj.push].forEach(function (el) {
          sdp.push(makeLine(type, obj, el));
        });
      }
    });
  });

  // then for each media line, follow the innerOrder
  session.media.forEach(function (mLine) {
    sdp.push(makeLine('m', grammar.m[0], mLine));

    innerOrder.forEach(function (type) {
      grammar[type].forEach(function (obj) {
        if (obj.name in mLine) {
          sdp.push(makeLine(type, obj, mLine));
        }
        else if (obj.push in mLine) {
          mLine[obj.push].forEach(function (el) {
            sdp.push(makeLine(type, obj, el));
          });
        }
      });
    });
  });

  return sdp.join('\n') + '\n';
};

},{"./grammar":55,"util":69}],58:[function(require,module,exports){
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

  // create our underlying socket connection
  this.socket = new Primus(config.signalhost);
  this.socket.on('open', this.emit.bind(this, 'active'));

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
  }

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

    // couple the connections
    monitor = rtc.couple(peer, data.id, signaller, opts);

    // wait for the monitor to tell us we have an active connection
    // before attempting to bind to any UI elements
    monitor.once('active', function() {
      eve('glue.peer.active.' + (data.role || 'none'), null, peer, data.id);
    });

    eve('glue.peer.join.' + (data.role || 'none'), null, peer, data.id);
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

  signaller.on('streamdata', function(src, data) {
    // save the stream data to the local stream
    mgr.streams[data.id] = data;
    eve('glue.streamdata.' + data.id, null, data);
  });
};
},{"cog/extend":5,"cog/logger":6,"eve":7,"events":59,"rtc":50,"rtc-signaller":20,"util":69}],59:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      console.trace();
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],60:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],61:[function(require,module,exports){
require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"PcZj9L":[function(require,module,exports){
var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `browserSupport`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
var browserSupport = (function () {
   // Detect if browser supports Typed Arrays. Supported browsers are IE 10+,
   // Firefox 4+, Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+.
   if (typeof Uint8Array === 'undefined' || typeof ArrayBuffer === 'undefined' ||
        typeof DataView === 'undefined')
      return false

  // Does the browser support adding properties to `Uint8Array` instances? If
  // not, then that's the same as no `Uint8Array` support. We need to be able to
  // add all the node Buffer API methods.
  // Relevant Firefox bug: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var arr = new Uint8Array(0)
    arr.foo = function () { return 42 }
    return 42 === arr.foo()
  } catch (e) {
    return false
  }
})()


/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // Assume object is an array
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (browserSupport) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = augment(new Uint8Array(length))
  } else {
    // Fallback: Return this instance of Buffer
    buf = this
    buf.length = length
  }

  var i
  if (Buffer.isBuffer(subject)) {
    // Speed optimization -- use set if we're copying from a Uint8Array
    buf.set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !browserSupport && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
      return true

    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return b && b._isBuffer
}

Buffer.byteLength = function (str, encoding) {
  switch (encoding || 'utf8') {
    case 'hex':
      return str.length / 2

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length

    case 'ascii':
    case 'binary':
      return str.length

    case 'base64':
      return base64ToBytes(str).length

    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) {
    throw new Error('Usage: Buffer.concat(list, [totalLength])\n' +
        'list should be an Array.')
  }

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(byte)) throw new Error('Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
}

function _asciiWrite (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var bytes, pos
  return Buffer._charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  switch (encoding) {
    case 'hex':
      return _hexWrite(this, string, offset, length)

    case 'utf8':
    case 'utf-8':
      return _utf8Write(this, string, offset, length)

    case 'ascii':
      return _asciiWrite(this, string, offset, length)

    case 'binary':
      return _binaryWrite(this, string, offset, length)

    case 'base64':
      return _base64Write(this, string, offset, length)

    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  switch (encoding) {
    case 'hex':
      return _hexSlice(self, start, end)

    case 'utf8':
    case 'utf-8':
      return _utf8Slice(self, start, end)

    case 'ascii':
      return _asciiSlice(self, start, end)

    case 'binary':
      return _binarySlice(self, start, end)

    case 'base64':
      return _base64Slice(self, start, end)

    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  if (end < start)
    throw new Error('sourceEnd < sourceStart')
  if (target_start < 0 || target_start >= target.length)
    throw new Error('targetStart out of bounds')
  if (start < 0 || start >= source.length)
    throw new Error('sourceStart out of bounds')
  if (end < 0 || end > source.length)
    throw new Error('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  // copy!
  for (var i = 0; i < end - start; i++)
    target[i + target_start] = this[i + start]
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

// TODO: add test that modifying the new buffer slice will modify memory in the
// original buffer! Use code from:
// http://nodejs.org/api/buffer.html#buffer_buf_slice_start_end
Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (browserSupport) {
    return augment(this.subarray(start, end))
  } else {
    // TODO: slicing works, with limitations (no parent tracking/update)
    // https://github.com/feross/native-buffer-browserify/issues/9
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'Trying to read beyond buffer length')
  }

  if (offset >= buf.length)
    return

  return buf[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 1 < len) {
      return buf._dataview.getUint16(offset, littleEndian)
    } else {
      var dv = new DataView(new ArrayBuffer(2))
      dv.setUint8(0, buf[len - 1])
      return dv.getUint16(0, littleEndian)
    }
  } else {
    var val
    if (littleEndian) {
      val = buf[offset]
      if (offset + 1 < len)
        val |= buf[offset + 1] << 8
    } else {
      val = buf[offset] << 8
      if (offset + 1 < len)
        val |= buf[offset + 1]
    }
    return val
  }
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 3 < len) {
      return buf._dataview.getUint32(offset, littleEndian)
    } else {
      var dv = new DataView(new ArrayBuffer(4))
      for (var i = 0; i + offset < len; i++) {
        dv.setUint8(i, buf[i + offset])
      }
      return dv.getUint32(0, littleEndian)
    }
  } else {
    var val
    if (littleEndian) {
      if (offset + 2 < len)
        val = buf[offset + 2] << 16
      if (offset + 1 < len)
        val |= buf[offset + 1] << 8
      val |= buf[offset]
      if (offset + 3 < len)
        val = val + (buf[offset + 3] << 24 >>> 0)
    } else {
      if (offset + 1 < len)
        val = buf[offset + 1] << 16
      if (offset + 2 < len)
        val |= buf[offset + 2] << 8
      if (offset + 3 < len)
        val |= buf[offset + 3]
      val = val + (buf[offset] << 24 >>> 0)
    }
    return val
  }
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < buf.length, 'Trying to read beyond buffer length')
  }

  if (offset >= buf.length)
    return

  if (browserSupport) {
    return buf._dataview.getInt8(offset)
  } else {
    var neg = buf[offset] & 0x80
    if (neg)
      return (0xff - buf[offset] + 1) * -1
    else
      return buf[offset]
  }
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 1 === len) {
      var dv = new DataView(new ArrayBuffer(2))
      dv.setUint8(0, buf[len - 1])
      return dv.getInt16(0, littleEndian)
    } else {
      return buf._dataview.getInt16(offset, littleEndian)
    }
  } else {
    var val = _readUInt16(buf, offset, littleEndian, true)
    var neg = val & 0x8000
    if (neg)
      return (0xffff - val + 1) * -1
    else
      return val
  }
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 3 >= len) {
      var dv = new DataView(new ArrayBuffer(4))
      for (var i = 0; i + offset < len; i++) {
        dv.setUint8(i, buf[i + offset])
      }
      return dv.getInt32(0, littleEndian)
    } else {
      return buf._dataview.getInt32(offset, littleEndian)
    }
  } else {
    var val = _readUInt32(buf, offset, littleEndian, true)
    var neg = val & 0x80000000
    if (neg)
      return (0xffffffff - val + 1) * -1
    else
      return val
  }
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  if (browserSupport) {
    return buf._dataview.getFloat32(offset, littleEndian)
  } else {
    return ieee754.read(buf, offset, littleEndian, 23, 4)
  }
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  if (browserSupport) {
    return buf._dataview.getFloat64(offset, littleEndian)
  } else {
    return ieee754.read(buf, offset, littleEndian, 52, 8)
  }
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= buf.length) return

  buf[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 1 === len) {
      var dv = new DataView(new ArrayBuffer(2))
      dv.setUint16(0, value, littleEndian)
      buf[offset] = dv.getUint8(0)
    } else {
      buf._dataview.setUint16(offset, value, littleEndian)
    }
  } else {
    for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
      buf[offset + i] =
          (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
              (littleEndian ? i : 1 - i) * 8
    }
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  var i
  if (browserSupport) {
    if (offset + 3 >= len) {
      var dv = new DataView(new ArrayBuffer(4))
      dv.setUint32(0, value, littleEndian)
      for (i = 0; i + offset < len; i++) {
        buf[i + offset] = dv.getUint8(i)
      }
    } else {
      buf._dataview.setUint32(offset, value, littleEndian)
    }
  } else {
    for (i = 0, j = Math.min(len - offset, 4); i < j; i++) {
      buf[offset + i] =
          (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
    }
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  var buf = this
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= buf.length)
    return

  if (browserSupport) {
    buf._dataview.setInt8(offset, value)
  } else {
    if (value >= 0)
      buf.writeUInt8(value, offset, noAssert)
    else
      buf.writeUInt8(0xff + value + 1, offset, noAssert)
  }
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 1 === len) {
      var dv = new DataView(new ArrayBuffer(2))
      dv.setInt16(0, value, littleEndian)
      buf[offset] = dv.getUint8(0)
    } else {
      buf._dataview.setInt16(offset, value, littleEndian)
    }
  } else {
    if (value >= 0)
      _writeUInt16(buf, value, offset, littleEndian, noAssert)
    else
      _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  }
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 3 >= len) {
      var dv = new DataView(new ArrayBuffer(4))
      dv.setInt32(0, value, littleEndian)
      for (var i = 0; i + offset < len; i++) {
        buf[i + offset] = dv.getUint8(i)
      }
    } else {
      buf._dataview.setInt32(offset, value, littleEndian)
    }
  } else {
    if (value >= 0)
      _writeUInt32(buf, value, offset, littleEndian, noAssert)
    else
      _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  }
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 3 >= len) {
      var dv = new DataView(new ArrayBuffer(4))
      dv.setFloat32(0, value, littleEndian)
      for (var i = 0; i + offset < len; i++) {
        buf[i + offset] = dv.getUint8(i)
      }
    } else {
      buf._dataview.setFloat32(offset, value, littleEndian)
    }
  } else {
    ieee754.write(buf, value, offset, littleEndian, 23, 4)
  }
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (browserSupport) {
    if (offset + 7 >= len) {
      var dv = new DataView(new ArrayBuffer(8))
      dv.setFloat64(0, value, littleEndian)
      for (var i = 0; i + offset < len; i++) {
        buf[i + offset] = dv.getUint8(i)
      }
    } else {
      buf._dataview.setFloat64(offset, value, littleEndian)
    }
  } else {
    ieee754.write(buf, value, offset, littleEndian, 52, 8)
  }
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('value is not a number')
  }

  if (end < start) throw new Error('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds')
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds')
  }

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Not added to Buffer.prototype since it should only
 * be available in browsers that support ArrayBuffer.
 */
function BufferToArrayBuffer () {
  return (new Buffer(this)).buffer
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

function augment (arr) {
  arr._isBuffer = true

  // Augment the Uint8Array *instance* (not the class!) with Buffer methods
  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BufferToArrayBuffer

  if (arr.byteLength !== 0)
    arr._dataview = new DataView(arr.buffer, arr.byteOffset, arr.byteLength)

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value >= 0,
      'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":3,"ieee754":4}],"native-buffer-browserify":[function(require,module,exports){
module.exports=require('PcZj9L');
},{}],3:[function(require,module,exports){
(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = indexOf(b64, '=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (indexOf(lookup, b64.charAt(i)) << 18) | (indexOf(lookup, b64.charAt(i + 1)) << 12) | (indexOf(lookup, b64.charAt(i + 2)) << 6) | indexOf(lookup, b64.charAt(i + 3));
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (indexOf(lookup, b64.charAt(i)) << 2) | (indexOf(lookup, b64.charAt(i + 1)) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (indexOf(lookup, b64.charAt(i)) << 10) | (indexOf(lookup, b64.charAt(i + 1)) << 4) | (indexOf(lookup, b64.charAt(i + 2)) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup.charAt(num >> 18 & 0x3F) + lookup.charAt(num >> 12 & 0x3F) + lookup.charAt(num >> 6 & 0x3F) + lookup.charAt(num & 0x3F);
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup.charAt(temp >> 2);
				output += lookup.charAt((temp << 4) & 0x3F);
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup.charAt(temp >> 10);
				output += lookup.charAt((temp >> 4) & 0x3F);
				output += lookup.charAt((temp << 2) & 0x3F);
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

function indexOf (arr, elt /*, from*/) {
	var len = arr.length;

	var from = Number(arguments[1]) || 0;
	from = (from < 0)
		? Math.ceil(from)
		: Math.floor(from);
	if (from < 0)
		from += len;

	for (; from < len; from++) {
		if ((typeof arr === 'string' && arr.charAt(from) === elt) ||
				(typeof arr !== 'string' && arr[from] === elt)) {
			return from;
		}
	}
	return -1;
}

},{}],4:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}]},{},[])
;;module.exports=require("native-buffer-browserify").Buffer

},{}],62:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],63:[function(require,module,exports){
var global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};/*! http://mths.be/punycode v1.2.3 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    length,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.3',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define(function() {
			return punycode;
		});
	}	else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

},{}],64:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],65:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],66:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":64,"./encode":65}],67:[function(require,module,exports){
/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true*/
(function () {
  "use strict";

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '~', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(delims),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#']
      .concat(unwise).concat(autoEscape),
    nonAuthChars = ['/', '@', '?', '#'].concat(delims),
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-zA-Z0-9][a-z0-9A-Z_-]{0,62}$/,
    hostnamePartStart = /^([a-zA-Z0-9][a-z0-9A-Z_-]{0,62})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always have a path component.
    pathedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && typeof(url) === 'object' && url.href) return url;

  if (typeof url !== 'string') {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var out = {},
      rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    out.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      out.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    // don't enforce full RFC correctness, just be unstupid about it.

    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the first @ sign, unless some non-auth character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    var atSign = rest.indexOf('@');
    if (atSign !== -1) {
      var auth = rest.slice(0, atSign);

      // there *may be* an auth
      var hasAuth = true;
      for (var i = 0, l = nonAuthChars.length; i < l; i++) {
        if (auth.indexOf(nonAuthChars[i]) !== -1) {
          // not a valid auth.  Something like http://foo.com/bar@baz/
          hasAuth = false;
          break;
        }
      }

      if (hasAuth) {
        // pluck off the auth portion.
        out.auth = decodeURIComponent(auth);
        rest = rest.substr(atSign + 1);
      }
    }

    var firstNonHost = -1;
    for (var i = 0, l = nonHostChars.length; i < l; i++) {
      var index = rest.indexOf(nonHostChars[i]);
      if (index !== -1 &&
          (firstNonHost < 0 || index < firstNonHost)) firstNonHost = index;
    }

    if (firstNonHost !== -1) {
      out.host = rest.substr(0, firstNonHost);
      rest = rest.substr(firstNonHost);
    } else {
      out.host = rest;
      rest = '';
    }

    // pull out port.
    var p = parseHost(out.host);
    var keys = Object.keys(p);
    for (var i = 0, l = keys.length; i < l; i++) {
      var key = keys[i];
      out[key] = p[key];
    }

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    out.hostname = out.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = out.hostname[0] === '[' &&
        out.hostname[out.hostname.length - 1] === ']';

    // validate a little.
    if (out.hostname.length > hostnameMaxLen) {
      out.hostname = '';
    } else if (!ipv6Hostname) {
      var hostparts = out.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            out.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    // hostnames are always lower case.
    out.hostname = out.hostname.toLowerCase();

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = out.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      out.hostname = newOut.join('.');
    }

    out.host = (out.hostname || '') +
        ((out.port) ? ':' + out.port : '');
    out.href += out.host;

    // strip [ and ] from the hostname
    if (ipv6Hostname) {
      out.hostname = out.hostname.substr(1, out.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    out.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    out.search = rest.substr(qm);
    out.query = rest.substr(qm + 1);
    if (parseQueryString) {
      out.query = querystring.parse(out.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    out.search = '';
    out.query = {};
  }
  if (rest) out.pathname = rest;
  if (slashedProtocol[proto] &&
      out.hostname && !out.pathname) {
    out.pathname = '/';
  }

  //to support http.request
  if (out.pathname || out.search) {
    out.path = (out.pathname ? out.pathname : '') +
               (out.search ? out.search : '');
  }

  // finally, reconstruct the href based on what has been validated.
  out.href = urlFormat(out);
  return out;
}

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof(obj) === 'string') obj = urlParse(obj);

  var auth = obj.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = obj.protocol || '',
      pathname = obj.pathname || '',
      hash = obj.hash || '',
      host = false,
      query = '';

  if (obj.host !== undefined) {
    host = auth + obj.host;
  } else if (obj.hostname !== undefined) {
    host = auth + (obj.hostname.indexOf(':') === -1 ?
        obj.hostname :
        '[' + obj.hostname + ']');
    if (obj.port) {
      host += ':' + obj.port;
    }
  }

  if (obj.query && typeof obj.query === 'object' &&
      Object.keys(obj.query).length) {
    query = querystring.stringify(obj.query);
  }

  var search = obj.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (obj.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  return protocol + host + pathname + search + hash;
}

function urlResolve(source, relative) {
  return urlFormat(urlResolveObject(source, relative));
}

function urlResolveObject(source, relative) {
  if (!source) return relative;

  source = urlParse(urlFormat(source), false, true);
  relative = urlParse(urlFormat(relative), false, true);

  // hash is always overridden, no matter what.
  source.hash = relative.hash;

  if (relative.href === '') {
    source.href = urlFormat(source);
    return source;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    relative.protocol = source.protocol;
    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[relative.protocol] &&
        relative.hostname && !relative.pathname) {
      relative.path = relative.pathname = '/';
    }
    relative.href = urlFormat(relative);
    return relative;
  }

  if (relative.protocol && relative.protocol !== source.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      relative.href = urlFormat(relative);
      return relative;
    }
    source.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      relative.pathname = relPath.join('/');
    }
    source.pathname = relative.pathname;
    source.search = relative.search;
    source.query = relative.query;
    source.host = relative.host || '';
    source.auth = relative.auth;
    source.hostname = relative.hostname || relative.host;
    source.port = relative.port;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.slashes = source.slashes || relative.slashes;
    source.href = urlFormat(source);
    return source;
  }

  var isSourceAbs = (source.pathname && source.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host !== undefined ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (source.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = source.pathname && source.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = source.protocol &&
          !slashedProtocol[source.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // source.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {

    delete source.hostname;
    delete source.port;
    if (source.host) {
      if (srcPath[0] === '') srcPath[0] = source.host;
      else srcPath.unshift(source.host);
    }
    delete source.host;
    if (relative.protocol) {
      delete relative.hostname;
      delete relative.port;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      delete relative.host;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    source.host = (relative.host || relative.host === '') ?
                      relative.host : source.host;
    source.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : source.hostname;
    source.search = relative.search;
    source.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    source.search = relative.search;
    source.query = relative.query;
  } else if ('search' in relative) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      source.hostname = source.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = source.host && source.host.indexOf('@') > 0 ?
                       source.host.split('@') : false;
      if (authInHost) {
        source.auth = authInHost.shift();
        source.host = source.hostname = authInHost.shift();
      }
    }
    source.search = relative.search;
    source.query = relative.query;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.href = urlFormat(source);
    return source;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    delete source.pathname;
    //to support http.request
    if (!source.search) {
      source.path = '/' + source.search;
    } else {
      delete source.path;
    }
    source.href = urlFormat(source);
    return source;
  }
  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (source.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    source.hostname = source.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = source.host && source.host.indexOf('@') > 0 ?
                     source.host.split('@') : false;
    if (authInHost) {
      source.auth = authInHost.shift();
      source.host = source.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (source.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  source.pathname = srcPath.join('/');
  //to support request.http
  if (source.pathname !== undefined || source.search !== undefined) {
    source.path = (source.pathname ? source.pathname : '') +
                  (source.search ? source.search : '');
  }
  source.auth = relative.auth || source.auth;
  source.slashes = source.slashes || relative.slashes;
  source.href = urlFormat(source);
  return source;
}

function parseHost(host) {
  var out = {};
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      out.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) out.hostname = host;
  return out;
}

}());

},{"punycode":63,"querystring":66}],68:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],69:[function(require,module,exports){
var process=require("__browserify_process"),global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

},{"./support/isBuffer":68,"__browserify_process":62,"inherits":60}]},{},[2])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvaG9tZS9kYW1vLy5iYXNoaW5hdGUvaW5zdGFsbC9ub2RlLzAuMTAuMjQvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ldmVudHMuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9pbmRleC5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9hc3luYy9saWIvYXN5bmMuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvY29nL2RlZmF1bHRzLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL2NvZy9leHRlbmQuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvY29nL2xvZ2dlci5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ldmUvZXZlLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL2Zkb20vbWV0YS5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9mZG9tL29uLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL2Zkb20vcXNhLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1jYXB0dXJlY29uZmlnL2luZGV4LmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1jb3JlL2RldGVjdC5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtY29yZS9yZXNldC5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtbWVkaWEvaW5kZXguanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9oYW5kbGVycy9hbm5vdW5jZS5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL2hhbmRsZXJzL2luZGV4LmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvaGFuZGxlcnMvbGVhdmUuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9oYW5kbGVycy9sb2NrLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvaGFuZGxlcnMvdW5sb2NrLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvaW5kZXguanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29nL2pzb25wYXJzZS5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9kaWN0LmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2Zhc3QtbWFwLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2Zhc3Qtc2V0LmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2dlbmVyaWMtY29sbGVjdGlvbi5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9nZW5lcmljLW1hcC5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9nZW5lcmljLW9yZGVyLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2dlbmVyaWMtc2V0LmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2xpc3QuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvbGlzdGVuL21hcC1jaGFuZ2VzLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2xpc3Rlbi9wcm9wZXJ0eS1jaGFuZ2VzLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2xpc3Rlbi9yYW5nZS1jaGFuZ2VzLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL25vZGVfbW9kdWxlcy93ZWFrLW1hcC93ZWFrLW1hcC5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9zaGltLWFycmF5LmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL3NoaW0tZnVuY3Rpb24uanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvc2hpbS1vYmplY3QuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvc2hpbS1yZWdleHAuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvc2hpbS5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy90cmVlLWxvZy5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy91dWlkL3JuZy1icm93c2VyLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL3V1aWQvdXVpZC5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy92ZWN0b3JjbG9jay9pbmRleC5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL3ByaW11cy1sb2FkZXIuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9wcm9jZXNzb3IuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjL2NvdXBsZS5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMvZGV0ZWN0LmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy9nZW5lcmF0b3JzLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy9pbmRleC5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMvbW9uaXRvci5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9zZHAtdHJhbnNmb3JtL2luZGV4LmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3NkcC10cmFuc2Zvcm0vbGliL2dyYW1tYXIuanMiLCIvY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvc2RwLXRyYW5zZm9ybS9saWIvcGFyc2VyLmpzIiwiL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3NkcC10cmFuc2Zvcm0vbGliL3dyaXRlci5qcyIsIi9jb2RlL3J0Yy5pby9nbHVlL3Nlc3Npb25tYW5hZ2VyLmpzIiwiL2hvbWUvZGFtby8uYmFzaGluYXRlL2luc3RhbGwvbm9kZS8wLjEwLjI0L2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvZXZlbnRzL2V2ZW50cy5qcyIsIi9ob21lL2RhbW8vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luaGVyaXRzL2luaGVyaXRzX2Jyb3dzZXIuanMiLCIvaG9tZS9kYW1vLy5iYXNoaW5hdGUvaW5zdGFsbC9ub2RlLzAuMTAuMjQvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvYnVmZmVyLmpzIiwiL2hvbWUvZGFtby8uYmFzaGluYXRlL2luc3RhbGwvbm9kZS8wLjEwLjI0L2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvaG9tZS9kYW1vLy5iYXNoaW5hdGUvaW5zdGFsbC9ub2RlLzAuMTAuMjQvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wdW55Y29kZS9wdW55Y29kZS5qcyIsIi9ob21lL2RhbW8vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nL2RlY29kZS5qcyIsIi9ob21lL2RhbW8vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nL2VuY29kZS5qcyIsIi9ob21lL2RhbW8vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nL2luZGV4LmpzIiwiL2hvbWUvZGFtby8uYmFzaGluYXRlL2luc3RhbGwvbm9kZS8wLjEwLjI0L2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXJsL3VybC5qcyIsIi9ob21lL2RhbW8vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvc3VwcG9ydC9pc0J1ZmZlckJyb3dzZXIuanMiLCIvaG9tZS9kYW1vLy5iYXNoaW5hdGUvaW5zdGFsbC9ub2RlLzAuMTAuMjQvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9ZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3hZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaGNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5a0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9HQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUM3SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNTBDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBldmUgPSByZXF1aXJlKCdldmUnKTtcbnZhciByZVByZWZpeGVkID0gL15nbHVlXFwuLztcblxuLyoqXG4gICMjIEV2ZW50c1xuXG4gIEdsdWUgdXNlcyBbZXZlXShodHRwczovL2dpdGh1Yi5jb20vYWRvYmUtd2VicGxhdGZvcm0vZXZlKSB1bmRlciB0aGUgaG9vZCxcbiAgYW5kIGV4cG9zZXMgYSBzaW1wbGUgaW50ZXJmYWNlIHRvIGV2ZSBldmVudHMgdGhyb3VnaCB0aGUgYGdsdWUuZXZlbnRzYFxuICBpbnRlcmZhY2UuXG5cbiAgSWYgdXNpbmcgZXZlIGRpcmVjdGx5IHRoZXNlIGV2ZW50cyBhcmUgbmFtZXNwYWNlZCB3aXRoIHRoZSBwcmVmaXggb2ZcbiAgYGdsdWUuYCB0byBhdm9pZCBldmVudCBuYW1lIGNsYXNoZXMgb24gdGhlIGJ1cywgYnV0IHlvdSBjYW4gdXNlIHRoZVxuICBgZ2x1ZS5ldmVudHNgIGVuZHBvaW50IHRvIGF0dGFjaCB0byBldmUgd2l0aG91dCB0aGUgbmFtZXNwYWNlIGlmIHlvdSBwcmVmZXIuXG5cbiAgRm9yIGV4YW1wbGU6XG5cbiAgPDw8IGV4YW1wbGVzL2V2ZW50LW5hbWVzcGFjaW5nLmpzXG5cbioqL1xuWydvbicsICdvbmNlJywgJ29mZiddLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG4gIGV4cG9ydHNbbWV0aG9kXSA9IGZ1bmN0aW9uKG5hbWUsIGhhbmRsZXIpIHtcbiAgICBpZiAoISByZVByZWZpeGVkLnRlc3QobmFtZSkpIHtcbiAgICAgIG5hbWUgPSAnZ2x1ZS4nICsgbmFtZTtcbiAgICB9XG5cbiAgICAvLyByZWdpc3RlciB0aGUgaGFuZGxlclxuICAgIGV2ZVttZXRob2RdKG5hbWUsIGhhbmRsZXIpO1xuICB9O1xufSk7IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbi8qIGdsb2JhbCB3aW5kb3c6IGZhbHNlICovXG4vKiBnbG9iYWwgZG9jdW1lbnQ6IGZhbHNlICovXG4vKiBnbG9iYWwgbG9jYXRpb246IGZhbHNlICovXG4vKiBnbG9iYWwgQ3VzdG9tRXZlbnQ6IGZhbHNlICovXG4vKiBnbG9iYWwgaW86IGZhbHNlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBhc3luYyA9IHJlcXVpcmUoJ2FzeW5jJyk7XG52YXIgdXJsID0gcmVxdWlyZSgndXJsJyk7XG52YXIgZXZlID0gcmVxdWlyZSgnZXZlJyk7XG52YXIgcXNhID0gcmVxdWlyZSgnZmRvbS9xc2EnKTtcbnZhciBvbiA9IHJlcXVpcmUoJ2Zkb20vb24nKTtcbnZhciBleHRlbmQgPSByZXF1aXJlKCdjb2cvZXh0ZW5kJyk7XG52YXIgZGVmYXVsdHMgPSByZXF1aXJlKCdjb2cvZGVmYXVsdHMnKTtcbnZhciBsb2dnZXIgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJyk7XG52YXIgZGVidWcgPSBsb2dnZXIoJ2dsdWUnKTtcbnZhciBzaWduYWxsZXIgPSByZXF1aXJlKCdydGMtc2lnbmFsbGVyJyk7XG52YXIgbWVkaWEgPSByZXF1aXJlKCdydGMtbWVkaWEnKTtcbnZhciBjYXB0dXJlQ29uZmlnID0gcmVxdWlyZSgncnRjLWNhcHR1cmVjb25maWcnKTtcbnZhciB0cmFuc2Zvcm0gPSByZXF1aXJlKCdzZHAtdHJhbnNmb3JtJyk7XG52YXIgcmVzZXRFbCA9IHJlcXVpcmUoJ3J0Yy1jb3JlL3Jlc2V0Jyk7XG4vLyB2YXIgbGluZXIgPSByZXF1aXJlKCdzZHAtbGluZXMnKTtcblxudmFyIHJlU2VwID0gL1tcXHNcXCxdXFxzKi87XG52YXIgcmVUcmFpbGluZ1NsYXNoID0gL1xcLyQvO1xudmFyIGNhbkdldFNvdXJjZXMgPSB0eXBlb2YgTWVkaWFTdHJlYW1UcmFjayAhPSAndW5kZWZpbmVkJyAmJlxuICBNZWRpYVN0cmVhbVRyYWNrLmdldFNvdXJjZXM7XG5cbi8vIGluaXRpYWxpc2Ugb3VyIGNvbmZpZyAodXNpbmcgcnRjLSBuYW1lZCBtZXRhZGF0YSB0YWdzKVxudmFyIGNvbmZpZyA9IGRlZmF1bHRzKHt9LCByZXF1aXJlKCdmZG9tL21ldGEnKSgvXnJ0Yy0oLiopJC8pLCB7XG4gIHJvb206IGxvY2F0aW9uLmhhc2guc2xpY2UoMSksXG4gIHNpZ25hbGhvc3Q6IGxvY2F0aW9uLm9yaWdpbiB8fCAnaHR0cDovL3J0Yy5pby9zd2l0Y2hib2FyZC8nXG59KTtcblxudmFyIFNlc3Npb25NYW5hZ2VyID0gcmVxdWlyZSgnLi9zZXNzaW9ubWFuYWdlcicpO1xudmFyIHNlc3Npb25NZ3I7XG52YXIgc291cmNlcztcblxuLyoqXG4gICMgcnRjLWdsdWVcblxuICBHbHVlIGlzIGEgaGlnaC1sZXZlbCBhcHByb2FjaCB0byBidWlsZGluZyBXZWJSVEMgYXBwbGljYXRpb25zLiBJdCBpc1xuICBwcmltYXJpbHkgZGVzaWduZWQgZm9yIHdlYiBhcHBsaWNhdGlvbiBjb2RlcnMgd2hvIHdvdWxkIHByZWZlciB0byBzcGVuZFxuICB0aGVpciB0aW1lIGluIEhUTUwgYW5kIENTUyByYXRoZXIgdGhhbiBKUy5cblxuICAjIyBFeGFtcGxlIFVzYWdlXG5cbiAgR2x1ZSB3b3JrcyBieSBsb29raW5nIGZvciBIVE1MIHRhZ3MgdGhhdCBmb2xsb3cgcGFydGljdWxhciBjb252ZW50aW9uc1xuICB3aXRoIHJlZ2FyZHMgdG8gbmFtZWQgYXR0cmlidXRlZCwgZXRjLiAgRm9yIGluc3RhbmNlLCBjb25zaWRlciB0aGVcbiAgZm9sbG93aW5nIEhUTUw6XG5cbiAgPDw8IGV4YW1wbGVzL2NhcHR1cmUtb25seS5odG1sXG5cbiAgSXQgaXMgdGhlbiBwb3NzaWJsZSB0byB0d2VhayB0aGUgYGdldFVzZXJNZWRpYWAgY29uc3RyYWludHMgdXNpbmcgc29tZVxuICBmbGFncyBpbiB0aGUgYHJ0Yy1jYXB0dXJlYCBhdHRyaWJ1dGU6XG5cbiAgPDw8IGV4YW1wbGVzL2NhcHR1cmUtdHdlYWtyZXMuaHRtbFxuXG4gIEZvciB0aG9zZSB3aG8gcHJlZmVyIHVzaW5nIHNlcGFyYXRlIGF0dHJpYnV0ZXMsIHlvdSBjYW4gYWNoaWV2ZSBzaW1pbGFyXG4gIGJlaGF2aW91ciB1c2luZyB0aGUgYHJ0Yy1yZXNvbHV0aW9uYCAob3IgYHJ0Yy1yZXNgKSBhdHRyaWJ1dGU6XG5cbiAgPDw8IGV4YW1wbGVzL3Jlcy1hdHRyaWJ1dGUuaHRtbFxuXG4gICMjIENvbmZlcmVuY2luZyBFeGFtcGxlXG5cbiAgVGhlIGZvbGxvd2luZyBpcyBhIHNpbXBsZSBleGFtcGxlIG9mIGNvbmZlcmVuY2luZyB1c2luZyBzb21lIGhvc3RlZCBydGMuaW9cbiAgc2lnbmFsbGluZzpcblxuICA8PDwgZXhhbXBsZXMvY29uZmVyZW5jZS1zaW1wbGUuaHRtbFxuXG4gICMjIEdldHRpbmcgR2x1ZVxuXG4gIFByaW1hcmlseSBnbHVlIGlzIGRlc2lnbmVkIGZvciB1c2UgaW4gYSBzdGFuZGFsb25lIHNpdHVhdGlvbiwgYW5kIHRodXNcbiAgY29tZXMgcHJlLXBhY2thZ2VkIGluIGEgVU1EanNcbiAgW2Rpc3RyaWJ1dGlvbl0oaHR0cHM6Ly9naXRodWIuY29tL3J0Yy1pby9ydGMtZ2x1ZS90cmVlL21hc3Rlci9kaXN0KS4gSWZcbiAgeW91IHByZWZlciB3b3JraW5nIHdpdGggYnJvd3NlcmlmeSwgdGhlbiBpdCB3aWxsIHN0aWxsIHdvcmsgcXVpdGUgbmljZWx5XG4gIGFuZCB5b3Ugc2hvdWxkIGp1c3QgYG5wbSBpbnN0YWxsIHJ0Yy1nbHVlYCBsaWtlIHlvdSB3b3VsZCB3aXRoIG90aGVyXG4gIG1vZHVsZXMgb2YgdGhlIHJ0Yy5pbyBzdWl0ZS5cblxuICAjIyBSdW5uaW5nIHRoZSBFeGFtcGxlc1xuXG4gIFRoaXMgbW9kdWxlIG9mIHRoZSBbcnRjLmlvXShodHRwczovL3J0Yy5pby8pIHN1aXRlIGlzIGEgbGl0dGxlIGRpZmZlcmVudFxuICB0byBvdGhlcnMgaW4gdGhhdCBpdCBjb21lcyB3aXRoIGEgcmVhZHkgdG8gcnVuIGpzIGZpbGUuICBTaW1wbHkgc3RhcnRcbiAgYSB3ZWJzZXJ2ZXIgaW4gdGhlIHJvb3Qgb2YgdGhlIGRpcmVjdG9yeSBhZnRlciBjbG9uaW5nLiAgSWYgeW91IGFyZSBsb29raW5nXG4gIGZvciBhIGdvb2Qgb25lLCBJJ2QgcmVjb21tZW5kIFtzdF0oaHR0cHM6Ly9naXRodWIuY29tL2lzYWFjcy9zdCkuXG5cbiAgIyMgVGFyZ2V0ZWQgTWVkaWEgQ2FwdHVyZVxuXG4gIFRoZSBkcmFmdFxuICBbTWVkaWEgQ2FwdHVyZSBzcGVjXShodHRwOi8vZGV2LnczLm9yZy8yMDExL3dlYnJ0Yy9lZGl0b3IvZ2V0dXNlcm1lZGlhLmh0bWwpXG4gIGludHJvZHVjZXMgdGhlIGFiaWxpdHkgdG8gcXVlcnkgbWVkaWEgZGV2aWNlcyBvbiB0aGUgbWFjaGluZS4gIFRoaXMgaXNcbiAgY3VycmVudGx5IGF2YWlsYWJsZSB0aHJvdWdoIHRoZSBgTWVkaWFTdHJlYW1UcmFjay5nZXRTb3VyY2VzYCBmdW5jdGlvbi5cblxuICBJZiBhdmFpbGFibGUgdGhlbiB5b3UgY2FuIHRhcmdldCB0aGUgY2FwdHVyZSBvZiBhIHBhcnRpY3VsYXIgaW5wdXQgZGV2aWNlXG4gIHRocm91Z2ggdGhlIHVzZSBvZiBhIG51bWJlcmVkIGRldmljZSBjYXB0dXJlIHNwZWNpZmljYXRpb24uICBGb3IgZXhhbXBsZTpcblxuICBgYGBodG1sXG4gIDx2aWRlbyBydGMtY2FwdHVyZT1cImNhbWVyYToxXCI+PC92aWRlbz5cbiAgYGBgXG5cbiAgV291bGQgYXR0dGVtcHQgdG8gY2FwdHVyZSB0aGUgMm5kICgwLWluZGV4ZWQpIGNhbWVyYSBhdmFpbGFibGUgb24gdGhlXG4gIG1hY2hpbmUgKGlmIGl0IGlzIGFibGUgdG8gcXVlcnkgZGV2aWNlcykuICBUaGUgZm9sbG93aW5nIGlzIGEgbGFyZ2VyXG4gIGV4YW1wbGU6XG5cbiAgPDw8IGV4YW1wbGVzL2NhcHR1cmUtbXVsdGljYW0uaHRtbFxuXG4gICMjIE9uIEN1c3RvbSBBdHRyaWJ1dGVzXG5cbiAgV2hpbGUgd2UgaGF2ZW4ndCAxMDAlIGRlY2lkZWQgd2UgYXJlIGxlYW5pbmcgdG93YXJkcyB0aGUgdXNlIG9mIGN1c3RvbVxuICBgcnRjLSpgIGF0dHJpYnV0ZXMgZm9yIGluZmx1ZW5jaW5nIHRoZSBiZWhhdmlvdXIgb2YgdGhlIGBydGMtZ2x1ZWAgbGlicmFyeS5cbiAgV2hpbGUgY3VycmVudGx5IHRoaXMgaXMgaW4gdmlvbGF0aW9uIHdpdGggdGhlIEhUTUw1IHNwZWMsIGl0IGlzIGFuIGFyZWFcbiAgb2YgYWN0aXZlIGRpc2N1c3Npb24gaW4gVzNDIGxhbmQgKGdpdmVuIFtBbmd1bGFySlNdKGh0dHA6Ly9hbmd1bGFyanMub3JnLylcbiAgaGFzIGFkb3B0ZWQgdGhlIGBuZy0qYCBhdHRyaWJ1dGVzIGFuZCBpcyBwcm92aW5nIHBvcHVsYXIpLlxuXG4gICMjIyBEb2N1bWVudCBNZXRhZGF0YVxuXG4gIEluIHRoZSBgcnRjLWdsdWVgIGxpYnJhcnkgd2UgdXNlIGRvY3VtZW50IGxldmVsIGA8bWV0YT5gIHRhZ3MgdG8gcHJvdmlkZVxuICBnbHVlIHdpdGggY29uZmlndXJhdGlvbiBpbmZvcm1hdGlvbi4gIFRoZXJlIGFyZSBhIG51bWJlciBvZiBjb25maWd1cmFibGVcbiAgb3B0aW9ucywgZWFjaCB3aGljaCBpcyB1c2VkIGluIHRoZSBmb3JtIG9mOlxuXG4gIGBgYGh0bWxcbiAgPG1ldGEgbmFtZT1cInJ0Yy0lZmxhZ25hbWUlXCIgY29udGVudD1cImNvbmZpZyBjb250ZW50XCIgLz5cbiAgYGBgXG5cbiAgIyMjIyBydGMtcm9vbVxuXG4gIEEgY3VzdG9tIHJvb20gdGhhdCBuZXcgY29udmVyc2F0aW9ucyB3aWxsIGJlIGNyZWF0ZWQgaW4uICBJZiBub3Qgc3BlY2lmaWVkXG4gIHRoaXMgd2lsbCBkZWZhdWx0IHRvIGEgdmFsdWUgb2YgYGF1dG9gLlxuXG4gICMjIyMgcnRjLXJvbGVcblxuICBJbiBzb21lIGNvbmZlcmVuY2Ugc2NlbmFyaW9zLCBkaWZmZXJlbnQgcGFydGljaXBhbnRzIGFyZSBhc3NpZ25lZCBkaWZmZXJlbnRcbiAgcm9sZXMgKGUuZy4gc3R1ZGVudC90ZWFjaGVyLCBjb25zdWx0YW50L2N1c3RvbWVyLCBldGMpLiAgQnkgc3BlY2lmeWluZyB0aGVcbiAgYHJ0Yy1yb2xlYCBtZXRhZGF0YSB5b3UgdGhpcyByb2xlIGluZm9ybWF0aW9uIHdpbGwgYmUgYW5ub3VuY2VkIGFzIHBhcnRcbiAgb2YgdGhlIGBydGMtcXVpY2tjb25uZWN0YCBpbml0aWFsaXphdGlvbi5cblxuICAjIyBSZWZlcmVuY2VcblxuICAjIyMgRWxlbWVudCBBdHRyaWJ1dGVzXG5cbiAgIyMjIyBydGMtY2FwdHVyZVxuXG4gIFRoZSBwcmVzZW5jZSBvZiB0aGUgYHJ0Yy1jYXB0dXJlYCBhdHRyaWJ1dGUgaW4gYSBgdmlkZW9gIG9yIGBhdWRpb2AgZWxlbWVudFxuICBpbmRpY2F0ZXMgdGhhdCBpdCBpcyBhIGdldFVzZXJNZWRpYSBjYXB0dXJlIHRhcmdldC5cblxuICAjIyMjIHJ0Yy1wZWVyXG5cbiAgVG8gYmUgY29tcGxldGVkLlxuXG4qKi9cbnZhciBnbHVlID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzY29wZSwgb3B0cykge1xuICB2YXIgc3RhcnR1cE9wcyA9IFtdO1xuICB2YXIgZGVidWdUYXJnZXQ7XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgcmVtb3RlIGVsZW1lbnRzXG4gIHZhciBwZWVycyA9IHFzYSgnKltydGMtcGVlcl0nLCBzY29wZSkubWFwKGluaXRQZWVyKTtcblxuICAvLyBpZiB3ZSBoYXZlIHBlZXJzLCB0aGVuIHdlIGFyZSBnb2luZyB0byBuZWVkIHByaW11c1xuICBpZiAocGVlcnMubGVuZ3RoID4gMCkge1xuICAgIHN0YXJ0dXBPcHMucHVzaChsb2FkUHJpbXVzKTtcbiAgfVxuXG4gIC8vIGFwcGx5IGFueSBleHRlcm5hbCBvcHRzIHRvIHRoZSBjb25maWd1cmF0aW9uXG4gIGV4dGVuZChjb25maWcsIG9wdHMpO1xuXG4gIC8vIGRldGVybWluZSBpZiB3ZSBhcmUgZGVidWdnaW5nXG4gIGRlYnVnVGFyZ2V0ID0gKGNvbmZpZyB8fCB7fSkuZGVidWc7XG4gIGlmIChkZWJ1Z1RhcmdldCkge1xuICAgIGlmIChkZWJ1Z1RhcmdldCA9PT0gdHJ1ZSkge1xuICAgICAgbG9nZ2VyLmVuYWJsZSgnKicpO1xuICAgIH1cbiAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRlYnVnVGFyZ2V0KSkge1xuICAgICAgbG9nZ2VyLmVuYWJsZS5hcHBseShsb2dnZXIsIGRlYnVnVGFyZ2V0KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBsb2dnZXIuZW5hYmxlKGRlYnVnVGFyZ2V0KTtcbiAgICB9XG4gIH1cblxuICAvLyBydW4gdGhlIHN0YXJ0dXAgb3BlcmF0aW9uc1xuICBhc3luYy5wYXJhbGxlbChzdGFydHVwT3BzLCBmdW5jdGlvbihlcnIpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBlcnJvcnNcbiAgICBkZWJ1Zygnc3RhcnR1cCBvcHMgY29tcGxldGVkLCBzdGFydGluZyBnbHVlJywgY29uZmlnKTtcbiAgICBldmUoJ2dsdWUucmVhZHknKTtcblxuICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgYSByb29tIG5hbWUsIGdlbmVyYXRlIGEgcm9vbSBuYW1lXG4gICAgaWYgKCEgY29uZmlnLnJvb20pIHtcbiAgICAgIGNvbmZpZy5yb29tID0gZ2VuZXJhdGVSb29tTmFtZSgpO1xuICAgIH1cblxuICAgIC8vIGNyZWF0ZSB0aGUgc2Vzc2lvbiBtYW5hZ2VyXG4gICAgc2Vzc2lvbk1nciA9IHR5cGVvZiBQcmltdXMgIT0gJ3VuZGVmaW5lZCcgJiYgbmV3IFNlc3Npb25NYW5hZ2VyKGNvbmZpZyk7XG5cbiAgICBpZiAoc2Vzc2lvbk1ncikge1xuICAgICAgc2Vzc2lvbk1nci5vbmNlKCdhY3RpdmUnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgcXNhKCcqW3J0Yy1jYXB0dXJlXScsIHNjb3BlKS5mb3JFYWNoKGluaXRDYXB0dXJlKTtcblxuICAgICAgICAvLyBpZiB3ZSBoYXZlIGFueSBwZWVycywgdGhlbiBhbm5vdW5jZSBvdXJzZWx2ZXMgdmlhIHRoZSBzZXNzaW9uIG1hbmFnZXJcbiAgICAgICAgaWYgKHBlZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBzZXNzaW9uTWdyLmFubm91bmNlKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0cmlnZ2VyIGEgZ2x1ZSBzZXNzaW9uIGFjdGl2ZSBldmVudFxuICAgICAgICBldmUoJ2dsdWUuY29ubmVjdGVkJywgbnVsbCwgc2Vzc2lvbk1nci5zaWduYWxsZXIsIHNlc3Npb25NZ3IpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcXNhKCcqW3J0Yy1jYXB0dXJlXScsIHNjb3BlKS5mb3JFYWNoKGluaXRDYXB0dXJlKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gd2lyZSBpbiB0aGUgZXZlbnRzIGhlbHBlclxuZ2x1ZS5ldmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xuXG4vLyBleHBvc2UgdGhlIGNvbmZpZyB0aHJvdWdoIGdsdWVcbmdsdWUuY29uZmlnID0gY29uZmlnO1xuXG4vLyBhdXRvbG9hZCBnbHVlXG5pZiAodHlwZW9mIHdpbmRvdyAhPSAndW5kZWZpbmVkJykge1xuICBvbignbG9hZCcsIHdpbmRvdywgZnVuY3Rpb24oKSB7XG4gICAgLy8gY2hlY2sgaWYgd2UgY2FuIGF1dG9sb2FkXG4gICAgaWYgKGNvbmZpZy5hdXRvbG9hZCA9PT0gdW5kZWZpbmVkIHx8IGNvbmZpZy5hdXRvbG9hZCkge1xuICAgICAgZ2x1ZSgpO1xuICAgIH1cbiAgfSk7XG59XG5cbi8qKlxuICAjIyMgSW50ZXJuYWwgRnVuY3Rpb25zXG4qKi9cblxuLyoqXG4gICMjIyMgaW5pdFBlZXIoZWwpXG5cbiAgSGFuZGxlIHRoZSBpbml0aWFsaXphdGlvbiBvZiBhIHJ0Yy1yZW1vdGUgdGFyZ2V0XG4qKi9cbmZ1bmN0aW9uIGluaXRQZWVyKGVsKSB7XG4gIHZhciBwcm9wVmFsdWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ3J0Yy1wZWVyJyk7XG4gIHZhciB0YXJnZXRTdHJlYW0gPSBlbC5nZXRBdHRyaWJ1dGUoJ3J0Yy1zdHJlYW0nKTtcbiAgdmFyIHBlZXJSb2xlcyA9IHByb3BWYWx1ZSA/IHByb3BWYWx1ZS5zcGxpdChyZVNlcCkgOiBbJyonXTtcblxuICAvLyBjcmVhdGUgYSBkYXRhIGNvbnRhaW5lciB0aGF0IHdlIHdpbGwgYXR0YWNoIHRvIHRoZSBlbGVtZW50XG4gIHZhciBkYXRhID0gZWwuX3J0YyB8fCAoZWwuX3J0YyA9IHt9KTtcblxuICBmdW5jdGlvbiBhdHRhY2hTdHJlYW0oc3RyZWFtKSB7XG4gICAgZGVidWcoJ2F0dGFjaGluZyBzdHJlYW0nKTtcbiAgICBtZWRpYShzdHJlYW0pLnJlbmRlcihlbCk7XG4gICAgZGF0YS5zdHJlYW1JZCA9IHN0cmVhbS5pZDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkZFN0cmVhbShzdHJlYW0sIHBlZXIpIHtcbiAgICAvLyBpZiB3ZSBkb24ndCBoYXZlIGEgc3RyZWFtIG9yIGFscmVhZHkgaGF2ZSBhIHN0cmVhbSBpZCB0aGVuIGJhaWxcbiAgICBpZiAoZGF0YS5zdHJlYW1JZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIGlmIHdlIGhhdmUgYSBwYXJ0aWN1bGFyIHRhcmdldCBzdHJlYW0sIHRoZW4gZ28gbG9va2luZyBmb3IgaXRcbiAgICBpZiAodGFyZ2V0U3RyZWFtKSB7XG4gICAgICBkZWJ1ZygncmVxdWVzdGluZyBzdHJlYW0gZGF0YScpO1xuICAgICAgc2Vzc2lvbk1nci5nZXRTdHJlYW1EYXRhKHN0cmVhbSwgZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICBkZWJ1ZygnZ290IHN0cmVhbSBkYXRhJywgZGF0YSk7XG5cbiAgICAgICAgLy8gaWYgaXQncyBhIG1hdGNoLCB0aGVuIGF0dGFjaFxuICAgICAgICBpZiAoZGF0YSAmJiBkYXRhLm5hbWUgPT09IHRhcmdldFN0cmVhbSkge1xuICAgICAgICAgIGF0dGFjaFN0cmVhbShzdHJlYW0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgLy8gb3RoZXJ3aXNlLCBhdXRvbWF0aWNhbGx5IGFzc29jaWF0ZSB3aXRoIHRoZSBlbGVtZW50XG4gICAgZWxzZSB7XG4gICAgICBhdHRhY2hTdHJlYW0oc3RyZWFtKTtcbiAgICB9XG4gIH1cblxuICAvLyBpdGVyYXRlIHRocm91Z2ggdGhlIHBlZXJzIGFuZCBtb25pdG9yIGV2ZW50cyBmb3IgdGhhdCBwZWVyXG4gIHBlZXJSb2xlcy5mb3JFYWNoKGZ1bmN0aW9uKHJvbGUpIHtcbiAgICBldmUub24oJ2dsdWUucGVlci5hY3RpdmUuJyArIHJvbGUsIGZ1bmN0aW9uKHBlZXIsIHBlZXJJZCkge1xuICAgICAgLy8gaWYgdGhlIGVsZW1lbnQgYWxyZWFkeSBoYXMgYSBwZWVyLCB0aGVuIGRvIG5vdGhpbmdcbiAgICAgIGlmIChkYXRhLnBlZXJJZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGRlYnVnKCdwZWVyIGFjdGl2ZScsIHBlZXIuZ2V0UmVtb3RlU3RyZWFtcygpKTtcblxuICAgICAgLy8gYXNzb2NpYXRlIHRoZSBwZWVyIGlkIHdpdGggdGhlIGVsZW1lbnRcbiAgICAgIGRhdGEucGVlcklkID0gcGVlcklkO1xuXG4gICAgICAvLyBhZGQgZXhpc3Rpbmcgc3RyZWFtc1xuICAgICAgW10uc2xpY2UuY2FsbChwZWVyLmdldFJlbW90ZVN0cmVhbXMoKSkuZm9yRWFjaChhZGRTdHJlYW0pO1xuXG4gICAgICAvLyBsaXN0ZW4gZm9yIGFkZCBzdHJhZW0gZXZlbnRzXG4gICAgICBwZWVyLmFkZEV2ZW50TGlzdGVuZXIoJ2FkZHN0cmVhbScsIGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICBhZGRTdHJlYW0oZXZ0LnN0cmVhbSwgcGVlcik7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZXZlLm9uKCdnbHVlLnBlZXIubGVhdmUnLCBmdW5jdGlvbihwZWVyLCBwZWVySWQpIHtcbiAgICAvLyBpZiB0aGUgcGVlciBsZWF2aW5nIG1hdGNoZXMgdGhlIHJlbW90ZSBwZWVyLCB0aGVuIGNsZWFudXBcbiAgICBpZiAoZGF0YS5wZWVySWQgPT09IHBlZXJJZCkge1xuICAgICAgLy8gcmVzZXQgdGhlIHRhcmdldCBtZWRpYSBlbGVtZW50XG4gICAgICByZXNldEVsKGVsKTtcblxuICAgICAgLy8gcmVzZXQgdGhlIHJ0YyBkYXRhXG4gICAgICBkYXRhID0gZWwuX3J0YyA9IHt9O1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGVsO1xufVxuXG4vKipcbiAgIyMjIyBpbml0Q2FwdHVyZShlbClcblxuICBIYW5kbGUgdGhlIGluaXRpYWxpemF0aW9uIG9mIGFuIHJ0Yy1jYXB0dXJlIHRhcmdldFxuKiovXG5mdW5jdGlvbiBpbml0Q2FwdHVyZShlbCkge1xuICAvLyByZWFkIHRoZSBjYXB0dXJlIGluc3RydWN0aW9uc1xuICB2YXIgY29uZmlnVGV4dCA9IGVsLmdldEF0dHJpYnV0ZSgncnRjLWNhcHR1cmUnKSB8fCAnJztcbiAgdmFyIHJlcyA9IGVsLmdldEF0dHJpYnV0ZSgncnRjLXJlc29sdXRpb24nKSB8fCBlbC5nZXRBdHRyaWJ1dGUoJ3J0Yy1yZXMnKTtcbiAgdmFyIGZwcyA9IGVsLmdldEF0dHJpYnV0ZSgncnRjLWZwcycpO1xuXG4gIGlmIChyZXMpIHtcbiAgICBjb25maWdUZXh0ICs9ICcgbWluOicgKyByZXMgKyAnIG1heDonICsgcmVzO1xuICB9XG5cbiAgaWYgKGZwcykge1xuICAgIGNvbmZpZ1RleHQgKz0gJyBtaW5mcHM6JyArIGZwcyArICcgbWF4ZnBzOicgKyBmcHM7XG4gIH1cblxuICAvLyBwYXRjaCBpbiBhIGNhcHR1cmUgbWV0aG9kIHRvIHRoZSBlbGVtZW50XG4gIGVsLmNhcHR1cmUgPSBlbmFibGVDYXB0dXJlKGVsLCBjYXB0dXJlQ29uZmlnKGNvbmZpZ1RleHQpKTtcblxuICAvLyB0cmlnZ2VyIGNhcHR1cmVcbiAgZWwuY2FwdHVyZShmdW5jdGlvbihzdHJlYW0pIHtcbiAgICAvLyBicm9hZGNhc3QgdGhlIHN0cmVhbSB0aHJvdWdoIHRoZSBzZXNzaW9uIG1hbmFnZXJcbiAgICBpZiAoc2Vzc2lvbk1ncikge1xuICAgICAgc2Vzc2lvbk1nci5icm9hZGNhc3Qoc3RyZWFtLCB7IG5hbWU6IGVsLmlkIH0pO1xuICAgIH1cbiAgfSk7XG59XG5cbi8qKiBpbnRlcm5hbCBoZWxwZXJzICovXG5cbmZ1bmN0aW9uIGVuYWJsZUNhcHR1cmUoZWwsIGNvbmZpZykge1xuXG4gIGZ1bmN0aW9uIGNhcChjYWxsYmFjaykge1xuICAgIHZhciBzdHJlYW0gPSBtZWRpYSh7XG4gICAgICBjb25zdHJhaW50czogY29uZmlnLnRvQ29uc3RyYWludHMoe1xuICAgICAgICBzb3VyY2VzOiBzb3VyY2VzXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgLy8gcmVuZGVyIHRoZSBzdHJlYW0gdG8gdGhlIHRhcmdldCBlbGVtZW50XG4gICAgc3RyZWFtLnJlbmRlcihlbCk7XG5cbiAgICAvLyBjYXB0dXJlIGFuZCByZXBvcnQgZXJyb3JzXG4gICAgc3RyZWFtLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycikge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICdFcnJvciBhdHRlbXB0aW5nIHRvIGNhcHR1cmUgbWVkaWEsIHJlcXVlc3RlZCBjb25zdHJhaW50cycsXG4gICAgICAgIHN0cmVhbS5jb25zdHJhaW50c1xuICAgICAgKTtcbiAgICB9KTtcblxuICAgIC8vIGVtaXQgYSBjYXB0dXJlIGV2ZW50IHRocm91Z2ggdGhlIGVsZW1lbnRcbiAgICBzdHJlYW0ub24oJ2NhcHR1cmUnLCBmdW5jdGlvbihzdHJlYW0pIHtcbiAgICAgIC8vIGRpc3BhdGNoIHRoZSBjYXB0dXJlIGV2ZW50XG4gICAgICBlbC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnY2FwdHVyZScsIHtcbiAgICAgICAgZGV0YWlsOiB7IHN0cmVhbTogc3RyZWFtIH1cbiAgICAgIH0pKTtcblxuICAgICAgLy8gdHJpZ2dlciB0aGUgY2FsbGJhY2sgaWYgb25lIHN1cHBsaWVkXG4gICAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2FsbGJhY2soc3RyZWFtKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBzb3VyY2VzLCBvciBjYW5ub3QgZ2V0IHNvdXJjZSBpbmZvcm1hdGlvblxuICAgIC8vIHRoZW4gc2tpcCBzdHJhaWdodCB0byBjYXB0dXJlXG4gICAgaWYgKHNvdXJjZXMgfHwgKCEgY2FuR2V0U291cmNlcykpIHtcbiAgICAgIHJldHVybiBjYXAoY2FsbGJhY2spO1xuICAgIH1cblxuICAgIC8vIGdldCBhbmQgdXBkYXRlIHNvdXJjZXNcbiAgICBNZWRpYVN0cmVhbVRyYWNrLmdldFNvdXJjZXMoZnVuY3Rpb24ocykge1xuICAgICAgLy8gdXBkYXRlIHRoZSBzb3VyY2VzXG4gICAgICBzb3VyY2VzID0gcztcblxuICAgICAgLy8gY2FwdHVyZVxuICAgICAgY2FwKGNhbGxiYWNrKVxuICAgIH0pO1xuICB9O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZVJvb21OYW1lKCkge1xuICBsb2NhdGlvbi5oYXNoID0gTWF0aC5wb3coMiwgNTMpICogTWF0aC5yYW5kb20oKTtcblxuICByZXR1cm4gbG9jYXRpb24uaGFzaC5zbGljZSgxKTtcbn1cblxuZnVuY3Rpb24gbG9hZFByaW11cyhjYWxsYmFjaykge1xuICByZXR1cm4gc2lnbmFsbGVyLmxvYWRQcmltdXMoY29uZmlnLnNpZ25hbGhvc3QsIGNhbGxiYWNrKTtcbn0iLCJ2YXIgcHJvY2Vzcz1yZXF1aXJlKFwiX19icm93c2VyaWZ5X3Byb2Nlc3NcIik7LypnbG9iYWwgc2V0SW1tZWRpYXRlOiBmYWxzZSwgc2V0VGltZW91dDogZmFsc2UsIGNvbnNvbGU6IGZhbHNlICovXG4oZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIGFzeW5jID0ge307XG5cbiAgICAvLyBnbG9iYWwgb24gdGhlIHNlcnZlciwgd2luZG93IGluIHRoZSBicm93c2VyXG4gICAgdmFyIHJvb3QsIHByZXZpb3VzX2FzeW5jO1xuXG4gICAgcm9vdCA9IHRoaXM7XG4gICAgaWYgKHJvb3QgIT0gbnVsbCkge1xuICAgICAgcHJldmlvdXNfYXN5bmMgPSByb290LmFzeW5jO1xuICAgIH1cblxuICAgIGFzeW5jLm5vQ29uZmxpY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJvb3QuYXN5bmMgPSBwcmV2aW91c19hc3luYztcbiAgICAgICAgcmV0dXJuIGFzeW5jO1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBvbmx5X29uY2UoZm4pIHtcbiAgICAgICAgdmFyIGNhbGxlZCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoY2FsbGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJDYWxsYmFjayB3YXMgYWxyZWFkeSBjYWxsZWQuXCIpO1xuICAgICAgICAgICAgY2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGZuLmFwcGx5KHJvb3QsIGFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLy8vIGNyb3NzLWJyb3dzZXIgY29tcGF0aWJsaXR5IGZ1bmN0aW9ucyAvLy8vXG5cbiAgICB2YXIgX2VhY2ggPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvcikge1xuICAgICAgICBpZiAoYXJyLmZvckVhY2gpIHtcbiAgICAgICAgICAgIHJldHVybiBhcnIuZm9yRWFjaChpdGVyYXRvcik7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGFycltpXSwgaSwgYXJyKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgX21hcCA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yKSB7XG4gICAgICAgIGlmIChhcnIubWFwKSB7XG4gICAgICAgICAgICByZXR1cm4gYXJyLm1hcChpdGVyYXRvcik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICAgICAgX2VhY2goYXJyLCBmdW5jdGlvbiAoeCwgaSwgYSkge1xuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKGl0ZXJhdG9yKHgsIGksIGEpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH07XG5cbiAgICB2YXIgX3JlZHVjZSA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBtZW1vKSB7XG4gICAgICAgIGlmIChhcnIucmVkdWNlKSB7XG4gICAgICAgICAgICByZXR1cm4gYXJyLnJlZHVjZShpdGVyYXRvciwgbWVtbyk7XG4gICAgICAgIH1cbiAgICAgICAgX2VhY2goYXJyLCBmdW5jdGlvbiAoeCwgaSwgYSkge1xuICAgICAgICAgICAgbWVtbyA9IGl0ZXJhdG9yKG1lbW8sIHgsIGksIGEpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgfTtcblxuICAgIHZhciBfa2V5cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKSB7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMob2JqKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIga2V5cyA9IFtdO1xuICAgICAgICBmb3IgKHZhciBrIGluIG9iaikge1xuICAgICAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShrKSkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ga2V5cztcbiAgICB9O1xuXG4gICAgLy8vLyBleHBvcnRlZCBhc3luYyBtb2R1bGUgZnVuY3Rpb25zIC8vLy9cblxuICAgIC8vLy8gbmV4dFRpY2sgaW1wbGVtZW50YXRpb24gd2l0aCBicm93c2VyLWNvbXBhdGlibGUgZmFsbGJhY2sgLy8vL1xuICAgIGlmICh0eXBlb2YgcHJvY2VzcyA9PT0gJ3VuZGVmaW5lZCcgfHwgIShwcm9jZXNzLm5leHRUaWNrKSkge1xuICAgICAgICBpZiAodHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgYXN5bmMubmV4dFRpY2sgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgICAgICAvLyBub3QgYSBkaXJlY3QgYWxpYXMgZm9yIElFMTAgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgICAgIHNldEltbWVkaWF0ZShmbik7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlID0gYXN5bmMubmV4dFRpY2s7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBhc3luYy5uZXh0VGljayA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGFzeW5jLm5leHRUaWNrO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBhc3luYy5uZXh0VGljayA9IHByb2Nlc3MubmV4dFRpY2s7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0SW1tZWRpYXRlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlID0gc2V0SW1tZWRpYXRlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlID0gYXN5bmMubmV4dFRpY2s7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYy5lYWNoID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmICghYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgICAgIF9lYWNoKGFyciwgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIG9ubHlfb25jZShmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcGxldGVkICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgYXN5bmMuZm9yRWFjaCA9IGFzeW5jLmVhY2g7XG5cbiAgICBhc3luYy5lYWNoU2VyaWVzID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmICghYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgICAgIHZhciBpdGVyYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaXRlcmF0b3IoYXJyW2NvbXBsZXRlZF0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgICBpdGVyYXRlKCk7XG4gICAgfTtcbiAgICBhc3luYy5mb3JFYWNoU2VyaWVzID0gYXN5bmMuZWFjaFNlcmllcztcblxuICAgIGFzeW5jLmVhY2hMaW1pdCA9IGZ1bmN0aW9uIChhcnIsIGxpbWl0LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGZuID0gX2VhY2hMaW1pdChsaW1pdCk7XG4gICAgICAgIGZuLmFwcGx5KG51bGwsIFthcnIsIGl0ZXJhdG9yLCBjYWxsYmFja10pO1xuICAgIH07XG4gICAgYXN5bmMuZm9yRWFjaExpbWl0ID0gYXN5bmMuZWFjaExpbWl0O1xuXG4gICAgdmFyIF9lYWNoTGltaXQgPSBmdW5jdGlvbiAobGltaXQpIHtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgaWYgKCFhcnIubGVuZ3RoIHx8IGxpbWl0IDw9IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBjb21wbGV0ZWQgPSAwO1xuICAgICAgICAgICAgdmFyIHN0YXJ0ZWQgPSAwO1xuICAgICAgICAgICAgdmFyIHJ1bm5pbmcgPSAwO1xuXG4gICAgICAgICAgICAoZnVuY3Rpb24gcmVwbGVuaXNoICgpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29tcGxldGVkID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgd2hpbGUgKHJ1bm5pbmcgPCBsaW1pdCAmJiBzdGFydGVkIDwgYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzdGFydGVkICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHJ1bm5pbmcgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IoYXJyW3N0YXJ0ZWQgLSAxXSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBsZXRlZCArPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJ1bm5pbmcgLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcGxldGVkID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcGxlbmlzaCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgfTtcbiAgICB9O1xuXG5cbiAgICB2YXIgZG9QYXJhbGxlbCA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICAgICAgcmV0dXJuIGZuLmFwcGx5KG51bGwsIFthc3luYy5lYWNoXS5jb25jYXQoYXJncykpO1xuICAgICAgICB9O1xuICAgIH07XG4gICAgdmFyIGRvUGFyYWxsZWxMaW1pdCA9IGZ1bmN0aW9uKGxpbWl0LCBmbikge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICAgICAgcmV0dXJuIGZuLmFwcGx5KG51bGwsIFtfZWFjaExpbWl0KGxpbWl0KV0uY29uY2F0KGFyZ3MpKTtcbiAgICAgICAgfTtcbiAgICB9O1xuICAgIHZhciBkb1NlcmllcyA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICAgICAgcmV0dXJuIGZuLmFwcGx5KG51bGwsIFthc3luYy5lYWNoU2VyaWVzXS5jb25jYXQoYXJncykpO1xuICAgICAgICB9O1xuICAgIH07XG5cblxuICAgIHZhciBfYXN5bmNNYXAgPSBmdW5jdGlvbiAoZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgICAgICBhcnIgPSBfbWFwKGFyciwgZnVuY3Rpb24gKHgsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiB7aW5kZXg6IGksIHZhbHVlOiB4fTtcbiAgICAgICAgfSk7XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24gKGVyciwgdikge1xuICAgICAgICAgICAgICAgIHJlc3VsdHNbeC5pbmRleF0gPSB2O1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHRzKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBhc3luYy5tYXAgPSBkb1BhcmFsbGVsKF9hc3luY01hcCk7XG4gICAgYXN5bmMubWFwU2VyaWVzID0gZG9TZXJpZXMoX2FzeW5jTWFwKTtcbiAgICBhc3luYy5tYXBMaW1pdCA9IGZ1bmN0aW9uIChhcnIsIGxpbWl0LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIF9tYXBMaW1pdChsaW1pdCkoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICB2YXIgX21hcExpbWl0ID0gZnVuY3Rpb24obGltaXQpIHtcbiAgICAgICAgcmV0dXJuIGRvUGFyYWxsZWxMaW1pdChsaW1pdCwgX2FzeW5jTWFwKTtcbiAgICB9O1xuXG4gICAgLy8gcmVkdWNlIG9ubHkgaGFzIGEgc2VyaWVzIHZlcnNpb24sIGFzIGRvaW5nIHJlZHVjZSBpbiBwYXJhbGxlbCB3b24ndFxuICAgIC8vIHdvcmsgaW4gbWFueSBzaXR1YXRpb25zLlxuICAgIGFzeW5jLnJlZHVjZSA9IGZ1bmN0aW9uIChhcnIsIG1lbW8sIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBhc3luYy5lYWNoU2VyaWVzKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihtZW1vLCB4LCBmdW5jdGlvbiAoZXJyLCB2KSB7XG4gICAgICAgICAgICAgICAgbWVtbyA9IHY7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIG1lbW8pO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8vIGluamVjdCBhbGlhc1xuICAgIGFzeW5jLmluamVjdCA9IGFzeW5jLnJlZHVjZTtcbiAgICAvLyBmb2xkbCBhbGlhc1xuICAgIGFzeW5jLmZvbGRsID0gYXN5bmMucmVkdWNlO1xuXG4gICAgYXN5bmMucmVkdWNlUmlnaHQgPSBmdW5jdGlvbiAoYXJyLCBtZW1vLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHJldmVyc2VkID0gX21hcChhcnIsIGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgfSkucmV2ZXJzZSgpO1xuICAgICAgICBhc3luYy5yZWR1Y2UocmV2ZXJzZWQsIG1lbW8sIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgfTtcbiAgICAvLyBmb2xkciBhbGlhc1xuICAgIGFzeW5jLmZvbGRyID0gYXN5bmMucmVkdWNlUmlnaHQ7XG5cbiAgICB2YXIgX2ZpbHRlciA9IGZ1bmN0aW9uIChlYWNoZm4sIGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciByZXN1bHRzID0gW107XG4gICAgICAgIGFyciA9IF9tYXAoYXJyLCBmdW5jdGlvbiAoeCwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIHtpbmRleDogaSwgdmFsdWU6IHh9O1xuICAgICAgICB9KTtcbiAgICAgICAgZWFjaGZuKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh4KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhfbWFwKHJlc3VsdHMuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBhLmluZGV4IC0gYi5pbmRleDtcbiAgICAgICAgICAgIH0pLCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB4LnZhbHVlO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIGFzeW5jLmZpbHRlciA9IGRvUGFyYWxsZWwoX2ZpbHRlcik7XG4gICAgYXN5bmMuZmlsdGVyU2VyaWVzID0gZG9TZXJpZXMoX2ZpbHRlcik7XG4gICAgLy8gc2VsZWN0IGFsaWFzXG4gICAgYXN5bmMuc2VsZWN0ID0gYXN5bmMuZmlsdGVyO1xuICAgIGFzeW5jLnNlbGVjdFNlcmllcyA9IGFzeW5jLmZpbHRlclNlcmllcztcblxuICAgIHZhciBfcmVqZWN0ID0gZnVuY3Rpb24gKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICAgICAgYXJyID0gX21hcChhcnIsIGZ1bmN0aW9uICh4LCBpKSB7XG4gICAgICAgICAgICByZXR1cm4ge2luZGV4OiBpLCB2YWx1ZTogeH07XG4gICAgICAgIH0pO1xuICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgudmFsdWUsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgaWYgKCF2KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh4KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhfbWFwKHJlc3VsdHMuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBhLmluZGV4IC0gYi5pbmRleDtcbiAgICAgICAgICAgIH0pLCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB4LnZhbHVlO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIGFzeW5jLnJlamVjdCA9IGRvUGFyYWxsZWwoX3JlamVjdCk7XG4gICAgYXN5bmMucmVqZWN0U2VyaWVzID0gZG9TZXJpZXMoX3JlamVjdCk7XG5cbiAgICB2YXIgX2RldGVjdCA9IGZ1bmN0aW9uIChlYWNoZm4sIGFyciwgaXRlcmF0b3IsIG1haW5fY2FsbGJhY2spIHtcbiAgICAgICAgZWFjaGZuKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrKHgpO1xuICAgICAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBtYWluX2NhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgYXN5bmMuZGV0ZWN0ID0gZG9QYXJhbGxlbChfZGV0ZWN0KTtcbiAgICBhc3luYy5kZXRlY3RTZXJpZXMgPSBkb1NlcmllcyhfZGV0ZWN0KTtcblxuICAgIGFzeW5jLnNvbWUgPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgbWFpbl9jYWxsYmFjaykge1xuICAgICAgICBhc3luYy5lYWNoKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBtYWluX2NhbGxiYWNrKGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvLyBhbnkgYWxpYXNcbiAgICBhc3luYy5hbnkgPSBhc3luYy5zb21lO1xuXG4gICAgYXN5bmMuZXZlcnkgPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgbWFpbl9jYWxsYmFjaykge1xuICAgICAgICBhc3luYy5lYWNoKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgIGlmICghdikge1xuICAgICAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrKGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIG1haW5fY2FsbGJhY2sodHJ1ZSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLy8gYWxsIGFsaWFzXG4gICAgYXN5bmMuYWxsID0gYXN5bmMuZXZlcnk7XG5cbiAgICBhc3luYy5zb3J0QnkgPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgYXN5bmMubWFwKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbiAoZXJyLCBjcml0ZXJpYSkge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHt2YWx1ZTogeCwgY3JpdGVyaWE6IGNyaXRlcmlhfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBmbiA9IGZ1bmN0aW9uIChsZWZ0LCByaWdodCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWEsIGIgPSByaWdodC5jcml0ZXJpYTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGEgPCBiID8gLTEgOiBhID4gYiA/IDEgOiAwO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgX21hcChyZXN1bHRzLnNvcnQoZm4pLCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geC52YWx1ZTtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhc3luYy5hdXRvID0gZnVuY3Rpb24gKHRhc2tzLCBjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICB2YXIga2V5cyA9IF9rZXlzKHRhc2tzKTtcbiAgICAgICAgaWYgKCFrZXlzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdHMgPSB7fTtcblxuICAgICAgICB2YXIgbGlzdGVuZXJzID0gW107XG4gICAgICAgIHZhciBhZGRMaXN0ZW5lciA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgbGlzdGVuZXJzLnVuc2hpZnQoZm4pO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgcmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdGVuZXJzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVyc1tpXSA9PT0gZm4pIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHRhc2tDb21wbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIF9lYWNoKGxpc3RlbmVycy5zbGljZSgwKSwgZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGFkZExpc3RlbmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChfa2V5cyhyZXN1bHRzKS5sZW5ndGggPT09IGtleXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgX2VhY2goa2V5cywgZnVuY3Rpb24gKGspIHtcbiAgICAgICAgICAgIHZhciB0YXNrID0gKHRhc2tzW2tdIGluc3RhbmNlb2YgRnVuY3Rpb24pID8gW3Rhc2tzW2tdXTogdGFza3Nba107XG4gICAgICAgICAgICB2YXIgdGFza0NhbGxiYWNrID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc2FmZVJlc3VsdHMgPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgX2VhY2goX2tleXMocmVzdWx0cyksIGZ1bmN0aW9uKHJrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhZmVSZXN1bHRzW3JrZXldID0gcmVzdWx0c1tya2V5XTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNhZmVSZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyLCBzYWZlUmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHN0b3Agc3Vic2VxdWVudCBlcnJvcnMgaGl0dGluZyBjYWxsYmFjayBtdWx0aXBsZSB0aW1lc1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSh0YXNrQ29tcGxldGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB2YXIgcmVxdWlyZXMgPSB0YXNrLnNsaWNlKDAsIE1hdGguYWJzKHRhc2subGVuZ3RoIC0gMSkpIHx8IFtdO1xuICAgICAgICAgICAgdmFyIHJlYWR5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBfcmVkdWNlKHJlcXVpcmVzLCBmdW5jdGlvbiAoYSwgeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKGEgJiYgcmVzdWx0cy5oYXNPd25Qcm9wZXJ0eSh4KSk7XG4gICAgICAgICAgICAgICAgfSwgdHJ1ZSkgJiYgIXJlc3VsdHMuaGFzT3duUHJvcGVydHkoayk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKHJlYWR5KCkpIHtcbiAgICAgICAgICAgICAgICB0YXNrW3Rhc2subGVuZ3RoIC0gMV0odGFza0NhbGxiYWNrLCByZXN1bHRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBsaXN0ZW5lciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlYWR5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZUxpc3RlbmVyKGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhc2tbdGFzay5sZW5ndGggLSAxXSh0YXNrQ2FsbGJhY2ssIHJlc3VsdHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBhZGRMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhc3luYy53YXRlcmZhbGwgPSBmdW5jdGlvbiAodGFza3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmICh0YXNrcy5jb25zdHJ1Y3RvciAhPT0gQXJyYXkpIHtcbiAgICAgICAgICB2YXIgZXJyID0gbmV3IEVycm9yKCdGaXJzdCBhcmd1bWVudCB0byB3YXRlcmZhbGwgbXVzdCBiZSBhbiBhcnJheSBvZiBmdW5jdGlvbnMnKTtcbiAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHdyYXBJdGVyYXRvciA9IGZ1bmN0aW9uIChpdGVyYXRvcikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gaXRlcmF0b3IubmV4dCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJncy5wdXNoKHdyYXBJdGVyYXRvcihuZXh0KSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzLnB1c2goY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICAgICAgd3JhcEl0ZXJhdG9yKGFzeW5jLml0ZXJhdG9yKHRhc2tzKSkoKTtcbiAgICB9O1xuXG4gICAgdmFyIF9wYXJhbGxlbCA9IGZ1bmN0aW9uKGVhY2hmbiwgdGFza3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmICh0YXNrcy5jb25zdHJ1Y3RvciA9PT0gQXJyYXkpIHtcbiAgICAgICAgICAgIGVhY2hmbi5tYXAodGFza3MsIGZ1bmN0aW9uIChmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBpZiAoZm4pIHtcbiAgICAgICAgICAgICAgICAgICAgZm4oZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwobnVsbCwgZXJyLCBhcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJlc3VsdHMgPSB7fTtcbiAgICAgICAgICAgIGVhY2hmbi5lYWNoKF9rZXlzKHRhc2tzKSwgZnVuY3Rpb24gKGssIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgdGFza3Nba10oZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgYXN5bmMucGFyYWxsZWwgPSBmdW5jdGlvbiAodGFza3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIF9wYXJhbGxlbCh7IG1hcDogYXN5bmMubWFwLCBlYWNoOiBhc3luYy5lYWNoIH0sIHRhc2tzLCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIGFzeW5jLnBhcmFsbGVsTGltaXQgPSBmdW5jdGlvbih0YXNrcywgbGltaXQsIGNhbGxiYWNrKSB7XG4gICAgICAgIF9wYXJhbGxlbCh7IG1hcDogX21hcExpbWl0KGxpbWl0KSwgZWFjaDogX2VhY2hMaW1pdChsaW1pdCkgfSwgdGFza3MsIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgYXN5bmMuc2VyaWVzID0gZnVuY3Rpb24gKHRhc2tzLCBjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICBpZiAodGFza3MuY29uc3RydWN0b3IgPT09IEFycmF5KSB7XG4gICAgICAgICAgICBhc3luYy5tYXBTZXJpZXModGFza3MsIGZ1bmN0aW9uIChmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBpZiAoZm4pIHtcbiAgICAgICAgICAgICAgICAgICAgZm4oZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwobnVsbCwgZXJyLCBhcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJlc3VsdHMgPSB7fTtcbiAgICAgICAgICAgIGFzeW5jLmVhY2hTZXJpZXMoX2tleXModGFza3MpLCBmdW5jdGlvbiAoaywgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICB0YXNrc1trXShmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHNba10gPSBhcmdzO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBhc3luYy5pdGVyYXRvciA9IGZ1bmN0aW9uICh0YXNrcykge1xuICAgICAgICB2YXIgbWFrZUNhbGxiYWNrID0gZnVuY3Rpb24gKGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgZm4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0YXNrc1tpbmRleF0uYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZuLm5leHQoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBmbi5uZXh0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAoaW5kZXggPCB0YXNrcy5sZW5ndGggLSAxKSA/IG1ha2VDYWxsYmFjayhpbmRleCArIDEpOiBudWxsO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBmbjtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIG1ha2VDYWxsYmFjaygwKTtcbiAgICB9O1xuXG4gICAgYXN5bmMuYXBwbHkgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGZuLmFwcGx5KFxuICAgICAgICAgICAgICAgIG51bGwsIGFyZ3MuY29uY2F0KEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykpXG4gICAgICAgICAgICApO1xuICAgICAgICB9O1xuICAgIH07XG5cbiAgICB2YXIgX2NvbmNhdCA9IGZ1bmN0aW9uIChlYWNoZm4sIGFyciwgZm4sIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciByID0gW107XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uICh4LCBjYikge1xuICAgICAgICAgICAgZm4oeCwgZnVuY3Rpb24gKGVyciwgeSkge1xuICAgICAgICAgICAgICAgIHIgPSByLmNvbmNhdCh5IHx8IFtdKTtcbiAgICAgICAgICAgICAgICBjYihlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcik7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgYXN5bmMuY29uY2F0ID0gZG9QYXJhbGxlbChfY29uY2F0KTtcbiAgICBhc3luYy5jb25jYXRTZXJpZXMgPSBkb1NlcmllcyhfY29uY2F0KTtcblxuICAgIGFzeW5jLndoaWxzdCA9IGZ1bmN0aW9uICh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHRlc3QoKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFzeW5jLndoaWxzdCh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGFzeW5jLmRvV2hpbHN0ID0gZnVuY3Rpb24gKGl0ZXJhdG9yLCB0ZXN0LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGVzdCgpKSB7XG4gICAgICAgICAgICAgICAgYXN5bmMuZG9XaGlsc3QoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhc3luYy51bnRpbCA9IGZ1bmN0aW9uICh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKCF0ZXN0KCkpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhc3luYy51bnRpbCh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGFzeW5jLmRvVW50aWwgPSBmdW5jdGlvbiAoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKSB7XG4gICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGVzdCgpKSB7XG4gICAgICAgICAgICAgICAgYXN5bmMuZG9VbnRpbChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGFzeW5jLnF1ZXVlID0gZnVuY3Rpb24gKHdvcmtlciwgY29uY3VycmVuY3kpIHtcbiAgICAgICAgaWYgKGNvbmN1cnJlbmN5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbmN1cnJlbmN5ID0gMTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBfaW5zZXJ0KHEsIGRhdGEsIHBvcywgY2FsbGJhY2spIHtcbiAgICAgICAgICBpZihkYXRhLmNvbnN0cnVjdG9yICE9PSBBcnJheSkge1xuICAgICAgICAgICAgICBkYXRhID0gW2RhdGFdO1xuICAgICAgICAgIH1cbiAgICAgICAgICBfZWFjaChkYXRhLCBmdW5jdGlvbih0YXNrKSB7XG4gICAgICAgICAgICAgIHZhciBpdGVtID0ge1xuICAgICAgICAgICAgICAgICAgZGF0YTogdGFzayxcbiAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IG51bGxcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBpZiAocG9zKSB7XG4gICAgICAgICAgICAgICAgcS50YXNrcy51bnNoaWZ0KGl0ZW0pO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHEudGFza3MucHVzaChpdGVtKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChxLnNhdHVyYXRlZCAmJiBxLnRhc2tzLmxlbmd0aCA9PT0gY29uY3VycmVuY3kpIHtcbiAgICAgICAgICAgICAgICAgIHEuc2F0dXJhdGVkKCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlKHEucHJvY2Vzcyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgd29ya2VycyA9IDA7XG4gICAgICAgIHZhciBxID0ge1xuICAgICAgICAgICAgdGFza3M6IFtdLFxuICAgICAgICAgICAgY29uY3VycmVuY3k6IGNvbmN1cnJlbmN5LFxuICAgICAgICAgICAgc2F0dXJhdGVkOiBudWxsLFxuICAgICAgICAgICAgZW1wdHk6IG51bGwsXG4gICAgICAgICAgICBkcmFpbjogbnVsbCxcbiAgICAgICAgICAgIHB1c2g6IGZ1bmN0aW9uIChkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICBfaW5zZXJ0KHEsIGRhdGEsIGZhbHNlLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdW5zaGlmdDogZnVuY3Rpb24gKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIF9pbnNlcnQocSwgZGF0YSwgdHJ1ZSwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2Nlc3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAod29ya2VycyA8IHEuY29uY3VycmVuY3kgJiYgcS50YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhc2sgPSBxLnRhc2tzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChxLmVtcHR5ICYmIHEudGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxLmVtcHR5KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgd29ya2VycyArPSAxO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdvcmtlcnMgLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0YXNrLmNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFzay5jYWxsYmFjay5hcHBseSh0YXNrLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHEuZHJhaW4gJiYgcS50YXNrcy5sZW5ndGggKyB3b3JrZXJzID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcS5kcmFpbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcS5wcm9jZXNzKCk7XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIHZhciBjYiA9IG9ubHlfb25jZShuZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgd29ya2VyKHRhc2suZGF0YSwgY2IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsZW5ndGg6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcS50YXNrcy5sZW5ndGg7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcnVubmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB3b3JrZXJzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gcTtcbiAgICB9O1xuXG4gICAgYXN5bmMuY2FyZ28gPSBmdW5jdGlvbiAod29ya2VyLCBwYXlsb2FkKSB7XG4gICAgICAgIHZhciB3b3JraW5nICAgICA9IGZhbHNlLFxuICAgICAgICAgICAgdGFza3MgICAgICAgPSBbXTtcblxuICAgICAgICB2YXIgY2FyZ28gPSB7XG4gICAgICAgICAgICB0YXNrczogdGFza3MsXG4gICAgICAgICAgICBwYXlsb2FkOiBwYXlsb2FkLFxuICAgICAgICAgICAgc2F0dXJhdGVkOiBudWxsLFxuICAgICAgICAgICAgZW1wdHk6IG51bGwsXG4gICAgICAgICAgICBkcmFpbjogbnVsbCxcbiAgICAgICAgICAgIHB1c2g6IGZ1bmN0aW9uIChkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGlmKGRhdGEuY29uc3RydWN0b3IgIT09IEFycmF5KSB7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEgPSBbZGF0YV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgdGFza3MucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB0YXNrLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogbnVsbFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhcmdvLnNhdHVyYXRlZCAmJiB0YXNrcy5sZW5ndGggPT09IHBheWxvYWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcmdvLnNhdHVyYXRlZCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlKGNhcmdvLnByb2Nlc3MpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2Nlc3M6IGZ1bmN0aW9uIHByb2Nlc3MoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHdvcmtpbmcpIHJldHVybjtcbiAgICAgICAgICAgICAgICBpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKGNhcmdvLmRyYWluKSBjYXJnby5kcmFpbigpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIHRzID0gdHlwZW9mIHBheWxvYWQgPT09ICdudW1iZXInXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPyB0YXNrcy5zcGxpY2UoMCwgcGF5bG9hZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IHRhc2tzLnNwbGljZSgwKTtcblxuICAgICAgICAgICAgICAgIHZhciBkcyA9IF9tYXAodHMsIGZ1bmN0aW9uICh0YXNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0YXNrLmRhdGE7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBpZihjYXJnby5lbXB0eSkgY2FyZ28uZW1wdHkoKTtcbiAgICAgICAgICAgICAgICB3b3JraW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB3b3JrZXIoZHMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgd29ya2luZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgICAgICAgICBfZWFjaCh0cywgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YS5jYWxsYmFjay5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgcHJvY2VzcygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxlbmd0aDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0YXNrcy5sZW5ndGg7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcnVubmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB3b3JraW5nO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gY2FyZ287XG4gICAgfTtcblxuICAgIHZhciBfY29uc29sZV9mbiA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgIGZuLmFwcGx5KG51bGwsIGFyZ3MuY29uY2F0KFtmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnNvbGUuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoY29uc29sZVtuYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgX2VhY2goYXJncywgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlW25hbWVdKHgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XSkpO1xuICAgICAgICB9O1xuICAgIH07XG4gICAgYXN5bmMubG9nID0gX2NvbnNvbGVfZm4oJ2xvZycpO1xuICAgIGFzeW5jLmRpciA9IF9jb25zb2xlX2ZuKCdkaXInKTtcbiAgICAvKmFzeW5jLmluZm8gPSBfY29uc29sZV9mbignaW5mbycpO1xuICAgIGFzeW5jLndhcm4gPSBfY29uc29sZV9mbignd2FybicpO1xuICAgIGFzeW5jLmVycm9yID0gX2NvbnNvbGVfZm4oJ2Vycm9yJyk7Ki9cblxuICAgIGFzeW5jLm1lbW9pemUgPSBmdW5jdGlvbiAoZm4sIGhhc2hlcikge1xuICAgICAgICB2YXIgbWVtbyA9IHt9O1xuICAgICAgICB2YXIgcXVldWVzID0ge307XG4gICAgICAgIGhhc2hlciA9IGhhc2hlciB8fCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBtZW1vaXplZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgICAgICAgICB2YXIga2V5ID0gaGFzaGVyLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgICAgICAgaWYgKGtleSBpbiBtZW1vKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkobnVsbCwgbWVtb1trZXldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGtleSBpbiBxdWV1ZXMpIHtcbiAgICAgICAgICAgICAgICBxdWV1ZXNba2V5XS5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHF1ZXVlc1trZXldID0gW2NhbGxiYWNrXTtcbiAgICAgICAgICAgICAgICBmbi5hcHBseShudWxsLCBhcmdzLmNvbmNhdChbZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBtZW1vW2tleV0gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICAgICAgICAgIHZhciBxID0gcXVldWVzW2tleV07XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBxdWV1ZXNba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBxLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgIHFbaV0uYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1dKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIG1lbW9pemVkLm1lbW8gPSBtZW1vO1xuICAgICAgICBtZW1vaXplZC51bm1lbW9pemVkID0gZm47XG4gICAgICAgIHJldHVybiBtZW1vaXplZDtcbiAgICB9O1xuXG4gICAgYXN5bmMudW5tZW1vaXplID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gKGZuLnVubWVtb2l6ZWQgfHwgZm4pLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH07XG5cbiAgICBhc3luYy50aW1lcyA9IGZ1bmN0aW9uIChjb3VudCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBjb3VudGVyID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICAgICAgY291bnRlci5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhc3luYy5tYXAoY291bnRlciwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgYXN5bmMudGltZXNTZXJpZXMgPSBmdW5jdGlvbiAoY291bnQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgY291bnRlciA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICAgICAgICAgIGNvdW50ZXIucHVzaChpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXN5bmMubWFwU2VyaWVzKGNvdW50ZXIsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIGFzeW5jLmNvbXBvc2UgPSBmdW5jdGlvbiAoLyogZnVuY3Rpb25zLi4uICovKSB7XG4gICAgICAgIHZhciBmbnMgPSBBcnJheS5wcm90b3R5cGUucmV2ZXJzZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmdzLnBvcCgpO1xuICAgICAgICAgICAgYXN5bmMucmVkdWNlKGZucywgYXJncywgZnVuY3Rpb24gKG5ld2FyZ3MsIGZuLCBjYikge1xuICAgICAgICAgICAgICAgIGZuLmFwcGx5KHRoYXQsIG5ld2FyZ3MuY29uY2F0KFtmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBlcnIgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICAgICAgICAgIHZhciBuZXh0YXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIGNiKGVyciwgbmV4dGFyZ3MpO1xuICAgICAgICAgICAgICAgIH1dKSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkodGhhdCwgW2Vycl0uY29uY2F0KHJlc3VsdHMpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgIH07XG5cbiAgICB2YXIgX2FwcGx5RWFjaCA9IGZ1bmN0aW9uIChlYWNoZm4sIGZucyAvKmFyZ3MuLi4qLykge1xuICAgICAgICB2YXIgZ28gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmdzLnBvcCgpO1xuICAgICAgICAgICAgcmV0dXJuIGVhY2hmbihmbnMsIGZ1bmN0aW9uIChmbiwgY2IpIHtcbiAgICAgICAgICAgICAgICBmbi5hcHBseSh0aGF0LCBhcmdzLmNvbmNhdChbY2JdKSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2FsbGJhY2spO1xuICAgICAgICB9O1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICAgICAgICAgIHJldHVybiBnby5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBnbztcbiAgICAgICAgfVxuICAgIH07XG4gICAgYXN5bmMuYXBwbHlFYWNoID0gZG9QYXJhbGxlbChfYXBwbHlFYWNoKTtcbiAgICBhc3luYy5hcHBseUVhY2hTZXJpZXMgPSBkb1NlcmllcyhfYXBwbHlFYWNoKTtcblxuICAgIGFzeW5jLmZvcmV2ZXIgPSBmdW5jdGlvbiAoZm4sIGNhbGxiYWNrKSB7XG4gICAgICAgIGZ1bmN0aW9uIG5leHQoZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmbihuZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBuZXh0KCk7XG4gICAgfTtcblxuICAgIC8vIEFNRCAvIFJlcXVpcmVKU1xuICAgIGlmICh0eXBlb2YgZGVmaW5lICE9PSAndW5kZWZpbmVkJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIGRlZmluZShbXSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGFzeW5jO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLy8gTm9kZS5qc1xuICAgIGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gYXN5bmM7XG4gICAgfVxuICAgIC8vIGluY2x1ZGVkIGRpcmVjdGx5IHZpYSA8c2NyaXB0PiB0YWdcbiAgICBlbHNlIHtcbiAgICAgICAgcm9vdC5hc3luYyA9IGFzeW5jO1xuICAgIH1cblxufSgpKTtcbiIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuIyMgY29nL2RlZmF1bHRzXG5cbmBgYGpzXG52YXIgZGVmYXVsdHMgPSByZXF1aXJlKCdjb2cvZGVmYXVsdHMnKTtcbmBgYFxuXG4jIyMgZGVmYXVsdHModGFyZ2V0LCAqKVxuXG5TaGFsbG93IGNvcHkgb2JqZWN0IHByb3BlcnRpZXMgZnJvbSB0aGUgc3VwcGxpZWQgc291cmNlIG9iamVjdHMgKCopIGludG9cbnRoZSB0YXJnZXQgb2JqZWN0LCByZXR1cm5pbmcgdGhlIHRhcmdldCBvYmplY3Qgb25jZSBjb21wbGV0ZWQuICBEbyBub3QsXG5ob3dldmVyLCBvdmVyd3JpdGUgZXhpc3Rpbmcga2V5cyB3aXRoIG5ldyB2YWx1ZXM6XG5cbmBgYGpzXG5kZWZhdWx0cyh7IGE6IDEsIGI6IDIgfSwgeyBjOiAzIH0sIHsgZDogNCB9LCB7IGI6IDUgfSkpO1xuYGBgXG5cblNlZSBhbiBleGFtcGxlIG9uIFtyZXF1aXJlYmluXShodHRwOi8vcmVxdWlyZWJpbi5jb20vP2dpc3Q9NjA3OTQ3NSkuXG4qKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odGFyZ2V0KSB7XG4gIC8vIGVuc3VyZSB3ZSBoYXZlIGEgdGFyZ2V0XG4gIHRhcmdldCA9IHRhcmdldCB8fCB7fTtcblxuICAvLyBpdGVyYXRlIHRocm91Z2ggdGhlIHNvdXJjZXMgYW5kIGNvcHkgdG8gdGhlIHRhcmdldFxuICBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkuZm9yRWFjaChmdW5jdGlvbihzb3VyY2UpIHtcbiAgICBpZiAoISBzb3VyY2UpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBwcm9wIGluIHNvdXJjZSkge1xuICAgICAgaWYgKHRhcmdldFtwcm9wXSA9PT0gdm9pZCAwKSB7XG4gICAgICAgIHRhcmdldFtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiB0YXJnZXQ7XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuIyMgY29nL2V4dGVuZFxuXG5gYGBqc1xudmFyIGV4dGVuZCA9IHJlcXVpcmUoJ2NvZy9leHRlbmQnKTtcbmBgYFxuXG4jIyMgZXh0ZW5kKHRhcmdldCwgKilcblxuU2hhbGxvdyBjb3B5IG9iamVjdCBwcm9wZXJ0aWVzIGZyb20gdGhlIHN1cHBsaWVkIHNvdXJjZSBvYmplY3RzICgqKSBpbnRvXG50aGUgdGFyZ2V0IG9iamVjdCwgcmV0dXJuaW5nIHRoZSB0YXJnZXQgb2JqZWN0IG9uY2UgY29tcGxldGVkOlxuXG5gYGBqc1xuZXh0ZW5kKHsgYTogMSwgYjogMiB9LCB7IGM6IDMgfSwgeyBkOiA0IH0sIHsgYjogNSB9KSk7XG5gYGBcblxuU2VlIGFuIGV4YW1wbGUgb24gW3JlcXVpcmViaW5dKGh0dHA6Ly9yZXF1aXJlYmluLmNvbS8/Z2lzdD02MDc5NDc1KS5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih0YXJnZXQpIHtcbiAgW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLmZvckVhY2goZnVuY3Rpb24oc291cmNlKSB7XG4gICAgaWYgKCEgc291cmNlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgIHRhcmdldFtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiB0YXJnZXQ7XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICAjIyBjb2cvbG9nZ2VyXG5cbiAgYGBganNcbiAgdmFyIGxvZ2dlciA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKTtcbiAgYGBgXG5cbiAgU2ltcGxlIGJyb3dzZXIgbG9nZ2luZyBvZmZlcmluZyBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkgdG8gdGhlXG4gIFtkZWJ1Z10oaHR0cHM6Ly9naXRodWIuY29tL3Zpc2lvbm1lZGlhL2RlYnVnKSBtb2R1bGUuXG5cbiAgIyMjIFVzYWdlXG5cbiAgQ3JlYXRlIHlvdXIgc2VsZiBhIG5ldyBsb2dnaW5nIGluc3RhbmNlIGFuZCBnaXZlIGl0IGEgbmFtZTpcblxuICBgYGBqc1xuICB2YXIgZGVidWcgPSBsb2dnZXIoJ3BoaWwnKTtcbiAgYGBgXG5cbiAgTm93IGRvIHNvbWUgZGVidWdnaW5nOlxuXG4gIGBgYGpzXG4gIGRlYnVnKCdoZWxsbycpO1xuICBgYGBcblxuICBBdCB0aGlzIHN0YWdlLCBubyBsb2cgb3V0cHV0IHdpbGwgYmUgZ2VuZXJhdGVkIGJlY2F1c2UgeW91ciBsb2dnZXIgaXNcbiAgY3VycmVudGx5IGRpc2FibGVkLiAgRW5hYmxlIGl0OlxuXG4gIGBgYGpzXG4gIGxvZ2dlci5lbmFibGUoJ3BoaWwnKTtcbiAgYGBgXG5cbiAgTm93IGRvIHNvbWUgbW9yZSBsb2dnZXI6XG5cbiAgYGBganNcbiAgZGVidWcoJ09oIHRoaXMgaXMgc28gbXVjaCBuaWNlciA6KScpO1xuICAvLyAtLT4gcGhpbDogT2ggdGhpcyBpcyBzb21lIG11Y2ggbmljZXIgOilcbiAgYGBgXG5cbiAgIyMjIFJlZmVyZW5jZVxuKiovXG5cbnZhciBhY3RpdmUgPSBbXTtcbnZhciB1bmxlYXNoTGlzdGVuZXJzID0gW107XG52YXIgdGFyZ2V0cyA9IFsgY29uc29sZSBdO1xuXG4vKipcbiAgIyMjIyBsb2dnZXIobmFtZSlcblxuICBDcmVhdGUgYSBuZXcgbG9nZ2luZyBpbnN0YW5jZS5cbioqL1xudmFyIGxvZ2dlciA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24obmFtZSkge1xuICAvLyBpbml0aWFsIGVuYWJsZWQgY2hlY2tcbiAgdmFyIGVuYWJsZWQgPSBjaGVja0FjdGl2ZSgpO1xuXG4gIGZ1bmN0aW9uIGNoZWNrQWN0aXZlKCkge1xuICAgIHJldHVybiBlbmFibGVkID0gYWN0aXZlLmluZGV4T2YoJyonKSA+PSAwIHx8IGFjdGl2ZS5pbmRleE9mKG5hbWUpID49IDA7XG4gIH1cblxuICAvLyByZWdpc3RlciB0aGUgY2hlY2sgYWN0aXZlIHdpdGggdGhlIGxpc3RlbmVycyBhcnJheVxuICB1bmxlYXNoTGlzdGVuZXJzW3VubGVhc2hMaXN0ZW5lcnMubGVuZ3RoXSA9IGNoZWNrQWN0aXZlO1xuXG4gIC8vIHJldHVybiB0aGUgYWN0dWFsIGxvZ2dpbmcgZnVuY3Rpb25cbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG4gICAgLy8gaWYgd2UgaGF2ZSBhIHN0cmluZyBtZXNzYWdlXG4gICAgaWYgKHR5cGVvZiBhcmdzWzBdID09ICdzdHJpbmcnIHx8IChhcmdzWzBdIGluc3RhbmNlb2YgU3RyaW5nKSkge1xuICAgICAgYXJnc1swXSA9IG5hbWUgKyAnOiAnICsgYXJnc1swXTtcbiAgICB9XG5cbiAgICAvLyBpZiBub3QgZW5hYmxlZCwgYmFpbFxuICAgIGlmICghIGVuYWJsZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBsb2dcbiAgICB0YXJnZXRzLmZvckVhY2goZnVuY3Rpb24odGFyZ2V0KSB7XG4gICAgICB0YXJnZXQubG9nLmFwcGx5KHRhcmdldCwgYXJncyk7XG4gICAgfSk7XG4gIH07XG59O1xuXG4vKipcbiAgIyMjIyBsb2dnZXIucmVzZXQoKVxuXG4gIFJlc2V0IGxvZ2dpbmcgKHJlbW92ZSB0aGUgZGVmYXVsdCBjb25zb2xlIGxvZ2dlciwgZmxhZyBhbGwgbG9nZ2VycyBhc1xuICBpbmFjdGl2ZSwgZXRjLCBldGMuXG4qKi9cbmxvZ2dlci5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAvLyByZXNldCB0YXJnZXRzIGFuZCBhY3RpdmUgc3RhdGVzXG4gIHRhcmdldHMgPSBbXTtcbiAgYWN0aXZlID0gW107XG5cbiAgcmV0dXJuIGxvZ2dlci5lbmFibGUoKTtcbn07XG5cbi8qKlxuICAjIyMjIGxvZ2dlci50byh0YXJnZXQpXG5cbiAgQWRkIGEgbG9nZ2luZyB0YXJnZXQuICBUaGUgbG9nZ2VyIG11c3QgaGF2ZSBhIGBsb2dgIG1ldGhvZCBhdHRhY2hlZC5cblxuKiovXG5sb2dnZXIudG8gPSBmdW5jdGlvbih0YXJnZXQpIHtcbiAgdGFyZ2V0cyA9IHRhcmdldHMuY29uY2F0KHRhcmdldCB8fCBbXSk7XG5cbiAgcmV0dXJuIGxvZ2dlcjtcbn07XG5cbi8qKlxuICAjIyMjIGxvZ2dlci5lbmFibGUobmFtZXMqKVxuXG4gIEVuYWJsZSBsb2dnaW5nIHZpYSB0aGUgbmFtZWQgbG9nZ2luZyBpbnN0YW5jZXMuICBUbyBlbmFibGUgbG9nZ2luZyB2aWEgYWxsXG4gIGluc3RhbmNlcywgeW91IGNhbiBwYXNzIGEgd2lsZGNhcmQ6XG5cbiAgYGBganNcbiAgbG9nZ2VyLmVuYWJsZSgnKicpO1xuICBgYGBcblxuICBfX1RPRE86X18gd2lsZGNhcmQgZW5hYmxlcnNcbioqL1xubG9nZ2VyLmVuYWJsZSA9IGZ1bmN0aW9uKCkge1xuICAvLyB1cGRhdGUgdGhlIGFjdGl2ZVxuICBhY3RpdmUgPSBhY3RpdmUuY29uY2F0KFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG5cbiAgLy8gdHJpZ2dlciB0aGUgdW5sZWFzaCBsaXN0ZW5lcnNcbiAgdW5sZWFzaExpc3RlbmVycy5mb3JFYWNoKGZ1bmN0aW9uKGxpc3RlbmVyKSB7XG4gICAgbGlzdGVuZXIoKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGxvZ2dlcjtcbn07IiwiLy8gQ29weXJpZ2h0IChjKSAyMDEzIEFkb2JlIFN5c3RlbXMgSW5jb3Jwb3JhdGVkLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuLy8gXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vLyBcbi8vIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy8gXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLy8g4pSM4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSQIFxcXFxcbi8vIOKUgiBFdmUgMC40LjIgLSBKYXZhU2NyaXB0IEV2ZW50cyBMaWJyYXJ5ICAgICAgICAgICAgICAgICAgICAgIOKUgiBcXFxcXG4vLyDilJzilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilKQgXFxcXFxuLy8g4pSCIEF1dGhvciBEbWl0cnkgQmFyYW5vdnNraXkgKGh0dHA6Ly9kbWl0cnkuYmFyYW5vdnNraXkuY29tLykg4pSCIFxcXFxcbi8vIOKUlOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUmCBcXFxcXG5cbihmdW5jdGlvbiAoZ2xvYikge1xuICAgIHZhciB2ZXJzaW9uID0gXCIwLjQuMlwiLFxuICAgICAgICBoYXMgPSBcImhhc093blByb3BlcnR5XCIsXG4gICAgICAgIHNlcGFyYXRvciA9IC9bXFwuXFwvXS8sXG4gICAgICAgIHdpbGRjYXJkID0gXCIqXCIsXG4gICAgICAgIGZ1biA9IGZ1bmN0aW9uICgpIHt9LFxuICAgICAgICBudW1zb3J0ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBhIC0gYjtcbiAgICAgICAgfSxcbiAgICAgICAgY3VycmVudF9ldmVudCxcbiAgICAgICAgc3RvcCxcbiAgICAgICAgZXZlbnRzID0ge246IHt9fSxcbiAgICAvKlxcXG4gICAgICogZXZlXG4gICAgIFsgbWV0aG9kIF1cblxuICAgICAqIEZpcmVzIGV2ZW50IHdpdGggZ2l2ZW4gYG5hbWVgLCBnaXZlbiBzY29wZSBhbmQgb3RoZXIgcGFyYW1ldGVycy5cblxuICAgICA+IEFyZ3VtZW50c1xuXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSAqZXZlbnQqLCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkXG4gICAgIC0gc2NvcGUgKG9iamVjdCkgY29udGV4dCBmb3IgdGhlIGV2ZW50IGhhbmRsZXJzXG4gICAgIC0gdmFyYXJncyAoLi4uKSB0aGUgcmVzdCBvZiBhcmd1bWVudHMgd2lsbCBiZSBzZW50IHRvIGV2ZW50IGhhbmRsZXJzXG5cbiAgICAgPSAob2JqZWN0KSBhcnJheSBvZiByZXR1cm5lZCB2YWx1ZXMgZnJvbSB0aGUgbGlzdGVuZXJzXG4gICAgXFwqL1xuICAgICAgICBldmUgPSBmdW5jdGlvbiAobmFtZSwgc2NvcGUpIHtcblx0XHRcdG5hbWUgPSBTdHJpbmcobmFtZSk7XG4gICAgICAgICAgICB2YXIgZSA9IGV2ZW50cyxcbiAgICAgICAgICAgICAgICBvbGRzdG9wID0gc3RvcCxcbiAgICAgICAgICAgICAgICBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKSxcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMgPSBldmUubGlzdGVuZXJzKG5hbWUpLFxuICAgICAgICAgICAgICAgIHogPSAwLFxuICAgICAgICAgICAgICAgIGYgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBsLFxuICAgICAgICAgICAgICAgIGluZGV4ZWQgPSBbXSxcbiAgICAgICAgICAgICAgICBxdWV1ZSA9IHt9LFxuICAgICAgICAgICAgICAgIG91dCA9IFtdLFxuICAgICAgICAgICAgICAgIGNlID0gY3VycmVudF9ldmVudCxcbiAgICAgICAgICAgICAgICBlcnJvcnMgPSBbXTtcbiAgICAgICAgICAgIGN1cnJlbnRfZXZlbnQgPSBuYW1lO1xuICAgICAgICAgICAgc3RvcCA9IDA7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaWkgPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgaWk7IGkrKykgaWYgKFwiekluZGV4XCIgaW4gbGlzdGVuZXJzW2ldKSB7XG4gICAgICAgICAgICAgICAgaW5kZXhlZC5wdXNoKGxpc3RlbmVyc1tpXS56SW5kZXgpO1xuICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lcnNbaV0uekluZGV4IDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBxdWV1ZVtsaXN0ZW5lcnNbaV0uekluZGV4XSA9IGxpc3RlbmVyc1tpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpbmRleGVkLnNvcnQobnVtc29ydCk7XG4gICAgICAgICAgICB3aGlsZSAoaW5kZXhlZFt6XSA8IDApIHtcbiAgICAgICAgICAgICAgICBsID0gcXVldWVbaW5kZXhlZFt6KytdXTtcbiAgICAgICAgICAgICAgICBvdXQucHVzaChsLmFwcGx5KHNjb3BlLCBhcmdzKSk7XG4gICAgICAgICAgICAgICAgaWYgKHN0b3ApIHtcbiAgICAgICAgICAgICAgICAgICAgc3RvcCA9IG9sZHN0b3A7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgICAgICBsID0gbGlzdGVuZXJzW2ldO1xuICAgICAgICAgICAgICAgIGlmIChcInpJbmRleFwiIGluIGwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGwuekluZGV4ID09IGluZGV4ZWRbel0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dC5wdXNoKGwuYXBwbHkoc2NvcGUsIGFyZ3MpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdG9wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeisrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGwgPSBxdWV1ZVtpbmRleGVkW3pdXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsICYmIG91dC5wdXNoKGwuYXBwbHkoc2NvcGUsIGFyZ3MpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RvcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IHdoaWxlIChsKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVldWVbbC56SW5kZXhdID0gbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG91dC5wdXNoKGwuYXBwbHkoc2NvcGUsIGFyZ3MpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0b3ApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RvcCA9IG9sZHN0b3A7XG4gICAgICAgICAgICBjdXJyZW50X2V2ZW50ID0gY2U7XG4gICAgICAgICAgICByZXR1cm4gb3V0Lmxlbmd0aCA/IG91dCA6IG51bGw7XG4gICAgICAgIH07XG5cdFx0Ly8gVW5kb2N1bWVudGVkLiBEZWJ1ZyBvbmx5LlxuXHRcdGV2ZS5fZXZlbnRzID0gZXZlbnRzO1xuICAgIC8qXFxcbiAgICAgKiBldmUubGlzdGVuZXJzXG4gICAgIFsgbWV0aG9kIF1cblxuICAgICAqIEludGVybmFsIG1ldGhvZCB3aGljaCBnaXZlcyB5b3UgYXJyYXkgb2YgYWxsIGV2ZW50IGhhbmRsZXJzIHRoYXQgd2lsbCBiZSB0cmlnZ2VyZWQgYnkgdGhlIGdpdmVuIGBuYW1lYC5cblxuICAgICA+IEFyZ3VtZW50c1xuXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZFxuXG4gICAgID0gKGFycmF5KSBhcnJheSBvZiBldmVudCBoYW5kbGVyc1xuICAgIFxcKi9cbiAgICBldmUubGlzdGVuZXJzID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgdmFyIG5hbWVzID0gbmFtZS5zcGxpdChzZXBhcmF0b3IpLFxuICAgICAgICAgICAgZSA9IGV2ZW50cyxcbiAgICAgICAgICAgIGl0ZW0sXG4gICAgICAgICAgICBpdGVtcyxcbiAgICAgICAgICAgIGssXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgaWksXG4gICAgICAgICAgICBqLFxuICAgICAgICAgICAgamosXG4gICAgICAgICAgICBuZXMsXG4gICAgICAgICAgICBlcyA9IFtlXSxcbiAgICAgICAgICAgIG91dCA9IFtdO1xuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IG5hbWVzLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIG5lcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChqID0gMCwgamogPSBlcy5sZW5ndGg7IGogPCBqajsgaisrKSB7XG4gICAgICAgICAgICAgICAgZSA9IGVzW2pdLm47XG4gICAgICAgICAgICAgICAgaXRlbXMgPSBbZVtuYW1lc1tpXV0sIGVbd2lsZGNhcmRdXTtcbiAgICAgICAgICAgICAgICBrID0gMjtcbiAgICAgICAgICAgICAgICB3aGlsZSAoay0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW0gPSBpdGVtc1trXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5lcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0ID0gb3V0LmNvbmNhdChpdGVtLmYgfHwgW10pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZXMgPSBuZXM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9O1xuICAgIFxuICAgIC8qXFxcbiAgICAgKiBldmUub25cbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIEJpbmRzIGdpdmVuIGV2ZW50IGhhbmRsZXIgd2l0aCBhIGdpdmVuIG5hbWUuIFlvdSBjYW4gdXNlIHdpbGRjYXJkcyDigJxgKmDigJ0gZm9yIHRoZSBuYW1lczpcbiAgICAgfCBldmUub24oXCIqLnVuZGVyLipcIiwgZik7XG4gICAgIHwgZXZlKFwibW91c2UudW5kZXIuZmxvb3JcIik7IC8vIHRyaWdnZXJzIGZcbiAgICAgKiBVc2UgQGV2ZSB0byB0cmlnZ2VyIHRoZSBsaXN0ZW5lci5cbiAgICAgKipcbiAgICAgPiBBcmd1bWVudHNcbiAgICAgKipcbiAgICAgLSBuYW1lIChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkLCB3aXRoIG9wdGlvbmFsIHdpbGRjYXJkc1xuICAgICAtIGYgKGZ1bmN0aW9uKSBldmVudCBoYW5kbGVyIGZ1bmN0aW9uXG4gICAgICoqXG4gICAgID0gKGZ1bmN0aW9uKSByZXR1cm5lZCBmdW5jdGlvbiBhY2NlcHRzIGEgc2luZ2xlIG51bWVyaWMgcGFyYW1ldGVyIHRoYXQgcmVwcmVzZW50cyB6LWluZGV4IG9mIHRoZSBoYW5kbGVyLiBJdCBpcyBhbiBvcHRpb25hbCBmZWF0dXJlIGFuZCBvbmx5IHVzZWQgd2hlbiB5b3UgbmVlZCB0byBlbnN1cmUgdGhhdCBzb21lIHN1YnNldCBvZiBoYW5kbGVycyB3aWxsIGJlIGludm9rZWQgaW4gYSBnaXZlbiBvcmRlciwgZGVzcGl0ZSBvZiB0aGUgb3JkZXIgb2YgYXNzaWdubWVudC4gXG4gICAgID4gRXhhbXBsZTpcbiAgICAgfCBldmUub24oXCJtb3VzZVwiLCBlYXRJdCkoMik7XG4gICAgIHwgZXZlLm9uKFwibW91c2VcIiwgc2NyZWFtKTtcbiAgICAgfCBldmUub24oXCJtb3VzZVwiLCBjYXRjaEl0KSgxKTtcbiAgICAgKiBUaGlzIHdpbGwgZW5zdXJlIHRoYXQgYGNhdGNoSXQoKWAgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgYmVmb3JlIGBlYXRJdCgpYC5cblx0ICpcbiAgICAgKiBJZiB5b3Ugd2FudCB0byBwdXQgeW91ciBoYW5kbGVyIGJlZm9yZSBub24taW5kZXhlZCBoYW5kbGVycywgc3BlY2lmeSBhIG5lZ2F0aXZlIHZhbHVlLlxuICAgICAqIE5vdGU6IEkgYXNzdW1lIG1vc3Qgb2YgdGhlIHRpbWUgeW91IGRvbuKAmXQgbmVlZCB0byB3b3JyeSBhYm91dCB6LWluZGV4LCBidXQgaXTigJlzIG5pY2UgdG8gaGF2ZSB0aGlzIGZlYXR1cmUg4oCcanVzdCBpbiBjYXNl4oCdLlxuICAgIFxcKi9cbiAgICBldmUub24gPSBmdW5jdGlvbiAobmFtZSwgZikge1xuXHRcdG5hbWUgPSBTdHJpbmcobmFtZSk7XG5cdFx0aWYgKHR5cGVvZiBmICE9IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHt9O1xuXHRcdH1cbiAgICAgICAgdmFyIG5hbWVzID0gbmFtZS5zcGxpdChzZXBhcmF0b3IpLFxuICAgICAgICAgICAgZSA9IGV2ZW50cztcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGlpID0gbmFtZXMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgZSA9IGUubjtcbiAgICAgICAgICAgIGUgPSBlLmhhc093blByb3BlcnR5KG5hbWVzW2ldKSAmJiBlW25hbWVzW2ldXSB8fCAoZVtuYW1lc1tpXV0gPSB7bjoge319KTtcbiAgICAgICAgfVxuICAgICAgICBlLmYgPSBlLmYgfHwgW107XG4gICAgICAgIGZvciAoaSA9IDAsIGlpID0gZS5mLmxlbmd0aDsgaSA8IGlpOyBpKyspIGlmIChlLmZbaV0gPT0gZikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bjtcbiAgICAgICAgfVxuICAgICAgICBlLmYucHVzaChmKTtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICh6SW5kZXgpIHtcbiAgICAgICAgICAgIGlmICgrekluZGV4ID09ICt6SW5kZXgpIHtcbiAgICAgICAgICAgICAgICBmLnpJbmRleCA9ICt6SW5kZXg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLmZcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIFJldHVybnMgZnVuY3Rpb24gdGhhdCB3aWxsIGZpcmUgZ2l2ZW4gZXZlbnQgd2l0aCBvcHRpb25hbCBhcmd1bWVudHMuXG5cdCAqIEFyZ3VtZW50cyB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIHRoZSByZXN1bHQgZnVuY3Rpb24gd2lsbCBiZSBhbHNvXG5cdCAqIGNvbmNhdGVkIHRvIHRoZSBsaXN0IG9mIGZpbmFsIGFyZ3VtZW50cy5cbiBcdCB8IGVsLm9uY2xpY2sgPSBldmUuZihcImNsaWNrXCIsIDEsIDIpO1xuIFx0IHwgZXZlLm9uKFwiY2xpY2tcIiwgZnVuY3Rpb24gKGEsIGIsIGMpIHtcbiBcdCB8ICAgICBjb25zb2xlLmxvZyhhLCBiLCBjKTsgLy8gMSwgMiwgW2V2ZW50IG9iamVjdF1cbiBcdCB8IH0pO1xuICAgICA+IEFyZ3VtZW50c1xuXHQgLSBldmVudCAoc3RyaW5nKSBldmVudCBuYW1lXG5cdCAtIHZhcmFyZ3MgKOKApikgYW5kIGFueSBvdGhlciBhcmd1bWVudHNcblx0ID0gKGZ1bmN0aW9uKSBwb3NzaWJsZSBldmVudCBoYW5kbGVyIGZ1bmN0aW9uXG4gICAgXFwqL1xuXHRldmUuZiA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdHZhciBhdHRycyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblx0XHRyZXR1cm4gZnVuY3Rpb24gKCkge1xuXHRcdFx0ZXZlLmFwcGx5KG51bGwsIFtldmVudCwgbnVsbF0uY29uY2F0KGF0dHJzKS5jb25jYXQoW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDApKSk7XG5cdFx0fTtcblx0fTtcbiAgICAvKlxcXG4gICAgICogZXZlLnN0b3BcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIElzIHVzZWQgaW5zaWRlIGFuIGV2ZW50IGhhbmRsZXIgdG8gc3RvcCB0aGUgZXZlbnQsIHByZXZlbnRpbmcgYW55IHN1YnNlcXVlbnQgbGlzdGVuZXJzIGZyb20gZmlyaW5nLlxuICAgIFxcKi9cbiAgICBldmUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc3RvcCA9IDE7XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLm50XG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBDb3VsZCBiZSB1c2VkIGluc2lkZSBldmVudCBoYW5kbGVyIHRvIGZpZ3VyZSBvdXQgYWN0dWFsIG5hbWUgb2YgdGhlIGV2ZW50LlxuICAgICAqKlxuICAgICA+IEFyZ3VtZW50c1xuICAgICAqKlxuICAgICAtIHN1Ym5hbWUgKHN0cmluZykgI29wdGlvbmFsIHN1Ym5hbWUgb2YgdGhlIGV2ZW50XG4gICAgICoqXG4gICAgID0gKHN0cmluZykgbmFtZSBvZiB0aGUgZXZlbnQsIGlmIGBzdWJuYW1lYCBpcyBub3Qgc3BlY2lmaWVkXG4gICAgICogb3JcbiAgICAgPSAoYm9vbGVhbikgYHRydWVgLCBpZiBjdXJyZW50IGV2ZW504oCZcyBuYW1lIGNvbnRhaW5zIGBzdWJuYW1lYFxuICAgIFxcKi9cbiAgICBldmUubnQgPSBmdW5jdGlvbiAoc3VibmFtZSkge1xuICAgICAgICBpZiAoc3VibmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAoXCIoPzpcXFxcLnxcXFxcL3xeKVwiICsgc3VibmFtZSArIFwiKD86XFxcXC58XFxcXC98JClcIikudGVzdChjdXJyZW50X2V2ZW50KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY3VycmVudF9ldmVudDtcbiAgICB9O1xuICAgIC8qXFxcbiAgICAgKiBldmUubnRzXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBDb3VsZCBiZSB1c2VkIGluc2lkZSBldmVudCBoYW5kbGVyIHRvIGZpZ3VyZSBvdXQgYWN0dWFsIG5hbWUgb2YgdGhlIGV2ZW50LlxuICAgICAqKlxuICAgICAqKlxuICAgICA9IChhcnJheSkgbmFtZXMgb2YgdGhlIGV2ZW50XG4gICAgXFwqL1xuICAgIGV2ZS5udHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBjdXJyZW50X2V2ZW50LnNwbGl0KHNlcGFyYXRvcik7XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLm9mZlxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogUmVtb3ZlcyBnaXZlbiBmdW5jdGlvbiBmcm9tIHRoZSBsaXN0IG9mIGV2ZW50IGxpc3RlbmVycyBhc3NpZ25lZCB0byBnaXZlbiBuYW1lLlxuXHQgKiBJZiBubyBhcmd1bWVudHMgc3BlY2lmaWVkIGFsbCB0aGUgZXZlbnRzIHdpbGwgYmUgY2xlYXJlZC5cbiAgICAgKipcbiAgICAgPiBBcmd1bWVudHNcbiAgICAgKipcbiAgICAgLSBuYW1lIChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkLCB3aXRoIG9wdGlvbmFsIHdpbGRjYXJkc1xuICAgICAtIGYgKGZ1bmN0aW9uKSBldmVudCBoYW5kbGVyIGZ1bmN0aW9uXG4gICAgXFwqL1xuICAgIC8qXFxcbiAgICAgKiBldmUudW5iaW5kXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBTZWUgQGV2ZS5vZmZcbiAgICBcXCovXG4gICAgZXZlLm9mZiA9IGV2ZS51bmJpbmQgPSBmdW5jdGlvbiAobmFtZSwgZikge1xuXHRcdGlmICghbmFtZSkge1xuXHRcdCAgICBldmUuX2V2ZW50cyA9IGV2ZW50cyA9IHtuOiB7fX07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuICAgICAgICB2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KHNlcGFyYXRvciksXG4gICAgICAgICAgICBlLFxuICAgICAgICAgICAga2V5LFxuICAgICAgICAgICAgc3BsaWNlLFxuICAgICAgICAgICAgaSwgaWksIGosIGpqLFxuICAgICAgICAgICAgY3VyID0gW2V2ZW50c107XG4gICAgICAgIGZvciAoaSA9IDAsIGlpID0gbmFtZXMubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGN1ci5sZW5ndGg7IGogKz0gc3BsaWNlLmxlbmd0aCAtIDIpIHtcbiAgICAgICAgICAgICAgICBzcGxpY2UgPSBbaiwgMV07XG4gICAgICAgICAgICAgICAgZSA9IGN1cltqXS5uO1xuICAgICAgICAgICAgICAgIGlmIChuYW1lc1tpXSAhPSB3aWxkY2FyZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZVtuYW1lc1tpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNwbGljZS5wdXNoKGVbbmFtZXNbaV1dKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoa2V5IGluIGUpIGlmIChlW2hhc10oa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3BsaWNlLnB1c2goZVtrZXldKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjdXIuc3BsaWNlLmFwcGx5KGN1ciwgc3BsaWNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IGN1ci5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBlID0gY3VyW2ldO1xuICAgICAgICAgICAgd2hpbGUgKGUubikge1xuICAgICAgICAgICAgICAgIGlmIChmKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlLmYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IDAsIGpqID0gZS5mLmxlbmd0aDsgaiA8IGpqOyBqKyspIGlmIChlLmZbal0gPT0gZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuZi5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAhZS5mLmxlbmd0aCAmJiBkZWxldGUgZS5mO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGZvciAoa2V5IGluIGUubikgaWYgKGUubltoYXNdKGtleSkgJiYgZS5uW2tleV0uZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGZ1bmNzID0gZS5uW2tleV0uZjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IDAsIGpqID0gZnVuY3MubGVuZ3RoOyBqIDwgamo7IGorKykgaWYgKGZ1bmNzW2pdID09IGYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jcy5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAhZnVuY3MubGVuZ3RoICYmIGRlbGV0ZSBlLm5ba2V5XS5mO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGUuZjtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChrZXkgaW4gZS5uKSBpZiAoZS5uW2hhc10oa2V5KSAmJiBlLm5ba2V5XS5mKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgZS5uW2tleV0uZjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlID0gZS5uO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLm9uY2VcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIEJpbmRzIGdpdmVuIGV2ZW50IGhhbmRsZXIgd2l0aCBhIGdpdmVuIG5hbWUgdG8gb25seSBydW4gb25jZSB0aGVuIHVuYmluZCBpdHNlbGYuXG4gICAgIHwgZXZlLm9uY2UoXCJsb2dpblwiLCBmKTtcbiAgICAgfCBldmUoXCJsb2dpblwiKTsgLy8gdHJpZ2dlcnMgZlxuICAgICB8IGV2ZShcImxvZ2luXCIpOyAvLyBubyBsaXN0ZW5lcnNcbiAgICAgKiBVc2UgQGV2ZSB0byB0cmlnZ2VyIHRoZSBsaXN0ZW5lci5cbiAgICAgKipcbiAgICAgPiBBcmd1bWVudHNcbiAgICAgKipcbiAgICAgLSBuYW1lIChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBkb3QgKGAuYCkgb3Igc2xhc2ggKGAvYCkgc2VwYXJhdGVkLCB3aXRoIG9wdGlvbmFsIHdpbGRjYXJkc1xuICAgICAtIGYgKGZ1bmN0aW9uKSBldmVudCBoYW5kbGVyIGZ1bmN0aW9uXG4gICAgICoqXG4gICAgID0gKGZ1bmN0aW9uKSBzYW1lIHJldHVybiBmdW5jdGlvbiBhcyBAZXZlLm9uXG4gICAgXFwqL1xuICAgIGV2ZS5vbmNlID0gZnVuY3Rpb24gKG5hbWUsIGYpIHtcbiAgICAgICAgdmFyIGYyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZXZlLnVuYmluZChuYW1lLCBmMik7XG4gICAgICAgICAgICByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZXZlLm9uKG5hbWUsIGYyKTtcbiAgICB9O1xuICAgIC8qXFxcbiAgICAgKiBldmUudmVyc2lvblxuICAgICBbIHByb3BlcnR5IChzdHJpbmcpIF1cbiAgICAgKipcbiAgICAgKiBDdXJyZW50IHZlcnNpb24gb2YgdGhlIGxpYnJhcnkuXG4gICAgXFwqL1xuICAgIGV2ZS52ZXJzaW9uID0gdmVyc2lvbjtcbiAgICBldmUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBcIllvdSBhcmUgcnVubmluZyBFdmUgXCIgKyB2ZXJzaW9uO1xuICAgIH07XG4gICAgKHR5cGVvZiBtb2R1bGUgIT0gXCJ1bmRlZmluZWRcIiAmJiBtb2R1bGUuZXhwb3J0cykgPyAobW9kdWxlLmV4cG9ydHMgPSBldmUpIDogKHR5cGVvZiBkZWZpbmUgIT0gXCJ1bmRlZmluZWRcIiA/IChkZWZpbmUoXCJldmVcIiwgW10sIGZ1bmN0aW9uKCkgeyByZXR1cm4gZXZlOyB9KSkgOiAoZ2xvYi5ldmUgPSBldmUpKTtcbn0pKHRoaXMpO1xuIiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIHFzYSA9IHJlcXVpcmUoJy4vcXNhJyk7XG52YXIgcmVCb29sID0gL14odHJ1ZXxmYWxzZSkkL2lcblxuLyoqXG4gICMjIyBtZXRhKHJlZ2V4PylcblxuICBGaW5kIGFsbCB0aGUgYDxtZXRhPmAgdGFncyB0aGF0IGhhdmUgYSBuYW1lIGF0dHJpYnV0ZSBhbmQgY29sbGF0ZSBhcyBhXG4gIHNpbXBsZSBKUyBvYmplY3RzIHdoZXRoZXIgdGhlIGNvbnRlbnQgb2YgdGhlIHRhZyBpcyB0aGUgdmFsdWUuXG5cbiAgPDw8IGV4YW1wbGVzL21ldGEuanNcblxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHJlZ2V4KSB7XG4gIHZhciBkYXRhID0ge307XG5cbiAgLy8gZmluZCBhbGwgdGhlIG1ldGEgdGFncyB3aXRoIGEgbmFtZSBhbmQgZXh0cmFjdCB0aGUgY29udGVudFxuICBxc2EoJ21ldGFbbmFtZV0nKS5mb3JFYWNoKGZ1bmN0aW9uKHRhZykge1xuICAgIHZhciBuYW1lID0gdGFnLmdldEF0dHJpYnV0ZSgnbmFtZScpO1xuICAgIHZhciBtYXRjaCA9IHJlZ2V4ID8gcmVnZXguZXhlYyhuYW1lKSA6IFtuYW1lLCBuYW1lXTtcblxuICAgIGlmIChtYXRjaCkge1xuICAgICAgZGF0YVttYXRjaFsxXSB8fCBtYXRjaFswXV0gPSBjb2VyY2UodGFnLmdldEF0dHJpYnV0ZSgnY29udGVudCcpIHx8ICcnKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBkYXRhO1xufTtcblxuZnVuY3Rpb24gY29lcmNlKHZhbHVlKSB7XG4gIHZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSkgfHwgdmFsdWU7XG5cbiAgaWYgKHJlQm9vbC50ZXN0KHZhbHVlKSkge1xuICAgIHZhbHVlID0gdmFsdWUgPT0gJ3RydWUnO1xuICB9XG5cbiAgcmV0dXJuIHZhbHVlO1xufSIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICAjIyMgb25cblxuICBgYGBcbiAgZihuYW1lLCA9PiBlbCwgPT4gY2IpXG4gIGBgYFxuXG4gIFRoZSBgb25gIGhlbHBlciBhc3Npc3RzIHdpdGggd29ya2luZyB3aXRoIERPTSBldmVudHMgYW5kIGJlaW5nIGFibGUgdG8gbWFwXG4gIHRob3NlIHRvIGEgbm9kZSBjYWxsYmFjayBzdHlsZSBmdW5jdGlvbiBpbiB0aGUgZm9ybTpcblxuICBgYGBqc1xuICBmdW5jdGlvbihlcnIsIGV2dCkge1xuICB9XG4gIGBgYFxuXG4gIFdoZW4gdGhlIGV2ZW50IGlzIHRyaWdnZXJlZCBieSB0aGUgYGVsYCB0aGUgY2FsbGJhY2sgaXMgZmlyZWQgcGFzc2luZ1xuICBhIG51bGwgdmFsdWUgdG8gdGhlIGBlcnJgIGFyZ3VtZW50LlxuXG4gIDw8PCBleGFtcGxlcy9vbi5qc1xuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG5hbWUsIGVsLCBjYWxsYmFjaykge1xuICBmdW5jdGlvbiBiaW5kKHQsIHRyaWdnZXIpIHtcbiAgICB2YXIgYnVmZmVyZWQgPSBbXTtcblxuICAgIGZ1bmN0aW9uIGhhbmRsZUV2ZW50KGV2dCkge1xuICAgICAgaWYgKHR5cGVvZiB0cmlnZ2VyID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHRyaWdnZXIobnVsbCwgZXZ0KTtcbiAgICAgIH1cblxuICAgICAgLy8gb3RoZXJ3aXNlLCBidWZmZXIgdGhlIGV2ZW50XG4gICAgICBidWZmZXJlZFtidWZmZXJlZC5sZW5ndGhdID0gZXZ0O1xuICAgIH1cblxuICAgIC8vIGxpc3RlbiBmb3IgZXZlbnRzXG4gICAgdC5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGhhbmRsZUV2ZW50KTtcblxuICAgIC8vIGlmIHdlIGhhdmUgYmVlbiBwcm92aWRlZCBhIHRyaWdnZXIgZnVuY3Rpb24gKG5vdCBhbiBhcnJheSBpbmRleClcbiAgICAvLyB0aGVuIHJldHVybiB0aGUgaGFuZGxlIGV2ZW50IGNhbGxcbiAgICByZXR1cm4gdHlwZW9mIHRyaWdnZXIgPT0gJ2Z1bmN0aW9uJyA/IGhhbmRsZUV2ZW50IDogZnVuY3Rpb24oY2IpIHtcbiAgICAgIHRyaWdnZXIgPSBjYjtcblxuICAgICAgLy8gaWYgd2UgaGF2ZSBhIGJ1ZmZlcmVkIHJlc3VsdHMsIHRyaWdnZXIgdGhvc2Ugbm93XG4gICAgICBpZiAoYnVmZmVyZWQubGVuZ3RoID4gMCkge1xuICAgICAgICBidWZmZXJlZC5zcGxpY2UoMCkuZm9yRWFjaChmdW5jdGlvbihldnQpIHtcbiAgICAgICAgICBjYihudWxsLCBldnQpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIGVsID8gYmluZChlbCwgY2FsbGJhY2spIDogYmluZDtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbi8qIGdsb2JhbCBkb2N1bWVudDogZmFsc2UgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGNsYXNzU2VsZWN0b3JSRSA9IC9eXFwuKFtcXHdcXC1dKykkLztcbnZhciBpZFNlbGVjdG9yUkUgPSAvXiMoW1xcd1xcLV0rKSQvO1xudmFyIHRhZ1NlbGVjdG9yUkUgPSAvXltcXHdcXC1dKyQvO1xuXG4vKipcbiAgIyMjIHFzYShzZWxlY3Rvciwgc2NvcGU/KVxuXG4gIFRoaXMgZnVuY3Rpb24gaXMgdXNlZCB0byBnZXQgdGhlIHJlc3VsdHMgb2YgdGhlIHF1ZXJ5U2VsZWN0b3JBbGwgb3V0cHV0XG4gIGluIHRoZSBmYXN0ZXN0IHBvc3NpYmxlIHdheS4gIFRoaXMgY29kZSBpcyB2ZXJ5IG11Y2ggYmFzZWQgb24gdGhlXG4gIGltcGxlbWVudGF0aW9uIGluXG4gIFt6ZXB0b10oaHR0cHM6Ly9naXRodWIuY29tL21hZHJvYmJ5L3plcHRvL2Jsb2IvbWFzdGVyL3NyYy96ZXB0by5qcyNMMTA0KSxcbiAgYnV0IHBlcmhhcHMgbm90IHF1aXRlIGFzIHRlcnNlLlxuXG4gIDw8PCBleGFtcGxlcy9xc2EuanNcblxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNlbGVjdG9yLCBzY29wZSkge1xuICB2YXIgaWRTZWFyY2g7XG5cbiAgLy8gZGVmYXVsdCB0aGUgZWxlbWVudCB0byB0aGUgZG9jdW1lbnRcbiAgc2NvcGUgPSBzY29wZSB8fCBkb2N1bWVudDtcblxuICAvLyBkZXRlcm1pbmUgd2hldGhlciB3ZSBhcmUgZG9pbmcgYW4gaWQgc2VhcmNoIG9yIG5vdFxuICBpZFNlYXJjaCA9IHNjb3BlID09PSBkb2N1bWVudCAmJiBpZFNlbGVjdG9yUkUudGVzdChzZWxlY3Rvcik7XG5cbiAgLy8gcGVyZm9ybSB0aGUgc2VhcmNoXG4gIHJldHVybiBpZFNlYXJjaCA/XG4gICAgLy8gd2UgYXJlIGRvaW5nIGFuIGlkIHNlYXJjaCwgcmV0dXJuIHRoZSBlbGVtZW50IHNlYXJjaCBpbiBhbiBhcnJheVxuICAgIFtzY29wZS5nZXRFbGVtZW50QnlJZChSZWdFeHAuJDEpXSA6XG4gICAgLy8gbm90IGFuIGlkIHNlYXJjaCwgY2FsbCB0aGUgYXBwcm9wcmlhdGUgc2VsZWN0b3JcbiAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChcbiAgICAgICAgY2xhc3NTZWxlY3RvclJFLnRlc3Qoc2VsZWN0b3IpID9cbiAgICAgICAgICBzY29wZS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKFJlZ0V4cC4kMSkgOlxuICAgICAgICAgICAgdGFnU2VsZWN0b3JSRS50ZXN0KHNlbGVjdG9yKSA/XG4gICAgICAgICAgICAgIHNjb3BlLmdldEVsZW1lbnRzQnlUYWdOYW1lKHNlbGVjdG9yKSA6XG4gICAgICAgICAgICAgIHNjb3BlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpXG4gICAgKTtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIHJlU2VwYXJhdG9yID0gL1tcXCxcXHNdXFxzKi87XG52YXIgb2ZmRmxhZ3MgPSBbJ2ZhbHNlJywgJ25vbmUnLCAnb2ZmJ107XG5cblxuLyoqXG4gICMgcnRjLWNhcHR1cmVjb25maWdcblxuICBUaGlzIGlzIGEgc2ltcGxlIHBhcnNlciB0aGF0IHRha2VzIGEgc3RyaW5nIG9mIHRleHQgYW5kIGRldGVybWluZXMgd2hhdFxuICB0aGF0IG1lYW5zIGluIHRoZSBjb250ZXh0IG9mIFdlYlJUQy5cblxuICAjIyBXaHk/XG5cbiAgSXQgcHJvdmlkZXMgYSBzaW1wbGUsIHRleHR1YWwgd2F5IG9mIGRlc2NyaWJpbmcgeW91ciByZXF1aXJlbWVudHMgZm9yXG4gIG1lZGlhIGNhcHR1cmUuICBUcnlpbmcgdG8gcmVtZW1iZXIgdGhlIHN0cnVjdHVyZSBvZiB0aGUgY29uc3RyYWludHMgb2JqZWN0XG4gIGlzIHBhaW5mdWwuXG5cbiAgIyMgSG93XG5cbiAgQSBzaW1wbGUgdGV4dCBzdHJpbmcgaXMgY29udmVydGVkIHRvIGFuIGludGVybWVkaWF0ZSBKUyBvYmplY3RcbiAgcmVwcmVzZW50YXRpb24sIHdoaWNoIGNhbiB0aGVuIGJlIGNvbnZlcnRlZCB0byBhIGdldFVzZXJNZWRpYSBjb25zdHJhaW50c1xuICBkYXRhIHN0cnVjdHVyZSB1c2luZyBhIGB0b0NvbnN0cmFpbnRzKClgIGNhbGwuXG5cbiAgRm9yIGV4YW1wbGUsIHRoZSBmb2xsb3dpbmcgdGV4dCBpbnB1dDpcblxuICBgYGBcbiAgY2FtZXJhIG1pbjoxMjgweDcyMCBtYXg6MTI4MHg3MjAgbWluOjE1ZnBzIG1heDoyNWZwc1xuICBgYGBcblxuICBJcyBjb252ZXJ0ZWQgaW50byBhbiBpbnRlcm1lZGlhIHJlcHJlc2VudGF0aW9uICh2aWEgdGhlIGBDYXB0dXJlQ29uZmlnYFxuICB1dGlsaXR5IGNsYXNzKSB0aGF0IGxvb2tzIGxpa2UgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqc1xuICB7XG4gICAgY2FtZXJhOiAwLFxuICAgIG1pY3JvcGhvbmU6IDAsXG4gICAgcmVzOiB7XG4gICAgICBtaW46IHsgdzogMTI4MCwgaDogNzIwIH0sXG4gICAgICBtYXg6IHsgdzogMTI4MCwgaDogNzIwIH1cbiAgICB9LFxuXG4gICAgZnBzOiB7XG4gICAgICBtaW46IDE1LFxuICAgICAgbWF4OiAyNVxuICAgIH1cbiAgfVxuICBgYGBcblxuICBXaGljaCBpbiB0dXJuIGlzIGNvbnZlcnRlZCBpbnRvIHRoZSBmb2xsb3dpbmcgbWVkaWEgY29uc3RyYWludHMgZm9yXG4gIGEgZ2V0VXNlck1lZGlhIGNhbGw6XG5cbiAgYGBganNcbiAge1xuICAgIGF1ZGlvOiB0cnVlLFxuICAgIHZpZGVvOiB7XG4gICAgICBtYW5kYXRvcnk6IHtcbiAgICAgICAgbWluRnJhbWVSYXRlOiAxNSxcbiAgICAgICAgbWF4RnJhbWVSYXRlOiAyNSxcblxuICAgICAgICBtaW5XaWR0aDogMTI4MCxcbiAgICAgICAgbWluSGVpZ2h0OiA3MjAsXG4gICAgICAgIG1heFdpZHRoOiAxMjgwLFxuICAgICAgICBtYXhIZWlnaHQ6IDcyMFxuICAgICAgfSxcblxuICAgICAgb3B0aW9uYWw6IFtdXG4gICAgfVxuICB9XG4gIGBgYFxuXG4gICMjIyBFeHBlcmltZW50YWw6IFRhcmdldGVkIERldmljZSBDYXB0dXJlXG5cbiAgV2hpbGUgdGhlIGBydGMtY2FwdHVyZWNvbmZpZ2AgbW9kdWxlIGl0c2VsZiBkb2Vzbid0IGNvbnRhaW4gYW55IG1lZGlhXG4gIGlkZW50aWZpY2F0aW9uIGxvZ2ljLCBpdCBpcyBhYmxlIHRvIHRoZSBzb3VyY2VzIGluZm9ybWF0aW9uIGZyb20gYVxuICBgTWVkaWFTdHJlYW1UcmFjay5nZXRTb3VyY2VzYCBjYWxsIHRvIGdlbmVyYXRlIGRldmljZSB0YXJnZXRlZCBjb25zdHJhaW50cy5cblxuICBGb3IgaW5zdGFuY2UsIHRoZSBmb2xsb3dpbmcgZXhhbXBsZSBkZW1vbnN0cmF0ZXMgaG93IHdlIGNhbiByZXF1ZXN0XG4gIGBjYW1lcmE6MWAgKHRoZSAybmQgdmlkZW8gZGV2aWNlIG9uIG91ciBsb2NhbCBtYWNoaW5lKSB3aGVuIHdlIGFyZSBtYWtpbmdcbiAgYSBnZXRVc2VyTWVkaWEgY2FsbDpcblxuICA8PDwgZXhhbXBsZXMvY2FtZXJhLXR3by5qc1xuXG4gIEl0J3Mgd29ydGggbm90aW5nIHRoYXQgaWYgdGhlIHJlcXVlc3RlZCBkZXZpY2UgZG9lcyBub3QgZXhpc3Qgb24gdGhlXG4gIG1hY2hpbmUgKGluIHRoZSBjYXNlIGFib3ZlLCBpZiB5b3VyIG1hY2hpbmUgb25seSBoYXMgYSBzaW5nbGUgd2ViY2FtIC0gYXNcbiAgaXMgY29tbW9uKSB0aGVuIG5vIGRldmljZSBzZWxlY3Rpb24gY29uc3RyYWludHMgd2lsbCBiZSBnZW5lcmF0ZWQgKGkuZS5cbiAgdGhlIHN0YW5kYXJkIGB7IHZpZGVvOiB0cnVlLCBhdWRpbzogdHJ1ZSB9YCBjb25zdHJhaW50cyB3aWxsIGJlIHJldHVybmVkXG4gIGZyb20gdGhlIGB0b0NvbnN0cmFpbnRzYCBjYWxsKS5cblxuICAjIyMgRXhwZXJpbWVudGFsOiBTY3JlZW4gQ2FwdHVyZVxuXG4gIElmIHlvdSBhcmUgd29ya2luZyB3aXRoIGNocm9tZSBhbmQgc2VydmluZyBjb250ZW50IG9mIGEgSFRUUFMgY29ubmVjdGlvbixcbiAgdGhlbiB5b3Ugd2lsbCBiZSBhYmxlIHRvIGV4cGVyaW1lbnQgd2l0aCBleHBlcmltZW50YWwgZ2V0VXNlck1lZGlhIHNjcmVlblxuICBjYXB0dXJlLlxuXG4gIEluIHRoZSBzaW1wbGVzdCBjYXNlLCBzY3JlZW4gY2FwdHVyZSBjYW4gYmUgaW52b2tlZCBieSB1c2luZyB0aGUgY2FwdHVyZVxuICBzdHJpbmcgb2Y6XG5cbiAgYGBgXG4gIHNjcmVlblxuICBgYGBcblxuICBXaGljaCBnZW5lcmF0ZXMgdGhlIGZvbGxvd2luZyBjb250cmFpbnRzOlxuXG4gIGBgYGpzXG4gIHtcbiAgICBhdWRpbzogZmFsc2UsXG4gICAgdmlkZW86IHtcbiAgICAgIG1hbmRhdG9yeToge1xuICAgICAgICBjaHJvbWVNZWRpYVNvdXJjZTogJ3NjcmVlbidcbiAgICAgIH0sXG5cbiAgICAgIG9wdGlvbmFsOiBbXVxuICAgIH1cbiAgfVxuICBgYGBcblxuICAjIyBSZWZlcmVuY2VcblxuKiovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oaW5wdXQpIHtcbiAgLy8gY3JlYXRlIGEgbmV3IGNvbmZpZ3VyYXRpb24gb2JqZWN0IHVzaW5nIGRlZmF1bHRzXG4gIHZhciBjb25maWcgPSBuZXcgQ2FwdHVyZUNvbmZpZygpO1xuXG4gIC8vIHByb2Nlc3MgZWFjaCBvZiB0aGUgZGlyZWN0aXZlc1xuICAoaW5wdXQgfHwgJycpLnNwbGl0KHJlU2VwYXJhdG9yKS5mb3JFYWNoKGZ1bmN0aW9uKGRpcmVjdGl2ZSkge1xuICAgIC8vIG5vdyBmdXJ0aGVyIHNwbGl0IHRoZSBkaXJlY3RpdmUgb24gdGhlIDogY2hhcmFjdGVyXG4gICAgdmFyIHBhcnRzID0gZGlyZWN0aXZlLnNwbGl0KCc6Jyk7XG4gICAgdmFyIG1ldGhvZCA9IGNvbmZpZ1socGFydHNbMF0gfHwgJycpLnRvTG93ZXJDYXNlKCldO1xuXG4gICAgLy8gaWYgd2UgaGF2ZSB0aGUgbWV0aG9kIGFwcGx5XG4gICAgaWYgKHR5cGVvZiBtZXRob2QgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgbWV0aG9kLmFwcGx5KGNvbmZpZywgcGFydHMuc2xpY2UoMSkpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGNvbmZpZztcbn07XG5cbi8qKlxuICAjIyMgQ2FwdHVyZUNvbmZpZ1xuXG4gIFRoaXMgaXMgYSB1dGlsaXR5IGNsYXNzIHRoYXQgaXMgdXNlZCB0byB1cGRhdGUgY2FwdHVyZSBjb25maWd1cmF0aW9uXG4gIGRldGFpbHMgYW5kIGlzIGFibGUgdG8gZ2VuZXJhdGUgc3VpdGFibGUgZ2V0VXNlck1lZGlhIGNvbnN0cmFpbnRzIGJhc2VkXG4gIG9uIHRoZSBjb25maWd1cmF0aW9uLlxuXG4qKi9cbmZ1bmN0aW9uIENhcHR1cmVDb25maWcoKSB7XG4gIGlmICghICh0aGlzIGluc3RhbmNlb2YgQ2FwdHVyZUNvbmZpZykpIHtcbiAgICByZXR1cm4gbmV3IENhcHR1cmVDb25maWcoKTtcbiAgfVxuXG4gIC8vIGluaXRpYWxpc2UgdGhlIGJhc2UgY29uZmlnXG4gIHRoaXMuY2ZnID0ge1xuICAgIG1pY3JvcGhvbmU6IHRydWVcbiAgfTtcbn1cblxuLyoqXG4gICMjIyMgY2FtZXJhKGluZGV4KVxuXG4gIFVwZGF0ZSB0aGUgY2FtZXJhIGNvbmZpZ3VyYXRpb24gdG8gdGhlIHNwZWNpZmllZCBpbmRleFxuKiovXG5DYXB0dXJlQ29uZmlnLnByb3RvdHlwZS5jYW1lcmEgPSBmdW5jdGlvbihpbmRleCkge1xuICB0aGlzLmNmZy5jYW1lcmEgPSB0cnVlT3JWYWx1ZShpbmRleCk7XG59O1xuXG4vKipcbiAgIyMjIyBtaWNyb3Bob25lKGluZGV4KVxuXG4gIFVwZGF0ZSB0aGUgbWljcm9waG9uZSBjb25maWd1cmF0aW9uIHRvIHRoZSBzcGVjaWZpZWQgaW5kZXhcbioqL1xuQ2FwdHVyZUNvbmZpZy5wcm90b3R5cGUubWljcm9waG9uZSA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gIHRoaXMuY2ZnLm1pY3JvcGhvbmUgPSB0cnVlT3JWYWx1ZShpbmRleCk7XG59O1xuXG4vKipcbiAgIyMjIyBzY3JlZW4odGFyZ2V0KVxuXG4gIFNwZWNpZnkgdGhhdCB3ZSB3b3VsZCBsaWtlIHRvIGNhcHR1cmUgdGhlIHNjcmVlblxuKiovXG5DYXB0dXJlQ29uZmlnLnByb3RvdHlwZS5zY3JlZW4gPSBmdW5jdGlvbigpIHtcbiAgLy8gdW5zZXQgdGhlIG1pY3JvcGhvbmUgY29uZmlnXG4gIGRlbGV0ZSB0aGlzLmNmZy5taWNyb3Bob25lO1xuXG4gIC8vIHNldCB0aGUgc2NyZWVuIGNvbmZpZ3VyYXRpb25cbiAgdGhpcy5jZmcuc2NyZWVuID0gdHJ1ZTtcbn07XG5cbi8qKlxuICAjIyMjIG1heChkYXRhKVxuXG4gIFVwZGF0ZSBhIG1heGltdW0gY29uc3RyYWludC4gIElmIGFuIGZwcyBjb25zdHJhaW50IHRoaXMgd2lsbCBiZSBkaXJlY3RlZFxuICB0byB0aGUgYG1heGZwc2AgbW9kaWZpZXIuXG5cbioqL1xuQ2FwdHVyZUNvbmZpZy5wcm90b3R5cGUubWF4ID0gZnVuY3Rpb24oZGF0YSkge1xuICB2YXIgcmVzO1xuXG4gIC8vIGlmIHRoaXMgaXMgYW4gZnBzIHNwZWNpZmljYXRpb24gcGFyc2VcbiAgaWYgKGRhdGEuc2xpY2UoLTMpLnRvTG93ZXJDYXNlKCkgPT0gJ2ZwcycpIHtcbiAgICByZXR1cm4gdGhpcy5tYXhmcHMoZGF0YSk7XG4gIH1cblxuICAvLyBwYXJzZSB0aGUgcmVzb2x1dGlvblxuICByZXMgPSB0aGlzLl9wYXJzZVJlcyhkYXRhKTtcblxuICAvLyBpbml0aWFsaXNlIHRoZSBmcHMgY29uZmlnIHN0dWZmXG4gIHRoaXMuY2ZnLnJlcyA9IHRoaXMuY2ZnLnJlcyB8fCB7fTtcbiAgdGhpcy5jZmcucmVzLm1heCA9IHJlcztcbn07XG5cbi8qKlxuICAjIyMjIG1heGZwcyhkYXRhKVxuXG4gIFVwZGF0ZSB0aGUgbWF4aW11bSBmcHNcbioqL1xuQ2FwdHVyZUNvbmZpZy5wcm90b3R5cGUubWF4ZnBzID0gZnVuY3Rpb24oZGF0YSkge1xuICAvLyBlbnN1cmUgd2UgaGF2ZSBhbiBmcHMgY29tcG9uZW50XG4gIHRoaXMuY2ZnLmZwcyA9IHRoaXMuY2ZnLmZwcyB8fCB7fTtcblxuICAvLyBzZXQgdGhlIG1heCBmcHNcbiAgdGhpcy5jZmcuZnBzLm1heCA9IHBhcnNlRmxvYXQoZGF0YS5zbGljZSgwLCAtMykpO1xufTtcblxuLyoqXG4gICMjIyMgbWluKGRhdGEpXG5cbiAgVXBkYXRlIGEgbWluaW11bSBjb25zdHJhaW50LiAgVGhpcyBjYW4gYmUgZWl0aGVyIHJlbGF0ZWQgdG8gcmVzb2x1dGlvblxuICBvciBGUFMuXG4qKi9cbkNhcHR1cmVDb25maWcucHJvdG90eXBlLm1pbiA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgdmFyIHJlcztcblxuICAvLyBpZiB0aGlzIGlzIGFuIGZwcyBzcGVjaWZpY2F0aW9uIHBhcnNlXG4gIGlmIChkYXRhLnNsaWNlKC0zKS50b0xvd2VyQ2FzZSgpID09ICdmcHMnKSB7XG4gICAgcmV0dXJuIHRoaXMubWluZnBzKGRhdGEpO1xuICB9XG5cbiAgLy8gcGFyc2UgdGhlIHJlc29sdXRpb25cbiAgcmVzID0gdGhpcy5fcGFyc2VSZXMoZGF0YSk7XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgZnBzIGNvbmZpZyBzdHVmZlxuICB0aGlzLmNmZy5yZXMgPSB0aGlzLmNmZy5yZXMgfHwge307XG5cbiAgLy8gYWRkIHRoZSBtaW5cbiAgdGhpcy5jZmcucmVzLm1pbiA9IHJlcztcbn07XG5cbi8qKlxuICAjIyMjIG1pbmZwcyhkYXRhKVxuXG4gIFVwZGF0ZSB0aGUgbWluaW11bSBmcHNcbioqL1xuQ2FwdHVyZUNvbmZpZy5wcm90b3R5cGUubWluZnBzID0gZnVuY3Rpb24oZGF0YSkge1xuICAvLyBlbnN1cmUgd2UgaGF2ZSBhbiBmcHMgY29tcG9uZW50XG4gIHRoaXMuY2ZnLmZwcyA9IHRoaXMuY2ZnLmZwcyB8fCB7fTtcblxuICAvLyBzZXQgdGhlIG1heCBmcHNcbiAgdGhpcy5jZmcuZnBzLm1pbiA9IHBhcnNlRmxvYXQoZGF0YS5zbGljZSgwLCAtMykpO1xufTtcblxuLyoqXG4gICMjIyMgdG9Db25zdHJhaW50cyhvcHRzPylcblxuICBDb252ZXJ0IHRoZSBpbnRlcm5hbCBjb25maWd1cmF0aW9uIG9iamVjdCB0byBhIHZhbGlkIG1lZGlhIGNvbnN0cmFpbnRzXG4gIHJlcHJlc2VudGF0aW9uLiAgSW4gY29tcGF0aWJsZSBicm93c2VycyBhIGxpc3Qgb2YgbWVkaWEgc291cmNlcyBjYW5cbiAgYmUgcGFzc2VkIHRocm91Z2ggaW4gdGhlIGBvcHRzLnNvdXJjZXNgIHRvIGNyZWF0ZSBjb250cmFpbnRzIHRoYXQgd2lsbFxuICB0YXJnZXQgYSBzcGVjaWZpYyBkZXZpY2Ugd2hlbiBjYXB0dXJlZC5cblxuICA8PDwgZXhhbXBsZXMvY2FwdHVyZS10YXJnZXRzLmpzXG5cbioqL1xuQ2FwdHVyZUNvbmZpZy5wcm90b3R5cGUudG9Db25zdHJhaW50cyA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgdmFyIGNmZyA9IHRoaXMuY2ZnO1xuICB2YXIgY29uc3RyYWludHMgPSB7XG4gICAgYXVkaW86IGNmZy5taWNyb3Bob25lID09PSB0cnVlIHx8XG4gICAgICAodHlwZW9mIGNmZy5taWNyb3Bob25lID09ICdudW1iZXInICYmIGNmZy5taWNyb3Bob25lID49IDApLFxuXG4gICAgdmlkZW86IGNmZy5jYW1lcmEgPT09IHRydWUgfHwgY2ZnLnNjcmVlbiB8fFxuICAgICAgKHR5cGVvZiBjZmcuY2FtZXJhID09ICdudW1iZXInICYmIGNmZy5jYW1lcmEgPj0gMClcbiAgfTtcblxuICAvLyBtYW5kYXRvcnkgY29uc3RyYWludHNcbiAgdmFyIG0gPSB7XG4gICAgdmlkZW86IHt9LFxuICAgIGF1ZGlvOiB7fVxuICB9O1xuXG4gIC8vIG9wdGlvbmFsIGNvbnN0cmFpbnRzXG4gIHZhciBvID0ge1xuICAgIHZpZGVvOiBbXSxcbiAgICBhdWRpbzogW11cbiAgfTtcblxuICB2YXIgc291cmNlcyA9IChvcHRzIHx8IHt9KS5zb3VyY2VzIHx8IFtdO1xuICB2YXIgY2FtZXJhcyA9IHNvdXJjZXMuZmlsdGVyKGZ1bmN0aW9uKGluZm8pIHtcbiAgICByZXR1cm4gaW5mbyAmJiBpbmZvLmtpbmQgPT09ICd2aWRlbyc7XG4gIH0pO1xuICB2YXIgbWljcm9waG9uZXMgPSBzb3VyY2VzLmZpbHRlcihmdW5jdGlvbihpbmZvKSB7XG4gICAgcmV0dXJuIGluZm8gJiYgaW5mby5raW5kID09PSAnYXVkaW8nO1xuICB9KTtcbiAgdmFyIHNlbGVjdGVkU291cmNlO1xuXG4gIGZ1bmN0aW9uIGNvbXBsZXhDb25zdHJhaW50cyh0YXJnZXQpIHtcbiAgICBpZiAoY29uc3RyYWludHNbdGFyZ2V0XSAmJiB0eXBlb2YgY29uc3RyYWludHNbdGFyZ2V0XSAhPSAnb2JqZWN0Jykge1xuICAgICAgY29uc3RyYWludHNbdGFyZ2V0XSA9IHtcbiAgICAgICAgbWFuZGF0b3J5OiBtW3RhcmdldF0sXG4gICAgICAgIG9wdGlvbmFsOiBvW3RhcmdldF1cbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLy8gZnBzXG4gIGlmIChjZmcuZnBzKSB7XG4gICAgY29tcGxleENvbnN0cmFpbnRzKCd2aWRlbycpO1xuICAgIGNmZy5mcHMubWluICYmIChtLnZpZGVvLm1pbkZyYW1lUmF0ZSA9IGNmZy5mcHMubWluKTtcbiAgICBjZmcuZnBzLm1heCAmJiAobS52aWRlby5tYXhGcmFtZVJhdGUgPSBjZmcuZnBzLm1heCk7XG4gIH1cblxuICAvLyBtaW4gcmVzIHNwZWNpZmllZFxuICBpZiAoY2ZnLnJlcyAmJiBjZmcucmVzLm1pbikge1xuICAgIGNvbXBsZXhDb25zdHJhaW50cygndmlkZW8nKTtcbiAgICBtLnZpZGVvLm1pbldpZHRoID0gY2ZnLnJlcy5taW4udztcbiAgICBtLnZpZGVvLm1pbkhlaWdodCA9IGNmZy5yZXMubWluLmg7XG4gIH1cblxuICAvLyBtYXggcmVzIHNwZWNpZmllZFxuICBpZiAoY2ZnLnJlcyAmJiBjZmcucmVzLm1heCkge1xuICAgIGNvbXBsZXhDb25zdHJhaW50cygndmlkZW8nKTtcbiAgICBtLnZpZGVvLm1heFdpZHRoID0gY2ZnLnJlcy5tYXgudztcbiAgICBtLnZpZGVvLm1heEhlaWdodCA9IGNmZy5yZXMubWF4Lmg7XG4gIH1cblxuICAvLyBpbnB1dCBjYW1lcmEgc2VsZWN0aW9uXG4gIGlmICh0eXBlb2YgY2ZnLmNhbWVyYSA9PSAnbnVtYmVyJyAmJiBjYW1lcmFzLmxlbmd0aCkge1xuICAgIHNlbGVjdGVkU291cmNlID0gY2FtZXJhc1tjZmcuY2FtZXJhXTtcblxuICAgIGlmIChzZWxlY3RlZFNvdXJjZSkge1xuICAgICAgY29tcGxleENvbnN0cmFpbnRzKCd2aWRlbycpO1xuICAgICAgby52aWRlby5wdXNoKHsgc291cmNlSWQ6IHNlbGVjdGVkU291cmNlLmlkIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlucHV0IG1pY3JvcGhvbmUgc2VsZWN0aW9uXG4gIGlmICh0eXBlb2YgY2ZnLm1pY3JvcGhvbmUgPT0gJ251bWJlcicgJiYgbWljcm9waG9uZXMubGVuZ3RoKSB7XG4gICAgc2VsZWN0ZWRTb3VyY2UgPSBtaWNyb3Bob25lc1tjZmcubWljcm9waG9uZV07XG5cbiAgICBpZiAoc2VsZWN0ZWRTb3VyY2UpIHtcbiAgICAgIGNvbXBsZXhDb25zdHJhaW50cygnYXVkaW8nKTtcbiAgICAgIG8uYXVkaW8ucHVzaCh7IHNvdXJjZUlkOiBzZWxlY3RlZFNvdXJjZS5pZCB9KTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB3ZSBoYXZlIHNjcmVlbiBjb25zdHJhaW50cywgbWFrZSBtYWdpYyBoYXBwZW5cbiAgaWYgKHR5cGVvZiBjZmcuc2NyZWVuICE9ICd1bmRlZmluZWQnKSB7XG4gICAgY29tcGxleENvbnN0cmFpbnRzKCd2aWRlbycpO1xuICAgIG0udmlkZW8uY2hyb21lTWVkaWFTb3VyY2UgPSAnc2NyZWVuJztcbiAgfVxuXG4gIHJldHVybiBjb25zdHJhaW50cztcbn07XG5cbi8qKlxuICAjIyMgXCJJbnRlcm5hbFwiIG1ldGhvZHNcbioqL1xuXG4vKipcbiAgIyMjIyBfcGFyc2VSZXMoZGF0YSlcblxuICBQYXJzZSBhIHJlc29sdXRpb24gc3BlY2lmaWVyIChlLmcuIDEyODB4NzIwKSBpbnRvIGEgc2ltcGxlIEpTIG9iamVjdFxuICAoZS5nLiB7IHc6IDEyODAsIGg6IDcyMCB9KVxuKiovXG5DYXB0dXJlQ29uZmlnLnByb3RvdHlwZS5fcGFyc2VSZXMgPSBmdW5jdGlvbihkYXRhKSB7XG4gIC8vIHNwbGl0IHRoZSBkYXRhIG9uIHRoZSAneCcgY2hhcmFjdGVyXG4gIHZhciBwYXJ0cyA9IGRhdGEuc3BsaXQoJ3gnKTtcblxuICAvLyBpZiB3ZSBkb24ndCBoYXZlIHR3byBwYXJ0cywgdGhlbiBjb21wbGFpblxuICBpZiAocGFydHMubGVuZ3RoIDwgMikge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCByZXNvbHV0aW9uIHNwZWNpZmljYXRpb246ICcgKyBkYXRhKTtcbiAgfVxuXG4gIC8vIHJldHVybiB0aGUgd2lkdGggYW5kIGhlaWdodCBvYmplY3RcbiAgcmV0dXJuIHtcbiAgICB3OiBwYXJzZUludChwYXJ0c1swXSwgMTApLFxuICAgIGg6IHBhcnNlSW50KHBhcnRzWzFdLCAxMClcbiAgfTtcbn07XG5cbi8qIGludGVybmFsIGhlbHBlciAqL1xuXG5mdW5jdGlvbiB0cnVlT3JWYWx1ZSh2YWwpIHtcbiAgaWYgKHR5cGVvZiB2YWwgPT0gJ3N0cmluZycgJiYgb2ZmRmxhZ3MuaW5kZXhPZih2YWwudG9Mb3dlckNhc2UoKSkgPj0gMCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB2YWwgPT09IHVuZGVmaW5lZCB8fCB2YWwgPT09ICcnIHx8IHBhcnNlSW50KHZhbCB8fCAwLCAxMCk7XG59IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbi8qIGdsb2JhbCB3aW5kb3c6IGZhbHNlICovXG4vKiBnbG9iYWwgbmF2aWdhdG9yOiBmYWxzZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuIyMgcnRjLWNvcmUvZGV0ZWN0XG5cbkEgYnJvd3NlciBkZXRlY3Rpb24gaGVscGVyIGZvciBhY2Nlc3NpbmcgcHJlZml4LWZyZWUgdmVyc2lvbnMgb2YgdGhlIHZhcmlvdXNcbldlYlJUQyB0eXBlcy5cblxuIyMjIEV4YW1wbGUgVXNhZ2VcblxuSWYgeW91IHdhbnRlZCB0byBnZXQgdGhlIG5hdGl2ZSBgUlRDUGVlckNvbm5lY3Rpb25gIHByb3RvdHlwZSBpbiBhbnkgYnJvd3NlclxueW91IGNvdWxkIGRvIHRoZSBmb2xsb3dpbmc6XG5cbmBgYGpzXG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgncnRjLWNvcmUvZGV0ZWN0Jyk7IC8vIGFsc28gYXZhaWxhYmxlIGluIHJ0Yy9kZXRlY3RcbnZhciBSVENQZWVyQ29ubmVjdGlvbiA9IGRldGVjdCgnUlRDUGVlckNvbm5lY3Rpb24nKTtcbmBgYFxuXG5UaGlzIHdvdWxkIHByb3ZpZGUgd2hhdGV2ZXIgdGhlIGJyb3dzZXIgcHJlZml4ZWQgdmVyc2lvbiBvZiB0aGVcblJUQ1BlZXJDb25uZWN0aW9uIGlzIGF2YWlsYWJsZSAoYHdlYmtpdFJUQ1BlZXJDb25uZWN0aW9uYCxcbmBtb3pSVENQZWVyQ29ubmVjdGlvbmAsIGV0YykuXG4qKi9cbnZhciBkZXRlY3QgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHRhcmdldCwgcHJlZml4ZXMpIHtcbiAgdmFyIHByZWZpeElkeDtcbiAgdmFyIHByZWZpeDtcbiAgdmFyIHRlc3ROYW1lO1xuICB2YXIgaG9zdE9iamVjdCA9IHRoaXMgfHwgKHR5cGVvZiB3aW5kb3cgIT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiB1bmRlZmluZWQpO1xuXG4gIC8vIGlmIHdlIGhhdmUgbm8gaG9zdCBvYmplY3QsIHRoZW4gYWJvcnRcbiAgaWYgKCEgaG9zdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIGluaXRpYWxpc2UgdG8gZGVmYXVsdCBwcmVmaXhlc1xuICAvLyAocmV2ZXJzZSBvcmRlciBhcyB3ZSB1c2UgYSBkZWNyZW1lbnRpbmcgZm9yIGxvb3ApXG4gIHByZWZpeGVzID0gKHByZWZpeGVzIHx8IFsnbXMnLCAnbycsICdtb3onLCAnd2Via2l0J10pLmNvbmNhdCgnJyk7XG5cbiAgLy8gaXRlcmF0ZSB0aHJvdWdoIHRoZSBwcmVmaXhlcyBhbmQgcmV0dXJuIHRoZSBjbGFzcyBpZiBmb3VuZCBpbiBnbG9iYWxcbiAgZm9yIChwcmVmaXhJZHggPSBwcmVmaXhlcy5sZW5ndGg7IHByZWZpeElkeC0tOyApIHtcbiAgICBwcmVmaXggPSBwcmVmaXhlc1twcmVmaXhJZHhdO1xuXG4gICAgLy8gY29uc3RydWN0IHRoZSB0ZXN0IGNsYXNzIG5hbWVcbiAgICAvLyBpZiB3ZSBoYXZlIGEgcHJlZml4IGVuc3VyZSB0aGUgdGFyZ2V0IGhhcyBhbiB1cHBlcmNhc2UgZmlyc3QgY2hhcmFjdGVyXG4gICAgLy8gc3VjaCB0aGF0IGEgdGVzdCBmb3IgZ2V0VXNlck1lZGlhIHdvdWxkIHJlc3VsdCBpbiBhXG4gICAgLy8gc2VhcmNoIGZvciB3ZWJraXRHZXRVc2VyTWVkaWFcbiAgICB0ZXN0TmFtZSA9IHByZWZpeCArIChwcmVmaXggP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHRhcmdldC5zbGljZSgxKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0KTtcblxuICAgIGlmICh0eXBlb2YgaG9zdE9iamVjdFt0ZXN0TmFtZV0gIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIC8vIHVwZGF0ZSB0aGUgbGFzdCB1c2VkIHByZWZpeFxuICAgICAgZGV0ZWN0LmJyb3dzZXIgPSBkZXRlY3QuYnJvd3NlciB8fCBwcmVmaXgudG9Mb3dlckNhc2UoKTtcblxuICAgICAgLy8gcmV0dXJuIHRoZSBob3N0IG9iamVjdCBtZW1iZXJcbiAgICAgIHJldHVybiBob3N0T2JqZWN0W3RhcmdldF0gPSBob3N0T2JqZWN0W3Rlc3ROYW1lXTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIGRldGVjdCBtb3ppbGxhICh5ZXMsIHRoaXMgZmVlbHMgZGlydHkpXG5kZXRlY3QubW96ID0gdHlwZW9mIG5hdmlnYXRvciAhPSAndW5kZWZpbmVkJyAmJiAhIW5hdmlnYXRvci5tb3pHZXRVc2VyTWVkaWE7XG5cbi8vIGluaXRpYWxpc2UgdGhlIHByZWZpeCBhcyB1bmtub3duXG5kZXRlY3QuYnJvd3NlciA9IHVuZGVmaW5lZDsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAgIyMgcnRjLWNvcmUvcmVzZXRcblxuICBUaGlzIGlzIGEgc2ltcGxlLCBjcm9zcy1icm93c2VyIG1ldGhvZCBmb3IgcmVzZXR0aW5nIGEgbWVkaWEgZWxlbWVudFxuICBiYWNrIHRvIGEgaW5pdGlhbCBzdGF0ZSBhZnRlciBoYXZpbmcgbWVkaWEgYXR0YWNoZWQuXG5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihlbCkge1xuICAvLyByZW1vdmUgdGhlIHNvdXJjZVxuICBlbC5zcmMgPSBudWxsO1xuXG4gIC8vIGNoZWNrIGZvciBtb3pcbiAgaWYgKGVsLm1velNyY09iamVjdCkge1xuICAgIGVsLm1velNyY09iamVjdCA9IG51bGw7XG4gIH1cblxuICAvLyBjaGVjayBmb3IgY3VycmVudFNyY1xuICBpZiAoZWwuY3VycmVudFNyYykge1xuICAgIGVsLmN1cnJlbnRTcmMgPSBudWxsO1xuICB9XG5cbiAgLy8gcmV0dXJuIHRoZSBpbnB1dCAobWFwIGZyaWVuZGx5KVxuICByZXR1cm4gZWw7XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4vKiBnbG9iYWwgbmF2aWdhdG9yOiBmYWxzZSAqL1xuLyogZ2xvYmFsIHdpbmRvdzogZmFsc2UgKi9cbi8qIGdsb2JhbCBkb2N1bWVudDogZmFsc2UgKi9cbi8qIGdsb2JhbCBNZWRpYVN0cmVhbTogZmFsc2UgKi9cbi8qIGdsb2JhbCBIVE1MVmlkZW9FbGVtZW50OiBmYWxzZSAqL1xuLyogZ2xvYmFsIEhUTUxBdWRpb0VsZW1lbnQ6IGZhbHNlICovXG5cbi8qKlxuICAjIHJ0Yy1tZWRpYVxuXG4gIFNpbXBsZSBbZ2V0VXNlck1lZGlhXShodHRwOi8vZGV2LnczLm9yZy8yMDExL3dlYnJ0Yy9lZGl0b3IvZ2V0dXNlcm1lZGlhLmh0bWwpXG4gIGNyb3NzLWJyb3dzZXIgd3JhcHBlcnMuICBQYXJ0IG9mIHRoZSBbcnRjLmlvXShodHRwOi8vcnRjLmlvLykgc3VpdGUsIHdoaWNoIGlzXG4gIHNwb25zb3JlZCBieSBbTklDVEFdKGh0dHA6Ly9vcGVubmljdGEuY29tKSBhbmQgcmVsZWFzZWQgdW5kZXIgYW5cbiAgW0FwYWNoZSAyLjAgbGljZW5zZV0oL0xJQ0VOU0UpLlxuXG4gICMjIEV4YW1wbGUgVXNhZ2VcblxuICBDYXB0dXJpbmcgbWVkaWEgb24geW91ciBtYWNoaW5lIGlzIGFzIHNpbXBsZSBhczpcblxuICBgYGBqc1xuICByZXF1aXJlKCdydGMtbWVkaWEnKSgpO1xuICBgYGBcblxuICBXaGlsZSB0aGlzIHdpbGwgaW4gZmFjdCBzdGFydCB0aGUgdXNlciBtZWRpYSBjYXB0dXJlIHByb2Nlc3MsIGl0IHdvbid0XG4gIGRvIGFueXRoaW5nIHdpdGggaXQuICBMZXRzIHRha2UgYSBsb29rIGF0IGEgbW9yZSByZWFsaXN0aWMgZXhhbXBsZTpcblxuICA8PDwgZXhhbXBsZXMvcmVuZGVyLXRvLWJvZHkuanNcblxuICBbcnVuIG9uIHJlcXVpcmViaW5dKGh0dHA6Ly9yZXF1aXJlYmluLmNvbS8/Z2lzdD02MDg1NDUwKVxuXG4gIEluIHRoZSBjb2RlIGFib3ZlLCB3ZSBhcmUgY3JlYXRpbmcgYSBuZXcgaW5zdGFuY2Ugb2Ygb3VyIHVzZXJNZWRpYSB3cmFwcGVyXG4gIHVzaW5nIHRoZSBgbWVkaWEoKWAgY2FsbCBhbmQgdGhlbiB0ZWxsaW5nIGl0IHRvIHJlbmRlciB0byB0aGVcbiAgYGRvY3VtZW50LmJvZHlgIG9uY2UgdmlkZW8gc3RhcnRzIHN0cmVhbWluZy4gIFdlIGNhbiBmdXJ0aGVyIGV4cGFuZCB0aGVcbiAgY29kZSBvdXQgdG8gdGhlIGZvbGxvd2luZyB0byBhaWQgb3VyIHVuZGVyc3RhbmRpbmcgb2Ygd2hhdCBpcyBnb2luZyBvbjpcblxuICA8PDwgZXhhbXBsZXMvY2FwdHVyZS1leHBsaWNpdC5qc1xuXG4gIFRoZSBjb2RlIGFib3ZlIGlzIHdyaXR0ZW4gaW4gYSBtb3JlIHRyYWRpdGlvbmFsIEpTIHN0eWxlLCBidXQgZmVlbCBmcmVlXG4gIHRvIHVzZSB0aGUgZmlyc3Qgc3R5bGUgYXMgaXQncyBxdWl0ZSBzYWZlICh0aGFua3MgdG8gc29tZSBjaGVja3MgaW4gdGhlXG4gIGNvZGUpLlxuXG4gICMjIyBFdmVudHNcblxuICBPbmNlIGEgbWVkaWEgb2JqZWN0IGhhcyBiZWVuIGNyZWF0ZWQsIGl0IHdpbGwgcHJvdmlkZSBhIG51bWJlciBvZiBldmVudHNcbiAgdGhyb3VnaCB0aGUgc3RhbmRhcmQgbm9kZSBFdmVudEVtaXR0ZXIgQVBJLlxuXG4gICMjIyMgYGNhcHR1cmVgXG5cbiAgVGhlIGBjYXB0dXJlYCBldmVudCBpcyB0cmlnZ2VyZWQgb25jZSB0aGUgcmVxdWVzdGVkIG1lZGlhIHN0cmVhbSBoYXNcbiAgYmVlbiBjYXB0dXJlZCBieSB0aGUgYnJvd3Nlci5cblxuICA8PDwgZXhhbXBsZXMvY2FwdHVyZS1ldmVudC5qc1xuXG4gICMjIyMgYHJlbmRlcmBcblxuICBUaGUgYHJlbmRlcmAgZXZlbnQgaXMgdHJpZ2dlcmVkIG9uY2UgdGhlIHN0cmVhbSBoYXMgYmVlbiByZW5kZXJlZFxuICB0byB0aGUgYW55IHN1cHBsaWVkIChvciBjcmVhdGVkKSB2aWRlbyBlbGVtZW50cy5cblxuICBXaGlsZSBpdCBtaWdodCBzZWVtIGEgbGl0dGxlIGNvbmZ1c2luZyB0aGF0IHdoZW4gdGhlIGByZW5kZXJgIGV2ZW50XG4gIGZpcmVzIHRoYXQgaXQgcmV0dXJucyBhbiBhcnJheSBvZiBlbGVtZW50cyByYXRoZXIgdGhhbiBhIHNpbmdsZSBlbGVtZW50XG4gICh3aGljaCBpcyB3aGF0IGlzIHByb3ZpZGVkIHdoZW4gY2FsbGluZyB0aGUgYHJlbmRlcmAgbWV0aG9kKS5cblxuICBUaGlzIG9jY3VycyBiZWNhdXNlIGl0IGlzIGNvbXBsZXRlbHkgdmFsaWQgdG8gcmVuZGVyIGEgc2luZ2xlIGNhcHR1cmVkXG4gIG1lZGlhIHN0cmVhbSB0byBtdWx0aXBsZSBtZWRpYSBlbGVtZW50cyBvbiBhIHBhZ2UuICBUaGUgYHJlbmRlcmAgZXZlbnRcbiAgaXMgcmVwb3J0aW5nIG9uY2UgdGhlIHJlbmRlciBvcGVyYXRpb24gaGFzIGNvbXBsZXRlZCBmb3IgYWxsIHRhcmdldHMgdGhhdFxuICBoYXZlIGJlZW4gcmVnaXN0ZXJlZCB3aXRoIHRoZSBjYXB0dXJlIHN0cmVhbS5cblxuICAjIyBSZWZlcmVuY2VcblxuKiovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIGRlYnVnID0gcmVxdWlyZSgnY29nL2xvZ2dlcicpKCdtZWRpYScpO1xudmFyIGV4dGVuZCA9IHJlcXVpcmUoJ2NvZy9leHRlbmQnKTtcbnZhciBkZXRlY3QgPSByZXF1aXJlKCdydGMtY29yZS9kZXRlY3QnKTtcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuLy8gbW9ua2V5IHBhdGNoIGdldFVzZXJNZWRpYSBmcm9tIHRoZSBwcmVmaXhlZCB2ZXJzaW9uXG5uYXZpZ2F0b3IuZ2V0VXNlck1lZGlhID0gbmF2aWdhdG9yLmdldFVzZXJNZWRpYSB8fFxuICBkZXRlY3QuY2FsbChuYXZpZ2F0b3IsICdnZXRVc2VyTWVkaWEnKTtcblxuLy8gcGF0Y2ggd2luZG93IHVybFxud2luZG93LlVSTCA9IHdpbmRvdy5VUkwgfHwgZGV0ZWN0KCdVUkwnKTtcblxuLy8gcGF0Y2ggbWVkaWEgc3RyZWFtXG53aW5kb3cuTWVkaWFTdHJlYW0gPSBkZXRlY3QoJ01lZGlhU3RyZWFtJyk7XG5cbi8qKlxuICAjIyMgbWVkaWFcblxuICBgYGBcbiAgbWVkaWEob3B0cz8pXG4gIGBgYFxuXG4gIENhcHR1cmUgbWVkaWEgdXNpbmcgdGhlIHVuZGVybHlpbmdcbiAgW2dldFVzZXJNZWRpYV0oaHR0cDovL3d3dy53My5vcmcvVFIvbWVkaWFjYXB0dXJlLXN0cmVhbXMvKSBBUEkuXG5cbiAgVGhlIGZ1bmN0aW9uIGFjY2VwdHMgYSBzaW5nbGUgYXJndW1lbnQgd2hpY2ggY2FuIGJlIGVpdGhlciBiZTpcblxuICAtIGEuIEFuIG9wdGlvbnMgb2JqZWN0IChzZWUgYmVsb3cpLCBvcjtcbiAgLSBiLiBBbiBleGlzdGluZ1xuICAgIFtNZWRpYVN0cmVhbV0oaHR0cDovL3d3dy53My5vcmcvVFIvbWVkaWFjYXB0dXJlLXN0cmVhbXMvI21lZGlhc3RyZWFtKSB0aGF0XG4gICAgdGhlIG1lZGlhIG9iamVjdCB3aWxsIGJpbmQgdG8gYW5kIHByb3ZpZGUgeW91IHNvbWUgRE9NIGhlbHBlcnMgZm9yLlxuXG4gIFRoZSBmdW5jdGlvbiBzdXBwb3J0cyB0aGUgZm9sbG93aW5nIG9wdGlvbnM6XG5cbiAgLSBgY2FwdHVyZWAgLSBXaGV0aGVyIGNhcHR1cmUgc2hvdWxkIGJlIGluaXRpYXRlZCBhdXRvbWF0aWNhbGx5LiBEZWZhdWx0c1xuICAgIHRvIHRydWUsIGJ1dCB0b2dnbGVkIHRvIGZhbHNlIGF1dG9tYXRpY2FsbHkgaWYgYW4gZXhpc3Rpbmcgc3RyZWFtIGlzXG4gICAgcHJvdmlkZWQuXG5cbiAgLSBgbXV0ZWRgIC0gV2hldGhlciB0aGUgdmlkZW8gZWxlbWVudCBjcmVhdGVkIGZvciB0aGlzIHN0cmVhbSBzaG91bGQgYmVcbiAgICBtdXRlZC4gIERlZmF1bHQgaXMgdHJ1ZSBidXQgaXMgc2V0IHRvIGZhbHNlIHdoZW4gYW4gZXhpc3Rpbmcgc3RyZWFtIGlzXG4gICAgcGFzc2VkLlxuXG4gIC0gYGNvbnN0cmFpbnRzYCAtIFRoZSBjb25zdHJhaW50IG9wdGlvbiBhbGxvd3MgeW91IHRvIHNwZWNpZnkgcGFydGljdWxhclxuICAgIG1lZGlhIGNhcHR1cmUgY29uc3RyYWludHMgd2hpY2ggY2FuIGFsbG93IHlvdSBkbyBkbyBzb21lIHByZXR0eSBjb29sXG4gICAgdHJpY2tzLiAgQnkgZGVmYXVsdCwgdGhlIGNvbnRyYWludHMgdXNlZCB0byByZXF1ZXN0IHRoZSBtZWRpYSBhcmVcbiAgICBmYWlybHkgc3RhbmRhcmQgZGVmYXVsdHM6XG5cbiAgICBgYGBqc1xuICAgICAge1xuICAgICAgICB2aWRlbzoge1xuICAgICAgICAgIG1hbmRhdG9yeToge30sXG4gICAgICAgICAgb3B0aW9uYWw6IFtdXG4gICAgICAgIH0sXG4gICAgICAgIGF1ZGlvOiB0cnVlXG4gICAgICB9XG4gICAgYGBgXG5cbioqL1xuZnVuY3Rpb24gTWVkaWEob3B0cykge1xuICBpZiAoISAodGhpcyBpbnN0YW5jZW9mIE1lZGlhKSkge1xuICAgIHJldHVybiBuZXcgTWVkaWEob3B0cyk7XG4gIH1cblxuICAvLyBpbmhlcml0ZWRcbiAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cbiAgLy8gaWYgdGhlIG9wdHMgaXMgYSBtZWRpYSBzdHJlYW0gaW5zdGFuY2UsIHRoZW4gaGFuZGxlIHRoYXQgYXBwcm9wcmlhdGVseVxuICBpZiAob3B0cyAmJiBvcHRzIGluc3RhbmNlb2YgTWVkaWFTdHJlYW0pIHtcbiAgICBvcHRzID0ge1xuICAgICAgc3RyZWFtOiBvcHRzLFxuICAgICAgY2FwdHVyZTogZmFsc2UsXG4gICAgICBtdXRlZDogZmFsc2VcbiAgICB9O1xuICB9XG5cbiAgLy8gaWYgd2UndmUgYmVlbiBwYXNzZWQgb3B0cyBhbmQgdGhleSBsb29rIGxpa2UgY29uc3RyYWludHMsIG1vdmUgdGhpbmdzXG4gIC8vIGFyb3VuZCBhIGxpdHRsZVxuICBpZiAob3B0cyAmJiAob3B0cy5hdWRpbyB8fCBvcHRzLnZpZGVvKSkge1xuICAgIG9wdHMgPSB7XG4gICAgICBjb25zdHJhaW50czogb3B0c1xuICAgIH07XG4gIH1cblxuICAvLyBlbnN1cmUgd2UgaGF2ZSBvcHRzXG4gIG9wdHMgPSBleHRlbmQoe30sIHtcbiAgICBjYXB0dXJlOiB0cnVlLFxuICAgIG11dGVkOiB0cnVlLFxuICAgIGNvbnN0cmFpbnRzOiB7XG4gICAgICB2aWRlbzoge1xuICAgICAgICBtYW5kYXRvcnk6IHt9LFxuICAgICAgICBvcHRpb25hbDogW11cbiAgICAgIH0sXG4gICAgICBhdWRpbzogdHJ1ZVxuICAgIH1cbiAgfSwgb3B0cyk7XG5cbiAgLy8gc2F2ZSB0aGUgY29uc3RyYWludHNcbiAgdGhpcy5jb25zdHJhaW50cyA9IG9wdHMuY29uc3RyYWludHM7XG5cbiAgLy8gaWYgYSBuYW1lIGhhcyBiZWVuIHNwZWNpZmllZCBpbiB0aGUgb3B0cywgc2F2ZSBpdCB0byB0aGUgbWVkaWFcbiAgdGhpcy5uYW1lID0gb3B0cy5uYW1lO1xuXG4gIC8vIGluaXRpYWxpc2UgdGhlIHN0cmVhbSB0byBudWxsXG4gIHRoaXMuc3RyZWFtID0gb3B0cy5zdHJlYW0gfHwgbnVsbDtcblxuICAvLyBpbml0aWFsaXNlIHRoZSBtdXRlZCBzdGF0ZVxuICB0aGlzLm11dGVkID0gdHlwZW9mIG9wdHMubXV0ZWQgPT0gJ3VuZGVmaW5lZCcgfHwgb3B0cy5tdXRlZDtcblxuICAvLyBjcmVhdGUgYSBiaW5kaW5ncyBhcnJheSBzbyB3ZSBoYXZlIGEgcm91Z2ggaWRlYSBvZiB3aGVyZVxuICAvLyB3ZSBoYXZlIGJlZW4gYXR0YWNoZWQgdG9cbiAgLy8gVE9ETzogcmV2aXNpdCB3aGV0aGVyIHRoaXMgaXMgdGhlIGJlc3Qgd2F5IHRvIG1hbmFnZSB0aGlzXG4gIHRoaXMuX2JpbmRpbmdzID0gW107XG5cbiAgLy8gaWYgd2UgYXJlIGF1dG9zdGFydGluZywgY2FwdHVyZSBtZWRpYSBvbiB0aGUgbmV4dCB0aWNrXG4gIGlmIChvcHRzLmNhcHR1cmUpIHtcbiAgICBzZXRUaW1lb3V0KHRoaXMuY2FwdHVyZS5iaW5kKHRoaXMpLCAwKTtcbiAgfVxufVxuXG51dGlsLmluaGVyaXRzKE1lZGlhLCBFdmVudEVtaXR0ZXIpO1xubW9kdWxlLmV4cG9ydHMgPSBNZWRpYTtcblxuLyoqXG4gICMjIyBjYXB0dXJlXG5cbiAgYGBgXG4gIGNhcHR1cmUoY29uc3RyYWludHMsIGNhbGxiYWNrKVxuICBgYGBcblxuICBDYXB0dXJlIG1lZGlhLiAgSWYgY29uc3RyYWludHMgYXJlIHByb3ZpZGVkLCB0aGVuIHRoZXkgd2lsbFxuICBvdmVycmlkZSB0aGUgZGVmYXVsdCBjb25zdHJhaW50cyB0aGF0IHdlcmUgdXNlZCB3aGVuIHRoZSBtZWRpYSBvYmplY3Qgd2FzXG4gIGNyZWF0ZWQuXG4qKi9cbk1lZGlhLnByb3RvdHlwZS5jYXB0dXJlID0gZnVuY3Rpb24oY29uc3RyYWludHMsIGNhbGxiYWNrKSB7XG4gIHZhciBtZWRpYSA9IHRoaXM7XG4gIHZhciBoYW5kbGVFbmQgPSB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZW5kJyk7XG5cbiAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgc3RyZWFtLCB0aGVuIGFib3J0XG4gIGlmICh0aGlzLnN0cmVhbSkgeyByZXR1cm47IH1cblxuICAvLyBpZiBubyBjb25zdHJhaW50cyBoYXZlIGJlZW4gcHJvdmlkZWQsIGJ1dCB3ZSBoYXZlXG4gIC8vIGEgY2FsbGJhY2ssIGRlYWwgd2l0aCBpdFxuICBpZiAodHlwZW9mIGNvbnN0cmFpbnRzID09ICdmdW5jdGlvbicpIHtcbiAgICBjYWxsYmFjayA9IGNvbnN0cmFpbnRzO1xuICAgIGNvbnN0cmFpbnRzID0gdGhpcy5jb25zdHJhaW50cztcbiAgfVxuXG4gIC8vIGlmIHdlIGhhdmUgYSBjYWxsYmFjaywgYmluZCB0byB0aGUgc3RhcnQgZXZlbnRcbiAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhpcy5vbmNlKCdjYXB0dXJlJywgY2FsbGJhY2suYmluZCh0aGlzKSk7XG4gIH1cblxuICAvLyBnZXQgdXNlciBtZWRpYSwgdXNpbmcgZWl0aGVyIHRoZSBwcm92aWRlZCBjb25zdHJhaW50cyBvciB0aGVcbiAgLy8gZGVmYXVsdCBjb25zdHJhaW50c1xuICBuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhKFxuICAgIGNvbnN0cmFpbnRzIHx8IHRoaXMuY29uc3RyYWludHMsXG4gICAgZnVuY3Rpb24oc3RyZWFtKSB7XG4gICAgICBpZiAodHlwZW9mIHN0cmVhbS5hZGRFdmVudExpc3RlbmVyID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgc3RyZWFtLmFkZEV2ZW50TGlzdGVuZXIoJ2VuZGVkJywgaGFuZGxlRW5kKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBzdHJlYW0ub25lbmRlZCA9IGhhbmRsZUVuZDtcbiAgICAgIH1cblxuICAgICAgLy8gc2F2ZSB0aGUgc3RyZWFtIGFuZCBlbWl0IHRoZSBzdGFydCBtZXRob2RcbiAgICAgIG1lZGlhLnN0cmVhbSA9IHN0cmVhbTtcbiAgICAgIG1lZGlhLmVtaXQoJ2NhcHR1cmUnLCBzdHJlYW0pO1xuICAgIH0sXG4gICAgdGhpcy5faGFuZGxlRmFpbC5iaW5kKHRoaXMpXG4gICk7XG59O1xuXG4vKipcbiAgIyMjIHJlbmRlclxuXG4gIGBgYGpzXG4gIHJlbmRlcih0YXJnZXQsIG9wdHM/LCBjYWxsYmFjaz8pXG4gIGBgYFxuXG4gIFJlbmRlciB0aGUgY2FwdHVyZWQgbWVkaWEgdG8gdGhlIHNwZWNpZmllZCB0YXJnZXQgZWxlbWVudC4gIFdoaWxlIHByZXZpb3VzXG4gIHZlcnNpb25zIG9mIHJ0Yy1tZWRpYSBhY2NlcHRlZCBhIHNlbGVjdG9yIHN0cmluZyBvciBhbiBhcnJheSBvZiBlbGVtZW50c1xuICB0aGlzIGhhcyBiZWVuIGRyb3BwZWQgaW4gZmF2b3VyIG9mIF9fb25lIHNpbmdsZSB0YXJnZXQgZWxlbWVudF9fLlxuXG4gIElmIHRoZSB0YXJnZXQgZWxlbWVudCBpcyBhIHZhbGlkIE1lZGlhRWxlbWVudCB0aGVuIGl0IHdpbGwgYmVjb21lIHRoZVxuICB0YXJnZXQgb2YgdGhlIGNhcHR1cmVkIG1lZGlhIHN0cmVhbS4gIElmLCBob3dldmVyLCBpdCBpcyBhIGdlbmVyaWMgRE9NXG4gIGVsZW1lbnQgaXQgd2lsbCBhIG5ldyBNZWRpYSBlbGVtZW50IHdpbGwgYmUgY3JlYXRlZCB0aGF0IHVzaW5nIHRoZSB0YXJnZXRcbiAgYXMgaXQncyBwYXJlbnQuXG5cbiAgQSBzaW1wbGUgZXhhbXBsZSBvZiByZXF1ZXN0aW5nIGRlZmF1bHQgbWVkaWEgY2FwdHVyZSBhbmQgcmVuZGVyaW5nIHRvIHRoZVxuICBkb2N1bWVudCBib2R5IGlzIHNob3duIGJlbG93OlxuXG4gIDw8PCBleGFtcGxlcy9yZW5kZXItdG8tYm9keS5qc1xuXG4gIFlvdSBtYXkgb3B0aW9uYWxseSBwcm92aWRlIGEgY2FsbGJhY2sgdG8gdGhpcyBmdW5jdGlvbiwgd2hpY2ggaXNcbiAgd2lsbCBiZSB0cmlnZ2VyZWQgb25jZSBlYWNoIG9mIHRoZSBtZWRpYSBlbGVtZW50cyBoYXMgc3RhcnRlZCBwbGF5aW5nXG4gIHRoZSBzdHJlYW06XG5cbiAgPDw8IGV4YW1wbGVzL3JlbmRlci1jYXB0dXJlLWNhbGxiYWNrLmpzXG5cbioqL1xuTWVkaWEucHJvdG90eXBlLnJlbmRlciA9IGZ1bmN0aW9uKHRhcmdldCwgb3B0cywgY2FsbGJhY2spIHtcbiAgLy8gaWYgdGhlIHRhcmdldCBpcyBhbiBhcnJheSwgZXh0cmFjdCB0aGUgZmlyc3QgZWxlbWVudFxuICBpZiAoQXJyYXkuaXNBcnJheSh0YXJnZXQpKSB7XG4gICAgLy8gbG9nIGEgd2FybmluZ1xuICAgIGNvbnNvbGUubG9nKCdXQVJOSU5HOiBydGMtbWVkaWEgcmVuZGVyIChhcyBvZiAxLngpIGV4cGVjdHMgYSBzaW5nbGUgdGFyZ2V0Jyk7XG4gICAgdGFyZ2V0ID0gdGFyZ2V0WzBdO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvcHRzID09ICdmdW5jdGlvbicpIHtcbiAgICBjYWxsYmFjayA9IG9wdHM7XG4gICAgb3B0cyA9IHt9O1xuICB9XG5cbiAgLy8gZW5zdXJlIHdlIGhhdmUgb3B0c1xuICBvcHRzID0gb3B0cyB8fCB7fTtcblxuICAvLyBjcmVhdGUgdGhlIHZpZGVvIC8gYXVkaW8gZWxlbWVudHNcbiAgdGFyZ2V0ID0gdGhpcy5fcHJlcGFyZUVsZW1lbnQob3B0cywgdGFyZ2V0KTtcblxuICAvLyBpZiBubyBzdHJlYW0gd2FzIHNwZWNpZmllZCwgd2FpdCBmb3IgdGhlIHN0cmVhbSB0byBpbml0aWFsaXplXG4gIGlmICghIHRoaXMuc3RyZWFtKSB7XG4gICAgdGhpcy5vbmNlKCdjYXB0dXJlJywgdGhpcy5fYmluZFN0cmVhbS5iaW5kKHRoaXMpKTtcbiAgfVxuICAvLyBvdGhlcndpc2UsIGJpbmQgdGhlIHN0cmVhbSBub3dcbiAgZWxzZSB7XG4gICAgdGhpcy5fYmluZFN0cmVhbSh0aGlzLnN0cmVhbSk7XG4gIH1cblxuICAvLyBpZiB3ZSBoYXZlIGEgY2FsbGJhY2sgdGhlbiB0cmlnZ2VyIG9uIHRoZSByZW5kZXIgZXZlbnRcbiAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhpcy5vbmNlKCdyZW5kZXInLCBjYWxsYmFjayk7XG4gIH1cblxuICByZXR1cm4gdGFyZ2V0O1xufTtcblxuLyoqXG4gICMjIyBzdG9wKClcblxuICBTdG9wIHRoZSBtZWRpYSBzdHJlYW1cbioqL1xuTWVkaWEucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbihvcHRzKSB7XG4gIHZhciBtZWRpYSA9IHRoaXM7XG5cbiAgaWYgKCEgdGhpcy5zdHJlYW0pIHsgcmV0dXJuOyB9XG5cbiAgLy8gcmVtb3ZlIGJpbmRpbmdzXG4gIHRoaXMuX3VuYmluZChvcHRzKTtcblxuICAvLyBzdG9wIHRoZSBzdHJlYW0sIGFuZCB0ZWxsIHRoZSB3b3JsZFxuICB0aGlzLnN0cmVhbS5zdG9wKCk7XG5cbiAgLy8gb24gY2FwdHVyZSByZWJpbmRcbiAgdGhpcy5vbmNlKCdjYXB0dXJlJywgbWVkaWEuX2JpbmRTdHJlYW0uYmluZChtZWRpYSkpO1xuXG4gIC8vIHJlbW92ZSB0aGUgcmVmZXJlbmNlIHRvIHRoZSBzdHJlYW1cbiAgdGhpcy5zdHJlYW0gPSBudWxsO1xufTtcblxuLyoqXG4gICMjIERlYnVnZ2luZyBUaXBzXG5cbiAgQ2hyb21lIGFuZCBDaHJvbWl1bSBjYW4gYm90aCBiZSBzdGFydGVkIHdpdGggdGhlIGZvbGxvd2luZyBmbGFnOlxuXG4gIGBgYFxuICAtLXVzZS1mYWtlLWRldmljZS1mb3ItbWVkaWEtc3RyZWFtXG4gIGBgYFxuXG4gIFRoaXMgdXNlcyBhIGZha2Ugc3RyZWFtIGZvciB0aGUgZ2V0VXNlck1lZGlhKCkgY2FsbCByYXRoZXIgdGhhbiBhdHRlbXB0aW5nXG4gIHRvIGNhcHR1cmUgdGhlIGFjdHVhbCBjYW1lcmEuICBUaGlzIGlzIHVzZWZ1bCB3aGVuIGRvaW5nIGF1dG9tYXRlZCB0ZXN0aW5nXG4gIGFuZCBhbHNvIGlmIHlvdSB3YW50IHRvIHRlc3QgY29ubmVjdGl2aXR5IGJldHdlZW4gdHdvIGJyb3dzZXIgaW5zdGFuY2VzIGFuZFxuICB3YW50IHRvIGRpc3Rpbmd1aXNoIGJldHdlZW4gdGhlIHR3byBsb2NhbCB2aWRlb3MuXG5cbiAgIyMgSW50ZXJuYWwgTWV0aG9kc1xuXG4gIFRoZXJlIGFyZSBhIG51bWJlciBvZiBpbnRlcm5hbCBtZXRob2RzIHRoYXQgYXJlIHVzZWQgaW4gdGhlIGBydGMtbWVkaWFgXG4gIGltcGxlbWVudGF0aW9uLiBUaGVzZSBhcmUgb3V0bGluZWQgYmVsb3csIGJ1dCBub3QgZXhwZWN0ZWQgdG8gYmUgb2ZcbiAgZ2VuZXJhbCB1c2UuXG5cbioqL1xuXG4vKipcbiAgIyMjIF9wcmVwYXJlRWxlbWVudChvcHRzLCBlbGVtZW50KVxuXG4gIFRoZSBwcmVwYXJlRWxlbWVudCBmdW5jdGlvbiBpcyB1c2VkIHRvIHByZXBhcmUgRE9NIGVsZW1lbnRzIHRoYXQgd2lsbFxuICByZWNlaXZlIHRoZSBtZWRpYSBzdHJlYW1zIG9uY2UgdGhlIHN0cmVhbSBoYXZlIGJlZW4gc3VjY2Vzc2Z1bGx5IGNhcHR1cmVkLlxuKiovXG5NZWRpYS5wcm90b3R5cGUuX3ByZXBhcmVFbGVtZW50ID0gZnVuY3Rpb24ob3B0cywgZWxlbWVudCkge1xuICB2YXIgcGFyZW50O1xuICB2YXIgdmFsaWRFbGVtZW50ID0gKGVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MVmlkZW9FbGVtZW50KSB8fFxuICAgICAgICAoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxBdWRpb0VsZW1lbnQpO1xuICB2YXIgcHJlc2VydmVBc3BlY3RSYXRpbyA9XG4gICAgICAgIHR5cGVvZiBvcHRzLnByZXNlcnZlQXNwZWN0UmF0aW8gPT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgICAgb3B0cy5wcmVzZXJ2ZUFzcGVjdFJhdGlvO1xuXG4gIC8vIHBlcmZvcm0gc29tZSBhZGRpdGlvbmFsIGNoZWNrcyBmb3IgdGhpbmdzIHRoYXQgXCJsb29rXCIgbGlrZSBhXG4gIC8vIG1lZGlhIGVsZW1lbnRcbiAgdmFsaWRFbGVtZW50ID0gdmFsaWRFbGVtZW50IHx8ICh0eXBlb2YgZWxlbWVudC5wbGF5ID09ICdmdW5jdGlvbicpICYmIChcbiAgICB0eXBlb2YgZWxlbWVudC5tb3pTcmNPYmplY3QgIT0gJ3VuZGVmaW5lZCcgfHxcbiAgICB0eXBlb2YgZWxlbWVudC5zcmMgIT0gJ3VuZGVmaW5lZCcpO1xuXG4gIC8vIGlmIHRoZSBlbGVtZW50IGlzIG5vdCBhIHZpZGVvIGVsZW1lbnQsIHRoZW4gY3JlYXRlIG9uZVxuICBpZiAoISB2YWxpZEVsZW1lbnQpIHtcbiAgICBwYXJlbnQgPSBlbGVtZW50O1xuXG4gICAgLy8gY3JlYXRlIGEgbmV3IHZpZGVvIGVsZW1lbnRcbiAgICAvLyBUT0RPOiBjcmVhdGUgYW4gYXBwcm9wcmlhdGUgZWxlbWVudCBiYXNlZCBvbiB0aGUgdHlwZXMgb2YgdHJhY2tzXG4gICAgLy8gYXZhaWxhYmxlXG4gICAgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG5cbiAgICAvLyBpZiB3ZSBhcmUgcHJlc2VydmluZyBhc3BlY3QgcmF0aW8gZG8gdGhhdCBub3dcbiAgICBpZiAocHJlc2VydmVBc3BlY3RSYXRpbykge1xuICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLCAnJyk7XG4gICAgfVxuXG4gICAgLy8gYWRkIHRvIHRoZSBwYXJlbnRcbiAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG4gICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtcGxheWluZycsIGZhbHNlKTtcbiAgfVxuXG4gIC8vIGlmIG11dGVkLCBpbmplY3QgdGhlIG11dGVkIGF0dHJpYnV0ZVxuICBpZiAoZWxlbWVudCAmJiB0aGlzLm11dGVkKSB7XG4gICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ211dGVkJywgJycpO1xuICB9XG5cbiAgLy8gZmxhZyB0aGUgZWxlbWVudCBhcyBib3VuZFxuICB0aGlzLl9iaW5kaW5ncy5wdXNoKHtcbiAgICBlbDogZWxlbWVudCxcbiAgICBvcHRzOiBvcHRzXG4gIH0pO1xuXG4gIHJldHVybiBlbGVtZW50O1xufTtcblxuLyoqXG4gICMjIyBfYmluZFN0cmVhbShzdHJlYW0pXG5cbiAgQmluZCBhIHN0cmVhbSB0byBwcmV2aW91c2x5IHByZXBhcmVkIERPTSBlbGVtZW50cy5cblxuKiovXG5NZWRpYS5wcm90b3R5cGUuX2JpbmRTdHJlYW0gPSBmdW5jdGlvbihzdHJlYW0pIHtcbiAgdmFyIG1lZGlhID0gdGhpcztcbiAgdmFyIGVsZW1lbnRzID0gW107XG4gIHZhciB3YWl0aW5nID0gW107XG5cbiAgZnVuY3Rpb24gY2hlY2tXYWl0aW5nKCkge1xuICAgIC8vIGlmIHdlIGhhdmUgbm8gd2FpdGluZyBlbGVtZW50cywgYnV0IHNvbWUgZWxlbWVudHNcbiAgICAvLyB0cmlnZ2VyIHRoZSBzdGFydCBldmVudFxuICAgIGlmICh3YWl0aW5nLmxlbmd0aCA9PT0gMCAmJiBlbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICBtZWRpYS5lbWl0KCdyZW5kZXInLCBlbGVtZW50c1swXSk7XG5cbiAgICAgIGVsZW1lbnRzLm1hcChmdW5jdGlvbihlbCkge1xuICAgICAgICBlbC5zZXRBdHRyaWJ1dGUoJ2RhdGEtcGxheWluZycsIHRydWUpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGxheWJhY2tTdGFydGVkKGV2dCkge1xuICAgIHZhciBlbCA9IGV2dC50YXJnZXQgfHwgZXZ0LnNyY0VsZW1lbnQ7XG4gICAgdmFyIHZpZGVvSW5kZXggPSBlbGVtZW50cy5pbmRleE9mKGVsKTtcblxuICAgIGlmICh2aWRlb0luZGV4ID49IDApIHtcbiAgICAgIHdhaXRpbmcuc3BsaWNlKHZpZGVvSW5kZXgsIDEpO1xuICAgIH1cblxuICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCBwbGF5YmFja1N0YXJ0ZWQpO1xuICAgIGNoZWNrV2FpdGluZygpO1xuICB9XG5cbiAgLy8gaXRlcmF0ZSB0aHJvdWdoIHRoZSBiaW5kaW5ncyBhbmQgYmluZCB0aGUgc3RyZWFtXG4gIGVsZW1lbnRzID0gdGhpcy5fYmluZGluZ3MubWFwKGZ1bmN0aW9uKGJpbmRpbmcpIHtcbiAgICAvLyBjaGVjayBmb3IgbW96U3JjT2JqZWN0XG4gICAgaWYgKHR5cGVvZiBiaW5kaW5nLmVsLm1velNyY09iamVjdCAhPSAndW5kZWZpbmVkJykge1xuICAgICAgYmluZGluZy5lbC5tb3pTcmNPYmplY3QgPSBzdHJlYW07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgYmluZGluZy5lbC5zcmMgPSBtZWRpYS5fY3JlYXRlT2JqZWN0VVJMKHN0cmVhbSkgfHwgc3RyZWFtO1xuICAgIH1cblxuICAgIC8vIGF0dGVtcHQgdG8gcGxheSB0aGUgdmlkZW9cbiAgICBpZiAodHlwZW9mIGJpbmRpbmcuZWwucGxheSA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBiaW5kaW5nLmVsLnBsYXkoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYmluZGluZy5lbDtcbiAgfSk7XG5cbiAgLy8gZmluZCB0aGUgZWxlbWVudHMgd2UgYXJlIHdhaXRpbmcgb25cbiAgd2FpdGluZyA9IGVsZW1lbnRzLmZpbHRlcihmdW5jdGlvbihlbCkge1xuICAgIHJldHVybiBlbC5yZWFkeVN0YXRlIDwgMzsgLy8gcmVhZHlzdGF0ZSA8IEhBVkVfRlVUVVJFX0RBVEFcbiAgfSk7XG5cbiAgLy8gd2FpdCBmb3IgYWxsIHRoZSB2aWRlbyBlbGVtZW50c1xuICB3YWl0aW5nLm1hcChmdW5jdGlvbihlbCkge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCBwbGF5YmFja1N0YXJ0ZWQsIGZhbHNlKTtcbiAgfSk7XG5cbiAgY2hlY2tXYWl0aW5nKCk7XG59O1xuXG4vKipcbiAgIyMjIF91bmJpbmQoKVxuXG4gIEdyYWNlZnVsbHkgZGV0YWNoIGVsZW1lbnRzIHRoYXQgYXJlIHVzaW5nIHRoZSBzdHJlYW0gZnJvbSB0aGVcbiAgY3VycmVudCBzdHJlYW0uXG4qKi9cbk1lZGlhLnByb3RvdHlwZS5fdW5iaW5kID0gZnVuY3Rpb24ob3B0cykge1xuICAvLyBlbnN1cmUgd2UgaGF2ZSBvcHRzXG4gIG9wdHMgPSBvcHRzIHx8IHt9O1xuXG4gIC8vIGl0ZXJhdGUgdGhyb3VnaCB0aGUgYmluZGluZ3MgYW5kIGRldGFjaCBzdHJlYW1zXG4gIHRoaXMuX2JpbmRpbmdzLmZvckVhY2goZnVuY3Rpb24oYmluZGluZykge1xuICAgIHZhciBlbGVtZW50ID0gYmluZGluZy5lbDtcblxuICAgIC8vIHJlbW92ZSB0aGUgc291cmNlXG4gICAgZWxlbWVudC5zcmMgPSBudWxsO1xuXG4gICAgLy8gY2hlY2sgZm9yIG1velxuICAgIGlmIChlbGVtZW50Lm1velNyY09iamVjdCkge1xuICAgICAgZWxlbWVudC5tb3pTcmNPYmplY3QgPSBudWxsO1xuICAgIH1cblxuICAgIC8vIGNoZWNrIGZvciBjdXJyZW50U3JjXG4gICAgaWYgKGVsZW1lbnQuY3VycmVudFNyYykge1xuICAgICAgZWxlbWVudC5jdXJyZW50U3JjID0gbnVsbDtcbiAgICB9XG4gIH0pO1xufTtcblxuLyoqXG4gICMjIyBfY3JlYXRlT2JqZWN0VXJsKHN0cmVhbSlcblxuICBUaGlzIG1ldGhvZCBpcyB1c2VkIHRvIGNyZWF0ZSBhbiBvYmplY3QgdXJsIHRoYXQgY2FuIGJlIGF0dGFjaGVkIHRvIGEgdmlkZW9cbiAgb3IgYXVkaW8gZWxlbWVudC4gIE9iamVjdCB1cmxzIGFyZSBjYWNoZWQgdG8gZW5zdXJlIG9ubHkgb25lIGlzIGNyZWF0ZWRcbiAgcGVyIHN0cmVhbS5cbioqL1xuTWVkaWEucHJvdG90eXBlLl9jcmVhdGVPYmplY3RVUkwgPSBmdW5jdGlvbihzdHJlYW0pIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gd2luZG93LlVSTC5jcmVhdGVPYmplY3RVUkwoc3RyZWFtKTtcbiAgfVxuICBjYXRjaCAoZSkge1xuICB9XG59O1xuXG4vKipcbiAgIyMjIF9oYW5kbGVTdWNjZXNzKHN0cmVhbSlcblxuICBIYW5kbGUgdGhlIHN1Y2Nlc3MgY29uZGl0aW9uIG9mIGEgYGdldFVzZXJNZWRpYWAgY2FsbC5cblxuKiovXG5NZWRpYS5wcm90b3R5cGUuX2hhbmRsZVN1Y2Nlc3MgPSBmdW5jdGlvbihzdHJlYW0pIHtcbiAgLy8gdXBkYXRlIHRoZSBhY3RpdmUgc3RyZWFtIHRoYXQgd2UgYXJlIGNvbm5lY3RlZCB0b1xuICB0aGlzLnN0cmVhbSA9IHN0cmVhbTtcblxuICAvLyBlbWl0IHRoZSBzdHJlYW0gZXZlbnRcbiAgdGhpcy5lbWl0KCdzdHJlYW0nLCBzdHJlYW0pO1xufTtcblxuLyoqXG4gICMjIyBfaGFuZGxlRmFpbChldnQpXG5cbiAgSGFuZGxlIHRoZSBmYWlsdXJlIGNvbmRpdGlvbiBvZiBhIGBnZXRVc2VyTWVkaWFgIGNhbGwuXG5cbioqL1xuTWVkaWEucHJvdG90eXBlLl9oYW5kbGVGYWlsID0gZnVuY3Rpb24oZXJyKSB7XG4gIHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZGVidWcgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJykoJ3J0Yy1zaWduYWxsZXItYW5ub3VuY2UnKTtcbnZhciBleHRlbmQgPSByZXF1aXJlKCdjb2cvZXh0ZW5kJyk7XG52YXIgcm9sZXMgPSBbJ2EnLCAnYiddO1xuXG4vKipcbiAgIyMjIGFubm91bmNlXG5cbiAgYGBgXG4gIC9hbm5vdW5jZXx7XCJpZFwiOiBcIi4uLlwiLCAuLi4gfVxuICBgYGBcblxuICBXaGVuIGFuIGFubm91bmNlIG1lc3NhZ2UgaXMgcmVjZWl2ZWQgYnkgdGhlIHNpZ25hbGxlciwgdGhlIGF0dGFjaGVkXG4gIG9iamVjdCBkYXRhIGlzIGRlY29kZWQgYW5kIHRoZSBzaWduYWxsZXIgZW1pdHMgYW4gYGFubm91bmNlYCBtZXNzYWdlLlxuXG4gICMjIyMgRXZlbnRzIFRyaWdnZXJlZCBpbiByZXNwb25zZSB0byBgL2Fubm91bmNlYFxuXG4gIFRoZXJlIGFyZSB0d28gZGlmZmVyZW50IHR5cGVzIG9mIGBwZWVyOmAgZXZlbnRzIHRoYXQgY2FuIGJlIHRyaWdnZXJlZFxuICBpbiBvbiBwZWVyIEIgdG8gY2FsbGluZyB0aGUgYGFubm91bmNlYCBtZXRob2Qgb24gcGVlciBBLlxuXG4gIC0gYHBlZXI6YW5ub3VuY2VgXG5cbiAgICBUaGUgYHBlZXI6YW5ub3VuY2VgIGV2ZW50IGlzIHRyaWdnZXJlZCB3aGVuIGEgbmV3IHBlZXIgaGFzIGJlZW5cbiAgICBkaXNjb3ZlcmVkLiAgVGhlIGRhdGEgZm9yIHRoZSBuZXcgcGVlciAoYXMgYW4gSlMgb2JqZWN0KSBpcyBwcm92aWRlZFxuICAgIGFzIHRoZSBmaXJzdCBhcmd1bWVudCBvZiB0aGUgZXZlbnQgaGFuZGxlci5cblxuICAtIGBwZWVyOnVwZGF0ZWBcblxuICAgIElmIGEgcGVlciBcInJlYW5ub3VuY2VzXCIgdGhlbiBhIGBwZWVyOnVwZGF0ZWAgZXZlbnQgd2lsbCBiZSB0cmlnZ2VyZWRcbiAgICByYXRoZXIgdGhhbiBhIGBwZWVyOmFubm91bmNlYCBldmVudC5cblxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNpZ25hbGxlcikge1xuXG4gIGZ1bmN0aW9uIGNvcHlEYXRhKHRhcmdldCwgc291cmNlKSB7XG4gICAgaWYgKHRhcmdldCAmJiBzb3VyY2UpIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBzb3VyY2UpIHtcbiAgICAgICAgaWYgKGtleSAhPSAnY2xvY2snKSB7XG4gICAgICAgICAgdGFyZ2V0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0YXJnZXQ7XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24oYXJncywgbWVzc2FnZVR5cGUsIGNsb2NrKSB7XG4gICAgdmFyIGRhdGEgPSBhcmdzWzBdO1xuICAgIHZhciBwZWVyO1xuXG4gICAgLy8gaWYgd2UgaGF2ZSB2YWxpZCBkYXRhIHRoZW4gcHJvY2Vzc1xuICAgIGlmIChkYXRhICYmIGRhdGEuaWQpIHtcbiAgICAgIC8vIGNoZWNrIHRvIHNlZSBpZiB0aGlzIGlzIGEga25vd24gcGVlclxuICAgICAgcGVlciA9IHNpZ25hbGxlci5wZWVycy5nZXQoZGF0YS5pZCk7XG5cbiAgICAgIC8vIGlmIHRoZSBwZWVyIGlzIGV4aXN0aW5nLCB0aGVuIHVwZGF0ZSB0aGUgZGF0YVxuICAgICAgaWYgKHBlZXIpIHtcbiAgICAgICAgZGVidWcoJ3NpZ25hbGxlcjogJyArIHNpZ25hbGxlci5pZCArICcgcmVjZWl2ZWQgdXBkYXRlLCBkYXRhOiAnLCBkYXRhKTtcblxuICAgICAgICAvLyB1cGRhdGUgdGhlIGRhdGFcbiAgICAgICAgY29weURhdGEocGVlci5kYXRhLCBkYXRhKTtcblxuICAgICAgICAvLyB0cmlnZ2VyIHRoZSBwZWVyIHVwZGF0ZSBldmVudFxuICAgICAgICByZXR1cm4gc2lnbmFsbGVyLmVtaXQoJ3BlZXI6dXBkYXRlJywgZGF0YSk7XG4gICAgICB9XG5cbiAgICAgIC8vIGNyZWF0ZSBhIG5ldyBwZWVyXG4gICAgICBwZWVyID0ge1xuICAgICAgICBpZDogZGF0YS5pZCxcblxuICAgICAgICAvLyBpbml0aWFsaXNlIHRoZSBsb2NhbCByb2xlIGluZGV4XG4gICAgICAgIHJvbGVJZHg6IFtkYXRhLmlkLCBzaWduYWxsZXIuaWRdLnNvcnQoKS5pbmRleE9mKGRhdGEuaWQpLFxuXG4gICAgICAgIC8vIGluaXRpYWxpc2UgdGhlIHZlY3RvciBjbG9ja1xuICAgICAgICBjbG9jazogY2xvY2sgfHwgeyBhOiAwLCBiOiAwIH0sXG5cbiAgICAgICAgLy8gaW5pdGlhbGlzZSB0aGUgcGVlciBkYXRhXG4gICAgICAgIGRhdGE6IHt9XG4gICAgICB9O1xuXG4gICAgICAvLyBpbml0aWFsaXNlIHRoZSBwZWVyIGRhdGFcbiAgICAgIGNvcHlEYXRhKHBlZXIuZGF0YSwgZGF0YSk7XG5cbiAgICAgIC8vIHNldCB0aGUgcGVlciBkYXRhXG4gICAgICBzaWduYWxsZXIucGVlcnMuc2V0KGRhdGEuaWQsIHBlZXIpO1xuXG4gICAgICAvLyBpZiB0aGlzIGlzIGFuIGluaXRpYWwgYW5ub3VuY2UgbWVzc2FnZSAobm8gdmVjdG9yIGNsb2NrIGF0dGFjaGVkKVxuICAgICAgLy8gdGhlbiBzZW5kIGEgYW5ub3VuY2UgcmVwbHlcbiAgICAgIGlmICghIGNsb2NrKSB7XG4gICAgICAgIHNpZ25hbGxlclxuICAgICAgICAgIC50byhkYXRhLmlkKVxuICAgICAgICAgIC5zZW5kKCcvYW5ub3VuY2UnLCBzaWduYWxsZXIuYXR0cmlidXRlcyk7XG4gICAgICB9XG5cbiAgICAgIC8vIGVtaXQgYSBuZXcgcGVlciBhbm5vdW5jZSBldmVudFxuICAgICAgcmV0dXJuIHNpZ25hbGxlci5lbWl0KCdwZWVyOmFubm91bmNlJywgZGF0YSwgcGVlcik7XG4gICAgfVxuICB9O1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAgIyMgc2lnbmFsbGVyIG1lc3NhZ2UgaGFuZGxlcnNcblxuKiovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oc2lnbmFsbGVyKSB7XG4gIHJldHVybiB7XG4gICAgYW5ub3VuY2U6IHJlcXVpcmUoJy4vYW5ub3VuY2UnKShzaWduYWxsZXIpLFxuICAgIGxlYXZlOiByZXF1aXJlKCcuL2xlYXZlJykoc2lnbmFsbGVyKSxcbiAgICBsb2NrOiByZXF1aXJlKCcuL2xvY2snKShzaWduYWxsZXIpLFxuICAgIHVubG9jazogcmVxdWlyZSgnLi91bmxvY2snKShzaWduYWxsZXIpXG4gIH07XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICAjIyMgbGVhdmVcblxuICBgYGBcbiAgL2xlYXZlfHtcImlkXCI6XCIuLi5cIn1cbiAgYGBgXG5cbiAgV2hlbiBhIGxlYXZlIG1lc3NhZ2UgaXMgcmVjZWl2ZWQgZnJvbSBhIHBlZXIsIHdlIGNoZWNrIHRvIHNlZSBpZiB0aGF0IGlzXG4gIGEgcGVlciB0aGF0IHdlIGFyZSBtYW5hZ2luZyBzdGF0ZSBpbmZvcm1hdGlvbiBmb3IgYW5kIGlmIHdlIGFyZSB0aGVuIHRoZVxuICBwZWVyIHN0YXRlIGlzIHJlbW92ZWQuXG5cbiAgIyMjIyBFdmVudHMgdHJpZ2dlcmVkIGluIHJlc3BvbnNlIHRvIGAvbGVhdmVgIG1lc3NhZ2VzXG5cbiAgVGhlIGZvbGxvd2luZyBldmVudChzKSBhcmUgdHJpZ2dlcmVkIHdoZW4gYSBgL2xlYXZlYCBhY3Rpb24gaXMgcmVjZWl2ZWRcbiAgZnJvbSBhIHBlZXIgc2lnbmFsbGVyOlxuXG4gIC0gYHBlZXI6bGVhdmVgXG5cbiAgICBUaGUgYHBlZXI6bGVhdmVgIGV2ZW50IGlzIGVtaXR0ZWQgb25jZSBhIGAvbGVhdmVgIG1lc3NhZ2UgaXMgY2FwdHVyZWRcbiAgICBmcm9tIGEgcGVlci4gIFByaW9yIHRvIHRoZSBldmVudCBiZWluZyBkaXNwYXRjaGVkLCB0aGUgaW50ZXJuYWwgcGVlcnNcbiAgICBkYXRhIGluIHRoZSBzaWduYWxsZXIgaXMgcmVtb3ZlZCBidXQgY2FuIGJlIGFjY2Vzc2VkIGluIDJuZCBhcmd1bWVudFxuICAgIG9mIHRoZSBldmVudCBoYW5kbGVyLlxuXG4qKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oc2lnbmFsbGVyKSB7XG4gIHJldHVybiBmdW5jdGlvbihhcmdzKSB7XG4gICAgdmFyIGRhdGEgPSBhcmdzWzBdO1xuICAgIHZhciBwZWVyID0gc2lnbmFsbGVyLnBlZXJzLmdldChkYXRhICYmIGRhdGEuaWQpO1xuXG4gICAgLy8gcmVtb3ZlIHRoZSBwZWVyIGZyb20gdGhlIHBlZXJzIGRhdGFcbiAgICBpZiAocGVlcikge1xuICAgICAgc2lnbmFsbGVyLnBlZXJzLmRlbGV0ZShkYXRhLmlkKTtcbiAgICB9XG5cbiAgICAvLyBlbWl0IHRoZSBldmVudFxuICAgIHNpZ25hbGxlci5lbWl0KCdwZWVyOmxlYXZlJywgZGF0YS5pZCwgcGVlcik7XG4gIH07XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKSgncnRjLXNpZ25hbGxlci1sb2NrJyk7XG52YXIgdmMgPSByZXF1aXJlKCd2ZWN0b3JjbG9jaycpO1xudmFyIEZhc3RNYXAgPSByZXF1aXJlKCdjb2xsZWN0aW9ucy9mYXN0LW1hcCcpO1xuXG4vKipcbiAgIyMjIGxvY2tcblxuICBgYGBcbiAgL2xvY2tcbiAgYGBgXG5cbiAgQSBgL2xvY2tgIHJlcXVlc3QgY2FuIG9ubHkgYmUgc2VudCB3aXRoaW4gdGhlIGNvbnRleHQgb2YgYSBgL3RvYCBtZXNzYWdlXG4gIGFuZCB0aHVzIG11c3QgY29udGFpbiBzb3VyY2UgZGF0YSB0byBiZSBwcm9jZXNzZWQgY29ycmVjdGx5LiAgVGhlIGAvbG9ja2BcbiAgbWVzc2FnZSBpcyB1c2VkIHRvIGNvb3JkaW5hdGUgYmV0d2VuIHR3byByZW1vdGUgcGVlcnMgaW4gdGhlIGNhc2UgdGhhdFxuICBib3RoIHBlZXJzIHdoaWNoIHRvIGNvbW1lbmNlIHJlbmVnb3RpYXRpb24gYXQgdGhlIHNhbWUgdGltZS5cblxuICBJbiB0aGUgY2FzZSB0aGF0IHR3byBwZWVycyBhdHRlbXB0IHRvIHJlbmVnb3RpYXRlIHdpdGggZWFjaCBvdGhlciBhdCB0aGVcbiAgc2FtZSB0aW1lLCB0aGVuIHRoZSBwZWVyIHRoYXQgaGFzIGJlZW4gaWRlbnRpZmllZCBhcyBwYXJ0eSBgYWAgaW4gdGhlIHBlZXJcbiAgcmVsYXRpb25zaGlwIHdpbGwgdGFrZSBvbiB0aGUgcm9sZSBvZiB0aGUgaW5pdGlhdG9yIGluIHRoZSBuZWdvdGlhdGlvbiBhbmRcbiAgcGFydHkgYGJgIHdpbGwgcmVzcG9uZCB0byB0aGUgb2ZmZXIgc2RwLlxuXG4qKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oc2lnbmFsbGVyKSB7XG4gIHJldHVybiBmdW5jdGlvbihhcmdzLCBtZXNzYWdlVHlwZSwgY2xvY2ssIHNyY1N0YXRlKSB7XG4gICAgdmFyIGNsb2NrQ29tcGFyaXNvbjtcbiAgICB2YXIgc3VjY2VzcyA9IGZhbHNlO1xuICAgIHZhciBsYWJlbCA9IGFyZ3NbMF07XG5cbiAgICAvLyBpZiB3ZSBkb24ndCBoYXZlIGEgY2xvY2sgdmFsdWUgb3IgZG9uJ3Qga25vdyBhYm91dCB0aGUgc291cmNlXG4gICAgLy8gdGhlbiBqdXN0IGRyb3AgdGhlIG1lc3NhZ2VcbiAgICBpZiAoKCEgY2xvY2spIHx8ICghIHNyY1N0YXRlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGRlYnVnKCdyZWNlaXZlZCBcIicgKyBsYWJlbCArICdcIiBsb2NrIHJlcXVlc3QgZnJvbSBzcmM6ICcgKyBzcmNTdGF0ZS5pZCk7XG4gICAgY2xvY2tDb21wYXJpc29uID0gdmMuY29tcGFyZShjbG9jaywgc3JjU3RhdGUuY2xvY2spO1xuXG4gICAgLy8gaWYgdGhlIHJlbW90ZSBjbG9jayBpcyBncmVhdGVyIHRoYW4gdGhlIGxvY2sgY2xvY2sgc3RhdGVcbiAgICAvLyB0aGVuIHRoZSBsb2NrIGlzIGF1dG9tYXRpY2FsbHkgc3VjY2Vzc2Z1bFxuICAgIHN1Y2Nlc3MgPSAoISBzaWduYWxsZXIubG9ja3MuZ2V0KGxhYmVsKSkgfHxcbiAgICAgIGNsb2NrQ29tcGFyaXNvbiA+IDAgfHxcbiAgICAgIChjbG9ja0NvbXBhcmlzb24gPT09IDAgJiYgc3JjU3RhdGUucm9sZUlkeCA9PT0gMCk7XG5cbiAgICBkZWJ1Zygnc2lnbmFsbGVyICcgKyBzaWduYWxsZXIuaWQgKyAnIGNoZWNraW5nIGxvY2sgc3RhdGUnKTtcbiAgICBkZWJ1ZygnY2xvY2sgdmFsdWUgaW4gbWVzc2FnZTogJywgY2xvY2spO1xuICAgIGRlYnVnKCdjYWNoZWQgcGVlciBjbG9jayBzdGF0ZTogJywgc3JjU3RhdGUuY2xvY2spO1xuICAgIGRlYnVnKCdjbG9jayBjb21wYXJpc29uID0gJyArIGNsb2NrQ29tcGFyaXNvbiArICcgb2s6ICcgKyBzdWNjZXNzLCBzcmNTdGF0ZSk7XG5cbiAgICAvLyBpZiB0aGUgbG9jayBpcyBzdWNjZXNzZnVsLCB0aGVuIGFkZCB0aGUgbG9jayBpbmZvIHRvIHRoZSBzcmNTdGF0ZVxuICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAvLyBlbnN1cmUgd2UgaGF2ZSBhIGxvY2tzIG1lbWJlclxuICAgICAgc3JjU3RhdGUubG9ja3MgPSBzcmNTdGF0ZS5sb2NrcyB8fCBuZXcgRmFzdE1hcCgpO1xuXG4gICAgICAvLyBjcmVhdGUgdGhlIGxvY2tcbiAgICAgIHNyY1N0YXRlLmxvY2tzLnNldChsYWJlbCwgeyBpZDogYXJnc1sxXSB8fCAnJyB9KTtcbiAgICB9XG5cbiAgICAvLyBzZW5kIHRoZSBsb2NrIHJlc3VsdFxuICAgIHNpZ25hbGxlci50byhzcmNTdGF0ZS5pZCkuc2VuZCgnL2xvY2tyZXN1bHQnLCB7XG4gICAgICBsYWJlbDogbGFiZWwsXG4gICAgICBvazogc3VjY2Vzc1xuICAgIH0pO1xuICB9O1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZGVidWcgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJykoJ3J0Yy1zaWduYWxsZXItbG9jaycpO1xudmFyIHZjID0gcmVxdWlyZSgndmVjdG9yY2xvY2snKTtcblxuLyoqXG4gICMjIyB1bmxvY2tcblxuICBgYGBcbiAgL3VubG9ja3xsYWJlbFxuICBgYGBcblxuICBDbGVhciBhIHJlbW90ZSBsb2NrXG5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzaWduYWxsZXIpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGFyZ3MsIG1lc3NhZ2VUeXBlLCBjbG9jaywgc3JjU3RhdGUpIHtcbiAgICB2YXIgbGFiZWwgPSBhcmdzWzBdO1xuICAgIHZhciBvayA9IGZhbHNlO1xuXG4gICAgLy8gaWYgd2UgZG9uJ3QgaGF2ZSBhIGNsb2NrIHZhbHVlIG9yIGRvbid0IGtub3cgYWJvdXQgdGhlIHNvdXJjZVxuICAgIC8vIHRoZW4ganVzdCBkcm9wIHRoZSBtZXNzYWdlXG4gICAgaWYgKCghIGNsb2NrKSB8fCAoISBzcmNTdGF0ZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBkZWJ1ZygncmVjZWl2ZWQgXCInICsgbGFiZWwgKyAnXCIgdW5sb2NrIHJlcXVlc3QgZnJvbSBzcmM6ICcgKyBzcmNTdGF0ZS5pZCk7XG5cbiAgICAvLyBpZiB0aGUgcGVlciBoYXMgYW4gYWN0aXZlIGxvY2ssIHJlbW92ZSBpdFxuICAgIGlmIChzcmNTdGF0ZS5sb2Nrcykge1xuICAgICAgLy8gVE9ETzogY2hlY2sgZm9yIGEgbWF0Y2hpbmcgbG9ja2lkXG4gICAgICBzcmNTdGF0ZS5sb2Nrcy5kZWxldGUobGFiZWwpO1xuICAgICAgb2sgPSB0cnVlO1xuICAgIH1cblxuICAgIC8vIHNlbmQgdGhlIGxvY2sgbWVzc2FnZVxuICAgIHNpZ25hbGxlci50byhzcmNTdGF0ZS5pZCkuc2VuZCgnL3VubG9ja3Jlc3VsdCcsIHtcbiAgICAgIGxhYmVsOiBsYWJlbCxcbiAgICAgIG9rOiBva1xuICAgIH0pO1xuICB9O1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZGVidWcgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJykoJ3J0Yy1zaWduYWxsZXInKTtcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgdXVpZCA9IHJlcXVpcmUoJ3V1aWQnKTtcbnZhciBleHRlbmQgPSByZXF1aXJlKCdjb2cvZXh0ZW5kJyk7XG52YXIgRmFzdE1hcCA9IHJlcXVpcmUoJ2NvbGxlY3Rpb25zL2Zhc3QtbWFwJyk7XG52YXIgdmMgPSByZXF1aXJlKCd2ZWN0b3JjbG9jaycpO1xuXG4vKipcbiAgIyBydGMtc2lnbmFsbGVyXG5cbiAgVGhlIGBydGMtc2lnbmFsbGVyYCBtb2R1bGUgcHJvdmlkZXMgYSB0cmFuc3BvcnRsZXNzIHNpZ25hbGxpbmdcbiAgbWVjaGFuaXNtIGZvciBXZWJSVEMuXG5cbiAgIyMgUHVycG9zZVxuXG4gIFRoZSBzaWduYWxsZXIgcHJvdmlkZXMgc2V0IG9mIGNsaWVudC1zaWRlIHRvb2xzIHRoYXQgYXNzaXN0IHdpdGggdGhlXG4gIHNldHRpbmcgdXAgYW4gYFBlZXJDb25uZWN0aW9uYCBhbmQgaGVscGluZyB0aGVtIGNvbW11bmljYXRlLiBBbGwgdGhhdCBpc1xuICByZXF1aXJlZCBmb3IgdGhlIHNpZ25hbGxlciB0byBvcGVyYXRlIGlzIGEgc3VpdGFibGUgbWVzc2VuZ2VyLlxuXG4gIEEgbWVzc2VuZ2VyIGlzIGEgc2ltcGxlIG9iamVjdCB0aGF0IGltcGxlbWVudHMgbm9kZVxuICBbRXZlbnRFbWl0dGVyXShodHRwOi8vbm9kZWpzLm9yZy9hcGkvZXZlbnRzLmh0bWwpIHN0eWxlIGBvbmAgZXZlbnRzIGZvclxuICBgb3BlbmAsIGBjbG9zZWAsIGBtZXNzYWdlYCBldmVudHMsIGFuZCBhbHNvIGEgYHNlbmRgIG1ldGhvZCBieSB3aGljaFxuICBkYXRhIHdpbGwgYmUgc2VuZCBcIm92ZXItdGhlLXdpcmVcIi5cblxuICBCeSB1c2luZyB0aGlzIGFwcHJvYWNoLCB3ZSBjYW4gY29uZHVjdCBzaWduYWxsaW5nIG92ZXIgYW55IG51bWJlciBvZlxuICBtZWNoYW5pc21zOlxuXG4gIC0gbG9jYWwsIGluIG1lbW9yeSBtZXNzYWdlIHBhc3NpbmdcbiAgLSB2aWEgV2ViU29ja2V0cyBhbmQgaGlnaGVyIGxldmVsIGFic3RyYWN0aW9ucyAoc3VjaCBhc1xuICAgIFtwcmltdXNdKGh0dHBzOi8vZ2l0aHViLmNvbS9wcmltdXMvcHJpbXVzKSlcbiAgLSBhbHNvIG92ZXIgV2ViUlRDIGRhdGEtY2hhbm5lbHMgKHZlcnkgbWV0YSwgYW5kIGFkbWl0dGVkbHkgYSBsaXR0bGVcbiAgICBjb21wbGljYXRlZCkuXG5cbiAgIyMgR2V0dGluZyBTdGFydGVkXG5cbiAgVG8gd29yayB3aXRoIHRoZSBzaWduYWxsZXIsIHlvdSBmaXJzdCBuZWVkIGEgbWVzc2VuZ2VyIG9mIHNvbWUga2luZC4gSWYgeW91XG4gIGhhdmUgcnVuIHVwIGEgdmVyc2lvbiBvZiB0aGVcbiAgW3J0Yy1zd2l0Y2hib2FyZF0oaHR0cHM6Ly9naXRodWIuY29tL3J0Yy1pby9ydGMtc3dpdGNoYm9hcmQpIHNvbWV3aGVyZSB0aGVuXG4gIHRoZSBmb2xsb3dpbmcgZXhhbXBsZSBzaG91bGQgd29yazpcblxuICA8PDwgZXhhbXBsZXMvc2lnbmFsbGluZy12aWEtc3dpdGNoYm9hcmQuanNcblxuICBXaGlsZSB0aGUgZXhhbXBsZSBhYm92ZSBkZW1vbnN0cmF0ZXMgY29tbXVuaWNhdGlvbiBiZXR3ZWVuIHR3byBlbmRwb2ludHNcbiAgdmlhIHdlYnNvY2tldHMsIGl0IGRvZXMgbm90IGdvIGludG8gZGV0YWlsIG9uIHNldHRpbmcgdXAgYSBXZWJSVEMgcGVlclxuICBjb25uZWN0aW9uIChhcyB0aGF0IGlzIHNpZ25pZmljYW50bHkgbW9yZSBpbnZvbHZlZCkuICBJZiB5b3UgYXJlIGxvb2tpbmcgZm9yXG4gIGFuIGVhc3kgd2F5IHRvIGRvIHRoaXMsIEknZCByZWNvbW1lbmQgY2hlY2tpbmcgb3V0XG4gIFtydGMtcXVpY2tjb25uZWN0XShodHRwczovL2dpdGh1Yi5jb20vcnRjLWlvL3J0Yy1xdWlja2Nvbm5lY3QpIG9yXG4gIFtydGMtZ2x1ZV0oaHR0cHM6Ly9naXRodWIuY29tL3J0Yy1pby9ydGMtZ2x1ZSkuXG5cbiAgIyMgU2lnbmFsIEZsb3cgRGlhZ3JhbXNcblxuICBEaXNwbGF5ZWQgYmVsb3cgYXJlIHNvbWUgZGlhZ3JhbXMgaG93IHRoZSBzaWduYWxsaW5nIGZsb3cgYmV0d2VlbiBwZWVyc1xuICBiZWhhdmVzLiAgSW4gZWFjaCBvZiB0aGUgZGlhZ3JhbXMgd2UgaWxsdXN0cmF0ZSB0aHJlZSBwZWVycyAoQSwgQiBhbmQgQylcbiAgcGFydGljaXBhdGluZyBkaXNjb3ZlcnkgYW5kIGNvb3JkaW5hdGluZyBSVENQZWVyQ29ubmVjdGlvbiBoYW5kc2hha2VzLlxuXG4gIEluIGVhY2ggY2FzZSwgb25seSB0aGUgaW50ZXJhY3Rpb24gYmV0d2VlbiB0aGUgY2xpZW50cyBpcyByZXByZXNlbnRlZCBub3RcbiAgaG93IGEgc2lnbmFsbGluZyBzZXJ2ZXJcbiAgKHN1Y2ggYXMgW3J0Yy1zd2l0Y2hib2FyZF0oaHR0cHM6Ly9naXRodWIuY29tL3J0Yy1pby9ydGMtc3dpdGNoYm9hcmQpKSB3b3VsZFxuICBwYXNzIG9uIGJyb2FkY2FzdCBtZXNzYWdlcywgZXRjLiAgVGhpcyBpcyBkb25lIGZvciB0d28gcmVhc29uczpcblxuICAxLiBJdCBpcyBvdXQgb2Ygc2NvcGUgb2YgdGhpcyBkb2N1bWVudGF0aW9uLlxuICAyLiBUaGUgYHJ0Yy1zaWduYWxsZXJgIGhhcyBiZWVuIGRlc2lnbmVkIHRvIHdvcmsgd2l0aG91dCBoYXZpbmcgdG8gcmVseSBvblxuICAgICBhbnkgaW50ZWxsaWdlbmNlIGluIHRoZSBzZXJ2ZXIgc2lkZSBzaWduYWxsaW5nIGNvbXBvbmVudC4gIEluIHRoZVxuICAgICBpbnN0YW5jZSB0aGF0IGEgc2lnbmFsbGVyIGJyb2FkY2FzdHMgYWxsIG1lc3NhZ2VzIHRvIGFsbCBjb25uZWN0ZWQgcGVlcnNcbiAgICAgdGhlbiBgcnRjLXNpZ25hbGxlcmAgc2hvdWxkIGJlIHNtYXJ0IGVub3VnaCB0byBtYWtlIHN1cmUgZXZlcnl0aGluZyB3b3Jrc1xuICAgICBhcyBleHBlY3RlZC5cblxuICAjIyMgUGVlciBEaXNjb3ZlcnkgLyBBbm5vdW5jZW1lbnRcblxuICBUaGlzIGRpYWdyYW0gaWxsdXN0cmF0ZXMgdGhlIHByb2Nlc3Mgb2YgaG93IHBlZXIgYEFgIGFubm91bmNlcyBpdHNlbGYgdG9cbiAgcGVlcnMgYEJgIGFuZCBgQ2AsIGFuZCBpbiB0dXJuIHRoZXkgYW5ub3VuY2UgdGhlbXNlbHZlcy5cblxuICAhW10oaHR0cHM6Ly9yYXcuZ2l0aHViLmNvbS9ydGMtaW8vcnRjLXNpZ25hbGxlci9tYXN0ZXIvZG9jcy9hbm5vdW5jZS5wbmcpXG5cbiAgIyMjIEVkaXRpbmcgLyBVcGRhdGluZyB0aGUgRGlhZ3JhbXNcblxuICBFYWNoIG9mIHRoZSBkaWFncmFtcyBoYXMgYmVlbiBnZW5lcmF0ZWQgdXNpbmdcbiAgW21zY2dlbl0oaHR0cDovL3d3dy5tY3Rlcm5hbi5tZS51ay9tc2NnZW4vaW5kZXguaHRtbCkgYW5kIHRoZSBzb3VyY2UgZm9yXG4gIHRoZXNlIGRvY3VtZW50cyBjYW4gYmUgZm91bmQgaW4gdGhlIGBkb2NzL2AgZm9sZGVyIG9mIHRoaXMgcmVwb3NpdG9yeS5cblxuICAjIyBSZWZlcmVuY2VcblxuICBUaGUgYHJ0Yy1zaWduYWxsZXJgIG1vZHVsZSBpcyBkZXNpZ25lZCB0byBiZSB1c2VkIHByaW1hcmlseSBpbiBhIGZ1bmN0aW9uYWxcbiAgd2F5IGFuZCB3aGVuIGNhbGxlZCBpdCBjcmVhdGVzIGEgbmV3IHNpZ25hbGxlciB0aGF0IHdpbGwgZW5hYmxlXG4gIHlvdSB0byBjb21tdW5pY2F0ZSB3aXRoIG90aGVyIHBlZXJzIHZpYSB5b3VyIG1lc3NhZ2luZyBuZXR3b3JrLlxuXG4gIGBgYGpzXG4gIC8vIGNyZWF0ZSBhIHNpZ25hbGxlciBmcm9tIHNvbWV0aGluZyB0aGF0IGtub3dzIGhvdyB0byBzZW5kIG1lc3NhZ2VzXG4gIHZhciBzaWduYWxsZXIgPSByZXF1aXJlKCdydGMtc2lnbmFsbGVyJykobWVzc2VuZ2VyKTtcbiAgYGBgXG5cbioqL1xudmFyIHNpZyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24obWVzc2VuZ2VyLCBvcHRzKSB7XG5cbiAgLy8gY3JlYXRlIHRoZSBzaWduYWxsZXJcbiAgdmFyIHNpZ25hbGxlciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcblxuICAvLyBpbml0aWFsaXNlIHRoZSBpZFxuICB2YXIgaWQgPSBzaWduYWxsZXIuaWQgPSB1dWlkLnY0KCk7XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgYXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlcyA9IHNpZ25hbGxlci5hdHRyaWJ1dGVzID0ge1xuICAgIGlkOiBpZFxuICB9O1xuXG4gIC8vIGNyZWF0ZSB0aGUgcGVlcnMgbWFwXG4gIHZhciBwZWVycyA9IHNpZ25hbGxlci5wZWVycyA9IG5ldyBGYXN0TWFwKCk7XG5cbiAgLy8gY3JlYXRlIG91ciBsb2NrcyBtYXBcbiAgdmFyIGxvY2tzID0gc2lnbmFsbGVyLmxvY2tzID0gbmV3IEZhc3RNYXAoKTtcblxuICAvLyBpbml0aWFsaXNlIHRoZSBkYXRhIGV2ZW50IG5hbWVcbiAgdmFyIGRhdGFFdmVudCA9IChvcHRzIHx8IHt9KS5kYXRhRXZlbnQgfHwgJ2RhdGEnO1xuICB2YXIgd3JpdGVNZXRob2QgPSAob3B0cyB8fCB7fSkud3JpdGVNZXRob2QgfHwgJ3dyaXRlJztcbiAgdmFyIGNsb3NlTWV0aG9kID0gKG9wdHMgfHwge30pLmNsb3NlTWV0aG9kIHx8ICdjbG9zZSc7XG5cbiAgLy8gZXh0cmFjdCB0aGUgd3JpdGUgYW5kIGNsb3NlIGZ1bmN0aW9uIHJlZmVyZW5jZXNcbiAgdmFyIHdyaXRlID0gbWVzc2VuZ2VyW3dyaXRlTWV0aG9kXTtcbiAgdmFyIGNsb3NlID0gbWVzc2VuZ2VyW2Nsb3NlTWV0aG9kXTtcblxuICAvLyBjcmVhdGUgdGhlIHByb2Nlc3NvclxuICB2YXIgcHJvY2Vzc29yID0gcmVxdWlyZSgnLi9wcm9jZXNzb3InKShzaWduYWxsZXIpO1xuXG4gIC8vIGlmIHRoZSBtZXNzZW5nZXIgZG9lc24ndCBwcm92aWRlIGEgdmFsaWQgd3JpdGUgbWV0aG9kLCB0aGVuIGNvbXBsYWluXG4gIGlmICh0eXBlb2Ygd3JpdGUgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvdmlkZWQgbWVzc2VuZ2VyIGRvZXMgbm90IGltcGxlbWVudCBhIFwiJyArXG4gICAgICB3cml0ZU1ldGhvZCArICdcIiB3cml0ZSBtZXRob2QnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByZXBhcmVBcmcoYXJnKSB7XG4gICAgaWYgKHR5cGVvZiBhcmcgPT0gJ29iamVjdCcgJiYgKCEgKGFyZyBpbnN0YW5jZW9mIFN0cmluZykpKSB7XG4gICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIGFyZyA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gYXJnO1xuICB9XG5cbiAgLyoqXG4gICAgIyMjIHNpZ25hbGxlciNzZW5kKGRhdGEpXG5cbiAgICBTZW5kIGRhdGEgb3ZlciB0aGUgbWVzc2VuZ2luZyBpbnRlcmZhY2UuXG4gICoqL1xuICB2YXIgc2VuZCA9IHNpZ25hbGxlci5zZW5kID0gZnVuY3Rpb24oKSB7XG4gICAgLy8gaXRlcmF0ZSBvdmVyIHRoZSBhcmd1bWVudHMgYW5kIHN0cmluZ2lmeSBhcyByZXF1aXJlZFxuICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIHZhciBkYXRhbGluZSA9IGFyZ3MubWFwKHByZXBhcmVBcmcpLmZpbHRlcihCb29sZWFuKS5qb2luKCd8Jyk7XG5cbiAgICAvLyBzZW5kIHRoZSBkYXRhIG92ZXIgdGhlIG1lc3NlbmdlclxuICAgIHJldHVybiB3cml0ZS5jYWxsKG1lc3NlbmdlciwgZGF0YWxpbmUpO1xuICB9O1xuXG4gIC8qKlxuICAgICMjIyBzaWduYWxsZXIjYW5ub3VuY2UoZGF0YT8pXG5cbiAgICBUaGUgYGFubm91bmNlYCBmdW5jdGlvbiBvZiB0aGUgc2lnbmFsbGVyIHdpbGwgcGFzcyBhbiBgL2Fubm91bmNlYCBtZXNzYWdlXG4gICAgdGhyb3VnaCB0aGUgbWVzc2VuZ2VyIG5ldHdvcmsuICBXaGVuIG5vIGFkZGl0aW9uYWwgZGF0YSBpcyBzdXBwbGllZCB0b1xuICAgIHRoaXMgZnVuY3Rpb24gdGhlbiBvbmx5IHRoZSBpZCBvZiB0aGUgc2lnbmFsbGVyIGlzIHNlbnQgdG8gYWxsIGFjdGl2ZVxuICAgIG1lbWJlcnMgb2YgdGhlIG1lc3NlbmdpbmcgbmV0d29yay5cblxuICAgIEFzIGEgdW5pcXVlIGl0IGlzIGdlbmVyYWxseSBpbnN1ZmZpY2llbnQgaW5mb3JtYXRpb24gdG8gZGV0ZXJtaW5lIHdoZXRoZXJcbiAgICBhIHBlZXIgaXMgYSBnb29kIG1hdGNoIGZvciBhbm90aGVyIChmb3IgaW5zdGFuY2UsICB5b3UgbWlnaHQgYmUgbG9va2luZ1xuICAgIGZvciBvdGhlciBwYXJ0aWVzIGJ5IG5hbWUgb3Igcm9sZSkgaXQgaXMgZ2VuZXJhbGx5IGEgZ29vZCBpZGVhIHRvIHByb3ZpZGVcbiAgICBzb21lIGFkZGl0aW9uYWwgaW5mb3JtYXRpb24gZHVyaW5nIHRoaXMgYW5ub3VuY2UgY2FsbDpcblxuICAgIGBgYGpzXG4gICAgc2lnbmFsbGVyLmFubm91bmNlKHsgcm9sZTogJ3RyYW5zbGF0b3InIH0pO1xuICAgIGBgYFxuXG4gICAgX19OT1RFOl9fIEluIHNvbWUgcGFydGljdWxhciBtZXNzZW5nZXIgdHlwZXMgbWF5IGF0dGFjaCBvciBpbmZlclxuICAgIGFkZGl0aW9uYWwgZGF0YSBkdXJpbmcgdGhlIGFubm91bmNlIHBoYXNlLiAgRm9yIGluc3RhbmNlLCBzb2NrZXQuaW9cbiAgICBjb25uZWN0aW9ucyBhcmUgZ2VuZXJhbGx5IG9yZ2FuaXNlZCBpbnRvIHJvb21zIHdoaWNoIGlzIGluZmVycmVkXG4gICAgaW5mb3JtYXRpb24gdGhhdCBsaW1pdHMgdGhlIG1lc3NhZ2luZyBzY29wZS5cbiAgKiovXG4gIHNpZ25hbGxlci5hbm5vdW5jZSA9IGZ1bmN0aW9uKGRhdGEsIHNlbmRlcikge1xuICAgIC8vIHVwZGF0ZSBpbnRlcm5hbCBhdHRyaWJ1dGVzXG4gICAgZXh0ZW5kKGF0dHJpYnV0ZXMsIGRhdGEsIHsgaWQ6IGlkIH0pO1xuXG4gICAgLy8gc2VuZCB0aGUgYXR0cmlidXRlcyBvdmVyIHRoZSBuZXR3b3JrXG4gICAgcmV0dXJuIChzZW5kZXIgfHwgc2VuZCkoJy9hbm5vdW5jZScsIGF0dHJpYnV0ZXMpO1xuICB9O1xuXG4gIC8qKlxuICAgICMjIyBzaWduYWxsZXIjbGVhdmUoKVxuXG4gICAgTGVhdmUgdGhlIG1lc3NlbmdlciBtZXNoXG4gICoqL1xuICBzaWduYWxsZXIubGVhdmUgPSBmdW5jdGlvbigpIHtcbiAgICAvLyBzZW5kIHRoZSBsZWF2ZSBzaWduYWxcbiAgICBzZW5kKCcvbGVhdmUnLCB7IGlkOiBpZCB9KTtcblxuICAgIC8vIGNhbGwgdGhlIGNsb3NlIG1ldGhvZFxuICAgIGlmICh0eXBlb2YgY2xvc2UgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY2xvc2UuY2FsbChtZXNzZW5nZXIpO1xuICAgIH1cbiAgfTtcblxuICAvKipcbiAgICAjIyMgc2lnbmFsbGVyI2xvY2sodGFyZ2V0SWQsIG9wdHM/LCBjYWxsYmFjaz8pXG5cbiAgICBBdHRlbXB0IHRvIGdldCBhIHRlbXBvcmFyeSBleGNsdXNpdmUgbG9jayBvbiB0aGUgY29tbXVuaWNhdGlvblxuICAgIGNoYW5uZWwgYmV0d2VlbiB0aGUgbG9jYWwgc2lnbmFsbGVyIGFuZCB0aGUgc3BlY2lmaWVkIHRhcmdldCBwZWVyIGlkLlxuICAqKi9cbiAgc2lnbmFsbGVyLmxvY2sgPSBmdW5jdGlvbih0YXJnZXRJZCwgb3B0cywgY2FsbGJhY2spIHtcbiAgICB2YXIgcGVlciA9IHBlZXJzLmdldCh0YXJnZXRJZCk7XG4gICAgdmFyIGFjdGl2ZUxvY2s7XG4gICAgdmFyIGxvY2tpZCA9IHV1aWQudjQoKTtcbiAgICB2YXIgbGFiZWw7XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVMb2NrUmVzdWx0KHNyYywgcmVzdWx0KSB7XG4gICAgICB2YXIgb2sgPSByZXN1bHQgJiYgcmVzdWx0Lm9rO1xuXG4gICAgICAvLyBpZiB0aGUgc291cmNlIGRvZXMgbm90IG1hdGNoIHRoZSB0YXJnZXQgdGhlbiBhYm9ydFxuICAgICAgaWYgKCghIHNyYykgfHwgKHNyYy5pZCAhPT0gdGFyZ2V0SWQpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gaWYgdGhlIHJlc3VsdCBsYWJlbCBpcyBub3QgYSBtYXRjaCwgdGhlbiBhYm9ydFxuICAgICAgaWYgKCghIHJlc3VsdCkgfHwgKHJlc3VsdC5sYWJlbCAhPT0gbGFiZWwpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gZG9uJ3QgbGlzdGVuIGZvciBhbnkgZnVydGhlciBsb2NrIHJlc3VsdCBtZXNzYWdlc1xuICAgICAgc2lnbmFsbGVyLnJlbW92ZUxpc3RlbmVyKCdsb2NrcmVzdWx0JywgaGFuZGxlTG9ja1Jlc3VsdCk7XG5cbiAgICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgYW4gZXJyb3IgY29uZGl0aW9uLCBjcmVhdGUgYW4gYWN0aXZlIGxvY2FsIGxvY2tcbiAgICAgIGlmIChvaykge1xuICAgICAgICBsb2Nrcy5zZXQobGFiZWwsIGFjdGl2ZUxvY2sgPSB7IGlkOiBsb2NraWQgfSk7XG4gICAgICB9XG4gICAgICAvLyBvdGhlcndpc2UsIGRlbGV0ZSB0aGUgbG9jYWwgcHJvdmlzaW9uYWwgbG9ja1xuICAgICAgZWxzZSBpZiAoYWN0aXZlTG9jaykge1xuICAgICAgICBsb2Nrcy5kZWxldGUobGFiZWwpO1xuICAgICAgfVxuXG4gICAgICBjYWxsYmFjayhvayA/IG51bGwgOiBuZXcgRXJyb3IoJ2NvdWxkIG5vdCBhY3F1aXJlIGxvY2snKSk7XG4gICAgfVxuXG4gICAgLy8gY2hlY2sgZm9yIG5vIGxhYmVsIGJlaW5nIHN1cHBsaWVkXG4gICAgaWYgKHR5cGVvZiBvcHRzID09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNhbGxiYWNrID0gb3B0cztcbiAgICAgIG9wdHMgPSB7fTtcbiAgICB9XG5cbiAgICAvLyBlbnN1cmUgd2UgaGF2ZSBhIGNhbGxiYWNrXG4gICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuXG4gICAgLy8gaWYgdGhlIHBlZXIgaXMgbm90IGtub3duLCB0aGVuIHdlIGNhbm5vdCBpbml0aWF0ZSBhIGxvY2tcbiAgICBpZiAoISBwZWVyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCd1bmtub3duIHRhcmdldCBpZCAtIGNhbm5vdCBpbml0aWF0ZSBsb2NrJykpO1xuICAgIH1cblxuICAgIC8vIGNyZWF0ZSBhIGRlZmF1bHQgbGFiZWwgaWYgbm9uZSBwcm92aWRlZFxuICAgIGxhYmVsID0gKG9wdHMgfHwge30pLmxhYmVsIHx8IChvcHRzIHx8IHt9KS5uYW1lIHx8ICdkZWZhdWx0JztcblxuICAgIC8vIGlmIHdlIGhhdmUgYSBsb2NhbCBsb2NrIGFscmVhZHkgaW4gcGxhY2UsIHRoZW4gcmV0dXJuIG9rXG4gICAgYWN0aXZlTG9jayA9IGxvY2tzLmdldChsYWJlbCk7XG4gICAgaWYgKGFjdGl2ZUxvY2sgJiYgKCEgYWN0aXZlTG9jay5wcm92aXNpb25hbCkpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgIH1cblxuICAgIC8vIGVuc3VyZSB3ZSBoYXZlIGxvY2tzIGZvciB0aGUgcGVlclxuICAgIHBlZXIubG9ja3MgPSBwZWVyLmxvY2tzIHx8IG5ldyBGYXN0TWFwKCk7XG5cbiAgICAvLyBpZiBhIHJlbW90ZSBsb2NrIGlzIGluIHBsYWNlLCBlcnJvciBvdXRcbiAgICBpZiAocGVlci5sb2Nrcy5nZXQobGFiZWwpKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdyZW1vdGUgbG9jayBpbiBwbGFjZSwgY2Fubm90IHJlcXVlc3QgbG9jaycpKTtcbiAgICB9XG5cbiAgICAvLyBjcmVhdGUgYSBwcm92aXNpb25hbCBsb2NrXG4gICAgbG9ja3Muc2V0KGxhYmVsLCBhY3RpdmVMb2NrID0geyBpZDogbG9ja2lkLCBwcm92aXNpb25hbDogdHJ1ZSB9KTtcblxuICAgIC8vIHdhaXQgZm9yIHRoZSBsb2NrIHJlc3VsdFxuICAgIHNpZ25hbGxlci5vbignbG9ja3Jlc3VsdCcsIGhhbmRsZUxvY2tSZXN1bHQpO1xuXG4gICAgLy8gc2VuZCB0aGUgbG9jayBtZXNzYWdlXG4gICAgc2lnbmFsbGVyLnRvKHRhcmdldElkKS5zZW5kKCcvbG9jaycsIGxhYmVsLCBsb2NraWQpO1xuICB9O1xuXG4gIC8qKlxuICAgICMjIyBzaWduYWxsZXIjdG8odGFyZ2V0SWQpXG5cbiAgICBUaGUgdG8gbWV0aG9kIHJldHVybnMgYW4gZW5jYXBzdWxhdGVkXG5cbiAgKiovXG4gIHNpZ25hbGxlci50byA9IGZ1bmN0aW9uKHRhcmdldElkKSB7XG4gICAgLy8gY3JlYXRlIGEgc2VuZGVyIHRoYXQgd2lsbCBwcmVwZW5kIG1lc3NhZ2VzIHdpdGggL3RvfHRhcmdldElkfFxuICAgIHZhciBzZW5kZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIC8vIGdldCB0aGUgcGVlciAoeWVzIHdoZW4gc2VuZCBpcyBjYWxsZWQgdG8gbWFrZSBzdXJlIGl0IGhhc24ndCBsZWZ0KVxuICAgICAgdmFyIHBlZXIgPSBzaWduYWxsZXIucGVlcnMuZ2V0KHRhcmdldElkKTtcbiAgICAgIHZhciBhcmdzO1xuXG4gICAgICBpZiAoISBwZWVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBwZWVyOiAnICsgdGFyZ2V0SWQpO1xuICAgICAgfVxuXG4gICAgICBhcmdzID0gW1xuICAgICAgICAnL3RvJyxcbiAgICAgICAgdGFyZ2V0SWQsXG4gICAgICAgIHsgaWQ6IHNpZ25hbGxlci5pZCwgY2xvY2s6IHBlZXIuY2xvY2sgfVxuICAgICAgXS5jb25jYXQoW10uc2xpY2UuY2FsbChhcmd1bWVudHMpKTtcblxuICAgICAgLy8gaW5jcmVtZW50IHRoZSBwZWVyIGNsb2NrLCB1c2luZyB0aGUgcm9sZSBvZiB0aGUgbG9jYWxcbiAgICAgIC8vIHNpZ25hbGxlci4gIElmIHRoZSBwZWVyIHJvbGUgaXMgMCwgdGhlbiB0aGUgc2lnbmFsbGVycyByb2xlIGlzIDFcbiAgICAgIC8vIGFuZCB1c2luZyB4b3IgKF4pIHdpbGwgZ2VuZXJhdGUgdGhlIGNvcnJlY3QgaW5kZXhcbiAgICAgIHZjLmluY3JlbWVudChwZWVyLCBbJ2EnLCAnYiddW3BlZXIucm9sZUlkeCBeIDFdKTtcblxuICAgICAgLy8gd3JpdGUgb24gbmV4dCB0aWNrIHRvIGVuc3VyZSBjbG9jayB1cGRhdGVzIGFyZSBoYW5kbGVkIGNvcnJlY3RseVxuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGFyZ3MubWFwKHByZXBhcmVBcmcpLmZpbHRlcihCb29sZWFuKS5qb2luKCd8Jyk7XG4gICAgICAgIGRlYnVnKCdUWCAoJyArIHRhcmdldElkICsgJyk6ICcsIG1zZyk7XG5cbiAgICAgICAgLy8gaW5jbHVkZSB0aGUgY3VycmVudCBjbG9jayB2YWx1ZSBpbiB3aXRoIHRoZSBwYXlsb2FkXG4gICAgICAgIHdyaXRlLmNhbGwobWVzc2VuZ2VyLCBtc2cpO1xuICAgICAgfSwgMCk7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICBhbm5vdW5jZTogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICByZXR1cm4gc2lnbmFsbGVyLmFubm91bmNlKGRhdGEsIHNlbmRlcik7XG4gICAgICB9LFxuXG4gICAgICBzZW5kOiBzZW5kZXIsXG4gICAgfVxuICB9O1xuXG4gIC8qKlxuXG4gICAgIyMjIHNpZ25hbGxlciN1bmxvY2sodGFyZ2V0SWQsIG9wdHM/KVxuXG4gICoqL1xuICBzaWduYWxsZXIudW5sb2NrID0gZnVuY3Rpb24odGFyZ2V0SWQsIG9wdHMsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHBlZXIgPSBwZWVycy5nZXQodGFyZ2V0SWQpO1xuICAgIHZhciBsYWJlbDtcblxuICAgIGZ1bmN0aW9uIGhhbmRsZVVubG9ja1Jlc3VsdChzcmMsIHJlc3VsdCkge1xuICAgICAgdmFyIG9rID0gcmVzdWx0ICYmIHJlc3VsdC5vaztcblxuICAgICAgLy8gaWYgbm90IHRoZSBjb3JyZWN0IHNvdXJjZSB0aGVuIGFib3J0XG4gICAgICBpZiAoKCEgc3JjKSB8fCAoc3JjLmlkICE9PSB0YXJnZXRJZCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBpZiB0aGlzIGlzIG5vdCBhbiB1bmxvY2sgcmVzdWx0IGZvciB0aGlzIGxhYmVsLCB0aGVuIGFib3J0XG4gICAgICBpZiAoKCEgcmVzdWx0KSB8fCAocmVzdWx0LmxhYmVsICE9PSBsYWJlbCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGxpc3RlbmVyXG4gICAgICBzaWduYWxsZXIucmVtb3ZlTGlzdGVuZXIoJ3VubG9ja3Jlc3VsdCcsIGhhbmRsZVVubG9ja1Jlc3VsdCk7XG5cbiAgICAgIC8vIGlmIG9rLCByZW1vdmUgb3VyIGxvY2FsIGxvY2tcbiAgICAgIGlmIChvaykge1xuICAgICAgICBsb2Nrcy5kZWxldGUobGFiZWwpO1xuICAgICAgfVxuXG4gICAgICAvLyB0cmlnZ2VyIHRoZSBjYWxsYmFja1xuICAgICAgY2FsbGJhY2sob2sgPyBudWxsIDogbmV3IEVycm9yKCdjb3VsZCBub3QgcmVsZWFzZSBsb2NrOiAnICsgbGFiZWwpKTtcbiAgICB9XG5cbiAgICAvLyBoYW5kbGUgdGhlIG5vIG9wdHMgY2FzZVxuICAgIGlmICh0eXBlb2Ygb3B0cyA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYWxsYmFjayA9IG9wdHM7XG4gICAgICBvcHRzID0ge307XG4gICAgfVxuXG4gICAgLy8gZW5zdXJlIHdlIGhhdmUgYSBjYWxsYmFja1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcblxuICAgIC8vIHNldCBhIGRlZmF1bHQgbGFiZWwgdmFsdWVcbiAgICBsYWJlbCA9IChvcHRzIHx8IHt9KS5sYWJlbCB8fCAob3B0cyB8fCB7fSkubmFtZSB8fCAnZGVmYXVsdCc7XG5cbiAgICAvLyBpZiB3ZSBoYXZlIHRoZSBwZWVyIGFuZCBsb2NhbCBsb2NrIHRoZW4gYWN0aW9uIHRoZSB1bmxvY2tcbiAgICBpZiAocGVlciAmJiBsb2Nrcy5nZXQobGFiZWwpKSB7XG4gICAgICBzaWduYWxsZXIub24oJ3VubG9ja3Jlc3VsdCcsIGhhbmRsZVVubG9ja1Jlc3VsdCk7XG4gICAgICBzaWduYWxsZXIudG8odGFyZ2V0SWQpLnNlbmQoJy91bmxvY2snLCBsYWJlbCwgbG9ja3MuZ2V0KGxhYmVsKSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKG5ldyBFcnJvcignbm8gbG9jYWwgbG9jayB3aXRoIGxhYmVsICcgKyBsYWJlbCkpO1xuICAgIH1cbiAgfTtcblxuICAvLyBoYW5kbGUgbWVzc2FnZSBkYXRhIGV2ZW50c1xuICBtZXNzZW5nZXIub24oZGF0YUV2ZW50LCBwcm9jZXNzb3IpO1xuXG4gIHJldHVybiBzaWduYWxsZXI7XG59O1xuXG5zaWcubG9hZFByaW11cyA9IHJlcXVpcmUoJy4vcHJpbXVzLWxvYWRlcicpOyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICAjIyBjb2cvanNvbnBhcnNlXG5cbiAgYGBganNcbiAgdmFyIGpzb25wYXJzZSA9IHJlcXVpcmUoJ2NvZy9qc29ucGFyc2UnKTtcbiAgYGBgXG5cbiAgIyMjIGpzb25wYXJzZShpbnB1dClcblxuICBUaGlzIGZ1bmN0aW9uIHdpbGwgYXR0ZW1wdCB0byBhdXRvbWF0aWNhbGx5IGRldGVjdCBzdHJpbmdpZmllZCBKU09OLCBhbmRcbiAgd2hlbiBkZXRlY3RlZCB3aWxsIHBhcnNlIGludG8gSlNPTiBvYmplY3RzLiAgVGhlIGZ1bmN0aW9uIGxvb2tzIGZvciBzdHJpbmdzXG4gIHRoYXQgbG9vayBhbmQgc21lbGwgbGlrZSBzdHJpbmdpZmllZCBKU09OLCBhbmQgaWYgZm91bmQgYXR0ZW1wdHMgdG9cbiAgYEpTT04ucGFyc2VgIHRoZSBpbnB1dCBpbnRvIGEgdmFsaWQgb2JqZWN0LlxuXG4qKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oaW5wdXQpIHtcbiAgdmFyIGlzU3RyaW5nID0gdHlwZW9mIGlucHV0ID09ICdzdHJpbmcnIHx8IChpbnB1dCBpbnN0YW5jZW9mIFN0cmluZyk7XG4gIHZhciByZU51bWVyaWMgPSAvXlxcLT9cXGQrXFwuP1xcZCokLztcbiAgdmFyIHNob3VsZFBhcnNlIDtcbiAgdmFyIGZpcnN0Q2hhcjtcbiAgdmFyIGxhc3RDaGFyO1xuXG4gIGlmICgoISBpc1N0cmluZykgfHwgaW5wdXQubGVuZ3RoIDwgMikge1xuICAgIGlmIChpc1N0cmluZyAmJiByZU51bWVyaWMudGVzdChpbnB1dCkpIHtcbiAgICAgIHJldHVybiBwYXJzZUZsb2F0KGlucHV0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gaW5wdXQ7XG4gIH1cblxuICAvLyBjaGVjayBmb3IgdHJ1ZSBvciBmYWxzZVxuICBpZiAoaW5wdXQgPT09ICd0cnVlJyB8fCBpbnB1dCA9PT0gJ2ZhbHNlJykge1xuICAgIHJldHVybiBpbnB1dCA9PT0gJ3RydWUnO1xuICB9XG5cbiAgLy8gY2hlY2sgZm9yIG51bGxcbiAgaWYgKGlucHV0ID09PSAnbnVsbCcpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIGdldCB0aGUgZmlyc3QgYW5kIGxhc3QgY2hhcmFjdGVyc1xuICBmaXJzdENoYXIgPSBpbnB1dC5jaGFyQXQoMCk7XG4gIGxhc3RDaGFyID0gaW5wdXQuY2hhckF0KGlucHV0Lmxlbmd0aCAtIDEpO1xuXG4gIC8vIGRldGVybWluZSB3aGV0aGVyIHdlIHNob3VsZCBKU09OLnBhcnNlIHRoZSBpbnB1dFxuICBzaG91bGRQYXJzZSA9XG4gICAgKGZpcnN0Q2hhciA9PSAneycgJiYgbGFzdENoYXIgPT0gJ30nKSB8fFxuICAgIChmaXJzdENoYXIgPT0gJ1snICYmIGxhc3RDaGFyID09ICddJyk7XG5cbiAgaWYgKHNob3VsZFBhcnNlKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGlucHV0KTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgIC8vIGFwcGFyZW50bHkgaXQgd2Fzbid0IHZhbGlkIGpzb24sIGNhcnJ5IG9uIHdpdGggcmVndWxhciBwcm9jZXNzaW5nXG4gICAgfVxuICB9XG5cblxuICByZXR1cm4gcmVOdW1lcmljLnRlc3QoaW5wdXQpID8gcGFyc2VGbG9hdChpbnB1dCkgOiBpbnB1dDtcbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBTaGltID0gcmVxdWlyZShcIi4vc2hpbVwiKTtcbnZhciBHZW5lcmljQ29sbGVjdGlvbiA9IHJlcXVpcmUoXCIuL2dlbmVyaWMtY29sbGVjdGlvblwiKTtcbnZhciBHZW5lcmljTWFwID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1tYXBcIik7XG52YXIgUHJvcGVydHlDaGFuZ2VzID0gcmVxdWlyZShcIi4vbGlzdGVuL3Byb3BlcnR5LWNoYW5nZXNcIik7XG5cbi8vIEJ1cmdsZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vZG9tZW5pYy9kaWN0XG5cbm1vZHVsZS5leHBvcnRzID0gRGljdDtcbmZ1bmN0aW9uIERpY3QodmFsdWVzLCBnZXREZWZhdWx0KSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIERpY3QpKSB7XG4gICAgICAgIHJldHVybiBuZXcgRGljdCh2YWx1ZXMsIGdldERlZmF1bHQpO1xuICAgIH1cbiAgICBnZXREZWZhdWx0ID0gZ2V0RGVmYXVsdCB8fCBGdW5jdGlvbi5ub29wO1xuICAgIHRoaXMuZ2V0RGVmYXVsdCA9IGdldERlZmF1bHQ7XG4gICAgdGhpcy5zdG9yZSA9IHt9O1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmFkZEVhY2godmFsdWVzKTtcbn1cblxuRGljdC5EaWN0ID0gRGljdDsgLy8gaGFjayBzbyByZXF1aXJlKFwiZGljdFwiKS5EaWN0IHdpbGwgd29yayBpbiBNb250YWdlSlMuXG5cbmZ1bmN0aW9uIG1hbmdsZShrZXkpIHtcbiAgICByZXR1cm4gXCJ+XCIgKyBrZXk7XG59XG5cbmZ1bmN0aW9uIHVubWFuZ2xlKG1hbmdsZWQpIHtcbiAgICByZXR1cm4gbWFuZ2xlZC5zbGljZSgxKTtcbn1cblxuT2JqZWN0LmFkZEVhY2goRGljdC5wcm90b3R5cGUsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChEaWN0LnByb3RvdHlwZSwgR2VuZXJpY01hcC5wcm90b3R5cGUpO1xuT2JqZWN0LmFkZEVhY2goRGljdC5wcm90b3R5cGUsIFByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUpO1xuXG5EaWN0LnByb3RvdHlwZS5jb25zdHJ1Y3RDbG9uZSA9IGZ1bmN0aW9uICh2YWx1ZXMpIHtcbiAgICByZXR1cm4gbmV3IHRoaXMuY29uc3RydWN0b3IodmFsdWVzLCB0aGlzLm1hbmdsZSwgdGhpcy5nZXREZWZhdWx0KTtcbn07XG5cbkRpY3QucHJvdG90eXBlLmFzc2VydFN0cmluZyA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAodHlwZW9mIGtleSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwia2V5IG11c3QgYmUgYSBzdHJpbmcgYnV0IEdvdCBcIiArIGtleSk7XG4gICAgfVxufVxuXG5EaWN0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsdWUpIHtcbiAgICB0aGlzLmFzc2VydFN0cmluZyhrZXkpO1xuICAgIHZhciBtYW5nbGVkID0gbWFuZ2xlKGtleSk7XG4gICAgaWYgKG1hbmdsZWQgaW4gdGhpcy5zdG9yZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdG9yZVttYW5nbGVkXTtcbiAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdChrZXkpO1xuICAgIH1cbn07XG5cbkRpY3QucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgdGhpcy5hc3NlcnRTdHJpbmcoa2V5KTtcbiAgICB2YXIgbWFuZ2xlZCA9IG1hbmdsZShrZXkpO1xuICAgIGlmIChtYW5nbGVkIGluIHRoaXMuc3RvcmUpIHsgLy8gdXBkYXRlXG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNCZWZvcmVNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgdGhpcy5zdG9yZVttYW5nbGVkXSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdG9yZVttYW5nbGVkXSA9IHZhbHVlO1xuICAgICAgICBpZiAodGhpcy5kaXNwYXRjaGVzTWFwQ2hhbmdlcykge1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaE1hcENoYW5nZShrZXksIHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBlbHNlIHsgLy8gY3JlYXRlXG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxlbmd0aCsrO1xuICAgICAgICB0aGlzLnN0b3JlW21hbmdsZWRdID0gdmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoTWFwQ2hhbmdlKGtleSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbn07XG5cbkRpY3QucHJvdG90eXBlLmhhcyA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICB0aGlzLmFzc2VydFN0cmluZyhrZXkpO1xuICAgIHZhciBtYW5nbGVkID0gbWFuZ2xlKGtleSk7XG4gICAgcmV0dXJuIG1hbmdsZWQgaW4gdGhpcy5zdG9yZTtcbn07XG5cbkRpY3QucHJvdG90eXBlW1wiZGVsZXRlXCJdID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHRoaXMuYXNzZXJ0U3RyaW5nKGtleSk7XG4gICAgdmFyIG1hbmdsZWQgPSBtYW5nbGUoa2V5KTtcbiAgICBpZiAobWFuZ2xlZCBpbiB0aGlzLnN0b3JlKSB7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgdGhpcy5zdG9yZVttYW5nbGVkXSk7XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHRoaXMuc3RvcmVbbWFuZ2xlKGtleSldO1xuICAgICAgICB0aGlzLmxlbmd0aC0tO1xuICAgICAgICBpZiAodGhpcy5kaXNwYXRjaGVzTWFwQ2hhbmdlcykge1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaE1hcENoYW5nZShrZXksIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn07XG5cbkRpY3QucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBrZXksIG1hbmdsZWQ7XG4gICAgZm9yIChtYW5nbGVkIGluIHRoaXMuc3RvcmUpIHtcbiAgICAgICAga2V5ID0gdW5tYW5nbGUobWFuZ2xlZCk7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgdGhpcy5zdG9yZVttYW5nbGVkXSk7XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHRoaXMuc3RvcmVbbWFuZ2xlZF07XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoTWFwQ2hhbmdlKGtleSwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmxlbmd0aCA9IDA7XG59O1xuXG5EaWN0LnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIGJhc2lzLCB0aGlzcCkge1xuICAgIGZvciAodmFyIG1hbmdsZWQgaW4gdGhpcy5zdG9yZSkge1xuICAgICAgICBiYXNpcyA9IGNhbGxiYWNrLmNhbGwodGhpc3AsIGJhc2lzLCB0aGlzLnN0b3JlW21hbmdsZWRdLCB1bm1hbmdsZShtYW5nbGVkKSwgdGhpcyk7XG4gICAgfVxuICAgIHJldHVybiBiYXNpcztcbn07XG5cbkRpY3QucHJvdG90eXBlLnJlZHVjZVJpZ2h0ID0gZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcywgdGhpc3ApIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIHN0b3JlID0gdGhpcy5zdG9yZTtcbiAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5zdG9yZSkucmVkdWNlUmlnaHQoZnVuY3Rpb24gKGJhc2lzLCBtYW5nbGVkKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHRoaXNwLCBiYXNpcywgc3RvcmVbbWFuZ2xlZF0sIHVubWFuZ2xlKG1hbmdsZWQpLCBzZWxmKTtcbiAgICB9LCBiYXNpcyk7XG59O1xuXG5EaWN0LnByb3RvdHlwZS5vbmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGtleTtcbiAgICBmb3IgKGtleSBpbiB0aGlzLnN0b3JlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0b3JlW2tleV07XG4gICAgfVxufTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBTaGltID0gcmVxdWlyZShcIi4vc2hpbVwiKTtcbnZhciBTZXQgPSByZXF1aXJlKFwiLi9mYXN0LXNldFwiKTtcbnZhciBHZW5lcmljQ29sbGVjdGlvbiA9IHJlcXVpcmUoXCIuL2dlbmVyaWMtY29sbGVjdGlvblwiKTtcbnZhciBHZW5lcmljTWFwID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1tYXBcIik7XG52YXIgUHJvcGVydHlDaGFuZ2VzID0gcmVxdWlyZShcIi4vbGlzdGVuL3Byb3BlcnR5LWNoYW5nZXNcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gRmFzdE1hcDtcblxuZnVuY3Rpb24gRmFzdE1hcCh2YWx1ZXMsIGVxdWFscywgaGFzaCwgZ2V0RGVmYXVsdCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBGYXN0TWFwKSkge1xuICAgICAgICByZXR1cm4gbmV3IEZhc3RNYXAodmFsdWVzLCBlcXVhbHMsIGhhc2gsIGdldERlZmF1bHQpO1xuICAgIH1cbiAgICBlcXVhbHMgPSBlcXVhbHMgfHwgT2JqZWN0LmVxdWFscztcbiAgICBoYXNoID0gaGFzaCB8fCBPYmplY3QuaGFzaDtcbiAgICBnZXREZWZhdWx0ID0gZ2V0RGVmYXVsdCB8fCBGdW5jdGlvbi5ub29wO1xuICAgIHRoaXMuY29udGVudEVxdWFscyA9IGVxdWFscztcbiAgICB0aGlzLmNvbnRlbnRIYXNoID0gaGFzaDtcbiAgICB0aGlzLmdldERlZmF1bHQgPSBnZXREZWZhdWx0O1xuICAgIHRoaXMuc3RvcmUgPSBuZXcgU2V0KFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIGZ1bmN0aW9uIGtleXNFcXVhbChhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gZXF1YWxzKGEua2V5LCBiLmtleSk7XG4gICAgICAgIH0sXG4gICAgICAgIGZ1bmN0aW9uIGtleUhhc2goaXRlbSkge1xuICAgICAgICAgICAgcmV0dXJuIGhhc2goaXRlbS5rZXkpO1xuICAgICAgICB9XG4gICAgKTtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5hZGRFYWNoKHZhbHVlcyk7XG59XG5cbkZhc3RNYXAuRmFzdE1hcCA9IEZhc3RNYXA7IC8vIGhhY2sgc28gcmVxdWlyZShcImZhc3QtbWFwXCIpLkZhc3RNYXAgd2lsbCB3b3JrIGluIE1vbnRhZ2VKU1xuXG5PYmplY3QuYWRkRWFjaChGYXN0TWFwLnByb3RvdHlwZSwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlKTtcbk9iamVjdC5hZGRFYWNoKEZhc3RNYXAucHJvdG90eXBlLCBHZW5lcmljTWFwLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChGYXN0TWFwLnByb3RvdHlwZSwgUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZSk7XG5cbkZhc3RNYXAucHJvdG90eXBlLmNvbnN0cnVjdENsb25lID0gZnVuY3Rpb24gKHZhbHVlcykge1xuICAgIHJldHVybiBuZXcgdGhpcy5jb25zdHJ1Y3RvcihcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICB0aGlzLmNvbnRlbnRFcXVhbHMsXG4gICAgICAgIHRoaXMuY29udGVudEhhc2gsXG4gICAgICAgIHRoaXMuZ2V0RGVmYXVsdFxuICAgICk7XG59O1xuXG5GYXN0TWFwLnByb3RvdHlwZS5sb2cgPSBmdW5jdGlvbiAoY2hhcm1hcCwgc3RyaW5naWZ5KSB7XG4gICAgc3RyaW5naWZ5ID0gc3RyaW5naWZ5IHx8IHRoaXMuc3RyaW5naWZ5O1xuICAgIHRoaXMuc3RvcmUubG9nKGNoYXJtYXAsIHN0cmluZ2lmeSk7XG59O1xuXG5GYXN0TWFwLnByb3RvdHlwZS5zdHJpbmdpZnkgPSBmdW5jdGlvbiAoaXRlbSwgbGVhZGVyKSB7XG4gICAgcmV0dXJuIGxlYWRlciArIEpTT04uc3RyaW5naWZ5KGl0ZW0ua2V5KSArIFwiOiBcIiArIEpTT04uc3RyaW5naWZ5KGl0ZW0udmFsdWUpO1xufVxuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFNoaW0gPSByZXF1aXJlKFwiLi9zaGltXCIpO1xudmFyIERpY3QgPSByZXF1aXJlKFwiLi9kaWN0XCIpO1xudmFyIExpc3QgPSByZXF1aXJlKFwiLi9saXN0XCIpO1xudmFyIEdlbmVyaWNDb2xsZWN0aW9uID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1jb2xsZWN0aW9uXCIpO1xudmFyIEdlbmVyaWNTZXQgPSByZXF1aXJlKFwiLi9nZW5lcmljLXNldFwiKTtcbnZhciBUcmVlTG9nID0gcmVxdWlyZShcIi4vdHJlZS1sb2dcIik7XG52YXIgUHJvcGVydHlDaGFuZ2VzID0gcmVxdWlyZShcIi4vbGlzdGVuL3Byb3BlcnR5LWNoYW5nZXNcIik7XG5cbnZhciBvYmplY3RfaGFzID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxubW9kdWxlLmV4cG9ydHMgPSBGYXN0U2V0O1xuXG5mdW5jdGlvbiBGYXN0U2V0KHZhbHVlcywgZXF1YWxzLCBoYXNoLCBnZXREZWZhdWx0KSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEZhc3RTZXQpKSB7XG4gICAgICAgIHJldHVybiBuZXcgRmFzdFNldCh2YWx1ZXMsIGVxdWFscywgaGFzaCwgZ2V0RGVmYXVsdCk7XG4gICAgfVxuICAgIGVxdWFscyA9IGVxdWFscyB8fCBPYmplY3QuZXF1YWxzO1xuICAgIGhhc2ggPSBoYXNoIHx8IE9iamVjdC5oYXNoO1xuICAgIGdldERlZmF1bHQgPSBnZXREZWZhdWx0IHx8IEZ1bmN0aW9uLm5vb3A7XG4gICAgdGhpcy5jb250ZW50RXF1YWxzID0gZXF1YWxzO1xuICAgIHRoaXMuY29udGVudEhhc2ggPSBoYXNoO1xuICAgIHRoaXMuZ2V0RGVmYXVsdCA9IGdldERlZmF1bHQ7XG4gICAgdGhpcy5idWNrZXRzID0gbmV3IHRoaXMuQnVja2V0cyhudWxsLCB0aGlzLkJ1Y2tldCk7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xuICAgIHRoaXMuYWRkRWFjaCh2YWx1ZXMpO1xufVxuXG5GYXN0U2V0LkZhc3RTZXQgPSBGYXN0U2V0OyAvLyBoYWNrIHNvIHJlcXVpcmUoXCJmYXN0LXNldFwiKS5GYXN0U2V0IHdpbGwgd29yayBpbiBNb250YWdlSlNcblxuT2JqZWN0LmFkZEVhY2goRmFzdFNldC5wcm90b3R5cGUsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChGYXN0U2V0LnByb3RvdHlwZSwgR2VuZXJpY1NldC5wcm90b3R5cGUpO1xuT2JqZWN0LmFkZEVhY2goRmFzdFNldC5wcm90b3R5cGUsIFByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUpO1xuXG5GYXN0U2V0LnByb3RvdHlwZS5CdWNrZXRzID0gRGljdDtcbkZhc3RTZXQucHJvdG90eXBlLkJ1Y2tldCA9IExpc3Q7XG5cbkZhc3RTZXQucHJvdG90eXBlLmNvbnN0cnVjdENsb25lID0gZnVuY3Rpb24gKHZhbHVlcykge1xuICAgIHJldHVybiBuZXcgdGhpcy5jb25zdHJ1Y3RvcihcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICB0aGlzLmNvbnRlbnRFcXVhbHMsXG4gICAgICAgIHRoaXMuY29udGVudEhhc2gsXG4gICAgICAgIHRoaXMuZ2V0RGVmYXVsdFxuICAgICk7XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgaGFzaCA9IHRoaXMuY29udGVudEhhc2godmFsdWUpO1xuICAgIHJldHVybiB0aGlzLmJ1Y2tldHMuZ2V0KGhhc2gpLmhhcyh2YWx1ZSk7XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgaGFzaCA9IHRoaXMuY29udGVudEhhc2godmFsdWUpO1xuICAgIHZhciBidWNrZXRzID0gdGhpcy5idWNrZXRzO1xuICAgIGlmIChidWNrZXRzLmhhcyhoYXNoKSkge1xuICAgICAgICByZXR1cm4gYnVja2V0cy5nZXQoaGFzaCkuZ2V0KHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0KHZhbHVlKTtcbiAgICB9XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZVsnZGVsZXRlJ10gPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgaGFzaCA9IHRoaXMuY29udGVudEhhc2godmFsdWUpO1xuICAgIHZhciBidWNrZXRzID0gdGhpcy5idWNrZXRzO1xuICAgIGlmIChidWNrZXRzLmhhcyhoYXNoKSkge1xuICAgICAgICB2YXIgYnVja2V0ID0gYnVja2V0cy5nZXQoaGFzaCk7XG4gICAgICAgIGlmIChidWNrZXRbXCJkZWxldGVcIl0odmFsdWUpKSB7XG4gICAgICAgICAgICB0aGlzLmxlbmd0aC0tO1xuICAgICAgICAgICAgaWYgKGJ1Y2tldC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBidWNrZXRzW1wiZGVsZXRlXCJdKGhhc2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcblxuRmFzdFNldC5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5idWNrZXRzLmNsZWFyKCk7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xufTtcblxuRmFzdFNldC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIGhhc2ggPSB0aGlzLmNvbnRlbnRIYXNoKHZhbHVlKTtcbiAgICB2YXIgYnVja2V0cyA9IHRoaXMuYnVja2V0cztcbiAgICBpZiAoIWJ1Y2tldHMuaGFzKGhhc2gpKSB7XG4gICAgICAgIGJ1Y2tldHMuc2V0KGhhc2gsIG5ldyB0aGlzLkJ1Y2tldChudWxsLCB0aGlzLmNvbnRlbnRFcXVhbHMpKTtcbiAgICB9XG4gICAgaWYgKCFidWNrZXRzLmdldChoYXNoKS5oYXModmFsdWUpKSB7XG4gICAgICAgIGJ1Y2tldHMuZ2V0KGhhc2gpLmFkZCh2YWx1ZSk7XG4gICAgICAgIHRoaXMubGVuZ3RoKys7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIGJhc2lzIC8qLCB0aGlzcCovKSB7XG4gICAgdmFyIHRoaXNwID0gYXJndW1lbnRzWzJdO1xuICAgIHZhciBidWNrZXRzID0gdGhpcy5idWNrZXRzO1xuICAgIHZhciBpbmRleCA9IDA7XG4gICAgcmV0dXJuIGJ1Y2tldHMucmVkdWNlKGZ1bmN0aW9uIChiYXNpcywgYnVja2V0KSB7XG4gICAgICAgIHJldHVybiBidWNrZXQucmVkdWNlKGZ1bmN0aW9uIChiYXNpcywgdmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHRoaXNwLCBiYXNpcywgdmFsdWUsIGluZGV4KyssIHRoaXMpO1xuICAgICAgICB9LCBiYXNpcywgdGhpcyk7XG4gICAgfSwgYmFzaXMsIHRoaXMpO1xufTtcblxuRmFzdFNldC5wcm90b3R5cGUub25lID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVja2V0cy5vbmUoKS5vbmUoKTtcbiAgICB9XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZS5pdGVyYXRlID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmJ1Y2tldHMudmFsdWVzKCkuZmxhdHRlbigpLml0ZXJhdGUoKTtcbn07XG5cbkZhc3RTZXQucHJvdG90eXBlLmxvZyA9IGZ1bmN0aW9uIChjaGFybWFwLCBsb2dOb2RlLCBjYWxsYmFjaywgdGhpc3ApIHtcbiAgICBjaGFybWFwID0gY2hhcm1hcCB8fCBUcmVlTG9nLnVuaWNvZGVTaGFycDtcbiAgICBsb2dOb2RlID0gbG9nTm9kZSB8fCB0aGlzLmxvZ05vZGU7XG4gICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNvbnNvbGUubG9nO1xuICAgICAgICB0aGlzcCA9IGNvbnNvbGU7XG4gICAgfVxuICAgIGNhbGxiYWNrID0gY2FsbGJhY2suYmluZCh0aGlzcCk7XG5cbiAgICB2YXIgYnVja2V0cyA9IHRoaXMuYnVja2V0cztcbiAgICB2YXIgaGFzaGVzID0gYnVja2V0cy5rZXlzKCk7XG4gICAgaGFzaGVzLmZvckVhY2goZnVuY3Rpb24gKGhhc2gsIGluZGV4KSB7XG4gICAgICAgIHZhciBicmFuY2g7XG4gICAgICAgIHZhciBsZWFkZXI7XG4gICAgICAgIGlmIChpbmRleCA9PT0gaGFzaGVzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIGJyYW5jaCA9IGNoYXJtYXAuZnJvbUFib3ZlO1xuICAgICAgICAgICAgbGVhZGVyID0gJyAnO1xuICAgICAgICB9IGVsc2UgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICBicmFuY2ggPSBjaGFybWFwLmJyYW5jaERvd247XG4gICAgICAgICAgICBsZWFkZXIgPSBjaGFybWFwLnN0cmFmZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJyYW5jaCA9IGNoYXJtYXAuZnJvbUJvdGg7XG4gICAgICAgICAgICBsZWFkZXIgPSBjaGFybWFwLnN0cmFmZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgYnVja2V0ID0gYnVja2V0cy5nZXQoaGFzaCk7XG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpc3AsIGJyYW5jaCArIGNoYXJtYXAudGhyb3VnaCArIGNoYXJtYXAuYnJhbmNoRG93biArICcgJyArIGhhc2gpO1xuICAgICAgICBidWNrZXQuZm9yRWFjaChmdW5jdGlvbiAodmFsdWUsIG5vZGUpIHtcbiAgICAgICAgICAgIHZhciBicmFuY2gsIGJlbG93O1xuICAgICAgICAgICAgaWYgKG5vZGUgPT09IGJ1Y2tldC5oZWFkLnByZXYpIHtcbiAgICAgICAgICAgICAgICBicmFuY2ggPSBjaGFybWFwLmZyb21BYm92ZTtcbiAgICAgICAgICAgICAgICBiZWxvdyA9ICcgJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnJhbmNoID0gY2hhcm1hcC5mcm9tQm90aDtcbiAgICAgICAgICAgICAgICBiZWxvdyA9IGNoYXJtYXAuc3RyYWZlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIHdyaXR0ZW47XG4gICAgICAgICAgICBsb2dOb2RlKFxuICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF3cml0dGVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHRoaXNwLCBsZWFkZXIgKyAnICcgKyBicmFuY2ggKyBjaGFybWFwLnRocm91Z2ggKyBjaGFybWFwLnRocm91Z2ggKyBsaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdyaXR0ZW4gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzcCwgbGVhZGVyICsgJyAnICsgYmVsb3cgKyAnICAnICsgbGluZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwodGhpc3AsIGxlYWRlciArICcgJyArIGNoYXJtYXAuc3RyYWZlICsgJyAgJyArIGxpbmUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuRmFzdFNldC5wcm90b3R5cGUubG9nTm9kZSA9IGZ1bmN0aW9uIChub2RlLCB3cml0ZSkge1xuICAgIHZhciB2YWx1ZSA9IG5vZGUudmFsdWU7XG4gICAgaWYgKE9iamVjdCh2YWx1ZSkgPT09IHZhbHVlKSB7XG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCA0KS5zcGxpdChcIlxcblwiKS5mb3JFYWNoKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgICAgICB3cml0ZShcIiBcIiArIGxpbmUpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB3cml0ZShcIiBcIiArIHZhbHVlKTtcbiAgICB9XG59O1xuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBHZW5lcmljQ29sbGVjdGlvbjtcbmZ1bmN0aW9uIEdlbmVyaWNDb2xsZWN0aW9uKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNvbnN0cnVjdC4gR2VuZXJpY0NvbGxlY3Rpb24gaXMgYSBtaXhpbi5cIik7XG59XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5hZGRFYWNoID0gZnVuY3Rpb24gKHZhbHVlcykge1xuICAgIGlmICh2YWx1ZXMgJiYgT2JqZWN0KHZhbHVlcykgPT09IHZhbHVlcykge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlcy5mb3JFYWNoID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIHZhbHVlcy5mb3JFYWNoKHRoaXMuYWRkLCB0aGlzKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWVzLmxlbmd0aCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgLy8gQXJyYXktbGlrZSBvYmplY3RzIHRoYXQgZG8gbm90IGltcGxlbWVudCBmb3JFYWNoLCBlcmdvLFxuICAgICAgICAgICAgLy8gQXJndW1lbnRzXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZhbHVlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkKHZhbHVlc1tpXSwgaSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyh2YWx1ZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkKHZhbHVlc1trZXldLCBrZXkpO1xuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBUaGlzIGlzIHN1ZmZpY2llbnRseSBnZW5lcmljIGZvciBNYXAgKHNpbmNlIHRoZSB2YWx1ZSBtYXkgYmUgYSBrZXkpXG4vLyBhbmQgb3JkZXJlZCBjb2xsZWN0aW9ucyAoc2luY2UgaXQgZm9yd2FyZHMgdGhlIGVxdWFscyBhcmd1bWVudClcbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5kZWxldGVFYWNoID0gZnVuY3Rpb24gKHZhbHVlcywgZXF1YWxzKSB7XG4gICAgdmFsdWVzLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHRoaXNbXCJkZWxldGVcIl0odmFsdWUsIGVxdWFscyk7XG4gICAgfSwgdGhpcyk7XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBhbGwgb2YgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnMgYXJlIGltcGxlbWVudGVkIGluIHRlcm1zIG9mIFwicmVkdWNlXCIuXG4vLyBzb21lIG5lZWQgXCJjb25zdHJ1Y3RDbG9uZVwiLlxuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuZm9yRWFjaCA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKiwgdGhpc3AqLykge1xuICAgIHZhciB0aGlzcCA9IGFyZ3VtZW50c1sxXTtcbiAgICByZXR1cm4gdGhpcy5yZWR1Y2UoZnVuY3Rpb24gKHVuZGVmaW5lZCwgdmFsdWUsIGtleSwgb2JqZWN0LCBkZXB0aCkge1xuICAgICAgICBjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwga2V5LCBvYmplY3QsIGRlcHRoKTtcbiAgICB9LCB1bmRlZmluZWQpO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLm1hcCA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKiwgdGhpc3AqLykge1xuICAgIHZhciB0aGlzcCA9IGFyZ3VtZW50c1sxXTtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgdGhpcy5yZWR1Y2UoZnVuY3Rpb24gKHVuZGVmaW5lZCwgdmFsdWUsIGtleSwgb2JqZWN0LCBkZXB0aCkge1xuICAgICAgICByZXN1bHQucHVzaChjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwga2V5LCBvYmplY3QsIGRlcHRoKSk7XG4gICAgfSwgdW5kZWZpbmVkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmVudW1lcmF0ZSA9IGZ1bmN0aW9uIChzdGFydCkge1xuICAgIGlmIChzdGFydCA9PSBudWxsKSB7XG4gICAgICAgIHN0YXJ0ID0gMDtcbiAgICB9XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHRoaXMucmVkdWNlKGZ1bmN0aW9uICh1bmRlZmluZWQsIHZhbHVlKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKFtzdGFydCsrLCB2YWx1ZV0pO1xuICAgIH0sIHVuZGVmaW5lZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5ncm91cCA9IGZ1bmN0aW9uIChjYWxsYmFjaywgdGhpc3AsIGVxdWFscykge1xuICAgIGVxdWFscyA9IGVxdWFscyB8fCBPYmplY3QuZXF1YWxzO1xuICAgIHZhciBncm91cHMgPSBbXTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAodmFsdWUsIGtleSwgb2JqZWN0KSB7XG4gICAgICAgIHZhciBrZXkgPSBjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwga2V5LCBvYmplY3QpO1xuICAgICAgICB2YXIgaW5kZXggPSBrZXlzLmluZGV4T2Yoa2V5LCBlcXVhbHMpO1xuICAgICAgICB2YXIgZ3JvdXA7XG4gICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgIGdyb3VwID0gW107XG4gICAgICAgICAgICBncm91cHMucHVzaChba2V5LCBncm91cF0pO1xuICAgICAgICAgICAga2V5cy5wdXNoKGtleSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBncm91cCA9IGdyb3Vwc1tpbmRleF1bMV07XG4gICAgICAgIH1cbiAgICAgICAgZ3JvdXAucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGdyb3Vwcztcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS50b0FycmF5ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLm1hcChGdW5jdGlvbi5pZGVudGl0eSk7XG59O1xuXG4vLyB0aGlzIGRlcGVuZHMgb24gc3RyaW5nYWJsZSBrZXlzLCB3aGljaCBhcHBseSB0byBBcnJheSBhbmQgSXRlcmF0b3Jcbi8vIGJlY2F1c2UgdGhleSBoYXZlIG51bWVyaWMga2V5cyBhbmQgYWxsIE1hcHMgc2luY2UgdGhleSBtYXkgdXNlXG4vLyBzdHJpbmdzIGFzIGtleXMuICBMaXN0LCBTZXQsIGFuZCBTb3J0ZWRTZXQgaGF2ZSBub2RlcyBmb3Iga2V5cywgc29cbi8vIHRvT2JqZWN0IHdvdWxkIG5vdCBiZSBtZWFuaW5nZnVsLlxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnRvT2JqZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBvYmplY3QgPSB7fTtcbiAgICB0aGlzLnJlZHVjZShmdW5jdGlvbiAodW5kZWZpbmVkLCB2YWx1ZSwga2V5KSB7XG4gICAgICAgIG9iamVjdFtrZXldID0gdmFsdWU7XG4gICAgfSwgdW5kZWZpbmVkKTtcbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmZpbHRlciA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKiwgdGhpc3AqLykge1xuICAgIHZhciB0aGlzcCA9IGFyZ3VtZW50c1sxXTtcbiAgICB2YXIgcmVzdWx0ID0gdGhpcy5jb25zdHJ1Y3RDbG9uZSgpO1xuICAgIHRoaXMucmVkdWNlKGZ1bmN0aW9uICh1bmRlZmluZWQsIHZhbHVlLCBrZXksIG9iamVjdCwgZGVwdGgpIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrLmNhbGwodGhpc3AsIHZhbHVlLCBrZXksIG9iamVjdCwgZGVwdGgpKSB7XG4gICAgICAgICAgICByZXN1bHQuYWRkKHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH0sIHVuZGVmaW5lZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5ldmVyeSA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKiwgdGhpc3AqLykge1xuICAgIHZhciB0aGlzcCA9IGFyZ3VtZW50c1sxXTtcbiAgICByZXR1cm4gdGhpcy5yZWR1Y2UoZnVuY3Rpb24gKHJlc3VsdCwgdmFsdWUsIGtleSwgb2JqZWN0LCBkZXB0aCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0ICYmIGNhbGxiYWNrLmNhbGwodGhpc3AsIHZhbHVlLCBrZXksIG9iamVjdCwgZGVwdGgpO1xuICAgIH0sIHRydWUpO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnNvbWUgPSBmdW5jdGlvbiAoY2FsbGJhY2sgLyosIHRoaXNwKi8pIHtcbiAgICB2YXIgdGhpc3AgPSBhcmd1bWVudHNbMV07XG4gICAgcmV0dXJuIHRoaXMucmVkdWNlKGZ1bmN0aW9uIChyZXN1bHQsIHZhbHVlLCBrZXksIG9iamVjdCwgZGVwdGgpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCB8fCBjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwga2V5LCBvYmplY3QsIGRlcHRoKTtcbiAgICB9LCBmYWxzZSk7XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuYWxsID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmV2ZXJ5KEJvb2xlYW4pO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmFueSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zb21lKEJvb2xlYW4pO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLm1pbiA9IGZ1bmN0aW9uIChjb21wYXJlKSB7XG4gICAgY29tcGFyZSA9IGNvbXBhcmUgfHwgdGhpcy5jb250ZW50Q29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcbiAgICB2YXIgZmlyc3QgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLnJlZHVjZShmdW5jdGlvbiAocmVzdWx0LCB2YWx1ZSkge1xuICAgICAgICBpZiAoZmlyc3QpIHtcbiAgICAgICAgICAgIGZpcnN0ID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gY29tcGFyZSh2YWx1ZSwgcmVzdWx0KSA8IDAgPyB2YWx1ZSA6IHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH0sIHVuZGVmaW5lZCk7XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUubWF4ID0gZnVuY3Rpb24gKGNvbXBhcmUpIHtcbiAgICBjb21wYXJlID0gY29tcGFyZSB8fCB0aGlzLmNvbnRlbnRDb21wYXJlIHx8IE9iamVjdC5jb21wYXJlO1xuICAgIHZhciBmaXJzdCA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXMucmVkdWNlKGZ1bmN0aW9uIChyZXN1bHQsIHZhbHVlKSB7XG4gICAgICAgIGlmIChmaXJzdCkge1xuICAgICAgICAgICAgZmlyc3QgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBjb21wYXJlKHZhbHVlLCByZXN1bHQpID4gMCA/IHZhbHVlIDogcmVzdWx0O1xuICAgICAgICB9XG4gICAgfSwgdW5kZWZpbmVkKTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5zdW0gPSBmdW5jdGlvbiAoemVybykge1xuICAgIHplcm8gPSB6ZXJvID09PSB1bmRlZmluZWQgPyAwIDogemVybztcbiAgICByZXR1cm4gdGhpcy5yZWR1Y2UoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgcmV0dXJuIGEgKyBiO1xuICAgIH0sIHplcm8pO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmF2ZXJhZ2UgPSBmdW5jdGlvbiAoemVybykge1xuICAgIHZhciBzdW0gPSB6ZXJvID09PSB1bmRlZmluZWQgPyAwIDogemVybztcbiAgICB2YXIgY291bnQgPSB6ZXJvID09PSB1bmRlZmluZWQgPyAwIDogemVybztcbiAgICB0aGlzLnJlZHVjZShmdW5jdGlvbiAodW5kZWZpbmVkLCB2YWx1ZSkge1xuICAgICAgICBzdW0gKz0gdmFsdWU7XG4gICAgICAgIGNvdW50ICs9IDE7XG4gICAgfSwgdW5kZWZpbmVkKTtcbiAgICByZXR1cm4gc3VtIC8gY291bnQ7XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuY29uY2F0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciByZXN1bHQgPSB0aGlzLmNvbnN0cnVjdENsb25lKHRoaXMpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlc3VsdC5hZGRFYWNoKGFyZ3VtZW50c1tpXSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuZmxhdHRlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMucmVkdWNlKGZ1bmN0aW9uIChyZXN1bHQsIGFycmF5KSB7XG4gICAgICAgIGFycmF5LmZvckVhY2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLnB1c2godmFsdWUpO1xuICAgICAgICB9LCByZXN1bHQsIHNlbGYpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sIFtdKTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS56aXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRhYmxlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICB0YWJsZS51bnNoaWZ0KHRoaXMpO1xuICAgIHJldHVybiBBcnJheS51bnppcCh0YWJsZSk7XG59XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5qb2luID0gZnVuY3Rpb24gKGRlbGltaXRlcikge1xuICAgIHJldHVybiB0aGlzLnJlZHVjZShmdW5jdGlvbiAocmVzdWx0LCBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIGRlbGltaXRlciArIHN0cmluZztcbiAgICB9KTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5zb3J0ZWQgPSBmdW5jdGlvbiAoY29tcGFyZSwgYnksIG9yZGVyKSB7XG4gICAgY29tcGFyZSA9IGNvbXBhcmUgfHwgdGhpcy5jb250ZW50Q29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcbiAgICAvLyBhY2NvdW50IGZvciBjb21wYXJhdG9ycyBnZW5lcmF0ZWQgYnkgRnVuY3Rpb24uYnlcbiAgICBpZiAoY29tcGFyZS5ieSkge1xuICAgICAgICBieSA9IGNvbXBhcmUuYnk7XG4gICAgICAgIGNvbXBhcmUgPSBjb21wYXJlLmNvbXBhcmUgfHwgdGhpcy5jb250ZW50Q29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBieSA9IGJ5IHx8IEZ1bmN0aW9uLmlkZW50aXR5O1xuICAgIH1cbiAgICBpZiAob3JkZXIgPT09IHVuZGVmaW5lZClcbiAgICAgICAgb3JkZXIgPSAxO1xuICAgIHJldHVybiB0aGlzLm1hcChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYnk6IGJ5KGl0ZW0pLFxuICAgICAgICAgICAgdmFsdWU6IGl0ZW1cbiAgICAgICAgfTtcbiAgICB9KVxuICAgIC5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgIHJldHVybiBjb21wYXJlKGEuYnksIGIuYnkpICogb3JkZXI7XG4gICAgfSlcbiAgICAubWFwKGZ1bmN0aW9uIChwYWlyKSB7XG4gICAgICAgIHJldHVybiBwYWlyLnZhbHVlO1xuICAgIH0pO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnJldmVyc2VkID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmNvbnN0cnVjdENsb25lKHRoaXMpLnJldmVyc2UoKTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uIChkZXB0aCwgbWVtbykge1xuICAgIGlmIChkZXB0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlcHRoID0gSW5maW5pdHk7XG4gICAgfSBlbHNlIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgdmFyIGNsb25lID0gdGhpcy5jb25zdHJ1Y3RDbG9uZSgpO1xuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAodmFsdWUsIGtleSkge1xuICAgICAgICBjbG9uZS5hZGQoT2JqZWN0LmNsb25lKHZhbHVlLCBkZXB0aCAtIDEsIG1lbW8pLCBrZXkpO1xuICAgIH0sIHRoaXMpO1xuICAgIHJldHVybiBjbG9uZTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5vbmx5ID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gdGhpcy5vbmUoKTtcbiAgICB9XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuaXRlcmF0b3IgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuaXRlcmF0ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xufTtcblxucmVxdWlyZShcIi4vc2hpbS1hcnJheVwiKTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBPYmplY3QgPSByZXF1aXJlKFwiLi9zaGltLW9iamVjdFwiKTtcbnZhciBNYXBDaGFuZ2VzID0gcmVxdWlyZShcIi4vbGlzdGVuL21hcC1jaGFuZ2VzXCIpO1xudmFyIFByb3BlcnR5Q2hhbmdlcyA9IHJlcXVpcmUoXCIuL2xpc3Rlbi9wcm9wZXJ0eS1jaGFuZ2VzXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEdlbmVyaWNNYXA7XG5mdW5jdGlvbiBHZW5lcmljTWFwKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNvbnN0cnVjdC4gR2VuZXJpY01hcCBpcyBhIG1peGluLlwiKTtcbn1cblxuT2JqZWN0LmFkZEVhY2goR2VuZXJpY01hcC5wcm90b3R5cGUsIE1hcENoYW5nZXMucHJvdG90eXBlKTtcbk9iamVjdC5hZGRFYWNoKEdlbmVyaWNNYXAucHJvdG90eXBlLCBQcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlKTtcblxuLy8gYWxsIG9mIHRoZXNlIG1ldGhvZHMgZGVwZW5kIG9uIHRoZSBjb25zdHJ1Y3RvciBwcm92aWRpbmcgYSBgc3RvcmVgIHNldFxuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5pc01hcCA9IHRydWU7XG5cbkdlbmVyaWNNYXAucHJvdG90eXBlLmFkZEVhY2ggPSBmdW5jdGlvbiAodmFsdWVzKSB7XG4gICAgaWYgKHZhbHVlcyAmJiBPYmplY3QodmFsdWVzKSA9PT0gdmFsdWVzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVzLmZvckVhY2ggPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgLy8gY29weSBtYXAtYWxpa2VzXG4gICAgICAgICAgICBpZiAodmFsdWVzLmlzTWFwID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICAvLyBpdGVyYXRlIGtleSB2YWx1ZSBwYWlycyBvZiBvdGhlciBpdGVyYWJsZXNcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLmZvckVhY2goZnVuY3Rpb24gKHBhaXIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXQocGFpclswXSwgcGFpclsxXSk7XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBjb3B5IG90aGVyIG9iamVjdHMgYXMgbWFwLWFsaWtlc1xuICAgICAgICAgICAgT2JqZWN0LmtleXModmFsdWVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldChrZXksIHZhbHVlc1trZXldKTtcbiAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufVxuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsdWUpIHtcbiAgICB2YXIgaXRlbSA9IHRoaXMuc3RvcmUuZ2V0KG5ldyB0aGlzLkl0ZW0oa2V5KSk7XG4gICAgaWYgKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0udmFsdWU7XG4gICAgfSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHQoa2V5KTtcbiAgICB9XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgIHZhciBpdGVtID0gbmV3IHRoaXMuSXRlbShrZXksIHZhbHVlKTtcbiAgICB2YXIgZm91bmQgPSB0aGlzLnN0b3JlLmdldChpdGVtKTtcbiAgICB2YXIgZ3JldyA9IGZhbHNlO1xuICAgIGlmIChmb3VuZCkgeyAvLyB1cGRhdGVcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hCZWZvcmVNYXBDaGFuZ2Uoa2V5LCBmb3VuZC52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZm91bmQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hNYXBDaGFuZ2Uoa2V5LCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgeyAvLyBjcmVhdGVcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hCZWZvcmVNYXBDaGFuZ2Uoa2V5LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnN0b3JlLmFkZChpdGVtKSkge1xuICAgICAgICAgICAgdGhpcy5sZW5ndGgrKztcbiAgICAgICAgICAgIGdyZXcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoTWFwQ2hhbmdlKGtleSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBncmV3O1xufTtcblxuR2VuZXJpY01hcC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICByZXR1cm4gdGhpcy5zZXQoa2V5LCB2YWx1ZSk7XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuc3RvcmUuaGFzKG5ldyB0aGlzLkl0ZW0oa2V5KSk7XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZVsnZGVsZXRlJ10gPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIGl0ZW0gPSBuZXcgdGhpcy5JdGVtKGtleSk7XG4gICAgaWYgKHRoaXMuc3RvcmUuaGFzKGl0ZW0pKSB7XG4gICAgICAgIHZhciBmcm9tID0gdGhpcy5zdG9yZS5nZXQoaXRlbSkudmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgZnJvbSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdG9yZVtcImRlbGV0ZVwiXShpdGVtKTtcbiAgICAgICAgdGhpcy5sZW5ndGgtLTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hNYXBDaGFuZ2Uoa2V5LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIga2V5cztcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzTWFwQ2hhbmdlcykge1xuICAgICAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hCZWZvcmVNYXBDaGFuZ2Uoa2V5LCB2YWx1ZSk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICBrZXlzID0gdGhpcy5rZXlzKCk7XG4gICAgfVxuICAgIHRoaXMuc3RvcmUuY2xlYXIoKTtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hNYXBDaGFuZ2Uoa2V5KTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxufTtcblxuR2VuZXJpY01hcC5wcm90b3R5cGUucmVkdWNlID0gZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcywgdGhpc3ApIHtcbiAgICByZXR1cm4gdGhpcy5zdG9yZS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2lzLCBpdGVtKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHRoaXNwLCBiYXNpcywgaXRlbS52YWx1ZSwgaXRlbS5rZXksIHRoaXMpO1xuICAgIH0sIGJhc2lzLCB0aGlzKTtcbn07XG5cbkdlbmVyaWNNYXAucHJvdG90eXBlLnJlZHVjZVJpZ2h0ID0gZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcywgdGhpc3ApIHtcbiAgICByZXR1cm4gdGhpcy5zdG9yZS5yZWR1Y2VSaWdodChmdW5jdGlvbiAoYmFzaXMsIGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwodGhpc3AsIGJhc2lzLCBpdGVtLnZhbHVlLCBpdGVtLmtleSwgdGhpcyk7XG4gICAgfSwgYmFzaXMsIHRoaXMpO1xufTtcblxuR2VuZXJpY01hcC5wcm90b3R5cGUua2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5tYXAoZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgcmV0dXJuIGtleTtcbiAgICB9KTtcbn07XG5cbkdlbmVyaWNNYXAucHJvdG90eXBlLnZhbHVlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5tYXAoRnVuY3Rpb24uaWRlbnRpdHkpO1xufTtcblxuR2VuZXJpY01hcC5wcm90b3R5cGUuZW50cmllcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5tYXAoZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgcmV0dXJuIFtrZXksIHZhbHVlXTtcbiAgICB9KTtcbn07XG5cbi8vIFhYWCBkZXByZWNhdGVkXG5HZW5lcmljTWFwLnByb3RvdHlwZS5pdGVtcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5lbnRyaWVzKCk7XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbiAodGhhdCwgZXF1YWxzKSB7XG4gICAgZXF1YWxzID0gZXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgaWYgKHRoaXMgPT09IHRoYXQpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIGlmIChPYmplY3QuY2FuKHRoYXQsIFwiZXZlcnlcIikpIHtcbiAgICAgICAgcmV0dXJuIHRoYXQubGVuZ3RoID09PSB0aGlzLmxlbmd0aCAmJiB0aGF0LmV2ZXJ5KGZ1bmN0aW9uICh2YWx1ZSwga2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gZXF1YWxzKHRoaXMuZ2V0KGtleSksIHZhbHVlKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh0aGF0KTtcbiAgICAgICAgcmV0dXJuIGtleXMubGVuZ3RoID09PSB0aGlzLmxlbmd0aCAmJiBPYmplY3Qua2V5cyh0aGF0KS5ldmVyeShmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gZXF1YWxzKHRoaXMuZ2V0KGtleSksIHRoYXRba2V5XSk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH1cbn07XG5cbkdlbmVyaWNNYXAucHJvdG90eXBlLkl0ZW0gPSBJdGVtO1xuXG5mdW5jdGlvbiBJdGVtKGtleSwgdmFsdWUpIHtcbiAgICB0aGlzLmtleSA9IGtleTtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG59XG5cbkl0ZW0ucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5lcXVhbHModGhpcy5rZXksIHRoYXQua2V5KSAmJiBPYmplY3QuZXF1YWxzKHRoaXMudmFsdWUsIHRoYXQudmFsdWUpO1xufTtcblxuSXRlbS5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5jb21wYXJlKHRoaXMua2V5LCB0aGF0LmtleSk7XG59O1xuXG4iLCJcbnZhciBPYmplY3QgPSByZXF1aXJlKFwiLi9zaGltLW9iamVjdFwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBHZW5lcmljT3JkZXI7XG5mdW5jdGlvbiBHZW5lcmljT3JkZXIoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY29uc3RydWN0LiBHZW5lcmljT3JkZXIgaXMgYSBtaXhpbi5cIik7XG59XG5cbkdlbmVyaWNPcmRlci5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKHRoYXQsIGVxdWFscykge1xuICAgIGVxdWFscyA9IGVxdWFscyB8fCB0aGlzLmNvbnRlbnRFcXVhbHMgfHwgT2JqZWN0LmVxdWFscztcblxuICAgIGlmICh0aGlzID09PSB0aGF0KSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoIXRoYXQpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gKFxuICAgICAgICB0aGlzLmxlbmd0aCA9PT0gdGhhdC5sZW5ndGggJiZcbiAgICAgICAgdGhpcy56aXAodGhhdCkuZXZlcnkoZnVuY3Rpb24gKHBhaXIpIHtcbiAgICAgICAgICAgIHJldHVybiBlcXVhbHMocGFpclswXSwgcGFpclsxXSk7XG4gICAgICAgIH0pXG4gICAgKTtcbn07XG5cbkdlbmVyaWNPcmRlci5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uICh0aGF0LCBjb21wYXJlKSB7XG4gICAgY29tcGFyZSA9IGNvbXBhcmUgfHwgdGhpcy5jb250ZW50Q29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcblxuICAgIGlmICh0aGlzID09PSB0aGF0KSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBpZiAoIXRoYXQpIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgdmFyIGxlbmd0aCA9IE1hdGgubWluKHRoaXMubGVuZ3RoLCB0aGF0Lmxlbmd0aCk7XG4gICAgdmFyIGNvbXBhcmlzb24gPSB0aGlzLnppcCh0aGF0KS5yZWR1Y2UoZnVuY3Rpb24gKGNvbXBhcmlzb24sIHBhaXIsIGluZGV4KSB7XG4gICAgICAgIGlmIChjb21wYXJpc29uID09PSAwKSB7XG4gICAgICAgICAgICBpZiAoaW5kZXggPj0gbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmlzb247XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb21wYXJlKHBhaXJbMF0sIHBhaXJbMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmlzb247XG4gICAgICAgIH1cbiAgICB9LCAwKTtcbiAgICBpZiAoY29tcGFyaXNvbiA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sZW5ndGggLSB0aGF0Lmxlbmd0aDtcbiAgICB9XG4gICAgcmV0dXJuIGNvbXBhcmlzb247XG59O1xuXG4iLCJcbm1vZHVsZS5leHBvcnRzID0gR2VuZXJpY1NldDtcbmZ1bmN0aW9uIEdlbmVyaWNTZXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY29uc3RydWN0LiBHZW5lcmljU2V0IGlzIGEgbWl4aW4uXCIpO1xufVxuXG5HZW5lcmljU2V0LnByb3RvdHlwZS51bmlvbiA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgdmFyIHVuaW9uID0gIHRoaXMuY29uc3RydWN0Q2xvbmUodGhpcyk7XG4gICAgdW5pb24uYWRkRWFjaCh0aGF0KTtcbiAgICByZXR1cm4gdW5pb247XG59O1xuXG5HZW5lcmljU2V0LnByb3RvdHlwZS5pbnRlcnNlY3Rpb24gPSBmdW5jdGlvbiAodGhhdCkge1xuICAgIHJldHVybiB0aGlzLmNvbnN0cnVjdENsb25lKHRoaXMuZmlsdGVyKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhhdC5oYXModmFsdWUpO1xuICAgIH0pKTtcbn07XG5cbkdlbmVyaWNTZXQucHJvdG90eXBlLmRpZmZlcmVuY2UgPSBmdW5jdGlvbiAodGhhdCkge1xuICAgIHZhciB1bmlvbiA9ICB0aGlzLmNvbnN0cnVjdENsb25lKHRoaXMpO1xuICAgIHVuaW9uLmRlbGV0ZUVhY2godGhhdCk7XG4gICAgcmV0dXJuIHVuaW9uO1xufTtcblxuR2VuZXJpY1NldC5wcm90b3R5cGUuc3ltbWV0cmljRGlmZmVyZW5jZSA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgdmFyIHVuaW9uID0gdGhpcy51bmlvbih0aGF0KTtcbiAgICB2YXIgaW50ZXJzZWN0aW9uID0gdGhpcy5pbnRlcnNlY3Rpb24odGhhdCk7XG4gICAgcmV0dXJuIHVuaW9uLmRpZmZlcmVuY2UoaW50ZXJzZWN0aW9uKTtcbn07XG5cbkdlbmVyaWNTZXQucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uICh0aGF0LCBlcXVhbHMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIChcbiAgICAgICAgT2JqZWN0LmNhbih0aGF0LCBcInJlZHVjZVwiKSAmJlxuICAgICAgICB0aGlzLmxlbmd0aCA9PT0gdGhhdC5sZW5ndGggJiZcbiAgICAgICAgdGhhdC5yZWR1Y2UoZnVuY3Rpb24gKGVxdWFsLCB2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGVxdWFsICYmIHNlbGYuaGFzKHZhbHVlLCBlcXVhbHMpO1xuICAgICAgICB9LCB0cnVlKVxuICAgICk7XG59O1xuXG4vLyBXM0MgRE9NVG9rZW5MaXN0IEFQSSBvdmVybGFwIChkb2VzIG5vdCBoYW5kbGUgdmFyaWFkaWMgYXJndW1lbnRzKVxuXG5HZW5lcmljU2V0LnByb3RvdHlwZS5jb250YWlucyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiB0aGlzLmhhcyh2YWx1ZSk7XG59O1xuXG5HZW5lcmljU2V0LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gdGhpc1tcImRlbGV0ZVwiXSh2YWx1ZSk7XG59O1xuXG5HZW5lcmljU2V0LnByb3RvdHlwZS50b2dnbGUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICBpZiAodGhpcy5oYXModmFsdWUpKSB7XG4gICAgICAgIHRoaXNbXCJkZWxldGVcIl0odmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYWRkKHZhbHVlKTtcbiAgICB9XG59O1xuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBMaXN0O1xuXG52YXIgU2hpbSA9IHJlcXVpcmUoXCIuL3NoaW1cIik7XG52YXIgR2VuZXJpY0NvbGxlY3Rpb24gPSByZXF1aXJlKFwiLi9nZW5lcmljLWNvbGxlY3Rpb25cIik7XG52YXIgR2VuZXJpY09yZGVyID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1vcmRlclwiKTtcbnZhciBQcm9wZXJ0eUNoYW5nZXMgPSByZXF1aXJlKFwiLi9saXN0ZW4vcHJvcGVydHktY2hhbmdlc1wiKTtcbnZhciBSYW5nZUNoYW5nZXMgPSByZXF1aXJlKFwiLi9saXN0ZW4vcmFuZ2UtY2hhbmdlc1wiKTtcblxuZnVuY3Rpb24gTGlzdCh2YWx1ZXMsIGVxdWFscywgZ2V0RGVmYXVsdCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBMaXN0KSkge1xuICAgICAgICByZXR1cm4gbmV3IExpc3QodmFsdWVzLCBlcXVhbHMsIGdldERlZmF1bHQpO1xuICAgIH1cbiAgICB2YXIgaGVhZCA9IHRoaXMuaGVhZCA9IG5ldyB0aGlzLk5vZGUoKTtcbiAgICBoZWFkLm5leHQgPSBoZWFkO1xuICAgIGhlYWQucHJldiA9IGhlYWQ7XG4gICAgdGhpcy5jb250ZW50RXF1YWxzID0gZXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgdGhpcy5nZXREZWZhdWx0ID0gZ2V0RGVmYXVsdCB8fCBGdW5jdGlvbi5ub29wO1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmFkZEVhY2godmFsdWVzKTtcbn1cblxuTGlzdC5MaXN0ID0gTGlzdDsgLy8gaGFjayBzbyByZXF1aXJlKFwibGlzdFwiKS5MaXN0IHdpbGwgd29yayBpbiBNb250YWdlSlNcblxuT2JqZWN0LmFkZEVhY2goTGlzdC5wcm90b3R5cGUsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChMaXN0LnByb3RvdHlwZSwgR2VuZXJpY09yZGVyLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChMaXN0LnByb3RvdHlwZSwgUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChMaXN0LnByb3RvdHlwZSwgUmFuZ2VDaGFuZ2VzLnByb3RvdHlwZSk7XG5cbkxpc3QucHJvdG90eXBlLmNvbnN0cnVjdENsb25lID0gZnVuY3Rpb24gKHZhbHVlcykge1xuICAgIHJldHVybiBuZXcgdGhpcy5jb25zdHJ1Y3Rvcih2YWx1ZXMsIHRoaXMuY29udGVudEVxdWFscywgdGhpcy5nZXREZWZhdWx0KTtcbn07XG5cbkxpc3QucHJvdG90eXBlLmZpbmQgPSBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIGVxdWFscyA9IGVxdWFscyB8fCB0aGlzLmNvbnRlbnRFcXVhbHM7XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgdmFyIGF0ID0gaGVhZC5uZXh0O1xuICAgIHdoaWxlIChhdCAhPT0gaGVhZCkge1xuICAgICAgICBpZiAoZXF1YWxzKGF0LnZhbHVlLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBhdDtcbiAgICAgICAgfVxuICAgICAgICBhdCA9IGF0Lm5leHQ7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUuZmluZExhc3QgPSBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIGVxdWFscyA9IGVxdWFscyB8fCB0aGlzLmNvbnRlbnRFcXVhbHM7XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgdmFyIGF0ID0gaGVhZC5wcmV2O1xuICAgIHdoaWxlIChhdCAhPT0gaGVhZCkge1xuICAgICAgICBpZiAoZXF1YWxzKGF0LnZhbHVlLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBhdDtcbiAgICAgICAgfVxuICAgICAgICBhdCA9IGF0LnByZXY7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUuaGFzID0gZnVuY3Rpb24gKHZhbHVlLCBlcXVhbHMpIHtcbiAgICByZXR1cm4gISF0aGlzLmZpbmQodmFsdWUsIGVxdWFscyk7XG59O1xuXG5MaXN0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIHZhciBmb3VuZCA9IHRoaXMuZmluZCh2YWx1ZSwgZXF1YWxzKTtcbiAgICBpZiAoZm91bmQpIHtcbiAgICAgICAgcmV0dXJuIGZvdW5kLnZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0KHZhbHVlKTtcbn07XG5cbi8vIExJRk8gKGRlbGV0ZSByZW1vdmVzIHRoZSBtb3N0IHJlY2VudGx5IGFkZGVkIGVxdWl2YWxlbnQgdmFsdWUpXG5MaXN0LnByb3RvdHlwZVsnZGVsZXRlJ10gPSBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIHZhciBmb3VuZCA9IHRoaXMuZmluZExhc3QodmFsdWUsIGVxdWFscyk7XG4gICAgaWYgKGZvdW5kKSB7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgICAgIHZhciBwbHVzID0gW107XG4gICAgICAgICAgICB2YXIgbWludXMgPSBbdmFsdWVdO1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaEJlZm9yZVJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCBmb3VuZC5pbmRleCk7XG4gICAgICAgIH1cbiAgICAgICAgZm91bmRbJ2RlbGV0ZSddKCk7XG4gICAgICAgIHRoaXMubGVuZ3RoLS07XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSW5kZXhlcyhmb3VuZC5uZXh0LCBmb3VuZC5pbmRleCk7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGZvdW5kLmluZGV4KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcblxuTGlzdC5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBsdXMsIG1pbnVzO1xuICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgbWludXMgPSB0aGlzLnRvQXJyYXkoKTtcbiAgICAgICAgcGx1cyA9IFtdO1xuICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIDApO1xuICAgIH1cbiAgICB0aGlzLmhlYWQubmV4dCA9IHRoaXMuaGVhZC5wcmV2ID0gdGhpcy5oZWFkO1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2hSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgMCk7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIG5vZGUgPSBuZXcgdGhpcy5Ob2RlKHZhbHVlKVxuICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgbm9kZS5pbmRleCA9IHRoaXMubGVuZ3RoO1xuICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UoW3ZhbHVlXSwgW10sIG5vZGUuaW5kZXgpO1xuICAgIH1cbiAgICB0aGlzLmhlYWQuYWRkQmVmb3JlKG5vZGUpO1xuICAgIHRoaXMubGVuZ3RoKys7XG4gICAgaWYgKHRoaXMuZGlzcGF0Y2hlc1JhbmdlQ2hhbmdlcykge1xuICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UoW3ZhbHVlXSwgW10sIG5vZGUuaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbkxpc3QucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgaWYgKHRoaXMuZGlzcGF0Y2hlc1JhbmdlQ2hhbmdlcykge1xuICAgICAgICB2YXIgcGx1cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBtaW51cyA9IFtdXG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMubGVuZ3RoO1xuICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGluZGV4KTtcbiAgICAgICAgdmFyIHN0YXJ0ID0gdGhpcy5oZWFkLnByZXY7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgdmFyIG5vZGUgPSBuZXcgdGhpcy5Ob2RlKHZhbHVlKTtcbiAgICAgICAgaGVhZC5hZGRCZWZvcmUobm9kZSk7XG4gICAgfVxuICAgIHRoaXMubGVuZ3RoICs9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgaWYgKHRoaXMuZGlzcGF0Y2hlc1JhbmdlQ2hhbmdlcykge1xuICAgICAgICB0aGlzLnVwZGF0ZUluZGV4ZXMoc3RhcnQubmV4dCwgc3RhcnQuaW5kZXggPT09IHVuZGVmaW5lZCA/IDAgOiBzdGFydC5pbmRleCArIDEpO1xuICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGluZGV4KTtcbiAgICB9XG59O1xuXG5MaXN0LnByb3RvdHlwZS51bnNoaWZ0ID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgdmFyIHBsdXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICB2YXIgbWludXMgPSBbXTtcbiAgICAgICAgdGhpcy5kaXNwYXRjaEJlZm9yZVJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCAwKTtcbiAgICB9XG4gICAgdmFyIGF0ID0gdGhpcy5oZWFkO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgdmFyIG5vZGUgPSBuZXcgdGhpcy5Ob2RlKHZhbHVlKTtcbiAgICAgICAgYXQuYWRkQWZ0ZXIobm9kZSk7XG4gICAgICAgIGF0ID0gbm9kZTtcbiAgICB9XG4gICAgdGhpcy5sZW5ndGggKz0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIHRoaXMudXBkYXRlSW5kZXhlcyh0aGlzLmhlYWQubmV4dCwgMCk7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2hSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgMCk7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUucG9wID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB2YWx1ZTtcbiAgICB2YXIgaGVhZCA9IHRoaXMuaGVhZDtcbiAgICBpZiAoaGVhZC5wcmV2ICE9PSBoZWFkKSB7XG4gICAgICAgIHZhbHVlID0gaGVhZC5wcmV2LnZhbHVlO1xuICAgICAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgICAgICB2YXIgcGx1cyA9IFtdO1xuICAgICAgICAgICAgdmFyIG1pbnVzID0gW3ZhbHVlXTtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hCZWZvcmVSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgaW5kZXgpO1xuICAgICAgICB9XG4gICAgICAgIGhlYWQucHJldlsnZGVsZXRlJ10oKTtcbiAgICAgICAgdGhpcy5sZW5ndGgtLTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc1JhbmdlQ2hhbmdlcykge1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaFJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCBpbmRleCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufTtcblxuTGlzdC5wcm90b3R5cGUuc2hpZnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHZhbHVlO1xuICAgIHZhciBoZWFkID0gdGhpcy5oZWFkO1xuICAgIGlmIChoZWFkLnByZXYgIT09IGhlYWQpIHtcbiAgICAgICAgdmFsdWUgPSBoZWFkLm5leHQudmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgICAgIHZhciBwbHVzID0gW107XG4gICAgICAgICAgICB2YXIgbWludXMgPSBbdmFsdWVdO1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaEJlZm9yZVJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCAwKTtcbiAgICAgICAgfVxuICAgICAgICBoZWFkLm5leHRbJ2RlbGV0ZSddKCk7XG4gICAgICAgIHRoaXMubGVuZ3RoLS07XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSW5kZXhlcyh0aGlzLmhlYWQubmV4dCwgMCk7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIDApO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn07XG5cbkxpc3QucHJvdG90eXBlLnBlZWsgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuaGVhZCAhPT0gdGhpcy5oZWFkLm5leHQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGVhZC5uZXh0LnZhbHVlO1xuICAgIH1cbn07XG5cbkxpc3QucHJvdG90eXBlLnBva2UgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICBpZiAodGhpcy5oZWFkICE9PSB0aGlzLmhlYWQubmV4dCkge1xuICAgICAgICB0aGlzLmhlYWQubmV4dC52YWx1ZSA9IHZhbHVlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucHVzaCh2YWx1ZSk7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUub25lID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnBlZWsoKTtcbn07XG5cbi8vIGFuIGludGVybmFsIHV0aWxpdHkgZm9yIGNvZXJjaW5nIGluZGV4IG9mZnNldHMgdG8gbm9kZXNcbkxpc3QucHJvdG90eXBlLnNjYW4gPSBmdW5jdGlvbiAoYXQsIGZhbGxiYWNrKSB7XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgaWYgKHR5cGVvZiBhdCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICB2YXIgY291bnQgPSBhdDtcbiAgICAgICAgaWYgKGNvdW50ID49IDApIHtcbiAgICAgICAgICAgIGF0ID0gaGVhZC5uZXh0O1xuICAgICAgICAgICAgd2hpbGUgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgY291bnQtLTtcbiAgICAgICAgICAgICAgICBhdCA9IGF0Lm5leHQ7XG4gICAgICAgICAgICAgICAgaWYgKGF0ID09IGhlYWQpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXQgPSBoZWFkO1xuICAgICAgICAgICAgd2hpbGUgKGNvdW50IDwgMCkge1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICAgICAgYXQgPSBhdC5wcmV2O1xuICAgICAgICAgICAgICAgIGlmIChhdCA9PSBoZWFkKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXQ7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGF0IHx8IGZhbGxiYWNrO1xuICAgIH1cbn07XG5cbi8vIGF0IGFuZCBlbmQgbWF5IGJvdGggYmUgcG9zaXRpdmUgb3IgbmVnYXRpdmUgbnVtYmVycyAoaW4gd2hpY2ggY2FzZXMgdGhleVxuLy8gY29ycmVzcG9uZCB0byBudW1lcmljIGluZGljaWVzLCBvciBub2Rlcylcbkxpc3QucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKGF0LCBlbmQpIHtcbiAgICB2YXIgc2xpY2VkID0gW107XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgYXQgPSB0aGlzLnNjYW4oYXQsIGhlYWQubmV4dCk7XG4gICAgZW5kID0gdGhpcy5zY2FuKGVuZCwgaGVhZCk7XG5cbiAgICB3aGlsZSAoYXQgIT09IGVuZCAmJiBhdCAhPT0gaGVhZCkge1xuICAgICAgICBzbGljZWQucHVzaChhdC52YWx1ZSk7XG4gICAgICAgIGF0ID0gYXQubmV4dDtcbiAgICB9XG5cbiAgICByZXR1cm4gc2xpY2VkO1xufTtcblxuTGlzdC5wcm90b3R5cGUuc3BsaWNlID0gZnVuY3Rpb24gKGF0LCBsZW5ndGggLyouLi5wbHVzKi8pIHtcbiAgICByZXR1cm4gdGhpcy5zd2FwKGF0LCBsZW5ndGgsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMikpO1xufTtcblxuTGlzdC5wcm90b3R5cGUuc3dhcCA9IGZ1bmN0aW9uIChzdGFydCwgbGVuZ3RoLCBwbHVzKSB7XG4gICAgdmFyIGluaXRpYWwgPSBzdGFydDtcbiAgICAvLyBzdGFydCB3aWxsIGJlIGhlYWQgaWYgc3RhcnQgaXMgbnVsbCBvciAtMSAobWVhbmluZyBmcm9tIHRoZSBlbmQpLCBidXRcbiAgICAvLyB3aWxsIGJlIGhlYWQubmV4dCBpZiBzdGFydCBpcyAwIChtZWFuaW5nIGZyb20gdGhlIGJlZ2lubmluZylcbiAgICBzdGFydCA9IHRoaXMuc2NhbihzdGFydCwgdGhpcy5oZWFkKTtcbiAgICBpZiAobGVuZ3RoID09IG51bGwpIHtcbiAgICAgICAgbGVuZ3RoID0gSW5maW5pdHk7XG4gICAgfVxuICAgIHBsdXMgPSBBcnJheS5mcm9tKHBsdXMpO1xuXG4gICAgLy8gY29sbGVjdCB0aGUgbWludXMgYXJyYXlcbiAgICB2YXIgbWludXMgPSBbXTtcbiAgICB2YXIgYXQgPSBzdGFydDtcbiAgICB3aGlsZSAobGVuZ3RoLS0gJiYgbGVuZ3RoID49IDAgJiYgYXQgIT09IHRoaXMuaGVhZCkge1xuICAgICAgICBtaW51cy5wdXNoKGF0LnZhbHVlKTtcbiAgICAgICAgYXQgPSBhdC5uZXh0O1xuICAgIH1cblxuICAgIC8vIGJlZm9yZSByYW5nZSBjaGFuZ2VcbiAgICB2YXIgaW5kZXgsIHN0YXJ0Tm9kZTtcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gdGhpcy5oZWFkKSB7XG4gICAgICAgICAgICBpbmRleCA9IHRoaXMubGVuZ3RoO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0LnByZXYgPT09IHRoaXMuaGVhZCkge1xuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5kZXggPSBzdGFydC5pbmRleDtcbiAgICAgICAgfVxuICAgICAgICBzdGFydE5vZGUgPSBzdGFydC5wcmV2O1xuICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGluZGV4KTtcbiAgICB9XG5cbiAgICAvLyBkZWxldGUgbWludXNcbiAgICB2YXIgYXQgPSBzdGFydDtcbiAgICBmb3IgKHZhciBpID0gMCwgYXQgPSBzdGFydDsgaSA8IG1pbnVzLmxlbmd0aDsgaSsrLCBhdCA9IGF0Lm5leHQpIHtcbiAgICAgICAgYXRbXCJkZWxldGVcIl0oKTtcbiAgICB9XG4gICAgLy8gYWRkIHBsdXNcbiAgICBpZiAoaW5pdGlhbCA9PSBudWxsICYmIGF0ID09PSB0aGlzLmhlYWQpIHtcbiAgICAgICAgYXQgPSB0aGlzLmhlYWQubmV4dDtcbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwbHVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBub2RlID0gbmV3IHRoaXMuTm9kZShwbHVzW2ldKTtcbiAgICAgICAgYXQuYWRkQmVmb3JlKG5vZGUpO1xuICAgIH1cbiAgICAvLyBhZGp1c3QgbGVuZ3RoXG4gICAgdGhpcy5sZW5ndGggKz0gcGx1cy5sZW5ndGggLSBtaW51cy5sZW5ndGg7XG5cbiAgICAvLyBhZnRlciByYW5nZSBjaGFuZ2VcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gdGhpcy5oZWFkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUluZGV4ZXModGhpcy5oZWFkLm5leHQsIDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVJbmRleGVzKHN0YXJ0Tm9kZS5uZXh0LCBzdGFydE5vZGUuaW5kZXggKyAxKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGluZGV4KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbWludXM7XG59O1xuXG5MaXN0LnByb3RvdHlwZS5yZXZlcnNlID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgdmFyIG1pbnVzID0gdGhpcy50b0FycmF5KCk7XG4gICAgICAgIHZhciBwbHVzID0gbWludXMucmV2ZXJzZWQoKTtcbiAgICAgICAgdGhpcy5kaXNwYXRjaEJlZm9yZVJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCAwKTtcbiAgICB9XG4gICAgdmFyIGF0ID0gdGhpcy5oZWFkO1xuICAgIGRvIHtcbiAgICAgICAgdmFyIHRlbXAgPSBhdC5uZXh0O1xuICAgICAgICBhdC5uZXh0ID0gYXQucHJldjtcbiAgICAgICAgYXQucHJldiA9IHRlbXA7XG4gICAgICAgIGF0ID0gYXQubmV4dDtcbiAgICB9IHdoaWxlIChhdCAhPT0gdGhpcy5oZWFkKTtcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2hSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgMCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufTtcblxuTGlzdC5wcm90b3R5cGUuc29ydCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnN3YXAoMCwgdGhpcy5sZW5ndGgsIHRoaXMuc29ydGVkKCkpO1xufTtcblxuLy8gVE9ETyBhY2NvdW50IGZvciBtaXNzaW5nIGJhc2lzIGFyZ3VtZW50XG5MaXN0LnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIGJhc2lzIC8qLCB0aGlzcCovKSB7XG4gICAgdmFyIHRoaXNwID0gYXJndW1lbnRzWzJdO1xuICAgIHZhciBoZWFkID0gdGhpcy5oZWFkO1xuICAgIHZhciBhdCA9IGhlYWQubmV4dDtcbiAgICB3aGlsZSAoYXQgIT09IGhlYWQpIHtcbiAgICAgICAgYmFzaXMgPSBjYWxsYmFjay5jYWxsKHRoaXNwLCBiYXNpcywgYXQudmFsdWUsIGF0LCB0aGlzKTtcbiAgICAgICAgYXQgPSBhdC5uZXh0O1xuICAgIH1cbiAgICByZXR1cm4gYmFzaXM7XG59O1xuXG5MaXN0LnByb3RvdHlwZS5yZWR1Y2VSaWdodCA9IGZ1bmN0aW9uIChjYWxsYmFjaywgYmFzaXMgLyosIHRoaXNwKi8pIHtcbiAgICB2YXIgdGhpc3AgPSBhcmd1bWVudHNbMl07XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgdmFyIGF0ID0gaGVhZC5wcmV2O1xuICAgIHdoaWxlIChhdCAhPT0gaGVhZCkge1xuICAgICAgICBiYXNpcyA9IGNhbGxiYWNrLmNhbGwodGhpc3AsIGJhc2lzLCBhdC52YWx1ZSwgYXQsIHRoaXMpO1xuICAgICAgICBhdCA9IGF0LnByZXY7XG4gICAgfVxuICAgIHJldHVybiBiYXNpcztcbn07XG5cbkxpc3QucHJvdG90eXBlLnVwZGF0ZUluZGV4ZXMgPSBmdW5jdGlvbiAobm9kZSwgaW5kZXgpIHtcbiAgICB3aGlsZSAobm9kZSAhPT0gdGhpcy5oZWFkKSB7XG4gICAgICAgIG5vZGUuaW5kZXggPSBpbmRleCsrO1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0O1xuICAgIH1cbn07XG5cbkxpc3QucHJvdG90eXBlLm1ha2VPYnNlcnZhYmxlID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuaGVhZC5pbmRleCA9IC0xO1xuICAgIHRoaXMudXBkYXRlSW5kZXhlcyh0aGlzLmhlYWQubmV4dCwgMCk7XG4gICAgdGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzID0gdHJ1ZTtcbn07XG5cbkxpc3QucHJvdG90eXBlLml0ZXJhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBMaXN0SXRlcmF0b3IodGhpcy5oZWFkKTtcbn07XG5cbmZ1bmN0aW9uIExpc3RJdGVyYXRvcihoZWFkKSB7XG4gICAgdGhpcy5oZWFkID0gaGVhZDtcbiAgICB0aGlzLmF0ID0gaGVhZC5uZXh0O1xufTtcblxuTGlzdEl0ZXJhdG9yLnByb3RvdHlwZS5uZXh0ID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmF0ID09PSB0aGlzLmhlYWQpIHtcbiAgICAgICAgdGhyb3cgU3RvcEl0ZXJhdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgdmFsdWUgPSB0aGlzLmF0LnZhbHVlO1xuICAgICAgICB0aGlzLmF0ID0gdGhpcy5hdC5uZXh0O1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUuTm9kZSA9IE5vZGU7XG5cbmZ1bmN0aW9uIE5vZGUodmFsdWUpIHtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gICAgdGhpcy5wcmV2ID0gbnVsbDtcbiAgICB0aGlzLm5leHQgPSBudWxsO1xufTtcblxuTm9kZS5wcm90b3R5cGVbJ2RlbGV0ZSddID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMucHJldi5uZXh0ID0gdGhpcy5uZXh0O1xuICAgIHRoaXMubmV4dC5wcmV2ID0gdGhpcy5wcmV2O1xufTtcblxuTm9kZS5wcm90b3R5cGUuYWRkQmVmb3JlID0gZnVuY3Rpb24gKG5vZGUpIHtcbiAgICB2YXIgcHJldiA9IHRoaXMucHJldjtcbiAgICB0aGlzLnByZXYgPSBub2RlO1xuICAgIG5vZGUucHJldiA9IHByZXY7XG4gICAgcHJldi5uZXh0ID0gbm9kZTtcbiAgICBub2RlLm5leHQgPSB0aGlzO1xufTtcblxuTm9kZS5wcm90b3R5cGUuYWRkQWZ0ZXIgPSBmdW5jdGlvbiAobm9kZSkge1xuICAgIHZhciBuZXh0ID0gdGhpcy5uZXh0O1xuICAgIHRoaXMubmV4dCA9IG5vZGU7XG4gICAgbm9kZS5uZXh0ID0gbmV4dDtcbiAgICBuZXh0LnByZXYgPSBub2RlO1xuICAgIG5vZGUucHJldiA9IHRoaXM7XG59O1xuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFdlYWtNYXAgPSByZXF1aXJlKFwid2Vhay1tYXBcIik7XG52YXIgTGlzdCA9IHJlcXVpcmUoXCIuLi9saXN0XCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1hcENoYW5nZXM7XG5mdW5jdGlvbiBNYXBDaGFuZ2VzKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNvbnN0cnVjdC4gTWFwQ2hhbmdlcyBpcyBhIG1peGluLlwiKTtcbn1cblxudmFyIG9iamVjdF9vd25zID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLypcbiAgICBPYmplY3QgbWFwIGNoYW5nZSBkZXNjcmlwdG9ycyBjYXJyeSBpbmZvcm1hdGlvbiBuZWNlc3NhcnkgZm9yIGFkZGluZyxcbiAgICByZW1vdmluZywgZGlzcGF0Y2hpbmcsIGFuZCBzaG9ydGluZyBldmVudHMgdG8gbGlzdGVuZXJzIGZvciBtYXAgY2hhbmdlc1xuICAgIGZvciBhIHBhcnRpY3VsYXIga2V5IG9uIGEgcGFydGljdWxhciBvYmplY3QuICBUaGVzZSBkZXNjcmlwdG9ycyBhcmUgdXNlZFxuICAgIGhlcmUgZm9yIHNoYWxsb3cgbWFwIGNoYW5nZXMuXG5cbiAgICB7XG4gICAgICAgIHdpbGxDaGFuZ2VMaXN0ZW5lcnM6QXJyYXkoRnVuY3Rpb24pXG4gICAgICAgIGNoYW5nZUxpc3RlbmVyczpBcnJheShGdW5jdGlvbilcbiAgICB9XG4qL1xuXG52YXIgbWFwQ2hhbmdlRGVzY3JpcHRvcnMgPSBuZXcgV2Vha01hcCgpO1xuXG5NYXBDaGFuZ2VzLnByb3RvdHlwZS5nZXRBbGxNYXBDaGFuZ2VEZXNjcmlwdG9ycyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgRGljdCA9IHJlcXVpcmUoXCIuLi9kaWN0XCIpO1xuICAgIGlmICghbWFwQ2hhbmdlRGVzY3JpcHRvcnMuaGFzKHRoaXMpKSB7XG4gICAgICAgIG1hcENoYW5nZURlc2NyaXB0b3JzLnNldCh0aGlzLCBEaWN0KCkpO1xuICAgIH1cbiAgICByZXR1cm4gbWFwQ2hhbmdlRGVzY3JpcHRvcnMuZ2V0KHRoaXMpO1xufTtcblxuTWFwQ2hhbmdlcy5wcm90b3R5cGUuZ2V0TWFwQ2hhbmdlRGVzY3JpcHRvciA9IGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHZhciB0b2tlbkNoYW5nZURlc2NyaXB0b3JzID0gdGhpcy5nZXRBbGxNYXBDaGFuZ2VEZXNjcmlwdG9ycygpO1xuICAgIHRva2VuID0gdG9rZW4gfHwgXCJcIjtcbiAgICBpZiAoIXRva2VuQ2hhbmdlRGVzY3JpcHRvcnMuaGFzKHRva2VuKSkge1xuICAgICAgICB0b2tlbkNoYW5nZURlc2NyaXB0b3JzLnNldCh0b2tlbiwge1xuICAgICAgICAgICAgd2lsbENoYW5nZUxpc3RlbmVyczogbmV3IExpc3QoKSxcbiAgICAgICAgICAgIGNoYW5nZUxpc3RlbmVyczogbmV3IExpc3QoKVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHRva2VuQ2hhbmdlRGVzY3JpcHRvcnMuZ2V0KHRva2VuKTtcbn07XG5cbk1hcENoYW5nZXMucHJvdG90eXBlLmFkZE1hcENoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyLCB0b2tlbiwgYmVmb3JlQ2hhbmdlKSB7XG4gICAgaWYgKCF0aGlzLmlzT2JzZXJ2YWJsZSAmJiB0aGlzLm1ha2VPYnNlcnZhYmxlKSB7XG4gICAgICAgIC8vIGZvciBBcnJheVxuICAgICAgICB0aGlzLm1ha2VPYnNlcnZhYmxlKCk7XG4gICAgfVxuICAgIHZhciBkZXNjcmlwdG9yID0gdGhpcy5nZXRNYXBDaGFuZ2VEZXNjcmlwdG9yKHRva2VuKTtcbiAgICB2YXIgbGlzdGVuZXJzO1xuICAgIGlmIChiZWZvcmVDaGFuZ2UpIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci53aWxsQ2hhbmdlTGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGxpc3RlbmVycyA9IGRlc2NyaXB0b3IuY2hhbmdlTGlzdGVuZXJzO1xuICAgIH1cbiAgICBsaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwiZGlzcGF0Y2hlc01hcENoYW5nZXNcIiwge1xuICAgICAgICB2YWx1ZTogdHJ1ZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcbiAgICB9KTtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gZnVuY3Rpb24gY2FuY2VsTWFwQ2hhbmdlTGlzdGVuZXIoKSB7XG4gICAgICAgIGlmICghc2VsZikge1xuICAgICAgICAgICAgLy8gVE9ETyB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCByZW1vdmUgbWFwIGNoYW5nZSBsaXN0ZW5lciBhZ2FpblwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBzZWxmLnJlbW92ZU1hcENoYW5nZUxpc3RlbmVyKGxpc3RlbmVyLCB0b2tlbiwgYmVmb3JlQ2hhbmdlKTtcbiAgICAgICAgc2VsZiA9IG51bGw7XG4gICAgfTtcbn07XG5cbk1hcENoYW5nZXMucHJvdG90eXBlLnJlbW92ZU1hcENoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyLCB0b2tlbiwgYmVmb3JlQ2hhbmdlKSB7XG4gICAgdmFyIGRlc2NyaXB0b3IgPSB0aGlzLmdldE1hcENoYW5nZURlc2NyaXB0b3IodG9rZW4pO1xuXG4gICAgdmFyIGxpc3RlbmVycztcbiAgICBpZiAoYmVmb3JlQ2hhbmdlKSB7XG4gICAgICAgIGxpc3RlbmVycyA9IGRlc2NyaXB0b3Iud2lsbENoYW5nZUxpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLmNoYW5nZUxpc3RlbmVycztcbiAgICB9XG5cbiAgICB2YXIgbm9kZSA9IGxpc3RlbmVycy5maW5kTGFzdChsaXN0ZW5lcik7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHJlbW92ZSBsaXN0ZW5lcjogZG9lcyBub3QgZXhpc3QuXCIpO1xuICAgIH1cbiAgICBub2RlW1wiZGVsZXRlXCJdKCk7XG59O1xuXG5NYXBDaGFuZ2VzLnByb3RvdHlwZS5kaXNwYXRjaE1hcENoYW5nZSA9IGZ1bmN0aW9uIChrZXksIHZhbHVlLCBiZWZvcmVDaGFuZ2UpIHtcbiAgICB2YXIgZGVzY3JpcHRvcnMgPSB0aGlzLmdldEFsbE1hcENoYW5nZURlc2NyaXB0b3JzKCk7XG4gICAgdmFyIGNoYW5nZU5hbWUgPSBcIk1hcFwiICsgKGJlZm9yZUNoYW5nZSA/IFwiV2lsbENoYW5nZVwiIDogXCJDaGFuZ2VcIik7XG4gICAgZGVzY3JpcHRvcnMuZm9yRWFjaChmdW5jdGlvbiAoZGVzY3JpcHRvciwgdG9rZW4pIHtcblxuICAgICAgICBpZiAoZGVzY3JpcHRvci5pc0FjdGl2ZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVzY3JpcHRvci5pc0FjdGl2ZSA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGlzdGVuZXJzO1xuICAgICAgICBpZiAoYmVmb3JlQ2hhbmdlKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLndpbGxDaGFuZ2VMaXN0ZW5lcnM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLmNoYW5nZUxpc3RlbmVycztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0b2tlbk5hbWUgPSBcImhhbmRsZVwiICsgKFxuICAgICAgICAgICAgdG9rZW4uc2xpY2UoMCwgMSkudG9VcHBlckNhc2UoKSArXG4gICAgICAgICAgICB0b2tlbi5zbGljZSgxKVxuICAgICAgICApICsgY2hhbmdlTmFtZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gZGlzcGF0Y2ggdG8gZWFjaCBsaXN0ZW5lclxuICAgICAgICAgICAgbGlzdGVuZXJzLmZvckVhY2goZnVuY3Rpb24gKGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVyW3Rva2VuTmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJbdG9rZW5OYW1lXSh2YWx1ZSwga2V5LCB0aGlzKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGxpc3RlbmVyLmNhbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXIuY2FsbChsaXN0ZW5lciwgdmFsdWUsIGtleSwgdGhpcyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSGFuZGxlciBcIiArIGxpc3RlbmVyICsgXCIgaGFzIG5vIG1ldGhvZCBcIiArIHRva2VuTmFtZSArIFwiIGFuZCBpcyBub3QgY2FsbGFibGVcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBkZXNjcmlwdG9yLmlzQWN0aXZlID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgIH0sIHRoaXMpO1xufTtcblxuTWFwQ2hhbmdlcy5wcm90b3R5cGUuYWRkQmVmb3JlTWFwQ2hhbmdlTGlzdGVuZXIgPSBmdW5jdGlvbiAobGlzdGVuZXIsIHRva2VuKSB7XG4gICAgcmV0dXJuIHRoaXMuYWRkTWFwQ2hhbmdlTGlzdGVuZXIobGlzdGVuZXIsIHRva2VuLCB0cnVlKTtcbn07XG5cbk1hcENoYW5nZXMucHJvdG90eXBlLnJlbW92ZUJlZm9yZU1hcENoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyLCB0b2tlbikge1xuICAgIHJldHVybiB0aGlzLnJlbW92ZU1hcENoYW5nZUxpc3RlbmVyKGxpc3RlbmVyLCB0b2tlbiwgdHJ1ZSk7XG59O1xuXG5NYXBDaGFuZ2VzLnByb3RvdHlwZS5kaXNwYXRjaEJlZm9yZU1hcENoYW5nZSA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2hNYXBDaGFuZ2Uoa2V5LCB2YWx1ZSwgdHJ1ZSk7XG59O1xuXG4iLCIvKlxuICAgIEJhc2VkIGluIHBhcnQgb24gb2JzZXJ2YWJsZSBhcnJheXMgZnJvbSBNb3Rvcm9sYSBNb2JpbGl0eeKAmXMgTW9udGFnZVxuICAgIENvcHlyaWdodCAoYykgMjAxMiwgTW90b3JvbGEgTW9iaWxpdHkgTExDLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICAgIDMtQ2xhdXNlIEJTRCBMaWNlbnNlXG4gICAgaHR0cHM6Ly9naXRodWIuY29tL21vdG9yb2xhLW1vYmlsaXR5L21vbnRhZ2UvYmxvYi9tYXN0ZXIvTElDRU5TRS5tZFxuKi9cblxuLypcbiAgICBUaGlzIG1vZHVsZSBpcyByZXNwb25zaWJsZSBmb3Igb2JzZXJ2aW5nIGNoYW5nZXMgdG8gb3duZWQgcHJvcGVydGllcyBvZlxuICAgIG9iamVjdHMgYW5kIGNoYW5nZXMgdG8gdGhlIGNvbnRlbnQgb2YgYXJyYXlzIGNhdXNlZCBieSBtZXRob2QgY2FsbHMuXG4gICAgVGhlIGludGVyZmFjZSBmb3Igb2JzZXJ2aW5nIGFycmF5IGNvbnRlbnQgY2hhbmdlcyBlc3RhYmxpc2hlcyB0aGUgbWV0aG9kc1xuICAgIG5lY2Vzc2FyeSBmb3IgYW55IGNvbGxlY3Rpb24gd2l0aCBvYnNlcnZhYmxlIGNvbnRlbnQuXG4qL1xuXG5yZXF1aXJlKFwiLi4vc2hpbVwiKTtcbnZhciBXZWFrTWFwID0gcmVxdWlyZShcIndlYWstbWFwXCIpO1xuXG52YXIgb2JqZWN0X293bnMgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4vKlxuICAgIE9iamVjdCBwcm9wZXJ0eSBkZXNjcmlwdG9ycyBjYXJyeSBpbmZvcm1hdGlvbiBuZWNlc3NhcnkgZm9yIGFkZGluZyxcbiAgICByZW1vdmluZywgZGlzcGF0Y2hpbmcsIGFuZCBzaG9ydGluZyBldmVudHMgdG8gbGlzdGVuZXJzIGZvciBwcm9wZXJ0eSBjaGFuZ2VzXG4gICAgZm9yIGEgcGFydGljdWxhciBrZXkgb24gYSBwYXJ0aWN1bGFyIG9iamVjdC4gIFRoZXNlIGRlc2NyaXB0b3JzIGFyZSB1c2VkXG4gICAgaGVyZSBmb3Igc2hhbGxvdyBwcm9wZXJ0eSBjaGFuZ2VzLlxuXG4gICAge1xuICAgICAgICB3aWxsQ2hhbmdlTGlzdGVuZXJzOkFycmF5KEZ1bmN0aW9uKVxuICAgICAgICBjaGFuZ2VMaXN0ZW5lcnM6QXJyYXkoRnVuY3Rpb24pXG4gICAgfVxuKi9cbnZhciBwcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzID0gbmV3IFdlYWtNYXAoKTtcblxuLy8gTWF5YmUgcmVtb3ZlIGVudHJpZXMgZnJvbSB0aGlzIHRhYmxlIGlmIHRoZSBjb3JyZXNwb25kaW5nIG9iamVjdCBubyBsb25nZXJcbi8vIGhhcyBhbnkgcHJvcGVydHkgY2hhbmdlIGxpc3RlbmVycyBmb3IgYW55IGtleS4gIEhvd2V2ZXIsIHRoZSBjb3N0IG9mXG4vLyBib29rLWtlZXBpbmcgaXMgcHJvYmFibHkgbm90IHdhcnJhbnRlZCBzaW5jZSBpdCB3b3VsZCBiZSByYXJlIGZvciBhblxuLy8gb2JzZXJ2ZWQgb2JqZWN0IHRvIG5vIGxvbmdlciBiZSBvYnNlcnZlZCB1bmxlc3MgaXQgd2FzIGFib3V0IHRvIGJlIGRpc3Bvc2VkXG4vLyBvZiBvciByZXVzZWQgYXMgYW4gb2JzZXJ2YWJsZS4gIFRoZSBvbmx5IGJlbmVmaXQgd291bGQgYmUgaW4gYXZvaWRpbmcgYnVsa1xuLy8gY2FsbHMgdG8gZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZSBldmVudHMgb24gb2JqZWN0cyB0aGF0IGhhdmUgbm8gbGlzdGVuZXJzLlxuXG4vKlxuICAgIFRvIG9ic2VydmUgc2hhbGxvdyBwcm9wZXJ0eSBjaGFuZ2VzIGZvciBhIHBhcnRpY3VsYXIga2V5IG9mIGEgcGFydGljdWxhclxuICAgIG9iamVjdCwgd2UgaW5zdGFsbCBhIHByb3BlcnR5IGRlc2NyaXB0b3Igb24gdGhlIG9iamVjdCB0aGF0IG92ZXJyaWRlcyB0aGUgcHJldmlvdXNcbiAgICBkZXNjcmlwdG9yLiAgVGhlIG92ZXJyaWRkZW4gZGVzY3JpcHRvcnMgYXJlIHN0b3JlZCBpbiB0aGlzIHdlYWsgbWFwLiAgVGhlXG4gICAgd2VhayBtYXAgYXNzb2NpYXRlcyBhbiBvYmplY3Qgd2l0aCBhbm90aGVyIG9iamVjdCB0aGF0IG1hcHMgcHJvcGVydHkgbmFtZXNcbiAgICB0byBwcm9wZXJ0eSBkZXNjcmlwdG9ycy5cblxuICAgIG92ZXJyaWRkZW5PYmplY3REZXNjcmlwdG9ycy5nZXQob2JqZWN0KVtrZXldXG5cbiAgICBXZSByZXRhaW4gdGhlIG9sZCBkZXNjcmlwdG9yIGZvciB2YXJpb3VzIHB1cnBvc2VzLiAgRm9yIG9uZSwgaWYgdGhlIHByb3BlcnR5XG4gICAgaXMgbm8gbG9uZ2VyIGJlaW5nIG9ic2VydmVkIGJ5IGFueW9uZSwgd2UgcmV2ZXJ0IHRoZSBwcm9wZXJ0eSBkZXNjcmlwdG9yIHRvXG4gICAgdGhlIG9yaWdpbmFsLiAgRm9yIFwidmFsdWVcIiBkZXNjcmlwdG9ycywgd2Ugc3RvcmUgdGhlIGFjdHVhbCB2YWx1ZSBvZiB0aGVcbiAgICBkZXNjcmlwdG9yIG9uIHRoZSBvdmVycmlkZGVuIGRlc2NyaXB0b3IsIHNvIHdoZW4gdGhlIHByb3BlcnR5IGlzIHJldmVydGVkLCBpdFxuICAgIHJldGFpbnMgdGhlIG1vc3QgcmVjZW50bHkgc2V0IHZhbHVlLiAgRm9yIFwiZ2V0XCIgYW5kIFwic2V0XCIgZGVzY3JpcHRvcnMsXG4gICAgd2Ugb2JzZXJ2ZSB0aGVuIGZvcndhcmQgXCJnZXRcIiBhbmQgXCJzZXRcIiBvcGVyYXRpb25zIHRvIHRoZSBvcmlnaW5hbCBkZXNjcmlwdG9yLlxuKi9cbnZhciBvdmVycmlkZGVuT2JqZWN0RGVzY3JpcHRvcnMgPSBuZXcgV2Vha01hcCgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFByb3BlcnR5Q2hhbmdlcztcblxuZnVuY3Rpb24gUHJvcGVydHlDaGFuZ2VzKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgaXMgYW4gYWJzdHJhY3QgaW50ZXJmYWNlLiBNaXggaXQuIERvbid0IGNvbnN0cnVjdCBpdFwiKTtcbn1cblxuUHJvcGVydHlDaGFuZ2VzLmRlYnVnID0gdHJ1ZTtcblxuUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5nZXRPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3IgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgaWYgKCFwcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzLmhhcyh0aGlzKSkge1xuICAgICAgICBwcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzLnNldCh0aGlzLCB7fSk7XG4gICAgfVxuICAgIHZhciBvYmplY3RQcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzID0gcHJvcGVydHlDaGFuZ2VEZXNjcmlwdG9ycy5nZXQodGhpcyk7XG4gICAgaWYgKCFvYmplY3Rfb3ducy5jYWxsKG9iamVjdFByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcnMsIGtleSkpIHtcbiAgICAgICAgb2JqZWN0UHJvcGVydHlDaGFuZ2VEZXNjcmlwdG9yc1trZXldID0ge1xuICAgICAgICAgICAgd2lsbENoYW5nZUxpc3RlbmVyczogW10sXG4gICAgICAgICAgICBjaGFuZ2VMaXN0ZW5lcnM6IFtdXG4gICAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RQcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzW2tleV07XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLmhhc093blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvciA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAoIXByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcnMuaGFzKHRoaXMpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHZhciBvYmplY3RQcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzID0gcHJvcGVydHlDaGFuZ2VEZXNjcmlwdG9ycy5nZXQodGhpcyk7XG4gICAgaWYgKCFvYmplY3Rfb3ducy5jYWxsKG9iamVjdFByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcnMsIGtleSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cblByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUuYWRkT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChrZXksIGxpc3RlbmVyLCBiZWZvcmVDaGFuZ2UpIHtcbiAgICBpZiAodGhpcy5tYWtlT2JzZXJ2YWJsZSAmJiAhdGhpcy5pc09ic2VydmFibGUpIHtcbiAgICAgICAgdGhpcy5tYWtlT2JzZXJ2YWJsZSgpOyAvLyBwYXJ0aWN1bGFybHkgZm9yIG9ic2VydmFibGUgYXJyYXlzLCBmb3JcbiAgICAgICAgLy8gdGhlaXIgbGVuZ3RoIHByb3BlcnR5XG4gICAgfVxuICAgIHZhciBkZXNjcmlwdG9yID0gUHJvcGVydHlDaGFuZ2VzLmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcih0aGlzLCBrZXkpO1xuICAgIHZhciBsaXN0ZW5lcnM7XG4gICAgaWYgKGJlZm9yZUNoYW5nZSkge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLndpbGxDaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci5jaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfVxuICAgIFByb3BlcnR5Q2hhbmdlcy5tYWtlUHJvcGVydHlPYnNlcnZhYmxlKHRoaXMsIGtleSk7XG4gICAgbGlzdGVuZXJzLnB1c2gobGlzdGVuZXIpO1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBmdW5jdGlvbiBjYW5jZWxPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKCkge1xuICAgICAgICBQcm9wZXJ0eUNoYW5nZXMucmVtb3ZlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lcihzZWxmLCBrZXksIGxpc3RlbmVycywgYmVmb3JlQ2hhbmdlKTtcbiAgICAgICAgc2VsZiA9IG51bGw7XG4gICAgfTtcbn07XG5cblByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUuYWRkQmVmb3JlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChrZXksIGxpc3RlbmVyKSB7XG4gICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5hZGRPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKHRoaXMsIGtleSwgbGlzdGVuZXIsIHRydWUpO1xufTtcblxuUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5yZW1vdmVPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGtleSwgbGlzdGVuZXIsIGJlZm9yZUNoYW5nZSkge1xuICAgIHZhciBkZXNjcmlwdG9yID0gUHJvcGVydHlDaGFuZ2VzLmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcih0aGlzLCBrZXkpO1xuXG4gICAgdmFyIGxpc3RlbmVycztcbiAgICBpZiAoYmVmb3JlQ2hhbmdlKSB7XG4gICAgICAgIGxpc3RlbmVycyA9IGRlc2NyaXB0b3Iud2lsbENoYW5nZUxpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLmNoYW5nZUxpc3RlbmVycztcbiAgICB9XG5cbiAgICB2YXIgaW5kZXggPSBsaXN0ZW5lcnMubGFzdEluZGV4T2YobGlzdGVuZXIpO1xuICAgIGlmIChpbmRleCA9PT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgcmVtb3ZlIGxpc3RlbmVyOiBkb2VzIG5vdCBleGlzdC5cIik7XG4gICAgfVxuICAgIGxpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXG4gICAgaWYgKGRlc2NyaXB0b3IuY2hhbmdlTGlzdGVuZXJzLmxlbmd0aCArIGRlc2NyaXB0b3Iud2lsbENoYW5nZUxpc3RlbmVycy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgUHJvcGVydHlDaGFuZ2VzLm1ha2VQcm9wZXJ0eVVub2JzZXJ2YWJsZSh0aGlzLCBrZXkpO1xuICAgIH1cbn07XG5cblByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUucmVtb3ZlQmVmb3JlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChrZXksIGxpc3RlbmVyKSB7XG4gICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5yZW1vdmVPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKHRoaXMsIGtleSwgbGlzdGVuZXIsIHRydWUpO1xufTtcblxuUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5kaXNwYXRjaE93blByb3BlcnR5Q2hhbmdlID0gZnVuY3Rpb24gKGtleSwgdmFsdWUsIGJlZm9yZUNoYW5nZSkge1xuICAgIHZhciBkZXNjcmlwdG9yID0gUHJvcGVydHlDaGFuZ2VzLmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcih0aGlzLCBrZXkpO1xuXG4gICAgaWYgKGRlc2NyaXB0b3IuaXNBY3RpdmUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkZXNjcmlwdG9yLmlzQWN0aXZlID0gdHJ1ZTtcblxuICAgIHZhciBsaXN0ZW5lcnM7XG4gICAgaWYgKGJlZm9yZUNoYW5nZSkge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLndpbGxDaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci5jaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgdmFyIGNoYW5nZU5hbWUgPSAoYmVmb3JlQ2hhbmdlID8gXCJXaWxsXCIgOiBcIlwiKSArIFwiQ2hhbmdlXCI7XG4gICAgdmFyIGdlbmVyaWNIYW5kbGVyTmFtZSA9IFwiaGFuZGxlUHJvcGVydHlcIiArIGNoYW5nZU5hbWU7XG4gICAgdmFyIHByb3BlcnR5TmFtZSA9IFN0cmluZyhrZXkpO1xuICAgIHByb3BlcnR5TmFtZSA9IHByb3BlcnR5TmFtZSAmJiBwcm9wZXJ0eU5hbWVbMF0udG9VcHBlckNhc2UoKSArIHByb3BlcnR5TmFtZS5zbGljZSgxKTtcbiAgICB2YXIgc3BlY2lmaWNIYW5kbGVyTmFtZSA9IFwiaGFuZGxlXCIgKyBwcm9wZXJ0eU5hbWUgKyBjaGFuZ2VOYW1lO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gZGlzcGF0Y2ggdG8gZWFjaCBsaXN0ZW5lclxuICAgICAgICBsaXN0ZW5lcnMuZm9yRWFjaChmdW5jdGlvbiAobGlzdGVuZXIpIHtcbiAgICAgICAgICAgIHZhciB0aGlzcCA9IGxpc3RlbmVyO1xuICAgICAgICAgICAgbGlzdGVuZXIgPSAoXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJbc3BlY2lmaWNIYW5kbGVyTmFtZV0gfHxcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcltnZW5lcmljSGFuZGxlck5hbWVdIHx8XG4gICAgICAgICAgICAgICAgbGlzdGVuZXJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIWxpc3RlbmVyLmNhbGwpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBldmVudCBsaXN0ZW5lciBmb3IgXCIgKyBzcGVjaWZpY0hhbmRsZXJOYW1lICsgXCIgb3IgXCIgKyBnZW5lcmljSGFuZGxlck5hbWUgKyBcIiBvciBjYWxsIG9uIFwiICsgbGlzdGVuZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGlzdGVuZXIuY2FsbCh0aGlzcCwgdmFsdWUsIGtleSwgdGhpcyk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGRlc2NyaXB0b3IuaXNBY3RpdmUgPSBmYWxzZTtcbiAgICB9XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLmRpc3BhdGNoQmVmb3JlT3duUHJvcGVydHlDaGFuZ2UgPSBmdW5jdGlvbiAoa2V5LCBsaXN0ZW5lcikge1xuICAgIHJldHVybiBQcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZSh0aGlzLCBrZXksIGxpc3RlbmVyLCB0cnVlKTtcbn07XG5cblByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUubWFrZVByb3BlcnR5T2JzZXJ2YWJsZSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAvLyBhcnJheXMgYXJlIHNwZWNpYWwuICB3ZSBkbyBub3Qgc3VwcG9ydCBkaXJlY3Qgc2V0dGluZyBvZiBwcm9wZXJ0aWVzXG4gICAgLy8gb24gYW4gYXJyYXkuICBpbnN0ZWFkLCBjYWxsIC5zZXQoaW5kZXgsIHZhbHVlKS4gIHRoaXMgaXMgb2JzZXJ2YWJsZS5cbiAgICAvLyAnbGVuZ3RoJyBwcm9wZXJ0eSBpcyBvYnNlcnZhYmxlIGZvciBhbGwgbXV0YXRpbmcgbWV0aG9kcyBiZWNhdXNlXG4gICAgLy8gb3VyIG92ZXJyaWRlcyBleHBsaWNpdGx5IGRpc3BhdGNoIHRoYXQgY2hhbmdlLlxuICAgIGlmIChBcnJheS5pc0FycmF5KHRoaXMpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIU9iamVjdC5pc0V4dGVuc2libGUodGhpcywga2V5KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBtYWtlIHByb3BlcnR5IFwiICsgSlNPTi5zdHJpbmdpZnkoa2V5KSArIFwiIG9ic2VydmFibGUgb24gXCIgKyB0aGlzICsgXCIgYmVjYXVzZSBvYmplY3QgaXMgbm90IGV4dGVuc2libGVcIik7XG4gICAgfVxuXG4gICAgdmFyIHN0YXRlO1xuICAgIGlmICh0eXBlb2YgdGhpcy5fX3N0YXRlX18gPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgc3RhdGUgPSB0aGlzLl9fc3RhdGVfXztcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0ZSA9IHt9O1xuICAgICAgICBpZiAoT2JqZWN0LmlzRXh0ZW5zaWJsZSh0aGlzLCBcIl9fc3RhdGVfX1wiKSkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwiX19zdGF0ZV9fXCIsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogc3RhdGUsXG4gICAgICAgICAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHN0YXRlW2tleV0gPSB0aGlzW2tleV07XG5cbiAgICAvLyBtZW1vaXplIG92ZXJyaWRkZW4gcHJvcGVydHkgZGVzY3JpcHRvciB0YWJsZVxuICAgIGlmICghb3ZlcnJpZGRlbk9iamVjdERlc2NyaXB0b3JzLmhhcyh0aGlzKSkge1xuICAgICAgICBvdmVycmlkZGVuUHJvcGVydHlEZXNjcmlwdG9ycyA9IHt9O1xuICAgICAgICBvdmVycmlkZGVuT2JqZWN0RGVzY3JpcHRvcnMuc2V0KHRoaXMsIG92ZXJyaWRkZW5Qcm9wZXJ0eURlc2NyaXB0b3JzKTtcbiAgICB9XG4gICAgdmFyIG92ZXJyaWRkZW5Qcm9wZXJ0eURlc2NyaXB0b3JzID0gb3ZlcnJpZGRlbk9iamVjdERlc2NyaXB0b3JzLmdldCh0aGlzKTtcblxuICAgIGlmIChvYmplY3Rfb3ducy5jYWxsKG92ZXJyaWRkZW5Qcm9wZXJ0eURlc2NyaXB0b3JzLCBrZXkpKSB7XG4gICAgICAgIC8vIGlmIHdlIGhhdmUgYWxyZWFkeSByZWNvcmRlZCBhbiBvdmVycmlkZGVuIHByb3BlcnR5IGRlc2NyaXB0b3IsXG4gICAgICAgIC8vIHdlIGhhdmUgYWxyZWFkeSBpbnN0YWxsZWQgdGhlIG9ic2VydmVyLCBzbyBzaG9ydC1oZXJlXG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyB3YWxrIHVwIHRoZSBwcm90b3R5cGUgY2hhaW4gdG8gZmluZCBhIHByb3BlcnR5IGRlc2NyaXB0b3IgZm9yXG4gICAgLy8gdGhlIHByb3BlcnR5IG5hbWVcbiAgICB2YXIgb3ZlcnJpZGRlbkRlc2NyaXB0b3I7XG4gICAgdmFyIGF0dGFjaGVkID0gdGhpcztcbiAgICB2YXIgZm9ybWVyRGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoYXR0YWNoZWQsIGtleSk7XG4gICAgZG8ge1xuICAgICAgICBvdmVycmlkZGVuRGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoYXR0YWNoZWQsIGtleSk7XG4gICAgICAgIGlmIChvdmVycmlkZGVuRGVzY3JpcHRvcikge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYXR0YWNoZWQgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoYXR0YWNoZWQpO1xuICAgIH0gd2hpbGUgKGF0dGFjaGVkKTtcbiAgICAvLyBvciBkZWZhdWx0IHRvIGFuIHVuZGVmaW5lZCB2YWx1ZVxuICAgIG92ZXJyaWRkZW5EZXNjcmlwdG9yID0gb3ZlcnJpZGRlbkRlc2NyaXB0b3IgfHwge1xuICAgICAgICB2YWx1ZTogdW5kZWZpbmVkLFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfTtcblxuICAgIGlmICghb3ZlcnJpZGRlbkRlc2NyaXB0b3IuY29uZmlndXJhYmxlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IG9ic2VydmUgbm9uLWNvbmZpZ3VyYWJsZSBwcm9wZXJ0aWVzXCIpO1xuICAgIH1cblxuICAgIC8vIG1lbW9pemUgdGhlIGRlc2NyaXB0b3Igc28gd2Uga25vdyBub3QgdG8gaW5zdGFsbCBhbm90aGVyIGxheWVyLFxuICAgIC8vIGFuZCBzbyB3ZSBjYW4gcmV1c2UgdGhlIG92ZXJyaWRkZW4gZGVzY3JpcHRvciB3aGVuIHVuaW5zdGFsbGluZ1xuICAgIG92ZXJyaWRkZW5Qcm9wZXJ0eURlc2NyaXB0b3JzW2tleV0gPSBvdmVycmlkZGVuRGVzY3JpcHRvcjtcblxuICAgIC8vIGdpdmUgdXAgKmFmdGVyKiBzdG9yaW5nIHRoZSBvdmVycmlkZGVuIHByb3BlcnR5IGRlc2NyaXB0b3Igc28gaXRcbiAgICAvLyBjYW4gYmUgcmVzdG9yZWQgYnkgdW5pbnN0YWxsLiAgVW53cml0YWJsZSBwcm9wZXJ0aWVzIGFyZVxuICAgIC8vIHNpbGVudGx5IG5vdCBvdmVycmlkZW4uICBTaW5jZSBzdWNjZXNzIGlzIGluZGlzdGluZ3Vpc2hhYmxlIGZyb21cbiAgICAvLyBmYWlsdXJlLCB3ZSBsZXQgaXQgcGFzcyBidXQgZG9uJ3Qgd2FzdGUgdGltZSBvbiBpbnRlcmNlcHRpbmdcbiAgICAvLyBnZXQvc2V0LlxuICAgIGlmICghb3ZlcnJpZGRlbkRlc2NyaXB0b3Iud3JpdGFibGUgJiYgIW92ZXJyaWRkZW5EZXNjcmlwdG9yLnNldCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVE9ETyByZWZsZWN0IGN1cnJlbnQgdmFsdWUgb24gYSBkaXNwbGF5ZWQgcHJvcGVydHlcblxuICAgIHZhciBwcm9wZXJ0eUxpc3RlbmVyO1xuICAgIC8vIGluIGJvdGggb2YgdGhlc2UgbmV3IGRlc2NyaXB0b3IgdmFyaWFudHMsIHdlIHJldXNlIHRoZSBvdmVycmlkZGVuXG4gICAgLy8gZGVzY3JpcHRvciB0byBlaXRoZXIgc3RvcmUgdGhlIGN1cnJlbnQgdmFsdWUgb3IgYXBwbHkgZ2V0dGVyc1xuICAgIC8vIGFuZCBzZXR0ZXJzLiAgdGhpcyBpcyBoYW5keSBzaW5jZSB3ZSBjYW4gcmV1c2UgdGhlIG92ZXJyaWRkZW5cbiAgICAvLyBkZXNjcmlwdG9yIGlmIHdlIHVuaW5zdGFsbCB0aGUgb2JzZXJ2ZXIuICBXZSBldmVuIHByZXNlcnZlIHRoZVxuICAgIC8vIGFzc2lnbm1lbnQgc2VtYW50aWNzLCB3aGVyZSB3ZSBnZXQgdGhlIHZhbHVlIGZyb20gdXAgdGhlXG4gICAgLy8gcHJvdG90eXBlIGNoYWluLCBhbmQgc2V0IGFzIGFuIG93bmVkIHByb3BlcnR5LlxuICAgIGlmICgndmFsdWUnIGluIG92ZXJyaWRkZW5EZXNjcmlwdG9yKSB7XG4gICAgICAgIHByb3BlcnR5TGlzdGVuZXIgPSB7XG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3ZlcnJpZGRlbkRlc2NyaXB0b3IudmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gb3ZlcnJpZGRlbkRlc2NyaXB0b3IudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBQcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hCZWZvcmVPd25Qcm9wZXJ0eUNoYW5nZSh0aGlzLCBrZXksIG92ZXJyaWRkZW5EZXNjcmlwdG9yLnZhbHVlKTtcbiAgICAgICAgICAgICAgICBvdmVycmlkZGVuRGVzY3JpcHRvci52YWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIHN0YXRlW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBQcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZSh0aGlzLCBrZXksIHZhbHVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZW51bWVyYWJsZTogb3ZlcnJpZGRlbkRlc2NyaXB0b3IuZW51bWVyYWJsZSxcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgICB9O1xuICAgIH0gZWxzZSB7IC8vICdnZXQnIG9yICdzZXQnLCBidXQgbm90IG5lY2Vzc2FyaWx5IGJvdGhcbiAgICAgICAgcHJvcGVydHlMaXN0ZW5lciA9IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG92ZXJyaWRkZW5EZXNjcmlwdG9yLmdldC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBmb3JtZXJWYWx1ZTtcblxuICAgICAgICAgICAgICAgIC8vIGdldCB0aGUgYWN0dWFsIGZvcm1lciB2YWx1ZSBpZiBwb3NzaWJsZVxuICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9ybWVyVmFsdWUgPSBvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gY2FsbCB0aHJvdWdoIHRvIGFjdHVhbCBzZXR0ZXJcbiAgICAgICAgICAgICAgICBpZiAob3ZlcnJpZGRlbkRlc2NyaXB0b3Iuc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIG92ZXJyaWRkZW5EZXNjcmlwdG9yLnNldC5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHVzZSBnZXR0ZXIsIGlmIHBvc3NpYmxlLCB0byBkaXNjb3ZlciB3aGV0aGVyIHRoZSBzZXRcbiAgICAgICAgICAgICAgICAvLyB3YXMgc3VjY2Vzc2Z1bFxuICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGVba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBpZiBpdCBoYXMgbm90IGNoYW5nZWQsIHN1cHByZXNzIGEgbm90aWZpY2F0aW9uXG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSBmb3JtZXJWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFByb3BlcnR5Q2hhbmdlcy5kaXNwYXRjaEJlZm9yZU93blByb3BlcnR5Q2hhbmdlKHRoaXMsIGtleSwgZm9ybWVyVmFsdWUpO1xuXG4gICAgICAgICAgICAgICAgLy8gZGlzcGF0Y2ggdGhlIG5ldyB2YWx1ZTogdGhlIGdpdmVuIHZhbHVlIGlmIHRoZXJlIGlzXG4gICAgICAgICAgICAgICAgLy8gbm8gZ2V0dGVyLCBvciB0aGUgYWN0dWFsIHZhbHVlIGlmIHRoZXJlIGlzIG9uZVxuICAgICAgICAgICAgICAgIFByb3BlcnR5Q2hhbmdlcy5kaXNwYXRjaE93blByb3BlcnR5Q2hhbmdlKHRoaXMsIGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBvdmVycmlkZGVuRGVzY3JpcHRvci5lbnVtZXJhYmxlLFxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGtleSwgcHJvcGVydHlMaXN0ZW5lcik7XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLm1ha2VQcm9wZXJ0eVVub2JzZXJ2YWJsZSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAvLyBhcnJheXMgYXJlIHNwZWNpYWwuICB3ZSBkbyBub3Qgc3VwcG9ydCBkaXJlY3Qgc2V0dGluZyBvZiBwcm9wZXJ0aWVzXG4gICAgLy8gb24gYW4gYXJyYXkuICBpbnN0ZWFkLCBjYWxsIC5zZXQoaW5kZXgsIHZhbHVlKS4gIHRoaXMgaXMgb2JzZXJ2YWJsZS5cbiAgICAvLyAnbGVuZ3RoJyBwcm9wZXJ0eSBpcyBvYnNlcnZhYmxlIGZvciBhbGwgbXV0YXRpbmcgbWV0aG9kcyBiZWNhdXNlXG4gICAgLy8gb3VyIG92ZXJyaWRlcyBleHBsaWNpdGx5IGRpc3BhdGNoIHRoYXQgY2hhbmdlLlxuICAgIGlmIChBcnJheS5pc0FycmF5KHRoaXMpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIW92ZXJyaWRkZW5PYmplY3REZXNjcmlwdG9ycy5oYXModGhpcykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgdW5pbnN0YWxsIG9ic2VydmVyIG9uIHByb3BlcnR5XCIpO1xuICAgIH1cbiAgICB2YXIgb3ZlcnJpZGRlblByb3BlcnR5RGVzY3JpcHRvcnMgPSBvdmVycmlkZGVuT2JqZWN0RGVzY3JpcHRvcnMuZ2V0KHRoaXMpO1xuXG4gICAgaWYgKCFvdmVycmlkZGVuUHJvcGVydHlEZXNjcmlwdG9yc1trZXldKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHVuaW5zdGFsbCBvYnNlcnZlciBvbiBwcm9wZXJ0eVwiKTtcbiAgICB9XG5cbiAgICB2YXIgb3ZlcnJpZGRlbkRlc2NyaXB0b3IgPSBvdmVycmlkZGVuUHJvcGVydHlEZXNjcmlwdG9yc1trZXldO1xuICAgIGRlbGV0ZSBvdmVycmlkZGVuUHJvcGVydHlEZXNjcmlwdG9yc1trZXldO1xuXG4gICAgdmFyIHN0YXRlO1xuICAgIGlmICh0eXBlb2YgdGhpcy5fX3N0YXRlX18gPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgc3RhdGUgPSB0aGlzLl9fc3RhdGVfXztcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0ZSA9IHt9O1xuICAgICAgICBpZiAoT2JqZWN0LmlzRXh0ZW5zaWJsZSh0aGlzLCBcIl9fc3RhdGVfX1wiKSkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwiX19zdGF0ZV9fXCIsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogc3RhdGUsXG4gICAgICAgICAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIGRlbGV0ZSBzdGF0ZVtrZXldO1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGtleSwgb3ZlcnJpZGRlbkRlc2NyaXB0b3IpO1xufTtcblxuLy8gY29uc3RydWN0b3IgZnVuY3Rpb25zXG5cblByb3BlcnR5Q2hhbmdlcy5nZXRPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3IgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXkpIHtcbiAgICBpZiAob2JqZWN0LmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcikge1xuICAgICAgICByZXR1cm4gb2JqZWN0LmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcihrZXkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBQcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvci5jYWxsKG9iamVjdCwga2V5KTtcbiAgICB9XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMuaGFzT3duUHJvcGVydHlDaGFuZ2VEZXNjcmlwdG9yID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgaWYgKG9iamVjdC5oYXNPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3IpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdC5oYXNPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3Ioa2V5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3IuY2FsbChvYmplY3QsIGtleSk7XG4gICAgfVxufTtcblxuUHJvcGVydHlDaGFuZ2VzLmFkZE93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXksIGxpc3RlbmVyLCBiZWZvcmVDaGFuZ2UpIHtcbiAgICBpZiAoIU9iamVjdC5pc09iamVjdChvYmplY3QpKSB7XG4gICAgfSBlbHNlIGlmIChvYmplY3QuYWRkT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lcikge1xuICAgICAgICByZXR1cm4gb2JqZWN0LmFkZE93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIoa2V5LCBsaXN0ZW5lciwgYmVmb3JlQ2hhbmdlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5hZGRPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyLmNhbGwob2JqZWN0LCBrZXksIGxpc3RlbmVyLCBiZWZvcmVDaGFuZ2UpO1xuICAgIH1cbn07XG5cblByb3BlcnR5Q2hhbmdlcy5yZW1vdmVPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKG9iamVjdCwga2V5LCBsaXN0ZW5lciwgYmVmb3JlQ2hhbmdlKSB7XG4gICAgaWYgKCFPYmplY3QuaXNPYmplY3Qob2JqZWN0KSkge1xuICAgIH0gZWxzZSBpZiAob2JqZWN0LnJlbW92ZU93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdC5yZW1vdmVPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKGtleSwgbGlzdGVuZXIsIGJlZm9yZUNoYW5nZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUucmVtb3ZlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lci5jYWxsKG9iamVjdCwga2V5LCBsaXN0ZW5lciwgYmVmb3JlQ2hhbmdlKTtcbiAgICB9XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZSA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgdmFsdWUsIGJlZm9yZUNoYW5nZSkge1xuICAgIGlmICghT2JqZWN0LmlzT2JqZWN0KG9iamVjdCkpIHtcbiAgICB9IGVsc2UgaWYgKG9iamVjdC5kaXNwYXRjaE93blByb3BlcnR5Q2hhbmdlKSB7XG4gICAgICAgIHJldHVybiBvYmplY3QuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZShrZXksIHZhbHVlLCBiZWZvcmVDaGFuZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBQcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLmRpc3BhdGNoT3duUHJvcGVydHlDaGFuZ2UuY2FsbChvYmplY3QsIGtleSwgdmFsdWUsIGJlZm9yZUNoYW5nZSk7XG4gICAgfVxufTtcblxuUHJvcGVydHlDaGFuZ2VzLmFkZEJlZm9yZU93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXksIGxpc3RlbmVyKSB7XG4gICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5hZGRPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKG9iamVjdCwga2V5LCBsaXN0ZW5lciwgdHJ1ZSk7XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMucmVtb3ZlQmVmb3JlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgbGlzdGVuZXIpIHtcbiAgICByZXR1cm4gUHJvcGVydHlDaGFuZ2VzLnJlbW92ZU93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIob2JqZWN0LCBrZXksIGxpc3RlbmVyLCB0cnVlKTtcbn07XG5cblByb3BlcnR5Q2hhbmdlcy5kaXNwYXRjaEJlZm9yZU93blByb3BlcnR5Q2hhbmdlID0gZnVuY3Rpb24gKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICAgIHJldHVybiBQcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZShvYmplY3QsIGtleSwgdmFsdWUsIHRydWUpO1xufTtcblxuUHJvcGVydHlDaGFuZ2VzLm1ha2VQcm9wZXJ0eU9ic2VydmFibGUgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXkpIHtcbiAgICBpZiAob2JqZWN0Lm1ha2VQcm9wZXJ0eU9ic2VydmFibGUpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdC5tYWtlUHJvcGVydHlPYnNlcnZhYmxlKGtleSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUubWFrZVByb3BlcnR5T2JzZXJ2YWJsZS5jYWxsKG9iamVjdCwga2V5KTtcbiAgICB9XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMubWFrZVByb3BlcnR5VW5vYnNlcnZhYmxlID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgaWYgKG9iamVjdC5tYWtlUHJvcGVydHlVbm9ic2VydmFibGUpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdC5tYWtlUHJvcGVydHlVbm9ic2VydmFibGUoa2V5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5tYWtlUHJvcGVydHlVbm9ic2VydmFibGUuY2FsbChvYmplY3QsIGtleSk7XG4gICAgfVxufTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXZWFrTWFwID0gcmVxdWlyZShcIndlYWstbWFwXCIpO1xudmFyIERpY3QgPSByZXF1aXJlKFwiLi4vZGljdFwiKTtcblxudmFyIHJhbmdlQ2hhbmdlRGVzY3JpcHRvcnMgPSBuZXcgV2Vha01hcCgpOyAvLyB7aXNBY3RpdmUsIHdpbGxDaGFuZ2VMaXN0ZW5lcnMsIGNoYW5nZUxpc3RlbmVyc31cblxubW9kdWxlLmV4cG9ydHMgPSBSYW5nZUNoYW5nZXM7XG5mdW5jdGlvbiBSYW5nZUNoYW5nZXMoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY29uc3RydWN0LiBSYW5nZUNoYW5nZXMgaXMgYSBtaXhpbi5cIik7XG59XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUuZ2V0QWxsUmFuZ2VDaGFuZ2VEZXNjcmlwdG9ycyA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoIXJhbmdlQ2hhbmdlRGVzY3JpcHRvcnMuaGFzKHRoaXMpKSB7XG4gICAgICAgIHJhbmdlQ2hhbmdlRGVzY3JpcHRvcnMuc2V0KHRoaXMsIERpY3QoKSk7XG4gICAgfVxuICAgIHJldHVybiByYW5nZUNoYW5nZURlc2NyaXB0b3JzLmdldCh0aGlzKTtcbn07XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUuZ2V0UmFuZ2VDaGFuZ2VEZXNjcmlwdG9yID0gZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdmFyIHRva2VuQ2hhbmdlRGVzY3JpcHRvcnMgPSB0aGlzLmdldEFsbFJhbmdlQ2hhbmdlRGVzY3JpcHRvcnMoKTtcbiAgICB0b2tlbiA9IHRva2VuIHx8IFwiXCI7XG4gICAgaWYgKCF0b2tlbkNoYW5nZURlc2NyaXB0b3JzLmhhcyh0b2tlbikpIHtcbiAgICAgICAgdG9rZW5DaGFuZ2VEZXNjcmlwdG9ycy5zZXQodG9rZW4sIHtcbiAgICAgICAgICAgIGlzQWN0aXZlOiBmYWxzZSxcbiAgICAgICAgICAgIGNoYW5nZUxpc3RlbmVyczogW10sXG4gICAgICAgICAgICB3aWxsQ2hhbmdlTGlzdGVuZXJzOiBbXVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHRva2VuQ2hhbmdlRGVzY3JpcHRvcnMuZ2V0KHRva2VuKTtcbn07XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUuYWRkUmFuZ2VDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChsaXN0ZW5lciwgdG9rZW4sIGJlZm9yZUNoYW5nZSkge1xuICAgIC8vIGEgY29uY2Vzc2lvbiBmb3Igb2JqZWN0cyBsaWtlIEFycmF5IHRoYXQgYXJlIG5vdCBpbmhlcmVudGx5IG9ic2VydmFibGVcbiAgICBpZiAoIXRoaXMuaXNPYnNlcnZhYmxlICYmIHRoaXMubWFrZU9ic2VydmFibGUpIHtcbiAgICAgICAgdGhpcy5tYWtlT2JzZXJ2YWJsZSgpO1xuICAgIH1cblxuICAgIHZhciBkZXNjcmlwdG9yID0gdGhpcy5nZXRSYW5nZUNoYW5nZURlc2NyaXB0b3IodG9rZW4pO1xuXG4gICAgdmFyIGxpc3RlbmVycztcbiAgICBpZiAoYmVmb3JlQ2hhbmdlKSB7XG4gICAgICAgIGxpc3RlbmVycyA9IGRlc2NyaXB0b3Iud2lsbENoYW5nZUxpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLmNoYW5nZUxpc3RlbmVycztcbiAgICB9XG5cbiAgICAvLyBldmVuIGlmIGFscmVhZHkgcmVnaXN0ZXJlZFxuICAgIGxpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgXCJkaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzXCIsIHtcbiAgICAgICAgdmFsdWU6IHRydWUsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlXG4gICAgfSk7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGNhbmNlbFJhbmdlQ2hhbmdlTGlzdGVuZXIoKSB7XG4gICAgICAgIGlmICghc2VsZikge1xuICAgICAgICAgICAgLy8gVE9ETyB0aHJvdyBuZXcgRXJyb3IoXCJSYW5nZSBjaGFuZ2UgbGlzdGVuZXIgXCIgKyBKU09OLnN0cmluZ2lmeSh0b2tlbikgKyBcIiBoYXMgYWxyZWFkeSBiZWVuIGNhbmNlbGVkXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHNlbGYucmVtb3ZlUmFuZ2VDaGFuZ2VMaXN0ZW5lcihsaXN0ZW5lciwgdG9rZW4sIGJlZm9yZUNoYW5nZSk7XG4gICAgICAgIHNlbGYgPSBudWxsO1xuICAgIH07XG59O1xuXG5SYW5nZUNoYW5nZXMucHJvdG90eXBlLnJlbW92ZVJhbmdlQ2hhbmdlTGlzdGVuZXIgPSBmdW5jdGlvbiAobGlzdGVuZXIsIHRva2VuLCBiZWZvcmVDaGFuZ2UpIHtcbiAgICB2YXIgZGVzY3JpcHRvciA9IHRoaXMuZ2V0UmFuZ2VDaGFuZ2VEZXNjcmlwdG9yKHRva2VuKTtcblxuICAgIHZhciBsaXN0ZW5lcnM7XG4gICAgaWYgKGJlZm9yZUNoYW5nZSkge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLndpbGxDaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci5jaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgdmFyIGluZGV4ID0gbGlzdGVuZXJzLmxhc3RJbmRleE9mKGxpc3RlbmVyKTtcbiAgICBpZiAoaW5kZXggPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHJlbW92ZSBsaXN0ZW5lcjogZG9lcyBub3QgZXhpc3QuXCIpO1xuICAgIH1cbiAgICBsaXN0ZW5lcnMuc3BsaWNlKGluZGV4LCAxKTtcbn07XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUuZGlzcGF0Y2hSYW5nZUNoYW5nZSA9IGZ1bmN0aW9uIChwbHVzLCBtaW51cywgaW5kZXgsIGJlZm9yZUNoYW5nZSkge1xuICAgIHZhciBkZXNjcmlwdG9ycyA9IHRoaXMuZ2V0QWxsUmFuZ2VDaGFuZ2VEZXNjcmlwdG9ycygpO1xuICAgIHZhciBjaGFuZ2VOYW1lID0gXCJSYW5nZVwiICsgKGJlZm9yZUNoYW5nZSA/IFwiV2lsbENoYW5nZVwiIDogXCJDaGFuZ2VcIik7XG4gICAgZGVzY3JpcHRvcnMuZm9yRWFjaChmdW5jdGlvbiAoZGVzY3JpcHRvciwgdG9rZW4pIHtcblxuICAgICAgICBpZiAoZGVzY3JpcHRvci5pc0FjdGl2ZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVzY3JpcHRvci5pc0FjdGl2ZSA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBiZWZvcmUgb3IgYWZ0ZXJcbiAgICAgICAgdmFyIGxpc3RlbmVycztcbiAgICAgICAgaWYgKGJlZm9yZUNoYW5nZSkge1xuICAgICAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci53aWxsQ2hhbmdlTGlzdGVuZXJzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci5jaGFuZ2VMaXN0ZW5lcnM7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdG9rZW5OYW1lID0gXCJoYW5kbGVcIiArIChcbiAgICAgICAgICAgIHRva2VuLnNsaWNlKDAsIDEpLnRvVXBwZXJDYXNlKCkgK1xuICAgICAgICAgICAgdG9rZW4uc2xpY2UoMSlcbiAgICAgICAgKSArIGNoYW5nZU5hbWU7XG4gICAgICAgIC8vIG5vdGFibHksIGRlZmF1bHRzIHRvIFwiaGFuZGxlUmFuZ2VDaGFuZ2VcIiBvciBcImhhbmRsZVJhbmdlV2lsbENoYW5nZVwiXG4gICAgICAgIC8vIGlmIHRva2VuIGlzIFwiXCIgKHRoZSBkZWZhdWx0KVxuXG4gICAgICAgIC8vIGRpc3BhdGNoIGVhY2ggbGlzdGVuZXJcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxpc3RlbmVycy5mb3JFYWNoKGZ1bmN0aW9uIChsaXN0ZW5lcikge1xuICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lclt0b2tlbk5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyW3Rva2VuTmFtZV0ocGx1cywgbWludXMsIGluZGV4LCB0aGlzLCBiZWZvcmVDaGFuZ2UpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobGlzdGVuZXIuY2FsbCkge1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lci5jYWxsKHRoaXMsIHBsdXMsIG1pbnVzLCBpbmRleCwgdGhpcywgYmVmb3JlQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJIYW5kbGVyIFwiICsgbGlzdGVuZXIgKyBcIiBoYXMgbm8gbWV0aG9kIFwiICsgdG9rZW5OYW1lICsgXCIgYW5kIGlzIG5vdCBjYWxsYWJsZVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGRlc2NyaXB0b3IuaXNBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH0sIHRoaXMpO1xufTtcblxuUmFuZ2VDaGFuZ2VzLnByb3RvdHlwZS5hZGRCZWZvcmVSYW5nZUNoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyLCB0b2tlbikge1xuICAgIHJldHVybiB0aGlzLmFkZFJhbmdlQ2hhbmdlTGlzdGVuZXIobGlzdGVuZXIsIHRva2VuLCB0cnVlKTtcbn07XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUucmVtb3ZlQmVmb3JlUmFuZ2VDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChsaXN0ZW5lciwgdG9rZW4pIHtcbiAgICByZXR1cm4gdGhpcy5yZW1vdmVSYW5nZUNoYW5nZUxpc3RlbmVyKGxpc3RlbmVyLCB0b2tlbiwgdHJ1ZSk7XG59O1xuXG5SYW5nZUNoYW5nZXMucHJvdG90eXBlLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UgPSBmdW5jdGlvbiAocGx1cywgbWludXMsIGluZGV4KSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2hSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgaW5kZXgsIHRydWUpO1xufTtcblxuIiwiLy8gQ29weXJpZ2h0IChDKSAyMDExIEdvb2dsZSBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5cbi8qKlxuICogQGZpbGVvdmVydmlldyBJbnN0YWxsIGEgbGVha3kgV2Vha01hcCBlbXVsYXRpb24gb24gcGxhdGZvcm1zIHRoYXRcbiAqIGRvbid0IHByb3ZpZGUgYSBidWlsdC1pbiBvbmUuXG4gKlxuICogPHA+QXNzdW1lcyB0aGF0IGFuIEVTNSBwbGF0Zm9ybSB3aGVyZSwgaWYge0Bjb2RlIFdlYWtNYXB9IGlzXG4gKiBhbHJlYWR5IHByZXNlbnQsIHRoZW4gaXQgY29uZm9ybXMgdG8gdGhlIGFudGljaXBhdGVkIEVTNlxuICogc3BlY2lmaWNhdGlvbi4gVG8gcnVuIHRoaXMgZmlsZSBvbiBhbiBFUzUgb3IgYWxtb3N0IEVTNVxuICogaW1wbGVtZW50YXRpb24gd2hlcmUgdGhlIHtAY29kZSBXZWFrTWFwfSBzcGVjaWZpY2F0aW9uIGRvZXMgbm90XG4gKiBxdWl0ZSBjb25mb3JtLCBydW4gPGNvZGU+cmVwYWlyRVM1LmpzPC9jb2RlPiBmaXJzdC5cbiAqXG4gKiA8cD4gRXZlbiB0aG91Z2ggV2Vha01hcE1vZHVsZSBpcyBub3QgZ2xvYmFsLCB0aGUgbGludGVyIHRoaW5rcyBpdFxuICogaXMsIHdoaWNoIGlzIHdoeSBpdCBpcyBpbiB0aGUgb3ZlcnJpZGVzIGxpc3QgYmVsb3cuXG4gKlxuICogQGF1dGhvciBNYXJrIFMuIE1pbGxlclxuICogQHJlcXVpcmVzIGNyeXB0bywgQXJyYXlCdWZmZXIsIFVpbnQ4QXJyYXksIG5hdmlnYXRvclxuICogQG92ZXJyaWRlcyBXZWFrTWFwLCBzZXMsIFByb3h5XG4gKiBAb3ZlcnJpZGVzIFdlYWtNYXBNb2R1bGVcbiAqL1xuXG4vKipcbiAqIFRoaXMge0Bjb2RlIFdlYWtNYXB9IGVtdWxhdGlvbiBpcyBvYnNlcnZhYmx5IGVxdWl2YWxlbnQgdG8gdGhlXG4gKiBFUy1IYXJtb255IFdlYWtNYXAsIGJ1dCB3aXRoIGxlYWtpZXIgZ2FyYmFnZSBjb2xsZWN0aW9uIHByb3BlcnRpZXMuXG4gKlxuICogPHA+QXMgd2l0aCB0cnVlIFdlYWtNYXBzLCBpbiB0aGlzIGVtdWxhdGlvbiwgYSBrZXkgZG9lcyBub3RcbiAqIHJldGFpbiBtYXBzIGluZGV4ZWQgYnkgdGhhdCBrZXkgYW5kIChjcnVjaWFsbHkpIGEgbWFwIGRvZXMgbm90XG4gKiByZXRhaW4gdGhlIGtleXMgaXQgaW5kZXhlcy4gQSBtYXAgYnkgaXRzZWxmIGFsc28gZG9lcyBub3QgcmV0YWluXG4gKiB0aGUgdmFsdWVzIGFzc29jaWF0ZWQgd2l0aCB0aGF0IG1hcC5cbiAqXG4gKiA8cD5Ib3dldmVyLCB0aGUgdmFsdWVzIGFzc29jaWF0ZWQgd2l0aCBhIGtleSBpbiBzb21lIG1hcCBhcmVcbiAqIHJldGFpbmVkIHNvIGxvbmcgYXMgdGhhdCBrZXkgaXMgcmV0YWluZWQgYW5kIHRob3NlIGFzc29jaWF0aW9ucyBhcmVcbiAqIG5vdCBvdmVycmlkZGVuLiBGb3IgZXhhbXBsZSwgd2hlbiB1c2VkIHRvIHN1cHBvcnQgbWVtYnJhbmVzLCBhbGxcbiAqIHZhbHVlcyBleHBvcnRlZCBmcm9tIGEgZ2l2ZW4gbWVtYnJhbmUgd2lsbCBsaXZlIGZvciB0aGUgbGlmZXRpbWVcbiAqIHRoZXkgd291bGQgaGF2ZSBoYWQgaW4gdGhlIGFic2VuY2Ugb2YgYW4gaW50ZXJwb3NlZCBtZW1icmFuZS4gRXZlblxuICogd2hlbiB0aGUgbWVtYnJhbmUgaXMgcmV2b2tlZCwgYWxsIG9iamVjdHMgdGhhdCB3b3VsZCBoYXZlIGJlZW5cbiAqIHJlYWNoYWJsZSBpbiB0aGUgYWJzZW5jZSBvZiByZXZvY2F0aW9uIHdpbGwgc3RpbGwgYmUgcmVhY2hhYmxlLCBhc1xuICogZmFyIGFzIHRoZSBHQyBjYW4gdGVsbCwgZXZlbiB0aG91Z2ggdGhleSB3aWxsIG5vIGxvbmdlciBiZSByZWxldmFudFxuICogdG8gb25nb2luZyBjb21wdXRhdGlvbi5cbiAqXG4gKiA8cD5UaGUgQVBJIGltcGxlbWVudGVkIGhlcmUgaXMgYXBwcm94aW1hdGVseSB0aGUgQVBJIGFzIGltcGxlbWVudGVkXG4gKiBpbiBGRjYuMGExIGFuZCBhZ3JlZWQgdG8gYnkgTWFya00sIEFuZHJlYXMgR2FsLCBhbmQgRGF2ZSBIZXJtYW4sXG4gKiByYXRoZXIgdGhhbiB0aGUgb2ZmaWFsbHkgYXBwcm92ZWQgcHJvcG9zYWwgcGFnZS4gVE9ETyhlcmlnaHRzKTpcbiAqIHVwZ3JhZGUgdGhlIGVjbWFzY3JpcHQgV2Vha01hcCBwcm9wb3NhbCBwYWdlIHRvIGV4cGxhaW4gdGhpcyBBUElcbiAqIGNoYW5nZSBhbmQgcHJlc2VudCB0byBFY21hU2NyaXB0IGNvbW1pdHRlZSBmb3IgdGhlaXIgYXBwcm92YWwuXG4gKlxuICogPHA+VGhlIGZpcnN0IGRpZmZlcmVuY2UgYmV0d2VlbiB0aGUgZW11bGF0aW9uIGhlcmUgYW5kIHRoYXQgaW5cbiAqIEZGNi4wYTEgaXMgdGhlIHByZXNlbmNlIG9mIG5vbiBlbnVtZXJhYmxlIHtAY29kZSBnZXRfX18sIGhhc19fXyxcbiAqIHNldF9fXywgYW5kIGRlbGV0ZV9fX30gbWV0aG9kcyBvbiBXZWFrTWFwIGluc3RhbmNlcyB0byByZXByZXNlbnRcbiAqIHdoYXQgd291bGQgYmUgdGhlIGhpZGRlbiBpbnRlcm5hbCBwcm9wZXJ0aWVzIG9mIGEgcHJpbWl0aXZlXG4gKiBpbXBsZW1lbnRhdGlvbi4gV2hlcmVhcyB0aGUgRkY2LjBhMSBXZWFrTWFwLnByb3RvdHlwZSBtZXRob2RzXG4gKiByZXF1aXJlIHRoZWlyIHtAY29kZSB0aGlzfSB0byBiZSBhIGdlbnVpbmUgV2Vha01hcCBpbnN0YW5jZSAoaS5lLixcbiAqIGFuIG9iamVjdCBvZiB7QGNvZGUgW1tDbGFzc11dfSBcIldlYWtNYXB9KSwgc2luY2UgdGhlcmUgaXMgbm90aGluZ1xuICogdW5mb3JnZWFibGUgYWJvdXQgdGhlIHBzZXVkby1pbnRlcm5hbCBtZXRob2QgbmFtZXMgdXNlZCBoZXJlLFxuICogbm90aGluZyBwcmV2ZW50cyB0aGVzZSBlbXVsYXRlZCBwcm90b3R5cGUgbWV0aG9kcyBmcm9tIGJlaW5nXG4gKiBhcHBsaWVkIHRvIG5vbi1XZWFrTWFwcyB3aXRoIHBzZXVkby1pbnRlcm5hbCBtZXRob2RzIG9mIHRoZSBzYW1lXG4gKiBuYW1lcy5cbiAqXG4gKiA8cD5Bbm90aGVyIGRpZmZlcmVuY2UgaXMgdGhhdCBvdXIgZW11bGF0ZWQge0Bjb2RlXG4gKiBXZWFrTWFwLnByb3RvdHlwZX0gaXMgbm90IGl0c2VsZiBhIFdlYWtNYXAuIEEgcHJvYmxlbSB3aXRoIHRoZVxuICogY3VycmVudCBGRjYuMGExIEFQSSBpcyB0aGF0IFdlYWtNYXAucHJvdG90eXBlIGlzIGl0c2VsZiBhIFdlYWtNYXBcbiAqIHByb3ZpZGluZyBhbWJpZW50IG11dGFiaWxpdHkgYW5kIGFuIGFtYmllbnQgY29tbXVuaWNhdGlvbnNcbiAqIGNoYW5uZWwuIFRodXMsIGlmIGEgV2Vha01hcCBpcyBhbHJlYWR5IHByZXNlbnQgYW5kIGhhcyB0aGlzXG4gKiBwcm9ibGVtLCByZXBhaXJFUzUuanMgd3JhcHMgaXQgaW4gYSBzYWZlIHdyYXBwcGVyIGluIG9yZGVyIHRvXG4gKiBwcmV2ZW50IGFjY2VzcyB0byB0aGlzIGNoYW5uZWwuIChTZWVcbiAqIFBBVENIX01VVEFCTEVfRlJPWkVOX1dFQUtNQVBfUFJPVE8gaW4gcmVwYWlyRVM1LmpzKS5cbiAqL1xuXG4vKipcbiAqIElmIHRoaXMgaXMgYSBmdWxsIDxhIGhyZWY9XG4gKiBcImh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9lcy1sYWIvd2lraS9TZWN1cmVhYmxlRVM1XCJcbiAqID5zZWN1cmVhYmxlIEVTNTwvYT4gcGxhdGZvcm0gYW5kIHRoZSBFUy1IYXJtb255IHtAY29kZSBXZWFrTWFwfSBpc1xuICogYWJzZW50LCBpbnN0YWxsIGFuIGFwcHJveGltYXRlIGVtdWxhdGlvbi5cbiAqXG4gKiA8cD5JZiBXZWFrTWFwIGlzIHByZXNlbnQgYnV0IGNhbm5vdCBzdG9yZSBzb21lIG9iamVjdHMsIHVzZSBvdXIgYXBwcm94aW1hdGVcbiAqIGVtdWxhdGlvbiBhcyBhIHdyYXBwZXIuXG4gKlxuICogPHA+SWYgdGhpcyBpcyBhbG1vc3QgYSBzZWN1cmVhYmxlIEVTNSBwbGF0Zm9ybSwgdGhlbiBXZWFrTWFwLmpzXG4gKiBzaG91bGQgYmUgcnVuIGFmdGVyIHJlcGFpckVTNS5qcy5cbiAqXG4gKiA8cD5TZWUge0Bjb2RlIFdlYWtNYXB9IGZvciBkb2N1bWVudGF0aW9uIG9mIHRoZSBnYXJiYWdlIGNvbGxlY3Rpb25cbiAqIHByb3BlcnRpZXMgb2YgdGhpcyBXZWFrTWFwIGVtdWxhdGlvbi5cbiAqL1xuKGZ1bmN0aW9uIFdlYWtNYXBNb2R1bGUoKSB7XG4gIFwidXNlIHN0cmljdFwiO1xuXG4gIGlmICh0eXBlb2Ygc2VzICE9PSAndW5kZWZpbmVkJyAmJiBzZXMub2sgJiYgIXNlcy5vaygpKSB7XG4gICAgLy8gYWxyZWFkeSB0b28gYnJva2VuLCBzbyBnaXZlIHVwXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLyoqXG4gICAqIEluIHNvbWUgY2FzZXMgKGN1cnJlbnQgRmlyZWZveCksIHdlIG11c3QgbWFrZSBhIGNob2ljZSBiZXR3ZWVlbiBhXG4gICAqIFdlYWtNYXAgd2hpY2ggaXMgY2FwYWJsZSBvZiB1c2luZyBhbGwgdmFyaWV0aWVzIG9mIGhvc3Qgb2JqZWN0cyBhc1xuICAgKiBrZXlzIGFuZCBvbmUgd2hpY2ggaXMgY2FwYWJsZSBvZiBzYWZlbHkgdXNpbmcgcHJveGllcyBhcyBrZXlzLiBTZWVcbiAgICogY29tbWVudHMgYmVsb3cgYWJvdXQgSG9zdFdlYWtNYXAgYW5kIERvdWJsZVdlYWtNYXAgZm9yIGRldGFpbHMuXG4gICAqXG4gICAqIFRoaXMgZnVuY3Rpb24gKHdoaWNoIGlzIGEgZ2xvYmFsLCBub3QgZXhwb3NlZCB0byBndWVzdHMpIG1hcmtzIGFcbiAgICogV2Vha01hcCBhcyBwZXJtaXR0ZWQgdG8gZG8gd2hhdCBpcyBuZWNlc3NhcnkgdG8gaW5kZXggYWxsIGhvc3RcbiAgICogb2JqZWN0cywgYXQgdGhlIGNvc3Qgb2YgbWFraW5nIGl0IHVuc2FmZSBmb3IgcHJveGllcy5cbiAgICpcbiAgICogRG8gbm90IGFwcGx5IHRoaXMgZnVuY3Rpb24gdG8gYW55dGhpbmcgd2hpY2ggaXMgbm90IGEgZ2VudWluZVxuICAgKiBmcmVzaCBXZWFrTWFwLlxuICAgKi9cbiAgZnVuY3Rpb24gd2Vha01hcFBlcm1pdEhvc3RPYmplY3RzKG1hcCkge1xuICAgIC8vIGlkZW50aXR5IG9mIGZ1bmN0aW9uIHVzZWQgYXMgYSBzZWNyZXQgLS0gZ29vZCBlbm91Z2ggYW5kIGNoZWFwXG4gICAgaWYgKG1hcC5wZXJtaXRIb3N0T2JqZWN0c19fXykge1xuICAgICAgbWFwLnBlcm1pdEhvc3RPYmplY3RzX19fKHdlYWtNYXBQZXJtaXRIb3N0T2JqZWN0cyk7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2Ygc2VzICE9PSAndW5kZWZpbmVkJykge1xuICAgIHNlcy53ZWFrTWFwUGVybWl0SG9zdE9iamVjdHMgPSB3ZWFrTWFwUGVybWl0SG9zdE9iamVjdHM7XG4gIH1cblxuICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbHJlYWR5IGEgZ29vZC1lbm91Z2ggV2Vha01hcCBpbXBsZW1lbnRhdGlvbiwgYW5kIGlmIHNvXG4gIC8vIGV4aXQgd2l0aG91dCByZXBsYWNpbmcgaXQuXG4gIGlmICh0eXBlb2YgV2Vha01hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBIb3N0V2Vha01hcCA9IFdlYWtNYXA7XG4gICAgLy8gVGhlcmUgaXMgYSBXZWFrTWFwIC0tIGlzIGl0IGdvb2QgZW5vdWdoP1xuICAgIGlmICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAvRmlyZWZveC8udGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSkge1xuICAgICAgLy8gV2UncmUgbm93ICphc3N1bWluZyBub3QqLCBiZWNhdXNlIGFzIG9mIHRoaXMgd3JpdGluZyAoMjAxMy0wNS0wNilcbiAgICAgIC8vIEZpcmVmb3gncyBXZWFrTWFwcyBoYXZlIGEgbWlzY2VsbGFueSBvZiBvYmplY3RzIHRoZXkgd29uJ3QgYWNjZXB0LCBhbmRcbiAgICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gbWFrZSBhbiBleGhhdXN0aXZlIGxpc3QsIGFuZCB0ZXN0aW5nIGZvciBqdXN0IG9uZVxuICAgICAgLy8gd2lsbCBiZSBhIHByb2JsZW0gaWYgdGhhdCBvbmUgaXMgZml4ZWQgYWxvbmUgKGFzIHRoZXkgZGlkIGZvciBFdmVudCkuXG5cbiAgICAgIC8vIElmIHRoZXJlIGlzIGEgcGxhdGZvcm0gdGhhdCB3ZSAqY2FuKiByZWxpYWJseSB0ZXN0IG9uLCBoZXJlJ3MgaG93IHRvXG4gICAgICAvLyBkbyBpdDpcbiAgICAgIC8vICB2YXIgcHJvYmxlbWF0aWMgPSAuLi4gO1xuICAgICAgLy8gIHZhciB0ZXN0SG9zdE1hcCA9IG5ldyBIb3N0V2Vha01hcCgpO1xuICAgICAgLy8gIHRyeSB7XG4gICAgICAvLyAgICB0ZXN0SG9zdE1hcC5zZXQocHJvYmxlbWF0aWMsIDEpOyAgLy8gRmlyZWZveCAyMCB3aWxsIHRocm93IGhlcmVcbiAgICAgIC8vICAgIGlmICh0ZXN0SG9zdE1hcC5nZXQocHJvYmxlbWF0aWMpID09PSAxKSB7XG4gICAgICAvLyAgICAgIHJldHVybjtcbiAgICAgIC8vICAgIH1cbiAgICAgIC8vICB9IGNhdGNoIChlKSB7fVxuXG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gaW5zdGFsbGluZyBvdXIgV2Vha01hcC5cbiAgICB9IGVsc2Uge1xuICAgICAgbW9kdWxlLmV4cG9ydHMgPSBXZWFrTWFwO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuXG4gIHZhciBob3AgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuICB2YXIgZ29wbiA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzO1xuICB2YXIgZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbiAgdmFyIGlzRXh0ZW5zaWJsZSA9IE9iamVjdC5pc0V4dGVuc2libGU7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGRlcGVuZHMgb24gSElEREVOX05BTUUgYmVpbmcgYm90aCA8aT51bmd1ZXNzYWJsZTwvaT4gYW5kXG4gICAqIDxpPnVuZGlzY292ZXJhYmxlPC9pPiBieSB1bnRydXN0ZWQgY29kZS5cbiAgICpcbiAgICogPHA+R2l2ZW4gdGhlIGtub3duIHdlYWtuZXNzZXMgb2YgTWF0aC5yYW5kb20oKSBvbiBleGlzdGluZ1xuICAgKiBicm93c2VycywgaXQgZG9lcyBub3QgZ2VuZXJhdGUgdW5ndWVzc2FiaWxpdHkgd2UgY2FuIGJlIGNvbmZpZGVudFxuICAgKiBvZi5cbiAgICpcbiAgICogPHA+SXQgaXMgdGhlIG1vbmtleSBwYXRjaGluZyBsb2dpYyBpbiB0aGlzIGZpbGUgdGhhdCBpcyBpbnRlbmRlZFxuICAgKiB0byBlbnN1cmUgdW5kaXNjb3ZlcmFiaWxpdHkuIFRoZSBiYXNpYyBpZGVhIGlzIHRoYXQgdGhlcmUgYXJlXG4gICAqIHRocmVlIGZ1bmRhbWVudGFsIG1lYW5zIG9mIGRpc2NvdmVyaW5nIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0OlxuICAgKiBUaGUgZm9yL2luIGxvb3AsIE9iamVjdC5rZXlzKCksIGFuZCBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcygpLFxuICAgKiBhcyB3ZWxsIGFzIHNvbWUgcHJvcG9zZWQgRVM2IGV4dGVuc2lvbnMgdGhhdCBhcHBlYXIgb24gb3VyXG4gICAqIHdoaXRlbGlzdC4gVGhlIGZpcnN0IHR3byBvbmx5IGRpc2NvdmVyIGVudW1lcmFibGUgcHJvcGVydGllcywgYW5kXG4gICAqIHdlIG9ubHkgdXNlIEhJRERFTl9OQU1FIHRvIG5hbWUgYSBub24tZW51bWVyYWJsZSBwcm9wZXJ0eSwgc28gdGhlXG4gICAqIG9ubHkgcmVtYWluaW5nIHRocmVhdCBzaG91bGQgYmUgZ2V0T3duUHJvcGVydHlOYW1lcyBhbmQgc29tZVxuICAgKiBwcm9wb3NlZCBFUzYgZXh0ZW5zaW9ucyB0aGF0IGFwcGVhciBvbiBvdXIgd2hpdGVsaXN0LiBXZSBtb25rZXlcbiAgICogcGF0Y2ggdGhlbSB0byByZW1vdmUgSElEREVOX05BTUUgZnJvbSB0aGUgbGlzdCBvZiBwcm9wZXJ0aWVzIHRoZXlcbiAgICogcmV0dXJucy5cbiAgICpcbiAgICogPHA+VE9ETyhlcmlnaHRzKTogT24gYSBwbGF0Zm9ybSB3aXRoIGJ1aWx0LWluIFByb3hpZXMsIHByb3hpZXNcbiAgICogY291bGQgYmUgdXNlZCB0byB0cmFwIGFuZCB0aGVyZWJ5IGRpc2NvdmVyIHRoZSBISURERU5fTkFNRSwgc28gd2VcbiAgICogbmVlZCB0byBtb25rZXkgcGF0Y2ggUHJveHkuY3JlYXRlLCBQcm94eS5jcmVhdGVGdW5jdGlvbiwgZXRjLCBpblxuICAgKiBvcmRlciB0byB3cmFwIHRoZSBwcm92aWRlZCBoYW5kbGVyIHdpdGggdGhlIHJlYWwgaGFuZGxlciB3aGljaFxuICAgKiBmaWx0ZXJzIG91dCBhbGwgdHJhcHMgdXNpbmcgSElEREVOX05BTUUuXG4gICAqXG4gICAqIDxwPlRPRE8oZXJpZ2h0cyk6IFJldmlzaXQgTWlrZSBTdGF5J3Mgc3VnZ2VzdGlvbiB0aGF0IHdlIHVzZSBhblxuICAgKiBlbmNhcHN1bGF0ZWQgZnVuY3Rpb24gYXQgYSBub3QtbmVjZXNzYXJpbHktc2VjcmV0IG5hbWUsIHdoaWNoXG4gICAqIHVzZXMgdGhlIFN0aWVnbGVyIHNoYXJlZC1zdGF0ZSByaWdodHMgYW1wbGlmaWNhdGlvbiBwYXR0ZXJuIHRvXG4gICAqIHJldmVhbCB0aGUgYXNzb2NpYXRlZCB2YWx1ZSBvbmx5IHRvIHRoZSBXZWFrTWFwIGluIHdoaWNoIHRoaXMga2V5XG4gICAqIGlzIGFzc29jaWF0ZWQgd2l0aCB0aGF0IHZhbHVlLiBTaW5jZSBvbmx5IHRoZSBrZXkgcmV0YWlucyB0aGVcbiAgICogZnVuY3Rpb24sIHRoZSBmdW5jdGlvbiBjYW4gYWxzbyByZW1lbWJlciB0aGUga2V5IHdpdGhvdXQgY2F1c2luZ1xuICAgKiBsZWFrYWdlIG9mIHRoZSBrZXksIHNvIHRoaXMgZG9lc24ndCB2aW9sYXRlIG91ciBnZW5lcmFsIGdjXG4gICAqIGdvYWxzLiBJbiBhZGRpdGlvbiwgYmVjYXVzZSB0aGUgbmFtZSBuZWVkIG5vdCBiZSBhIGd1YXJkZWRcbiAgICogc2VjcmV0LCB3ZSBjb3VsZCBlZmZpY2llbnRseSBoYW5kbGUgY3Jvc3MtZnJhbWUgZnJvemVuIGtleXMuXG4gICAqL1xuICB2YXIgSElEREVOX05BTUVfUFJFRklYID0gJ3dlYWttYXA6JztcbiAgdmFyIEhJRERFTl9OQU1FID0gSElEREVOX05BTUVfUFJFRklYICsgJ2lkZW50OicgKyBNYXRoLnJhbmRvbSgpICsgJ19fXyc7XG5cbiAgaWYgKHR5cGVvZiBjcnlwdG8gIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgdHlwZW9mIEFycmF5QnVmZmVyID09PSAnZnVuY3Rpb24nICYmXG4gICAgICB0eXBlb2YgVWludDhBcnJheSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBhYiA9IG5ldyBBcnJheUJ1ZmZlcigyNSk7XG4gICAgdmFyIHU4cyA9IG5ldyBVaW50OEFycmF5KGFiKTtcbiAgICBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKHU4cyk7XG4gICAgSElEREVOX05BTUUgPSBISURERU5fTkFNRV9QUkVGSVggKyAncmFuZDonICtcbiAgICAgIEFycmF5LnByb3RvdHlwZS5tYXAuY2FsbCh1OHMsIGZ1bmN0aW9uKHU4KSB7XG4gICAgICAgIHJldHVybiAodTggJSAzNikudG9TdHJpbmcoMzYpO1xuICAgICAgfSkuam9pbignJykgKyAnX19fJztcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzTm90SGlkZGVuTmFtZShuYW1lKSB7XG4gICAgcmV0dXJuICEoXG4gICAgICAgIG5hbWUuc3Vic3RyKDAsIEhJRERFTl9OQU1FX1BSRUZJWC5sZW5ndGgpID09IEhJRERFTl9OQU1FX1BSRUZJWCAmJlxuICAgICAgICBuYW1lLnN1YnN0cihuYW1lLmxlbmd0aCAtIDMpID09PSAnX19fJyk7XG4gIH1cblxuICAvKipcbiAgICogTW9ua2V5IHBhdGNoIGdldE93blByb3BlcnR5TmFtZXMgdG8gYXZvaWQgcmV2ZWFsaW5nIHRoZVxuICAgKiBISURERU5fTkFNRS5cbiAgICpcbiAgICogPHA+VGhlIEVTNS4xIHNwZWMgcmVxdWlyZXMgZWFjaCBuYW1lIHRvIGFwcGVhciBvbmx5IG9uY2UsIGJ1dCBhc1xuICAgKiBvZiB0aGlzIHdyaXRpbmcsIHRoaXMgcmVxdWlyZW1lbnQgaXMgY29udHJvdmVyc2lhbCBmb3IgRVM2LCBzbyB3ZVxuICAgKiBtYWRlIHRoaXMgY29kZSByb2J1c3QgYWdhaW5zdCB0aGlzIGNhc2UuIElmIHRoZSByZXN1bHRpbmcgZXh0cmFcbiAgICogc2VhcmNoIHR1cm5zIG91dCB0byBiZSBleHBlbnNpdmUsIHdlIGNhbiBwcm9iYWJseSByZWxheCB0aGlzIG9uY2VcbiAgICogRVM2IGlzIGFkZXF1YXRlbHkgc3VwcG9ydGVkIG9uIGFsbCBtYWpvciBicm93c2VycywgaWZmIG5vIGJyb3dzZXJcbiAgICogdmVyc2lvbnMgd2Ugc3VwcG9ydCBhdCB0aGF0IHRpbWUgaGF2ZSByZWxheGVkIHRoaXMgY29uc3RyYWludFxuICAgKiB3aXRob3V0IHByb3ZpZGluZyBidWlsdC1pbiBFUzYgV2Vha01hcHMuXG4gICAqL1xuICBkZWZQcm9wKE9iamVjdCwgJ2dldE93blByb3BlcnR5TmFtZXMnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uIGZha2VHZXRPd25Qcm9wZXJ0eU5hbWVzKG9iaikge1xuICAgICAgcmV0dXJuIGdvcG4ob2JqKS5maWx0ZXIoaXNOb3RIaWRkZW5OYW1lKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBnZXRQcm9wZXJ0eU5hbWVzIGlzIG5vdCBpbiBFUzUgYnV0IGl0IGlzIHByb3Bvc2VkIGZvciBFUzYgYW5kXG4gICAqIGRvZXMgYXBwZWFyIGluIG91ciB3aGl0ZWxpc3QsIHNvIHdlIG5lZWQgdG8gY2xlYW4gaXQgdG9vLlxuICAgKi9cbiAgaWYgKCdnZXRQcm9wZXJ0eU5hbWVzJyBpbiBPYmplY3QpIHtcbiAgICB2YXIgb3JpZ2luYWxHZXRQcm9wZXJ0eU5hbWVzID0gT2JqZWN0LmdldFByb3BlcnR5TmFtZXM7XG4gICAgZGVmUHJvcChPYmplY3QsICdnZXRQcm9wZXJ0eU5hbWVzJywge1xuICAgICAgdmFsdWU6IGZ1bmN0aW9uIGZha2VHZXRQcm9wZXJ0eU5hbWVzKG9iaikge1xuICAgICAgICByZXR1cm4gb3JpZ2luYWxHZXRQcm9wZXJ0eU5hbWVzKG9iaikuZmlsdGVyKGlzTm90SGlkZGVuTmFtZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogPHA+VG8gdHJlYXQgb2JqZWN0cyBhcyBpZGVudGl0eS1rZXlzIHdpdGggcmVhc29uYWJsZSBlZmZpY2llbmN5XG4gICAqIG9uIEVTNSBieSBpdHNlbGYgKGkuZS4sIHdpdGhvdXQgYW55IG9iamVjdC1rZXllZCBjb2xsZWN0aW9ucyksIHdlXG4gICAqIG5lZWQgdG8gYWRkIGEgaGlkZGVuIHByb3BlcnR5IHRvIHN1Y2gga2V5IG9iamVjdHMgd2hlbiB3ZVxuICAgKiBjYW4uIFRoaXMgcmFpc2VzIHNldmVyYWwgaXNzdWVzOlxuICAgKiA8dWw+XG4gICAqIDxsaT5BcnJhbmdpbmcgdG8gYWRkIHRoaXMgcHJvcGVydHkgdG8gb2JqZWN0cyBiZWZvcmUgd2UgbG9zZSB0aGVcbiAgICogICAgIGNoYW5jZSwgYW5kXG4gICAqIDxsaT5IaWRpbmcgdGhlIGV4aXN0ZW5jZSBvZiB0aGlzIG5ldyBwcm9wZXJ0eSBmcm9tIG1vc3RcbiAgICogICAgIEphdmFTY3JpcHQgY29kZS5cbiAgICogPGxpPlByZXZlbnRpbmcgPGk+Y2VydGlmaWNhdGlvbiB0aGVmdDwvaT4sIHdoZXJlIG9uZSBvYmplY3QgaXNcbiAgICogICAgIGNyZWF0ZWQgZmFsc2VseSBjbGFpbWluZyB0byBiZSB0aGUga2V5IG9mIGFuIGFzc29jaWF0aW9uXG4gICAqICAgICBhY3R1YWxseSBrZXllZCBieSBhbm90aGVyIG9iamVjdC5cbiAgICogPGxpPlByZXZlbnRpbmcgPGk+dmFsdWUgdGhlZnQ8L2k+LCB3aGVyZSB1bnRydXN0ZWQgY29kZSB3aXRoXG4gICAqICAgICBhY2Nlc3MgdG8gYSBrZXkgb2JqZWN0IGJ1dCBub3QgYSB3ZWFrIG1hcCBuZXZlcnRoZWxlc3NcbiAgICogICAgIG9idGFpbnMgYWNjZXNzIHRvIHRoZSB2YWx1ZSBhc3NvY2lhdGVkIHdpdGggdGhhdCBrZXkgaW4gdGhhdFxuICAgKiAgICAgd2VhayBtYXAuXG4gICAqIDwvdWw+XG4gICAqIFdlIGRvIHNvIGJ5XG4gICAqIDx1bD5cbiAgICogPGxpPk1ha2luZyB0aGUgbmFtZSBvZiB0aGUgaGlkZGVuIHByb3BlcnR5IHVuZ3Vlc3NhYmxlLCBzbyBcIltdXCJcbiAgICogICAgIGluZGV4aW5nLCB3aGljaCB3ZSBjYW5ub3QgaW50ZXJjZXB0LCBjYW5ub3QgYmUgdXNlZCB0byBhY2Nlc3NcbiAgICogICAgIGEgcHJvcGVydHkgd2l0aG91dCBrbm93aW5nIHRoZSBuYW1lLlxuICAgKiA8bGk+TWFraW5nIHRoZSBoaWRkZW4gcHJvcGVydHkgbm9uLWVudW1lcmFibGUsIHNvIHdlIG5lZWQgbm90XG4gICAqICAgICB3b3JyeSBhYm91dCBmb3ItaW4gbG9vcHMgb3Ige0Bjb2RlIE9iamVjdC5rZXlzfSxcbiAgICogPGxpPm1vbmtleSBwYXRjaGluZyB0aG9zZSByZWZsZWN0aXZlIG1ldGhvZHMgdGhhdCB3b3VsZFxuICAgKiAgICAgcHJldmVudCBleHRlbnNpb25zLCB0byBhZGQgdGhpcyBoaWRkZW4gcHJvcGVydHkgZmlyc3QsXG4gICAqIDxsaT5tb25rZXkgcGF0Y2hpbmcgdGhvc2UgbWV0aG9kcyB0aGF0IHdvdWxkIHJldmVhbCB0aGlzXG4gICAqICAgICBoaWRkZW4gcHJvcGVydHkuXG4gICAqIDwvdWw+XG4gICAqIFVuZm9ydHVuYXRlbHksIGJlY2F1c2Ugb2Ygc2FtZS1vcmlnaW4gaWZyYW1lcywgd2UgY2Fubm90IHJlbGlhYmx5XG4gICAqIGFkZCB0aGlzIGhpZGRlbiBwcm9wZXJ0eSBiZWZvcmUgYW4gb2JqZWN0IGJlY29tZXNcbiAgICogbm9uLWV4dGVuc2libGUuIEluc3RlYWQsIGlmIHdlIGVuY291bnRlciBhIG5vbi1leHRlbnNpYmxlIG9iamVjdFxuICAgKiB3aXRob3V0IGEgaGlkZGVuIHJlY29yZCB0aGF0IHdlIGNhbiBkZXRlY3QgKHdoZXRoZXIgb3Igbm90IGl0IGhhc1xuICAgKiBhIGhpZGRlbiByZWNvcmQgc3RvcmVkIHVuZGVyIGEgbmFtZSBzZWNyZXQgdG8gdXMpLCB0aGVuIHdlIGp1c3RcbiAgICogdXNlIHRoZSBrZXkgb2JqZWN0IGl0c2VsZiB0byByZXByZXNlbnQgaXRzIGlkZW50aXR5IGluIGEgYnJ1dGVcbiAgICogZm9yY2UgbGVha3kgbWFwIHN0b3JlZCBpbiB0aGUgd2VhayBtYXAsIGxvc2luZyBhbGwgdGhlIGFkdmFudGFnZXNcbiAgICogb2Ygd2Vha25lc3MgZm9yIHRoZXNlLlxuICAgKi9cbiAgZnVuY3Rpb24gZ2V0SGlkZGVuUmVjb3JkKGtleSkge1xuICAgIGlmIChrZXkgIT09IE9iamVjdChrZXkpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdOb3QgYW4gb2JqZWN0OiAnICsga2V5KTtcbiAgICB9XG4gICAgdmFyIGhpZGRlblJlY29yZCA9IGtleVtISURERU5fTkFNRV07XG4gICAgaWYgKGhpZGRlblJlY29yZCAmJiBoaWRkZW5SZWNvcmQua2V5ID09PSBrZXkpIHsgcmV0dXJuIGhpZGRlblJlY29yZDsgfVxuICAgIGlmICghaXNFeHRlbnNpYmxlKGtleSkpIHtcbiAgICAgIC8vIFdlYWsgbWFwIG11c3QgYnJ1dGUgZm9yY2UsIGFzIGV4cGxhaW5lZCBpbiBkb2MtY29tbWVudCBhYm92ZS5cbiAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgfVxuICAgIHZhciBnZXRzID0gW107XG4gICAgdmFyIHZhbHMgPSBbXTtcbiAgICBoaWRkZW5SZWNvcmQgPSB7XG4gICAgICBrZXk6IGtleSwgICAvLyBzZWxmIHBvaW50ZXIgZm9yIHF1aWNrIG93biBjaGVjayBhYm92ZS5cbiAgICAgIGdldHM6IGdldHMsIC8vIGdldF9fXyBtZXRob2RzIGlkZW50aWZ5aW5nIHdlYWsgbWFwc1xuICAgICAgdmFsczogdmFscyAgLy8gdmFsdWVzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGtleSBpbiBlYWNoXG4gICAgICAgICAgICAgICAgICAvLyBjb3JyZXNwb25kaW5nIHdlYWsgbWFwLlxuICAgIH07XG4gICAgZGVmUHJvcChrZXksIEhJRERFTl9OQU1FLCB7XG4gICAgICB2YWx1ZTogaGlkZGVuUmVjb3JkLFxuICAgICAgd3JpdGFibGU6IGZhbHNlLFxuICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICBjb25maWd1cmFibGU6IGZhbHNlXG4gICAgfSk7XG4gICAgcmV0dXJuIGhpZGRlblJlY29yZDtcbiAgfVxuXG5cbiAgLyoqXG4gICAqIE1vbmtleSBwYXRjaCBvcGVyYXRpb25zIHRoYXQgd291bGQgbWFrZSB0aGVpciBhcmd1bWVudFxuICAgKiBub24tZXh0ZW5zaWJsZS5cbiAgICpcbiAgICogPHA+VGhlIG1vbmtleSBwYXRjaGVkIHZlcnNpb25zIHRocm93IGEgVHlwZUVycm9yIGlmIHRoZWlyXG4gICAqIGFyZ3VtZW50IGlzIG5vdCBhbiBvYmplY3QsIHNvIGl0IHNob3VsZCBvbmx5IGJlIGRvbmUgdG8gZnVuY3Rpb25zXG4gICAqIHRoYXQgc2hvdWxkIHRocm93IGEgVHlwZUVycm9yIGFueXdheSBpZiB0aGVpciBhcmd1bWVudCBpcyBub3QgYW5cbiAgICogb2JqZWN0LlxuICAgKi9cbiAgKGZ1bmN0aW9uKCl7XG4gICAgdmFyIG9sZEZyZWV6ZSA9IE9iamVjdC5mcmVlemU7XG4gICAgZGVmUHJvcChPYmplY3QsICdmcmVlemUnLCB7XG4gICAgICB2YWx1ZTogZnVuY3Rpb24gaWRlbnRpZnlpbmdGcmVlemUob2JqKSB7XG4gICAgICAgIGdldEhpZGRlblJlY29yZChvYmopO1xuICAgICAgICByZXR1cm4gb2xkRnJlZXplKG9iaik7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdmFyIG9sZFNlYWwgPSBPYmplY3Quc2VhbDtcbiAgICBkZWZQcm9wKE9iamVjdCwgJ3NlYWwnLCB7XG4gICAgICB2YWx1ZTogZnVuY3Rpb24gaWRlbnRpZnlpbmdTZWFsKG9iaikge1xuICAgICAgICBnZXRIaWRkZW5SZWNvcmQob2JqKTtcbiAgICAgICAgcmV0dXJuIG9sZFNlYWwob2JqKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB2YXIgb2xkUHJldmVudEV4dGVuc2lvbnMgPSBPYmplY3QucHJldmVudEV4dGVuc2lvbnM7XG4gICAgZGVmUHJvcChPYmplY3QsICdwcmV2ZW50RXh0ZW5zaW9ucycsIHtcbiAgICAgIHZhbHVlOiBmdW5jdGlvbiBpZGVudGlmeWluZ1ByZXZlbnRFeHRlbnNpb25zKG9iaikge1xuICAgICAgICBnZXRIaWRkZW5SZWNvcmQob2JqKTtcbiAgICAgICAgcmV0dXJuIG9sZFByZXZlbnRFeHRlbnNpb25zKG9iaik7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pKCk7XG5cblxuICBmdW5jdGlvbiBjb25zdEZ1bmMoZnVuYykge1xuICAgIGZ1bmMucHJvdG90eXBlID0gbnVsbDtcbiAgICByZXR1cm4gT2JqZWN0LmZyZWV6ZShmdW5jKTtcbiAgfVxuXG4gIC8vIFJpZ2h0IG5vdyAoMTIvMjUvMjAxMikgdGhlIGhpc3RvZ3JhbSBzdXBwb3J0cyB0aGUgY3VycmVudFxuICAvLyByZXByZXNlbnRhdGlvbi4gV2Ugc2hvdWxkIGNoZWNrIHRoaXMgb2NjYXNpb25hbGx5LCBhcyBhIHRydWVcbiAgLy8gY29uc3RhbnQgdGltZSByZXByZXNlbnRhdGlvbiBpcyBlYXN5LlxuICAvLyB2YXIgaGlzdG9ncmFtID0gW107XG5cbiAgdmFyIE91cldlYWtNYXAgPSBmdW5jdGlvbigpIHtcbiAgICAvLyBXZSBhcmUgY3VycmVudGx5ICgxMi8yNS8yMDEyKSBuZXZlciBlbmNvdW50ZXJpbmcgYW55IHByZW1hdHVyZWx5XG4gICAgLy8gbm9uLWV4dGVuc2libGUga2V5cy5cbiAgICB2YXIga2V5cyA9IFtdOyAvLyBicnV0ZSBmb3JjZSBmb3IgcHJlbWF0dXJlbHkgbm9uLWV4dGVuc2libGUga2V5cy5cbiAgICB2YXIgdmFscyA9IFtdOyAvLyBicnV0ZSBmb3JjZSBmb3IgY29ycmVzcG9uZGluZyB2YWx1ZXMuXG5cbiAgICBmdW5jdGlvbiBnZXRfX18oa2V5LCBvcHRfZGVmYXVsdCkge1xuICAgICAgdmFyIGhyID0gZ2V0SGlkZGVuUmVjb3JkKGtleSk7XG4gICAgICB2YXIgaSwgdnM7XG4gICAgICBpZiAoaHIpIHtcbiAgICAgICAgaSA9IGhyLmdldHMuaW5kZXhPZihnZXRfX18pO1xuICAgICAgICB2cyA9IGhyLnZhbHM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpID0ga2V5cy5pbmRleE9mKGtleSk7XG4gICAgICAgIHZzID0gdmFscztcbiAgICAgIH1cbiAgICAgIHJldHVybiAoaSA+PSAwKSA/IHZzW2ldIDogb3B0X2RlZmF1bHQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFzX19fKGtleSkge1xuICAgICAgdmFyIGhyID0gZ2V0SGlkZGVuUmVjb3JkKGtleSk7XG4gICAgICB2YXIgaTtcbiAgICAgIGlmIChocikge1xuICAgICAgICBpID0gaHIuZ2V0cy5pbmRleE9mKGdldF9fXyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpID0ga2V5cy5pbmRleE9mKGtleSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gaSA+PSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldF9fXyhrZXksIHZhbHVlKSB7XG4gICAgICB2YXIgaHIgPSBnZXRIaWRkZW5SZWNvcmQoa2V5KTtcbiAgICAgIHZhciBpO1xuICAgICAgaWYgKGhyKSB7XG4gICAgICAgIGkgPSBoci5nZXRzLmluZGV4T2YoZ2V0X19fKTtcbiAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgIGhyLnZhbHNbaV0gPSB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbi8vICAgICAgICAgIGkgPSBoci5nZXRzLmxlbmd0aDtcbi8vICAgICAgICAgIGhpc3RvZ3JhbVtpXSA9IChoaXN0b2dyYW1baV0gfHwgMCkgKyAxO1xuICAgICAgICAgIGhyLmdldHMucHVzaChnZXRfX18pO1xuICAgICAgICAgIGhyLnZhbHMucHVzaCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGkgPSBrZXlzLmluZGV4T2Yoa2V5KTtcbiAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgIHZhbHNbaV0gPSB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBrZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICB2YWxzLnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVsZXRlX19fKGtleSkge1xuICAgICAgdmFyIGhyID0gZ2V0SGlkZGVuUmVjb3JkKGtleSk7XG4gICAgICB2YXIgaTtcbiAgICAgIGlmIChocikge1xuICAgICAgICBpID0gaHIuZ2V0cy5pbmRleE9mKGdldF9fXyk7XG4gICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICBoci5nZXRzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICBoci52YWxzLnNwbGljZShpLCAxKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaSA9IGtleXMuaW5kZXhPZihrZXkpO1xuICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAga2V5cy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgdmFscy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlKE91cldlYWtNYXAucHJvdG90eXBlLCB7XG4gICAgICBnZXRfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhnZXRfX18pIH0sXG4gICAgICBoYXNfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhoYXNfX18pIH0sXG4gICAgICBzZXRfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhzZXRfX18pIH0sXG4gICAgICBkZWxldGVfX186IHsgdmFsdWU6IGNvbnN0RnVuYyhkZWxldGVfX18pIH1cbiAgICB9KTtcbiAgfTtcbiAgT3VyV2Vha01hcC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKE9iamVjdC5wcm90b3R5cGUsIHtcbiAgICBnZXQ6IHtcbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJuIHRoZSB2YWx1ZSBtb3N0IHJlY2VudGx5IGFzc29jaWF0ZWQgd2l0aCBrZXksIG9yXG4gICAgICAgKiBvcHRfZGVmYXVsdCBpZiBub25lLlxuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gZ2V0KGtleSwgb3B0X2RlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0X19fKGtleSwgb3B0X2RlZmF1bHQpO1xuICAgICAgfSxcbiAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSxcblxuICAgIGhhczoge1xuICAgICAgLyoqXG4gICAgICAgKiBJcyB0aGVyZSBhIHZhbHVlIGFzc29jaWF0ZWQgd2l0aCBrZXkgaW4gdGhpcyBXZWFrTWFwP1xuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gaGFzKGtleSkge1xuICAgICAgICByZXR1cm4gdGhpcy5oYXNfX18oa2V5KTtcbiAgICAgIH0sXG4gICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0sXG5cbiAgICBzZXQ6IHtcbiAgICAgIC8qKlxuICAgICAgICogQXNzb2NpYXRlIHZhbHVlIHdpdGgga2V5IGluIHRoaXMgV2Vha01hcCwgb3ZlcndyaXRpbmcgYW55XG4gICAgICAgKiBwcmV2aW91cyBhc3NvY2lhdGlvbiBpZiBwcmVzZW50LlxuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgdGhpcy5zZXRfX18oa2V5LCB2YWx1ZSk7XG4gICAgICB9LFxuICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9LFxuXG4gICAgJ2RlbGV0ZSc6IHtcbiAgICAgIC8qKlxuICAgICAgICogUmVtb3ZlIGFueSBhc3NvY2lhdGlvbiBmb3Iga2V5IGluIHRoaXMgV2Vha01hcCwgcmV0dXJuaW5nXG4gICAgICAgKiB3aGV0aGVyIHRoZXJlIHdhcyBvbmUuXG4gICAgICAgKlxuICAgICAgICogPHA+Tm90ZSB0aGF0IHRoZSBib29sZWFuIHJldHVybiBoZXJlIGRvZXMgbm90IHdvcmsgbGlrZSB0aGVcbiAgICAgICAqIHtAY29kZSBkZWxldGV9IG9wZXJhdG9yLiBUaGUge0Bjb2RlIGRlbGV0ZX0gb3BlcmF0b3IgcmV0dXJuc1xuICAgICAgICogd2hldGhlciB0aGUgZGVsZXRpb24gc3VjY2VlZHMgYXQgYnJpbmdpbmcgYWJvdXQgYSBzdGF0ZSBpblxuICAgICAgICogd2hpY2ggdGhlIGRlbGV0ZWQgcHJvcGVydHkgaXMgYWJzZW50LiBUaGUge0Bjb2RlIGRlbGV0ZX1cbiAgICAgICAqIG9wZXJhdG9yIHRoZXJlZm9yZSByZXR1cm5zIHRydWUgaWYgdGhlIHByb3BlcnR5IHdhcyBhbHJlYWR5XG4gICAgICAgKiBhYnNlbnQsIHdoZXJlYXMgdGhpcyB7QGNvZGUgZGVsZXRlfSBtZXRob2QgcmV0dXJucyBmYWxzZSBpZlxuICAgICAgICogdGhlIGFzc29jaWF0aW9uIHdhcyBhbHJlYWR5IGFic2VudC5cbiAgICAgICAqL1xuICAgICAgdmFsdWU6IGZ1bmN0aW9uIHJlbW92ZShrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlX19fKGtleSk7XG4gICAgICB9LFxuICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9XG4gIH0pO1xuXG4gIGlmICh0eXBlb2YgSG9zdFdlYWtNYXAgPT09ICdmdW5jdGlvbicpIHtcbiAgICAoZnVuY3Rpb24oKSB7XG4gICAgICAvLyBJZiB3ZSBnb3QgaGVyZSwgdGhlbiB0aGUgcGxhdGZvcm0gaGFzIGEgV2Vha01hcCBidXQgd2UgYXJlIGNvbmNlcm5lZFxuICAgICAgLy8gdGhhdCBpdCBtYXkgcmVmdXNlIHRvIHN0b3JlIHNvbWUga2V5IHR5cGVzLiBUaGVyZWZvcmUsIG1ha2UgYSBtYXBcbiAgICAgIC8vIGltcGxlbWVudGF0aW9uIHdoaWNoIG1ha2VzIHVzZSBvZiBib3RoIGFzIHBvc3NpYmxlLlxuXG4gICAgICBmdW5jdGlvbiBEb3VibGVXZWFrTWFwKCkge1xuICAgICAgICAvLyBQcmVmZXJhYmxlLCB0cnVseSB3ZWFrIG1hcC5cbiAgICAgICAgdmFyIGhtYXAgPSBuZXcgSG9zdFdlYWtNYXAoKTtcblxuICAgICAgICAvLyBPdXIgaGlkZGVuLXByb3BlcnR5LWJhc2VkIHBzZXVkby13ZWFrLW1hcC4gTGF6aWx5IGluaXRpYWxpemVkIGluIHRoZVxuICAgICAgICAvLyAnc2V0JyBpbXBsZW1lbnRhdGlvbjsgdGh1cyB3ZSBjYW4gYXZvaWQgcGVyZm9ybWluZyBleHRyYSBsb29rdXBzIGlmXG4gICAgICAgIC8vIHdlIGtub3cgYWxsIGVudHJpZXMgYWN0dWFsbHkgc3RvcmVkIGFyZSBlbnRlcmVkIGluICdobWFwJy5cbiAgICAgICAgdmFyIG9tYXAgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgLy8gSGlkZGVuLXByb3BlcnR5IG1hcHMgYXJlIG5vdCBjb21wYXRpYmxlIHdpdGggcHJveGllcyBiZWNhdXNlIHByb3hpZXNcbiAgICAgICAgLy8gY2FuIG9ic2VydmUgdGhlIGhpZGRlbiBuYW1lIGFuZCBlaXRoZXIgYWNjaWRlbnRhbGx5IGV4cG9zZSBpdCBvciBmYWlsXG4gICAgICAgIC8vIHRvIGFsbG93IHRoZSBoaWRkZW4gcHJvcGVydHkgdG8gYmUgc2V0LiBUaGVyZWZvcmUsIHdlIGRvIG5vdCBhbGxvd1xuICAgICAgICAvLyBhcmJpdHJhcnkgV2Vha01hcHMgdG8gc3dpdGNoIHRvIHVzaW5nIGhpZGRlbiBwcm9wZXJ0aWVzLCBidXQgb25seVxuICAgICAgICAvLyB0aG9zZSB3aGljaCBuZWVkIHRoZSBhYmlsaXR5LCBhbmQgdW5wcml2aWxlZ2VkIGNvZGUgaXMgbm90IGFsbG93ZWRcbiAgICAgICAgLy8gdG8gc2V0IHRoZSBmbGFnLlxuICAgICAgICB2YXIgZW5hYmxlU3dpdGNoaW5nID0gZmFsc2U7XG5cbiAgICAgICAgZnVuY3Rpb24gZGdldChrZXksIG9wdF9kZWZhdWx0KSB7XG4gICAgICAgICAgaWYgKG9tYXApIHtcbiAgICAgICAgICAgIHJldHVybiBobWFwLmhhcyhrZXkpID8gaG1hcC5nZXQoa2V5KVxuICAgICAgICAgICAgICAgIDogb21hcC5nZXRfX18oa2V5LCBvcHRfZGVmYXVsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBobWFwLmdldChrZXksIG9wdF9kZWZhdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkaGFzKGtleSkge1xuICAgICAgICAgIHJldHVybiBobWFwLmhhcyhrZXkpIHx8IChvbWFwID8gb21hcC5oYXNfX18oa2V5KSA6IGZhbHNlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICAgIGlmIChlbmFibGVTd2l0Y2hpbmcpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGhtYXAuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBpZiAoIW9tYXApIHsgb21hcCA9IG5ldyBPdXJXZWFrTWFwKCk7IH1cbiAgICAgICAgICAgICAgb21hcC5zZXRfX18oa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGhtYXAuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRkZWxldGUoa2V5KSB7XG4gICAgICAgICAgaG1hcFsnZGVsZXRlJ10oa2V5KTtcbiAgICAgICAgICBpZiAob21hcCkgeyBvbWFwLmRlbGV0ZV9fXyhrZXkpOyB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZShPdXJXZWFrTWFwLnByb3RvdHlwZSwge1xuICAgICAgICAgIGdldF9fXzogICAgeyB2YWx1ZTogY29uc3RGdW5jKGRnZXQpIH0sXG4gICAgICAgICAgaGFzX19fOiAgICB7IHZhbHVlOiBjb25zdEZ1bmMoZGhhcykgfSxcbiAgICAgICAgICBzZXRfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhkc2V0KSB9LFxuICAgICAgICAgIGRlbGV0ZV9fXzogeyB2YWx1ZTogY29uc3RGdW5jKGRkZWxldGUpIH0sXG4gICAgICAgICAgcGVybWl0SG9zdE9iamVjdHNfX186IHsgdmFsdWU6IGNvbnN0RnVuYyhmdW5jdGlvbih0b2tlbikge1xuICAgICAgICAgICAgaWYgKHRva2VuID09PSB3ZWFrTWFwUGVybWl0SG9zdE9iamVjdHMpIHtcbiAgICAgICAgICAgICAgZW5hYmxlU3dpdGNoaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignYm9ndXMgY2FsbCB0byBwZXJtaXRIb3N0T2JqZWN0c19fXycpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIERvdWJsZVdlYWtNYXAucHJvdG90eXBlID0gT3VyV2Vha01hcC5wcm90b3R5cGU7XG4gICAgICBtb2R1bGUuZXhwb3J0cyA9IERvdWJsZVdlYWtNYXA7XG5cbiAgICAgIC8vIGRlZmluZSAuY29uc3RydWN0b3IgdG8gaGlkZSBPdXJXZWFrTWFwIGN0b3JcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShXZWFrTWFwLnByb3RvdHlwZSwgJ2NvbnN0cnVjdG9yJywge1xuICAgICAgICB2YWx1ZTogV2Vha01hcCxcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsICAvLyBhcyBkZWZhdWx0IC5jb25zdHJ1Y3RvciBpc1xuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlXG4gICAgICB9KTtcbiAgICB9KSgpO1xuICB9IGVsc2Uge1xuICAgIC8vIFRoZXJlIGlzIG5vIGhvc3QgV2Vha01hcCwgc28gd2UgbXVzdCB1c2UgdGhlIGVtdWxhdGlvbi5cblxuICAgIC8vIEVtdWxhdGVkIFdlYWtNYXBzIGFyZSBpbmNvbXBhdGlibGUgd2l0aCBuYXRpdmUgcHJveGllcyAoYmVjYXVzZSBwcm94aWVzXG4gICAgLy8gY2FuIG9ic2VydmUgdGhlIGhpZGRlbiBuYW1lKSwgc28gd2UgbXVzdCBkaXNhYmxlIFByb3h5IHVzYWdlIChpblxuICAgIC8vIEFycmF5TGlrZSBhbmQgRG9tYWRvLCBjdXJyZW50bHkpLlxuICAgIGlmICh0eXBlb2YgUHJveHkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBQcm94eSA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IE91cldlYWtNYXA7XG4gIH1cbn0pKCk7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLypcbiAgICBCYXNlZCBpbiBwYXJ0IG9uIGV4dHJhcyBmcm9tIE1vdG9yb2xhIE1vYmlsaXR54oCZcyBNb250YWdlXG4gICAgQ29weXJpZ2h0IChjKSAyMDEyLCBNb3Rvcm9sYSBNb2JpbGl0eSBMTEMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gICAgMy1DbGF1c2UgQlNEIExpY2Vuc2VcbiAgICBodHRwczovL2dpdGh1Yi5jb20vbW90b3JvbGEtbW9iaWxpdHkvbW9udGFnZS9ibG9iL21hc3Rlci9MSUNFTlNFLm1kXG4qL1xuXG52YXIgRnVuY3Rpb24gPSByZXF1aXJlKFwiLi9zaGltLWZ1bmN0aW9uXCIpO1xudmFyIEdlbmVyaWNDb2xsZWN0aW9uID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1jb2xsZWN0aW9uXCIpO1xudmFyIEdlbmVyaWNPcmRlciA9IHJlcXVpcmUoXCIuL2dlbmVyaWMtb3JkZXJcIik7XG52YXIgV2Vha01hcCA9IHJlcXVpcmUoXCJ3ZWFrLW1hcFwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBBcnJheTtcblxuQXJyYXkuZW1wdHkgPSBbXTtcblxuaWYgKE9iamVjdC5mcmVlemUpIHtcbiAgICBPYmplY3QuZnJlZXplKEFycmF5LmVtcHR5KTtcbn1cblxuQXJyYXkuZnJvbSA9IGZ1bmN0aW9uICh2YWx1ZXMpIHtcbiAgICB2YXIgYXJyYXkgPSBbXTtcbiAgICBhcnJheS5hZGRFYWNoKHZhbHVlcyk7XG4gICAgcmV0dXJuIGFycmF5O1xufTtcblxuQXJyYXkudW56aXAgPSBmdW5jdGlvbiAodGFibGUpIHtcbiAgICB2YXIgdHJhbnNwb3NlID0gW107XG4gICAgdmFyIGxlbmd0aCA9IEluZmluaXR5O1xuICAgIC8vIGNvbXB1dGUgc2hvcnRlc3Qgcm93XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcm93ID0gdGFibGVbaV07XG4gICAgICAgIHRhYmxlW2ldID0gcm93LnRvQXJyYXkoKTtcbiAgICAgICAgaWYgKHJvdy5sZW5ndGggPCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGxlbmd0aCA9IHJvdy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcm93ID0gdGFibGVbaV07XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcm93Lmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICBpZiAoaiA8IGxlbmd0aCAmJiBqIGluIHJvdykge1xuICAgICAgICAgICAgICAgIHRyYW5zcG9zZVtqXSA9IHRyYW5zcG9zZVtqXSB8fCBbXTtcbiAgICAgICAgICAgICAgICB0cmFuc3Bvc2Vbal1baV0gPSByb3dbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRyYW5zcG9zZTtcbn07XG5cbmZ1bmN0aW9uIGRlZmluZShrZXksIHZhbHVlKSB7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFycmF5LnByb3RvdHlwZSwga2V5LCB7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcbiAgICB9KTtcbn1cblxuZGVmaW5lKFwiYWRkRWFjaFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuYWRkRWFjaCk7XG5kZWZpbmUoXCJkZWxldGVFYWNoXCIsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5kZWxldGVFYWNoKTtcbmRlZmluZShcInRvQXJyYXlcIiwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnRvQXJyYXkpO1xuZGVmaW5lKFwidG9PYmplY3RcIiwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnRvT2JqZWN0KTtcbmRlZmluZShcImFsbFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuYWxsKTtcbmRlZmluZShcImFueVwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuYW55KTtcbmRlZmluZShcIm1pblwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUubWluKTtcbmRlZmluZShcIm1heFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUubWF4KTtcbmRlZmluZShcInN1bVwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuc3VtKTtcbmRlZmluZShcImF2ZXJhZ2VcIiwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmF2ZXJhZ2UpO1xuZGVmaW5lKFwib25seVwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUub25seSk7XG5kZWZpbmUoXCJmbGF0dGVuXCIsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5mbGF0dGVuKTtcbmRlZmluZShcInppcFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuemlwKTtcbmRlZmluZShcImVudW1lcmF0ZVwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuZW51bWVyYXRlKTtcbmRlZmluZShcImdyb3VwXCIsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5ncm91cCk7XG5kZWZpbmUoXCJzb3J0ZWRcIiwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnNvcnRlZCk7XG5kZWZpbmUoXCJyZXZlcnNlZFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUucmV2ZXJzZWQpO1xuXG5kZWZpbmUoXCJjb25zdHJ1Y3RDbG9uZVwiLCBmdW5jdGlvbiAodmFsdWVzKSB7XG4gICAgdmFyIGNsb25lID0gbmV3IHRoaXMuY29uc3RydWN0b3IoKTtcbiAgICBjbG9uZS5hZGRFYWNoKHZhbHVlcyk7XG4gICAgcmV0dXJuIGNsb25lO1xufSk7XG5cbmRlZmluZShcImhhc1wiLCBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIHJldHVybiB0aGlzLmZpbmQodmFsdWUsIGVxdWFscykgIT09IC0xO1xufSk7XG5cbmRlZmluZShcImdldFwiLCBmdW5jdGlvbiAoaW5kZXgsIGRlZmF1bHRWYWx1ZSkge1xuICAgIGlmICgraW5kZXggIT09IGluZGV4KVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbmRpY2llcyBtdXN0IGJlIG51bWJlcnNcIik7XG4gICAgaWYgKCFpbmRleCBpbiB0aGlzKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbaW5kZXhdO1xuICAgIH1cbn0pO1xuXG5kZWZpbmUoXCJzZXRcIiwgZnVuY3Rpb24gKGluZGV4LCB2YWx1ZSkge1xuICAgIHRoaXMuc3BsaWNlKGluZGV4LCAxLCB2YWx1ZSk7XG4gICAgcmV0dXJuIHRydWU7XG59KTtcblxuZGVmaW5lKFwiYWRkXCIsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHRoaXMucHVzaCh2YWx1ZSk7XG4gICAgcmV0dXJuIHRydWU7XG59KTtcblxuZGVmaW5lKFwiZGVsZXRlXCIsIGZ1bmN0aW9uICh2YWx1ZSwgZXF1YWxzKSB7XG4gICAgdmFyIGluZGV4ID0gdGhpcy5maW5kKHZhbHVlLCBlcXVhbHMpO1xuICAgIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgdGhpcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufSk7XG5cbmRlZmluZShcImZpbmRcIiwgZnVuY3Rpb24gKHZhbHVlLCBlcXVhbHMpIHtcbiAgICBlcXVhbHMgPSBlcXVhbHMgfHwgdGhpcy5jb250ZW50RXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIGlmIChpbmRleCBpbiB0aGlzICYmIGVxdWFscyh0aGlzW2luZGV4XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIC0xO1xufSk7XG5cbmRlZmluZShcImZpbmRMYXN0XCIsIGZ1bmN0aW9uICh2YWx1ZSwgZXF1YWxzKSB7XG4gICAgZXF1YWxzID0gZXF1YWxzIHx8IHRoaXMuY29udGVudEVxdWFscyB8fCBPYmplY3QuZXF1YWxzO1xuICAgIHZhciBpbmRleCA9IHRoaXMubGVuZ3RoO1xuICAgIGRvIHtcbiAgICAgICAgaW5kZXgtLTtcbiAgICAgICAgaWYgKGluZGV4IGluIHRoaXMgJiYgZXF1YWxzKHRoaXNbaW5kZXhdLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgfVxuICAgIH0gd2hpbGUgKGluZGV4ID4gMCk7XG4gICAgcmV0dXJuIC0xO1xufSk7XG5cbmRlZmluZShcInN3YXBcIiwgZnVuY3Rpb24gKGluZGV4LCBsZW5ndGgsIHBsdXMpIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCwgMik7XG4gICAgaWYgKHBsdXMpIHtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHBsdXMpKSB7XG4gICAgICAgICAgICBwbHVzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwocGx1cyk7XG4gICAgICAgIH1cbiAgICAgICAgYXJncy5wdXNoLmFwcGx5KGFyZ3MsIHBsdXMpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zcGxpY2UuYXBwbHkodGhpcywgYXJncyk7XG59KTtcblxuZGVmaW5lKFwib25lXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKHZhciBpIGluIHRoaXMpIHtcbiAgICAgICAgaWYgKE9iamVjdC5vd25zKHRoaXMsIGkpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpc1tpXTtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5kZWZpbmUoXCJjbGVhclwiLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xuICAgIHJldHVybiB0aGlzO1xufSk7XG5cbmRlZmluZShcImNvbXBhcmVcIiwgZnVuY3Rpb24gKHRoYXQsIGNvbXBhcmUpIHtcbiAgICBjb21wYXJlID0gY29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcbiAgICB2YXIgaTtcbiAgICB2YXIgbGVuZ3RoO1xuICAgIHZhciBsaHM7XG4gICAgdmFyIHJocztcbiAgICB2YXIgcmVsYXRpdmU7XG5cbiAgICBpZiAodGhpcyA9PT0gdGhhdCkge1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBpZiAoIXRoYXQgfHwgIUFycmF5LmlzQXJyYXkodGhhdCkpIHtcbiAgICAgICAgcmV0dXJuIEdlbmVyaWNPcmRlci5wcm90b3R5cGUuY29tcGFyZS5jYWxsKHRoaXMsIHRoYXQsIGNvbXBhcmUpO1xuICAgIH1cblxuICAgIGxlbmd0aCA9IE1hdGgubWluKHRoaXMubGVuZ3RoLCB0aGF0Lmxlbmd0aCk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGkgaW4gdGhpcykge1xuICAgICAgICAgICAgaWYgKCEoaSBpbiB0aGF0KSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGhzID0gdGhpc1tpXTtcbiAgICAgICAgICAgICAgICByaHMgPSB0aGF0W2ldO1xuICAgICAgICAgICAgICAgIHJlbGF0aXZlID0gY29tcGFyZShsaHMsIHJocyk7XG4gICAgICAgICAgICAgICAgaWYgKHJlbGF0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWxhdGl2ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoaSBpbiB0aGF0KSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmxlbmd0aCAtIHRoYXQubGVuZ3RoO1xufSk7XG5cbmRlZmluZShcImVxdWFsc1wiLCBmdW5jdGlvbiAodGhhdCwgZXF1YWxzKSB7XG4gICAgZXF1YWxzID0gZXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgdmFyIGkgPSAwO1xuICAgIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aDtcbiAgICB2YXIgbGVmdDtcbiAgICB2YXIgcmlnaHQ7XG5cbiAgICBpZiAodGhpcyA9PT0gdGhhdCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKCF0aGF0IHx8ICFBcnJheS5pc0FycmF5KHRoYXQpKSB7XG4gICAgICAgIHJldHVybiBHZW5lcmljT3JkZXIucHJvdG90eXBlLmVxdWFscy5jYWxsKHRoaXMsIHRoYXQpO1xuICAgIH1cblxuICAgIGlmIChsZW5ndGggIT09IHRoYXQubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKDsgaSA8IGxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBpZiAoaSBpbiB0aGlzKSB7XG4gICAgICAgICAgICAgICAgaWYgKCEoaSBpbiB0aGF0KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxlZnQgPSB0aGlzW2ldO1xuICAgICAgICAgICAgICAgIHJpZ2h0ID0gdGhhdFtpXTtcbiAgICAgICAgICAgICAgICBpZiAoIWVxdWFscyhsZWZ0LCByaWdodCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgaW4gdGhhdCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufSk7XG5cbmRlZmluZShcImNsb25lXCIsIGZ1bmN0aW9uIChkZXB0aCwgbWVtbykge1xuICAgIGlmIChkZXB0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlcHRoID0gSW5maW5pdHk7XG4gICAgfSBlbHNlIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgbWVtbyA9IG1lbW8gfHwgbmV3IFdlYWtNYXAoKTtcbiAgICB2YXIgY2xvbmUgPSBbXTtcbiAgICBmb3IgKHZhciBpIGluIHRoaXMpIHtcbiAgICAgICAgaWYgKE9iamVjdC5vd25zKHRoaXMsIGkpKSB7XG4gICAgICAgICAgICBjbG9uZVtpXSA9IE9iamVjdC5jbG9uZSh0aGlzW2ldLCBkZXB0aCAtIDEsIG1lbW8pO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gY2xvbmU7XG59KTtcblxuZGVmaW5lKFwiaXRlcmF0ZVwiLCBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICAgIHJldHVybiBuZXcgQXJyYXlJdGVyYXRvcih0aGlzLCBzdGFydCwgZW5kKTtcbn0pO1xuXG5kZWZpbmUoXCJJdGVyYXRvclwiLCBBcnJheUl0ZXJhdG9yKTtcblxuZnVuY3Rpb24gQXJyYXlJdGVyYXRvcihhcnJheSwgc3RhcnQsIGVuZCkge1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbiAgICB0aGlzLnN0YXJ0ID0gc3RhcnQgPT0gbnVsbCA/IDAgOiBzdGFydDtcbiAgICB0aGlzLmVuZCA9IGVuZDtcbn07XG5cbkFycmF5SXRlcmF0b3IucHJvdG90eXBlLm5leHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuc3RhcnQgPT09ICh0aGlzLmVuZCA9PSBudWxsID8gdGhpcy5hcnJheS5sZW5ndGggOiB0aGlzLmVuZCkpIHtcbiAgICAgICAgdGhyb3cgU3RvcEl0ZXJhdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5hcnJheVt0aGlzLnN0YXJ0KytdO1xuICAgIH1cbn07XG5cbiIsIlxubW9kdWxlLmV4cG9ydHMgPSBGdW5jdGlvbjtcblxuLyoqXG4gICAgQSB1dGlsaXR5IHRvIHJlZHVjZSB1bm5lY2Vzc2FyeSBhbGxvY2F0aW9ucyBvZiA8Y29kZT5mdW5jdGlvbiAoKSB7fTwvY29kZT5cbiAgICBpbiBpdHMgbWFueSBjb2xvcmZ1bCB2YXJpYXRpb25zLiAgSXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zXG4gICAgPGNvZGU+dW5kZWZpbmVkPC9jb2RlPiB0aHVzIG1ha2VzIGEgc3VpdGFibGUgZGVmYXVsdCBpbiBzb21lIGNpcmN1bXN0YW5jZXMuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6RnVuY3Rpb24ubm9vcFxuKi9cbkZ1bmN0aW9uLm5vb3AgPSBmdW5jdGlvbiAoKSB7XG59O1xuXG4vKipcbiAgICBBIHV0aWxpdHkgdG8gcmVkdWNlIHVubmVjZXNzYXJ5IGFsbG9jYXRpb25zIG9mIDxjb2RlPmZ1bmN0aW9uICh4KSB7cmV0dXJuXG4gICAgeH08L2NvZGU+IGluIGl0cyBtYW55IGNvbG9yZnVsIGJ1dCB1bHRpbWF0ZWx5IHdhc3RlZnVsIHBhcmFtZXRlciBuYW1lXG4gICAgdmFyaWF0aW9ucy5cblxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpGdW5jdGlvbi5pZGVudGl0eVxuICAgIEBwYXJhbSB7QW55fSBhbnkgdmFsdWVcbiAgICBAcmV0dXJucyB7QW55fSB0aGF0IHZhbHVlXG4qL1xuRnVuY3Rpb24uaWRlbnRpdHkgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG59O1xuXG4vKipcbiAgICBBIHV0aWxpdHkgZm9yIGNyZWF0aW5nIGEgY29tcGFyYXRvciBmdW5jdGlvbiBmb3IgYSBwYXJ0aWN1bGFyIGFzcGVjdCBvZiBhXG4gICAgZmlndXJhdGl2ZSBjbGFzcyBvZiBvYmplY3RzLlxuXG4gICAgQGZ1bmN0aW9uIGV4dGVybmFsOkZ1bmN0aW9uLmJ5XG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gcmVsYXRpb24gQSBmdW5jdGlvbiB0aGF0IGFjY2VwdHMgYSB2YWx1ZSBhbmQgcmV0dXJucyBhXG4gICAgY29ycmVzcG9uZGluZyB2YWx1ZSB0byB1c2UgYXMgYSByZXByZXNlbnRhdGl2ZSB3aGVuIHNvcnRpbmcgdGhhdCBvYmplY3QuXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gY29tcGFyZSBhbiBhbHRlcm5hdGUgY29tcGFyYXRvciBmb3IgY29tcGFyaW5nIHRoZVxuICAgIHJlcHJlc2VudGVkIHZhbHVlcy4gIFRoZSBkZWZhdWx0IGlzIDxjb2RlPk9iamVjdC5jb21wYXJlPC9jb2RlPiwgd2hpY2hcbiAgICBkb2VzIGEgZGVlcCwgdHlwZS1zZW5zaXRpdmUsIHBvbHltb3JwaGljIGNvbXBhcmlzb24uXG4gICAgQHJldHVybnMge0Z1bmN0aW9ufSBhIGNvbXBhcmF0b3IgdGhhdCBoYXMgYmVlbiBhbm5vdGF0ZWQgd2l0aFxuICAgIDxjb2RlPmJ5PC9jb2RlPiBhbmQgPGNvZGU+Y29tcGFyZTwvY29kZT4gcHJvcGVydGllcyBzb1xuICAgIDxjb2RlPnNvcnRlZDwvY29kZT4gY2FuIHBlcmZvcm0gYSB0cmFuc2Zvcm0gdGhhdCByZWR1Y2VzIHRoZSBuZWVkIHRvIGNhbGxcbiAgICA8Y29kZT5ieTwvY29kZT4gb24gZWFjaCBzb3J0ZWQgb2JqZWN0IHRvIGp1c3Qgb25jZS5cbiAqL1xuRnVuY3Rpb24uYnkgPSBmdW5jdGlvbiAoYnkgLCBjb21wYXJlKSB7XG4gICAgY29tcGFyZSA9IGNvbXBhcmUgfHwgT2JqZWN0LmNvbXBhcmU7XG4gICAgYnkgPSBieSB8fCBGdW5jdGlvbi5pZGVudGl0eTtcbiAgICB2YXIgY29tcGFyZUJ5ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgcmV0dXJuIGNvbXBhcmUoYnkoYSksIGJ5KGIpKTtcbiAgICB9O1xuICAgIGNvbXBhcmVCeS5jb21wYXJlID0gY29tcGFyZTtcbiAgICBjb21wYXJlQnkuYnkgPSBieTtcbiAgICByZXR1cm4gY29tcGFyZUJ5O1xufTtcblxuLy8gVE9ETyBkb2N1bWVudFxuRnVuY3Rpb24uZ2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICAgIHJldHVybiBPYmplY3QuZ2V0KG9iamVjdCwga2V5KTtcbiAgICB9O1xufTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXZWFrTWFwID0gcmVxdWlyZShcIndlYWstbWFwXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IE9iamVjdDtcblxuLypcbiAgICBCYXNlZCBpbiBwYXJ0IG9uIGV4dHJhcyBmcm9tIE1vdG9yb2xhIE1vYmlsaXR54oCZcyBNb250YWdlXG4gICAgQ29weXJpZ2h0IChjKSAyMDEyLCBNb3Rvcm9sYSBNb2JpbGl0eSBMTEMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gICAgMy1DbGF1c2UgQlNEIExpY2Vuc2VcbiAgICBodHRwczovL2dpdGh1Yi5jb20vbW90b3JvbGEtbW9iaWxpdHkvbW9udGFnZS9ibG9iL21hc3Rlci9MSUNFTlNFLm1kXG4qL1xuXG4vKipcbiAgICBEZWZpbmVzIGV4dGVuc2lvbnMgdG8gaW50cmluc2ljIDxjb2RlPk9iamVjdDwvY29kZT4uXG4gICAgQHNlZSBbT2JqZWN0IGNsYXNzXXtAbGluayBleHRlcm5hbDpPYmplY3R9XG4qL1xuXG4vKipcbiAgICBBIHV0aWxpdHkgb2JqZWN0IHRvIGF2b2lkIHVubmVjZXNzYXJ5IGFsbG9jYXRpb25zIG9mIGFuIGVtcHR5IG9iamVjdFxuICAgIDxjb2RlPnt9PC9jb2RlPi4gIFRoaXMgb2JqZWN0IGlzIGZyb3plbiBzbyBpdCBpcyBzYWZlIHRvIHNoYXJlLlxuXG4gICAgQG9iamVjdCBleHRlcm5hbDpPYmplY3QuZW1wdHlcbiovXG5PYmplY3QuZW1wdHkgPSBPYmplY3QuZnJlZXplKE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXG4vKipcbiAgICBSZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIHZhbHVlIGlzIGFuIG9iamVjdCwgYXMgb3Bwb3NlZCB0byBhIHZhbHVlLlxuICAgIFVuYm94ZWQgbnVtYmVycywgc3RyaW5ncywgdHJ1ZSwgZmFsc2UsIHVuZGVmaW5lZCwgYW5kIG51bGwgYXJlIG5vdFxuICAgIG9iamVjdHMuICBBcnJheXMgYXJlIG9iamVjdHMuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmlzT2JqZWN0XG4gICAgQHBhcmFtIHtBbnl9IHZhbHVlXG4gICAgQHJldHVybnMge0Jvb2xlYW59IHdoZXRoZXIgdGhlIGdpdmVuIHZhbHVlIGlzIGFuIG9iamVjdFxuKi9cbk9iamVjdC5pc09iamVjdCA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0KG9iamVjdCkgPT09IG9iamVjdDtcbn07XG5cbi8qKlxuICAgIFJldHVybnMgdGhlIHZhbHVlIG9mIGFuIGFueSB2YWx1ZSwgcGFydGljdWxhcmx5IG9iamVjdHMgdGhhdFxuICAgIGltcGxlbWVudCA8Y29kZT52YWx1ZU9mPC9jb2RlPi5cblxuICAgIDxwPk5vdGUgdGhhdCwgdW5saWtlIHRoZSBwcmVjZWRlbnQgb2YgbWV0aG9kcyBsaWtlXG4gICAgPGNvZGU+T2JqZWN0LmVxdWFsczwvY29kZT4gYW5kIDxjb2RlPk9iamVjdC5jb21wYXJlPC9jb2RlPiB3b3VsZCBzdWdnZXN0LFxuICAgIHRoaXMgbWV0aG9kIGlzIG5hbWVkIDxjb2RlPk9iamVjdC5nZXRWYWx1ZU9mPC9jb2RlPiBpbnN0ZWFkIG9mXG4gICAgPGNvZGU+dmFsdWVPZjwvY29kZT4uICBUaGlzIGlzIGEgZGVsaWNhdGUgaXNzdWUsIGJ1dCB0aGUgYmFzaXMgb2YgdGhpc1xuICAgIGRlY2lzaW9uIGlzIHRoYXQgdGhlIEphdmFTY3JpcHQgcnVudGltZSB3b3VsZCBiZSBmYXIgbW9yZSBsaWtlbHkgdG9cbiAgICBhY2NpZGVudGFsbHkgY2FsbCB0aGlzIG1ldGhvZCB3aXRoIG5vIGFyZ3VtZW50cywgYXNzdW1pbmcgdGhhdCBpdCB3b3VsZFxuICAgIHJldHVybiB0aGUgdmFsdWUgb2YgPGNvZGU+T2JqZWN0PC9jb2RlPiBpdHNlbGYgaW4gdmFyaW91cyBzaXR1YXRpb25zLFxuICAgIHdoZXJlYXMgPGNvZGU+T2JqZWN0LmVxdWFscyhPYmplY3QsIG51bGwpPC9jb2RlPiBwcm90ZWN0cyBhZ2FpbnN0IHRoaXMgY2FzZVxuICAgIGJ5IG5vdGluZyB0aGF0IDxjb2RlPk9iamVjdDwvY29kZT4gb3ducyB0aGUgPGNvZGU+ZXF1YWxzPC9jb2RlPiBwcm9wZXJ0eVxuICAgIGFuZCB0aGVyZWZvcmUgZG9lcyBub3QgZGVsZWdhdGUgdG8gaXQuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmdldFZhbHVlT2ZcbiAgICBAcGFyYW0ge0FueX0gdmFsdWUgYSB2YWx1ZSBvciBvYmplY3Qgd3JhcHBpbmcgYSB2YWx1ZVxuICAgIEByZXR1cm5zIHtBbnl9IHRoZSBwcmltaXRpdmUgdmFsdWUgb2YgdGhhdCBvYmplY3QsIGlmIG9uZSBleGlzdHMsIG9yIHBhc3Nlc1xuICAgIHRoZSB2YWx1ZSB0aHJvdWdoXG4qL1xuT2JqZWN0LmdldFZhbHVlT2YgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICBpZiAoT2JqZWN0LmNhbih2YWx1ZSwgXCJ2YWx1ZU9mXCIpKSB7XG4gICAgICAgIHZhbHVlID0gdmFsdWUudmFsdWVPZigpO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59O1xuXG52YXIgaGFzaE1hcCA9IG5ldyBXZWFrTWFwKCk7XG5PYmplY3QuaGFzaCA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICBpZiAoT2JqZWN0LmNhbihvYmplY3QsIFwiaGFzaFwiKSkge1xuICAgICAgICByZXR1cm4gXCJcIiArIG9iamVjdC5oYXNoKCk7XG4gICAgfSBlbHNlIGlmIChPYmplY3Qob2JqZWN0KSA9PT0gb2JqZWN0KSB7XG4gICAgICAgIGlmICghaGFzaE1hcC5oYXMob2JqZWN0KSkge1xuICAgICAgICAgICAgaGFzaE1hcC5zZXQob2JqZWN0LCBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhhc2hNYXAuZ2V0KG9iamVjdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFwiXCIgKyBvYmplY3Q7XG4gICAgfVxufTtcblxuLyoqXG4gICAgQSBzaG9ydGhhbmQgZm9yIDxjb2RlPk9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsXG4gICAga2V5KTwvY29kZT4uICBSZXR1cm5zIHdoZXRoZXIgdGhlIG9iamVjdCBvd25zIGEgcHJvcGVydHkgZm9yIHRoZSBnaXZlbiBrZXkuXG4gICAgSXQgZG9lcyBub3QgY29uc3VsdCB0aGUgcHJvdG90eXBlIGNoYWluIGFuZCB3b3JrcyBmb3IgYW55IHN0cmluZyAoaW5jbHVkaW5nXG4gICAgXCJoYXNPd25Qcm9wZXJ0eVwiKSBleGNlcHQgXCJfX3Byb3RvX19cIi5cblxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3Qub3duc1xuICAgIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAgICBAcGFyYW0ge1N0cmluZ30ga2V5XG4gICAgQHJldHVybnMge0Jvb2xlYW59IHdoZXRoZXIgdGhlIG9iamVjdCBvd25zIGEgcHJvcGVydHkgd2ZvciB0aGUgZ2l2ZW4ga2V5LlxuKi9cbnZhciBvd25zID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcbk9iamVjdC5vd25zID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgcmV0dXJuIG93bnMuY2FsbChvYmplY3QsIGtleSk7XG59O1xuXG4vKipcbiAgICBSZXR1cm5zIHdoZXRoZXIgYSB2YWx1ZSBpbXBsZW1lbnRzIGEgcGFydGljdWxhciBkdWNrLXR5cGUgbWV0aG9kLlxuXG4gICAgPHA+VG8gcXVhbGlmeSBhcyBhIGR1Y2stdHlwZSBtZXRob2QsIHRoZSB2YWx1ZSBpbiBxdWVzdGlvbiBtdXN0IGhhdmUgYVxuICAgIG1ldGhvZCBieSB0aGUgZ2l2ZW4gbmFtZSBvbiB0aGUgcHJvdG90eXBlIGNoYWluLiAgVG8gZGlzdGluZ3Vpc2ggaXQgZnJvbVxuICAgIGEgcHJvcGVydHkgb2YgYW4gb2JqZWN0IGxpdGVyYWwsIHRoZSBwcm9wZXJ0eSBtdXN0IG5vdCBiZSBvd25lZCBieSB0aGVcbiAgICBvYmplY3QgZGlyZWN0bHkuXG5cbiAgICA8cD5BIHZhbHVlIHRoYXQgaW1wbGVtZW50cyBhIG1ldGhvZCBpcyBub3QgbmVjZXNzYXJpbHkgYW4gb2JqZWN0LCBmb3JcbiAgICBleGFtcGxlLCBudW1iZXJzIGltcGxlbWVudCA8Y29kZT52YWx1ZU9mPC9jb2RlPiwgc28gdGhpcyBpcyBmdW5jdGlvblxuICAgIGRvZXMgbm90IGltcGx5IDxjb2RlPk9iamVjdC5pc09iamVjdDwvY29kZT4gb2YgdGhlIHNhbWUgdmFsdWUuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmNhblxuICAgIEBwYXJhbSB7QW55fSB2YWx1ZSBhIHZhbHVlXG4gICAgQHBhcmFtIHtTdHJpbmd9IG5hbWUgYSBtZXRob2QgbmFtZVxuICAgIEByZXR1cm5zIHtCb29sZWFufSB3aGV0aGVyIHRoZSBnaXZlbiB2YWx1ZSBpbXBsZW1lbnRzIHRoZSBnaXZlbiBtZXRob2RcblxuKi9cbk9iamVjdC5jYW4gPSBmdW5jdGlvbiAob2JqZWN0LCBuYW1lKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgb2JqZWN0ICE9IG51bGwgJiYgLy8gZmFsc2Ugb25seSBmb3IgbnVsbCAqYW5kKiB1bmRlZmluZWRcbiAgICAgICAgdHlwZW9mIG9iamVjdFtuYW1lXSA9PT0gXCJmdW5jdGlvblwiICYmXG4gICAgICAgICFvd25zLmNhbGwob2JqZWN0LCBuYW1lKVxuICAgICk7XG59O1xuXG4vKipcbiAgICBBIHV0aWxpdHkgdGhhdCBpcyBsaWtlIE9iamVjdC5vd25zIGJ1dCBpcyBhbHNvIHVzZWZ1bCBmb3IgZmluZGluZ1xuICAgIHByb3BlcnRpZXMgb24gdGhlIHByb3RvdHlwZSBjaGFpbiwgcHJvdmlkZWQgdGhhdCB0aGV5IGRvIG5vdCByZWZlciB0b1xuICAgIG1ldGhvZHMgb24gdGhlIE9iamVjdCBwcm90b3R5cGUuICBXb3JrcyBmb3IgYWxsIHN0cmluZ3MgZXhjZXB0IFwiX19wcm90b19fXCIuXG5cbiAgICA8cD5BbHRlcm5hdGVseSwgeW91IGNvdWxkIHVzZSB0aGUgXCJpblwiIG9wZXJhdG9yIGFzIGxvbmcgYXMgdGhlIG9iamVjdFxuICAgIGRlc2NlbmRzIGZyb20gXCJudWxsXCIgaW5zdGVhZCBvZiB0aGUgT2JqZWN0LnByb3RvdHlwZSwgYXMgd2l0aFxuICAgIDxjb2RlPk9iamVjdC5jcmVhdGUobnVsbCk8L2NvZGU+LiAgSG93ZXZlcixcbiAgICA8Y29kZT5PYmplY3QuY3JlYXRlKG51bGwpPC9jb2RlPiBvbmx5IHdvcmtzIGluIGZ1bGx5IGNvbXBsaWFudCBFY21hU2NyaXB0IDVcbiAgICBKYXZhU2NyaXB0IGVuZ2luZXMgYW5kIGNhbm5vdCBiZSBmYWl0aGZ1bGx5IHNoaW1tZWQuXG5cbiAgICA8cD5JZiB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGFuIGluc3RhbmNlIG9mIGEgdHlwZSB0aGF0IGltcGxlbWVudHMgYSBtZXRob2RcbiAgICBuYW1lZCBcImhhc1wiLCB0aGlzIGZ1bmN0aW9uIGRlZmVycyB0byB0aGUgY29sbGVjdGlvbiwgc28gdGhpcyBtZXRob2QgY2FuIGJlXG4gICAgdXNlZCB0byBnZW5lcmljYWxseSBoYW5kbGUgb2JqZWN0cywgYXJyYXlzLCBvciBvdGhlciBjb2xsZWN0aW9ucy4gIEluIHRoYXRcbiAgICBjYXNlLCB0aGUgZG9tYWluIG9mIHRoZSBrZXkgZGVwZW5kcyBvbiB0aGUgaW5zdGFuY2UuXG5cbiAgICBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAgQHBhcmFtIHtTdHJpbmd9IGtleVxuICAgIEByZXR1cm5zIHtCb29sZWFufSB3aGV0aGVyIHRoZSBvYmplY3QsIG9yIGFueSBvZiBpdHMgcHJvdG90eXBlcyBleGNlcHRcbiAgICA8Y29kZT5PYmplY3QucHJvdG90eXBlPC9jb2RlPlxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3QuaGFzXG4qL1xuT2JqZWN0LmhhcyA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk9iamVjdC5oYXMgY2FuJ3QgYWNjZXB0IG5vbi1vYmplY3Q6IFwiICsgdHlwZW9mIG9iamVjdCk7XG4gICAgfVxuICAgIC8vIGZvcndhcmQgdG8gbWFwcGVkIGNvbGxlY3Rpb25zIHRoYXQgaW1wbGVtZW50IFwiaGFzXCJcbiAgICBpZiAoT2JqZWN0LmNhbihvYmplY3QsIFwiaGFzXCIpKSB7XG4gICAgICAgIHJldHVybiBvYmplY3QuaGFzKGtleSk7XG4gICAgLy8gb3RoZXJ3aXNlIHJlcG9ydCB3aGV0aGVyIHRoZSBrZXkgaXMgb24gdGhlIHByb3RvdHlwZSBjaGFpbixcbiAgICAvLyBhcyBsb25nIGFzIGl0IGlzIG5vdCBvbmUgb2YgdGhlIG1ldGhvZHMgb24gb2JqZWN0LnByb3RvdHlwZVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGtleSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm4ga2V5IGluIG9iamVjdCAmJiBvYmplY3Rba2V5XSAhPT0gT2JqZWN0LnByb3RvdHlwZVtrZXldO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIktleSBtdXN0IGJlIGEgc3RyaW5nIGZvciBPYmplY3QuaGFzIG9uIHBsYWluIG9iamVjdHNcIik7XG4gICAgfVxufTtcblxuLyoqXG4gICAgR2V0cyB0aGUgdmFsdWUgZm9yIGEgY29ycmVzcG9uZGluZyBrZXkgZnJvbSBhbiBvYmplY3QuXG5cbiAgICA8cD5Vc2VzIE9iamVjdC5oYXMgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdGhlcmUgaXMgYSBjb3JyZXNwb25kaW5nIHZhbHVlIGZvclxuICAgIHRoZSBnaXZlbiBrZXkuICBBcyBzdWNoLCA8Y29kZT5PYmplY3QuZ2V0PC9jb2RlPiBpcyBjYXBhYmxlIG9mIHJldHJpdmluZ1xuICAgIHZhbHVlcyBmcm9tIHRoZSBwcm90b3R5cGUgY2hhaW4gYXMgbG9uZyBhcyB0aGV5IGFyZSBub3QgZnJvbSB0aGVcbiAgICA8Y29kZT5PYmplY3QucHJvdG90eXBlPC9jb2RlPi5cblxuICAgIDxwPklmIHRoZXJlIGlzIG5vIGNvcnJlc3BvbmRpbmcgdmFsdWUsIHJldHVybnMgdGhlIGdpdmVuIGRlZmF1bHQsIHdoaWNoIG1heVxuICAgIGJlIDxjb2RlPnVuZGVmaW5lZDwvY29kZT4uXG5cbiAgICA8cD5JZiB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGFuIGluc3RhbmNlIG9mIGEgdHlwZSB0aGF0IGltcGxlbWVudHMgYSBtZXRob2RcbiAgICBuYW1lZCBcImdldFwiLCB0aGlzIGZ1bmN0aW9uIGRlZmVycyB0byB0aGUgY29sbGVjdGlvbiwgc28gdGhpcyBtZXRob2QgY2FuIGJlXG4gICAgdXNlZCB0byBnZW5lcmljYWxseSBoYW5kbGUgb2JqZWN0cywgYXJyYXlzLCBvciBvdGhlciBjb2xsZWN0aW9ucy4gIEluIHRoYXRcbiAgICBjYXNlLCB0aGUgZG9tYWluIG9mIHRoZSBrZXkgZGVwZW5kcyBvbiB0aGUgaW1wbGVtZW50YXRpb24uICBGb3IgYSBgTWFwYCxcbiAgICBmb3IgZXhhbXBsZSwgdGhlIGtleSBtaWdodCBiZSBhbnkgb2JqZWN0LlxuXG4gICAgQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgIEBwYXJhbSB7U3RyaW5nfSBrZXlcbiAgICBAcGFyYW0ge0FueX0gdmFsdWUgYSBkZWZhdWx0IHRvIHJldHVybiwgPGNvZGU+dW5kZWZpbmVkPC9jb2RlPiBpZiBvbWl0dGVkXG4gICAgQHJldHVybnMge0FueX0gdmFsdWUgZm9yIGtleSwgb3IgZGVmYXVsdCB2YWx1ZVxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3QuZ2V0XG4qL1xuT2JqZWN0LmdldCA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gXCJvYmplY3RcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJPYmplY3QuZ2V0IGNhbid0IGFjY2VwdCBub24tb2JqZWN0OiBcIiArIHR5cGVvZiBvYmplY3QpO1xuICAgIH1cbiAgICAvLyBmb3J3YXJkIHRvIG1hcHBlZCBjb2xsZWN0aW9ucyB0aGF0IGltcGxlbWVudCBcImdldFwiXG4gICAgaWYgKE9iamVjdC5jYW4ob2JqZWN0LCBcImdldFwiKSkge1xuICAgICAgICByZXR1cm4gb2JqZWN0LmdldChrZXksIHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5oYXMob2JqZWN0LCBrZXkpKSB7XG4gICAgICAgIHJldHVybiBvYmplY3Rba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxufTtcblxuLyoqXG4gICAgU2V0cyB0aGUgdmFsdWUgZm9yIGEgZ2l2ZW4ga2V5IG9uIGFuIG9iamVjdC5cblxuICAgIDxwPklmIHRoZSBnaXZlbiBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgYSB0eXBlIHRoYXQgaW1wbGVtZW50cyBhIG1ldGhvZFxuICAgIG5hbWVkIFwic2V0XCIsIHRoaXMgZnVuY3Rpb24gZGVmZXJzIHRvIHRoZSBjb2xsZWN0aW9uLCBzbyB0aGlzIG1ldGhvZCBjYW4gYmVcbiAgICB1c2VkIHRvIGdlbmVyaWNhbGx5IGhhbmRsZSBvYmplY3RzLCBhcnJheXMsIG9yIG90aGVyIGNvbGxlY3Rpb25zLiAgQXMgc3VjaCxcbiAgICB0aGUga2V5IGRvbWFpbiB2YXJpZXMgYnkgdGhlIG9iamVjdCB0eXBlLlxuXG4gICAgQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgIEBwYXJhbSB7U3RyaW5nfSBrZXlcbiAgICBAcGFyYW0ge0FueX0gdmFsdWVcbiAgICBAcmV0dXJucyA8Y29kZT51bmRlZmluZWQ8L2NvZGU+XG4gICAgQGZ1bmN0aW9uIGV4dGVybmFsOk9iamVjdC5zZXRcbiovXG5PYmplY3Quc2V0ID0gZnVuY3Rpb24gKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICAgIGlmIChPYmplY3QuY2FuKG9iamVjdCwgXCJzZXRcIikpIHtcbiAgICAgICAgb2JqZWN0LnNldChrZXksIHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3Rba2V5XSA9IHZhbHVlO1xuICAgIH1cbn07XG5cbk9iamVjdC5hZGRFYWNoID0gZnVuY3Rpb24gKHRhcmdldCwgc291cmNlKSB7XG4gICAgaWYgKCFzb3VyY2UpIHtcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5jYW4oc291cmNlLCBcImZvckVhY2hcIikpIHtcbiAgICAgICAgLy8gY29weSBtYXAtYWxpa2VzXG4gICAgICAgIGlmICh0eXBlb2Ygc291cmNlLmtleXMgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgc291cmNlLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIC8vIGl0ZXJhdGUga2V5IHZhbHVlIHBhaXJzIG9mIG90aGVyIGl0ZXJhYmxlc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc291cmNlLmZvckVhY2goZnVuY3Rpb24gKHBhaXIpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRbcGFpclswXV0gPSBwYWlyWzFdO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjb3B5IG90aGVyIG9iamVjdHMgYXMgbWFwLWFsaWtlc1xuICAgICAgICBPYmplY3Qua2V5cyhzb3VyY2UpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgdGFyZ2V0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG59O1xuXG4vKipcbiAgICBJdGVyYXRlcyBvdmVyIHRoZSBvd25lZCBwcm9wZXJ0aWVzIG9mIGFuIG9iamVjdC5cblxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3QuZm9yRWFjaFxuICAgIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgYW4gb2JqZWN0IHRvIGl0ZXJhdGUuXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgYSBmdW5jdGlvbiB0byBjYWxsIGZvciBldmVyeSBrZXkgYW5kIHZhbHVlXG4gICAgcGFpciBpbiB0aGUgb2JqZWN0LiAgUmVjZWl2ZXMgPGNvZGU+dmFsdWU8L2NvZGU+LCA8Y29kZT5rZXk8L2NvZGU+LFxuICAgIGFuZCA8Y29kZT5vYmplY3Q8L2NvZGU+IGFzIGFyZ3VtZW50cy5cbiAgICBAcGFyYW0ge09iamVjdH0gdGhpc3AgdGhlIDxjb2RlPnRoaXM8L2NvZGU+IHRvIHBhc3MgdGhyb3VnaCB0byB0aGVcbiAgICBjYWxsYmFja1xuKi9cbk9iamVjdC5mb3JFYWNoID0gZnVuY3Rpb24gKG9iamVjdCwgY2FsbGJhY2ssIHRoaXNwKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzcCwgb2JqZWN0W2tleV0sIGtleSwgb2JqZWN0KTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICAgIEl0ZXJhdGVzIG92ZXIgdGhlIG93bmVkIHByb3BlcnRpZXMgb2YgYSBtYXAsIGNvbnN0cnVjdGluZyBhIG5ldyBhcnJheSBvZlxuICAgIG1hcHBlZCB2YWx1ZXMuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0Lm1hcFxuICAgIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgYW4gb2JqZWN0IHRvIGl0ZXJhdGUuXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgYSBmdW5jdGlvbiB0byBjYWxsIGZvciBldmVyeSBrZXkgYW5kIHZhbHVlXG4gICAgcGFpciBpbiB0aGUgb2JqZWN0LiAgUmVjZWl2ZXMgPGNvZGU+dmFsdWU8L2NvZGU+LCA8Y29kZT5rZXk8L2NvZGU+LFxuICAgIGFuZCA8Y29kZT5vYmplY3Q8L2NvZGU+IGFzIGFyZ3VtZW50cy5cbiAgICBAcGFyYW0ge09iamVjdH0gdGhpc3AgdGhlIDxjb2RlPnRoaXM8L2NvZGU+IHRvIHBhc3MgdGhyb3VnaCB0byB0aGVcbiAgICBjYWxsYmFja1xuICAgIEByZXR1cm5zIHtBcnJheX0gdGhlIHJlc3BlY3RpdmUgdmFsdWVzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFjayBmb3IgZWFjaFxuICAgIGl0ZW0gaW4gdGhlIG9iamVjdC5cbiovXG5PYmplY3QubWFwID0gZnVuY3Rpb24gKG9iamVjdCwgY2FsbGJhY2ssIHRoaXNwKSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKG9iamVjdCkubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwodGhpc3AsIG9iamVjdFtrZXldLCBrZXksIG9iamVjdCk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAgICBSZXR1cm5zIHRoZSB2YWx1ZXMgZm9yIG93bmVkIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0LlxuXG4gICAgQGZ1bmN0aW9uIGV4dGVybmFsOk9iamVjdC5tYXBcbiAgICBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAgQHJldHVybnMge0FycmF5fSB0aGUgcmVzcGVjdGl2ZSB2YWx1ZSBmb3IgZWFjaCBvd25lZCBwcm9wZXJ0eSBvZiB0aGVcbiAgICBvYmplY3QuXG4qL1xuT2JqZWN0LnZhbHVlcyA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0Lm1hcChvYmplY3QsIEZ1bmN0aW9uLmlkZW50aXR5KTtcbn07XG5cbi8vIFRPRE8gaW5saW5lIGRvY3VtZW50IGNvbmNhdFxuT2JqZWN0LmNvbmNhdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb2JqZWN0ID0ge307XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgT2JqZWN0LmFkZEVhY2gob2JqZWN0LCBhcmd1bWVudHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxuT2JqZWN0LmZyb20gPSBPYmplY3QuY29uY2F0O1xuXG4vKipcbiAgICBSZXR1cm5zIHdoZXRoZXIgdHdvIHZhbHVlcyBhcmUgaWRlbnRpY2FsLiAgQW55IHZhbHVlIGlzIGlkZW50aWNhbCB0byBpdHNlbGZcbiAgICBhbmQgb25seSBpdHNlbGYuICBUaGlzIGlzIG11Y2ggbW9yZSByZXN0aWN0aXZlIHRoYW4gZXF1aXZhbGVuY2UgYW5kIHN1YnRseVxuICAgIGRpZmZlcmVudCB0aGFuIHN0cmljdCBlcXVhbGl0eSwgPGNvZGU+PT09PC9jb2RlPiBiZWNhdXNlIG9mIGVkZ2UgY2FzZXNcbiAgICBpbmNsdWRpbmcgbmVnYXRpdmUgemVybyBhbmQgPGNvZGU+TmFOPC9jb2RlPi4gIElkZW50aXR5IGlzIHVzZWZ1bCBmb3JcbiAgICByZXNvbHZpbmcgY29sbGlzaW9ucyBhbW9uZyBrZXlzIGluIGEgbWFwcGluZyB3aGVyZSB0aGUgZG9tYWluIGlzIGFueSB2YWx1ZS5cbiAgICBUaGlzIG1ldGhvZCBkb2VzIG5vdCBkZWxnYXRlIHRvIGFueSBtZXRob2Qgb24gYW4gb2JqZWN0IGFuZCBjYW5ub3QgYmVcbiAgICBvdmVycmlkZGVuLlxuICAgIEBzZWUgaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9aGFybW9ueTplZ2FsXG4gICAgQHBhcmFtIHtBbnl9IHRoaXNcbiAgICBAcGFyYW0ge0FueX0gdGhhdFxuICAgIEByZXR1cm5zIHtCb29sZWFufSB3aGV0aGVyIHRoaXMgYW5kIHRoYXQgYXJlIGlkZW50aWNhbFxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3QuaXNcbiovXG5PYmplY3QuaXMgPSBmdW5jdGlvbiAoeCwgeSkge1xuICAgIGlmICh4ID09PSB5KSB7XG4gICAgICAgIC8vIDAgPT09IC0wLCBidXQgdGhleSBhcmUgbm90IGlkZW50aWNhbFxuICAgICAgICByZXR1cm4geCAhPT0gMCB8fCAxIC8geCA9PT0gMSAvIHk7XG4gICAgfVxuICAgIC8vIE5hTiAhPT0gTmFOLCBidXQgdGhleSBhcmUgaWRlbnRpY2FsLlxuICAgIC8vIE5hTnMgYXJlIHRoZSBvbmx5IG5vbi1yZWZsZXhpdmUgdmFsdWUsIGkuZS4sIGlmIHggIT09IHgsXG4gICAgLy8gdGhlbiB4IGlzIGEgTmFOLlxuICAgIC8vIGlzTmFOIGlzIGJyb2tlbjogaXQgY29udmVydHMgaXRzIGFyZ3VtZW50IHRvIG51bWJlciwgc29cbiAgICAvLyBpc05hTihcImZvb1wiKSA9PiB0cnVlXG4gICAgcmV0dXJuIHggIT09IHggJiYgeSAhPT0geTtcbn07XG5cbi8qKlxuICAgIFBlcmZvcm1zIGEgcG9seW1vcnBoaWMsIHR5cGUtc2Vuc2l0aXZlIGRlZXAgZXF1aXZhbGVuY2UgY29tcGFyaXNvbiBvZiBhbnlcbiAgICB0d28gdmFsdWVzLlxuXG4gICAgPHA+QXMgYSBiYXNpYyBwcmluY2lwbGUsIGFueSB2YWx1ZSBpcyBlcXVpdmFsZW50IHRvIGl0c2VsZiAoYXMgaW5cbiAgICBpZGVudGl0eSksIGFueSBib3hlZCB2ZXJzaW9uIG9mIGl0c2VsZiAoYXMgYSA8Y29kZT5uZXcgTnVtYmVyKDEwKTwvY29kZT4gaXNcbiAgICB0byAxMCksIGFuZCBhbnkgZGVlcCBjbG9uZSBvZiBpdHNlbGYuXG5cbiAgICA8cD5FcXVpdmFsZW5jZSBoYXMgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuXG4gICAgPHVsPlxuICAgICAgICA8bGk+PHN0cm9uZz5wb2x5bW9ycGhpYzo8L3N0cm9uZz5cbiAgICAgICAgICAgIElmIHRoZSBnaXZlbiBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgYSB0eXBlIHRoYXQgaW1wbGVtZW50cyBhXG4gICAgICAgICAgICBtZXRob2RzIG5hbWVkIFwiZXF1YWxzXCIsIHRoaXMgZnVuY3Rpb24gZGVmZXJzIHRvIHRoZSBtZXRob2QuICBTbyxcbiAgICAgICAgICAgIHRoaXMgZnVuY3Rpb24gY2FuIHNhZmVseSBjb21wYXJlIGFueSB2YWx1ZXMgcmVnYXJkbGVzcyBvZiB0eXBlLFxuICAgICAgICAgICAgaW5jbHVkaW5nIHVuZGVmaW5lZCwgbnVsbCwgbnVtYmVycywgc3RyaW5ncywgYW55IHBhaXIgb2Ygb2JqZWN0c1xuICAgICAgICAgICAgd2hlcmUgZWl0aGVyIGltcGxlbWVudHMgXCJlcXVhbHNcIiwgb3Igb2JqZWN0IGxpdGVyYWxzIHRoYXQgbWF5IGV2ZW5cbiAgICAgICAgICAgIGNvbnRhaW4gYW4gXCJlcXVhbHNcIiBrZXkuXG4gICAgICAgIDxsaT48c3Ryb25nPnR5cGUtc2Vuc2l0aXZlOjwvc3Ryb25nPlxuICAgICAgICAgICAgSW5jb21wYXJhYmxlIHR5cGVzIGFyZSBub3QgZXF1YWwuICBObyBvYmplY3QgaXMgZXF1aXZhbGVudCB0byBhbnlcbiAgICAgICAgICAgIGFycmF5LiAgTm8gc3RyaW5nIGlzIGVxdWFsIHRvIGFueSBvdGhlciBudW1iZXIuXG4gICAgICAgIDxsaT48c3Ryb25nPmRlZXA6PC9zdHJvbmc+XG4gICAgICAgICAgICBDb2xsZWN0aW9ucyB3aXRoIGVxdWl2YWxlbnQgY29udGVudCBhcmUgZXF1aXZhbGVudCwgcmVjdXJzaXZlbHkuXG4gICAgICAgIDxsaT48c3Ryb25nPmVxdWl2YWxlbmNlOjwvc3Ryb25nPlxuICAgICAgICAgICAgSWRlbnRpY2FsIHZhbHVlcyBhbmQgb2JqZWN0cyBhcmUgZXF1aXZhbGVudCwgYnV0IHNvIGFyZSBjb2xsZWN0aW9uc1xuICAgICAgICAgICAgdGhhdCBjb250YWluIGVxdWl2YWxlbnQgY29udGVudC4gIFdoZXRoZXIgb3JkZXIgaXMgaW1wb3J0YW50IHZhcmllc1xuICAgICAgICAgICAgYnkgdHlwZS4gIEZvciBBcnJheXMgYW5kIGxpc3RzLCBvcmRlciBpcyBpbXBvcnRhbnQuICBGb3IgT2JqZWN0cyxcbiAgICAgICAgICAgIG1hcHMsIGFuZCBzZXRzLCBvcmRlciBpcyBub3QgaW1wb3J0YW50LiAgQm94ZWQgb2JqZWN0cyBhcmUgbXV0YWxseVxuICAgICAgICAgICAgZXF1aXZhbGVudCB3aXRoIHRoZWlyIHVuYm94ZWQgdmFsdWVzLCBieSB2aXJ0dWUgb2YgdGhlIHN0YW5kYXJkXG4gICAgICAgICAgICA8Y29kZT52YWx1ZU9mPC9jb2RlPiBtZXRob2QuXG4gICAgPC91bD5cbiAgICBAcGFyYW0gdGhpc1xuICAgIEBwYXJhbSB0aGF0XG4gICAgQHJldHVybnMge0Jvb2xlYW59IHdoZXRoZXIgdGhlIHZhbHVlcyBhcmUgZGVlcGx5IGVxdWl2YWxlbnRcbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmVxdWFsc1xuKi9cbk9iamVjdC5lcXVhbHMgPSBmdW5jdGlvbiAoYSwgYiwgZXF1YWxzKSB7XG4gICAgZXF1YWxzID0gZXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgLy8gdW5ib3ggb2JqZWN0cywgYnV0IGRvIG5vdCBjb25mdXNlIG9iamVjdCBsaXRlcmFsc1xuICAgIGEgPSBPYmplY3QuZ2V0VmFsdWVPZihhKTtcbiAgICBiID0gT2JqZWN0LmdldFZhbHVlT2YoYik7XG4gICAgaWYgKGEgPT09IGIpXG4gICAgICAgIC8vIDAgPT09IC0wLCBidXQgdGhleSBhcmUgbm90IGVxdWFsXG4gICAgICAgIHJldHVybiBhICE9PSAwIHx8IDEgLyBhID09PSAxIC8gYjtcbiAgICBpZiAoYSA9PT0gbnVsbCB8fCBiID09PSBudWxsKVxuICAgICAgICByZXR1cm4gYSA9PT0gYjtcbiAgICBpZiAoT2JqZWN0LmNhbihhLCBcImVxdWFsc1wiKSlcbiAgICAgICAgcmV0dXJuIGEuZXF1YWxzKGIsIGVxdWFscyk7XG4gICAgLy8gY29tbXV0YXRpdmVcbiAgICBpZiAoT2JqZWN0LmNhbihiLCBcImVxdWFsc1wiKSlcbiAgICAgICAgcmV0dXJuIGIuZXF1YWxzKGEsIGVxdWFscyk7XG4gICAgaWYgKHR5cGVvZiBhID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiBiID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHZhciBhUHJvdG90eXBlID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKGEpO1xuICAgICAgICB2YXIgYlByb3RvdHlwZSA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihiKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgYVByb3RvdHlwZSA9PT0gYlByb3RvdHlwZSAmJiAoXG4gICAgICAgICAgICAgICAgYVByb3RvdHlwZSA9PT0gT2JqZWN0LnByb3RvdHlwZSB8fFxuICAgICAgICAgICAgICAgIGFQcm90b3R5cGUgPT09IG51bGxcbiAgICAgICAgICAgIClcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gYSkge1xuICAgICAgICAgICAgICAgIGlmICghZXF1YWxzKGFba2V5XSwgYltrZXldKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIGIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWVxdWFscyhhW2tleV0sIGJba2V5XSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8vIE5hTiAhPT0gTmFOLCBidXQgdGhleSBhcmUgZXF1YWwuXG4gICAgLy8gTmFOcyBhcmUgdGhlIG9ubHkgbm9uLXJlZmxleGl2ZSB2YWx1ZSwgaS5lLiwgaWYgeCAhPT0geCxcbiAgICAvLyB0aGVuIHggaXMgYSBOYU4uXG4gICAgLy8gaXNOYU4gaXMgYnJva2VuOiBpdCBjb252ZXJ0cyBpdHMgYXJndW1lbnQgdG8gbnVtYmVyLCBzb1xuICAgIC8vIGlzTmFOKFwiZm9vXCIpID0+IHRydWVcbiAgICByZXR1cm4gYSAhPT0gYSAmJiBiICE9PSBiO1xufTtcblxuLy8gQmVjYXVzZSBhIHJldHVybiB2YWx1ZSBvZiAwIGZyb20gYSBgY29tcGFyZWAgZnVuY3Rpb24gIG1heSBtZWFuIGVpdGhlclxuLy8gXCJlcXVhbHNcIiBvciBcImlzIGluY29tcGFyYWJsZVwiLCBgZXF1YWxzYCBjYW5ub3QgYmUgZGVmaW5lZCBpbiB0ZXJtcyBvZlxuLy8gYGNvbXBhcmVgLiAgSG93ZXZlciwgYGNvbXBhcmVgICpjYW4qIGJlIGRlZmluZWQgaW4gdGVybXMgb2YgYGVxdWFsc2AgYW5kXG4vLyBgbGVzc1RoYW5gLiAgQWdhaW4gaG93ZXZlciwgbW9yZSBvZnRlbiBpdCB3b3VsZCBiZSBkZXNpcmFibGUgdG8gaW1wbGVtZW50XG4vLyBhbGwgb2YgdGhlIGNvbXBhcmlzb24gZnVuY3Rpb25zIGluIHRlcm1zIG9mIGNvbXBhcmUgcmF0aGVyIHRoYW4gdGhlIG90aGVyXG4vLyB3YXkgYXJvdW5kLlxuXG4vKipcbiAgICBEZXRlcm1pbmVzIHRoZSBvcmRlciBpbiB3aGljaCBhbnkgdHdvIG9iamVjdHMgc2hvdWxkIGJlIHNvcnRlZCBieSByZXR1cm5pbmdcbiAgICBhIG51bWJlciB0aGF0IGhhcyBhbiBhbmFsb2dvdXMgcmVsYXRpb25zaGlwIHRvIHplcm8gYXMgdGhlIGxlZnQgdmFsdWUgdG9cbiAgICB0aGUgcmlnaHQuICBUaGF0IGlzLCBpZiB0aGUgbGVmdCBpcyBcImxlc3MgdGhhblwiIHRoZSByaWdodCwgdGhlIHJldHVybmVkXG4gICAgdmFsdWUgd2lsbCBiZSBcImxlc3MgdGhhblwiIHplcm8sIHdoZXJlIFwibGVzcyB0aGFuXCIgbWF5IGJlIGFueSBvdGhlclxuICAgIHRyYW5zaXRpdmUgcmVsYXRpb25zaGlwLlxuXG4gICAgPHA+QXJyYXlzIGFyZSBjb21wYXJlZCBieSB0aGUgZmlyc3QgZGl2ZXJnaW5nIHZhbHVlcywgb3IgYnkgbGVuZ3RoLlxuXG4gICAgPHA+QW55IHR3byB2YWx1ZXMgdGhhdCBhcmUgaW5jb21wYXJhYmxlIHJldHVybiB6ZXJvLiAgQXMgc3VjaCxcbiAgICA8Y29kZT5lcXVhbHM8L2NvZGU+IHNob3VsZCBub3QgYmUgaW1wbGVtZW50ZWQgd2l0aCA8Y29kZT5jb21wYXJlPC9jb2RlPlxuICAgIHNpbmNlIGluY29tcGFyYWJpbGl0eSBpcyBpbmRpc3Rpbmd1aXNoYWJsZSBmcm9tIGVxdWFsaXR5LlxuXG4gICAgPHA+U29ydHMgc3RyaW5ncyBsZXhpY29ncmFwaGljYWxseS4gIFRoaXMgaXMgbm90IHN1aXRhYmxlIGZvciBhbnlcbiAgICBwYXJ0aWN1bGFyIGludGVybmF0aW9uYWwgc2V0dGluZy4gIERpZmZlcmVudCBsb2NhbGVzIHNvcnQgdGhlaXIgcGhvbmUgYm9va3NcbiAgICBpbiB2ZXJ5IGRpZmZlcmVudCB3YXlzLCBwYXJ0aWN1bGFybHkgcmVnYXJkaW5nIGRpYWNyaXRpY3MgYW5kIGxpZ2F0dXJlcy5cblxuICAgIDxwPklmIHRoZSBnaXZlbiBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgYSB0eXBlIHRoYXQgaW1wbGVtZW50cyBhIG1ldGhvZFxuICAgIG5hbWVkIFwiY29tcGFyZVwiLCB0aGlzIGZ1bmN0aW9uIGRlZmVycyB0byB0aGUgaW5zdGFuY2UuICBUaGUgbWV0aG9kIGRvZXMgbm90XG4gICAgbmVlZCB0byBiZSBhbiBvd25lZCBwcm9wZXJ0eSB0byBkaXN0aW5ndWlzaCBpdCBmcm9tIGFuIG9iamVjdCBsaXRlcmFsIHNpbmNlXG4gICAgb2JqZWN0IGxpdGVyYWxzIGFyZSBpbmNvbXBhcmFibGUuICBVbmxpa2UgPGNvZGU+T2JqZWN0PC9jb2RlPiBob3dldmVyLFxuICAgIDxjb2RlPkFycmF5PC9jb2RlPiBpbXBsZW1lbnRzIDxjb2RlPmNvbXBhcmU8L2NvZGU+LlxuXG4gICAgQHBhcmFtIHtBbnl9IGxlZnRcbiAgICBAcGFyYW0ge0FueX0gcmlnaHRcbiAgICBAcmV0dXJucyB7TnVtYmVyfSBhIHZhbHVlIGhhdmluZyB0aGUgc2FtZSB0cmFuc2l0aXZlIHJlbGF0aW9uc2hpcCB0byB6ZXJvXG4gICAgYXMgdGhlIGxlZnQgYW5kIHJpZ2h0IHZhbHVlcy5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmNvbXBhcmVcbiovXG5PYmplY3QuY29tcGFyZSA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgLy8gdW5ib3ggb2JqZWN0cywgYnV0IGRvIG5vdCBjb25mdXNlIG9iamVjdCBsaXRlcmFsc1xuICAgIC8vIG1lcmNpZnVsbHkgaGFuZGxlcyB0aGUgRGF0ZSBjYXNlXG4gICAgYSA9IE9iamVjdC5nZXRWYWx1ZU9mKGEpO1xuICAgIGIgPSBPYmplY3QuZ2V0VmFsdWVPZihiKTtcbiAgICB2YXIgYVR5cGUgPSB0eXBlb2YgYTtcbiAgICB2YXIgYlR5cGUgPSB0eXBlb2YgYjtcbiAgICBpZiAoYSA9PT0gYilcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgaWYgKGFUeXBlICE9PSBiVHlwZSlcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgaWYgKGFUeXBlID09PSBcIm51bWJlclwiKVxuICAgICAgICByZXR1cm4gYSAtIGI7XG4gICAgaWYgKGFUeXBlID09PSBcInN0cmluZ1wiKVxuICAgICAgICByZXR1cm4gYSA8IGIgPyAtMSA6IDE7XG4gICAgICAgIC8vIHRoZSBwb3NzaWJpbGl0eSBvZiBlcXVhbGl0eSBlbGltaWF0ZWQgYWJvdmVcbiAgICBpZiAoT2JqZWN0LmNhbihhLCBcImNvbXBhcmVcIikpXG4gICAgICAgIHJldHVybiBhLmNvbXBhcmUoYik7XG4gICAgLy8gbm90IGNvbW11dGF0aXZlLCB0aGUgcmVsYXRpb25zaGlwIGlzIHJldmVyc2VkXG4gICAgaWYgKE9iamVjdC5jYW4oYiwgXCJjb21wYXJlXCIpKVxuICAgICAgICByZXR1cm4gLWIuY29tcGFyZShhKTtcbiAgICByZXR1cm4gMDtcbn07XG5cbi8qKlxuICAgIENyZWF0ZXMgYSBkZWVwIGNvcHkgb2YgYW55IHZhbHVlLiAgVmFsdWVzLCBiZWluZyBpbW11dGFibGUsIGFyZVxuICAgIHJldHVybmVkIHdpdGhvdXQgYWx0ZXJuYXRpb24uICBGb3J3YXJkcyB0byA8Y29kZT5jbG9uZTwvY29kZT4gb25cbiAgICBvYmplY3RzIGFuZCBhcnJheXMuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmNsb25lXG4gICAgQHBhcmFtIHtBbnl9IHZhbHVlIGEgdmFsdWUgdG8gY2xvbmVcbiAgICBAcGFyYW0ge051bWJlcn0gZGVwdGggYW4gb3B0aW9uYWwgdHJhdmVyc2FsIGRlcHRoLCBkZWZhdWx0cyB0byBpbmZpbml0eS5cbiAgICBBIHZhbHVlIG9mIDxjb2RlPjA8L2NvZGU+IG1lYW5zIHRvIG1ha2Ugbm8gY2xvbmUgYW5kIHJldHVybiB0aGUgdmFsdWVcbiAgICBkaXJlY3RseS5cbiAgICBAcGFyYW0ge01hcH0gbWVtbyBhbiBvcHRpb25hbCBtZW1vIG9mIGFscmVhZHkgdmlzaXRlZCBvYmplY3RzIHRvIHByZXNlcnZlXG4gICAgcmVmZXJlbmNlIGN5Y2xlcy4gIFRoZSBjbG9uZWQgb2JqZWN0IHdpbGwgaGF2ZSB0aGUgZXhhY3Qgc2FtZSBzaGFwZSBhcyB0aGVcbiAgICBvcmlnaW5hbCwgYnV0IG5vIGlkZW50aWNhbCBvYmplY3RzLiAgVGUgbWFwIG1heSBiZSBsYXRlciB1c2VkIHRvIGFzc29jaWF0ZVxuICAgIGFsbCBvYmplY3RzIGluIHRoZSBvcmlnaW5hbCBvYmplY3QgZ3JhcGggd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIG1lbWJlciBvZlxuICAgIHRoZSBjbG9uZWQgZ3JhcGguXG4gICAgQHJldHVybnMgYSBjb3B5IG9mIHRoZSB2YWx1ZVxuKi9cbk9iamVjdC5jbG9uZSA9IGZ1bmN0aW9uICh2YWx1ZSwgZGVwdGgsIG1lbW8pIHtcbiAgICB2YWx1ZSA9IE9iamVjdC5nZXRWYWx1ZU9mKHZhbHVlKTtcbiAgICBtZW1vID0gbWVtbyB8fCBuZXcgV2Vha01hcCgpO1xuICAgIGlmIChkZXB0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlcHRoID0gSW5maW5pdHk7XG4gICAgfSBlbHNlIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICAgIGlmIChPYmplY3QuaXNPYmplY3QodmFsdWUpKSB7XG4gICAgICAgIGlmICghbWVtby5oYXModmFsdWUpKSB7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmNhbih2YWx1ZSwgXCJjbG9uZVwiKSkge1xuICAgICAgICAgICAgICAgIG1lbW8uc2V0KHZhbHVlLCB2YWx1ZS5jbG9uZShkZXB0aCwgbWVtbykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvdG90eXBlID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAocHJvdG90eXBlID09PSBudWxsIHx8IHByb3RvdHlwZSA9PT0gT2JqZWN0LnByb3RvdHlwZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2xvbmUgPSBPYmplY3QuY3JlYXRlKHByb3RvdHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIG1lbW8uc2V0KHZhbHVlLCBjbG9uZSk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmVba2V5XSA9IE9iamVjdC5jbG9uZSh2YWx1ZVtrZXldLCBkZXB0aCAtIDEsIG1lbW8pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2xvbmUgXCIgKyB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vLmdldCh2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn07XG5cbi8qKlxuICAgIFJlbW92ZXMgYWxsIHByb3BlcnRpZXMgb3duZWQgYnkgdGhpcyBvYmplY3QgbWFraW5nIHRoZSBvYmplY3Qgc3VpdGFibGUgZm9yXG4gICAgcmV1c2UuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmNsZWFyXG4gICAgQHJldHVybnMgdGhpc1xuKi9cbk9iamVjdC5jbGVhciA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICBpZiAoT2JqZWN0LmNhbihvYmplY3QsIFwiY2xlYXJcIikpIHtcbiAgICAgICAgb2JqZWN0LmNsZWFyKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpLFxuICAgICAgICAgICAgaSA9IGtleXMubGVuZ3RoO1xuICAgICAgICB3aGlsZSAoaSkge1xuICAgICAgICAgICAgaS0tO1xuICAgICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXlzW2ldXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxuIiwiXG4vKipcbiAgICBhY2NlcHRzIGEgc3RyaW5nOyByZXR1cm5zIHRoZSBzdHJpbmcgd2l0aCByZWdleCBtZXRhY2hhcmFjdGVycyBlc2NhcGVkLlxuICAgIHRoZSByZXR1cm5lZCBzdHJpbmcgY2FuIHNhZmVseSBiZSB1c2VkIHdpdGhpbiBhIHJlZ2V4IHRvIG1hdGNoIGEgbGl0ZXJhbFxuICAgIHN0cmluZy4gZXNjYXBlZCBjaGFyYWN0ZXJzIGFyZSBbLCBdLCB7LCB9LCAoLCApLCAtLCAqLCArLCA/LCAuLCBcXCwgXiwgJCxcbiAgICB8LCAjLCBbY29tbWFdLCBhbmQgd2hpdGVzcGFjZS5cbiovXG5pZiAoIVJlZ0V4cC5lc2NhcGUpIHtcbiAgICB2YXIgc3BlY2lhbCA9IC9bLVtcXF17fSgpKis/LlxcXFxeJHwsI1xcc10vZztcbiAgICBSZWdFeHAuZXNjYXBlID0gZnVuY3Rpb24gKHN0cmluZykge1xuICAgICAgICByZXR1cm4gc3RyaW5nLnJlcGxhY2Uoc3BlY2lhbCwgXCJcXFxcJCZcIik7XG4gICAgfTtcbn1cblxuIiwiXG52YXIgQXJyYXkgPSByZXF1aXJlKFwiLi9zaGltLWFycmF5XCIpO1xudmFyIE9iamVjdCA9IHJlcXVpcmUoXCIuL3NoaW0tb2JqZWN0XCIpO1xudmFyIEZ1bmN0aW9uID0gcmVxdWlyZShcIi4vc2hpbS1mdW5jdGlvblwiKTtcbnZhciBSZWdFeHAgPSByZXF1aXJlKFwiLi9zaGltLXJlZ2V4cFwiKTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gVHJlZUxvZztcblxuZnVuY3Rpb24gVHJlZUxvZygpIHtcbn1cblxuVHJlZUxvZy5hc2NpaSA9IHtcbiAgICBpbnRlcnNlY3Rpb246IFwiK1wiLFxuICAgIHRocm91Z2g6IFwiLVwiLFxuICAgIGJyYW5jaFVwOiBcIitcIixcbiAgICBicmFuY2hEb3duOiBcIitcIixcbiAgICBmcm9tQmVsb3c6IFwiLlwiLFxuICAgIGZyb21BYm92ZTogXCInXCIsXG4gICAgZnJvbUJvdGg6IFwiK1wiLFxuICAgIHN0cmFmZTogXCJ8XCJcbn07XG5cblRyZWVMb2cudW5pY29kZVJvdW5kID0ge1xuICAgIGludGVyc2VjdGlvbjogXCJcXHUyNTRiXCIsXG4gICAgdGhyb3VnaDogXCJcXHUyNTAxXCIsXG4gICAgYnJhbmNoVXA6IFwiXFx1MjUzYlwiLFxuICAgIGJyYW5jaERvd246IFwiXFx1MjUzM1wiLFxuICAgIGZyb21CZWxvdzogXCJcXHUyNTZkXCIsIC8vIHJvdW5kIGNvcm5lclxuICAgIGZyb21BYm92ZTogXCJcXHUyNTcwXCIsIC8vIHJvdW5kIGNvcm5lclxuICAgIGZyb21Cb3RoOiBcIlxcdTI1MjNcIixcbiAgICBzdHJhZmU6IFwiXFx1MjUwM1wiXG59O1xuXG5UcmVlTG9nLnVuaWNvZGVTaGFycCA9IHtcbiAgICBpbnRlcnNlY3Rpb246IFwiXFx1MjU0YlwiLFxuICAgIHRocm91Z2g6IFwiXFx1MjUwMVwiLFxuICAgIGJyYW5jaFVwOiBcIlxcdTI1M2JcIixcbiAgICBicmFuY2hEb3duOiBcIlxcdTI1MzNcIixcbiAgICBmcm9tQmVsb3c6IFwiXFx1MjUwZlwiLCAvLyBzaGFycCBjb3JuZXJcbiAgICBmcm9tQWJvdmU6IFwiXFx1MjUxN1wiLCAvLyBzaGFycCBjb3JuZXJcbiAgICBmcm9tQm90aDogXCJcXHUyNTIzXCIsXG4gICAgc3RyYWZlOiBcIlxcdTI1MDNcIlxufTtcblxuIiwidmFyIGdsb2JhbD10eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge307XG52YXIgcm5nO1xuXG5pZiAoZ2xvYmFsLmNyeXB0byAmJiBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKSB7XG4gIC8vIFdIQVRXRyBjcnlwdG8tYmFzZWQgUk5HIC0gaHR0cDovL3dpa2kud2hhdHdnLm9yZy93aWtpL0NyeXB0b1xuICAvLyBNb2RlcmF0ZWx5IGZhc3QsIGhpZ2ggcXVhbGl0eVxuICB2YXIgX3JuZHM4ID0gbmV3IFVpbnQ4QXJyYXkoMTYpO1xuICBybmcgPSBmdW5jdGlvbiB3aGF0d2dSTkcoKSB7XG4gICAgY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhfcm5kczgpO1xuICAgIHJldHVybiBfcm5kczg7XG4gIH07XG59XG5cbmlmICghcm5nKSB7XG4gIC8vIE1hdGgucmFuZG9tKCktYmFzZWQgKFJORylcbiAgLy9cbiAgLy8gSWYgYWxsIGVsc2UgZmFpbHMsIHVzZSBNYXRoLnJhbmRvbSgpLiAgSXQncyBmYXN0LCBidXQgaXMgb2YgdW5zcGVjaWZpZWRcbiAgLy8gcXVhbGl0eS5cbiAgdmFyICBfcm5kcyA9IG5ldyBBcnJheSgxNik7XG4gIHJuZyA9IGZ1bmN0aW9uKCkge1xuICAgIGZvciAodmFyIGkgPSAwLCByOyBpIDwgMTY7IGkrKykge1xuICAgICAgaWYgKChpICYgMHgwMykgPT09IDApIHIgPSBNYXRoLnJhbmRvbSgpICogMHgxMDAwMDAwMDA7XG4gICAgICBfcm5kc1tpXSA9IHIgPj4+ICgoaSAmIDB4MDMpIDw8IDMpICYgMHhmZjtcbiAgICB9XG5cbiAgICByZXR1cm4gX3JuZHM7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcm5nO1xuXG4iLCJ2YXIgQnVmZmVyPXJlcXVpcmUoXCJfX2Jyb3dzZXJpZnlfQnVmZmVyXCIpOy8vICAgICB1dWlkLmpzXG4vL1xuLy8gICAgIENvcHlyaWdodCAoYykgMjAxMC0yMDEyIFJvYmVydCBLaWVmZmVyXG4vLyAgICAgTUlUIExpY2Vuc2UgLSBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwXG5cbi8vIFVuaXF1ZSBJRCBjcmVhdGlvbiByZXF1aXJlcyBhIGhpZ2ggcXVhbGl0eSByYW5kb20gIyBnZW5lcmF0b3IuICBXZSBmZWF0dXJlXG4vLyBkZXRlY3QgdG8gZGV0ZXJtaW5lIHRoZSBiZXN0IFJORyBzb3VyY2UsIG5vcm1hbGl6aW5nIHRvIGEgZnVuY3Rpb24gdGhhdFxuLy8gcmV0dXJucyAxMjgtYml0cyBvZiByYW5kb21uZXNzLCBzaW5jZSB0aGF0J3Mgd2hhdCdzIHVzdWFsbHkgcmVxdWlyZWRcbnZhciBfcm5nID0gcmVxdWlyZSgnLi9ybmcnKTtcblxuLy8gQnVmZmVyIGNsYXNzIHRvIHVzZVxudmFyIEJ1ZmZlckNsYXNzID0gdHlwZW9mKEJ1ZmZlcikgPT0gJ2Z1bmN0aW9uJyA/IEJ1ZmZlciA6IEFycmF5O1xuXG4vLyBNYXBzIGZvciBudW1iZXIgPC0+IGhleCBzdHJpbmcgY29udmVyc2lvblxudmFyIF9ieXRlVG9IZXggPSBbXTtcbnZhciBfaGV4VG9CeXRlID0ge307XG5mb3IgKHZhciBpID0gMDsgaSA8IDI1NjsgaSsrKSB7XG4gIF9ieXRlVG9IZXhbaV0gPSAoaSArIDB4MTAwKS50b1N0cmluZygxNikuc3Vic3RyKDEpO1xuICBfaGV4VG9CeXRlW19ieXRlVG9IZXhbaV1dID0gaTtcbn1cblxuLy8gKipgcGFyc2UoKWAgLSBQYXJzZSBhIFVVSUQgaW50byBpdCdzIGNvbXBvbmVudCBieXRlcyoqXG5mdW5jdGlvbiBwYXJzZShzLCBidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IChidWYgJiYgb2Zmc2V0KSB8fCAwLCBpaSA9IDA7XG5cbiAgYnVmID0gYnVmIHx8IFtdO1xuICBzLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvWzAtOWEtZl17Mn0vZywgZnVuY3Rpb24ob2N0KSB7XG4gICAgaWYgKGlpIDwgMTYpIHsgLy8gRG9uJ3Qgb3ZlcmZsb3chXG4gICAgICBidWZbaSArIGlpKytdID0gX2hleFRvQnl0ZVtvY3RdO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gWmVybyBvdXQgcmVtYWluaW5nIGJ5dGVzIGlmIHN0cmluZyB3YXMgc2hvcnRcbiAgd2hpbGUgKGlpIDwgMTYpIHtcbiAgICBidWZbaSArIGlpKytdID0gMDtcbiAgfVxuXG4gIHJldHVybiBidWY7XG59XG5cbi8vICoqYHVucGFyc2UoKWAgLSBDb252ZXJ0IFVVSUQgYnl0ZSBhcnJheSAoYWxhIHBhcnNlKCkpIGludG8gYSBzdHJpbmcqKlxuZnVuY3Rpb24gdW5wYXJzZShidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IG9mZnNldCB8fCAwLCBidGggPSBfYnl0ZVRvSGV4O1xuICByZXR1cm4gIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXSArICctJyArXG4gICAgICAgICAgYnRoW2J1ZltpKytdXSArIGJ0aFtidWZbaSsrXV0gKyAnLScgK1xuICAgICAgICAgIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICsgJy0nICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXSArICctJyArXG4gICAgICAgICAgYnRoW2J1ZltpKytdXSArIGJ0aFtidWZbaSsrXV0gK1xuICAgICAgICAgIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXTtcbn1cblxuLy8gKipgdjEoKWAgLSBHZW5lcmF0ZSB0aW1lLWJhc2VkIFVVSUQqKlxuLy9cbi8vIEluc3BpcmVkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS9MaW9zSy9VVUlELmpzXG4vLyBhbmQgaHR0cDovL2RvY3MucHl0aG9uLm9yZy9saWJyYXJ5L3V1aWQuaHRtbFxuXG4vLyByYW5kb20gIydzIHdlIG5lZWQgdG8gaW5pdCBub2RlIGFuZCBjbG9ja3NlcVxudmFyIF9zZWVkQnl0ZXMgPSBfcm5nKCk7XG5cbi8vIFBlciA0LjUsIGNyZWF0ZSBhbmQgNDgtYml0IG5vZGUgaWQsICg0NyByYW5kb20gYml0cyArIG11bHRpY2FzdCBiaXQgPSAxKVxudmFyIF9ub2RlSWQgPSBbXG4gIF9zZWVkQnl0ZXNbMF0gfCAweDAxLFxuICBfc2VlZEJ5dGVzWzFdLCBfc2VlZEJ5dGVzWzJdLCBfc2VlZEJ5dGVzWzNdLCBfc2VlZEJ5dGVzWzRdLCBfc2VlZEJ5dGVzWzVdXG5dO1xuXG4vLyBQZXIgNC4yLjIsIHJhbmRvbWl6ZSAoMTQgYml0KSBjbG9ja3NlcVxudmFyIF9jbG9ja3NlcSA9IChfc2VlZEJ5dGVzWzZdIDw8IDggfCBfc2VlZEJ5dGVzWzddKSAmIDB4M2ZmZjtcblxuLy8gUHJldmlvdXMgdXVpZCBjcmVhdGlvbiB0aW1lXG52YXIgX2xhc3RNU2VjcyA9IDAsIF9sYXN0TlNlY3MgPSAwO1xuXG4vLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2Jyb29mYS9ub2RlLXV1aWQgZm9yIEFQSSBkZXRhaWxzXG5mdW5jdGlvbiB2MShvcHRpb25zLCBidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IGJ1ZiAmJiBvZmZzZXQgfHwgMDtcbiAgdmFyIGIgPSBidWYgfHwgW107XG5cbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgdmFyIGNsb2Nrc2VxID0gb3B0aW9ucy5jbG9ja3NlcSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jbG9ja3NlcSA6IF9jbG9ja3NlcTtcblxuICAvLyBVVUlEIHRpbWVzdGFtcHMgYXJlIDEwMCBuYW5vLXNlY29uZCB1bml0cyBzaW5jZSB0aGUgR3JlZ29yaWFuIGVwb2NoLFxuICAvLyAoMTU4Mi0xMC0xNSAwMDowMCkuICBKU051bWJlcnMgYXJlbid0IHByZWNpc2UgZW5vdWdoIGZvciB0aGlzLCBzb1xuICAvLyB0aW1lIGlzIGhhbmRsZWQgaW50ZXJuYWxseSBhcyAnbXNlY3MnIChpbnRlZ2VyIG1pbGxpc2Vjb25kcykgYW5kICduc2VjcydcbiAgLy8gKDEwMC1uYW5vc2Vjb25kcyBvZmZzZXQgZnJvbSBtc2Vjcykgc2luY2UgdW5peCBlcG9jaCwgMTk3MC0wMS0wMSAwMDowMC5cbiAgdmFyIG1zZWNzID0gb3B0aW9ucy5tc2VjcyAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5tc2VjcyA6IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gIC8vIFBlciA0LjIuMS4yLCB1c2UgY291bnQgb2YgdXVpZCdzIGdlbmVyYXRlZCBkdXJpbmcgdGhlIGN1cnJlbnQgY2xvY2tcbiAgLy8gY3ljbGUgdG8gc2ltdWxhdGUgaGlnaGVyIHJlc29sdXRpb24gY2xvY2tcbiAgdmFyIG5zZWNzID0gb3B0aW9ucy5uc2VjcyAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5uc2VjcyA6IF9sYXN0TlNlY3MgKyAxO1xuXG4gIC8vIFRpbWUgc2luY2UgbGFzdCB1dWlkIGNyZWF0aW9uIChpbiBtc2VjcylcbiAgdmFyIGR0ID0gKG1zZWNzIC0gX2xhc3RNU2VjcykgKyAobnNlY3MgLSBfbGFzdE5TZWNzKS8xMDAwMDtcblxuICAvLyBQZXIgNC4yLjEuMiwgQnVtcCBjbG9ja3NlcSBvbiBjbG9jayByZWdyZXNzaW9uXG4gIGlmIChkdCA8IDAgJiYgb3B0aW9ucy5jbG9ja3NlcSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgY2xvY2tzZXEgPSBjbG9ja3NlcSArIDEgJiAweDNmZmY7XG4gIH1cblxuICAvLyBSZXNldCBuc2VjcyBpZiBjbG9jayByZWdyZXNzZXMgKG5ldyBjbG9ja3NlcSkgb3Igd2UndmUgbW92ZWQgb250byBhIG5ld1xuICAvLyB0aW1lIGludGVydmFsXG4gIGlmICgoZHQgPCAwIHx8IG1zZWNzID4gX2xhc3RNU2VjcykgJiYgb3B0aW9ucy5uc2VjcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbnNlY3MgPSAwO1xuICB9XG5cbiAgLy8gUGVyIDQuMi4xLjIgVGhyb3cgZXJyb3IgaWYgdG9vIG1hbnkgdXVpZHMgYXJlIHJlcXVlc3RlZFxuICBpZiAobnNlY3MgPj0gMTAwMDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3V1aWQudjEoKTogQ2FuXFwndCBjcmVhdGUgbW9yZSB0aGFuIDEwTSB1dWlkcy9zZWMnKTtcbiAgfVxuXG4gIF9sYXN0TVNlY3MgPSBtc2VjcztcbiAgX2xhc3ROU2VjcyA9IG5zZWNzO1xuICBfY2xvY2tzZXEgPSBjbG9ja3NlcTtcblxuICAvLyBQZXIgNC4xLjQgLSBDb252ZXJ0IGZyb20gdW5peCBlcG9jaCB0byBHcmVnb3JpYW4gZXBvY2hcbiAgbXNlY3MgKz0gMTIyMTkyOTI4MDAwMDA7XG5cbiAgLy8gYHRpbWVfbG93YFxuICB2YXIgdGwgPSAoKG1zZWNzICYgMHhmZmZmZmZmKSAqIDEwMDAwICsgbnNlY3MpICUgMHgxMDAwMDAwMDA7XG4gIGJbaSsrXSA9IHRsID4+PiAyNCAmIDB4ZmY7XG4gIGJbaSsrXSA9IHRsID4+PiAxNiAmIDB4ZmY7XG4gIGJbaSsrXSA9IHRsID4+PiA4ICYgMHhmZjtcbiAgYltpKytdID0gdGwgJiAweGZmO1xuXG4gIC8vIGB0aW1lX21pZGBcbiAgdmFyIHRtaCA9IChtc2VjcyAvIDB4MTAwMDAwMDAwICogMTAwMDApICYgMHhmZmZmZmZmO1xuICBiW2krK10gPSB0bWggPj4+IDggJiAweGZmO1xuICBiW2krK10gPSB0bWggJiAweGZmO1xuXG4gIC8vIGB0aW1lX2hpZ2hfYW5kX3ZlcnNpb25gXG4gIGJbaSsrXSA9IHRtaCA+Pj4gMjQgJiAweGYgfCAweDEwOyAvLyBpbmNsdWRlIHZlcnNpb25cbiAgYltpKytdID0gdG1oID4+PiAxNiAmIDB4ZmY7XG5cbiAgLy8gYGNsb2NrX3NlcV9oaV9hbmRfcmVzZXJ2ZWRgIChQZXIgNC4yLjIgLSBpbmNsdWRlIHZhcmlhbnQpXG4gIGJbaSsrXSA9IGNsb2Nrc2VxID4+PiA4IHwgMHg4MDtcblxuICAvLyBgY2xvY2tfc2VxX2xvd2BcbiAgYltpKytdID0gY2xvY2tzZXEgJiAweGZmO1xuXG4gIC8vIGBub2RlYFxuICB2YXIgbm9kZSA9IG9wdGlvbnMubm9kZSB8fCBfbm9kZUlkO1xuICBmb3IgKHZhciBuID0gMDsgbiA8IDY7IG4rKykge1xuICAgIGJbaSArIG5dID0gbm9kZVtuXTtcbiAgfVxuXG4gIHJldHVybiBidWYgPyBidWYgOiB1bnBhcnNlKGIpO1xufVxuXG4vLyAqKmB2NCgpYCAtIEdlbmVyYXRlIHJhbmRvbSBVVUlEKipcblxuLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9icm9vZmEvbm9kZS11dWlkIGZvciBBUEkgZGV0YWlsc1xuZnVuY3Rpb24gdjQob3B0aW9ucywgYnVmLCBvZmZzZXQpIHtcbiAgLy8gRGVwcmVjYXRlZCAtICdmb3JtYXQnIGFyZ3VtZW50LCBhcyBzdXBwb3J0ZWQgaW4gdjEuMlxuICB2YXIgaSA9IGJ1ZiAmJiBvZmZzZXQgfHwgMDtcblxuICBpZiAodHlwZW9mKG9wdGlvbnMpID09ICdzdHJpbmcnKSB7XG4gICAgYnVmID0gb3B0aW9ucyA9PSAnYmluYXJ5JyA/IG5ldyBCdWZmZXJDbGFzcygxNikgOiBudWxsO1xuICAgIG9wdGlvbnMgPSBudWxsO1xuICB9XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIHZhciBybmRzID0gb3B0aW9ucy5yYW5kb20gfHwgKG9wdGlvbnMucm5nIHx8IF9ybmcpKCk7XG5cbiAgLy8gUGVyIDQuNCwgc2V0IGJpdHMgZm9yIHZlcnNpb24gYW5kIGBjbG9ja19zZXFfaGlfYW5kX3Jlc2VydmVkYFxuICBybmRzWzZdID0gKHJuZHNbNl0gJiAweDBmKSB8IDB4NDA7XG4gIHJuZHNbOF0gPSAocm5kc1s4XSAmIDB4M2YpIHwgMHg4MDtcblxuICAvLyBDb3B5IGJ5dGVzIHRvIGJ1ZmZlciwgaWYgcHJvdmlkZWRcbiAgaWYgKGJ1Zikge1xuICAgIGZvciAodmFyIGlpID0gMDsgaWkgPCAxNjsgaWkrKykge1xuICAgICAgYnVmW2kgKyBpaV0gPSBybmRzW2lpXTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmIHx8IHVucGFyc2Uocm5kcyk7XG59XG5cbi8vIEV4cG9ydCBwdWJsaWMgQVBJXG52YXIgdXVpZCA9IHY0O1xudXVpZC52MSA9IHYxO1xudXVpZC52NCA9IHY0O1xudXVpZC5wYXJzZSA9IHBhcnNlO1xudXVpZC51bnBhcnNlID0gdW5wYXJzZTtcbnV1aWQuQnVmZmVyQ2xhc3MgPSBCdWZmZXJDbGFzcztcblxubW9kdWxlLmV4cG9ydHMgPSB1dWlkO1xuIiwiLy8gUGFyYW1zIGFyZSBjb250YWluZXJzLFxuLy8gd2hpY2ggaGF2ZSBhIGNsb2NrIGtleSB7IGNsb2NrOiB7fSB9XG5cbi8vIGluY3JlbWVudHMgdGhlIGNvdW50ZXIgZm9yIG5vZGVJZFxuZXhwb3J0cy5pbmNyZW1lbnQgPSBmdW5jdGlvbihvLCBub2RlSWQpIHtcbiAgaWYoby5jbG9jaykge1xuICAgIG8uY2xvY2tbbm9kZUlkXSA9ICh0eXBlb2Ygby5jbG9ja1tub2RlSWRdID09ICd1bmRlZmluZWQnID8gMSA6IG8uY2xvY2tbbm9kZUlkXSArIDEpO1xuICB9IGVsc2Uge1xuICAgIG9bbm9kZUlkXSA9ICh0eXBlb2Ygb1tub2RlSWRdID09ICd1bmRlZmluZWQnID8gMSA6IG9bbm9kZUlkXSArIDEpO1xuICB9XG4gIHJldHVybiBvO1xufTtcblxuZnVuY3Rpb24gYWxsS2V5cyhhLCBiKXtcbiAgdmFyIGxhc3QgPSBudWxsO1xuICByZXR1cm4gT2JqZWN0LmtleXMoYSlcbiAgICAuY29uY2F0KE9iamVjdC5rZXlzKGIpKVxuICAgIC5zb3J0KClcbiAgICAuZmlsdGVyKGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgIC8vIHRvIG1ha2UgYSBzZXQgb2Ygc29ydGVkIGtleXMgdW5pcXVlLCBqdXN0IGNoZWNrIHRoYXQgY29uc2VjdXRpdmUga2V5cyBhcmUgZGlmZmVyZW50XG4gICAgICB2YXIgaXNEdXBsaWNhdGUgPSAoaXRlbSA9PSBsYXN0KTtcbiAgICAgIGxhc3QgPSBpdGVtO1xuICAgICAgcmV0dXJuICFpc0R1cGxpY2F0ZTtcbiAgICB9KTtcbn1cblxuLy8gbGlrZSBhIHJlZ3VsYXIgc29ydCBmdW5jdGlvbiwgcmV0dXJuczpcbi8vIGlmIGEgPCBiOiAtMVxuLy8gaWYgYSA9PSBiOiAwXG4vLyBpZiBhID4gYjogMVxuLy8gRS5nLiBpZiB1c2VkIHRvIHNvcnQgYW4gYXJyYXkgb2Yga2V5cywgd2lsbCBvcmRlciB0aGVtIGluIGFzY2VuZGluZyBvcmRlciAoMSwgMiwgMyAuLilcbmV4cG9ydHMuYXNjU29ydCA9IGV4cG9ydHMuY29tcGFyZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgdmFyIGlzR3JlYXRlciA9IGZhbHNlLFxuICAgICAgaXNMZXNzID0gZmFsc2U7XG5cbiAgLy8gYWxsb3cgdGhpcyBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCBvYmplY3RzIHRoYXQgY29udGFpbiBjbG9ja3MsIG9yIHRoZSBjbG9ja3MgdGhlbXNlbHZlc1xuICBpZihhLmNsb2NrKSBhID0gYS5jbG9jaztcbiAgaWYoYi5jbG9jaykgYiA9IGIuY2xvY2s7XG5cbiAgYWxsS2V5cyhhLCBiKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHZhciBkaWZmID0gKGFba2V5XSB8fCAwKSAtIChiW2tleV0gfHwgMCk7XG4gICAgaWYoZGlmZiA+IDApIGlzR3JlYXRlciA9IHRydWU7XG4gICAgaWYoZGlmZiA8IDApIGlzTGVzcyA9IHRydWU7XG4gIH0pO1xuXG4gIGlmKGlzR3JlYXRlciAmJiBpc0xlc3MpIHJldHVybiAwO1xuICBpZihpc0xlc3MpIHJldHVybiAtMTtcbiAgaWYoaXNHcmVhdGVyKSByZXR1cm4gMTtcbiAgcmV0dXJuIDA7IC8vIG5laXRoZXIgaXMgc2V0LCBzbyBlcXVhbFxufTtcblxuLy8gc29ydCBpbiBkZXNjZW5kaW5nIG9yZGVyIChOLCAuLi4gMywgMiwgMSlcbmV4cG9ydHMuZGVzY1NvcnQgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiAwIC0gZXhwb3J0cy5hc2NTb3J0KGEsIGIpO1xufTtcblxuLy8gZXF1YWwsIG9yIG5vdCBsZXNzIGFuZCBub3QgZ3JlYXRlciB0aGFuXG5leHBvcnRzLmlzQ29uY3VycmVudCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuICEhKGV4cG9ydHMuY29tcGFyZShhLCBiKSA9PSAwKTtcbn07XG5cbi8vIGlkZW50aWNhbFxuZXhwb3J0cy5pc0lkZW50aWNhbCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgLy8gYWxsb3cgdGhpcyBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCBvYmplY3RzIHRoYXQgY29udGFpbiBjbG9ja3MsIG9yIHRoZSBjbG9ja3MgdGhlbXNlbHZlc1xuICBpZihhLmNsb2NrKSBhID0gYS5jbG9jaztcbiAgaWYoYi5jbG9jaykgYiA9IGIuY2xvY2s7XG5cbiAgcmV0dXJuIGFsbEtleXMoYSwgYikuZXZlcnkoZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYodHlwZW9mIGFba2V5XSA9PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgYltrZXldID09ICd1bmRlZmluZWQnKSByZXR1cm4gZmFsc2U7XG4gICAgdmFyIGRpZmYgPSBhW2tleV0gLSBiW2tleV07XG4gICAgaWYoZGlmZiAhPSAwKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xufTtcblxuXG4vLyBnaXZlbiB0d28gdmVjdG9yIGNsb2NrcywgcmV0dXJucyBhIG5ldyB2ZWN0b3IgY2xvY2sgd2l0aCBhbGwgdmFsdWVzIGdyZWF0ZXIgdGhhblxuLy8gdGhvc2Ugb2YgdGhlIG1lcmdlZCBjbG9ja3NcbmV4cG9ydHMubWVyZ2UgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHZhciBsYXN0ID0gbnVsbCwgcmVzdWx0ID0ge30sIHdhbnRDb250YWluZXIgPSBmYWxzZTtcbiAgLy8gYWxsb3cgdGhpcyBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCBvYmplY3RzIHRoYXQgY29udGFpbiBjbG9ja3MsIG9yIHRoZSBjbG9ja3MgdGhlbXNlbHZlc1xuICBpZihhLmNsb2NrICYmIGIuY2xvY2spIHdhbnRDb250YWluZXIgPSB0cnVlO1xuICBpZihhLmNsb2NrKSBhID0gYS5jbG9jaztcbiAgaWYoYi5jbG9jaykgYiA9IGIuY2xvY2s7XG5cbiAgYWxsS2V5cyhhLCBiKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gTWF0aC5tYXgoYVtrZXldIHx8IDAsIGJba2V5XSB8fCAwKTtcbiAgfSk7XG4gIGlmKHdhbnRDb250YWluZXIpIHtcbiAgICByZXR1cm4geyBjbG9jazogcmVzdWx0IH07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmV4cG9ydHMuR1QgPSAxO1xuZXhwb3J0cy5MVCA9IC0xO1xuZXhwb3J0cy5DT05DVVJSRU5UID0gMDtcbiIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4vKiBnbG9iYWwgZG9jdW1lbnQsIGxvY2F0aW9uLCBQcmltdXM6IGZhbHNlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciB1cmwgPSByZXF1aXJlKCd1cmwnKTtcbnZhciByZVRyYWlsaW5nU2xhc2ggPSAvXFwvJC87XG5cbi8qKlxuICAjIyMgc2lnbmFsbGVyLmxvYWRQcmltdXMoc2lnbmFsaG9zdCwgY2FsbGJhY2spXG5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzaWduYWxob3N0LCBjYWxsYmFjaykge1xuICB2YXIgc2NyaXB0O1xuICB2YXIgYmFzZVVybDtcbiAgdmFyIGJhc2VQYXRoO1xuICB2YXIgc2NyaXB0U3JjO1xuXG4gIC8vIGlmIHRoZSBzaWduYWxob3N0IGlzIGEgZnVuY3Rpb24sIHdlIGFyZSBpbiBzaW5nbGUgYXJnIGNhbGxpbmcgbW9kZVxuICBpZiAodHlwZW9mIHNpZ25hbGhvc3QgPT0gJ2Z1bmN0aW9uJykge1xuICAgIGNhbGxiYWNrID0gc2lnbmFsaG9zdDtcbiAgICBzaWduYWxob3N0ID0gbG9jYXRpb24ub3JpZ2luO1xuICB9XG5cbiAgLy8gcmVhZCB0aGUgYmFzZSBwYXRoXG4gIGJhc2VVcmwgPSBzaWduYWxob3N0LnJlcGxhY2UocmVUcmFpbGluZ1NsYXNoLCAnJyk7XG4gIGJhc2VQYXRoID0gdXJsLnBhcnNlKHNpZ25hbGhvc3QpLnBhdGhuYW1lO1xuICBzY3JpcHRTcmMgPSBiYXNlVXJsICsgJy9ydGMuaW8vcHJpbXVzLmpzJztcblxuICAvLyBsb29rIGZvciB0aGUgc2NyaXB0IGZpcnN0XG4gIHNjcmlwdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NjcmlwdFtzcmM9XCInICsgc2NyaXB0U3JjICsgJ1wiXScpO1xuXG4gIC8vIGlmIHdlIGZvdW5kLCB0aGUgc2NyaXB0IHRyaWdnZXIgdGhlIGNhbGxiYWNrIGltbWVkaWF0ZWx5XG4gIGlmIChzY3JpcHQgJiYgdHlwZW9mIFByaW11cyAhPSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBjYWxsYmFjayhudWxsLCBQcmltdXMpO1xuICB9XG5cbiAgLy8gb3RoZXJ3aXNlIGNyZWF0ZSB0aGUgc2NyaXB0IGFuZCBsb2FkIHByaW11c1xuICBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgc2NyaXB0LnNyYyA9IHNjcmlwdFNyYztcblxuICBzY3JpcHQub25lcnJvciA9IGNhbGxiYWNrO1xuICBzY3JpcHQub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgLy8gaWYgd2UgaGF2ZSBhIHNpZ25hbGhvc3QgdGhhdCBpcyBub3QgYmFzZXBhdGhlZCBhdCAvXG4gICAgLy8gdGhlbiB0d2VhayB0aGUgcHJpbXVzIHByb3RvdHlwZVxuICAgIGlmIChiYXNlUGF0aCAhPT0gJy8nKSB7XG4gICAgICBQcmltdXMucHJvdG90eXBlLnBhdGhuYW1lID0gYmFzZVBhdGgucmVwbGFjZShyZVRyYWlsaW5nU2xhc2gsICcnKSArXG4gICAgICAgIFByaW11cy5wcm90b3R5cGUucGF0aG5hbWU7XG4gICAgfVxuXG4gICAgY2FsbGJhY2sobnVsbCwgUHJpbXVzKTtcbiAgfTtcblxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNjcmlwdCk7XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKSgncnRjLXNpZ25hbGxlci1wcm9jZXNzb3InKTtcbnZhciBqc29ucGFyc2UgPSByZXF1aXJlKCdjb2cvanNvbnBhcnNlJyk7XG52YXIgdmMgPSByZXF1aXJlKCd2ZWN0b3JjbG9jaycpO1xuXG4vKipcbiAgIyMgc2lnbmFsbGVyIHByb2Nlc3MgaGFuZGxpbmdcblxuICBXaGVuIGEgc2lnbmFsbGVyJ3MgdW5kZXJsaW5nIG1lc3NlbmdlciBlbWl0cyBhIGBkYXRhYCBldmVudCB0aGlzIGlzXG4gIGRlbGVnYXRlZCB0byBhIHNpbXBsZSBtZXNzYWdlIHBhcnNlciwgd2hpY2ggYXBwbGllcyB0aGUgZm9sbG93aW5nIHNpbXBsZVxuICBsb2dpYzpcblxuICAtIElzIHRoZSBtZXNzYWdlIGEgYC90b2AgbWVzc2FnZS4gSWYgc28sIHNlZSBpZiB0aGUgbWVzc2FnZSBpcyBmb3IgdGhpc1xuICAgIHNpZ25hbGxlciAoY2hlY2tpbmcgdGhlIHRhcmdldCBpZCAtIDJuZCBhcmcpLiAgSWYgc28gcGFzcyB0aGVcbiAgICByZW1haW5kZXIgb2YgdGhlIG1lc3NhZ2Ugb250byB0aGUgc3RhbmRhcmQgcHJvY2Vzc2luZyBjaGFpbi4gIElmIG5vdCxcbiAgICBkaXNjYXJkIHRoZSBtZXNzYWdlLlxuXG4gIC0gSXMgdGhlIG1lc3NhZ2UgYSBjb21tYW5kIG1lc3NhZ2UgKHByZWZpeGVkIHdpdGggYSBmb3J3YXJkIHNsYXNoKS4gSWYgc28sXG4gICAgbG9vayBmb3IgYW4gYXBwcm9wcmlhdGUgbWVzc2FnZSBoYW5kbGVyIGFuZCBwYXNzIHRoZSBtZXNzYWdlIHBheWxvYWQgb25cbiAgICB0byBpdC5cblxuICAtIEZpbmFsbHksIGRvZXMgdGhlIG1lc3NhZ2UgbWF0Y2ggYW55IHBhdHRlcm5zIHRoYXQgd2UgYXJlIGxpc3RlbmluZyBmb3I/XG4gICAgSWYgc28sIHRoZW4gcGFzcyB0aGUgZW50aXJlIG1lc3NhZ2UgY29udGVudHMgb250byB0aGUgcmVnaXN0ZXJlZCBoYW5kbGVyLlxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNpZ25hbGxlcikge1xuICB2YXIgaWQgPSBzaWduYWxsZXIuaWQ7XG4gIHZhciBoYW5kbGVycyA9IHJlcXVpcmUoJy4vaGFuZGxlcnMnKShzaWduYWxsZXIpO1xuXG4gIGZ1bmN0aW9uIHNlbmRFdmVudChwYXJ0cywgc3JjU3RhdGUsIGRhdGEpIHtcbiAgICAvLyBpbml0aWFsaXNlIHRoZSBldmVudCBuYW1lXG4gICAgdmFyIGV2dE5hbWUgPSBwYXJ0c1swXS5zbGljZSgxKTtcblxuICAgIC8vIGNvbnZlcnQgYW55IHZhbGlkIGpzb24gb2JqZWN0cyB0byBqc29uXG4gICAgdmFyIGFyZ3MgPSBwYXJ0cy5zbGljZSgxKS5tYXAoanNvbnBhcnNlKS5jb25jYXQoZGF0YSk7XG5cbiAgICBzaWduYWxsZXIuZW1pdC5hcHBseShzaWduYWxsZXIsIFtldnROYW1lLCBzcmNTdGF0ZV0uY29uY2F0KGFyZ3MpKTtcbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbihvcmlnaW5hbERhdGEpIHtcbiAgICB2YXIgZGF0YSA9IG9yaWdpbmFsRGF0YTtcbiAgICB2YXIgaXNNYXRjaCA9IHRydWU7XG4gICAgdmFyIHBhcnRzO1xuICAgIHZhciBoYW5kbGVyO1xuICAgIHZhciBzcmNEYXRhO1xuICAgIHZhciBzcmNTdGF0ZTtcblxuICAgIGRlYnVnKCdzaWduYWxsZXIgJyArIHNpZ25hbGxlci5pZCArICcgcmVjZWl2ZWQgZGF0YTogJyArIG9yaWdpbmFsRGF0YSk7XG5cbiAgICAvLyBwcm9jZXNzIC90byBtZXNzYWdlc1xuICAgIGlmIChkYXRhLnNsaWNlKDAsIDMpID09PSAnL3RvJykge1xuICAgICAgaXNNYXRjaCA9IGRhdGEuc2xpY2UoNCwgaWQubGVuZ3RoICsgNCkgPT09IGlkO1xuICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgcGFydHMgPSBkYXRhLnNsaWNlKDUgKyBpZC5sZW5ndGgpLnNwbGl0KCd8JykubWFwKGpzb25wYXJzZSk7XG5cbiAgICAgICAgLy8gZ2V0IHRoZSBzb3VyY2UgZGF0YVxuICAgICAgICBzcmNEYXRhID0gcGFydHNbMF07XG4gICAgICAgIHNyY1N0YXRlID0gc2lnbmFsbGVyLnBlZXJzLmdldChzcmNEYXRhICYmIHNyY0RhdGEuaWQpO1xuXG4gICAgICAgIC8vIGV4dHJhY3QgdGhlIHZlY3RvciBjbG9jayBhbmQgdXBkYXRlIHRoZSBwYXJ0c1xuICAgICAgICBwYXJ0cyA9IHBhcnRzLnNsaWNlKDEpLm1hcChqc29ucGFyc2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGlmIHRoaXMgaXMgbm90IGEgbWF0Y2gsIHRoZW4gYmFpbFxuICAgIGlmICghIGlzTWF0Y2gpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBjaG9wIHRoZSBkYXRhIGludG8gcGFydHNcbiAgICBwYXJ0cyA9IHBhcnRzIHx8IGRhdGEuc3BsaXQoJ3wnKS5tYXAoanNvbnBhcnNlKTtcblxuICAgIC8vIGlmIHdlIGhhdmUgYSBzcGVjaWZpYyBoYW5kbGVyIGZvciB0aGUgYWN0aW9uLCB0aGVuIGludm9rZVxuICAgIGlmIChwYXJ0c1swXS5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgICAgLy8gbG9vayBmb3IgYSBoYW5kbGVyIGZvciB0aGUgbWVzc2FnZSB0eXBlXG4gICAgICBoYW5kbGVyID0gaGFuZGxlcnNbcGFydHNbMF0uc2xpY2UoMSldO1xuXG4gICAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBoYW5kbGVyKFxuICAgICAgICAgIHBhcnRzLnNsaWNlKDEpLFxuICAgICAgICAgIHBhcnRzWzBdLnNsaWNlKDEpLFxuICAgICAgICAgIHNyY0RhdGEgJiYgc3JjRGF0YS5jbG9jayxcbiAgICAgICAgICBzcmNTdGF0ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHNlbmRFdmVudChwYXJ0cywgc3JjU3RhdGUsIG9yaWdpbmFsRGF0YSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gaWYgd2UgaGF2ZSBhIGNsb2NrIHZhbHVlIChhbmQgYSBzb3VyY2UgcGVlciksIHRoZW4gbWVyZ2UgdGhlIGNsb2NrXG4gICAgaWYgKHNyY0RhdGEgJiYgc3JjRGF0YS5jbG9jayAmJiBzcmNTdGF0ZSkge1xuICAgICAgc3JjU3RhdGUuY2xvY2sgPSB2Yy5tZXJnZShzcmNTdGF0ZS5jbG9jaywgc3JjRGF0YS5jbG9jayk7XG4gICAgfVxuICB9O1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuLyogZ2xvYmFsIFJUQ0ljZUNhbmRpZGF0ZTogZmFsc2UgKi9cbi8qIGdsb2JhbCBSVENTZXNzaW9uRGVzY3JpcHRpb246IGZhbHNlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKSgnY291cGxlJyk7XG52YXIgYXN5bmMgPSByZXF1aXJlKCdhc3luYycpO1xudmFyIG1vbml0b3IgPSByZXF1aXJlKCcuL21vbml0b3InKTtcbnZhciBkZXRlY3QgPSByZXF1aXJlKCcuL2RldGVjdCcpO1xuXG4vKipcbiAgIyMgcnRjL2NvdXBsZVxuXG4gICMjIyBjb3VwbGUocGMsIHRhcmdldElkLCBzaWduYWxsZXIsIG9wdHM/KVxuXG4gIENvdXBsZSBhIFdlYlJUQyBjb25uZWN0aW9uIHdpdGggYW5vdGhlciB3ZWJydGMgY29ubmVjdGlvbiBpZGVudGlmaWVkIGJ5XG4gIGB0YXJnZXRJZGAgdmlhIHRoZSBzaWduYWxsZXIuXG5cbiAgVGhlIGZvbGxvd2luZyBvcHRpb25zIGNhbiBiZSBwcm92aWRlZCBpbiB0aGUgYG9wdHNgIGFyZ3VtZW50OlxuXG4gIC0gYHNkcGZpbHRlcmAgKGRlZmF1bHQ6IG51bGwpXG5cbiAgICBBIHNpbXBsZSBmdW5jdGlvbiBmb3IgZmlsdGVyaW5nIFNEUCBhcyBwYXJ0IG9mIHRoZSBwZWVyXG4gICAgY29ubmVjdGlvbiBoYW5kc2hha2UgKHNlZSB0aGUgVXNpbmcgRmlsdGVycyBkZXRhaWxzIGJlbG93KS5cblxuICAtIGBtYXhBdHRlbXB0c2AgKGRlZmF1bHQ6IDEpXG5cbiAgICBIb3cgbWFueSB0aW1lcyBzaG91bGQgbmVnb3RpYXRpb24gYmUgYXR0ZW1wdGVkLiAgVGhpcyBpc1xuICAgICoqZXhwZXJpbWVudGFsKiogZnVuY3Rpb25hbGl0eSBmb3IgYXR0ZW1wdGluZyBjb25uZWN0aW9uIG5lZ290aWF0aW9uXG4gICAgaWYgaXQgZmFpbHMuXG5cbiAgLSBgYXR0ZW1wdERlbGF5YCAoZGVmYXVsdDogMzAwMClcblxuICAgIFRoZSBhbW91bnQgb2YgbXMgdG8gd2FpdCBiZXR3ZWVuIGNvbm5lY3Rpb24gbmVnb3RpYXRpb24gYXR0ZW1wdHMuXG5cbiAgIyMjIyBFeGFtcGxlIFVzYWdlXG5cbiAgYGBganNcbiAgdmFyIGNvdXBsZSA9IHJlcXVpcmUoJ3J0Yy9jb3VwbGUnKTtcblxuICBjb3VwbGUocGMsICc1NDg3OTk2NS1jZTQzLTQyNmUtYThlZi0wOWFjMWUzOWExNmQnLCBzaWduYWxsZXIpO1xuICBgYGBcblxuICAjIyMjIFVzaW5nIEZpbHRlcnNcblxuICBJbiBjZXJ0YWluIGluc3RhbmNlcyB5b3UgbWF5IHdpc2ggdG8gbW9kaWZ5IHRoZSByYXcgU0RQIHRoYXQgaXMgcHJvdmlkZWRcbiAgYnkgdGhlIGBjcmVhdGVPZmZlcmAgYW5kIGBjcmVhdGVBbnN3ZXJgIGNhbGxzLiAgVGhpcyBjYW4gYmUgZG9uZSBieSBwYXNzaW5nXG4gIGEgYHNkcGZpbHRlcmAgZnVuY3Rpb24gKG9yIGFycmF5KSBpbiB0aGUgb3B0aW9ucy4gIEZvciBleGFtcGxlOlxuXG4gIGBgYGpzXG4gIC8vIHJ1biB0aGUgc2RwIGZyb20gdGhyb3VnaCBhIGxvY2FsIHR3ZWFrU2RwIGZ1bmN0aW9uLlxuICBjb3VwbGUocGMsICc1NDg3OTk2NS1jZTQzLTQyNmUtYThlZi0wOWFjMWUzOWExNmQnLCBzaWduYWxsZXIsIHtcbiAgICBzZHBmaWx0ZXI6IHR3ZWFrU2RwXG4gIH0pO1xuICBgYGBcblxuKiovXG5mdW5jdGlvbiBjb3VwbGUoY29ubiwgdGFyZ2V0SWQsIHNpZ25hbGxlciwgb3B0cykge1xuICAvLyBjcmVhdGUgYSBtb25pdG9yIGZvciB0aGUgY29ubmVjdGlvblxuICB2YXIgbW9uID0gbW9uaXRvcihjb25uKTtcbiAgdmFyIGJsb2NrSWQ7XG4gIHZhciBzdGFnZXMgPSB7fTtcbiAgdmFyIGxvY2FsQ2FuZGlkYXRlcyA9IFtdO1xuICB2YXIgcXVldWVkQ2FuZGlkYXRlcyA9IFtdO1xuICB2YXIgc2RwRmlsdGVyID0gKG9wdHMgfHwge30pLnNkcGZpbHRlcjtcblxuICAvLyByZXRyeSBpbXBsZW1lbnRhdGlvblxuICB2YXIgbWF4QXR0ZW1wdHMgPSAob3B0cyB8fCB7fSkubWF4QXR0ZW1wdHMgfHwgMTtcbiAgdmFyIGF0dGVtcHREZWxheSA9IChvcHRzIHx8IHt9KS5hdHRlbXB0RGVsYXkgfHwgMzAwMDtcbiAgdmFyIGF0dGVtcHQgPSAxO1xuICB2YXIgYXR0ZW1wdFRpbWVyO1xuICB2YXIgb2ZmZXJUaW1lb3V0O1xuXG4gIC8vIGluaXRpbGFpc2UgdGhlIG5lZ290aWF0aW9uIGhlbHBlcnNcbiAgdmFyIGNyZWF0ZU9mZmVyID0gbmVnb3RpYXRlKCdjcmVhdGVPZmZlcicpO1xuICB2YXIgY3JlYXRlQW5zd2VyID0gbmVnb3RpYXRlKCdjcmVhdGVBbnN3ZXInKTtcblxuICAvLyBpbml0aWFsaXNlIHRoZSBwcm9jZXNzaW5nIHF1ZXVlIChvbmUgYXQgYSB0aW1lIHBsZWFzZSlcbiAgdmFyIHEgPSBhc3luYy5xdWV1ZShmdW5jdGlvbih0YXNrLCBjYikge1xuICAgIC8vIGlmIHRoZSB0YXNrIGhhcyBubyBvcGVyYXRpb24sIHRoZW4gdHJpZ2dlciB0aGUgY2FsbGJhY2sgaW1tZWRpYXRlbHlcbiAgICBpZiAodHlwZW9mIHRhc2sub3AgIT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIGNiKCk7XG4gICAgfVxuXG4gICAgLy8gcHJvY2VzcyB0aGUgdGFzayBvcGVyYXRpb25cbiAgICB0YXNrLm9wKHRhc2ssIGNiKTtcbiAgfSwgMSk7XG5cbiAgLy8gaW5pdGlhbGlzZSBzZXNzaW9uIGRlc2NyaXB0aW9uIGFuZCBpY2VjYW5kaWRhdGUgb2JqZWN0c1xuICB2YXIgUlRDU2Vzc2lvbkRlc2NyaXB0aW9uID0gKG9wdHMgfHwge30pLlJUQ1Nlc3Npb25EZXNjcmlwdGlvbiB8fFxuICAgIGRldGVjdCgnUlRDU2Vzc2lvbkRlc2NyaXB0aW9uJyk7XG5cbiAgdmFyIFJUQ0ljZUNhbmRpZGF0ZSA9IChvcHRzIHx8IHt9KS5SVENJY2VDYW5kaWRhdGUgfHxcbiAgICBkZXRlY3QoJ1JUQ0ljZUNhbmRpZGF0ZScpO1xuXG4gIGZ1bmN0aW9uIGFib3J0KHN0YWdlLCBzZHAsIGNiKSB7XG4gICAgdmFyIHN0YWdlSGFuZGxlciA9IHN0YWdlc1tzdGFnZV07XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oZXJyKSB7XG4gICAgICAvLyBsb2cgdGhlIGVycm9yXG4gICAgICBkZWJ1ZygnY2FwdHVyZWQgZXJyb3I6ICcsIGVycik7XG4gICAgICBxLnB1c2goeyBvcDogbG9ja1JlbGVhc2UgfSk7XG5cbiAgICAgIC8vIHJlYXR0ZW1wdCBjb3VwbGluZz9cbiAgICAgIGlmIChzdGFnZUhhbmRsZXIgJiYgYXR0ZW1wdCA8IG1heEF0dGVtcHRzICYmICghIGF0dGVtcHRUaW1lcikpIHtcbiAgICAgICAgYXR0ZW1wdFRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICBhdHRlbXB0ICs9IDE7XG4gICAgICAgICAgYXR0ZW1wdFRpbWVyID0gMDtcblxuICAgICAgICAgIGRlYnVnKCdyZWF0dGVtcHRpbmcgY29ubmVjdGlvbiAoYXR0ZW1wdDogJyArIGF0dGVtcHQgKyAnKScpO1xuICAgICAgICAgIHN0YWdlSGFuZGxlcigpO1xuICAgICAgICB9LCBhdHRlbXB0RGVsYXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGNiID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2IoZXJyKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gbmVnb3RpYXRlKG1ldGhvZE5hbWUpIHtcbiAgICB2YXIgaHNEZWJ1ZyA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKSgnaGFuZHNoYWtlLScgKyBtZXRob2ROYW1lKTtcblxuICAgIHJldHVybiBmdW5jdGlvbih0YXNrLCBjYikge1xuICAgICAgLy8gY3JlYXRlIHRoZSBvZmZlclxuICAgICAgZGVidWcoJ2NhbGxpbmcgJyArIG1ldGhvZE5hbWUpO1xuICAgICAgY29ublttZXRob2ROYW1lXShcbiAgICAgICAgZnVuY3Rpb24oZGVzYykge1xuXG4gICAgICAgICAgLy8gaWYgYSBmaWx0ZXIgaGFzIGJlZW4gc3BlY2lmaWVkLCB0aGVuIGFwcGx5IHRoZSBmaWx0ZXJcbiAgICAgICAgICBpZiAodHlwZW9mIHNkcEZpbHRlciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBkZXNjLnNkcCA9IHNkcEZpbHRlcihkZXNjLnNkcCwgY29ubiwgbWV0aG9kTmFtZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gaW5pdGlhbGlzZSB0aGUgbG9jYWwgZGVzY3JpcHRpb25cbiAgICAgICAgICBjb25uLnNldExvY2FsRGVzY3JpcHRpb24oXG4gICAgICAgICAgICBkZXNjLFxuXG4gICAgICAgICAgICAvLyBpZiBzdWNjZXNzZnVsLCB0aGVuIHNlbmQgdGhlIHNkcCBvdmVyIHRoZSB3aXJlXG4gICAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgLy8gc2VuZCB0aGUgc2RwXG4gICAgICAgICAgICAgIHNpZ25hbGxlci50byh0YXJnZXRJZCkuc2VuZCgnL3NkcCcsIGRlc2MpO1xuXG4gICAgICAgICAgICAgIC8vIGNhbGxiYWNrXG4gICAgICAgICAgICAgIGNiKCk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvLyBvbiBlcnJvciwgYWJvcnRcbiAgICAgICAgICAgIGFib3J0KG1ldGhvZE5hbWUsIGRlc2Muc2RwLCBjYilcbiAgICAgICAgICApO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIG9uIGVycm9yLCBhYm9ydFxuICAgICAgICBhYm9ydChtZXRob2ROYW1lLCAnJywgY2IpXG4gICAgICApO1xuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVMb2NhbENhbmRpZGF0ZShldnQpIHtcbiAgICBpZiAoZXZ0LmNhbmRpZGF0ZSkge1xuICAgICAgbG9jYWxDYW5kaWRhdGVzLnB1c2goZXZ0LmNhbmRpZGF0ZSk7XG4gICAgfVxuXG4gICAgaWYgKGNvbm4uaWNlR2F0aGVyaW5nU3RhdGUgPT09ICdjb21wbGV0ZScpIHtcbiAgICAgIGRlYnVnKCdpY2UgZ2F0aGVyaW5nIHN0YXRlIGNvbXBsZXRlLCBzZW5kaW5nIGNhbmRpZGF0ZXMnKVxuICAgICAgc2lnbmFsbGVyLnRvKHRhcmdldElkKS5zZW5kKCcvY2FuZGlkYXRlcycsIGxvY2FsQ2FuZGlkYXRlcy5zcGxpY2UoMCkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZVJlbW90ZUNhbmRpZGF0ZSh0YXJnZXRJZCwgZGF0YSkge1xuICAgIGlmICghIGNvbm4ucmVtb3RlRGVzY3JpcHRpb24pIHtcbiAgICAgIHJldHVybiBxdWV1ZWRDYW5kaWRhdGVzLnB1c2goZGF0YSk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbm4uYWRkSWNlQ2FuZGlkYXRlKG5ldyBSVENJY2VDYW5kaWRhdGUoZGF0YSkpO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgZGVidWcoJ2ludmFsaWRhdGUgY2FuZGlkYXRlIHNwZWNpZmllZDogJywgZGF0YSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlUmVtb3RlQ2FuZGlkYXRlQXJyYXkoc3JjLCBkYXRhKSB7XG4gICAgaWYgKCghIHNyYykgfHwgKHNyYy5pZCAhPT0gdGFyZ2V0SWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZGF0YS5mb3JFYWNoKGZ1bmN0aW9uKGNhbmRpZGF0ZSkge1xuICAgICAgaGFuZGxlUmVtb3RlQ2FuZGlkYXRlKHRhcmdldElkLCBjYW5kaWRhdGUpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlU2RwKHNyYywgZGF0YSkge1xuICAgIC8vIGlmIHRoZSBzb3VyY2UgaXMgdW5rbm93biBvciBub3QgYSBtYXRjaCwgdGhlbiBhYm9ydFxuICAgIGlmICgoISBzcmMpIHx8IChzcmMuaWQgIT09IHRhcmdldElkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIHByaW9yaXRpemUgc2V0dGluZyB0aGUgcmVtb3RlIGRlc2NyaXB0aW9uIG9wZXJhdGlvblxuICAgIHEucHVzaCh7IG9wOiBmdW5jdGlvbih0YXNrLCBjYikge1xuICAgICAgLy8gdXBkYXRlIHRoZSByZW1vdGUgZGVzY3JpcHRpb25cbiAgICAgIC8vIG9uY2Ugc3VjY2Vzc2Z1bCwgc2VuZCB0aGUgYW5zd2VyXG4gICAgICBjb25uLnNldFJlbW90ZURlc2NyaXB0aW9uKFxuICAgICAgICBuZXcgUlRDU2Vzc2lvbkRlc2NyaXB0aW9uKGRhdGEpLFxuXG4gICAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIC8vIGFwcGx5IGFueSBxdWV1ZWQgY2FuZGlkYXRlc1xuICAgICAgICAgIHF1ZXVlZENhbmRpZGF0ZXMuc3BsaWNlKDApLmZvckVhY2goZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgZGVidWcoJ2FwcGx5aW5nIHF1ZXVlZCBjYW5kaWRhdGUnKTtcbiAgICAgICAgICAgIGNvbm4uYWRkSWNlQ2FuZGlkYXRlKG5ldyBSVENJY2VDYW5kaWRhdGUoZGF0YSkpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gY3JlYXRlIHRoZSBhbnN3ZXJcbiAgICAgICAgICBpZiAoZGF0YS50eXBlID09PSAnb2ZmZXInKSB7XG4gICAgICAgICAgICBxdWV1ZShjcmVhdGVBbnN3ZXIpKCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gdHJpZ2dlciB0aGUgY2FsbGJhY2tcbiAgICAgICAgICBjYigpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFib3J0KGRhdGEudHlwZSA9PT0gJ29mZmVyJyA/ICdjcmVhdGVBbnN3ZXInIDogJ2NyZWF0ZU9mZmVyJywgZGF0YS5zZHAsIGNiKVxuICAgICAgKTtcbiAgICB9fSk7XG4gIH1cblxuICBmdW5jdGlvbiBsb2NrQWNxdWlyZSh0YXNrLCBjYikge1xuICAgIGRlYnVnKCdhdHRlbXB0aW5nIHRvIGFjcXVpcmUgbmVnb3RpYXRlIGxvY2sgd2l0aCB0YXJnZXQ6ICcgKyB0YXJnZXRJZCk7XG4gICAgc2lnbmFsbGVyLmxvY2sodGFyZ2V0SWQsIHsgbGFiZWw6ICduZWdvdGlhdGUnIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBkZWJ1ZygnZXJyb3IgZ2V0dGluZyBsb2NrLCByZXNldHRpbmcgcXVldWUnKTtcbiAgICAgICAgcXVldWVSZXNldCgpO1xuICAgICAgfVxuXG4gICAgICBjYihlcnIpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gbG9ja1JlbGVhc2UodGFzaywgY2IpIHtcbiAgICBzaWduYWxsZXIudW5sb2NrKHRhcmdldElkLCB7IGxhYmVsOiAnbmVnb3RpYXRlJyB9LCBjYik7XG4gIH1cblxuICBmdW5jdGlvbiBxdWV1ZShuZWdvdGlhdGVUYXNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcS5wdXNoKFtcbiAgICAgICAgeyBvcDogbG9ja0FjcXVpcmUgfSxcbiAgICAgICAgeyBvcDogbmVnb3RpYXRlVGFzayB9LFxuICAgICAgICB7IG9wOiBsb2NrUmVsZWFzZSB9XG4gICAgICBdKTtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gcXVldWVSZXNldCgpIHtcbiAgICBxLnRhc2tzLnNwbGljZSgwKTtcbiAgfVxuXG4gIC8vIGlmIHRoZSB0YXJnZXQgaWQgaXMgbm90IGEgc3RyaW5nLCB0aGVuIGNvbXBsYWluXG4gIGlmICh0eXBlb2YgdGFyZ2V0SWQgIT0gJ3N0cmluZycgJiYgKCEgKHRhcmdldElkIGluc3RhbmNlb2YgU3RyaW5nKSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJzJuZCBhcmd1bWVudCAodGFyZ2V0SWQpIHNob3VsZCBiZSBhIHN0cmluZycpO1xuICB9XG5cbiAgLy8gd2hlbiByZWdvdGlhdGlvbiBpcyBuZWVkZWQgbG9vayBmb3IgdGhlIHBlZXJcbiAgY29ubi5hZGRFdmVudExpc3RlbmVyKCduZWdvdGlhdGlvbm5lZWRlZCcsIGZ1bmN0aW9uKCkge1xuICAgIGRlYnVnKCdyZW5lZ290aWF0aW9uIHJlcXVpcmVkLCB3aWxsIGNyZWF0ZSBvZmZlciBpbiA1MG1zJyk7XG4gICAgY2xlYXJUaW1lb3V0KG9mZmVyVGltZW91dCk7XG4gICAgb2ZmZXJUaW1lb3V0ID0gc2V0VGltZW91dChxdWV1ZShjcmVhdGVPZmZlciksIDUwKTtcbiAgfSk7XG5cbiAgY29ubi5hZGRFdmVudExpc3RlbmVyKCdpY2VjYW5kaWRhdGUnLCBoYW5kbGVMb2NhbENhbmRpZGF0ZSk7XG5cbiAgLy8gd2hlbiB3ZSByZWNlaXZlIHNkcCwgdGhlblxuICBzaWduYWxsZXIub24oJ3NkcCcsIGhhbmRsZVNkcCk7XG4gIHNpZ25hbGxlci5vbignY2FuZGlkYXRlJywgaGFuZGxlUmVtb3RlQ2FuZGlkYXRlKTtcbiAgc2lnbmFsbGVyLm9uKCdjYW5kaWRhdGVzJywgaGFuZGxlUmVtb3RlQ2FuZGlkYXRlQXJyYXkpO1xuXG4gIC8vIHdoZW4gdGhlIGNvbm5lY3Rpb24gY2xvc2VzLCByZW1vdmUgZXZlbnQgaGFuZGxlcnNcbiAgbW9uLm9uY2UoJ2Nsb3NlZCcsIGZ1bmN0aW9uKCkge1xuICAgIGRlYnVnKCdjbG9zZWQnKTtcblxuICAgIC8vIHJlbW92ZSBsaXN0ZW5lcnNcbiAgICBzaWduYWxsZXIucmVtb3ZlTGlzdGVuZXIoJ3NkcCcsIGhhbmRsZVNkcCk7XG4gICAgc2lnbmFsbGVyLnJlbW92ZUxpc3RlbmVyKCdjYW5kaWRhdGUnLCBoYW5kbGVSZW1vdGVDYW5kaWRhdGUpO1xuICB9KTtcblxuICAvLyBwYXRjaCBpbiB0aGUgY3JlYXRlIG9mZmVyIGZ1bmN0aW9uc1xuICBtb24uY3JlYXRlT2ZmZXIgPSBxdWV1ZShjcmVhdGVPZmZlcik7XG5cbiAgcmV0dXJuIG1vbjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjb3VwbGU7IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gICMjIHJ0Yy9kZXRlY3RcblxuICBQcm92aWRlIHRoZSBbcnRjLWNvcmUvZGV0ZWN0XShodHRwczovL2dpdGh1Yi5jb20vcnRjLWlvL3J0Yy1jb3JlI2RldGVjdCkgXG4gIGZ1bmN0aW9uYWxpdHkuXG4qKi9cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgncnRjLWNvcmUvZGV0ZWN0Jyk7IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGRlYnVnID0gcmVxdWlyZSgnY29nL2xvZ2dlcicpKCdnZW5lcmF0b3JzJyk7XG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgnLi9kZXRlY3QnKTtcbnZhciBkZWZhdWx0cyA9IHJlcXVpcmUoJ2NvZy9kZWZhdWx0cycpO1xuXG52YXIgbWFwcGluZ3MgPSB7XG4gIGNyZWF0ZToge1xuICAgIC8vIGRhdGEgZW5hYmxlclxuICAgIGRhdGE6IGZ1bmN0aW9uKGMpIHtcbiAgICAgIGlmICghIGRldGVjdC5tb3opIHtcbiAgICAgICAgYy5vcHRpb25hbCA9IChjLm9wdGlvbmFsIHx8IFtdKS5jb25jYXQoeyBSdHBEYXRhQ2hhbm5lbHM6IHRydWUgfSk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGR0bHM6IGZ1bmN0aW9uKGMpIHtcbiAgICAgIGlmICghIGRldGVjdC5tb3opIHtcbiAgICAgICAgYy5vcHRpb25hbCA9IChjLm9wdGlvbmFsIHx8IFtdKS5jb25jYXQoeyBEdGxzU3J0cEtleUFncmVlbWVudDogdHJ1ZSB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIGluaXRpYWxpc2Uga25vd24gZmxhZ3NcbnZhciBrbm93bkZsYWdzID0gWyd2aWRlbycsICdhdWRpbycsICdkYXRhJ107XG5cbi8qKlxuICAjIyBydGMvZ2VuZXJhdG9yc1xuXG4gIFRoZSBnZW5lcmF0b3JzIHBhY2thZ2UgcHJvdmlkZXMgc29tZSB1dGlsaXR5IG1ldGhvZHMgZm9yIGdlbmVyYXRpbmdcbiAgY29uc3RyYWludCBvYmplY3RzIGFuZCBzaW1pbGFyIGNvbnN0cnVjdHMuXG5cbiAgYGBganNcbiAgdmFyIGdlbmVyYXRvcnMgPSByZXF1aXJlKCdydGMvZ2VuZXJhdG9ycycpO1xuICBgYGBcblxuKiovXG5cbi8qKlxuICAjIyMgZ2VuZXJhdG9ycy5jb25maWcoY29uZmlnKVxuXG4gIEdlbmVyYXRlIGEgY29uZmlndXJhdGlvbiBvYmplY3Qgc3VpdGFibGUgZm9yIHBhc3NpbmcgaW50byBhbiBXM0NcbiAgUlRDUGVlckNvbm5lY3Rpb24gY29uc3RydWN0b3IgZmlyc3QgYXJndW1lbnQsIGJhc2VkIG9uIG91ciBjdXN0b20gY29uZmlnLlxuKiovXG5leHBvcnRzLmNvbmZpZyA9IGZ1bmN0aW9uKGNvbmZpZykge1xuICByZXR1cm4gZGVmYXVsdHMoY29uZmlnLCB7XG4gICAgaWNlU2VydmVyczogW11cbiAgfSk7XG59O1xuXG4vKipcbiAgIyMjIGdlbmVyYXRvcnMuY29ubmVjdGlvbkNvbnN0cmFpbnRzKGZsYWdzLCBjb25zdHJhaW50cylcblxuICBUaGlzIGlzIGEgaGVscGVyIGZ1bmN0aW9uIHRoYXQgd2lsbCBnZW5lcmF0ZSBhcHByb3ByaWF0ZSBjb25uZWN0aW9uXG4gIGNvbnN0cmFpbnRzIGZvciBhIG5ldyBgUlRDUGVlckNvbm5lY3Rpb25gIG9iamVjdCB3aGljaCBpcyBjb25zdHJ1Y3RlZFxuICBpbiB0aGUgZm9sbG93aW5nIHdheTpcblxuICBgYGBqc1xuICB2YXIgY29ubiA9IG5ldyBSVENQZWVyQ29ubmVjdGlvbihmbGFncywgY29uc3RyYWludHMpO1xuICBgYGBcblxuICBJbiBtb3N0IGNhc2VzIHRoZSBjb25zdHJhaW50cyBvYmplY3QgY2FuIGJlIGxlZnQgZW1wdHksIGJ1dCB3aGVuIGNyZWF0aW5nXG4gIGRhdGEgY2hhbm5lbHMgc29tZSBhZGRpdGlvbmFsIG9wdGlvbnMgYXJlIHJlcXVpcmVkLiAgVGhpcyBmdW5jdGlvblxuICBjYW4gZ2VuZXJhdGUgdGhvc2UgYWRkaXRpb25hbCBvcHRpb25zIGFuZCBpbnRlbGxpZ2VudGx5IGNvbWJpbmUgYW55XG4gIHVzZXIgZGVmaW5lZCBjb25zdHJhaW50cyAoaW4gYGNvbnN0cmFpbnRzYCkgd2l0aCBzaG9ydGhhbmQgZmxhZ3MgdGhhdFxuICBtaWdodCBiZSBwYXNzZWQgd2hpbGUgdXNpbmcgdGhlIGBydGMuY3JlYXRlQ29ubmVjdGlvbmAgaGVscGVyLlxuKiovXG5leHBvcnRzLmNvbm5lY3Rpb25Db25zdHJhaW50cyA9IGZ1bmN0aW9uKGZsYWdzLCBjb25zdHJhaW50cykge1xuICB2YXIgZ2VuZXJhdGVkID0ge307XG4gIHZhciBtID0gbWFwcGluZ3MuY3JlYXRlO1xuICB2YXIgb3V0O1xuXG4gIC8vIGl0ZXJhdGUgdGhyb3VnaCB0aGUgZmxhZ3MgYW5kIGFwcGx5IHRoZSBjcmVhdGUgbWFwcGluZ3NcbiAgT2JqZWN0LmtleXMoZmxhZ3MgfHwge30pLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYgKG1ba2V5XSkge1xuICAgICAgbVtrZXldKGdlbmVyYXRlZCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBnZW5lcmF0ZSB0aGUgY29ubmVjdGlvbiBjb25zdHJhaW50c1xuICBvdXQgPSBkZWZhdWx0cyh7fSwgY29uc3RyYWludHMsIGdlbmVyYXRlZCk7XG4gIGRlYnVnKCdnZW5lcmF0ZWQgY29ubmVjdGlvbiBjb25zdHJhaW50czogJywgb3V0KTtcblxuICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gICMjIyBwYXJzZUZsYWdzKG9wdHMpXG5cbiAgVGhpcyBpcyBhIGhlbHBlciBmdW5jdGlvbiB0aGF0IHdpbGwgZXh0cmFjdCBrbm93biBmbGFncyBmcm9tIGEgZ2VuZXJpY1xuICBvcHRpb25zIG9iamVjdC5cbioqL1xudmFyIHBhcnNlRmxhZ3MgPSBleHBvcnRzLnBhcnNlRmxhZ3MgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gIC8vIGVuc3VyZSB3ZSBoYXZlIG9wdHNcbiAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIC8vIGRlZmF1bHQgdmlkZW8gYW5kIGF1ZGlvIGZsYWdzIHRvIHRydWUgaWYgdW5kZWZpbmVkXG4gIG9wdHMudmlkZW8gPSBvcHRzLnZpZGVvIHx8IHR5cGVvZiBvcHRzLnZpZGVvID09ICd1bmRlZmluZWQnO1xuICBvcHRzLmF1ZGlvID0gb3B0cy5hdWRpbyB8fCB0eXBlb2Ygb3B0cy5hdWRpbyA9PSAndW5kZWZpbmVkJztcblxuICByZXR1cm4gT2JqZWN0LmtleXMob3B0cyB8fCB7fSlcbiAgICAuZmlsdGVyKGZ1bmN0aW9uKGZsYWcpIHtcbiAgICAgIHJldHVybiBvcHRzW2ZsYWddO1xuICAgIH0pXG4gICAgLm1hcChmdW5jdGlvbihmbGFnKSB7XG4gICAgICByZXR1cm4gZmxhZy50b0xvd2VyQ2FzZSgpO1xuICAgIH0pXG4gICAgLmZpbHRlcihmdW5jdGlvbihmbGFnKSB7XG4gICAgICByZXR1cm4ga25vd25GbGFncy5pbmRleE9mKGZsYWcpID49IDA7XG4gICAgfSk7XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG5cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gICMgcnRjXG5cbiAgVGhlIGBydGNgIHBhY2thZ2UgaXMgYSBjb252ZW5pZW5jZSBsYXllciBmb3Igd29ya2luZyB3aXRoIHRoZSBydGMuaW8gdG9vbGtpdC5cbiAgQ29uc2lkZXIgaXQgYSBib3hlZCBzZXQgb2YgbGVnbyBvZiB0aGUgbW9zdCBjb21tb24gcGllY2VzIHJlcXVpcmVkIHRvIGJ1aWxkXG4gIHRoZSBmcm9udC1lbmQgY29tcG9uZW50IG9mIGEgV2ViUlRDIGFwcGxpY2F0aW9uLlxuXG4gICMjIEdldHRpbmcgU3RhcnRlZFxuXG4gIFRPIEJFIENPTVBMRVRFRC5cblxuKiovXG5cbnZhciBnZW4gPSByZXF1aXJlKCcuL2dlbmVyYXRvcnMnKTtcblxuLy8gZXhwb3J0IGRldGVjdFxudmFyIGRldGVjdCA9IGV4cG9ydHMuZGV0ZWN0ID0gcmVxdWlyZSgnLi9kZXRlY3QnKTtcblxuLy8gZXhwb3J0IGNvZyBsb2dnZXIgZm9yIGNvbnZlbmllbmNlXG5leHBvcnRzLmxvZ2dlciA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKTtcblxuLy8gZXhwb3J0IHBlZXIgY29ubmVjdGlvblxudmFyIFJUQ1BlZXJDb25uZWN0aW9uID1cbmV4cG9ydHMuUlRDUGVlckNvbm5lY3Rpb24gPSBkZXRlY3QoJ1JUQ1BlZXJDb25uZWN0aW9uJyk7XG5cbi8vIGFkZCB0aGUgY291cGxlIHV0aWxpdHlcbmV4cG9ydHMuY291cGxlID0gcmVxdWlyZSgnLi9jb3VwbGUnKTtcblxuLyoqXG4gICMjIEZhY3Rvcmllc1xuKiovXG5cbi8qKlxuICAjIyMgY3JlYXRlQ29ubmVjdGlvbihvcHRzPywgY29uc3RyYWludHM/KVxuXG4gIENyZWF0ZSBhIG5ldyBgUlRDUGVlckNvbm5lY3Rpb25gIGF1dG8gZ2VuZXJhdGluZyBkZWZhdWx0IG9wdHMgYXMgcmVxdWlyZWQuXG5cbiAgYGBganNcbiAgdmFyIGNvbm47XG5cbiAgLy8gdGhpcyBpcyBva1xuICBjb25uID0gcnRjLmNyZWF0ZUNvbm5lY3Rpb24oKTtcblxuICAvLyBhbmQgc28gaXMgdGhpc1xuICBjb25uID0gcnRjLmNyZWF0ZUNvbm5lY3Rpb24oe1xuICAgIGljZVNlcnZlcnM6IFtdXG4gIH0pO1xuICBgYGBcbioqL1xuZXhwb3J0cy5jcmVhdGVDb25uZWN0aW9uID0gZnVuY3Rpb24ob3B0cywgY29uc3RyYWludHMpIHtcbiAgcmV0dXJuIG5ldyBSVENQZWVyQ29ubmVjdGlvbihcbiAgICAvLyBnZW5lcmF0ZSB0aGUgY29uZmlnIGJhc2VkIG9uIG9wdGlvbnMgcHJvdmlkZWRcbiAgICBnZW4uY29uZmlnKG9wdHMpLFxuXG4gICAgLy8gZ2VuZXJhdGUgYXBwcm9wcmlhdGUgY29ubmVjdGlvbiBjb25zdHJhaW50c1xuICAgIGdlbi5jb25uZWN0aW9uQ29uc3RyYWludHMob3B0cywgY29uc3RyYWludHMpXG4gICk7XG59OyIsInZhciBwcm9jZXNzPXJlcXVpcmUoXCJfX2Jyb3dzZXJpZnlfcHJvY2Vzc1wiKTsvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZGVidWcgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJykoJ21vbml0b3InKTtcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgVzNDX1NUQVRFUyA9IHtcbiAgTkVXOiAnbmV3JyxcbiAgTE9DQUxfT0ZGRVI6ICdoYXZlLWxvY2FsLW9mZmVyJyxcbiAgTE9DQUxfUFJBTlNXRVI6ICdoYXZlLWxvY2FsLXByYW5zd2VyJyxcbiAgUkVNT1RFX1BSQU5TV0VSOiAnaGF2ZS1yZW1vdGUtcHJhbnN3ZXInLFxuICBBQ1RJVkU6ICdhY3RpdmUnLFxuICBDTE9TRUQ6ICdjbG9zZWQnXG59O1xuXG4vKipcbiAgIyMgcnRjL21vbml0b3JcblxuICBJbiBtb3N0IGN1cnJlbnQgaW1wbGVtZW50YXRpb25zIG9mIGBSVENQZWVyQ29ubmVjdGlvbmAgaXQgaXMgcXVpdGVcbiAgZGlmZmljdWx0IHRvIGRldGVybWluZSB3aGV0aGVyIGEgcGVlciBjb25uZWN0aW9uIGlzIGFjdGl2ZSBhbmQgcmVhZHlcbiAgZm9yIHVzZSBvciBub3QuICBUaGUgbW9uaXRvciBwcm92aWRlcyBzb21lIGFzc2lzdGFuY2UgaGVyZSBieSBwcm92aWRpbmdcbiAgYSBzaW1wbGUgZnVuY3Rpb24gdGhhdCBwcm92aWRlcyBhbiBgRXZlbnRFbWl0dGVyYCB3aGljaCBnaXZlcyB1cGRhdGVzXG4gIG9uIGEgY29ubmVjdGlvbnMgc3RhdGUuXG5cbiAgIyMjIG1vbml0b3IocGMpIC0+IEV2ZW50RW1pdHRlclxuXG4gIGBgYGpzXG4gIHZhciBtb25pdG9yID0gcmVxdWlyZSgncnRjL21vbml0b3InKTtcbiAgdmFyIHBjID0gbmV3IFJUQ1BlZXJDb25uZWN0aW9uKGNvbmZpZyk7XG5cbiAgLy8gd2F0Y2ggcGMgYW5kIHdoZW4gYWN0aXZlIGRvIHNvbWV0aGluZ1xuICBtb25pdG9yKHBjKS5vbmNlKCdhY3RpdmUnLCBmdW5jdGlvbigpIHtcbiAgICAvLyBhY3RpdmUgYW5kIHJlYWR5IHRvIGdvXG4gIH0pO1xuICBgYGBcblxuICBFdmVudHMgcHJvdmlkZWQgYnkgdGhlIG1vbml0b3IgYXJlIGFzIGZvbGxvd3M6XG5cbiAgLSBgYWN0aXZlYDogdHJpZ2dlcmVkIHdoZW4gdGhlIGNvbm5lY3Rpb24gaXMgYWN0aXZlIGFuZCByZWFkeSBmb3IgdXNlXG4gIC0gYHN0YWJsZWA6IHRyaWdnZXJlZCB3aGVuIHRoZSBjb25uZWN0aW9uIGlzIGluIGEgc3RhYmxlIHNpZ25hbGxpbmcgc3RhdGVcbiAgLSBgdW5zdGFibGVgOiB0cmlnZ2VyIHdoZW4gdGhlIGNvbm5lY3Rpb24gaXMgcmVuZWdvdGlhdGluZy5cblxuICBJdCBzaG91bGQgYmUgbm90ZWQsIHRoYXQgdGhlIG1vbml0b3IgZG9lcyBhIGNoZWNrIHdoZW4gaXQgaXMgZmlyc3QgcGFzc2VkXG4gIGFuIGBSVENQZWVyQ29ubmVjdGlvbmAgb2JqZWN0IHRvIHNlZSBpZiB0aGUgYGFjdGl2ZWAgc3RhdGUgcGFzc2VzIGNoZWNrcy5cbiAgSWYgc28sIHRoZSBgYWN0aXZlYCBldmVudCB3aWxsIGJlIGZpcmVkIGluIHRoZSBuZXh0IHRpY2suXG5cbiAgSWYgeW91IHJlcXVpcmUgYSBzeW5jaHJvbm91cyBjaGVjayBvZiBhIGNvbm5lY3Rpb24ncyBcIm9wZW5uZXNzXCIgdGhlblxuICB1c2UgdGhlIGBtb25pdG9yLmlzQWN0aXZlYCB0ZXN0IG91dGxpbmVkIGJlbG93LlxuKiovXG52YXIgbW9uaXRvciA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocGMsIHRhZykge1xuICAvLyBjcmVhdGUgYSBuZXcgZXZlbnQgZW1pdHRlciB3aGljaCB3aWxsIGNvbW11bmljYXRlIGV2ZW50c1xuICB2YXIgbW9uID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuICB2YXIgY3VycmVudFN0YXRlID0gZ2V0U3RhdGUocGMpO1xuICB2YXIgaXNBY3RpdmUgPSBtb24uYWN0aXZlID0gY3VycmVudFN0YXRlID09PSBXM0NfU1RBVEVTLkFDVElWRTtcblxuICBmdW5jdGlvbiBjaGVja1N0YXRlKCkge1xuICAgIHZhciBuZXdTdGF0ZSA9IGdldFN0YXRlKHBjLCB0YWcpO1xuICAgIGRlYnVnKCdjYXB0dXJlZCBzdGF0ZSBjaGFuZ2UsIG5ldyBzdGF0ZTogJyArIG5ld1N0YXRlICtcbiAgICAgICcsIGN1cnJlbnQgc3RhdGU6ICcgKyBjdXJyZW50U3RhdGUpO1xuXG4gICAgLy8gdXBkYXRlIHRoZSBtb25pdG9yIGFjdGl2ZSBmbGFnXG4gICAgbW9uLmFjdGl2ZSA9IG5ld1N0YXRlID09PSBXM0NfU1RBVEVTLkFDVElWRTtcblxuICAgIC8vIGlmIHdlIGhhdmUgYSBzdGF0ZSBjaGFuZ2UsIGVtaXQgYW4gZXZlbnQgZm9yIHRoZSBuZXcgc3RhdGVcbiAgICBpZiAobmV3U3RhdGUgIT09IGN1cnJlbnRTdGF0ZSkge1xuICAgICAgbW9uLmVtaXQoY3VycmVudFN0YXRlID0gbmV3U3RhdGUpO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBjdXJyZW50IHN0YXRlIGlzIGFjdGl2ZSwgdHJpZ2dlciB0aGUgYWN0aXZlIGV2ZW50XG4gIGlmIChpc0FjdGl2ZSkge1xuICAgIHByb2Nlc3MubmV4dFRpY2sobW9uLmVtaXQuYmluZChtb24sIFczQ19TVEFURVMuQUNUSVZFLCBwYykpO1xuICB9XG5cbiAgLy8gc3RhcnQgd2F0Y2hpbmcgc3R1ZmYgb24gdGhlIHBjXG4gIHBjLmFkZEV2ZW50TGlzdGVuZXIoJ3NpZ25hbGluZ3N0YXRlY2hhbmdlJywgY2hlY2tTdGF0ZSk7XG4gIHBjLmFkZEV2ZW50TGlzdGVuZXIoJ2ljZWNvbm5lY3Rpb25zdGF0ZWNoYW5nZScsIGNoZWNrU3RhdGUpO1xuXG4gIC8vIHBhdGNoIGluIGEgc3RvcCBtZXRob2QgaW50byB0aGUgZW1pdHRlclxuICBtb24uc3RvcCA9IGZ1bmN0aW9uKCkge1xuICAgIHBjLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3NpZ25hbGluZ3N0YXRlY2hhbmdlJywgY2hlY2tTdGF0ZSk7XG4gICAgcGMucmVtb3ZlRXZlbnRMaXN0ZW5lcignaWNlY29ubmVjdGlvbnN0YXRlY2hhbmdlJywgY2hlY2tTdGF0ZSk7XG4gIH07XG5cbiAgcmV0dXJuIG1vbjtcbn07XG5cbi8qKlxuICAjIyMgbW9uaXRvci5nZXRTdGF0ZShwYylcblxuICBQcm92aWRlcyBhIHVuaWZpZWQgc3RhdGUgZGVmaW5pdGlvbiBmb3IgdGhlIFJUQ1BlZXJDb25uZWN0aW9uIGJhc2VkXG4gIG9uIGEgZmV3IGNoZWNrcy5cblxuICBJbiBlbWVyZ2luZyB2ZXJzaW9ucyBvZiB0aGUgc3BlYyB3ZSBoYXZlIHZhcmlvdXMgcHJvcGVydGllcyBzdWNoIGFzXG4gIGByZWFkeVN0YXRlYCB0aGF0IHByb3ZpZGUgYSBkZWZpbml0aXZlIGFuc3dlciBvbiB0aGUgc3RhdGUgb2YgdGhlIFxuICBjb25uZWN0aW9uLiAgSW4gb2xkZXIgdmVyc2lvbnMgd2UgbmVlZCB0byBsb29rIGF0IHRoaW5ncyBsaWtlXG4gIGBzaWduYWxpbmdTdGF0ZWAgYW5kIGBpY2VHYXRoZXJpbmdTdGF0ZWAgdG8gbWFrZSBhbiBlZHVjYXRlZCBndWVzcyBcbiAgYXMgdG8gdGhlIGNvbm5lY3Rpb24gc3RhdGUuXG4qKi9cbnZhciBnZXRTdGF0ZSA9IG1vbml0b3IuZ2V0U3RhdGUgPSBmdW5jdGlvbihwYywgdGFnKSB7XG4gIHZhciBzaWduYWxpbmdTdGF0ZSA9IHBjICYmIHBjLnNpZ25hbGluZ1N0YXRlO1xuICB2YXIgaWNlR2F0aGVyaW5nU3RhdGUgPSBwYyAmJiBwYy5pY2VHYXRoZXJpbmdTdGF0ZTtcbiAgdmFyIGljZUNvbm5lY3Rpb25TdGF0ZSA9IHBjICYmIHBjLmljZUNvbm5lY3Rpb25TdGF0ZTtcbiAgdmFyIGxvY2FsRGVzYztcbiAgdmFyIHJlbW90ZURlc2M7XG4gIHZhciBzdGF0ZTtcbiAgdmFyIGlzQWN0aXZlO1xuXG4gIC8vIGlmIG5vIGNvbm5lY3Rpb24gcmV0dXJuIGNsb3NlZFxuICBpZiAoISBwYykge1xuICAgIHJldHVybiBXM0NfU1RBVEVTLkNMT1NFRDtcbiAgfVxuXG4gIC8vIGluaXRpYWxpc2UgdGhlIHRhZyB0byBhbiBlbXB0eSBzdHJpbmcgaWYgbm90IHByb3ZpZGVkXG4gIHRhZyA9IHRhZyB8fCAnJztcblxuICAvLyBnZXQgdGhlIGNvbm5lY3Rpb24gbG9jYWwgYW5kIHJlbW90ZSBkZXNjcmlwdGlvblxuICBsb2NhbERlc2MgPSBwYy5sb2NhbERlc2NyaXB0aW9uO1xuICByZW1vdGVEZXNjID0gcGMucmVtb3RlRGVzY3JpcHRpb247XG5cbiAgLy8gdXNlIHRoZSBzaWduYWxsaW5nIHN0YXRlXG4gIHN0YXRlID0gc2lnbmFsaW5nU3RhdGU7XG5cbiAgLy8gaWYgc3RhdGUgPT0gJ3N0YWJsZScgdGhlbiBpbnZlc3RpZ2F0ZVxuICBpZiAoc3RhdGUgPT09ICdzdGFibGUnKSB7XG4gICAgLy8gaW5pdGlhbGlzZSB0aGUgc3RhdGUgdG8gbmV3XG4gICAgc3RhdGUgPSBXM0NfU1RBVEVTLk5FVztcblxuICAgIC8vIGlmIHdlIGhhdmUgYSBsb2NhbCBkZXNjcmlwdGlvbiBhbmQgcmVtb3RlIGRlc2NyaXB0aW9uIGZsYWdcbiAgICAvLyBhcyBwcmFuc3dlcmVkXG4gICAgaWYgKGxvY2FsRGVzYyAmJiByZW1vdGVEZXNjKSB7XG4gICAgICBzdGF0ZSA9IFczQ19TVEFURVMuUkVNT1RFX1BSQU5TV0VSO1xuICAgIH1cbiAgfVxuXG4gIC8vIGNoZWNrIHRvIHNlZSBpZiB3ZSBhcmUgaW4gdGhlIGFjdGl2ZSBzdGF0ZVxuICBpc0FjdGl2ZSA9IChzdGF0ZSA9PT0gVzNDX1NUQVRFUy5SRU1PVEVfUFJBTlNXRVIpICYmXG4gICAgKGljZUNvbm5lY3Rpb25TdGF0ZSA9PT0gJ2Nvbm5lY3RlZCcpO1xuXG4gIGRlYnVnKHRhZyArICdzaWduYWxpbmcgc3RhdGU6ICcgKyBzaWduYWxpbmdTdGF0ZSArXG4gICAgJywgaWNlR2F0aGVyaW5nU3RhdGU6ICcgKyBpY2VHYXRoZXJpbmdTdGF0ZSArXG4gICAgJywgaWNlQ29ubmVjdGlvblN0YXRlOiAnICsgaWNlQ29ubmVjdGlvblN0YXRlKTtcbiAgXG4gIHJldHVybiBpc0FjdGl2ZSA/IFczQ19TVEFURVMuQUNUSVZFIDogc3RhdGU7XG59O1xuXG4vKipcbiAgIyMjIG1vbml0b3IuaXNBY3RpdmUocGMpIC0+IEJvb2xlYW5cblxuICBUZXN0IGFuIGBSVENQZWVyQ29ubmVjdGlvbmAgdG8gc2VlIGlmIGl0J3MgY3VycmVudGx5IG9wZW4uICBUaGUgdGVzdCBmb3JcbiAgXCJvcGVubmVzc1wiIGxvb2tzIGF0IGEgY29tYmluYXRpb24gb2YgY3VycmVudCBgc2lnbmFsaW5nU3RhdGVgIGFuZFxuICBgaWNlR2F0aGVyaW5nU3RhdGVgLlxuKiovXG5tb25pdG9yLmlzQWN0aXZlID0gZnVuY3Rpb24ocGMpIHtcbiAgdmFyIGlzU3RhYmxlID0gcGMgJiYgcGMuc2lnbmFsaW5nU3RhdGUgPT09ICdzdGFibGUnO1xuXG4gIC8vIHJldHVybiB3aXRoIHRoZSBjb25uZWN0aW9uIGlzIGFjdGl2ZVxuICByZXR1cm4gaXNTdGFibGUgJiYgZ2V0U3RhdGUocGMpID09PSBXM0NfU1RBVEVTLkFDVElWRTtcbn07IiwidmFyIHBhcnNlciA9IHJlcXVpcmUoJy4vbGliL3BhcnNlcicpO1xudmFyIHdyaXRlciA9IHJlcXVpcmUoJy4vbGliL3dyaXRlcicpO1xuXG5leHBvcnRzLndyaXRlID0gd3JpdGVyO1xuZXhwb3J0cy5wYXJzZSA9IHBhcnNlci5wYXJzZTtcbmV4cG9ydHMucGFyc2VGbXRwQ29uZmlnID0gcGFyc2VyLnBhcnNlRm10cENvbmZpZztcbmV4cG9ydHMucGFyc2VQYXlsb2FkcyA9IHBhcnNlci5wYXJzZVBheWxvYWRzO1xuZXhwb3J0cy5wYXJzZVJlbW90ZUNhbmRpZGF0ZXMgPSBwYXJzZXIucGFyc2VSZW1vdGVDYW5kaWRhdGVzO1xuIiwidmFyIGdyYW1tYXIgPSBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgdjogW3tcbiAgICAgIG5hbWU6ICd2ZXJzaW9uJyxcbiAgICAgIHJlZzogL14oXFxkKikkL1xuICB9XSxcbiAgbzogW3sgLy9vPS0gMjA1MTggMCBJTiBJUDQgMjAzLjAuMTEzLjFcbiAgICAvLyBOQjogc2Vzc2lvbklkIHdpbGwgYmUgYSBTdHJpbmcgaW4gbW9zdCBjYXNlcyBiZWNhdXNlIGl0IGlzIGh1Z2VcbiAgICBuYW1lOiAnb3JpZ2luJyxcbiAgICByZWc6IC9eKFxcUyopIChcXGQqKSAoXFxkKikgKFxcUyopIElQKFxcZCkgKC4qKS8sXG4gICAgbmFtZXM6IFsndXNlcm5hbWUnLCAnc2Vzc2lvbklkJywgJ3Nlc3Npb25WZXJzaW9uJywgJ25ldFR5cGUnLCAnaXBWZXInLCAnYWRkcmVzcyddLFxuICAgIGZvcm1hdDogXCIlcyAlcyAlZCAlcyBJUCVkICVzXCJcbiAgfV0sXG4gIC8vIGRlZmF1bHQgcGFyc2luZyBvZiB0aGVzZSBvbmx5ICh0aG91Z2ggc29tZSBvZiB0aGVzZSBmZWVsIG91dGRhdGVkKVxuICBzOiBbeyBuYW1lOiAnbmFtZScgfV0sXG4gIGk6IFt7IG5hbWU6ICdkZXNjcmlwdGlvbicgfV0sXG4gIHU6IFt7IG5hbWU6ICd1cmknIH1dLFxuICBlOiBbeyBuYW1lOiAnZW1haWwnIH1dLFxuICBwOiBbeyBuYW1lOiAncGhvbmUnIH1dLFxuICB6OiBbeyBuYW1lOiAndGltZXpvbmVzJyB9XSwgLy8gVE9ETzogdGhpcyBvbmUgY2FuIGFjdHVhbGx5IGJlIHBhcnNlZCBwcm9wZXJseS4uXG4gIHI6IFt7IG5hbWU6ICdyZXBlYXRzJyB9XSwgICAvLyBUT0RPOiB0aGlzIG9uZSBjYW4gYWxzbyBiZSBwYXJzZWQgcHJvcGVybHlcbiAgLy9rOiBbe31dLCAvLyBvdXRkYXRlZCB0aGluZyBpZ25vcmVkXG4gIHQ6IFt7IC8vdD0wIDBcbiAgICBuYW1lOiAndGltaW5nJyxcbiAgICByZWc6IC9eKFxcZCopIChcXGQqKS8sXG4gICAgbmFtZXM6IFsnc3RhcnQnLCAnc3RvcCddLFxuICAgIGZvcm1hdDogXCIlZCAlZFwiXG4gIH1dLFxuICBjOiBbeyAvL2M9SU4gSVA0IDEwLjQ3LjE5Ny4yNlxuICAgICAgbmFtZTogJ2Nvbm5lY3Rpb24nLFxuICAgICAgcmVnOiAvXklOIElQKFxcZCkgKC4qKS8sXG4gICAgICBuYW1lczogWyd2ZXJzaW9uJywgJ2lwJ10sXG4gICAgICBmb3JtYXQ6IFwiSU4gSVAlZCAlc1wiXG4gIH1dLFxuICBiOiBbeyAvL2I9QVM6NDAwMFxuICAgICAgcHVzaDogJ2JhbmR3aWR0aCcsXG4gICAgICByZWc6IC9eKFRJQVN8QVN8Q1R8UlJ8UlMpXFw6KFxcZCopLyxcbiAgICAgIG5hbWVzOiBbJ3R5cGUnLCAnbGltaXQnXSxcbiAgICAgIGZvcm1hdDogXCIlczolc1wiXG4gIH1dLFxuICBtOiBbeyAvL209dmlkZW8gNTE3NDQgUlRQL0FWUCAxMjYgOTcgOTggMzQgMzFcbiAgICAgIC8vIE5COiBzcGVjaWFsIC0gcHVzaGVzIHRvIHNlc3Npb25cbiAgICAgIC8vIFRPRE86IHJ0cC9mbXRwIHNob3VsZCBiZSBmaWx0ZXJlZCBieSB0aGUgcGF5bG9hZHMgZm91bmQgaGVyZT9cbiAgICAgIHJlZzogL14oXFx3KikgKFxcZCopIChbXFx3XFwvXSopXFxzPyguKik/LyxcbiAgICAgIG5hbWVzOiBbJ3R5cGUnLCAncG9ydCcsICdwcm90b2NvbCcsICdwYXlsb2FkcyddLFxuICAgICAgZm9ybWF0OiBcIiVzICVkICVzICVzXCJcbiAgfV0sXG4gIGE6IFtcbiAgICB7IC8vYT1ydHBtYXA6MTEwIE1QNEEtTEFUTS85MDAwMFxuICAgICAgcHVzaDogJ3J0cCcsXG4gICAgICByZWc6IC9ecnRwbWFwXFw6KFxcZCopIChcXHcqKVxcLyhcXGQqKS8sXG4gICAgICBuYW1lczogWydwYXlsb2FkJywgJ2NvZGVjJywgJ3JhdGUnXSxcbiAgICAgIGZvcm1hdDogXCJydHBtYXA6JWQgJXMvJWRcIlxuICAgIH0sXG4gICAgeyAvL2E9Zm10cDoxMDggcHJvZmlsZS1sZXZlbC1pZD0yNDtvYmplY3Q9MjM7Yml0cmF0ZT02NDAwMFxuICAgICAgcHVzaDogJ2ZtdHAnLFxuICAgICAgcmVnOiAvXmZtdHBcXDooXFxkKikgKC4qKS8sXG4gICAgICBuYW1lczogWydwYXlsb2FkJywgJ2NvbmZpZyddLFxuICAgICAgZm9ybWF0OiBcImZtdHA6JWQgJXNcIlxuICAgIH0sXG4gICAgeyAvL2E9cnRjcC1mYjo5OCB0cnItaW50IDEwMFxuICAgICAgcHVzaDogJ3J0Y3BGYlRyckludCcsXG4gICAgICByZWc6IC9ecnRjcC1mYlxcOihcXCp8XFxkKikgdHJyLWludCAoXFxkKikvLFxuICAgICAgbmFtZXM6IFsncGF5bG9hZCcsICd2YWx1ZSddLFxuICAgICAgZm9ybWF0OiBcInJ0Y3AtZmI6JWQgdHJyLWludCAlZFwiXG4gICAgfSxcbiAgICB7IC8vYT1ydGNwLWZiOjk4IG5hY2sgcnBzaVxuICAgICAgcHVzaDogJ3J0Y3BGYicsXG4gICAgICByZWc6IC9ecnRjcC1mYlxcOihcXCp8XFxkKikgKFxcdyopID8oXFx3KikvLFxuICAgICAgbmFtZXM6IFsncGF5bG9hZCcsICd0eXBlJywgJ3N1YnR5cGUnXSxcbiAgICAgIGZvcm1hdDogXCJydGNwLWZiOiVzICVzICVzXCJcbiAgICB9LFxuICAgIHsgLy9hPWV4dG1hcDoyIHVybjppZXRmOnBhcmFtczpydHAtaGRyZXh0OnRvZmZzZXRcbiAgICAgIC8vYT1leHRtYXA6MS9yZWN2b25seSBVUkktZ3BzLXN0cmluZ1xuICAgICAgcHVzaDogJ2V4dCcsXG4gICAgICByZWc6IC9eZXh0bWFwOihbYS16QS1aMC05X1xcL10qKSAoW14gXSopID8oLiopLyxcbiAgICAgIG5hbWVzOiBbJ3ZhbHVlJywgJ3VyaScsICdjb25maWcnXSwgLy8gdmFsdWUgbWF5IGluY2x1ZGUgXCIvZGlyZWN0aW9uXCIgc3VmZml4XG4gICAgICBmb3JtYXQ6IFwiZXh0bWFwOiVzICVzICVzXCJcbiAgICB9LFxuICAgIHtcbiAgICAgIC8vYT1jcnlwdG86MSBBRVNfQ01fMTI4X0hNQUNfU0hBMV84MCBpbmxpbmU6UFMxdVFDVmVlQ0ZDYW5WbWNqa3BQeXdqTldoY1lEMG1YWHR4YVZCUnwyXjIwfDE6MzJcbiAgICAgIHB1c2g6ICdjcnlwdG8nLFxuICAgICAgcmVnOiAvXmNyeXB0bzooXFxkKikgKFthLXpBLVowLTlfXSopID8oW14gXSopID8oLiopLyxcbiAgICAgIG5hbWVzOiBbJ2lkJywgJ3N1aXRlJywgJ2NvbmZpZycsICdzZXNzaW9uQ29uZmlnJ10sXG4gICAgICBmb3JtYXQ6IFwiY3J5cHRvOiVkICVzICVzICVzXCJcbiAgICB9LFxuICAgIHsgLy9hPXNldHVwOmFjdHBhc3NcbiAgICAgIG5hbWU6ICdzZXR1cCcsXG4gICAgICByZWc6IC9ec2V0dXBcXDooXFx3KikvLFxuICAgICAgZm9ybWF0OiBcInNldHVwOiVzXCJcbiAgICB9LFxuICAgIHsgLy9hPW1pZDoxXG4gICAgICBuYW1lOiAnbWlkJyxcbiAgICAgIHJlZzogL15taWRcXDooXFx3KikvLFxuICAgICAgZm9ybWF0OiBcIm1pZDolc1wiXG4gICAgfSxcbiAgICB7IC8vYT1wdGltZToyMFxuICAgICAgbmFtZTogJ3B0aW1lJyxcbiAgICAgIHJlZzogL15wdGltZVxcOihcXGQqKS8sXG4gICAgICBmb3JtYXQ6IFwicHRpbWU6JWRcIlxuICAgIH0sXG4gICAgeyAvL2E9bWF4cHRpbWU6NjBcbiAgICAgIG5hbWU6ICdtYXhwdGltZScsXG4gICAgICByZWc6IC9ebWF4cHRpbWVcXDooXFxkKikvLFxuICAgICAgZm9ybWF0OiBcIm1heHB0aW1lOiVkXCJcbiAgICB9LFxuICAgIHsgLy9hPXNlbmRyZWN2XG4gICAgICBuYW1lOiAnc2VuZHJlY3YnLFxuICAgICAgcmVnOiAvXihzZW5kcmVjdnxyZWN2b25seXxzZW5kb25seXxpbmFjdGl2ZSkvXG4gICAgfSxcbiAgICB7IC8vYT1pY2UtdWZyYWc6RjdnSVxuICAgICAgbmFtZTogJ2ljZVVmcmFnJyxcbiAgICAgIHJlZzogL15pY2UtdWZyYWdcXDooLiopLyxcbiAgICAgIGZvcm1hdDogXCJpY2UtdWZyYWc6JXNcIlxuICAgIH0sXG4gICAgeyAvL2E9aWNlLXB3ZDp4OWNtbC9ZemljaFYyK1hsaGlNdThnXG4gICAgICBuYW1lOiAnaWNlUHdkJyxcbiAgICAgIHJlZzogL15pY2UtcHdkXFw6KC4qKS8sXG4gICAgICBmb3JtYXQ6IFwiaWNlLXB3ZDolc1wiXG4gICAgfSxcbiAgICB7IC8vYT1maW5nZXJwcmludDpTSEEtMSAwMDoxMToyMjozMzo0NDo1NTo2Njo3Nzo4ODo5OTpBQTpCQjpDQzpERDpFRTpGRjowMDoxMToyMjozM1xuICAgICAgbmFtZTogJ2ZpbmdlcnByaW50JyxcbiAgICAgIHJlZzogL15maW5nZXJwcmludFxcOihcXFMqKSAoLiopLyxcbiAgICAgIG5hbWVzOiBbJ3R5cGUnLCAnaGFzaCddLFxuICAgICAgZm9ybWF0OiBcImZpbmdlcnByaW50OiVzICVzXCJcbiAgICB9LFxuICAgIHsgLy9hPWNhbmRpZGF0ZTowIDEgVURQIDIxMTM2NjczMjcgMjAzLjAuMTEzLjEgNTQ0MDAgdHlwIGhvc3RcbiAgICAgIHB1c2g6ICdjYW5kaWRhdGVzJyxcbiAgICAgIHJlZzogL15jYW5kaWRhdGU6KFxcUyopIChcXGQqKSAoXFxTKikgKFxcZCopIChcXFMqKSAoXFxkKikgdHlwIChcXFMqKS8sXG4gICAgICBuYW1lczogWydmb3VuZGF0aW9uJywgJ2NvbXBvbmVudCcsICd0cmFuc3BvcnQnLCAncHJpb3JpdHknLCAnaXAnLCAncG9ydCcsICd0eXBlJ10sXG4gICAgICBmb3JtYXQ6IFwiY2FuZGlkYXRlOiVzICVkICVzICVkICVzICVkIHR5cCAlc1wiXG4gICAgfSxcbiAgICB7IC8vYT1yZW1vdGUtY2FuZGlkYXRlczoxIDIwMy4wLjExMy4xIDU0NDAwIDIgMjAzLjAuMTEzLjEgNTQ0MDEgLi4uXG4gICAgICBuYW1lOiAncmVtb3RlQ2FuZGlkYXRlcycsXG4gICAgICByZWc6IC9ecmVtb3RlLWNhbmRpZGF0ZXM6KC4qKS8sXG4gICAgICBmb3JtYXQ6IFwicmVtb3RlLWNhbmRpZGF0ZXM6JXNcIlxuICAgIH0sXG4gICAgeyAvL2E9aWNlLW9wdGlvbnM6Z29vZ2xlLWljZVxuICAgICAgbmFtZTogJ2ljZU9wdGlvbnMnLFxuICAgICAgcmVnOiAvXmljZS1vcHRpb25zXFw6KC4qKS8sXG4gICAgICBmb3JtYXQ6IFwiaWNlLW9wdGlvbnM6JXNcIlxuICAgIH0sXG4gICAgeyAvL2E9c3NyYzoyNTY2MTA3NTY5IGNuYW1lOnQ5WVU4TTFVeFRGOFkxQTFcbiAgICAgIHB1c2g6IFwic3NyY3NcIixcbiAgICAgIHJlZzogL15zc3JjXFw6KFxcZCopIChbYS16QS1aMC05X10qKVxcOiguKikvLFxuICAgICAgbmFtZXM6IFsnaWQnLCAnYXR0cmlidXRlJywgJ3ZhbHVlJ10sXG4gICAgICBmb3JtYXQ6IFwic3NyYzolZCAlczolc1wiXG4gICAgfSxcbiAgICB7IC8vYT1tc2lkLXNlbWFudGljOiBXTVMgSnZsYW01WDNTWDFPUDZwbjIweldvZ3ZhS0p6NUhqZjlPbmxWXG4gICAgICBuYW1lOiBcIm1zaWRTZW1hbnRpY1wiLFxuICAgICAgcmVnOiAvXm1zaWQtc2VtYW50aWNcXDogKFxcdyopICguKikvLFxuICAgICAgbmFtZXM6IFsnc2VtYW50aWMnLCAndG9rZW4nXSxcbiAgICAgIGZvcm1hdDogXCJtc2lkLXNlbWFudGljOiAlcyAlc1wiIC8vIHNwYWNlIGFmdGVyIFwiOlwiIGlzIG5vdCBhY2NpZGVudGFsXG4gICAgfSxcbiAgICB7IC8vYT1ncm91cDpCVU5ETEUgYXVkaW8gdmlkZW9cbiAgICAgIHB1c2g6ICdncm91cHMnLFxuICAgICAgcmVnOiAvXmdyb3VwXFw6KFxcdyopICguKikvLFxuICAgICAgbmFtZXM6IFsndHlwZScsICdtaWRzJ10sXG4gICAgICBmb3JtYXQ6IFwiZ3JvdXA6JXMgJXNcIlxuICAgIH0sXG4gICAgeyAvL2E9cnRjcC1tdXhcbiAgICAgIG5hbWU6ICdydGNwTXV4JyxcbiAgICAgIHJlZzogL14ocnRjcC1tdXgpL1xuICAgIH1cbiAgXVxufTtcblxuLy8gc2V0IHNlbnNpYmxlIGRlZmF1bHRzIHRvIGF2b2lkIHBvbGx1dGluZyB0aGUgZ3JhbW1hciB3aXRoIGJvcmluZyBkZXRhaWxzXG5PYmplY3Qua2V5cyhncmFtbWFyKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgdmFyIG9ianMgPSBncmFtbWFyW2tleV07XG4gIG9ianMuZm9yRWFjaChmdW5jdGlvbiAob2JqKSB7XG4gICAgaWYgKCFvYmoucmVnKSB7XG4gICAgICBvYmoucmVnID0gLyguKikvO1xuICAgIH1cbiAgICBpZiAoIW9iai5mb3JtYXQpIHtcbiAgICAgIG9iai5mb3JtYXQgPSBcIiVzXCI7XG4gICAgfVxuICB9KTtcbn0pOyBcbiIsInZhciB0b0ludElmSW50ID0gZnVuY3Rpb24gKHYpIHtcbiAgcmV0dXJuIFN0cmluZyhOdW1iZXIodikpID09PSB2ID8gTnVtYmVyKHYpIDogdjtcbn07XG5cbnZhciBhdHRhY2hQcm9wZXJ0aWVzID0gZnVuY3Rpb24gKG1hdGNoLCBsb2NhdGlvbiwgbmFtZXMsIHJhd05hbWUpIHtcbiAgaWYgKHJhd05hbWUgJiYgIW5hbWVzKSB7XG4gICAgbG9jYXRpb25bcmF3TmFtZV0gPSB0b0ludElmSW50KG1hdGNoWzFdKTtcbiAgfVxuICBlbHNlIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5hbWVzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBsb2NhdGlvbltuYW1lc1tpXV0gPSB0b0ludElmSW50KG1hdGNoW2krMV0pO1xuICAgIH1cbiAgfVxufTtcblxudmFyIHBhcnNlUmVnID0gZnVuY3Rpb24gKG9iaiwgbG9jYXRpb24sIGNvbnRlbnQpIHtcbiAgdmFyIG5lZWRzQmxhbmsgPSBvYmoubmFtZSAmJiBvYmoubmFtZXM7XG4gIGlmIChvYmoucHVzaCAmJiAhbG9jYXRpb25bb2JqLnB1c2hdKSB7XG4gICAgbG9jYXRpb25bb2JqLnB1c2hdID0gW107XG4gIH1cbiAgZWxzZSBpZiAobmVlZHNCbGFuayAmJiAhbG9jYXRpb25bb2JqLm5hbWVdKSB7XG4gICAgbG9jYXRpb25bb2JqLm5hbWVdID0ge307XG4gIH1cbiAgdmFyIGtleUxvY2F0aW9uID0gb2JqLnB1c2ggP1xuICAgIHt9IDogIC8vIGJsYW5rIG9iamVjdCB0aGF0IHdpbGwgYmUgcHVzaGVkXG4gICAgbmVlZHNCbGFuayA/IGxvY2F0aW9uW29iai5uYW1lXSA6IGxvY2F0aW9uOyAvLyBvdGhlcndpc2UsIG5hbWVkIGxvY2F0aW9uIG9yIHJvb3RcblxuICBhdHRhY2hQcm9wZXJ0aWVzKGNvbnRlbnQubWF0Y2gob2JqLnJlZyksIGtleUxvY2F0aW9uLCBvYmoubmFtZXMsIG9iai5uYW1lKTtcblxuICBpZiAob2JqLnB1c2gpIHtcbiAgICBsb2NhdGlvbltvYmoucHVzaF0ucHVzaChrZXlMb2NhdGlvbik7XG4gIH1cbn07XG5cbnZhciBncmFtbWFyID0gcmVxdWlyZSgnLi9ncmFtbWFyJyk7XG52YXIgdmFsaWRMaW5lID0gUmVnRXhwLnByb3RvdHlwZS50ZXN0LmJpbmQoL14oW2Etel0pPSguKikvKTtcblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIChzZHApIHtcbiAgdmFyIHNlc3Npb24gPSB7fVxuICAgICwgbWVkaWEgPSBbXVxuICAgICwgbG9jYXRpb24gPSBzZXNzaW9uOyAvLyBwb2ludHMgYXQgd2hlcmUgcHJvcGVydGllcyBnbyB1bmRlciAob25lIG9mIHRoZSBhYm92ZSlcblxuICAvLyBwYXJzZSBsaW5lcyB3ZSB1bmRlcnN0YW5kXG4gIHNkcC5zcGxpdCgnXFxuJykuZmlsdGVyKHZhbGlkTGluZSkuZm9yRWFjaChmdW5jdGlvbiAobCkge1xuICAgIHZhciB0eXBlID0gbFswXTtcbiAgICB2YXIgY29udGVudCA9IGwuc2xpY2UoMik7XG4gICAgaWYgKHR5cGUgPT09ICdtJykge1xuICAgICAgbWVkaWEucHVzaCh7cnRwOiBbXSwgZm10cDogW119KTtcbiAgICAgIGxvY2F0aW9uID0gbWVkaWFbbWVkaWEubGVuZ3RoLTFdOyAvLyBwb2ludCBhdCBsYXRlc3QgbWVkaWEgbGluZVxuICAgIH1cblxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgKGdyYW1tYXJbdHlwZV0gfHwgW10pLmxlbmd0aDsgaiArPSAxKSB7XG4gICAgICB2YXIgb2JqID0gZ3JhbW1hclt0eXBlXVtqXTtcbiAgICAgIGlmIChvYmoucmVnLnRlc3QoY29udGVudCkpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlUmVnKG9iaiwgbG9jYXRpb24sIGNvbnRlbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgc2Vzc2lvbi5tZWRpYSA9IG1lZGlhOyAvLyBsaW5rIGl0IHVwXG4gIHJldHVybiBzZXNzaW9uO1xufTtcblxudmFyIGZtdHBSZWR1Y2VyID0gZnVuY3Rpb24gKGFjYywgZXhwcikge1xuICB2YXIgcyA9IGV4cHIuc3BsaXQoJz0nKTtcbiAgaWYgKHMubGVuZ3RoID09PSAyKSB7XG4gICAgYWNjW3NbMF1dID0gdG9JbnRJZkludChzWzFdKTtcbiAgfVxuICByZXR1cm4gYWNjO1xufTtcblxuZXhwb3J0cy5wYXJzZUZtdHBDb25maWcgPSBmdW5jdGlvbiAoc3RyKSB7XG4gIHJldHVybiBzdHIuc3BsaXQoJzsnKS5yZWR1Y2UoZm10cFJlZHVjZXIsIHt9KTtcbn07XG5cbmV4cG9ydHMucGFyc2VQYXlsb2FkcyA9IGZ1bmN0aW9uIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5zcGxpdCgnICcpLm1hcChOdW1iZXIpO1xufTtcblxuZXhwb3J0cy5wYXJzZVJlbW90ZUNhbmRpZGF0ZXMgPSBmdW5jdGlvbiAoc3RyKSB7XG4gIHZhciBjYW5kaWRhdGVzID0gW107XG4gIHZhciBwYXJ0cyA9IHN0ci5zcGxpdCgnICcpLm1hcCh0b0ludElmSW50KTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7IGkgKz0gMykge1xuICAgIGNhbmRpZGF0ZXMucHVzaCh7XG4gICAgICBjb21wb25lbnQ6IHBhcnRzW2ldLFxuICAgICAgaXA6IHBhcnRzW2kgKyAxXSxcbiAgICAgIHBvcnQ6IHBhcnRzW2kgKyAyXVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBjYW5kaWRhdGVzO1xufTtcbiIsInZhciBncmFtbWFyID0gcmVxdWlyZSgnLi9ncmFtbWFyJyk7XG52YXIgZm9ybWF0ID0gcmVxdWlyZSgndXRpbCcpLmZvcm1hdDtcblxudmFyIG1ha2VMaW5lID0gZnVuY3Rpb24gKHR5cGUsIG9iaiwgbG9jYXRpb24pIHtcbiAgdmFyIGFyZ3MgPSBbdHlwZSArICc9JyArIG9iai5mb3JtYXRdO1xuICBpZiAob2JqLm5hbWVzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvYmoubmFtZXMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIHZhciBuID0gb2JqLm5hbWVzW2ldO1xuICAgICAgaWYgKG9iai5uYW1lKSB7XG4gICAgICAgIGFyZ3MucHVzaChsb2NhdGlvbltvYmoubmFtZV1bbl0pO1xuICAgICAgfVxuICAgICAgZWxzZSB7IC8vIGZvciBtTGluZSBhbmQgcHVzaCBhdHRyaWJ1dGVzXG4gICAgICAgIGFyZ3MucHVzaChsb2NhdGlvbltvYmoubmFtZXNbaV1dKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgZWxzZSB7XG4gICAgYXJncy5wdXNoKGxvY2F0aW9uW29iai5uYW1lXSk7XG4gIH1cbiAgcmV0dXJuIGZvcm1hdC5hcHBseShudWxsLCBhcmdzKTtcbn07XG5cbi8vIFJGQyBzcGVjaWZpZWQgb3JkZXJcbi8vIFRPRE86IGV4dGVuZCB0aGlzIHdpdGggYWxsIHRoZSByZXN0XG52YXIgZGVmYXVsdE91dGVyT3JkZXIgPSBbXG4gICd2JywgJ28nLCAncycsICdpJyxcbiAgJ3UnLCAnZScsICdwJywgJ2MnLFxuICAnYicsICd0JywgJ3InLCAneicsICdhJ1xuXTtcbnZhciBkZWZhdWx0SW5uZXJPcmRlciA9IFsnaScsICdjJywgJ2InLCAnYSddO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHNlc3Npb24sIG9wdHMpIHtcbiAgb3B0cyA9IG9wdHMgfHwge307XG4gIC8vIGVuc3VyZSBjZXJ0YWluIHByb3BlcnRpZXMgZXhpc3RcbiAgaWYgKHNlc3Npb24udmVyc2lvbiA9PSBudWxsKSB7XG4gICAgc2Vzc2lvbi52ZXJzaW9uID0gMDsgLy8gXCJ2PTBcIiBtdXN0IGJlIHRoZXJlIChvbmx5IGRlZmluZWQgdmVyc2lvbiBhdG0pXG4gIH1cbiAgaWYgKHNlc3Npb24ubmFtZSA9PSBudWxsKSB7XG4gICAgc2Vzc2lvbi5uYW1lID0gXCIgXCI7IC8vIFwicz0gXCIgbXVzdCBiZSB0aGVyZSBpZiBubyBtZWFuaW5nZnVsIG5hbWUgc2V0XG4gIH1cbiAgc2Vzc2lvbi5tZWRpYS5mb3JFYWNoKGZ1bmN0aW9uIChtTGluZSkge1xuICAgIGlmIChtTGluZS5wYXlsb2FkcyA9PSBudWxsKSB7XG4gICAgICBtTGluZS5wYXlsb2FkcyA9IFwiXCI7XG4gICAgfVxuICB9KTtcblxuICB2YXIgb3V0ZXJPcmRlciA9IG9wdHMub3V0ZXJPcmRlciB8fCBkZWZhdWx0T3V0ZXJPcmRlcjtcbiAgdmFyIGlubmVyT3JkZXIgPSBvcHRzLmlubmVyT3JkZXIgfHwgZGVmYXVsdElubmVyT3JkZXI7XG4gIHZhciBzZHAgPSBbXTtcblxuICAvLyBsb29wIHRocm91Z2ggb3V0ZXJPcmRlciBmb3IgbWF0Y2hpbmcgcHJvcGVydGllcyBvbiBzZXNzaW9uXG4gIG91dGVyT3JkZXIuZm9yRWFjaChmdW5jdGlvbiAodHlwZSkge1xuICAgIGdyYW1tYXJbdHlwZV0uZm9yRWFjaChmdW5jdGlvbiAob2JqKSB7XG4gICAgICBpZiAob2JqLm5hbWUgaW4gc2Vzc2lvbikge1xuICAgICAgICBzZHAucHVzaChtYWtlTGluZSh0eXBlLCBvYmosIHNlc3Npb24pKTtcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKG9iai5wdXNoIGluIHNlc3Npb24pIHtcbiAgICAgICAgc2Vzc2lvbltvYmoucHVzaF0uZm9yRWFjaChmdW5jdGlvbiAoZWwpIHtcbiAgICAgICAgICBzZHAucHVzaChtYWtlTGluZSh0eXBlLCBvYmosIGVsKSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICAvLyB0aGVuIGZvciBlYWNoIG1lZGlhIGxpbmUsIGZvbGxvdyB0aGUgaW5uZXJPcmRlclxuICBzZXNzaW9uLm1lZGlhLmZvckVhY2goZnVuY3Rpb24gKG1MaW5lKSB7XG4gICAgc2RwLnB1c2gobWFrZUxpbmUoJ20nLCBncmFtbWFyLm1bMF0sIG1MaW5lKSk7XG5cbiAgICBpbm5lck9yZGVyLmZvckVhY2goZnVuY3Rpb24gKHR5cGUpIHtcbiAgICAgIGdyYW1tYXJbdHlwZV0uZm9yRWFjaChmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgIGlmIChvYmoubmFtZSBpbiBtTGluZSkge1xuICAgICAgICAgIHNkcC5wdXNoKG1ha2VMaW5lKHR5cGUsIG9iaiwgbUxpbmUpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChvYmoucHVzaCBpbiBtTGluZSkge1xuICAgICAgICAgIG1MaW5lW29iai5wdXNoXS5mb3JFYWNoKGZ1bmN0aW9uIChlbCkge1xuICAgICAgICAgICAgc2RwLnB1c2gobWFrZUxpbmUodHlwZSwgb2JqLCBlbCkpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHNkcC5qb2luKCdcXG4nKSArICdcXG4nO1xufTtcbiIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4vKiBnbG9iYWwgaW86IGZhbHNlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBldmUgPSByZXF1aXJlKCdldmUnKTtcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgcnRjID0gcmVxdWlyZSgncnRjJyk7XG52YXIgZGVidWcgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJykoJ2dsdWUtc2Vzc2lvbm1hbmFnZXInKTtcbnZhciBjcmVhdGVTaWduYWxsZXIgPSByZXF1aXJlKCdydGMtc2lnbmFsbGVyJyk7XG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnY29nL2V4dGVuZCcpO1xudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbi8qKlxuICAjIyMgU2Vzc2lvbk1hbmFnZXJcblxuICBUaGUgU2Vzc2lvbk1hbmFnZXIgY2xhc3MgYXNzaXN0cyB3aXRoIGludGVyYWN0aW5nIHdpdGggdGhlIHNpZ25hbGxpbmdcbiAgc2VydmVyIGFuZCBjcmVhdGluZyBwZWVyIGNvbm5lY3Rpb25zIGJldHdlZW4gdmFsaWQgcGFydGllcy4gIEl0IHVzZXNcbiAgZXZlIHRvIGNyZWF0ZSBhIGRlY291cGxlZCB3YXkgdG8gZ2V0IHBlZXIgaW5mb3JtYXRpb24uXG5cbioqL1xuZnVuY3Rpb24gU2Vzc2lvbk1hbmFnZXIoY29uZmlnKSB7XG4gIGlmICghICh0aGlzIGluc3RhbmNlb2YgU2Vzc2lvbk1hbmFnZXIpKSB7XG4gICAgcmV0dXJuIG5ldyBTZXNzaW9uTWFuYWdlcihjb25maWcpO1xuICB9XG5cbiAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgcm9vbSBhbmQgb3VyIHJvbGVcbiAgdGhpcy5yb29tID0gY29uZmlnLnJvb207XG4gIHRoaXMucm9sZSA9IGNvbmZpZy5yb2xlO1xuXG4gIC8vIHNhdmUgdGhlIGNvbmZpZ1xuICB0aGlzLmNmZyA9IGNvbmZpZztcblxuICAvLyBpbml0aWFsaXNlIG91ciBwZWVycyBsaXN0XG4gIHRoaXMucGVlcnMgPSB7fTtcblxuICAvLyBpbml0aWFsaXNlIHRoZSBzdHJlYW1zIGRhdGEgbGlzdFxuICB0aGlzLnN0cmVhbXMgPSB7fTtcblxuICAvLyBjcmVhdGUgb3VyIHVuZGVybHlpbmcgc29ja2V0IGNvbm5lY3Rpb25cbiAgdGhpcy5zb2NrZXQgPSBuZXcgUHJpbXVzKGNvbmZpZy5zaWduYWxob3N0KTtcbiAgdGhpcy5zb2NrZXQub24oJ29wZW4nLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnYWN0aXZlJykpO1xuXG4gIC8vIGNyZWF0ZSBvdXIgc2lnbmFsbGluZyBpbnRlcmZhY2VcbiAgdGhpcy5zaWduYWxsZXIgPSBjcmVhdGVTaWduYWxsZXIodGhpcy5zb2NrZXQpO1xuXG4gIC8vIGhvb2sgdXAgc2lnbmFsbGVyIGV2ZW50c1xuICB0aGlzLl9iaW5kRXZlbnRzKHRoaXMuc2lnbmFsbGVyLCBjb25maWcpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFNlc3Npb25NYW5hZ2VyO1xudXRpbC5pbmhlcml0cyhTZXNzaW9uTWFuYWdlciwgRXZlbnRFbWl0dGVyKTtcblxuLyoqXG4gICMjIyMgYW5ub3VuY2UoKVxuXG4gIEFubm91bmNlIG91cnNlbHZlcyBvbiB0aGUgc2lnbmFsbGluZyBjaGFubmVsXG4qKi9cblNlc3Npb25NYW5hZ2VyLnByb3RvdHlwZS5hbm5vdW5jZSA9IGZ1bmN0aW9uKHRhcmdldElkKSB7XG4gIHZhciBzY29wZSA9IHRhcmdldElkID8gdGhpcy5zaWduYWxsZXIudG8odGFyZ2V0SWQpIDogdGhpcy5zaWduYWxsZXI7XG5cbiAgZGVidWcoJ2Fubm91bmNpbmcgc2VsZiB0bzogJyArICh0YXJnZXRJZCB8fCAnYWxsJykpO1xuICBzY29wZS5hbm5vdW5jZSh7IHJvb206IHRoaXMucm9vbSwgcm9sZTogdGhpcy5yb2xlIH0pO1xufTtcblxuLyoqXG4gICMjIyMgYnJvYWRjYXN0KHN0cmVhbSlcblxuICBCcm9hZGNhc3QgYSBzdHJlYW0gdG8gb3VyIGNvbm5lY3RlZCBwZWVycy5cblxuKiovXG5TZXNzaW9uTWFuYWdlci5wcm90b3R5cGUuYnJvYWRjYXN0ID0gZnVuY3Rpb24oc3RyZWFtLCBkYXRhKSB7XG4gIHZhciBwZWVycyA9IHRoaXMucGVlcnM7XG4gIHZhciBtZ3IgPSB0aGlzO1xuXG4gIGZ1bmN0aW9uIGNvbm5lY3RQZWVyKHBlZXIsIHBlZXJJZCkge1xuICAgIG1nci50YWdTdHJlYW0oc3RyZWFtLCBwZWVySWQsIGRhdGEpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHBlZXIuYWRkU3RyZWFtKHN0cmVhbSk7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICBkZWJ1ZygnY2FwdHVyZWQgZXJyb3IgYXR0ZW1wdGluZyB0byBhZGQgc3RyZWFtOiAnLCBlKTtcbiAgICB9XG4gIH1cblxuICAvLyBhZGQgdG8gZXhpc3Rpbmcgc3RyZWFtc1xuICBkZWJ1ZygnYnJvYWRjYXN0aW5nIHN0cmVhbSAnICsgc3RyZWFtLmlkICsgJyB0byBleGlzdGluZyBwZWVycycpO1xuICBPYmplY3Qua2V5cyhwZWVycykuZm9yRWFjaChmdW5jdGlvbihwZWVySWQpIHtcbiAgICBpZiAocGVlcnNbcGVlcklkXSkge1xuICAgICAgZGVidWcoJ2Jyb2FkY2FzdGluZyB0byBwZWVyOiAnICsgcGVlcklkKTtcbiAgICAgIGNvbm5lY3RQZWVyKHBlZXJzW3BlZXJJZF0sIHBlZXJJZCk7XG4gICAgfVxuICB9KTtcblxuICAvLyB3aGVuIGEgbmV3IHBlZXIgYXJyaXZlcywgYWRkIGl0IHRvIHRoYXQgcGVlciBhbHNvXG4gIGV2ZS5vbignZ2x1ZS5wZWVyLmpvaW4nLCBmdW5jdGlvbihwZWVyLCBwZWVySWQpIHtcbiAgICBkZWJ1ZygncGVlciAnICsgcGVlcklkICsgJyBqb2luZWQsIGNvbm5lY3RpbmcgdG8gc3RyZWFtOiAnICsgc3RyZWFtLmlkKTtcblxuICAgIGNvbm5lY3RQZWVyKHBlZXIsIHBlZXJJZCk7XG4gIH0pO1xuXG4gIC8vIHdoZW4gdGhlIHN0cmVhbSBlbmRzIGRpc2Nvbm5lY3QgdGhlIGxpc3RlbmVyXG4gIC8vIFRPRE86IHVzZSBhZGRFdmVudExpc3RlbmVyIG9uY2Ugc3VwcG9ydGVkXG4gIHN0cmVhbS5vbmVuZGVkID0gZnVuY3Rpb24oKSB7XG4gICAgZXZlLm9mZignZ2x1ZS5wZWVyLmpvaW4nLCBjb25uZWN0UGVlcik7XG4gIH07XG59O1xuXG4vKipcbiAgIyMjIyBnZXRTdHJlYW1EYXRhKHN0cmVhbSwgY2FsbGJhY2spXG5cbiAgR2l2ZW4gdGhlIGlucHV0IHN0cmVhbSBgc3RyZWFtYCwgcmV0dXJuIHRoZSBkYXRhIGZvciB0aGUgc3RyZWFtLiAgVGhlXG4gIHByb3ZpZGVkIGBjYWxsYmFja2Agd2lsbCBub3QgYmUgY2FsbGVkIHVudGlsIHJlbGV2YW50IGRhdGEgaXMgaGVsZCBieVxuICB0aGUgc2Vzc2lvbiBtYW5hZ2VyLlxuXG4qKi9cblNlc3Npb25NYW5hZ2VyLnByb3RvdHlwZS5nZXRTdHJlYW1EYXRhID0gZnVuY3Rpb24oc3RyZWFtLCBjYWxsYmFjaykge1xuICB2YXIgaWQgPSBzdHJlYW0gJiYgc3RyZWFtLmlkO1xuICB2YXIgZGF0YSA9IHRoaXMuc3RyZWFtc1tpZF07XG5cbiAgLy8gaWYgd2UgZG9uJ3QgaGF2ZSBhbiBpZCwgdGhlbiBhYm9ydFxuICBpZiAoISBpZCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIGlmIHdlIGhhdmUgZGF0YSBhbHJlYWR5LCByZXR1cm4gaXRcbiAgaWYgKGRhdGEpIHtcbiAgICBjYWxsYmFjayhkYXRhKTtcbiAgfVxuICAvLyBvdGhlcndpc2UsIHdhaXQgZm9yIHRoZSBkYXRhIHRvIGJlIGNyZWF0ZWRcbiAgZWxzZSB7XG4gICAgZXZlLm9uY2UoJ2dsdWUuc3RyZWFtZGF0YS4nICsgaWQsIGNhbGxiYWNrKTtcbiAgfVxufTtcblxuLyoqXG4gICMjIyMgdGFnU3RyZWFtKHN0cmVhbSwgdGFyZ2V0SWQsIGRhdGEpXG5cbiAgVGhlIHRhZ1N0cmVhbSBpcyB1c2VkIHRvIHBhc3Mgc3RyZWFtIGlkZW50aWZpY2F0aW9uIGluZm9ybWF0aW9uIGFsb25nIHRvIHRoZVxuICB0YXJnZXQgcGVlci4gIFRoaXMgaW5mb3JtYXRpb24gaXMgdXNlZnVsIHdoZW4gYSBwYXJ0aWN1bGFyIHJlbW90ZSBtZWRpYVxuICBlbGVtZW50IGlzIGV4cGVjdGluZyB0aGUgY29udGVudHMgb2YgYSBwYXJ0aWN1bGFyIGNhcHR1cmUgdGFyZ2V0LlxuXG4qKi9cblNlc3Npb25NYW5hZ2VyLnByb3RvdHlwZS50YWdTdHJlYW0gPSBmdW5jdGlvbihzdHJlYW0sIHRhcmdldElkLCBkYXRhKSB7XG4gIHRoaXMuc2lnbmFsbGVyLnRvKHRhcmdldElkKS5zZW5kKCcvc3RyZWFtZGF0YScsIGV4dGVuZCh7fSwgZGF0YSwge1xuICAgIGlkOiBzdHJlYW0uaWQsXG4gICAgbGFiZWw6IHN0cmVhbS5sYWJlbFxuICB9KSk7XG59O1xuXG4vKiBpbnRlcm5hbCBtZXRob2RzICovXG5cblNlc3Npb25NYW5hZ2VyLnByb3RvdHlwZS5fYmluZEV2ZW50cyA9IGZ1bmN0aW9uKHNpZ25hbGxlciwgb3B0cykge1xuICB2YXIgbWdyID0gdGhpcztcblxuICAvLyBUT0RPOiBleHRyYWN0IHRoZSBtZWFuaW5nZnVsIHBhcnRzIGZyb20gdGhlIGNvbmZpZ1xuICAvLyB2YXIgb3B0cyA9IHRoaXMuY2ZnO1xuICBkZWJ1ZygnaW5pdGlhbGl6aW5nIGV2ZW50IGhhbmRsZXJzJyk7XG5cbiAgc2lnbmFsbGVyLm9uKCdwZWVyOmFubm91bmNlJywgZnVuY3Rpb24oZGF0YSkge1xuICAgIHZhciBucyA9ICdnbHVlLnBlZXIuam9pbi4nICsgKGRhdGEucm9sZSB8fCAnbm9uZScpXG4gICAgdmFyIHBlZXI7XG4gICAgdmFyIG1vbml0b3I7XG5cbiAgICAvLyBpZiB0aGUgcm9vbSBkb2VzIG5vdCBtYXRjaCBvdXIgcm9vbVxuICAgIC8vIE9SLCB3ZSBhbHJlYWR5IGhhdmUgYW4gYWN0aXZlIHBlZXIgZm9yIHRoYXQgaWQsIHRoZW4gYWJvcnRcbiAgICBkZWJ1ZygnY2FwdHVyZWQgYW5ub3VuY2UgZXZlbnQgZm9yIHBlZXI6ICcgKyBkYXRhLmlkKTtcbiAgICBpZiAoZGF0YS5yb29tICE9PSBtZ3Iucm9vbSkge1xuICAgICAgcmV0dXJuIGRlYnVnKCdyZWNlaXZlZCBhbm5vdW5jZSBmb3IgaW5jb3JyZWN0IHJvb20nKTtcbiAgICB9XG5cbiAgICBpZiAobWdyLnBlZXJzW2RhdGEuaWRdKSB7XG4gICAgICByZXR1cm4gZGVidWcoJ2tub3duIHBlZXInKTtcbiAgICB9XG5cbiAgICAvLyBjcmVhdGUgb3VyIHBlZXIgY29ubmVjdGlvblxuICAgIHBlZXIgPSBtZ3IucGVlcnNbZGF0YS5pZF0gPSBydGMuY3JlYXRlQ29ubmVjdGlvbihcbiAgICAgIG9wdHMsXG4gICAgICBvcHRzLmNvbnN0cmFpbnRzXG4gICAgKTtcblxuICAgIC8vIGNvdXBsZSB0aGUgY29ubmVjdGlvbnNcbiAgICBtb25pdG9yID0gcnRjLmNvdXBsZShwZWVyLCBkYXRhLmlkLCBzaWduYWxsZXIsIG9wdHMpO1xuXG4gICAgLy8gd2FpdCBmb3IgdGhlIG1vbml0b3IgdG8gdGVsbCB1cyB3ZSBoYXZlIGFuIGFjdGl2ZSBjb25uZWN0aW9uXG4gICAgLy8gYmVmb3JlIGF0dGVtcHRpbmcgdG8gYmluZCB0byBhbnkgVUkgZWxlbWVudHNcbiAgICBtb25pdG9yLm9uY2UoJ2FjdGl2ZScsIGZ1bmN0aW9uKCkge1xuICAgICAgZXZlKCdnbHVlLnBlZXIuYWN0aXZlLicgKyAoZGF0YS5yb2xlIHx8ICdub25lJyksIG51bGwsIHBlZXIsIGRhdGEuaWQpO1xuICAgIH0pO1xuXG4gICAgZXZlKCdnbHVlLnBlZXIuam9pbi4nICsgKGRhdGEucm9sZSB8fCAnbm9uZScpLCBudWxsLCBwZWVyLCBkYXRhLmlkKTtcbiAgfSk7XG5cbiAgc2lnbmFsbGVyLm9uKCdwZWVyOmxlYXZlJywgZnVuY3Rpb24oaWQpIHtcbiAgICAvLyBnZXQgdGhlIHBlZXJcbiAgICB2YXIgcGVlciA9IG1nci5wZWVyc1tpZF07XG4gICAgZGVidWcoJ2NhcHR1cmVkIGxlYXZlIGV2ZW50IGZvciBwZWVyOiAnICsgaWQpO1xuXG4gICAgLy8gaWYgdGhpcyBpcyBhIHBlZXIgd2Uga25vdyBhYm91dCwgdGhlbiBjbG9zZSBhbmQgc2VuZCBhIG5vdGlmaWNhdGlvblxuICAgIGlmIChwZWVyKSB7XG4gICAgICBwZWVyLmNsb3NlKCk7XG4gICAgICBtZ3IucGVlcnNbaWRdID0gdW5kZWZpbmVkO1xuXG4gICAgICAvLyB0cmlnZ2VyIHRoZSBub3RpZmljYXRpb25cbiAgICAgIGV2ZSgnZ2x1ZS5wZWVyLmxlYXZlJywgbnVsbCwgcGVlciwgaWQpO1xuICAgIH1cbiAgfSk7XG5cbiAgc2lnbmFsbGVyLm9uKCdzdHJlYW1kYXRhJywgZnVuY3Rpb24oc3JjLCBkYXRhKSB7XG4gICAgLy8gc2F2ZSB0aGUgc3RyZWFtIGRhdGEgdG8gdGhlIGxvY2FsIHN0cmVhbVxuICAgIG1nci5zdHJlYW1zW2RhdGEuaWRdID0gZGF0YTtcbiAgICBldmUoJ2dsdWUuc3RyZWFtZGF0YS4nICsgZGF0YS5pZCwgbnVsbCwgZGF0YSk7XG4gIH0pO1xufTsiLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkge1xuICB0aGlzLl9ldmVudHMgPSB0aGlzLl9ldmVudHMgfHwge307XG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC4xMC54XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbi8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xuLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcbiAgaWYgKCFpc051bWJlcihuKSB8fCBuIDwgMCB8fCBpc05hTihuKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpO1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGVyLCBoYW5kbGVyLCBsZW4sIGFyZ3MsIGksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBJZiB0aGVyZSBpcyBubyAnZXJyb3InIGV2ZW50IGxpc3RlbmVyIHRoZW4gdGhyb3cuXG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgaWYgKCF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzT2JqZWN0KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKSB7XG4gICAgICBlciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGVyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgVHlwZUVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50LicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzVW5kZWZpbmVkKGhhbmRsZXIpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZiAoaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuICAgIHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgLy8gZmFzdCBjYXNlc1xuICAgICAgY2FzZSAxOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgLy8gc2xvd2VyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGhhbmRsZXIpKSB7XG4gICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuXG4gICAgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIG07XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJcIi5cbiAgaWYgKHRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcilcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgaXNGdW5jdGlvbihsaXN0ZW5lci5saXN0ZW5lcikgP1xuICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lciA6IGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgZWxzZSBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICBlbHNlXG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuXG4gIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pICYmICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkKSB7XG4gICAgdmFyIG07XG4gICAgaWYgKCFpc1VuZGVmaW5lZCh0aGlzLl9tYXhMaXN0ZW5lcnMpKSB7XG4gICAgICBtID0gdGhpcy5fbWF4TGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgaWYgKG0gJiYgbSA+IDAgJiYgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IG0pIHtcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5lcnJvcignKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXG4gICAgICAgICAgICAgICAgICAgICdsZWFrIGRldGVjdGVkLiAlZCBsaXN0ZW5lcnMgYWRkZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCk7XG4gICAgICBjb25zb2xlLnRyYWNlKCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIHZhciBmaXJlZCA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcblxuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9XG5cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICB0aGlzLm9uKHR5cGUsIGcpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbGlzdCwgcG9zaXRpb24sIGxlbmd0aCwgaTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXR1cm4gdGhpcztcblxuICBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuICBsZW5ndGggPSBsaXN0Lmxlbmd0aDtcbiAgcG9zaXRpb24gPSAtMTtcblxuICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHxcbiAgICAgIChpc0Z1bmN0aW9uKGxpc3QubGlzdGVuZXIpICYmIGxpc3QubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG5cbiAgfSBlbHNlIGlmIChpc09iamVjdChsaXN0KSkge1xuICAgIGZvciAoaSA9IGxlbmd0aDsgaS0tID4gMDspIHtcbiAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgIChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwb3NpdGlvbiA8IDApXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgbGlzdC5sZW5ndGggPSAwO1xuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdC5zcGxpY2UocG9zaXRpb24sIDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGtleSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIG5vdCBsaXN0ZW5pbmcgZm9yIHJlbW92ZUxpc3RlbmVyLCBubyBuZWVkIHRvIGVtaXRcbiAgaWYgKCF0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICBmb3IgKGtleSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzRnVuY3Rpb24obGlzdGVuZXJzKSkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBMSUZPIG9yZGVyXG4gICAgd2hpbGUgKGxpc3RlbmVycy5sZW5ndGgpXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV0pO1xuICB9XG4gIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSBbXTtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbih0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xuICBlbHNlXG4gICAgcmV0ID0gdGhpcy5fZXZlbnRzW3R5cGVdLnNsaWNlKCk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCFlbWl0dGVyLl9ldmVudHMgfHwgIWVtaXR0ZXIuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSAwO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKGVtaXR0ZXIuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gMTtcbiAgZWxzZVxuICAgIHJldCA9IGVtaXR0ZXIuX2V2ZW50c1t0eXBlXS5sZW5ndGg7XG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG4iLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsInJlcXVpcmU9KGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoe1wiUGNaajlMXCI6W2Z1bmN0aW9uKHJlcXVpcmUsbW9kdWxlLGV4cG9ydHMpe1xudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcbkJ1ZmZlci5wb29sU2l6ZSA9IDgxOTJcblxuLyoqXG4gKiBJZiBgYnJvd3NlclN1cHBvcnRgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xudmFyIGJyb3dzZXJTdXBwb3J0ID0gKGZ1bmN0aW9uICgpIHtcbiAgIC8vIERldGVjdCBpZiBicm93c2VyIHN1cHBvcnRzIFR5cGVkIEFycmF5cy4gU3VwcG9ydGVkIGJyb3dzZXJzIGFyZSBJRSAxMCssXG4gICAvLyBGaXJlZm94IDQrLCBDaHJvbWUgNyssIFNhZmFyaSA1LjErLCBPcGVyYSAxMS42KywgaU9TIDQuMisuXG4gICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgPT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiBBcnJheUJ1ZmZlciA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgICAgdHlwZW9mIERhdGFWaWV3ID09PSAndW5kZWZpbmVkJylcbiAgICAgIHJldHVybiBmYWxzZVxuXG4gIC8vIERvZXMgdGhlIGJyb3dzZXIgc3VwcG9ydCBhZGRpbmcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzPyBJZlxuICAvLyBub3QsIHRoZW4gdGhhdCdzIHRoZSBzYW1lIGFzIG5vIGBVaW50OEFycmF5YCBzdXBwb3J0LiBXZSBuZWVkIHRvIGJlIGFibGUgdG9cbiAgLy8gYWRkIGFsbCB0aGUgbm9kZSBCdWZmZXIgQVBJIG1ldGhvZHMuXG4gIC8vIFJlbGV2YW50IEZpcmVmb3ggYnVnOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzhcbiAgdHJ5IHtcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoMClcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gV29ya2Fyb3VuZDogbm9kZSdzIGJhc2U2NCBpbXBsZW1lbnRhdGlvbiBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgc3RyaW5nc1xuICAvLyB3aGlsZSBiYXNlNjQtanMgZG9lcyBub3QuXG4gIGlmIChlbmNvZGluZyA9PT0gJ2Jhc2U2NCcgJiYgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBzdWJqZWN0ID0gc3RyaW5ndHJpbShzdWJqZWN0KVxuICAgIHdoaWxlIChzdWJqZWN0Lmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICAgIHN1YmplY3QgPSBzdWJqZWN0ICsgJz0nXG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0KVxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJylcbiAgICBsZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChzdWJqZWN0LCBlbmNvZGluZylcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QubGVuZ3RoKSAvLyBBc3N1bWUgb2JqZWN0IGlzIGFuIGFycmF5XG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBhdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiB0aGlzIGluc3RhbmNlIG9mIEJ1ZmZlclxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKSB7XG4gICAgLy8gU3BlZWQgb3B0aW1pemF0aW9uIC0tIHVzZSBzZXQgaWYgd2UncmUgY29weWluZyBmcm9tIGEgVWludDhBcnJheVxuICAgIGJ1Zi5zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgICAgZWxzZVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0W2ldXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFicm93c2VyU3VwcG9ydCAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBTVEFUSUMgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXR1cm4gdHJ1ZVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIChiKSB7XG4gIHJldHVybiBiICYmIGIuX2lzQnVmZmVyXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0dXJuIHN0ci5sZW5ndGggLyAyXG5cbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXR1cm4gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcblxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0dXJuIHN0ci5sZW5ndGhcblxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXR1cm4gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBpZiAoIWlzQXJyYXkobGlzdCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3QsIFt0b3RhbExlbmd0aF0pXFxuJyArXG4gICAgICAgICdsaXN0IHNob3VsZCBiZSBhbiBBcnJheS4nKVxuICB9XG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHRvdGFsTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbi8vIEJVRkZFUiBJTlNUQU5DRSBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBfaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBpZiAoc3RyTGVuICUgMiAhPT0gMCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcbiAgfVxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgaWYgKGlzTmFOKGJ5dGUpKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gaSAqIDJcbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gX3V0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBieXRlcywgcG9zXG4gIHJldHVybiBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gX2FzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgYnl0ZXMsIHBvc1xuICByZXR1cm4gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gX2FzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgYnl0ZXMsIHBvc1xuICByZXR1cm4gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldHVybiBfaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldHVybiBfdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXR1cm4gX2FzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXR1cm4gX2JpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0dXJuIF9iYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcbiAgc3RhcnQgPSBOdW1iZXIoc3RhcnQpIHx8IDBcbiAgZW5kID0gKGVuZCAhPT0gdW5kZWZpbmVkKVxuICAgID8gTnVtYmVyKGVuZClcbiAgICA6IGVuZCA9IHNlbGYubGVuZ3RoXG5cbiAgLy8gRmFzdHBhdGggZW1wdHkgc3RyaW5nc1xuICBpZiAoZW5kID09PSBzdGFydClcbiAgICByZXR1cm4gJydcblxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldHVybiBfaGV4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcblxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldHVybiBfdXRmOFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG5cbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXR1cm4gX2FzY2lpU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcblxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXR1cm4gX2JpbmFyeVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG5cbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0dXJuIF9iYXNlNjRTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGlmIChlbmQgPCBzdGFydClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgaWYgKHRhcmdldF9zdGFydCA8IDAgfHwgdGFyZ2V0X3N0YXJ0ID49IHRhcmdldC5sZW5ndGgpXG4gICAgdGhyb3cgbmV3IEVycm9yKCd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSBzb3VyY2UubGVuZ3RoKVxuICAgIHRocm93IG5ldyBFcnJvcignc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHNvdXJjZS5sZW5ndGgpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKVxuICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpXG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCArIHN0YXJ0XG5cbiAgLy8gY29weSFcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbmQgLSBzdGFydDsgaSsrKVxuICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIF91dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gX2FzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKVxuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBfYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gX2FzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBfaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG4vLyBUT0RPOiBhZGQgdGVzdCB0aGF0IG1vZGlmeWluZyB0aGUgbmV3IGJ1ZmZlciBzbGljZSB3aWxsIG1vZGlmeSBtZW1vcnkgaW4gdGhlXG4vLyBvcmlnaW5hbCBidWZmZXIhIFVzZSBjb2RlIGZyb206XG4vLyBodHRwOi8vbm9kZWpzLm9yZy9hcGkvYnVmZmVyLmh0bWwjYnVmZmVyX2J1Zl9zbGljZV9zdGFydF9lbmRcbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSBjbGFtcChzdGFydCwgbGVuLCAwKVxuICBlbmQgPSBjbGFtcChlbmQsIGxlbiwgbGVuKVxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIHJldHVybiBhdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gVE9ETzogc2xpY2luZyB3b3Jrcywgd2l0aCBsaW1pdGF0aW9ucyAobm8gcGFyZW50IHRyYWNraW5nL3VwZGF0ZSlcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vZmVyb3NzL25hdGl2ZS1idWZmZXItYnJvd3NlcmlmeS9pc3N1ZXMvOVxuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgdmFyIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZCwgdHJ1ZSlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgICByZXR1cm4gbmV3QnVmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YXIgYnVmID0gdGhpc1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gYnVmLmxlbmd0aClcbiAgICByZXR1cm5cblxuICByZXR1cm4gYnVmW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbikge1xuICAgICAgcmV0dXJuIGJ1Zi5fZGF0YXZpZXcuZ2V0VWludDE2KG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDIpKVxuICAgICAgZHYuc2V0VWludDgoMCwgYnVmW2xlbiAtIDFdKVxuICAgICAgcmV0dXJuIGR2LmdldFVpbnQxNigwLCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciB2YWxcbiAgICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgICB2YWwgPSBidWZbb2Zmc2V0XVxuICAgICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICAgIH0gZWxzZSB7XG4gICAgICB2YWwgPSBidWZbb2Zmc2V0XSA8PCA4XG4gICAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXVxuICAgIH1cbiAgICByZXR1cm4gdmFsXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pIHtcbiAgICAgIHJldHVybiBidWYuX2RhdGF2aWV3LmdldFVpbnQzMihvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGR2ID0gbmV3IERhdGFWaWV3KG5ldyBBcnJheUJ1ZmZlcig0KSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpICsgb2Zmc2V0IDwgbGVuOyBpKyspIHtcbiAgICAgICAgZHYuc2V0VWludDgoaSwgYnVmW2kgKyBvZmZzZXRdKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGR2LmdldFVpbnQzMigwLCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciB2YWxcbiAgICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgICAgdmFsID0gYnVmW29mZnNldCArIDJdIDw8IDE2XG4gICAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgICB2YWwgfD0gYnVmW29mZnNldF1cbiAgICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldCArIDNdIDw8IDI0ID4+PiAwKVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgICAgdmFsID0gYnVmW29mZnNldCArIDFdIDw8IDE2XG4gICAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAyXSA8PCA4XG4gICAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAzXVxuICAgICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXRdIDw8IDI0ID4+PiAwKVxuICAgIH1cbiAgICByZXR1cm4gdmFsXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YXIgYnVmID0gdGhpc1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCxcbiAgICAgICAgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gYnVmLmxlbmd0aClcbiAgICByZXR1cm5cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICByZXR1cm4gYnVmLl9kYXRhdmlldy5nZXRJbnQ4KG9mZnNldClcbiAgfSBlbHNlIHtcbiAgICB2YXIgbmVnID0gYnVmW29mZnNldF0gJiAweDgwXG4gICAgaWYgKG5lZylcbiAgICAgIHJldHVybiAoMHhmZiAtIGJ1ZltvZmZzZXRdICsgMSkgKiAtMVxuICAgIGVsc2VcbiAgICAgIHJldHVybiBidWZbb2Zmc2V0XVxuICB9XG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA9PT0gbGVuKSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDIpKVxuICAgICAgZHYuc2V0VWludDgoMCwgYnVmW2xlbiAtIDFdKVxuICAgICAgcmV0dXJuIGR2LmdldEludDE2KDAsIGxpdHRsZUVuZGlhbilcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGJ1Zi5fZGF0YXZpZXcuZ2V0SW50MTYob2Zmc2V0LCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciB2YWwgPSBfcmVhZFVJbnQxNihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICAgIHZhciBuZWcgPSB2YWwgJiAweDgwMDBcbiAgICBpZiAobmVnKVxuICAgICAgcmV0dXJuICgweGZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gICAgZWxzZVxuICAgICAgcmV0dXJuIHZhbFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICBpZiAob2Zmc2V0ICsgMyA+PSBsZW4pIHtcbiAgICAgIHZhciBkdiA9IG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoNCkpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSArIG9mZnNldCA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGR2LnNldFVpbnQ4KGksIGJ1ZltpICsgb2Zmc2V0XSlcbiAgICAgIH1cbiAgICAgIHJldHVybiBkdi5nZXRJbnQzMigwLCBsaXR0bGVFbmRpYW4pXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBidWYuX2RhdGF2aWV3LmdldEludDMyKG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgdmFsID0gX3JlYWRVSW50MzIoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgICB2YXIgbmVnID0gdmFsICYgMHg4MDAwMDAwMFxuICAgIGlmIChuZWcpXG4gICAgICByZXR1cm4gKDB4ZmZmZmZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gICAgZWxzZVxuICAgICAgcmV0dXJuIHZhbFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRmxvYXQgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgcmV0dXJuIGJ1Zi5fZGF0YXZpZXcuZ2V0RmxvYXQzMihvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRG91YmxlIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIHJldHVybiBidWYuX2RhdGF2aWV3LmdldEZsb2F0NjQob2Zmc2V0LCBsaXR0bGVFbmRpYW4pXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhciBidWYgPSB0aGlzXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZilcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gYnVmLmxlbmd0aCkgcmV0dXJuXG5cbiAgYnVmW29mZnNldF0gPSB2YWx1ZVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgaWYgKG9mZnNldCArIDEgPT09IGxlbikge1xuICAgICAgdmFyIGR2ID0gbmV3IERhdGFWaWV3KG5ldyBBcnJheUJ1ZmZlcigyKSlcbiAgICAgIGR2LnNldFVpbnQxNigwLCB2YWx1ZSwgbGl0dGxlRW5kaWFuKVxuICAgICAgYnVmW29mZnNldF0gPSBkdi5nZXRVaW50OCgwKVxuICAgIH0gZWxzZSB7XG4gICAgICBidWYuX2RhdGF2aWV3LnNldFVpbnQxNihvZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgICAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgICAgICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgICB9XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmZmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIGlcbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgaWYgKG9mZnNldCArIDMgPj0gbGVuKSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDQpKVxuICAgICAgZHYuc2V0VWludDMyKDAsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgICBmb3IgKGkgPSAwOyBpICsgb2Zmc2V0IDwgbGVuOyBpKyspIHtcbiAgICAgICAgYnVmW2kgKyBvZmZzZXRdID0gZHYuZ2V0VWludDgoaSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgYnVmLl9kYXRhdmlldy5zZXRVaW50MzIob2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgICAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gICAgfVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YXIgYnVmID0gdGhpc1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2YsIC0weDgwKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSBidWYubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIGJ1Zi5fZGF0YXZpZXcuc2V0SW50OChvZmZzZXQsIHZhbHVlKVxuICB9IGVsc2Uge1xuICAgIGlmICh2YWx1ZSA+PSAwKVxuICAgICAgYnVmLndyaXRlVUludDgodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpXG4gICAgZWxzZVxuICAgICAgYnVmLndyaXRlVUludDgoMHhmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgfVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmYsIC0weDgwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA9PT0gbGVuKSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDIpKVxuICAgICAgZHYuc2V0SW50MTYoMCwgdmFsdWUsIGxpdHRsZUVuZGlhbilcbiAgICAgIGJ1ZltvZmZzZXRdID0gZHYuZ2V0VWludDgoMClcbiAgICB9IGVsc2Uge1xuICAgICAgYnVmLl9kYXRhdmlldy5zZXRJbnQxNihvZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmICh2YWx1ZSA+PSAwKVxuICAgICAgX3dyaXRlVUludDE2KGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgICBlbHNlXG4gICAgICBfd3JpdGVVSW50MTYoYnVmLCAweGZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIGlmIChvZmZzZXQgKyAzID49IGxlbikge1xuICAgICAgdmFyIGR2ID0gbmV3IERhdGFWaWV3KG5ldyBBcnJheUJ1ZmZlcig0KSlcbiAgICAgIGR2LnNldEludDMyKDAsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSArIG9mZnNldCA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGJ1ZltpICsgb2Zmc2V0XSA9IGR2LmdldFVpbnQ4KGkpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1Zi5fZGF0YXZpZXcuc2V0SW50MzIob2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAodmFsdWUgPj0gMClcbiAgICAgIF93cml0ZVVJbnQzMihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gICAgZWxzZVxuICAgICAgX3dyaXRlVUludDMyKGJ1ZiwgMHhmZmZmZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgaWYgKG9mZnNldCArIDMgPj0gbGVuKSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDQpKVxuICAgICAgZHYuc2V0RmxvYXQzMigwLCB2YWx1ZSwgbGl0dGxlRW5kaWFuKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgKyBvZmZzZXQgPCBsZW47IGkrKykge1xuICAgICAgICBidWZbaSArIG9mZnNldF0gPSBkdi5nZXRVaW50OChpKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBidWYuX2RhdGF2aWV3LnNldEZsb2F0MzIob2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsXG4gICAgICAgICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIGlmIChvZmZzZXQgKyA3ID49IGxlbikge1xuICAgICAgdmFyIGR2ID0gbmV3IERhdGFWaWV3KG5ldyBBcnJheUJ1ZmZlcig4KSlcbiAgICAgIGR2LnNldEZsb2F0NjQoMCwgdmFsdWUsIGxpdHRsZUVuZGlhbilcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpICsgb2Zmc2V0IDwgbGVuOyBpKyspIHtcbiAgICAgICAgYnVmW2kgKyBvZmZzZXRdID0gZHYuZ2V0VWludDgoaSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgYnVmLl9kYXRhdmlldy5zZXRGbG9hdDY0KG9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YWx1ZSA9IHZhbHVlLmNoYXJDb2RlQXQoMClcbiAgfVxuXG4gIGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInIHx8IGlzTmFOKHZhbHVlKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigndmFsdWUgaXMgbm90IGEgbnVtYmVyJylcbiAgfVxuXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IEVycm9yKCdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBpZiAoc3RhcnQgPCAwIHx8IHN0YXJ0ID49IHRoaXMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgfVxuXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHRoaXMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdlbmQgb3V0IG9mIGJvdW5kcycpXG4gIH1cblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHRoaXNbaV0gPSB2YWx1ZVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG91dCA9IFtdXG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgb3V0W2ldID0gdG9IZXgodGhpc1tpXSlcbiAgICBpZiAoaSA9PT0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUykge1xuICAgICAgb3V0W2kgKyAxXSA9ICcuLi4nXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIG91dC5qb2luKCcgJykgKyAnPidcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE5vdCBhZGRlZCB0byBCdWZmZXIucHJvdG90eXBlIHNpbmNlIGl0IHNob3VsZCBvbmx5XG4gKiBiZSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5mdW5jdGlvbiBCdWZmZXJUb0FycmF5QnVmZmVyICgpIHtcbiAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbmZ1bmN0aW9uIGF1Z21lbnQgKGFycikge1xuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIEF1Z21lbnQgdGhlIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQnVmZmVyVG9BcnJheUJ1ZmZlclxuXG4gIGlmIChhcnIuYnl0ZUxlbmd0aCAhPT0gMClcbiAgICBhcnIuX2RhdGF2aWV3ID0gbmV3IERhdGFWaWV3KGFyci5idWZmZXIsIGFyci5ieXRlT2Zmc2V0LCBhcnIuYnl0ZUxlbmd0aClcblxuICByZXR1cm4gYXJyXG59XG5cbi8vIHNsaWNlKHN0YXJ0LCBlbmQpXG5mdW5jdGlvbiBjbGFtcCAoaW5kZXgsIGxlbiwgZGVmYXVsdFZhbHVlKSB7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09ICdudW1iZXInKSByZXR1cm4gZGVmYXVsdFZhbHVlXG4gIGluZGV4ID0gfn5pbmRleDsgIC8vIENvZXJjZSB0byBpbnRlZ2VyLlxuICBpZiAoaW5kZXggPj0gbGVuKSByZXR1cm4gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgaW5kZXggKz0gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gY29lcmNlIChsZW5ndGgpIHtcbiAgLy8gQ29lcmNlIGxlbmd0aCB0byBhIG51bWJlciAocG9zc2libHkgTmFOKSwgcm91bmQgdXBcbiAgLy8gaW4gY2FzZSBpdCdzIGZyYWN0aW9uYWwgKGUuZy4gMTIzLjQ1NikgdGhlbiBkbyBhXG4gIC8vIGRvdWJsZSBuZWdhdGUgdG8gY29lcmNlIGEgTmFOIHRvIDAuIEVhc3ksIHJpZ2h0P1xuICBsZW5ndGggPSB+fk1hdGguY2VpbCgrbGVuZ3RoKVxuICByZXR1cm4gbGVuZ3RoIDwgMCA/IDAgOiBsZW5ndGhcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoc3ViamVjdCkge1xuICByZXR1cm4gKEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHN1YmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHN1YmplY3QpID09PSAnW29iamVjdCBBcnJheV0nXG4gIH0pKHN1YmplY3QpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKVxuICAgIGlmIChzdHIuY2hhckNvZGVBdChpKSA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgaCA9IGVuY29kZVVSSUNvbXBvbmVudChzdHIuY2hhckF0KGkpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBwb3NcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG5cbi8qXG4gKiBXZSBoYXZlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSB2YWx1ZSBpcyBhIHZhbGlkIGludGVnZXIuIFRoaXMgbWVhbnMgdGhhdCBpdFxuICogaXMgbm9uLW5lZ2F0aXZlLiBJdCBoYXMgbm8gZnJhY3Rpb25hbCBjb21wb25lbnQgYW5kIHRoYXQgaXQgZG9lcyBub3RcbiAqIGV4Y2VlZCB0aGUgbWF4aW11bSBhbGxvd2VkIHZhbHVlLlxuICovXG5mdW5jdGlvbiB2ZXJpZnVpbnQgKHZhbHVlLCBtYXgpIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPj0gMCxcbiAgICAgICdzcGVjaWZpZWQgYSBuZWdhdGl2ZSB2YWx1ZSBmb3Igd3JpdGluZyBhbiB1bnNpZ25lZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBpcyBsYXJnZXIgdGhhbiBtYXhpbXVtIHZhbHVlIGZvciB0eXBlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZzaW50KHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmSUVFRTc1NCh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxufVxuXG5mdW5jdGlvbiBhc3NlcnQgKHRlc3QsIG1lc3NhZ2UpIHtcbiAgaWYgKCF0ZXN0KSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSB8fCAnRmFpbGVkIGFzc2VydGlvbicpXG59XG5cbn0se1wiYmFzZTY0LWpzXCI6MyxcImllZWU3NTRcIjo0fV0sXCJuYXRpdmUtYnVmZmVyLWJyb3dzZXJpZnlcIjpbZnVuY3Rpb24ocmVxdWlyZSxtb2R1bGUsZXhwb3J0cyl7XG5tb2R1bGUuZXhwb3J0cz1yZXF1aXJlKCdQY1pqOUwnKTtcbn0se31dLDM6W2Z1bmN0aW9uKHJlcXVpcmUsbW9kdWxlLGV4cG9ydHMpe1xuKGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuXHR2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5KGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyO1xuXHRcblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyAnSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCc7XG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHBsYWNlSG9sZGVycyA9IGluZGV4T2YoYjY0LCAnPScpO1xuXHRcdHBsYWNlSG9sZGVycyA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gcGxhY2VIb2xkZXJzIDogMDtcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IFtdOy8vbmV3IFVpbnQ4QXJyYXkoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKTtcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aDtcblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChpbmRleE9mKGxvb2t1cCwgYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGluZGV4T2YobG9va3VwLCBiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGluZGV4T2YobG9va3VwLCBiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBpbmRleE9mKGxvb2t1cCwgYjY0LmNoYXJBdChpICsgMykpO1xuXHRcdFx0YXJyLnB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNik7XG5cdFx0XHRhcnIucHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KTtcblx0XHRcdGFyci5wdXNoKHRtcCAmIDB4RkYpO1xuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChpbmRleE9mKGxvb2t1cCwgYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoaW5kZXhPZihsb29rdXAsIGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KTtcblx0XHRcdGFyci5wdXNoKHRtcCAmIDB4RkYpO1xuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoaW5kZXhPZihsb29rdXAsIGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChpbmRleE9mKGxvb2t1cCwgYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGluZGV4T2YobG9va3VwLCBiNjQuY2hhckF0KGkgKyAyKSkgPj4gMik7XG5cdFx0XHRhcnIucHVzaCgodG1wID4+IDgpICYgMHhGRik7XG5cdFx0XHRhcnIucHVzaCh0bXAgJiAweEZGKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyO1xuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoO1xuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSA+PiAxOCAmIDB4M0YpICsgbG9va3VwLmNoYXJBdChudW0gPj4gMTIgJiAweDNGKSArIGxvb2t1cC5jaGFyQXQobnVtID4+IDYgJiAweDNGKSArIGxvb2t1cC5jaGFyQXQobnVtICYgMHgzRik7XG5cdFx0fTtcblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pO1xuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKTtcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXTtcblx0XHRcdFx0b3V0cHV0ICs9IGxvb2t1cC5jaGFyQXQodGVtcCA+PiAyKTtcblx0XHRcdFx0b3V0cHV0ICs9IGxvb2t1cC5jaGFyQXQoKHRlbXAgPDwgNCkgJiAweDNGKTtcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSc7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKTtcblx0XHRcdFx0b3V0cHV0ICs9IGxvb2t1cC5jaGFyQXQodGVtcCA+PiAxMCk7XG5cdFx0XHRcdG91dHB1dCArPSBsb29rdXAuY2hhckF0KCh0ZW1wID4+IDQpICYgMHgzRik7XG5cdFx0XHRcdG91dHB1dCArPSBsb29rdXAuY2hhckF0KCh0ZW1wIDw8IDIpICYgMHgzRik7XG5cdFx0XHRcdG91dHB1dCArPSAnPSc7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRtb2R1bGUuZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5O1xuXHRtb2R1bGUuZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NDtcbn0oKSk7XG5cbmZ1bmN0aW9uIGluZGV4T2YgKGFyciwgZWx0IC8qLCBmcm9tKi8pIHtcblx0dmFyIGxlbiA9IGFyci5sZW5ndGg7XG5cblx0dmFyIGZyb20gPSBOdW1iZXIoYXJndW1lbnRzWzFdKSB8fCAwO1xuXHRmcm9tID0gKGZyb20gPCAwKVxuXHRcdD8gTWF0aC5jZWlsKGZyb20pXG5cdFx0OiBNYXRoLmZsb29yKGZyb20pO1xuXHRpZiAoZnJvbSA8IDApXG5cdFx0ZnJvbSArPSBsZW47XG5cblx0Zm9yICg7IGZyb20gPCBsZW47IGZyb20rKykge1xuXHRcdGlmICgodHlwZW9mIGFyciA9PT0gJ3N0cmluZycgJiYgYXJyLmNoYXJBdChmcm9tKSA9PT0gZWx0KSB8fFxuXHRcdFx0XHQodHlwZW9mIGFyciAhPT0gJ3N0cmluZycgJiYgYXJyW2Zyb21dID09PSBlbHQpKSB7XG5cdFx0XHRyZXR1cm4gZnJvbTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIC0xO1xufVxuXG59LHt9XSw0OltmdW5jdGlvbihyZXF1aXJlLG1vZHVsZSxleHBvcnRzKXtcbmV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuXG59LHt9XX0se30sW10pXG47O21vZHVsZS5leHBvcnRzPXJlcXVpcmUoXCJuYXRpdmUtYnVmZmVyLWJyb3dzZXJpZnlcIikuQnVmZmVyXG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgaWYgKGV2LnNvdXJjZSA9PT0gd2luZG93ICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsInZhciBnbG9iYWw9dHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9Oy8qISBodHRwOi8vbXRocy5iZS9wdW55Y29kZSB2MS4yLjMgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZXMgKi9cblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cztcblx0dmFyIGZyZWVNb2R1bGUgPSB0eXBlb2YgbW9kdWxlID09ICdvYmplY3QnICYmIG1vZHVsZSAmJlxuXHRcdG1vZHVsZS5leHBvcnRzID09IGZyZWVFeHBvcnRzICYmIG1vZHVsZTtcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8IGZyZWVHbG9iYWwud2luZG93ID09PSBmcmVlR2xvYmFsKSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBwdW55Y29kZWAgb2JqZWN0LlxuXHQgKiBAbmFtZSBwdW55Y29kZVxuXHQgKiBAdHlwZSBPYmplY3Rcblx0ICovXG5cdHZhciBwdW55Y29kZSxcblxuXHQvKiogSGlnaGVzdCBwb3NpdGl2ZSBzaWduZWQgMzItYml0IGZsb2F0IHZhbHVlICovXG5cdG1heEludCA9IDIxNDc0ODM2NDcsIC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuXHQvKiogQm9vdHN0cmluZyBwYXJhbWV0ZXJzICovXG5cdGJhc2UgPSAzNixcblx0dE1pbiA9IDEsXG5cdHRNYXggPSAyNixcblx0c2tldyA9IDM4LFxuXHRkYW1wID0gNzAwLFxuXHRpbml0aWFsQmlhcyA9IDcyLFxuXHRpbml0aWFsTiA9IDEyOCwgLy8gMHg4MFxuXHRkZWxpbWl0ZXIgPSAnLScsIC8vICdcXHgyRCdcblxuXHQvKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuXHRyZWdleFB1bnljb2RlID0gL154bi0tLyxcblx0cmVnZXhOb25BU0NJSSA9IC9bXiAtfl0vLCAvLyB1bnByaW50YWJsZSBBU0NJSSBjaGFycyArIG5vbi1BU0NJSSBjaGFyc1xuXHRyZWdleFNlcGFyYXRvcnMgPSAvXFx4MkV8XFx1MzAwMnxcXHVGRjBFfFxcdUZGNjEvZywgLy8gUkZDIDM0OTAgc2VwYXJhdG9yc1xuXG5cdC8qKiBFcnJvciBtZXNzYWdlcyAqL1xuXHRlcnJvcnMgPSB7XG5cdFx0J292ZXJmbG93JzogJ092ZXJmbG93OiBpbnB1dCBuZWVkcyB3aWRlciBpbnRlZ2VycyB0byBwcm9jZXNzJyxcblx0XHQnbm90LWJhc2ljJzogJ0lsbGVnYWwgaW5wdXQgPj0gMHg4MCAobm90IGEgYmFzaWMgY29kZSBwb2ludCknLFxuXHRcdCdpbnZhbGlkLWlucHV0JzogJ0ludmFsaWQgaW5wdXQnXG5cdH0sXG5cblx0LyoqIENvbnZlbmllbmNlIHNob3J0Y3V0cyAqL1xuXHRiYXNlTWludXNUTWluID0gYmFzZSAtIHRNaW4sXG5cdGZsb29yID0gTWF0aC5mbG9vcixcblx0c3RyaW5nRnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZSxcblxuXHQvKiogVGVtcG9yYXJ5IHZhcmlhYmxlICovXG5cdGtleTtcblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGVycm9yIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIFRoZSBlcnJvciB0eXBlLlxuXHQgKiBAcmV0dXJucyB7RXJyb3J9IFRocm93cyBhIGBSYW5nZUVycm9yYCB3aXRoIHRoZSBhcHBsaWNhYmxlIGVycm9yIG1lc3NhZ2UuXG5cdCAqL1xuXHRmdW5jdGlvbiBlcnJvcih0eXBlKSB7XG5cdFx0dGhyb3cgUmFuZ2VFcnJvcihlcnJvcnNbdHlwZV0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBgQXJyYXkjbWFwYCB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnkgYXJyYXlcblx0ICogaXRlbS5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBhcnJheSBvZiB2YWx1ZXMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwKGFycmF5LCBmbikge1xuXHRcdHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cdFx0d2hpbGUgKGxlbmd0aC0tKSB7XG5cdFx0XHRhcnJheVtsZW5ndGhdID0gZm4oYXJyYXlbbGVuZ3RoXSk7XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHNpbXBsZSBgQXJyYXkjbWFwYC1saWtlIHdyYXBwZXIgdG8gd29yayB3aXRoIGRvbWFpbiBuYW1lIHN0cmluZ3MuXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnlcblx0ICogY2hhcmFjdGVyLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IHN0cmluZyBvZiBjaGFyYWN0ZXJzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFja1xuXHQgKiBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcERvbWFpbihzdHJpbmcsIGZuKSB7XG5cdFx0cmV0dXJuIG1hcChzdHJpbmcuc3BsaXQocmVnZXhTZXBhcmF0b3JzKSwgZm4pLmpvaW4oJy4nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIG51bWVyaWMgY29kZSBwb2ludHMgb2YgZWFjaCBVbmljb2RlXG5cdCAqIGNoYXJhY3RlciBpbiB0aGUgc3RyaW5nLiBXaGlsZSBKYXZhU2NyaXB0IHVzZXMgVUNTLTIgaW50ZXJuYWxseSxcblx0ICogdGhpcyBmdW5jdGlvbiB3aWxsIGNvbnZlcnQgYSBwYWlyIG9mIHN1cnJvZ2F0ZSBoYWx2ZXMgKGVhY2ggb2Ygd2hpY2hcblx0ICogVUNTLTIgZXhwb3NlcyBhcyBzZXBhcmF0ZSBjaGFyYWN0ZXJzKSBpbnRvIGEgc2luZ2xlIGNvZGUgcG9pbnQsXG5cdCAqIG1hdGNoaW5nIFVURi0xNi5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5lbmNvZGVgXG5cdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGRlY29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIFRoZSBVbmljb2RlIGlucHV0IHN0cmluZyAoVUNTLTIpLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBuZXcgYXJyYXkgb2YgY29kZSBwb2ludHMuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cmluZykge1xuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgY291bnRlciA9IDAsXG5cdFx0ICAgIGxlbmd0aCA9IHN0cmluZy5sZW5ndGgsXG5cdFx0ICAgIHZhbHVlLFxuXHRcdCAgICBleHRyYTtcblx0XHR3aGlsZSAoY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0aWYgKHZhbHVlID49IDB4RDgwMCAmJiB2YWx1ZSA8PSAweERCRkYgJiYgY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBoaWdoIHN1cnJvZ2F0ZSwgYW5kIHRoZXJlIGlzIGEgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0ZXh0cmEgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0XHRpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gbG93IHN1cnJvZ2F0ZVxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCgodmFsdWUgJiAweDNGRikgPDwgMTApICsgKGV4dHJhICYgMHgzRkYpICsgMHgxMDAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlIG5leHRcblx0XHRcdFx0XHQvLyBjb2RlIHVuaXQgaXMgdGhlIGhpZ2ggc3Vycm9nYXRlIG9mIGEgc3Vycm9nYXRlIHBhaXJcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y291bnRlci0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHN0cmluZyBiYXNlZCBvbiBhbiBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmRlY29kZWBcblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZW5jb2RlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGNvZGVQb2ludHMgVGhlIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBuZXcgVW5pY29kZSBzdHJpbmcgKFVDUy0yKS5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJlbmNvZGUoYXJyYXkpIHtcblx0XHRyZXR1cm4gbWFwKGFycmF5LCBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFyIG91dHB1dCA9ICcnO1xuXHRcdFx0aWYgKHZhbHVlID4gMHhGRkZGKSB7XG5cdFx0XHRcdHZhbHVlIC09IDB4MTAwMDA7XG5cdFx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApO1xuXHRcdFx0XHR2YWx1ZSA9IDB4REMwMCB8IHZhbHVlICYgMHgzRkY7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSkuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBiYXNpYyBjb2RlIHBvaW50IGludG8gYSBkaWdpdC9pbnRlZ2VyLlxuXHQgKiBAc2VlIGBkaWdpdFRvQmFzaWMoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvZGVQb2ludCBUaGUgYmFzaWMgbnVtZXJpYyBjb2RlIHBvaW50IHZhbHVlLlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQgKGZvciB1c2UgaW5cblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpbiB0aGUgcmFuZ2UgYDBgIHRvIGBiYXNlIC0gMWAsIG9yIGBiYXNlYCBpZlxuXHQgKiB0aGUgY29kZSBwb2ludCBkb2VzIG5vdCByZXByZXNlbnQgYSB2YWx1ZS5cblx0ICovXG5cdGZ1bmN0aW9uIGJhc2ljVG9EaWdpdChjb2RlUG9pbnQpIHtcblx0XHRpZiAoY29kZVBvaW50IC0gNDggPCAxMCkge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDIyO1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gNjUgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDY1O1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gOTcgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDk3O1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGRpZ2l0L2ludGVnZXIgaW50byBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEBzZWUgYGJhc2ljVG9EaWdpdCgpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gZGlnaXQgVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgYmFzaWMgY29kZSBwb2ludCB3aG9zZSB2YWx1ZSAod2hlbiB1c2VkIGZvclxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGlzIGBkaWdpdGAsIHdoaWNoIG5lZWRzIHRvIGJlIGluIHRoZSByYW5nZVxuXHQgKiBgMGAgdG8gYGJhc2UgLSAxYC4gSWYgYGZsYWdgIGlzIG5vbi16ZXJvLCB0aGUgdXBwZXJjYXNlIGZvcm0gaXNcblx0ICogdXNlZDsgZWxzZSwgdGhlIGxvd2VyY2FzZSBmb3JtIGlzIHVzZWQuIFRoZSBiZWhhdmlvciBpcyB1bmRlZmluZWRcblx0ICogaWYgYGZsYWdgIGlzIG5vbi16ZXJvIGFuZCBgZGlnaXRgIGhhcyBubyB1cHBlcmNhc2UgZm9ybS5cblx0ICovXG5cdGZ1bmN0aW9uIGRpZ2l0VG9CYXNpYyhkaWdpdCwgZmxhZykge1xuXHRcdC8vICAwLi4yNSBtYXAgdG8gQVNDSUkgYS4ueiBvciBBLi5aXG5cdFx0Ly8gMjYuLjM1IG1hcCB0byBBU0NJSSAwLi45XG5cdFx0cmV0dXJuIGRpZ2l0ICsgMjIgKyA3NSAqIChkaWdpdCA8IDI2KSAtICgoZmxhZyAhPSAwKSA8PCA1KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCaWFzIGFkYXB0YXRpb24gZnVuY3Rpb24gYXMgcGVyIHNlY3Rpb24gMy40IG9mIFJGQyAzNDkyLlxuXHQgKiBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNDkyI3NlY3Rpb24tMy40XG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRmdW5jdGlvbiBhZGFwdChkZWx0YSwgbnVtUG9pbnRzLCBmaXJzdFRpbWUpIHtcblx0XHR2YXIgayA9IDA7XG5cdFx0ZGVsdGEgPSBmaXJzdFRpbWUgPyBmbG9vcihkZWx0YSAvIGRhbXApIDogZGVsdGEgPj4gMTtcblx0XHRkZWx0YSArPSBmbG9vcihkZWx0YSAvIG51bVBvaW50cyk7XG5cdFx0Zm9yICgvKiBubyBpbml0aWFsaXphdGlvbiAqLzsgZGVsdGEgPiBiYXNlTWludXNUTWluICogdE1heCA+PiAxOyBrICs9IGJhc2UpIHtcblx0XHRcdGRlbHRhID0gZmxvb3IoZGVsdGEgLyBiYXNlTWludXNUTWluKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZsb29yKGsgKyAoYmFzZU1pbnVzVE1pbiArIDEpICogZGVsdGEgLyAoZGVsdGEgKyBza2V3KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzIHRvIGEgc3RyaW5nIG9mIFVuaWNvZGVcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGVjb2RlKGlucHV0KSB7XG5cdFx0Ly8gRG9uJ3QgdXNlIFVDUy0yXG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aCxcblx0XHQgICAgb3V0LFxuXHRcdCAgICBpID0gMCxcblx0XHQgICAgbiA9IGluaXRpYWxOLFxuXHRcdCAgICBiaWFzID0gaW5pdGlhbEJpYXMsXG5cdFx0ICAgIGJhc2ljLFxuXHRcdCAgICBqLFxuXHRcdCAgICBpbmRleCxcblx0XHQgICAgb2xkaSxcblx0XHQgICAgdyxcblx0XHQgICAgayxcblx0XHQgICAgZGlnaXQsXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGxlbmd0aCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIHRvIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHlcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFVuaWNvZGUuIE9ubHkgdGhlXG5cdCAqIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgb24gYSBzdHJpbmcgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCB0b1xuXHQgKiBVbmljb2RlLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgUHVueWNvZGUgZG9tYWluIG5hbWUgdG8gY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/IGRlY29kZShzdHJpbmcuc2xpY2UoNCkudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBQdW55Y29kZS4gT25seSB0aGVcblx0ICogbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgdG8gY29udmVydCwgYXMgYSBVbmljb2RlIHN0cmluZy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFB1bnljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBkb21haW4gbmFtZS5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gJ3huLS0nICsgZW5jb2RlKHN0cmluZylcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKiogRGVmaW5lIHRoZSBwdWJsaWMgQVBJICovXG5cdHB1bnljb2RlID0ge1xuXHRcdC8qKlxuXHRcdCAqIEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgY3VycmVudCBQdW55Y29kZS5qcyB2ZXJzaW9uIG51bWJlci5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBTdHJpbmdcblx0XHQgKi9cblx0XHQndmVyc2lvbic6ICcxLjIuMycsXG5cdFx0LyoqXG5cdFx0ICogQW4gb2JqZWN0IG9mIG1ldGhvZHMgdG8gY29udmVydCBmcm9tIEphdmFTY3JpcHQncyBpbnRlcm5hbCBjaGFyYWN0ZXJcblx0XHQgKiByZXByZXNlbnRhdGlvbiAoVUNTLTIpIHRvIFVuaWNvZGUgY29kZSBwb2ludHMsIGFuZCBiYWNrLlxuXHRcdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH1cdGVsc2UgaWYgKGZyZWVFeHBvcnRzICYmICFmcmVlRXhwb3J0cy5ub2RlVHlwZSkge1xuXHRcdGlmIChmcmVlTW9kdWxlKSB7IC8vIGluIE5vZGUuanMgb3IgUmluZ29KUyB2MC44LjArXG5cdFx0XHRmcmVlTW9kdWxlLmV4cG9ydHMgPSBwdW55Y29kZTtcblx0XHR9IGVsc2UgeyAvLyBpbiBOYXJ3aGFsIG9yIFJpbmdvSlMgdjAuNy4wLVxuXHRcdFx0Zm9yIChrZXkgaW4gcHVueWNvZGUpIHtcblx0XHRcdFx0cHVueWNvZGUuaGFzT3duUHJvcGVydHkoa2V5KSAmJiAoZnJlZUV4cG9ydHNba2V5XSA9IHB1bnljb2RlW2tleV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHsgLy8gaW4gUmhpbm8gb3IgYSB3ZWIgYnJvd3NlclxuXHRcdHJvb3QucHVueWNvZGUgPSBwdW55Y29kZTtcblx0fVxuXG59KHRoaXMpKTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG9ialtrXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUodikpO1xuICAgICAgICB9KS5qb2luKHNlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9ialtrXSkpO1xuICAgICAgfVxuICAgIH0pLmpvaW4oc2VwKTtcblxuICB9XG5cbiAgaWYgKCFuYW1lKSByZXR1cm4gJyc7XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG5hbWUpKSArIGVxICtcbiAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqKSk7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxuZnVuY3Rpb24gbWFwICh4cywgZikge1xuICBpZiAoeHMubWFwKSByZXR1cm4geHMubWFwKGYpO1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICByZXMucHVzaChmKHhzW2ldLCBpKSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSByZXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmRlY29kZSA9IGV4cG9ydHMucGFyc2UgPSByZXF1aXJlKCcuL2RlY29kZScpO1xuZXhwb3J0cy5lbmNvZGUgPSBleHBvcnRzLnN0cmluZ2lmeSA9IHJlcXVpcmUoJy4vZW5jb2RlJyk7XG4iLCIvKmpzaGludCBzdHJpY3Q6dHJ1ZSBub2RlOnRydWUgZXM1OnRydWUgb25ldmFyOnRydWUgbGF4Y29tbWE6dHJ1ZSBsYXhicmVhazp0cnVlIGVxZXFlcTp0cnVlIGltbWVkOnRydWUgbGF0ZWRlZjp0cnVlKi9cbihmdW5jdGlvbiAoKSB7XG4gIFwidXNlIHN0cmljdFwiO1xuXG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIHB1bnljb2RlID0gcmVxdWlyZSgncHVueWNvZGUnKTtcblxuZXhwb3J0cy5wYXJzZSA9IHVybFBhcnNlO1xuZXhwb3J0cy5yZXNvbHZlID0gdXJsUmVzb2x2ZTtcbmV4cG9ydHMucmVzb2x2ZU9iamVjdCA9IHVybFJlc29sdmVPYmplY3Q7XG5leHBvcnRzLmZvcm1hdCA9IHVybEZvcm1hdDtcblxuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbnZhciBwcm90b2NvbFBhdHRlcm4gPSAvXihbYS16MC05ListXSs6KS9pLFxuICAgIHBvcnRQYXR0ZXJuID0gLzpbMC05XSokLyxcblxuICAgIC8vIFJGQyAyMzk2OiBjaGFyYWN0ZXJzIHJlc2VydmVkIGZvciBkZWxpbWl0aW5nIFVSTHMuXG4gICAgLy8gV2UgYWN0dWFsbHkganVzdCBhdXRvLWVzY2FwZSB0aGVzZS5cbiAgICBkZWxpbXMgPSBbJzwnLCAnPicsICdcIicsICdgJywgJyAnLCAnXFxyJywgJ1xcbicsICdcXHQnXSxcblxuICAgIC8vIFJGQyAyMzk2OiBjaGFyYWN0ZXJzIG5vdCBhbGxvd2VkIGZvciB2YXJpb3VzIHJlYXNvbnMuXG4gICAgdW53aXNlID0gWyd7JywgJ30nLCAnfCcsICdcXFxcJywgJ14nLCAnficsICdgJ10uY29uY2F0KGRlbGltcyksXG5cbiAgICAvLyBBbGxvd2VkIGJ5IFJGQ3MsIGJ1dCBjYXVzZSBvZiBYU1MgYXR0YWNrcy4gIEFsd2F5cyBlc2NhcGUgdGhlc2UuXG4gICAgYXV0b0VzY2FwZSA9IFsnXFwnJ10uY29uY2F0KGRlbGltcyksXG4gICAgLy8gQ2hhcmFjdGVycyB0aGF0IGFyZSBuZXZlciBldmVyIGFsbG93ZWQgaW4gYSBob3N0bmFtZS5cbiAgICAvLyBOb3RlIHRoYXQgYW55IGludmFsaWQgY2hhcnMgYXJlIGFsc28gaGFuZGxlZCwgYnV0IHRoZXNlXG4gICAgLy8gYXJlIHRoZSBvbmVzIHRoYXQgYXJlICpleHBlY3RlZCogdG8gYmUgc2Vlbiwgc28gd2UgZmFzdC1wYXRoXG4gICAgLy8gdGhlbS5cbiAgICBub25Ib3N0Q2hhcnMgPSBbJyUnLCAnLycsICc/JywgJzsnLCAnIyddXG4gICAgICAuY29uY2F0KHVud2lzZSkuY29uY2F0KGF1dG9Fc2NhcGUpLFxuICAgIG5vbkF1dGhDaGFycyA9IFsnLycsICdAJywgJz8nLCAnIyddLmNvbmNhdChkZWxpbXMpLFxuICAgIGhvc3RuYW1lTWF4TGVuID0gMjU1LFxuICAgIGhvc3RuYW1lUGFydFBhdHRlcm4gPSAvXlthLXpBLVowLTldW2EtejAtOUEtWl8tXXswLDYyfSQvLFxuICAgIGhvc3RuYW1lUGFydFN0YXJ0ID0gL14oW2EtekEtWjAtOV1bYS16MC05QS1aXy1dezAsNjJ9KSguKikkLyxcbiAgICAvLyBwcm90b2NvbHMgdGhhdCBjYW4gYWxsb3cgXCJ1bnNhZmVcIiBhbmQgXCJ1bndpc2VcIiBjaGFycy5cbiAgICB1bnNhZmVQcm90b2NvbCA9IHtcbiAgICAgICdqYXZhc2NyaXB0JzogdHJ1ZSxcbiAgICAgICdqYXZhc2NyaXB0Oic6IHRydWVcbiAgICB9LFxuICAgIC8vIHByb3RvY29scyB0aGF0IG5ldmVyIGhhdmUgYSBob3N0bmFtZS5cbiAgICBob3N0bGVzc1Byb3RvY29sID0ge1xuICAgICAgJ2phdmFzY3JpcHQnOiB0cnVlLFxuICAgICAgJ2phdmFzY3JpcHQ6JzogdHJ1ZVxuICAgIH0sXG4gICAgLy8gcHJvdG9jb2xzIHRoYXQgYWx3YXlzIGhhdmUgYSBwYXRoIGNvbXBvbmVudC5cbiAgICBwYXRoZWRQcm90b2NvbCA9IHtcbiAgICAgICdodHRwJzogdHJ1ZSxcbiAgICAgICdodHRwcyc6IHRydWUsXG4gICAgICAnZnRwJzogdHJ1ZSxcbiAgICAgICdnb3BoZXInOiB0cnVlLFxuICAgICAgJ2ZpbGUnOiB0cnVlLFxuICAgICAgJ2h0dHA6JzogdHJ1ZSxcbiAgICAgICdmdHA6JzogdHJ1ZSxcbiAgICAgICdnb3BoZXI6JzogdHJ1ZSxcbiAgICAgICdmaWxlOic6IHRydWVcbiAgICB9LFxuICAgIC8vIHByb3RvY29scyB0aGF0IGFsd2F5cyBjb250YWluIGEgLy8gYml0LlxuICAgIHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgICAgICdodHRwJzogdHJ1ZSxcbiAgICAgICdodHRwcyc6IHRydWUsXG4gICAgICAnZnRwJzogdHJ1ZSxcbiAgICAgICdnb3BoZXInOiB0cnVlLFxuICAgICAgJ2ZpbGUnOiB0cnVlLFxuICAgICAgJ2h0dHA6JzogdHJ1ZSxcbiAgICAgICdodHRwczonOiB0cnVlLFxuICAgICAgJ2Z0cDonOiB0cnVlLFxuICAgICAgJ2dvcGhlcjonOiB0cnVlLFxuICAgICAgJ2ZpbGU6JzogdHJ1ZVxuICAgIH0sXG4gICAgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG5mdW5jdGlvbiB1cmxQYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh1cmwgJiYgdHlwZW9mKHVybCkgPT09ICdvYmplY3QnICYmIHVybC5ocmVmKSByZXR1cm4gdXJsO1xuXG4gIGlmICh0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICsgdHlwZW9mIHVybCk7XG4gIH1cblxuICB2YXIgb3V0ID0ge30sXG4gICAgICByZXN0ID0gdXJsO1xuXG4gIC8vIHRyaW0gYmVmb3JlIHByb2NlZWRpbmcuXG4gIC8vIFRoaXMgaXMgdG8gc3VwcG9ydCBwYXJzZSBzdHVmZiBsaWtlIFwiICBodHRwOi8vZm9vLmNvbSAgXFxuXCJcbiAgcmVzdCA9IHJlc3QudHJpbSgpO1xuXG4gIHZhciBwcm90byA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICBpZiAocHJvdG8pIHtcbiAgICBwcm90byA9IHByb3RvWzBdO1xuICAgIHZhciBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICBvdXQucHJvdG9jb2wgPSBsb3dlclByb3RvO1xuICAgIHJlc3QgPSByZXN0LnN1YnN0cihwcm90by5sZW5ndGgpO1xuICB9XG5cbiAgLy8gZmlndXJlIG91dCBpZiBpdCdzIGdvdCBhIGhvc3RcbiAgLy8gdXNlckBzZXJ2ZXIgaXMgKmFsd2F5cyogaW50ZXJwcmV0ZWQgYXMgYSBob3N0bmFtZSwgYW5kIHVybFxuICAvLyByZXNvbHV0aW9uIHdpbGwgdHJlYXQgLy9mb28vYmFyIGFzIGhvc3Q9Zm9vLHBhdGg9YmFyIGJlY2F1c2UgdGhhdCdzXG4gIC8vIGhvdyB0aGUgYnJvd3NlciByZXNvbHZlcyByZWxhdGl2ZSBVUkxzLlxuICBpZiAoc2xhc2hlc0Rlbm90ZUhvc3QgfHwgcHJvdG8gfHwgcmVzdC5tYXRjaCgvXlxcL1xcL1teQFxcL10rQFteQFxcL10rLykpIHtcbiAgICB2YXIgc2xhc2hlcyA9IHJlc3Quc3Vic3RyKDAsIDIpID09PSAnLy8nO1xuICAgIGlmIChzbGFzaGVzICYmICEocHJvdG8gJiYgaG9zdGxlc3NQcm90b2NvbFtwcm90b10pKSB7XG4gICAgICByZXN0ID0gcmVzdC5zdWJzdHIoMik7XG4gICAgICBvdXQuc2xhc2hlcyA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFob3N0bGVzc1Byb3RvY29sW3Byb3RvXSAmJlxuICAgICAgKHNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaGVkUHJvdG9jb2xbcHJvdG9dKSkpIHtcbiAgICAvLyB0aGVyZSdzIGEgaG9zdG5hbWUuXG4gICAgLy8gdGhlIGZpcnN0IGluc3RhbmNlIG9mIC8sID8sIDssIG9yICMgZW5kcyB0aGUgaG9zdC5cbiAgICAvLyBkb24ndCBlbmZvcmNlIGZ1bGwgUkZDIGNvcnJlY3RuZXNzLCBqdXN0IGJlIHVuc3R1cGlkIGFib3V0IGl0LlxuXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gQCBpbiB0aGUgaG9zdG5hbWUsIHRoZW4gbm9uLWhvc3QgY2hhcnMgKmFyZSogYWxsb3dlZFxuICAgIC8vIHRvIHRoZSBsZWZ0IG9mIHRoZSBmaXJzdCBAIHNpZ24sIHVubGVzcyBzb21lIG5vbi1hdXRoIGNoYXJhY3RlclxuICAgIC8vIGNvbWVzICpiZWZvcmUqIHRoZSBALXNpZ24uXG4gICAgLy8gVVJMcyBhcmUgb2Jub3hpb3VzLlxuICAgIHZhciBhdFNpZ24gPSByZXN0LmluZGV4T2YoJ0AnKTtcbiAgICBpZiAoYXRTaWduICE9PSAtMSkge1xuICAgICAgdmFyIGF1dGggPSByZXN0LnNsaWNlKDAsIGF0U2lnbik7XG5cbiAgICAgIC8vIHRoZXJlICptYXkgYmUqIGFuIGF1dGhcbiAgICAgIHZhciBoYXNBdXRoID0gdHJ1ZTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gbm9uQXV0aENoYXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAoYXV0aC5pbmRleE9mKG5vbkF1dGhDaGFyc1tpXSkgIT09IC0xKSB7XG4gICAgICAgICAgLy8gbm90IGEgdmFsaWQgYXV0aC4gIFNvbWV0aGluZyBsaWtlIGh0dHA6Ly9mb28uY29tL2JhckBiYXovXG4gICAgICAgICAgaGFzQXV0aCA9IGZhbHNlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChoYXNBdXRoKSB7XG4gICAgICAgIC8vIHBsdWNrIG9mZiB0aGUgYXV0aCBwb3J0aW9uLlxuICAgICAgICBvdXQuYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICAgICAgcmVzdCA9IHJlc3Quc3Vic3RyKGF0U2lnbiArIDEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBmaXJzdE5vbkhvc3QgPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IG5vbkhvc3RDaGFycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHZhciBpbmRleCA9IHJlc3QuaW5kZXhPZihub25Ib3N0Q2hhcnNbaV0pO1xuICAgICAgaWYgKGluZGV4ICE9PSAtMSAmJlxuICAgICAgICAgIChmaXJzdE5vbkhvc3QgPCAwIHx8IGluZGV4IDwgZmlyc3ROb25Ib3N0KSkgZmlyc3ROb25Ib3N0ID0gaW5kZXg7XG4gICAgfVxuXG4gICAgaWYgKGZpcnN0Tm9uSG9zdCAhPT0gLTEpIHtcbiAgICAgIG91dC5ob3N0ID0gcmVzdC5zdWJzdHIoMCwgZmlyc3ROb25Ib3N0KTtcbiAgICAgIHJlc3QgPSByZXN0LnN1YnN0cihmaXJzdE5vbkhvc3QpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXQuaG9zdCA9IHJlc3Q7XG4gICAgICByZXN0ID0gJyc7XG4gICAgfVxuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB2YXIgcCA9IHBhcnNlSG9zdChvdXQuaG9zdCk7XG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhwKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGtleXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIG91dFtrZXldID0gcFtrZXldO1xuICAgIH1cblxuICAgIC8vIHdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgLy8gc28gZXZlbiBpZiBpdCdzIGVtcHR5LCBpdCBoYXMgdG8gYmUgcHJlc2VudC5cbiAgICBvdXQuaG9zdG5hbWUgPSBvdXQuaG9zdG5hbWUgfHwgJyc7XG5cbiAgICAvLyBpZiBob3N0bmFtZSBiZWdpbnMgd2l0aCBbIGFuZCBlbmRzIHdpdGggXVxuICAgIC8vIGFzc3VtZSB0aGF0IGl0J3MgYW4gSVB2NiBhZGRyZXNzLlxuICAgIHZhciBpcHY2SG9zdG5hbWUgPSBvdXQuaG9zdG5hbWVbMF0gPT09ICdbJyAmJlxuICAgICAgICBvdXQuaG9zdG5hbWVbb3V0Lmhvc3RuYW1lLmxlbmd0aCAtIDFdID09PSAnXSc7XG5cbiAgICAvLyB2YWxpZGF0ZSBhIGxpdHRsZS5cbiAgICBpZiAob3V0Lmhvc3RuYW1lLmxlbmd0aCA+IGhvc3RuYW1lTWF4TGVuKSB7XG4gICAgICBvdXQuaG9zdG5hbWUgPSAnJztcbiAgICB9IGVsc2UgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHZhciBob3N0cGFydHMgPSBvdXQuaG9zdG5hbWUuc3BsaXQoL1xcLi8pO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBob3N0cGFydHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciBwYXJ0ID0gaG9zdHBhcnRzW2ldO1xuICAgICAgICBpZiAoIXBhcnQpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoIXBhcnQubWF0Y2goaG9zdG5hbWVQYXJ0UGF0dGVybikpIHtcbiAgICAgICAgICB2YXIgbmV3cGFydCA9ICcnO1xuICAgICAgICAgIGZvciAodmFyIGogPSAwLCBrID0gcGFydC5sZW5ndGg7IGogPCBrOyBqKyspIHtcbiAgICAgICAgICAgIGlmIChwYXJ0LmNoYXJDb2RlQXQoaikgPiAxMjcpIHtcbiAgICAgICAgICAgICAgLy8gd2UgcmVwbGFjZSBub24tQVNDSUkgY2hhciB3aXRoIGEgdGVtcG9yYXJ5IHBsYWNlaG9sZGVyXG4gICAgICAgICAgICAgIC8vIHdlIG5lZWQgdGhpcyB0byBtYWtlIHN1cmUgc2l6ZSBvZiBob3N0bmFtZSBpcyBub3RcbiAgICAgICAgICAgICAgLy8gYnJva2VuIGJ5IHJlcGxhY2luZyBub24tQVNDSUkgYnkgbm90aGluZ1xuICAgICAgICAgICAgICBuZXdwYXJ0ICs9ICd4JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5ld3BhcnQgKz0gcGFydFtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gd2UgdGVzdCBhZ2FpbiB3aXRoIEFTQ0lJIGNoYXIgb25seVxuICAgICAgICAgIGlmICghbmV3cGFydC5tYXRjaChob3N0bmFtZVBhcnRQYXR0ZXJuKSkge1xuICAgICAgICAgICAgdmFyIHZhbGlkUGFydHMgPSBob3N0cGFydHMuc2xpY2UoMCwgaSk7XG4gICAgICAgICAgICB2YXIgbm90SG9zdCA9IGhvc3RwYXJ0cy5zbGljZShpICsgMSk7XG4gICAgICAgICAgICB2YXIgYml0ID0gcGFydC5tYXRjaChob3N0bmFtZVBhcnRTdGFydCk7XG4gICAgICAgICAgICBpZiAoYml0KSB7XG4gICAgICAgICAgICAgIHZhbGlkUGFydHMucHVzaChiaXRbMV0pO1xuICAgICAgICAgICAgICBub3RIb3N0LnVuc2hpZnQoYml0WzJdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChub3RIb3N0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICByZXN0ID0gJy8nICsgbm90SG9zdC5qb2luKCcuJykgKyByZXN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3V0Lmhvc3RuYW1lID0gdmFsaWRQYXJ0cy5qb2luKCcuJyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBob3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgIG91dC5ob3N0bmFtZSA9IG91dC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIC8vIElETkEgU3VwcG9ydDogUmV0dXJucyBhIHB1bnkgY29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAgIC8vIEl0IG9ubHkgY29udmVydHMgdGhlIHBhcnQgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAgIC8vIGhhcyBub24gQVNDSUkgY2hhcmFjdGVycy4gSS5lLiBpdCBkb3NlbnQgbWF0dGVyIGlmXG4gICAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBpbiBBU0NJSS5cbiAgICAgIHZhciBkb21haW5BcnJheSA9IG91dC5ob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgdmFyIG5ld091dCA9IFtdO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgICd4bi0tJyArIHB1bnljb2RlLmVuY29kZShzKSA6IHMpO1xuICAgICAgfVxuICAgICAgb3V0Lmhvc3RuYW1lID0gbmV3T3V0LmpvaW4oJy4nKTtcbiAgICB9XG5cbiAgICBvdXQuaG9zdCA9IChvdXQuaG9zdG5hbWUgfHwgJycpICtcbiAgICAgICAgKChvdXQucG9ydCkgPyAnOicgKyBvdXQucG9ydCA6ICcnKTtcbiAgICBvdXQuaHJlZiArPSBvdXQuaG9zdDtcblxuICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICBpZiAoaXB2Nkhvc3RuYW1lKSB7XG4gICAgICBvdXQuaG9zdG5hbWUgPSBvdXQuaG9zdG5hbWUuc3Vic3RyKDEsIG91dC5ob3N0bmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIGlmIChyZXN0WzBdICE9PSAnLycpIHtcbiAgICAgICAgcmVzdCA9ICcvJyArIHJlc3Q7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbm93IHJlc3QgaXMgc2V0IHRvIHRoZSBwb3N0LWhvc3Qgc3R1ZmYuXG4gIC8vIGNob3Agb2ZmIGFueSBkZWxpbSBjaGFycy5cbiAgaWYgKCF1bnNhZmVQcm90b2NvbFtsb3dlclByb3RvXSkge1xuXG4gICAgLy8gRmlyc3QsIG1ha2UgMTAwJSBzdXJlIHRoYXQgYW55IFwiYXV0b0VzY2FwZVwiIGNoYXJzIGdldFxuICAgIC8vIGVzY2FwZWQsIGV2ZW4gaWYgZW5jb2RlVVJJQ29tcG9uZW50IGRvZXNuJ3QgdGhpbmsgdGhleVxuICAgIC8vIG5lZWQgdG8gYmUuXG4gICAgZm9yICh2YXIgaSA9IDAsIGwgPSBhdXRvRXNjYXBlLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgdmFyIGFlID0gYXV0b0VzY2FwZVtpXTtcbiAgICAgIHZhciBlc2MgPSBlbmNvZGVVUklDb21wb25lbnQoYWUpO1xuICAgICAgaWYgKGVzYyA9PT0gYWUpIHtcbiAgICAgICAgZXNjID0gZXNjYXBlKGFlKTtcbiAgICAgIH1cbiAgICAgIHJlc3QgPSByZXN0LnNwbGl0KGFlKS5qb2luKGVzYyk7XG4gICAgfVxuICB9XG5cblxuICAvLyBjaG9wIG9mZiBmcm9tIHRoZSB0YWlsIGZpcnN0LlxuICB2YXIgaGFzaCA9IHJlc3QuaW5kZXhPZignIycpO1xuICBpZiAoaGFzaCAhPT0gLTEpIHtcbiAgICAvLyBnb3QgYSBmcmFnbWVudCBzdHJpbmcuXG4gICAgb3V0Lmhhc2ggPSByZXN0LnN1YnN0cihoYXNoKTtcbiAgICByZXN0ID0gcmVzdC5zbGljZSgwLCBoYXNoKTtcbiAgfVxuICB2YXIgcW0gPSByZXN0LmluZGV4T2YoJz8nKTtcbiAgaWYgKHFtICE9PSAtMSkge1xuICAgIG91dC5zZWFyY2ggPSByZXN0LnN1YnN0cihxbSk7XG4gICAgb3V0LnF1ZXJ5ID0gcmVzdC5zdWJzdHIocW0gKyAxKTtcbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgb3V0LnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2Uob3V0LnF1ZXJ5KTtcbiAgICB9XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UoMCwgcW0pO1xuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIG91dC5zZWFyY2ggPSAnJztcbiAgICBvdXQucXVlcnkgPSB7fTtcbiAgfVxuICBpZiAocmVzdCkgb3V0LnBhdGhuYW1lID0gcmVzdDtcbiAgaWYgKHNsYXNoZWRQcm90b2NvbFtwcm90b10gJiZcbiAgICAgIG91dC5ob3N0bmFtZSAmJiAhb3V0LnBhdGhuYW1lKSB7XG4gICAgb3V0LnBhdGhuYW1lID0gJy8nO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICBpZiAob3V0LnBhdGhuYW1lIHx8IG91dC5zZWFyY2gpIHtcbiAgICBvdXQucGF0aCA9IChvdXQucGF0aG5hbWUgPyBvdXQucGF0aG5hbWUgOiAnJykgK1xuICAgICAgICAgICAgICAgKG91dC5zZWFyY2ggPyBvdXQuc2VhcmNoIDogJycpO1xuICB9XG5cbiAgLy8gZmluYWxseSwgcmVjb25zdHJ1Y3QgdGhlIGhyZWYgYmFzZWQgb24gd2hhdCBoYXMgYmVlbiB2YWxpZGF0ZWQuXG4gIG91dC5ocmVmID0gdXJsRm9ybWF0KG91dCk7XG4gIHJldHVybiBvdXQ7XG59XG5cbi8vIGZvcm1hdCBhIHBhcnNlZCBvYmplY3QgaW50byBhIHVybCBzdHJpbmdcbmZ1bmN0aW9uIHVybEZvcm1hdChvYmopIHtcbiAgLy8gZW5zdXJlIGl0J3MgYW4gb2JqZWN0LCBhbmQgbm90IGEgc3RyaW5nIHVybC5cbiAgLy8gSWYgaXQncyBhbiBvYmosIHRoaXMgaXMgYSBuby1vcC5cbiAgLy8gdGhpcyB3YXksIHlvdSBjYW4gY2FsbCB1cmxfZm9ybWF0KCkgb24gc3RyaW5nc1xuICAvLyB0byBjbGVhbiB1cCBwb3RlbnRpYWxseSB3b25reSB1cmxzLlxuICBpZiAodHlwZW9mKG9iaikgPT09ICdzdHJpbmcnKSBvYmogPSB1cmxQYXJzZShvYmopO1xuXG4gIHZhciBhdXRoID0gb2JqLmF1dGggfHwgJyc7XG4gIGlmIChhdXRoKSB7XG4gICAgYXV0aCA9IGVuY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICBhdXRoID0gYXV0aC5yZXBsYWNlKC8lM0EvaSwgJzonKTtcbiAgICBhdXRoICs9ICdAJztcbiAgfVxuXG4gIHZhciBwcm90b2NvbCA9IG9iai5wcm90b2NvbCB8fCAnJyxcbiAgICAgIHBhdGhuYW1lID0gb2JqLnBhdGhuYW1lIHx8ICcnLFxuICAgICAgaGFzaCA9IG9iai5oYXNoIHx8ICcnLFxuICAgICAgaG9zdCA9IGZhbHNlLFxuICAgICAgcXVlcnkgPSAnJztcblxuICBpZiAob2JqLmhvc3QgIT09IHVuZGVmaW5lZCkge1xuICAgIGhvc3QgPSBhdXRoICsgb2JqLmhvc3Q7XG4gIH0gZWxzZSBpZiAob2JqLmhvc3RuYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBob3N0ID0gYXV0aCArIChvYmouaG9zdG5hbWUuaW5kZXhPZignOicpID09PSAtMSA/XG4gICAgICAgIG9iai5ob3N0bmFtZSA6XG4gICAgICAgICdbJyArIG9iai5ob3N0bmFtZSArICddJyk7XG4gICAgaWYgKG9iai5wb3J0KSB7XG4gICAgICBob3N0ICs9ICc6JyArIG9iai5wb3J0O1xuICAgIH1cbiAgfVxuXG4gIGlmIChvYmoucXVlcnkgJiYgdHlwZW9mIG9iai5xdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKG9iai5xdWVyeSkubGVuZ3RoKSB7XG4gICAgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkob2JqLnF1ZXJ5KTtcbiAgfVxuXG4gIHZhciBzZWFyY2ggPSBvYmouc2VhcmNoIHx8IChxdWVyeSAmJiAoJz8nICsgcXVlcnkpKSB8fCAnJztcblxuICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wuc3Vic3RyKC0xKSAhPT0gJzonKSBwcm90b2NvbCArPSAnOic7XG5cbiAgLy8gb25seSB0aGUgc2xhc2hlZFByb3RvY29scyBnZXQgdGhlIC8vLiAgTm90IG1haWx0bzosIHhtcHA6LCBldGMuXG4gIC8vIHVubGVzcyB0aGV5IGhhZCB0aGVtIHRvIGJlZ2luIHdpdGguXG4gIGlmIChvYmouc2xhc2hlcyB8fFxuICAgICAgKCFwcm90b2NvbCB8fCBzbGFzaGVkUHJvdG9jb2xbcHJvdG9jb2xdKSAmJiBob3N0ICE9PSBmYWxzZSkge1xuICAgIGhvc3QgPSAnLy8nICsgKGhvc3QgfHwgJycpO1xuICAgIGlmIChwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQXQoMCkgIT09ICcvJykgcGF0aG5hbWUgPSAnLycgKyBwYXRobmFtZTtcbiAgfSBlbHNlIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSAnJztcbiAgfVxuXG4gIGlmIChoYXNoICYmIGhhc2guY2hhckF0KDApICE9PSAnIycpIGhhc2ggPSAnIycgKyBoYXNoO1xuICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQXQoMCkgIT09ICc/Jykgc2VhcmNoID0gJz8nICsgc2VhcmNoO1xuXG4gIHJldHVybiBwcm90b2NvbCArIGhvc3QgKyBwYXRobmFtZSArIHNlYXJjaCArIGhhc2g7XG59XG5cbmZ1bmN0aW9uIHVybFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICByZXR1cm4gdXJsRm9ybWF0KHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkpO1xufVxuXG5mdW5jdGlvbiB1cmxSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcblxuICBzb3VyY2UgPSB1cmxQYXJzZSh1cmxGb3JtYXQoc291cmNlKSwgZmFsc2UsIHRydWUpO1xuICByZWxhdGl2ZSA9IHVybFBhcnNlKHVybEZvcm1hdChyZWxhdGl2ZSksIGZhbHNlLCB0cnVlKTtcblxuICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgc291cmNlLmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gIGlmIChyZWxhdGl2ZS5ocmVmID09PSAnJykge1xuICAgIHNvdXJjZS5ocmVmID0gdXJsRm9ybWF0KHNvdXJjZSk7XG4gICAgcmV0dXJuIHNvdXJjZTtcbiAgfVxuXG4gIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICByZWxhdGl2ZS5wcm90b2NvbCA9IHNvdXJjZS5wcm90b2NvbDtcbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdICYmXG4gICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lICYmICFyZWxhdGl2ZS5wYXRobmFtZSkge1xuICAgICAgcmVsYXRpdmUucGF0aCA9IHJlbGF0aXZlLnBhdGhuYW1lID0gJy8nO1xuICAgIH1cbiAgICByZWxhdGl2ZS5ocmVmID0gdXJsRm9ybWF0KHJlbGF0aXZlKTtcbiAgICByZXR1cm4gcmVsYXRpdmU7XG4gIH1cblxuICBpZiAocmVsYXRpdmUucHJvdG9jb2wgJiYgcmVsYXRpdmUucHJvdG9jb2wgIT09IHNvdXJjZS5wcm90b2NvbCkge1xuICAgIC8vIGlmIGl0J3MgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAvLyBmaXJzdCwgaWYgaXQncyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgIC8vIGJlY2F1c2UgdGhhdCdzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICBpZiAoIXNsYXNoZWRQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIHJlbGF0aXZlLmhyZWYgPSB1cmxGb3JtYXQocmVsYXRpdmUpO1xuICAgICAgcmV0dXJuIHJlbGF0aXZlO1xuICAgIH1cbiAgICBzb3VyY2UucHJvdG9jb2wgPSByZWxhdGl2ZS5wcm90b2NvbDtcbiAgICBpZiAoIXJlbGF0aXZlLmhvc3QgJiYgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCAnJykuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9ICcnO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSAnJztcbiAgICAgIGlmIChyZWxQYXRoWzBdICE9PSAnJykgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICByZWxhdGl2ZS5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH1cbiAgICBzb3VyY2UucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICBzb3VyY2Uuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHNvdXJjZS5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHNvdXJjZS5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCAnJztcbiAgICBzb3VyY2UuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgc291cmNlLmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICBzb3VyY2UucG9ydCA9IHJlbGF0aXZlLnBvcnQ7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChzb3VyY2UucGF0aG5hbWUgIT09IHVuZGVmaW5lZCB8fCBzb3VyY2Uuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHNvdXJjZS5wYXRoID0gKHNvdXJjZS5wYXRobmFtZSA/IHNvdXJjZS5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgIChzb3VyY2Uuc2VhcmNoID8gc291cmNlLnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgc291cmNlLnNsYXNoZXMgPSBzb3VyY2Uuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHNvdXJjZS5ocmVmID0gdXJsRm9ybWF0KHNvdXJjZSk7XG4gICAgcmV0dXJuIHNvdXJjZTtcbiAgfVxuXG4gIHZhciBpc1NvdXJjZUFicyA9IChzb3VyY2UucGF0aG5hbWUgJiYgc291cmNlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nKSxcbiAgICAgIGlzUmVsQWJzID0gKFxuICAgICAgICAgIHJlbGF0aXZlLmhvc3QgIT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nXG4gICAgICApLFxuICAgICAgbXVzdEVuZEFicyA9IChpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fFxuICAgICAgICAgICAgICAgICAgICAoc291cmNlLmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKSxcbiAgICAgIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzLFxuICAgICAgc3JjUGF0aCA9IHNvdXJjZS5wYXRobmFtZSAmJiBzb3VyY2UucGF0aG5hbWUuc3BsaXQoJy8nKSB8fCBbXSxcbiAgICAgIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdCgnLycpIHx8IFtdLFxuICAgICAgcHN5Y2hvdGljID0gc291cmNlLnByb3RvY29sICYmXG4gICAgICAgICAgIXNsYXNoZWRQcm90b2NvbFtzb3VyY2UucHJvdG9jb2xdO1xuXG4gIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgLy8gbGlua3MgbGlrZSAuLi8uLiBzaG91bGQgYmUgYWJsZVxuICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gIC8vIHNvdXJjZS5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gIC8vIExhdGVyIG9uLCBwdXQgdGhlIGZpcnN0IHBhdGggcGFydCBpbnRvIHRoZSBob3N0IGZpZWxkLlxuICBpZiAocHN5Y2hvdGljKSB7XG5cbiAgICBkZWxldGUgc291cmNlLmhvc3RuYW1lO1xuICAgIGRlbGV0ZSBzb3VyY2UucG9ydDtcbiAgICBpZiAoc291cmNlLmhvc3QpIHtcbiAgICAgIGlmIChzcmNQYXRoWzBdID09PSAnJykgc3JjUGF0aFswXSA9IHNvdXJjZS5ob3N0O1xuICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQoc291cmNlLmhvc3QpO1xuICAgIH1cbiAgICBkZWxldGUgc291cmNlLmhvc3Q7XG4gICAgaWYgKHJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgICBkZWxldGUgcmVsYXRpdmUuaG9zdG5hbWU7XG4gICAgICBkZWxldGUgcmVsYXRpdmUucG9ydDtcbiAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgIGlmIChyZWxQYXRoWzBdID09PSAnJykgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHJlbGF0aXZlLmhvc3Q7XG4gICAgfVxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzICYmIChyZWxQYXRoWzBdID09PSAnJyB8fCBzcmNQYXRoWzBdID09PSAnJyk7XG4gIH1cblxuICBpZiAoaXNSZWxBYnMpIHtcbiAgICAvLyBpdCdzIGFic29sdXRlLlxuICAgIHNvdXJjZS5ob3N0ID0gKHJlbGF0aXZlLmhvc3QgfHwgcmVsYXRpdmUuaG9zdCA9PT0gJycpID9cbiAgICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogc291cmNlLmhvc3Q7XG4gICAgc291cmNlLmhvc3RuYW1lID0gKHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSAnJykgP1xuICAgICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogc291cmNlLmhvc3RuYW1lO1xuICAgIHNvdXJjZS5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgc291cmNlLnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgc3JjUGF0aC5wb3AoKTtcbiAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgc291cmNlLnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICBzb3VyY2UucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgfSBlbHNlIGlmICgnc2VhcmNoJyBpbiByZWxhdGl2ZSkge1xuICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgIHNvdXJjZS5ob3N0bmFtZSA9IHNvdXJjZS5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICB2YXIgYXV0aEluSG9zdCA9IHNvdXJjZS5ob3N0ICYmIHNvdXJjZS5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgP1xuICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2UuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICBzb3VyY2UuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgc291cmNlLmhvc3QgPSBzb3VyY2UuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHNvdXJjZS5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgc291cmNlLnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChzb3VyY2UucGF0aG5hbWUgIT09IHVuZGVmaW5lZCB8fCBzb3VyY2Uuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHNvdXJjZS5wYXRoID0gKHNvdXJjZS5wYXRobmFtZSA/IHNvdXJjZS5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgIChzb3VyY2Uuc2VhcmNoID8gc291cmNlLnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgc291cmNlLmhyZWYgPSB1cmxGb3JtYXQoc291cmNlKTtcbiAgICByZXR1cm4gc291cmNlO1xuICB9XG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBubyBwYXRoIGF0IGFsbC4gIGVhc3kuXG4gICAgLy8gd2UndmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICBkZWxldGUgc291cmNlLnBhdGhuYW1lO1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAoIXNvdXJjZS5zZWFyY2gpIHtcbiAgICAgIHNvdXJjZS5wYXRoID0gJy8nICsgc291cmNlLnNlYXJjaDtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIHNvdXJjZS5wYXRoO1xuICAgIH1cbiAgICBzb3VyY2UuaHJlZiA9IHVybEZvcm1hdChzb3VyY2UpO1xuICAgIHJldHVybiBzb3VyY2U7XG4gIH1cbiAgLy8gaWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIC8vIGhvd2V2ZXIsIGlmIGl0IGVuZHMgaW4gYW55dGhpbmcgZWxzZSBub24tc2xhc2h5LFxuICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICB2YXIgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICB2YXIgaGFzVHJhaWxpbmdTbGFzaCA9IChcbiAgICAgIChzb3VyY2UuaG9zdCB8fCByZWxhdGl2ZS5ob3N0KSAmJiAobGFzdCA9PT0gJy4nIHx8IGxhc3QgPT09ICcuLicpIHx8XG4gICAgICBsYXN0ID09PSAnJyk7XG5cbiAgLy8gc3RyaXAgc2luZ2xlIGRvdHMsIHJlc29sdmUgZG91YmxlIGRvdHMgdG8gcGFyZW50IGRpclxuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gc3JjUGF0aC5sZW5ndGg7IGkgPj0gMDsgaS0tKSB7XG4gICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgaWYgKGxhc3QgPT0gJy4nKSB7XG4gICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoIW11c3RFbmRBYnMgJiYgIXJlbW92ZUFsbERvdHMpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHNyY1BhdGgudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSAnJyAmJlxuICAgICAgKCFzcmNQYXRoWzBdIHx8IHNyY1BhdGhbMF0uY2hhckF0KDApICE9PSAnLycpKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIChzcmNQYXRoLmpvaW4oJy8nKS5zdWJzdHIoLTEpICE9PSAnLycpKSB7XG4gICAgc3JjUGF0aC5wdXNoKCcnKTtcbiAgfVxuXG4gIHZhciBpc0Fic29sdXRlID0gc3JjUGF0aFswXSA9PT0gJycgfHxcbiAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckF0KDApID09PSAnLycpO1xuXG4gIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICBzb3VyY2UuaG9zdG5hbWUgPSBzb3VyY2UuaG9zdCA9IGlzQWJzb2x1dGUgPyAnJyA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6ICcnO1xuICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgdmFyIGF1dGhJbkhvc3QgPSBzb3VyY2UuaG9zdCAmJiBzb3VyY2UuaG9zdC5pbmRleE9mKCdAJykgPiAwID9cbiAgICAgICAgICAgICAgICAgICAgIHNvdXJjZS5ob3N0LnNwbGl0KCdAJykgOiBmYWxzZTtcbiAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgc291cmNlLmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICBzb3VyY2UuaG9zdCA9IHNvdXJjZS5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICB9XG4gIH1cblxuICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyB8fCAoc291cmNlLmhvc3QgJiYgc3JjUGF0aC5sZW5ndGgpO1xuXG4gIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIHNvdXJjZS5wYXRobmFtZSA9IHNyY1BhdGguam9pbignLycpO1xuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmIChzb3VyY2UucGF0aG5hbWUgIT09IHVuZGVmaW5lZCB8fCBzb3VyY2Uuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICBzb3VyY2UucGF0aCA9IChzb3VyY2UucGF0aG5hbWUgPyBzb3VyY2UucGF0aG5hbWUgOiAnJykgK1xuICAgICAgICAgICAgICAgICAgKHNvdXJjZS5zZWFyY2ggPyBzb3VyY2Uuc2VhcmNoIDogJycpO1xuICB9XG4gIHNvdXJjZS5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCBzb3VyY2UuYXV0aDtcbiAgc291cmNlLnNsYXNoZXMgPSBzb3VyY2Uuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICBzb3VyY2UuaHJlZiA9IHVybEZvcm1hdChzb3VyY2UpO1xuICByZXR1cm4gc291cmNlO1xufVxuXG5mdW5jdGlvbiBwYXJzZUhvc3QoaG9zdCkge1xuICB2YXIgb3V0ID0ge307XG4gIHZhciBwb3J0ID0gcG9ydFBhdHRlcm4uZXhlYyhob3N0KTtcbiAgaWYgKHBvcnQpIHtcbiAgICBwb3J0ID0gcG9ydFswXTtcbiAgICBpZiAocG9ydCAhPT0gJzonKSB7XG4gICAgICBvdXQucG9ydCA9IHBvcnQuc3Vic3RyKDEpO1xuICAgIH1cbiAgICBob3N0ID0gaG9zdC5zdWJzdHIoMCwgaG9zdC5sZW5ndGggLSBwb3J0Lmxlbmd0aCk7XG4gIH1cbiAgaWYgKGhvc3QpIG91dC5ob3N0bmFtZSA9IGhvc3Q7XG4gIHJldHVybiBvdXQ7XG59XG5cbn0oKSk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwidmFyIHByb2Nlc3M9cmVxdWlyZShcIl9fYnJvd3NlcmlmeV9wcm9jZXNzXCIpLGdsb2JhbD10eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge307Ly8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbnZhciBmb3JtYXRSZWdFeHAgPSAvJVtzZGolXS9nO1xuZXhwb3J0cy5mb3JtYXQgPSBmdW5jdGlvbihmKSB7XG4gIGlmICghaXNTdHJpbmcoZikpIHtcbiAgICB2YXIgb2JqZWN0cyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBvYmplY3RzLnB1c2goaW5zcGVjdChhcmd1bWVudHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdHMuam9pbignICcpO1xuICB9XG5cbiAgdmFyIGkgPSAxO1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIGxlbiA9IGFyZ3MubGVuZ3RoO1xuICB2YXIgc3RyID0gU3RyaW5nKGYpLnJlcGxhY2UoZm9ybWF0UmVnRXhwLCBmdW5jdGlvbih4KSB7XG4gICAgaWYgKHggPT09ICclJScpIHJldHVybiAnJSc7XG4gICAgaWYgKGkgPj0gbGVuKSByZXR1cm4geDtcbiAgICBzd2l0Y2ggKHgpIHtcbiAgICAgIGNhc2UgJyVzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWQnOiByZXR1cm4gTnVtYmVyKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclaic6XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFyZ3NbaSsrXSk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuICAgICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4geDtcbiAgICB9XG4gIH0pO1xuICBmb3IgKHZhciB4ID0gYXJnc1tpXTsgaSA8IGxlbjsgeCA9IGFyZ3NbKytpXSkge1xuICAgIGlmIChpc051bGwoeCkgfHwgIWlzT2JqZWN0KHgpKSB7XG4gICAgICBzdHIgKz0gJyAnICsgeDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyICs9ICcgJyArIGluc3BlY3QoeCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHI7XG59O1xuXG5cbi8vIE1hcmsgdGhhdCBhIG1ldGhvZCBzaG91bGQgbm90IGJlIHVzZWQuXG4vLyBSZXR1cm5zIGEgbW9kaWZpZWQgZnVuY3Rpb24gd2hpY2ggd2FybnMgb25jZSBieSBkZWZhdWx0LlxuLy8gSWYgLS1uby1kZXByZWNhdGlvbiBpcyBzZXQsIHRoZW4gaXQgaXMgYSBuby1vcC5cbmV4cG9ydHMuZGVwcmVjYXRlID0gZnVuY3Rpb24oZm4sIG1zZykge1xuICAvLyBBbGxvdyBmb3IgZGVwcmVjYXRpbmcgdGhpbmdzIGluIHRoZSBwcm9jZXNzIG9mIHN0YXJ0aW5nIHVwLlxuICBpZiAoaXNVbmRlZmluZWQoZ2xvYmFsLnByb2Nlc3MpKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4cG9ydHMuZGVwcmVjYXRlKGZuLCBtc2cpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9jZXNzLm5vRGVwcmVjYXRpb24gPT09IHRydWUpIHtcbiAgICByZXR1cm4gZm47XG4gIH1cblxuICB2YXIgd2FybmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGRlcHJlY2F0ZWQoKSB7XG4gICAgaWYgKCF3YXJuZWQpIHtcbiAgICAgIGlmIChwcm9jZXNzLnRocm93RGVwcmVjYXRpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgICB9IGVsc2UgaWYgKHByb2Nlc3MudHJhY2VEZXByZWNhdGlvbikge1xuICAgICAgICBjb25zb2xlLnRyYWNlKG1zZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gICAgICB9XG4gICAgICB3YXJuZWQgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIHJldHVybiBkZXByZWNhdGVkO1xufTtcblxuXG52YXIgZGVidWdzID0ge307XG52YXIgZGVidWdFbnZpcm9uO1xuZXhwb3J0cy5kZWJ1Z2xvZyA9IGZ1bmN0aW9uKHNldCkge1xuICBpZiAoaXNVbmRlZmluZWQoZGVidWdFbnZpcm9uKSlcbiAgICBkZWJ1Z0Vudmlyb24gPSBwcm9jZXNzLmVudi5OT0RFX0RFQlVHIHx8ICcnO1xuICBzZXQgPSBzZXQudG9VcHBlckNhc2UoKTtcbiAgaWYgKCFkZWJ1Z3Nbc2V0XSkge1xuICAgIGlmIChuZXcgUmVnRXhwKCdcXFxcYicgKyBzZXQgKyAnXFxcXGInLCAnaScpLnRlc3QoZGVidWdFbnZpcm9uKSkge1xuICAgICAgdmFyIHBpZCA9IHByb2Nlc3MucGlkO1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyVzICVkOiAlcycsIHNldCwgcGlkLCBtc2cpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHt9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gZGVidWdzW3NldF07XG59O1xuXG5cbi8qKlxuICogRWNob3MgdGhlIHZhbHVlIG9mIGEgdmFsdWUuIFRyeXMgdG8gcHJpbnQgdGhlIHZhbHVlIG91dFxuICogaW4gdGhlIGJlc3Qgd2F5IHBvc3NpYmxlIGdpdmVuIHRoZSBkaWZmZXJlbnQgdHlwZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHByaW50IG91dC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgYWx0ZXJzIHRoZSBvdXRwdXQuXG4gKi9cbi8qIGxlZ2FjeTogb2JqLCBzaG93SGlkZGVuLCBkZXB0aCwgY29sb3JzKi9cbmZ1bmN0aW9uIGluc3BlY3Qob2JqLCBvcHRzKSB7XG4gIC8vIGRlZmF1bHQgb3B0aW9uc1xuICB2YXIgY3R4ID0ge1xuICAgIHNlZW46IFtdLFxuICAgIHN0eWxpemU6IHN0eWxpemVOb0NvbG9yXG4gIH07XG4gIC8vIGxlZ2FjeS4uLlxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSAzKSBjdHguZGVwdGggPSBhcmd1bWVudHNbMl07XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDQpIGN0eC5jb2xvcnMgPSBhcmd1bWVudHNbM107XG4gIGlmIChpc0Jvb2xlYW4ob3B0cykpIHtcbiAgICAvLyBsZWdhY3kuLi5cbiAgICBjdHguc2hvd0hpZGRlbiA9IG9wdHM7XG4gIH0gZWxzZSBpZiAob3B0cykge1xuICAgIC8vIGdvdCBhbiBcIm9wdGlvbnNcIiBvYmplY3RcbiAgICBleHBvcnRzLl9leHRlbmQoY3R4LCBvcHRzKTtcbiAgfVxuICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gIGlmIChpc1VuZGVmaW5lZChjdHguc2hvd0hpZGRlbikpIGN0eC5zaG93SGlkZGVuID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguZGVwdGgpKSBjdHguZGVwdGggPSAyO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmNvbG9ycykpIGN0eC5jb2xvcnMgPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jdXN0b21JbnNwZWN0KSkgY3R4LmN1c3RvbUluc3BlY3QgPSB0cnVlO1xuICBpZiAoY3R4LmNvbG9ycykgY3R4LnN0eWxpemUgPSBzdHlsaXplV2l0aENvbG9yO1xuICByZXR1cm4gZm9ybWF0VmFsdWUoY3R4LCBvYmosIGN0eC5kZXB0aCk7XG59XG5leHBvcnRzLmluc3BlY3QgPSBpbnNwZWN0O1xuXG5cbi8vIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSNncmFwaGljc1xuaW5zcGVjdC5jb2xvcnMgPSB7XG4gICdib2xkJyA6IFsxLCAyMl0sXG4gICdpdGFsaWMnIDogWzMsIDIzXSxcbiAgJ3VuZGVybGluZScgOiBbNCwgMjRdLFxuICAnaW52ZXJzZScgOiBbNywgMjddLFxuICAnd2hpdGUnIDogWzM3LCAzOV0sXG4gICdncmV5JyA6IFs5MCwgMzldLFxuICAnYmxhY2snIDogWzMwLCAzOV0sXG4gICdibHVlJyA6IFszNCwgMzldLFxuICAnY3lhbicgOiBbMzYsIDM5XSxcbiAgJ2dyZWVuJyA6IFszMiwgMzldLFxuICAnbWFnZW50YScgOiBbMzUsIDM5XSxcbiAgJ3JlZCcgOiBbMzEsIDM5XSxcbiAgJ3llbGxvdycgOiBbMzMsIDM5XVxufTtcblxuLy8gRG9uJ3QgdXNlICdibHVlJyBub3QgdmlzaWJsZSBvbiBjbWQuZXhlXG5pbnNwZWN0LnN0eWxlcyA9IHtcbiAgJ3NwZWNpYWwnOiAnY3lhbicsXG4gICdudW1iZXInOiAneWVsbG93JyxcbiAgJ2Jvb2xlYW4nOiAneWVsbG93JyxcbiAgJ3VuZGVmaW5lZCc6ICdncmV5JyxcbiAgJ251bGwnOiAnYm9sZCcsXG4gICdzdHJpbmcnOiAnZ3JlZW4nLFxuICAnZGF0ZSc6ICdtYWdlbnRhJyxcbiAgLy8gXCJuYW1lXCI6IGludGVudGlvbmFsbHkgbm90IHN0eWxpbmdcbiAgJ3JlZ2V4cCc6ICdyZWQnXG59O1xuXG5cbmZ1bmN0aW9uIHN0eWxpemVXaXRoQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgdmFyIHN0eWxlID0gaW5zcGVjdC5zdHlsZXNbc3R5bGVUeXBlXTtcblxuICBpZiAoc3R5bGUpIHtcbiAgICByZXR1cm4gJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVswXSArICdtJyArIHN0ciArXG4gICAgICAgICAgICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMV0gKyAnbSc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIHN0eWxpemVOb0NvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHJldHVybiBzdHI7XG59XG5cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYXJyYXkpIHtcbiAgdmFyIGhhc2ggPSB7fTtcblxuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbCwgaWR4KSB7XG4gICAgaGFzaFt2YWxdID0gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGhhc2g7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzKSB7XG4gIC8vIFByb3ZpZGUgYSBob29rIGZvciB1c2VyLXNwZWNpZmllZCBpbnNwZWN0IGZ1bmN0aW9ucy5cbiAgLy8gQ2hlY2sgdGhhdCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbiBpbnNwZWN0IGZ1bmN0aW9uIG9uIGl0XG4gIGlmIChjdHguY3VzdG9tSW5zcGVjdCAmJlxuICAgICAgdmFsdWUgJiZcbiAgICAgIGlzRnVuY3Rpb24odmFsdWUuaW5zcGVjdCkgJiZcbiAgICAgIC8vIEZpbHRlciBvdXQgdGhlIHV0aWwgbW9kdWxlLCBpdCdzIGluc3BlY3QgZnVuY3Rpb24gaXMgc3BlY2lhbFxuICAgICAgdmFsdWUuaW5zcGVjdCAhPT0gZXhwb3J0cy5pbnNwZWN0ICYmXG4gICAgICAvLyBBbHNvIGZpbHRlciBvdXQgYW55IHByb3RvdHlwZSBvYmplY3RzIHVzaW5nIHRoZSBjaXJjdWxhciBjaGVjay5cbiAgICAgICEodmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlID09PSB2YWx1ZSkpIHtcbiAgICB2YXIgcmV0ID0gdmFsdWUuaW5zcGVjdChyZWN1cnNlVGltZXMsIGN0eCk7XG4gICAgaWYgKCFpc1N0cmluZyhyZXQpKSB7XG4gICAgICByZXQgPSBmb3JtYXRWYWx1ZShjdHgsIHJldCwgcmVjdXJzZVRpbWVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIFByaW1pdGl2ZSB0eXBlcyBjYW5ub3QgaGF2ZSBwcm9wZXJ0aWVzXG4gIHZhciBwcmltaXRpdmUgPSBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSk7XG4gIGlmIChwcmltaXRpdmUpIHtcbiAgICByZXR1cm4gcHJpbWl0aXZlO1xuICB9XG5cbiAgLy8gTG9vayB1cCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0LlxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgdmFyIHZpc2libGVLZXlzID0gYXJyYXlUb0hhc2goa2V5cyk7XG5cbiAgaWYgKGN0eC5zaG93SGlkZGVuKSB7XG4gICAga2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHZhbHVlKTtcbiAgfVxuXG4gIC8vIElFIGRvZXNuJ3QgbWFrZSBlcnJvciBmaWVsZHMgbm9uLWVudW1lcmFibGVcbiAgLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2llL2R3dzUyc2J0KHY9dnMuOTQpLmFzcHhcbiAgaWYgKGlzRXJyb3IodmFsdWUpXG4gICAgICAmJiAoa2V5cy5pbmRleE9mKCdtZXNzYWdlJykgPj0gMCB8fCBrZXlzLmluZGV4T2YoJ2Rlc2NyaXB0aW9uJykgPj0gMCkpIHtcbiAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgLy8gU29tZSB0eXBlIG9mIG9iamVjdCB3aXRob3V0IHByb3BlcnRpZXMgY2FuIGJlIHNob3J0Y3V0dGVkLlxuICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgIHZhciBuYW1lID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tGdW5jdGlvbicgKyBuYW1lICsgJ10nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH1cbiAgICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKERhdGUucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAnZGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGJhc2UgPSAnJywgYXJyYXkgPSBmYWxzZSwgYnJhY2VzID0gWyd7JywgJ30nXTtcblxuICAvLyBNYWtlIEFycmF5IHNheSB0aGF0IHRoZXkgYXJlIEFycmF5XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIGFycmF5ID0gdHJ1ZTtcbiAgICBicmFjZXMgPSBbJ1snLCAnXSddO1xuICB9XG5cbiAgLy8gTWFrZSBmdW5jdGlvbnMgc2F5IHRoYXQgdGhleSBhcmUgZnVuY3Rpb25zXG4gIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgIHZhciBuID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgYmFzZSA9ICcgW0Z1bmN0aW9uJyArIG4gKyAnXSc7XG4gIH1cblxuICAvLyBNYWtlIFJlZ0V4cHMgc2F5IHRoYXQgdGhleSBhcmUgUmVnRXhwc1xuICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGRhdGVzIHdpdGggcHJvcGVydGllcyBmaXJzdCBzYXkgdGhlIGRhdGVcbiAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGVycm9yIHdpdGggbWVzc2FnZSBmaXJzdCBzYXkgdGhlIGVycm9yXG4gIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgKCFhcnJheSB8fCB2YWx1ZS5sZW5ndGggPT0gMCkpIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArIGJyYWNlc1sxXTtcbiAgfVxuXG4gIGlmIChyZWN1cnNlVGltZXMgPCAwKSB7XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbT2JqZWN0XScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG5cbiAgY3R4LnNlZW4ucHVzaCh2YWx1ZSk7XG5cbiAgdmFyIG91dHB1dDtcbiAgaWYgKGFycmF5KSB7XG4gICAgb3V0cHV0ID0gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cyk7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSk7XG4gICAgfSk7XG4gIH1cblxuICBjdHguc2Vlbi5wb3AoKTtcblxuICByZXR1cm4gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKSB7XG4gIGlmIChpc1VuZGVmaW5lZCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCd1bmRlZmluZWQnLCAndW5kZWZpbmVkJyk7XG4gIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICB2YXIgc2ltcGxlID0gJ1xcJycgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkucmVwbGFjZSgvXlwifFwiJC9nLCAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykgKyAnXFwnJztcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoc2ltcGxlLCAnc3RyaW5nJyk7XG4gIH1cbiAgaWYgKGlzTnVtYmVyKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ251bWJlcicpO1xuICBpZiAoaXNCb29sZWFuKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ2Jvb2xlYW4nKTtcbiAgLy8gRm9yIHNvbWUgcmVhc29uIHR5cGVvZiBudWxsIGlzIFwib2JqZWN0XCIsIHNvIHNwZWNpYWwgY2FzZSBoZXJlLlxuICBpZiAoaXNOdWxsKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ251bGwnLCAnbnVsbCcpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yKHZhbHVlKSB7XG4gIHJldHVybiAnWycgKyBFcnJvci5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgKyAnXSc7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cykge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gdmFsdWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgaWYgKGhhc093blByb3BlcnR5KHZhbHVlLCBTdHJpbmcoaSkpKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIFN0cmluZyhpKSwgdHJ1ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaCgnJyk7XG4gICAgfVxuICB9XG4gIGtleXMuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICBpZiAoIWtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAga2V5LCB0cnVlKSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KSB7XG4gIHZhciBuYW1lLCBzdHIsIGRlc2M7XG4gIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHZhbHVlLCBrZXkpIHx8IHsgdmFsdWU6IHZhbHVlW2tleV0gfTtcbiAgaWYgKGRlc2MuZ2V0KSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlci9TZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoIWhhc093blByb3BlcnR5KHZpc2libGVLZXlzLCBrZXkpKSB7XG4gICAgbmFtZSA9ICdbJyArIGtleSArICddJztcbiAgfVxuICBpZiAoIXN0cikge1xuICAgIGlmIChjdHguc2Vlbi5pbmRleE9mKGRlc2MudmFsdWUpIDwgMCkge1xuICAgICAgaWYgKGlzTnVsbChyZWN1cnNlVGltZXMpKSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgbnVsbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIHJlY3Vyc2VUaW1lcyAtIDEpO1xuICAgICAgfVxuICAgICAgaWYgKHN0ci5pbmRleE9mKCdcXG4nKSA+IC0xKSB7XG4gICAgICAgIGlmIChhcnJheSkge1xuICAgICAgICAgIHN0ciA9IHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKS5zdWJzdHIoMik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RyID0gJ1xcbicgKyBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbQ2lyY3VsYXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKGlzVW5kZWZpbmVkKG5hbWUpKSB7XG4gICAgaWYgKGFycmF5ICYmIGtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICAgIG5hbWUgPSBKU09OLnN0cmluZ2lmeSgnJyArIGtleSk7XG4gICAgaWYgKG5hbWUubWF0Y2goL15cIihbYS16QS1aX11bYS16QS1aXzAtOV0qKVwiJC8pKSB7XG4gICAgICBuYW1lID0gbmFtZS5zdWJzdHIoMSwgbmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnbmFtZScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKF5cInxcIiQpL2csIFwiJ1wiKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnc3RyaW5nJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5hbWUgKyAnOiAnICsgc3RyO1xufVxuXG5cbmZ1bmN0aW9uIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKSB7XG4gIHZhciBudW1MaW5lc0VzdCA9IDA7XG4gIHZhciBsZW5ndGggPSBvdXRwdXQucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cikge1xuICAgIG51bUxpbmVzRXN0Kys7XG4gICAgaWYgKGN1ci5pbmRleE9mKCdcXG4nKSA+PSAwKSBudW1MaW5lc0VzdCsrO1xuICAgIHJldHVybiBwcmV2ICsgY3VyLnJlcGxhY2UoL1xcdTAwMWJcXFtcXGRcXGQ/bS9nLCAnJykubGVuZ3RoICsgMTtcbiAgfSwgMCk7XG5cbiAgaWYgKGxlbmd0aCA+IDYwKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArXG4gICAgICAgICAgIChiYXNlID09PSAnJyA/ICcnIDogYmFzZSArICdcXG4gJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBvdXRwdXQuam9pbignLFxcbiAgJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBicmFjZXNbMV07XG4gIH1cblxuICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArICcgJyArIG91dHB1dC5qb2luKCcsICcpICsgJyAnICsgYnJhY2VzWzFdO1xufVxuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5leHBvcnRzLmlzQnVmZmVyID0gcmVxdWlyZSgnLi9zdXBwb3J0L2lzQnVmZmVyJyk7XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn1cblxuXG5mdW5jdGlvbiBwYWQobikge1xuICByZXR1cm4gbiA8IDEwID8gJzAnICsgbi50b1N0cmluZygxMCkgOiBuLnRvU3RyaW5nKDEwKTtcbn1cblxuXG52YXIgbW9udGhzID0gWydKYW4nLCAnRmViJywgJ01hcicsICdBcHInLCAnTWF5JywgJ0p1bicsICdKdWwnLCAnQXVnJywgJ1NlcCcsXG4gICAgICAgICAgICAgICdPY3QnLCAnTm92JywgJ0RlYyddO1xuXG4vLyAyNiBGZWIgMTY6MTk6MzRcbmZ1bmN0aW9uIHRpbWVzdGFtcCgpIHtcbiAgdmFyIGQgPSBuZXcgRGF0ZSgpO1xuICB2YXIgdGltZSA9IFtwYWQoZC5nZXRIb3VycygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0TWludXRlcygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0U2Vjb25kcygpKV0uam9pbignOicpO1xuICByZXR1cm4gW2QuZ2V0RGF0ZSgpLCBtb250aHNbZC5nZXRNb250aCgpXSwgdGltZV0uam9pbignICcpO1xufVxuXG5cbi8vIGxvZyBpcyBqdXN0IGEgdGhpbiB3cmFwcGVyIHRvIGNvbnNvbGUubG9nIHRoYXQgcHJlcGVuZHMgYSB0aW1lc3RhbXBcbmV4cG9ydHMubG9nID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCclcyAtICVzJywgdGltZXN0YW1wKCksIGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cykpO1xufTtcblxuXG4vKipcbiAqIEluaGVyaXQgdGhlIHByb3RvdHlwZSBtZXRob2RzIGZyb20gb25lIGNvbnN0cnVjdG9yIGludG8gYW5vdGhlci5cbiAqXG4gKiBUaGUgRnVuY3Rpb24ucHJvdG90eXBlLmluaGVyaXRzIGZyb20gbGFuZy5qcyByZXdyaXR0ZW4gYXMgYSBzdGFuZGFsb25lXG4gKiBmdW5jdGlvbiAobm90IG9uIEZ1bmN0aW9uLnByb3RvdHlwZSkuIE5PVEU6IElmIHRoaXMgZmlsZSBpcyB0byBiZSBsb2FkZWRcbiAqIGR1cmluZyBib290c3RyYXBwaW5nIHRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmUgcmV3cml0dGVuIHVzaW5nIHNvbWUgbmF0aXZlXG4gKiBmdW5jdGlvbnMgYXMgcHJvdG90eXBlIHNldHVwIHVzaW5nIG5vcm1hbCBKYXZhU2NyaXB0IGRvZXMgbm90IHdvcmsgYXNcbiAqIGV4cGVjdGVkIGR1cmluZyBib290c3RyYXBwaW5nIChzZWUgbWlycm9yLmpzIGluIHIxMTQ5MDMpLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gd2hpY2ggbmVlZHMgdG8gaW5oZXJpdCB0aGVcbiAqICAgICBwcm90b3R5cGUuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBzdXBlckN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gdG8gaW5oZXJpdCBwcm90b3R5cGUgZnJvbS5cbiAqL1xuZXhwb3J0cy5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG5cbmV4cG9ydHMuX2V4dGVuZCA9IGZ1bmN0aW9uKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgIWlzT2JqZWN0KGFkZCkpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59O1xuXG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuIl19
(2)
});
