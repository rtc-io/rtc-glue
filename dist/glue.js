!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.glue=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
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
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
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

},{}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":6,"./encode":7}],9:[function(require,module,exports){
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

},{"punycode":5,"querystring":8}],10:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],11:[function(require,module,exports){
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

},{"./support/isBuffer":10,"__browserify_process":4,"inherits":2}],12:[function(require,module,exports){
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
},{"eve":19}],13:[function(require,module,exports){
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
},{"./events":12,"./sessionmanager":68,"async":14,"cog/defaults":15,"cog/extend":16,"cog/logger":18,"eve":19,"fdom/meta":20,"fdom/on":21,"fdom/qsa":22,"rtc-captureconfig":23,"rtc-core/reset":25,"rtc-media":26,"rtc-signaller":35,"sdp-transform":64,"url":9}],14:[function(require,module,exports){
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

},{"__browserify_process":4}],15:[function(require,module,exports){
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
},{}],16:[function(require,module,exports){
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
},{}],17:[function(require,module,exports){
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
},{}],18:[function(require,module,exports){
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
},{}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
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
},{"./qsa":22}],21:[function(require,module,exports){
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
},{}],22:[function(require,module,exports){
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
},{}],23:[function(require,module,exports){
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
},{}],24:[function(require,module,exports){
/* jshint node: true */
/* global window: false */
/* global navigator: false */

'use strict';

var browsers = {
  chrome: /Chrom(?:e|ium)\/([0-9]+)\./,
  firefox: /Firefox\/([0-9]+)\./,
  opera: /Opera\/([0-9]+)\./
};

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

// time to do some useragent sniffing - it feels dirty because it is :/
if (typeof navigator != 'undefined') {
  Object.keys(browsers).forEach(function(key) {
    var match = browsers[key].exec(navigator.userAgent);
    if (match) {
      detect.browser = key;
      detect.browserVersion = detect.version = parseInt(match[1], 10);
    }
  });
}
else {
  detect.browser = 'node';
  detect.browserVersion = detect.version = '?'; // TODO: get node version
}
},{}],25:[function(require,module,exports){
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
},{}],26:[function(require,module,exports){
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
},{"cog/extend":27,"cog/logger":28,"events":1,"rtc-core/detect":29,"util":11}],27:[function(require,module,exports){
module.exports=require(16)
},{}],28:[function(require,module,exports){
module.exports=require(18)
},{}],29:[function(require,module,exports){
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
},{}],30:[function(require,module,exports){
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
      if (signaller.autoreply && (! clock)) {
        signaller
          .to(data.id)
          .send('/announce', signaller.attributes);
      }

      // emit a new peer announce event
      return signaller.emit('peer:announce', data, peer);
    }
  };
};
},{"cog/extend":16,"cog/logger":18}],31:[function(require,module,exports){
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
},{"./announce":30,"./leave":32,"./lock":33,"./unlock":34}],32:[function(require,module,exports){
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
},{}],33:[function(require,module,exports){
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
},{"cog/logger":18,"collections/fast-map":37,"vectorclock":56}],34:[function(require,module,exports){
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
},{"cog/logger":18,"vectorclock":56}],35:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('rtc-signaller');
var detect = require('rtc-core/detect');
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

  // get the autoreply setting
  var autoreply = (opts || {}).autoreply;

  // create the signaller
  var signaller = new EventEmitter();

  // initialise the id
  var id = signaller.id = uuid.v4();

  // initialise the attributes
  var attributes = signaller.attributes = {
    browser: detect.browser,
    browserVersion: detect.browserVersion,
    id: id
  };

  // create the peers map
  var peers = signaller.peers = new FastMap();

  // create our locks map
  var locks = signaller.locks = new FastMap();

  // initialise the data event name
  var dataEvent = (opts || {}).dataEvent || 'data';
  var openEvent = (opts || {}).openEvent || 'open';
  var writeMethod = (opts || {}).writeMethod || 'write';
  var closeMethod = (opts || {}).closeMethod || 'close';

  // extract the write and close function references
  var write = messenger[writeMethod];
  var close = messenger[closeMethod];

  // set the autoreply flag
  signaller.autoreply = autoreply === undefined || autoreply;

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
    extend(attributes, data, { id: signaller.id });

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

    function handleLockResult(result, src) {
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

    function handleUnlockResult(result, src) {
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

  // pass through open events
  messenger.on(openEvent, signaller.emit.bind(signaller, 'open'));

  return signaller;
};

sig.loadPrimus = require('./primus-loader');
},{"./primus-loader":57,"./processor":58,"cog/extend":16,"cog/logger":18,"collections/fast-map":37,"events":1,"rtc-core/detect":24,"uuid":55,"vectorclock":56}],36:[function(require,module,exports){
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


},{"./generic-collection":39,"./generic-map":40,"./listen/property-changes":45,"./shim":52}],37:[function(require,module,exports){
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


},{"./fast-set":38,"./generic-collection":39,"./generic-map":40,"./listen/property-changes":45,"./shim":52}],38:[function(require,module,exports){
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


},{"./dict":36,"./generic-collection":39,"./generic-set":42,"./list":43,"./listen/property-changes":45,"./shim":52,"./tree-log":53}],39:[function(require,module,exports){
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


},{"./shim-array":48}],40:[function(require,module,exports){
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


},{"./listen/map-changes":44,"./listen/property-changes":45,"./shim-object":50}],41:[function(require,module,exports){

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


},{"./shim-object":50}],42:[function(require,module,exports){

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


},{}],43:[function(require,module,exports){
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


},{"./generic-collection":39,"./generic-order":41,"./listen/property-changes":45,"./listen/range-changes":46,"./shim":52}],44:[function(require,module,exports){
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


},{"../dict":36,"../list":43,"weak-map":47}],45:[function(require,module,exports){
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


},{"../shim":52,"weak-map":47}],46:[function(require,module,exports){
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


},{"../dict":36,"weak-map":47}],47:[function(require,module,exports){
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

},{}],48:[function(require,module,exports){
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


},{"./generic-collection":39,"./generic-order":41,"./shim-function":49,"weak-map":47}],49:[function(require,module,exports){

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


},{}],50:[function(require,module,exports){
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


},{"weak-map":47}],51:[function(require,module,exports){

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


},{}],52:[function(require,module,exports){

var Array = require("./shim-array");
var Object = require("./shim-object");
var Function = require("./shim-function");
var RegExp = require("./shim-regexp");


},{"./shim-array":48,"./shim-function":49,"./shim-object":50,"./shim-regexp":51}],53:[function(require,module,exports){
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


},{}],54:[function(require,module,exports){
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


},{}],55:[function(require,module,exports){
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

},{"./rng":54,"__browserify_Buffer":3}],56:[function(require,module,exports){
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

},{}],57:[function(require,module,exports){
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
},{"url":9}],58:[function(require,module,exports){
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
  var handlers = require('./handlers')(signaller);

  function sendEvent(parts, srcState, data) {
    // initialise the event name
    var evtName = parts[0].slice(1);

    // convert any valid json objects to json
    var args = parts.slice(1).map(jsonparse);

    signaller.emit.apply(
      signaller,
      [evtName].concat(args).concat([srcState, data])
    );
  }

  return function(originalData) {
    var id = signaller.id;
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
},{"./handlers":31,"cog/jsonparse":17,"cog/logger":18,"vectorclock":56}],59:[function(require,module,exports){
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
      console.error('rtc/couple error (' + stage + '): ', err);
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

  function handleRemoteCandidateArray(data, src) {
    if ((! src) || (src.id !== targetId)) {
      return;
    }

    data.forEach(function(candidate) {
      handleRemoteCandidate(targetId, candidate);
    });
  }

  function handleSdp(data, src) {
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
  signaller.on('candidates', handleRemoteCandidateArray);

  // when the connection closes, remove event handlers
  mon.once('closed', function() {
    debug('closed');

    // remove listeners
    signaller.removeListener('sdp', handleSdp);
    signaller.removeListener('candidates', handleRemoteCandidateArray);
  });

  // patch in the create offer functions
  mon.createOffer = queue(createOffer);

  return mon;
}

module.exports = couple;
},{"./detect":60,"./monitor":63,"async":14,"cog/logger":18}],60:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## rtc/detect

  Provide the [rtc-core/detect](https://github.com/rtc-io/rtc-core#detect) 
  functionality.
**/
module.exports = require('rtc-core/detect');
},{"rtc-core/detect":24}],61:[function(require,module,exports){
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
},{"./detect":60,"cog/defaults":15,"cog/logger":18}],62:[function(require,module,exports){
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
},{"./couple":59,"./detect":60,"./generators":61,"cog/logger":18}],63:[function(require,module,exports){
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
},{"__browserify_process":4,"cog/logger":18,"events":1}],64:[function(require,module,exports){
var parser = require('./lib/parser');
var writer = require('./lib/writer');

exports.write = writer;
exports.parse = parser.parse;
exports.parseFmtpConfig = parser.parseFmtpConfig;
exports.parsePayloads = parser.parsePayloads;
exports.parseRemoteCandidates = parser.parseRemoteCandidates;

},{"./lib/parser":66,"./lib/writer":67}],65:[function(require,module,exports){
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
      name: 'direction',
      reg: /^(sendrecv|recvonly|sendonly|inactive)/,
      format: "%s"
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

},{}],66:[function(require,module,exports){
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

},{"./grammar":65}],67:[function(require,module,exports){
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

},{"./grammar":65,"util":11}],68:[function(require,module,exports){
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

  signaller.on('streamdata', function(data, src) {
    // save the stream data to the local stream
    mgr.streams[data.id] = data;
    eve('glue.streamdata.' + data.id, null, data);
  });
};
},{"cog/extend":16,"cog/logger":18,"eve":19,"events":1,"rtc":62,"rtc-signaller":35,"util":11}]},{},[13])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvaG9tZS9kb2VobG1hbi8uYmFzaGluYXRlL2luc3RhbGwvbm9kZS8wLjEwLjI0L2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL2hvbWUvZG9laGxtYW4vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2V2ZW50cy9ldmVudHMuanMiLCIvaG9tZS9kb2VobG1hbi8uYmFzaGluYXRlL2luc3RhbGwvbm9kZS8wLjEwLjI0L2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIi9ob21lL2RvZWhsbWFuLy5iYXNoaW5hdGUvaW5zdGFsbC9ub2RlLzAuMTAuMjQvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvYnVmZmVyLmpzIiwiL2hvbWUvZG9laGxtYW4vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiL2hvbWUvZG9laGxtYW4vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL2hvbWUvZG9laGxtYW4vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nL2RlY29kZS5qcyIsIi9ob21lL2RvZWhsbWFuLy5iYXNoaW5hdGUvaW5zdGFsbC9ub2RlLzAuMTAuMjQvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy9lbmNvZGUuanMiLCIvaG9tZS9kb2VobG1hbi8uYmFzaGluYXRlL2luc3RhbGwvbm9kZS8wLjEwLjI0L2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmcvaW5kZXguanMiLCIvaG9tZS9kb2VobG1hbi8uYmFzaGluYXRlL2luc3RhbGwvbm9kZS8wLjEwLjI0L2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXJsL3VybC5qcyIsIi9ob21lL2RvZWhsbWFuLy5iYXNoaW5hdGUvaW5zdGFsbC9ub2RlLzAuMTAuMjQvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3N1cHBvcnQvaXNCdWZmZXJCcm93c2VyLmpzIiwiL2hvbWUvZG9laGxtYW4vLmJhc2hpbmF0ZS9pbnN0YWxsL25vZGUvMC4xMC4yNC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvdXRpbC5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvZXZlbnRzLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9pbmRleC5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL2FzeW5jL2xpYi9hc3luYy5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL2NvZy9kZWZhdWx0cy5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL2NvZy9leHRlbmQuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9jb2cvanNvbnBhcnNlLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvY29nL2xvZ2dlci5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL2V2ZS9ldmUuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9mZG9tL21ldGEuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9mZG9tL29uLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvZmRvbS9xc2EuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtY2FwdHVyZWNvbmZpZy9pbmRleC5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1jb3JlL2RldGVjdC5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1jb3JlL3Jlc2V0LmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLW1lZGlhL2luZGV4LmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLW1lZGlhL25vZGVfbW9kdWxlcy9ydGMtY29yZS9kZXRlY3QuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL2hhbmRsZXJzL2Fubm91bmNlLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9oYW5kbGVycy9pbmRleC5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvaGFuZGxlcnMvbGVhdmUuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL2hhbmRsZXJzL2xvY2suanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL2hhbmRsZXJzL3VubG9jay5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvaW5kZXguanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9kaWN0LmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvZmFzdC1tYXAuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9mYXN0LXNldC5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2dlbmVyaWMtY29sbGVjdGlvbi5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2dlbmVyaWMtbWFwLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvZ2VuZXJpYy1vcmRlci5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2dlbmVyaWMtc2V0LmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvbGlzdC5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2xpc3Rlbi9tYXAtY2hhbmdlcy5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL2xpc3Rlbi9wcm9wZXJ0eS1jaGFuZ2VzLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvbGlzdGVuL3JhbmdlLWNoYW5nZXMuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9ub2RlX21vZHVsZXMvd2Vhay1tYXAvd2Vhay1tYXAuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9zaGltLWFycmF5LmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvc2hpbS1mdW5jdGlvbi5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy1zaWduYWxsZXIvbm9kZV9tb2R1bGVzL2NvbGxlY3Rpb25zL3NoaW0tb2JqZWN0LmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvc2hpbS1yZWdleHAuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy9jb2xsZWN0aW9ucy9zaGltLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvY29sbGVjdGlvbnMvdHJlZS1sb2cuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL25vZGVfbW9kdWxlcy91dWlkL3JuZy1icm93c2VyLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvdXVpZC91dWlkLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjLXNpZ25hbGxlci9ub2RlX21vZHVsZXMvdmVjdG9yY2xvY2svaW5kZXguanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL3ByaW11cy1sb2FkZXIuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMtc2lnbmFsbGVyL3Byb2Nlc3Nvci5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3J0Yy9jb3VwbGUuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMvZGV0ZWN0LmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvcnRjL2dlbmVyYXRvcnMuanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMvaW5kZXguanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9ydGMvbW9uaXRvci5qcyIsIi9ob21lL2RvZWhsbWFuL2NvZGUvcnRjLmlvL2dsdWUvbm9kZV9tb2R1bGVzL3NkcC10cmFuc2Zvcm0vaW5kZXguanMiLCIvaG9tZS9kb2VobG1hbi9jb2RlL3J0Yy5pby9nbHVlL25vZGVfbW9kdWxlcy9zZHAtdHJhbnNmb3JtL2xpYi9ncmFtbWFyLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvc2RwLXRyYW5zZm9ybS9saWIvcGFyc2VyLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9ub2RlX21vZHVsZXMvc2RwLXRyYW5zZm9ybS9saWIvd3JpdGVyLmpzIiwiL2hvbWUvZG9laGxtYW4vY29kZS9ydGMuaW8vZ2x1ZS9zZXNzaW9ubWFuYWdlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzUwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMWtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDblhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUM3aEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25iQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoY0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlrQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9HQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25MQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gIHRoaXMuX2V2ZW50cyA9IHRoaXMuX2V2ZW50cyB8fCB7fTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gdGhpcy5fbWF4TGlzdGVuZXJzIHx8IHVuZGVmaW5lZDtcbn1cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjEwLnhcbkV2ZW50RW1pdHRlci5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX2V2ZW50cyA9IHVuZGVmaW5lZDtcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX21heExpc3RlbmVycyA9IHVuZGVmaW5lZDtcblxuLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhbiAxMCBsaXN0ZW5lcnMgYXJlXG4vLyBhZGRlZCB0byBpdC4gVGhpcyBpcyBhIHVzZWZ1bCBkZWZhdWx0IHdoaWNoIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxuRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnMgPSAxMDtcblxuLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXG4vLyB0aGF0IHRvIGJlIGluY3JlYXNlZC4gU2V0IHRvIHplcm8gZm9yIHVubGltaXRlZC5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24obikge1xuICBpZiAoIWlzTnVtYmVyKG4pIHx8IG4gPCAwIHx8IGlzTmFOKG4pKVxuICAgIHRocm93IFR5cGVFcnJvcignbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJyk7XG4gIHRoaXMuX21heExpc3RlbmVycyA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgZXIsIGhhbmRsZXIsIGxlbiwgYXJncywgaSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIElmIHRoZXJlIGlzIG5vICdlcnJvcicgZXZlbnQgbGlzdGVuZXIgdGhlbiB0aHJvdy5cbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICBpZiAoIXRoaXMuX2V2ZW50cy5lcnJvciB8fFxuICAgICAgICAoaXNPYmplY3QodGhpcy5fZXZlbnRzLmVycm9yKSAmJiAhdGhpcy5fZXZlbnRzLmVycm9yLmxlbmd0aCkpIHtcbiAgICAgIGVyID0gYXJndW1lbnRzWzFdO1xuICAgICAgaWYgKGVyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXI7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBUeXBlRXJyb3IoJ1VuY2F1Z2h0LCB1bnNwZWNpZmllZCBcImVycm9yXCIgZXZlbnQuJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNVbmRlZmluZWQoaGFuZGxlcikpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG4gICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAvLyBmYXN0IGNhc2VzXG4gICAgICBjYXNlIDE6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAvLyBzbG93ZXJcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoaXNPYmplY3QoaGFuZGxlcikpIHtcbiAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG5cbiAgICBsaXN0ZW5lcnMgPSBoYW5kbGVyLnNsaWNlKCk7XG4gICAgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgYXJncyk7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gVG8gYXZvaWQgcmVjdXJzaW9uIGluIHRoZSBjYXNlIHRoYXQgdHlwZSA9PT0gXCJuZXdMaXN0ZW5lclwiISBCZWZvcmVcbiAgLy8gYWRkaW5nIGl0IHRvIHRoZSBsaXN0ZW5lcnMsIGZpcnN0IGVtaXQgXCJuZXdMaXN0ZW5lclwiLlxuICBpZiAodGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKVxuICAgIHRoaXMuZW1pdCgnbmV3TGlzdGVuZXInLCB0eXBlLFxuICAgICAgICAgICAgICBpc0Z1bmN0aW9uKGxpc3RlbmVyLmxpc3RlbmVyKSA/XG4gICAgICAgICAgICAgIGxpc3RlbmVyLmxpc3RlbmVyIDogbGlzdGVuZXIpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIC8vIE9wdGltaXplIHRoZSBjYXNlIG9mIG9uZSBsaXN0ZW5lci4gRG9uJ3QgbmVlZCB0aGUgZXh0cmEgYXJyYXkgb2JqZWN0LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IGxpc3RlbmVyO1xuICBlbHNlIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFwcGVuZC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gIGVsc2VcbiAgICAvLyBBZGRpbmcgdGhlIHNlY29uZCBlbGVtZW50LCBuZWVkIHRvIGNoYW5nZSB0byBhcnJheS5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdLCBsaXN0ZW5lcl07XG5cbiAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcbiAgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkgJiYgIXRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQpIHtcbiAgICB2YXIgbTtcbiAgICBpZiAoIWlzVW5kZWZpbmVkKHRoaXMuX21heExpc3RlbmVycykpIHtcbiAgICAgIG0gPSB0aGlzLl9tYXhMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSBFdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycztcbiAgICB9XG5cbiAgICBpZiAobSAmJiBtID4gMCAmJiB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoID4gbSkge1xuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XG4gICAgICBjb25zb2xlLmVycm9yKCcobm9kZSkgd2FybmluZzogcG9zc2libGUgRXZlbnRFbWl0dGVyIG1lbW9yeSAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICVkIGxpc3RlbmVycyBhZGRlZC4gJyArXG4gICAgICAgICAgICAgICAgICAgICdVc2UgZW1pdHRlci5zZXRNYXhMaXN0ZW5lcnMoKSB0byBpbmNyZWFzZSBsaW1pdC4nLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoKTtcbiAgICAgIGNvbnNvbGUudHJhY2UoKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgdmFyIGZpcmVkID0gZmFsc2U7XG5cbiAgZnVuY3Rpb24gZygpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGcpO1xuXG4gICAgaWYgKCFmaXJlZCkge1xuICAgICAgZmlyZWQgPSB0cnVlO1xuICAgICAgbGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9XG4gIH1cblxuICBnLmxpc3RlbmVyID0gbGlzdGVuZXI7XG4gIHRoaXMub24odHlwZSwgZyk7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBlbWl0cyBhICdyZW1vdmVMaXN0ZW5lcicgZXZlbnQgaWZmIHRoZSBsaXN0ZW5lciB3YXMgcmVtb3ZlZFxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBsaXN0LCBwb3NpdGlvbiwgbGVuZ3RoLCBpO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIGxpc3QgPSB0aGlzLl9ldmVudHNbdHlwZV07XG4gIGxlbmd0aCA9IGxpc3QubGVuZ3RoO1xuICBwb3NpdGlvbiA9IC0xO1xuXG4gIGlmIChsaXN0ID09PSBsaXN0ZW5lciB8fFxuICAgICAgKGlzRnVuY3Rpb24obGlzdC5saXN0ZW5lcikgJiYgbGlzdC5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcblxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGxpc3QpKSB7XG4gICAgZm9yIChpID0gbGVuZ3RoOyBpLS0gPiAwOykge1xuICAgICAgaWYgKGxpc3RbaV0gPT09IGxpc3RlbmVyIHx8XG4gICAgICAgICAgKGxpc3RbaV0ubGlzdGVuZXIgJiYgbGlzdFtpXS5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgICAgIHBvc2l0aW9uID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBvc2l0aW9uIDwgMClcbiAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgICBsaXN0Lmxlbmd0aCA9IDA7XG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaXN0LnNwbGljZShwb3NpdGlvbiwgMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIga2V5LCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgLy8gbm90IGxpc3RlbmluZyBmb3IgcmVtb3ZlTGlzdGVuZXIsIG5vIG5lZWQgdG8gZW1pdFxuICBpZiAoIXRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcikge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIGVtaXQgcmVtb3ZlTGlzdGVuZXIgZm9yIGFsbCBsaXN0ZW5lcnMgb24gYWxsIGV2ZW50c1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGZvciAoa2V5IGluIHRoaXMuX2V2ZW50cykge1xuICAgICAgaWYgKGtleSA9PT0gJ3JlbW92ZUxpc3RlbmVyJykgY29udGludWU7XG4gICAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycyhrZXkpO1xuICAgIH1cbiAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycygncmVtb3ZlTGlzdGVuZXInKTtcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNGdW5jdGlvbihsaXN0ZW5lcnMpKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnMpO1xuICB9IGVsc2Uge1xuICAgIC8vIExJRk8gb3JkZXJcbiAgICB3aGlsZSAobGlzdGVuZXJzLmxlbmd0aClcbiAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzW2xpc3RlbmVycy5sZW5ndGggLSAxXSk7XG4gIH1cbiAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IFtdO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XG4gIGVsc2VcbiAgICByZXQgPSB0aGlzLl9ldmVudHNbdHlwZV0uc2xpY2UoKTtcbiAgcmV0dXJuIHJldDtcbn07XG5cbkV2ZW50RW1pdHRlci5saXN0ZW5lckNvdW50ID0gZnVuY3Rpb24oZW1pdHRlciwgdHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIWVtaXR0ZXIuX2V2ZW50cyB8fCAhZW1pdHRlci5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IDA7XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24oZW1pdHRlci5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSAxO1xuICBlbHNlXG4gICAgcmV0ID0gZW1pdHRlci5fZXZlbnRzW3R5cGVdLmxlbmd0aDtcbiAgcmV0dXJuIHJldDtcbn07XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbiIsImlmICh0eXBlb2YgT2JqZWN0LmNyZWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAvLyBpbXBsZW1lbnRhdGlvbiBmcm9tIHN0YW5kYXJkIG5vZGUuanMgJ3V0aWwnIG1vZHVsZVxuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgY3Rvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHN1cGVyQ3Rvci5wcm90b3R5cGUsIHtcbiAgICAgIGNvbnN0cnVjdG9yOiB7XG4gICAgICAgIHZhbHVlOiBjdG9yLFxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuICB9O1xufSBlbHNlIHtcbiAgLy8gb2xkIHNjaG9vbCBzaGltIGZvciBvbGQgYnJvd3NlcnNcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIHZhciBUZW1wQ3RvciA9IGZ1bmN0aW9uICgpIHt9XG4gICAgVGVtcEN0b3IucHJvdG90eXBlID0gc3VwZXJDdG9yLnByb3RvdHlwZVxuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKClcbiAgICBjdG9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGN0b3JcbiAgfVxufVxuIiwicmVxdWlyZT0oZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7XCJQY1pqOUxcIjpbZnVuY3Rpb24ocmVxdWlyZSxtb2R1bGUsZXhwb3J0cyl7XG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MlxuXG4vKipcbiAqIElmIGBicm93c2VyU3VwcG9ydGA6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChjb21wYXRpYmxlIGRvd24gdG8gSUU2KVxuICovXG52YXIgYnJvd3NlclN1cHBvcnQgPSAoZnVuY3Rpb24gKCkge1xuICAgLy8gRGV0ZWN0IGlmIGJyb3dzZXIgc3VwcG9ydHMgVHlwZWQgQXJyYXlzLiBTdXBwb3J0ZWQgYnJvd3NlcnMgYXJlIElFIDEwKyxcbiAgIC8vIEZpcmVmb3ggNCssIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAgIGlmICh0eXBlb2YgVWludDhBcnJheSA9PT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIEFycmF5QnVmZmVyID09PSAndW5kZWZpbmVkJyB8fFxuICAgICAgICB0eXBlb2YgRGF0YVZpZXcgPT09ICd1bmRlZmluZWQnKVxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgLy8gRG9lcyB0aGUgYnJvd3NlciBzdXBwb3J0IGFkZGluZyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXM/IElmXG4gIC8vIG5vdCwgdGhlbiB0aGF0J3MgdGhlIHNhbWUgYXMgbm8gYFVpbnQ4QXJyYXlgIHN1cHBvcnQuIFdlIG5lZWQgdG8gYmUgYWJsZSB0b1xuICAvLyBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy5cbiAgLy8gUmVsZXZhbnQgRmlyZWZveCBidWc6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOFxuICB0cnkge1xuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheSgwKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKClcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHN1YmplY3RcblxuICAvLyBXb3JrYXJvdW5kOiBub2RlJ3MgYmFzZTY0IGltcGxlbWVudGF0aW9uIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBzdHJpbmdzXG4gIC8vIHdoaWxlIGJhc2U2NC1qcyBkb2VzIG5vdC5cbiAgaWYgKGVuY29kaW5nID09PSAnYmFzZTY0JyAmJiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHN1YmplY3QgPSBzdHJpbmd0cmltKHN1YmplY3QpXG4gICAgd2hpbGUgKHN1YmplY3QubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgICAgc3ViamVjdCA9IHN1YmplY3QgKyAnPSdcbiAgICB9XG4gIH1cblxuICAvLyBGaW5kIHRoZSBsZW5ndGhcbiAgdmFyIGxlbmd0aFxuICBpZiAodHlwZSA9PT0gJ251bWJlcicpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKVxuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdC5sZW5ndGgpIC8vIEFzc3VtZSBvYmplY3QgaXMgYW4gYXJyYXlcbiAgZWxzZVxuICAgIHRocm93IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgbmVlZHMgdG8gYmUgYSBudW1iZXIsIGFycmF5IG9yIHN0cmluZy4nKVxuXG4gIHZhciBidWZcbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IGF1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIHRoaXMgaW5zdGFuY2Ugb2YgQnVmZmVyXG4gICAgYnVmID0gdGhpc1xuICAgIGJ1Zi5sZW5ndGggPSBsZW5ndGhcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSBVaW50OEFycmF5XG4gICAgYnVmLnNldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgICBlbHNlXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3RbaV1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIWJyb3dzZXJTdXBwb3J0ICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmXG59XG5cbi8vIFNUQVRJQyBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldHVybiB0cnVlXG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuIGIgJiYgYi5faXNCdWZmZXJcbn1cblxuQnVmZmVyLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiAoc3RyLCBlbmNvZGluZykge1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXR1cm4gc3RyLmxlbmd0aCAvIDJcblxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldHVybiB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuXG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXR1cm4gc3RyLmxlbmd0aFxuXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldHVybiBiYXNlNjRUb0J5dGVzKHN0cikubGVuZ3RoXG5cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGlmICghaXNBcnJheShsaXN0KSkge1xuICAgIHRocm93IG5ldyBFcnJvcignVXNhZ2U6IEJ1ZmZlci5jb25jYXQobGlzdCwgW3RvdGFsTGVuZ3RoXSlcXG4nICtcbiAgICAgICAgJ2xpc3Qgc2hvdWxkIGJlIGFuIEFycmF5LicpXG4gIH1cblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdG90YWxMZW5ndGggIT09ICdudW1iZXInKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuLy8gQlVGRkVSIElOU1RBTkNFIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIF9oZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGlmIChzdHJMZW4gJSAyICE9PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICB9XG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBpZiAoaXNOYU4oYnl0ZSkpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBpICogMlxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBfdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGJ5dGVzLCBwb3NcbiAgcmV0dXJuIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBieXRlcywgcG9zXG4gIHJldHVybiBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBfYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBieXRlcywgcG9zXG4gIHJldHVybiBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuXG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0dXJuIF9oZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0dXJuIF91dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldHVybiBfYXNjaWlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldHVybiBfYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXR1cm4gX2Jhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuICBzdGFydCA9IE51bWJlcihzdGFydCkgfHwgMFxuICBlbmQgPSAoZW5kICE9PSB1bmRlZmluZWQpXG4gICAgPyBOdW1iZXIoZW5kKVxuICAgIDogZW5kID0gc2VsZi5sZW5ndGhcblxuICAvLyBGYXN0cGF0aCBlbXB0eSBzdHJpbmdzXG4gIGlmIChlbmQgPT09IHN0YXJ0KVxuICAgIHJldHVybiAnJ1xuXG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0dXJuIF9oZXhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0dXJuIF91dGY4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcblxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldHVybiBfYXNjaWlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldHVybiBfYmluYXJ5U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcblxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXR1cm4gX2Jhc2U2NFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG5cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXNcblxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgaWYgKGVuZCA8IHN0YXJ0KVxuICAgIHRocm93IG5ldyBFcnJvcignc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBpZiAodGFyZ2V0X3N0YXJ0IDwgMCB8fCB0YXJnZXRfc3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBpZiAoc3RhcnQgPCAwIHx8IHN0YXJ0ID49IHNvdXJjZS5sZW5ndGgpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDAgfHwgZW5kID4gc291cmNlLmxlbmd0aClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICAvLyBjb3B5IVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGVuZCAtIHN0YXJ0OyBpKyspXG4gICAgdGFyZ2V0W2kgKyB0YXJnZXRfc3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3V0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspXG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHJldHVybiBfYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIF9oZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbi8vIFRPRE86IGFkZCB0ZXN0IHRoYXQgbW9kaWZ5aW5nIHRoZSBuZXcgYnVmZmVyIHNsaWNlIHdpbGwgbW9kaWZ5IG1lbW9yeSBpbiB0aGVcbi8vIG9yaWdpbmFsIGJ1ZmZlciEgVXNlIGNvZGUgZnJvbTpcbi8vIGh0dHA6Ly9ub2RlanMub3JnL2FwaS9idWZmZXIuaHRtbCNidWZmZXJfYnVmX3NsaWNlX3N0YXJ0X2VuZFxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IGNsYW1wKHN0YXJ0LCBsZW4sIDApXG4gIGVuZCA9IGNsYW1wKGVuZCwgbGVuLCBsZW4pXG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgcmV0dXJuIGF1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBUT0RPOiBzbGljaW5nIHdvcmtzLCB3aXRoIGxpbWl0YXRpb25zIChubyBwYXJlbnQgdHJhY2tpbmcvdXBkYXRlKVxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9mZXJvc3MvbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5L2lzc3Vlcy85XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhciBidWYgPSB0aGlzXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSBidWYubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHJldHVybiBidWZbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKSB7XG4gICAgICByZXR1cm4gYnVmLl9kYXRhdmlldy5nZXRVaW50MTYob2Zmc2V0LCBsaXR0bGVFbmRpYW4pXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBkdiA9IG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoMikpXG4gICAgICBkdi5zZXRVaW50OCgwLCBidWZbbGVuIC0gMV0pXG4gICAgICByZXR1cm4gZHYuZ2V0VWludDE2KDAsIGxpdHRsZUVuZGlhbilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIHZhbFxuICAgIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXRdXG4gICAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXRdIDw8IDhcbiAgICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdXG4gICAgfVxuICAgIHJldHVybiB2YWxcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbikge1xuICAgICAgcmV0dXJuIGJ1Zi5fZGF0YXZpZXcuZ2V0VWludDMyKG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDQpKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgKyBvZmZzZXQgPCBsZW47IGkrKykge1xuICAgICAgICBkdi5zZXRVaW50OChpLCBidWZbaSArIG9mZnNldF0pXG4gICAgICB9XG4gICAgICByZXR1cm4gZHYuZ2V0VWludDMyKDAsIGxpdHRsZUVuZGlhbilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIHZhbFxuICAgIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMl0gPDwgMTZcbiAgICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0XVxuICAgICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0ICsgM10gPDwgMjQgPj4+IDApXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMV0gPDwgMTZcbiAgICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgICB2YWwgfD0gYnVmW29mZnNldCArIDJdIDw8IDhcbiAgICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgICB2YWwgfD0gYnVmW29mZnNldCArIDNdXG4gICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldF0gPDwgMjQgPj4+IDApXG4gICAgfVxuICAgIHJldHVybiB2YWxcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhciBidWYgPSB0aGlzXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLFxuICAgICAgICAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSBidWYubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIHJldHVybiBidWYuX2RhdGF2aWV3LmdldEludDgob2Zmc2V0KVxuICB9IGVsc2Uge1xuICAgIHZhciBuZWcgPSBidWZbb2Zmc2V0XSAmIDB4ODBcbiAgICBpZiAobmVnKVxuICAgICAgcmV0dXJuICgweGZmIC0gYnVmW29mZnNldF0gKyAxKSAqIC0xXG4gICAgZWxzZVxuICAgICAgcmV0dXJuIGJ1ZltvZmZzZXRdXG4gIH1cbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIGlmIChvZmZzZXQgKyAxID09PSBsZW4pIHtcbiAgICAgIHZhciBkdiA9IG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoMikpXG4gICAgICBkdi5zZXRVaW50OCgwLCBidWZbbGVuIC0gMV0pXG4gICAgICByZXR1cm4gZHYuZ2V0SW50MTYoMCwgbGl0dGxlRW5kaWFuKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYnVmLl9kYXRhdmlldy5nZXRJbnQxNihvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIHZhbCA9IF9yZWFkVUludDE2KGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gICAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMFxuICAgIGlmIChuZWcpXG4gICAgICByZXR1cm4gKDB4ZmZmZiAtIHZhbCArIDEpICogLTFcbiAgICBlbHNlXG4gICAgICByZXR1cm4gdmFsXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIGlmIChvZmZzZXQgKyAzID49IGxlbikge1xuICAgICAgdmFyIGR2ID0gbmV3IERhdGFWaWV3KG5ldyBBcnJheUJ1ZmZlcig0KSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpICsgb2Zmc2V0IDwgbGVuOyBpKyspIHtcbiAgICAgICAgZHYuc2V0VWludDgoaSwgYnVmW2kgKyBvZmZzZXRdKVxuICAgICAgfVxuICAgICAgcmV0dXJuIGR2LmdldEludDMyKDAsIGxpdHRsZUVuZGlhbilcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGJ1Zi5fZGF0YXZpZXcuZ2V0SW50MzIob2Zmc2V0LCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciB2YWwgPSBfcmVhZFVJbnQzMihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICAgIHZhciBuZWcgPSB2YWwgJiAweDgwMDAwMDAwXG4gICAgaWYgKG5lZylcbiAgICAgIHJldHVybiAoMHhmZmZmZmZmZiAtIHZhbCArIDEpICogLTFcbiAgICBlbHNlXG4gICAgICByZXR1cm4gdmFsXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRGbG9hdCAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICByZXR1cm4gYnVmLl9kYXRhdmlldy5nZXRGbG9hdDMyKG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWREb3VibGUgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgcmV0dXJuIGJ1Zi5fZGF0YXZpZXcuZ2V0RmxvYXQ2NChvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFyIGJ1ZiA9IHRoaXNcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSBidWYubGVuZ3RoKSByZXR1cm5cblxuICBidWZbb2Zmc2V0XSA9IHZhbHVlXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA9PT0gbGVuKSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDIpKVxuICAgICAgZHYuc2V0VWludDE2KDAsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgICBidWZbb2Zmc2V0XSA9IGR2LmdldFVpbnQ4KDApXG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1Zi5fZGF0YXZpZXcuc2V0VWludDE2KG9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAgICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAgICAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZmZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgaVxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICBpZiAob2Zmc2V0ICsgMyA+PSBsZW4pIHtcbiAgICAgIHZhciBkdiA9IG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoNCkpXG4gICAgICBkdi5zZXRVaW50MzIoMCwgdmFsdWUsIGxpdHRsZUVuZGlhbilcbiAgICAgIGZvciAoaSA9IDA7IGkgKyBvZmZzZXQgPCBsZW47IGkrKykge1xuICAgICAgICBidWZbaSArIG9mZnNldF0gPSBkdi5nZXRVaW50OChpKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBidWYuX2RhdGF2aWV3LnNldFVpbnQzMihvZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAoaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAgICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgICB9XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhciBidWYgPSB0aGlzXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZiwgLTB4ODApXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IGJ1Zi5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgYnVmLl9kYXRhdmlldy5zZXRJbnQ4KG9mZnNldCwgdmFsdWUpXG4gIH0gZWxzZSB7XG4gICAgaWYgKHZhbHVlID49IDApXG4gICAgICBidWYud3JpdGVVSW50OCh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgICBlbHNlXG4gICAgICBidWYud3JpdGVVSW50OCgweGZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIG5vQXNzZXJ0KVxuICB9XG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZiwgLTB4ODAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmIChicm93c2VyU3VwcG9ydCkge1xuICAgIGlmIChvZmZzZXQgKyAxID09PSBsZW4pIHtcbiAgICAgIHZhciBkdiA9IG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoMikpXG4gICAgICBkdi5zZXRJbnQxNigwLCB2YWx1ZSwgbGl0dGxlRW5kaWFuKVxuICAgICAgYnVmW29mZnNldF0gPSBkdi5nZXRVaW50OCgwKVxuICAgIH0gZWxzZSB7XG4gICAgICBidWYuX2RhdGF2aWV3LnNldEludDE2KG9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbilcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKHZhbHVlID49IDApXG4gICAgICBfd3JpdGVVSW50MTYoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICAgIGVsc2VcbiAgICAgIF93cml0ZVVJbnQxNihidWYsIDB4ZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgaWYgKG9mZnNldCArIDMgPj0gbGVuKSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDQpKVxuICAgICAgZHYuc2V0SW50MzIoMCwgdmFsdWUsIGxpdHRsZUVuZGlhbilcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpICsgb2Zmc2V0IDwgbGVuOyBpKyspIHtcbiAgICAgICAgYnVmW2kgKyBvZmZzZXRdID0gZHYuZ2V0VWludDgoaSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgYnVmLl9kYXRhdmlldy5zZXRJbnQzMihvZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmICh2YWx1ZSA+PSAwKVxuICAgICAgX3dyaXRlVUludDMyKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgICBlbHNlXG4gICAgICBfd3JpdGVVSW50MzIoYnVmLCAweGZmZmZmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAoYnJvd3NlclN1cHBvcnQpIHtcbiAgICBpZiAob2Zmc2V0ICsgMyA+PSBsZW4pIHtcbiAgICAgIHZhciBkdiA9IG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoNCkpXG4gICAgICBkdi5zZXRGbG9hdDMyKDAsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSArIG9mZnNldCA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGJ1ZltpICsgb2Zmc2V0XSA9IGR2LmdldFVpbnQ4KGkpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1Zi5fZGF0YXZpZXcuc2V0RmxvYXQzMihvZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZURvdWJsZSAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCxcbiAgICAgICAgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKGJyb3dzZXJTdXBwb3J0KSB7XG4gICAgaWYgKG9mZnNldCArIDcgPj0gbGVuKSB7XG4gICAgICB2YXIgZHYgPSBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDgpKVxuICAgICAgZHYuc2V0RmxvYXQ2NCgwLCB2YWx1ZSwgbGl0dGxlRW5kaWFuKVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgKyBvZmZzZXQgPCBsZW47IGkrKykge1xuICAgICAgICBidWZbaSArIG9mZnNldF0gPSBkdi5nZXRVaW50OChpKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBidWYuX2RhdGF2aWV3LnNldEZsb2F0NjQob2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHZhbHVlID0gdmFsdWUuY2hhckNvZGVBdCgwKVxuICB9XG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicgfHwgaXNOYU4odmFsdWUpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd2YWx1ZSBpcyBub3QgYSBudW1iZXInKVxuICB9XG5cbiAgaWYgKGVuZCA8IHN0YXJ0KSB0aHJvdyBuZXcgRXJyb3IoJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPj0gdGhpcy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICB9XG5cbiAgaWYgKGVuZCA8IDAgfHwgZW5kID4gdGhpcy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2VuZCBvdXQgb2YgYm91bmRzJylcbiAgfVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgdGhpc1tpXSA9IHZhbHVlXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3V0ID0gW11cbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBvdXRbaV0gPSB0b0hleCh0aGlzW2ldKVxuICAgIGlmIChpID09PSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTKSB7XG4gICAgICBvdXRbaSArIDFdID0gJy4uLidcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgb3V0LmpvaW4oJyAnKSArICc+J1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gTm90IGFkZGVkIHRvIEJ1ZmZlci5wcm90b3R5cGUgc2luY2UgaXQgc2hvdWxkIG9ubHlcbiAqIGJlIGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlclRvQXJyYXlCdWZmZXIgKCkge1xuICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuZnVuY3Rpb24gYXVnbWVudCAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gQXVnbWVudCB0aGUgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCdWZmZXJUb0FycmF5QnVmZmVyXG5cbiAgaWYgKGFyci5ieXRlTGVuZ3RoICE9PSAwKVxuICAgIGFyci5fZGF0YXZpZXcgPSBuZXcgRGF0YVZpZXcoYXJyLmJ1ZmZlciwgYXJyLmJ5dGVPZmZzZXQsIGFyci5ieXRlTGVuZ3RoKVxuXG4gIHJldHVybiBhcnJcbn1cblxuLy8gc2xpY2Uoc3RhcnQsIGVuZClcbmZ1bmN0aW9uIGNsYW1wIChpbmRleCwgbGVuLCBkZWZhdWx0VmFsdWUpIHtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBkZWZhdWx0VmFsdWVcbiAgaW5kZXggPSB+fmluZGV4OyAgLy8gQ29lcmNlIHRvIGludGVnZXIuXG4gIGlmIChpbmRleCA+PSBsZW4pIHJldHVybiBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICBpbmRleCArPSBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBjb2VyY2UgKGxlbmd0aCkge1xuICAvLyBDb2VyY2UgbGVuZ3RoIHRvIGEgbnVtYmVyIChwb3NzaWJseSBOYU4pLCByb3VuZCB1cFxuICAvLyBpbiBjYXNlIGl0J3MgZnJhY3Rpb25hbCAoZS5nLiAxMjMuNDU2KSB0aGVuIGRvIGFcbiAgLy8gZG91YmxlIG5lZ2F0ZSB0byBjb2VyY2UgYSBOYU4gdG8gMC4gRWFzeSwgcmlnaHQ/XG4gIGxlbmd0aCA9IH5+TWF0aC5jZWlsKCtsZW5ndGgpXG4gIHJldHVybiBsZW5ndGggPCAwID8gMCA6IGxlbmd0aFxufVxuXG5mdW5jdGlvbiBpc0FycmF5IChzdWJqZWN0KSB7XG4gIHJldHVybiAoQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoc3ViamVjdCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc3ViamVjdCkgPT09ICdbb2JqZWN0IEFycmF5XSdcbiAgfSkoc3ViamVjdClcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspXG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KGkpIDw9IDB4N0YpXG4gICAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSlcbiAgICBlbHNlIHtcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5jaGFyQXQoaSkpLnN1YnN0cigxKS5zcGxpdCgnJScpXG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGgubGVuZ3RoOyBqKyspXG4gICAgICAgIGJ5dGVBcnJheS5wdXNoKHBhcnNlSW50KGhbal0sIDE2KSlcbiAgICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyAoc3RyKSB7XG4gIHJldHVybiBiYXNlNjQudG9CeXRlQXJyYXkoc3RyKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIHBvc1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKVxuICAgICAgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cblxuLypcbiAqIFdlIGhhdmUgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHZhbHVlIGlzIGEgdmFsaWQgaW50ZWdlci4gVGhpcyBtZWFucyB0aGF0IGl0XG4gKiBpcyBub24tbmVnYXRpdmUuIEl0IGhhcyBubyBmcmFjdGlvbmFsIGNvbXBvbmVudCBhbmQgdGhhdCBpdCBkb2VzIG5vdFxuICogZXhjZWVkIHRoZSBtYXhpbXVtIGFsbG93ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIHZlcmlmdWludCAodmFsdWUsIG1heCkge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA+PSAwLFxuICAgICAgJ3NwZWNpZmllZCBhIG5lZ2F0aXZlIHZhbHVlIGZvciB3cml0aW5nIGFuIHVuc2lnbmVkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGlzIGxhcmdlciB0aGFuIG1heGltdW0gdmFsdWUgZm9yIHR5cGUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZnNpbnQodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZJRUVFNzU0KHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG59XG5cbmZ1bmN0aW9uIGFzc2VydCAodGVzdCwgbWVzc2FnZSkge1xuICBpZiAoIXRlc3QpIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICdGYWlsZWQgYXNzZXJ0aW9uJylcbn1cblxufSx7XCJiYXNlNjQtanNcIjozLFwiaWVlZTc1NFwiOjR9XSxcIm5hdGl2ZS1idWZmZXItYnJvd3NlcmlmeVwiOltmdW5jdGlvbihyZXF1aXJlLG1vZHVsZSxleHBvcnRzKXtcbm1vZHVsZS5leHBvcnRzPXJlcXVpcmUoJ1BjWmo5TCcpO1xufSx7fV0sMzpbZnVuY3Rpb24ocmVxdWlyZSxtb2R1bGUsZXhwb3J0cyl7XG4oZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG5cdHZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnI7XG5cdFxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93ICdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jztcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0cGxhY2VIb2xkZXJzID0gaW5kZXhPZihiNjQsICc9Jyk7XG5cdFx0cGxhY2VIb2xkZXJzID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSBwbGFjZUhvbGRlcnMgOiAwO1xuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gW107Ly9uZXcgVWludDhBcnJheShiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpO1xuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoO1xuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGluZGV4T2YobG9va3VwLCBiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoaW5kZXhPZihsb29rdXAsIGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoaW5kZXhPZihsb29rdXAsIGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGluZGV4T2YobG9va3VwLCBiNjQuY2hhckF0KGkgKyAzKSk7XG5cdFx0XHRhcnIucHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KTtcblx0XHRcdGFyci5wdXNoKCh0bXAgJiAweEZGMDApID4+IDgpO1xuXHRcdFx0YXJyLnB1c2godG1wICYgMHhGRik7XG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGluZGV4T2YobG9va3VwLCBiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChpbmRleE9mKGxvb2t1cCwgYjY0LmNoYXJBdChpICsgMSkpID4+IDQpO1xuXHRcdFx0YXJyLnB1c2godG1wICYgMHhGRik7XG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChpbmRleE9mKGxvb2t1cCwgYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGluZGV4T2YobG9va3VwLCBiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoaW5kZXhPZihsb29rdXAsIGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKTtcblx0XHRcdGFyci5wdXNoKCh0bXAgPj4gOCkgJiAweEZGKTtcblx0XHRcdGFyci5wdXNoKHRtcCAmIDB4RkYpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhcnI7XG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0KHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGg7XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtID4+IDE4ICYgMHgzRikgKyBsb29rdXAuY2hhckF0KG51bSA+PiAxMiAmIDB4M0YpICsgbG9va3VwLmNoYXJBdChudW0gPj4gNiAmIDB4M0YpICsgbG9va3VwLmNoYXJBdChudW0gJiAweDNGKTtcblx0XHR9O1xuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSk7XG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApO1xuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRvdXRwdXQgKz0gbG9va3VwLmNoYXJBdCh0ZW1wID4+IDIpO1xuXHRcdFx0XHRvdXRwdXQgKz0gbG9va3VwLmNoYXJBdCgodGVtcCA8PCA0KSAmIDB4M0YpO1xuXHRcdFx0XHRvdXRwdXQgKz0gJz09Jztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pO1xuXHRcdFx0XHRvdXRwdXQgKz0gbG9va3VwLmNoYXJBdCh0ZW1wID4+IDEwKTtcblx0XHRcdFx0b3V0cHV0ICs9IGxvb2t1cC5jaGFyQXQoKHRlbXAgPj4gNCkgJiAweDNGKTtcblx0XHRcdFx0b3V0cHV0ICs9IGxvb2t1cC5jaGFyQXQoKHRlbXAgPDwgMikgJiAweDNGKTtcblx0XHRcdFx0b3V0cHV0ICs9ICc9Jztcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdG1vZHVsZS5leHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXk7XG5cdG1vZHVsZS5leHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0O1xufSgpKTtcblxuZnVuY3Rpb24gaW5kZXhPZiAoYXJyLCBlbHQgLyosIGZyb20qLykge1xuXHR2YXIgbGVuID0gYXJyLmxlbmd0aDtcblxuXHR2YXIgZnJvbSA9IE51bWJlcihhcmd1bWVudHNbMV0pIHx8IDA7XG5cdGZyb20gPSAoZnJvbSA8IDApXG5cdFx0PyBNYXRoLmNlaWwoZnJvbSlcblx0XHQ6IE1hdGguZmxvb3IoZnJvbSk7XG5cdGlmIChmcm9tIDwgMClcblx0XHRmcm9tICs9IGxlbjtcblxuXHRmb3IgKDsgZnJvbSA8IGxlbjsgZnJvbSsrKSB7XG5cdFx0aWYgKCh0eXBlb2YgYXJyID09PSAnc3RyaW5nJyAmJiBhcnIuY2hhckF0KGZyb20pID09PSBlbHQpIHx8XG5cdFx0XHRcdCh0eXBlb2YgYXJyICE9PSAnc3RyaW5nJyAmJiBhcnJbZnJvbV0gPT09IGVsdCkpIHtcblx0XHRcdHJldHVybiBmcm9tO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gLTE7XG59XG5cbn0se31dLDQ6W2Z1bmN0aW9uKHJlcXVpcmUsbW9kdWxlLGV4cG9ydHMpe1xuZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24oYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBuQml0cyA9IC03LFxuICAgICAgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwLFxuICAgICAgZCA9IGlzTEUgPyAtMSA6IDEsXG4gICAgICBzID0gYnVmZmVyW29mZnNldCArIGldO1xuXG4gIGkgKz0gZDtcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgcyA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IGVMZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBlID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gbUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzO1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSk7XG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICBlID0gZSAtIGVCaWFzO1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pO1xufTtcblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKSxcbiAgICAgIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKSxcbiAgICAgIGQgPSBpc0xFID8gMSA6IC0xLFxuICAgICAgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMDtcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKTtcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMDtcbiAgICBlID0gZU1heDtcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tO1xuICAgICAgYyAqPSAyO1xuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gYztcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpO1xuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrKztcbiAgICAgIGMgLz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwO1xuICAgICAgZSA9IGVNYXg7XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IGUgKyBlQmlhcztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IDA7XG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCk7XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbTtcbiAgZUxlbiArPSBtTGVuO1xuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpO1xuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyODtcbn07XG5cbn0se31dfSx7fSxbXSlcbjs7bW9kdWxlLmV4cG9ydHM9cmVxdWlyZShcIm5hdGl2ZS1idWZmZXItYnJvd3NlcmlmeVwiKS5CdWZmZXJcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgaWYgKGNhblBvc3QpIHtcbiAgICAgICAgdmFyIHF1ZXVlID0gW107XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsInZhciBnbG9iYWw9dHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9Oy8qISBodHRwOi8vbXRocy5iZS9wdW55Y29kZSB2MS4yLjMgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZXMgKi9cblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cztcblx0dmFyIGZyZWVNb2R1bGUgPSB0eXBlb2YgbW9kdWxlID09ICdvYmplY3QnICYmIG1vZHVsZSAmJlxuXHRcdG1vZHVsZS5leHBvcnRzID09IGZyZWVFeHBvcnRzICYmIG1vZHVsZTtcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8IGZyZWVHbG9iYWwud2luZG93ID09PSBmcmVlR2xvYmFsKSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBwdW55Y29kZWAgb2JqZWN0LlxuXHQgKiBAbmFtZSBwdW55Y29kZVxuXHQgKiBAdHlwZSBPYmplY3Rcblx0ICovXG5cdHZhciBwdW55Y29kZSxcblxuXHQvKiogSGlnaGVzdCBwb3NpdGl2ZSBzaWduZWQgMzItYml0IGZsb2F0IHZhbHVlICovXG5cdG1heEludCA9IDIxNDc0ODM2NDcsIC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuXHQvKiogQm9vdHN0cmluZyBwYXJhbWV0ZXJzICovXG5cdGJhc2UgPSAzNixcblx0dE1pbiA9IDEsXG5cdHRNYXggPSAyNixcblx0c2tldyA9IDM4LFxuXHRkYW1wID0gNzAwLFxuXHRpbml0aWFsQmlhcyA9IDcyLFxuXHRpbml0aWFsTiA9IDEyOCwgLy8gMHg4MFxuXHRkZWxpbWl0ZXIgPSAnLScsIC8vICdcXHgyRCdcblxuXHQvKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuXHRyZWdleFB1bnljb2RlID0gL154bi0tLyxcblx0cmVnZXhOb25BU0NJSSA9IC9bXiAtfl0vLCAvLyB1bnByaW50YWJsZSBBU0NJSSBjaGFycyArIG5vbi1BU0NJSSBjaGFyc1xuXHRyZWdleFNlcGFyYXRvcnMgPSAvXFx4MkV8XFx1MzAwMnxcXHVGRjBFfFxcdUZGNjEvZywgLy8gUkZDIDM0OTAgc2VwYXJhdG9yc1xuXG5cdC8qKiBFcnJvciBtZXNzYWdlcyAqL1xuXHRlcnJvcnMgPSB7XG5cdFx0J292ZXJmbG93JzogJ092ZXJmbG93OiBpbnB1dCBuZWVkcyB3aWRlciBpbnRlZ2VycyB0byBwcm9jZXNzJyxcblx0XHQnbm90LWJhc2ljJzogJ0lsbGVnYWwgaW5wdXQgPj0gMHg4MCAobm90IGEgYmFzaWMgY29kZSBwb2ludCknLFxuXHRcdCdpbnZhbGlkLWlucHV0JzogJ0ludmFsaWQgaW5wdXQnXG5cdH0sXG5cblx0LyoqIENvbnZlbmllbmNlIHNob3J0Y3V0cyAqL1xuXHRiYXNlTWludXNUTWluID0gYmFzZSAtIHRNaW4sXG5cdGZsb29yID0gTWF0aC5mbG9vcixcblx0c3RyaW5nRnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZSxcblxuXHQvKiogVGVtcG9yYXJ5IHZhcmlhYmxlICovXG5cdGtleTtcblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGVycm9yIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIFRoZSBlcnJvciB0eXBlLlxuXHQgKiBAcmV0dXJucyB7RXJyb3J9IFRocm93cyBhIGBSYW5nZUVycm9yYCB3aXRoIHRoZSBhcHBsaWNhYmxlIGVycm9yIG1lc3NhZ2UuXG5cdCAqL1xuXHRmdW5jdGlvbiBlcnJvcih0eXBlKSB7XG5cdFx0dGhyb3cgUmFuZ2VFcnJvcihlcnJvcnNbdHlwZV0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBgQXJyYXkjbWFwYCB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnkgYXJyYXlcblx0ICogaXRlbS5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBhcnJheSBvZiB2YWx1ZXMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwKGFycmF5LCBmbikge1xuXHRcdHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cdFx0d2hpbGUgKGxlbmd0aC0tKSB7XG5cdFx0XHRhcnJheVtsZW5ndGhdID0gZm4oYXJyYXlbbGVuZ3RoXSk7XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHNpbXBsZSBgQXJyYXkjbWFwYC1saWtlIHdyYXBwZXIgdG8gd29yayB3aXRoIGRvbWFpbiBuYW1lIHN0cmluZ3MuXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnlcblx0ICogY2hhcmFjdGVyLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IHN0cmluZyBvZiBjaGFyYWN0ZXJzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFja1xuXHQgKiBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcERvbWFpbihzdHJpbmcsIGZuKSB7XG5cdFx0cmV0dXJuIG1hcChzdHJpbmcuc3BsaXQocmVnZXhTZXBhcmF0b3JzKSwgZm4pLmpvaW4oJy4nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIG51bWVyaWMgY29kZSBwb2ludHMgb2YgZWFjaCBVbmljb2RlXG5cdCAqIGNoYXJhY3RlciBpbiB0aGUgc3RyaW5nLiBXaGlsZSBKYXZhU2NyaXB0IHVzZXMgVUNTLTIgaW50ZXJuYWxseSxcblx0ICogdGhpcyBmdW5jdGlvbiB3aWxsIGNvbnZlcnQgYSBwYWlyIG9mIHN1cnJvZ2F0ZSBoYWx2ZXMgKGVhY2ggb2Ygd2hpY2hcblx0ICogVUNTLTIgZXhwb3NlcyBhcyBzZXBhcmF0ZSBjaGFyYWN0ZXJzKSBpbnRvIGEgc2luZ2xlIGNvZGUgcG9pbnQsXG5cdCAqIG1hdGNoaW5nIFVURi0xNi5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5lbmNvZGVgXG5cdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGRlY29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIFRoZSBVbmljb2RlIGlucHV0IHN0cmluZyAoVUNTLTIpLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBuZXcgYXJyYXkgb2YgY29kZSBwb2ludHMuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cmluZykge1xuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgY291bnRlciA9IDAsXG5cdFx0ICAgIGxlbmd0aCA9IHN0cmluZy5sZW5ndGgsXG5cdFx0ICAgIHZhbHVlLFxuXHRcdCAgICBleHRyYTtcblx0XHR3aGlsZSAoY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0aWYgKHZhbHVlID49IDB4RDgwMCAmJiB2YWx1ZSA8PSAweERCRkYgJiYgY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBoaWdoIHN1cnJvZ2F0ZSwgYW5kIHRoZXJlIGlzIGEgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0ZXh0cmEgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0XHRpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gbG93IHN1cnJvZ2F0ZVxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCgodmFsdWUgJiAweDNGRikgPDwgMTApICsgKGV4dHJhICYgMHgzRkYpICsgMHgxMDAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlIG5leHRcblx0XHRcdFx0XHQvLyBjb2RlIHVuaXQgaXMgdGhlIGhpZ2ggc3Vycm9nYXRlIG9mIGEgc3Vycm9nYXRlIHBhaXJcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y291bnRlci0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHN0cmluZyBiYXNlZCBvbiBhbiBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmRlY29kZWBcblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZW5jb2RlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGNvZGVQb2ludHMgVGhlIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBuZXcgVW5pY29kZSBzdHJpbmcgKFVDUy0yKS5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJlbmNvZGUoYXJyYXkpIHtcblx0XHRyZXR1cm4gbWFwKGFycmF5LCBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFyIG91dHB1dCA9ICcnO1xuXHRcdFx0aWYgKHZhbHVlID4gMHhGRkZGKSB7XG5cdFx0XHRcdHZhbHVlIC09IDB4MTAwMDA7XG5cdFx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApO1xuXHRcdFx0XHR2YWx1ZSA9IDB4REMwMCB8IHZhbHVlICYgMHgzRkY7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSkuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBiYXNpYyBjb2RlIHBvaW50IGludG8gYSBkaWdpdC9pbnRlZ2VyLlxuXHQgKiBAc2VlIGBkaWdpdFRvQmFzaWMoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvZGVQb2ludCBUaGUgYmFzaWMgbnVtZXJpYyBjb2RlIHBvaW50IHZhbHVlLlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQgKGZvciB1c2UgaW5cblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpbiB0aGUgcmFuZ2UgYDBgIHRvIGBiYXNlIC0gMWAsIG9yIGBiYXNlYCBpZlxuXHQgKiB0aGUgY29kZSBwb2ludCBkb2VzIG5vdCByZXByZXNlbnQgYSB2YWx1ZS5cblx0ICovXG5cdGZ1bmN0aW9uIGJhc2ljVG9EaWdpdChjb2RlUG9pbnQpIHtcblx0XHRpZiAoY29kZVBvaW50IC0gNDggPCAxMCkge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDIyO1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gNjUgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDY1O1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gOTcgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDk3O1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGRpZ2l0L2ludGVnZXIgaW50byBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEBzZWUgYGJhc2ljVG9EaWdpdCgpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gZGlnaXQgVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgYmFzaWMgY29kZSBwb2ludCB3aG9zZSB2YWx1ZSAod2hlbiB1c2VkIGZvclxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGlzIGBkaWdpdGAsIHdoaWNoIG5lZWRzIHRvIGJlIGluIHRoZSByYW5nZVxuXHQgKiBgMGAgdG8gYGJhc2UgLSAxYC4gSWYgYGZsYWdgIGlzIG5vbi16ZXJvLCB0aGUgdXBwZXJjYXNlIGZvcm0gaXNcblx0ICogdXNlZDsgZWxzZSwgdGhlIGxvd2VyY2FzZSBmb3JtIGlzIHVzZWQuIFRoZSBiZWhhdmlvciBpcyB1bmRlZmluZWRcblx0ICogaWYgYGZsYWdgIGlzIG5vbi16ZXJvIGFuZCBgZGlnaXRgIGhhcyBubyB1cHBlcmNhc2UgZm9ybS5cblx0ICovXG5cdGZ1bmN0aW9uIGRpZ2l0VG9CYXNpYyhkaWdpdCwgZmxhZykge1xuXHRcdC8vICAwLi4yNSBtYXAgdG8gQVNDSUkgYS4ueiBvciBBLi5aXG5cdFx0Ly8gMjYuLjM1IG1hcCB0byBBU0NJSSAwLi45XG5cdFx0cmV0dXJuIGRpZ2l0ICsgMjIgKyA3NSAqIChkaWdpdCA8IDI2KSAtICgoZmxhZyAhPSAwKSA8PCA1KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCaWFzIGFkYXB0YXRpb24gZnVuY3Rpb24gYXMgcGVyIHNlY3Rpb24gMy40IG9mIFJGQyAzNDkyLlxuXHQgKiBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNDkyI3NlY3Rpb24tMy40XG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRmdW5jdGlvbiBhZGFwdChkZWx0YSwgbnVtUG9pbnRzLCBmaXJzdFRpbWUpIHtcblx0XHR2YXIgayA9IDA7XG5cdFx0ZGVsdGEgPSBmaXJzdFRpbWUgPyBmbG9vcihkZWx0YSAvIGRhbXApIDogZGVsdGEgPj4gMTtcblx0XHRkZWx0YSArPSBmbG9vcihkZWx0YSAvIG51bVBvaW50cyk7XG5cdFx0Zm9yICgvKiBubyBpbml0aWFsaXphdGlvbiAqLzsgZGVsdGEgPiBiYXNlTWludXNUTWluICogdE1heCA+PiAxOyBrICs9IGJhc2UpIHtcblx0XHRcdGRlbHRhID0gZmxvb3IoZGVsdGEgLyBiYXNlTWludXNUTWluKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZsb29yKGsgKyAoYmFzZU1pbnVzVE1pbiArIDEpICogZGVsdGEgLyAoZGVsdGEgKyBza2V3KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzIHRvIGEgc3RyaW5nIG9mIFVuaWNvZGVcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGVjb2RlKGlucHV0KSB7XG5cdFx0Ly8gRG9uJ3QgdXNlIFVDUy0yXG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aCxcblx0XHQgICAgb3V0LFxuXHRcdCAgICBpID0gMCxcblx0XHQgICAgbiA9IGluaXRpYWxOLFxuXHRcdCAgICBiaWFzID0gaW5pdGlhbEJpYXMsXG5cdFx0ICAgIGJhc2ljLFxuXHRcdCAgICBqLFxuXHRcdCAgICBpbmRleCxcblx0XHQgICAgb2xkaSxcblx0XHQgICAgdyxcblx0XHQgICAgayxcblx0XHQgICAgZGlnaXQsXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGxlbmd0aCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIHRvIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHlcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFVuaWNvZGUuIE9ubHkgdGhlXG5cdCAqIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgb24gYSBzdHJpbmcgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCB0b1xuXHQgKiBVbmljb2RlLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgUHVueWNvZGUgZG9tYWluIG5hbWUgdG8gY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/IGRlY29kZShzdHJpbmcuc2xpY2UoNCkudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBQdW55Y29kZS4gT25seSB0aGVcblx0ICogbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgdG8gY29udmVydCwgYXMgYSBVbmljb2RlIHN0cmluZy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFB1bnljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBkb21haW4gbmFtZS5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gJ3huLS0nICsgZW5jb2RlKHN0cmluZylcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKiogRGVmaW5lIHRoZSBwdWJsaWMgQVBJICovXG5cdHB1bnljb2RlID0ge1xuXHRcdC8qKlxuXHRcdCAqIEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgY3VycmVudCBQdW55Y29kZS5qcyB2ZXJzaW9uIG51bWJlci5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBTdHJpbmdcblx0XHQgKi9cblx0XHQndmVyc2lvbic6ICcxLjIuMycsXG5cdFx0LyoqXG5cdFx0ICogQW4gb2JqZWN0IG9mIG1ldGhvZHMgdG8gY29udmVydCBmcm9tIEphdmFTY3JpcHQncyBpbnRlcm5hbCBjaGFyYWN0ZXJcblx0XHQgKiByZXByZXNlbnRhdGlvbiAoVUNTLTIpIHRvIFVuaWNvZGUgY29kZSBwb2ludHMsIGFuZCBiYWNrLlxuXHRcdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH1cdGVsc2UgaWYgKGZyZWVFeHBvcnRzICYmICFmcmVlRXhwb3J0cy5ub2RlVHlwZSkge1xuXHRcdGlmIChmcmVlTW9kdWxlKSB7IC8vIGluIE5vZGUuanMgb3IgUmluZ29KUyB2MC44LjArXG5cdFx0XHRmcmVlTW9kdWxlLmV4cG9ydHMgPSBwdW55Y29kZTtcblx0XHR9IGVsc2UgeyAvLyBpbiBOYXJ3aGFsIG9yIFJpbmdvSlMgdjAuNy4wLVxuXHRcdFx0Zm9yIChrZXkgaW4gcHVueWNvZGUpIHtcblx0XHRcdFx0cHVueWNvZGUuaGFzT3duUHJvcGVydHkoa2V5KSAmJiAoZnJlZUV4cG9ydHNba2V5XSA9IHB1bnljb2RlW2tleV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHsgLy8gaW4gUmhpbm8gb3IgYSB3ZWIgYnJvd3NlclxuXHRcdHJvb3QucHVueWNvZGUgPSBwdW55Y29kZTtcblx0fVxuXG59KHRoaXMpKTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG9ialtrXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUodikpO1xuICAgICAgICB9KS5qb2luKHNlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9ialtrXSkpO1xuICAgICAgfVxuICAgIH0pLmpvaW4oc2VwKTtcblxuICB9XG5cbiAgaWYgKCFuYW1lKSByZXR1cm4gJyc7XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG5hbWUpKSArIGVxICtcbiAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqKSk7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxuZnVuY3Rpb24gbWFwICh4cywgZikge1xuICBpZiAoeHMubWFwKSByZXR1cm4geHMubWFwKGYpO1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICByZXMucHVzaChmKHhzW2ldLCBpKSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSByZXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmRlY29kZSA9IGV4cG9ydHMucGFyc2UgPSByZXF1aXJlKCcuL2RlY29kZScpO1xuZXhwb3J0cy5lbmNvZGUgPSBleHBvcnRzLnN0cmluZ2lmeSA9IHJlcXVpcmUoJy4vZW5jb2RlJyk7XG4iLCIvKmpzaGludCBzdHJpY3Q6dHJ1ZSBub2RlOnRydWUgZXM1OnRydWUgb25ldmFyOnRydWUgbGF4Y29tbWE6dHJ1ZSBsYXhicmVhazp0cnVlIGVxZXFlcTp0cnVlIGltbWVkOnRydWUgbGF0ZWRlZjp0cnVlKi9cbihmdW5jdGlvbiAoKSB7XG4gIFwidXNlIHN0cmljdFwiO1xuXG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIHB1bnljb2RlID0gcmVxdWlyZSgncHVueWNvZGUnKTtcblxuZXhwb3J0cy5wYXJzZSA9IHVybFBhcnNlO1xuZXhwb3J0cy5yZXNvbHZlID0gdXJsUmVzb2x2ZTtcbmV4cG9ydHMucmVzb2x2ZU9iamVjdCA9IHVybFJlc29sdmVPYmplY3Q7XG5leHBvcnRzLmZvcm1hdCA9IHVybEZvcm1hdDtcblxuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbnZhciBwcm90b2NvbFBhdHRlcm4gPSAvXihbYS16MC05ListXSs6KS9pLFxuICAgIHBvcnRQYXR0ZXJuID0gLzpbMC05XSokLyxcblxuICAgIC8vIFJGQyAyMzk2OiBjaGFyYWN0ZXJzIHJlc2VydmVkIGZvciBkZWxpbWl0aW5nIFVSTHMuXG4gICAgLy8gV2UgYWN0dWFsbHkganVzdCBhdXRvLWVzY2FwZSB0aGVzZS5cbiAgICBkZWxpbXMgPSBbJzwnLCAnPicsICdcIicsICdgJywgJyAnLCAnXFxyJywgJ1xcbicsICdcXHQnXSxcblxuICAgIC8vIFJGQyAyMzk2OiBjaGFyYWN0ZXJzIG5vdCBhbGxvd2VkIGZvciB2YXJpb3VzIHJlYXNvbnMuXG4gICAgdW53aXNlID0gWyd7JywgJ30nLCAnfCcsICdcXFxcJywgJ14nLCAnficsICdgJ10uY29uY2F0KGRlbGltcyksXG5cbiAgICAvLyBBbGxvd2VkIGJ5IFJGQ3MsIGJ1dCBjYXVzZSBvZiBYU1MgYXR0YWNrcy4gIEFsd2F5cyBlc2NhcGUgdGhlc2UuXG4gICAgYXV0b0VzY2FwZSA9IFsnXFwnJ10uY29uY2F0KGRlbGltcyksXG4gICAgLy8gQ2hhcmFjdGVycyB0aGF0IGFyZSBuZXZlciBldmVyIGFsbG93ZWQgaW4gYSBob3N0bmFtZS5cbiAgICAvLyBOb3RlIHRoYXQgYW55IGludmFsaWQgY2hhcnMgYXJlIGFsc28gaGFuZGxlZCwgYnV0IHRoZXNlXG4gICAgLy8gYXJlIHRoZSBvbmVzIHRoYXQgYXJlICpleHBlY3RlZCogdG8gYmUgc2Vlbiwgc28gd2UgZmFzdC1wYXRoXG4gICAgLy8gdGhlbS5cbiAgICBub25Ib3N0Q2hhcnMgPSBbJyUnLCAnLycsICc/JywgJzsnLCAnIyddXG4gICAgICAuY29uY2F0KHVud2lzZSkuY29uY2F0KGF1dG9Fc2NhcGUpLFxuICAgIG5vbkF1dGhDaGFycyA9IFsnLycsICdAJywgJz8nLCAnIyddLmNvbmNhdChkZWxpbXMpLFxuICAgIGhvc3RuYW1lTWF4TGVuID0gMjU1LFxuICAgIGhvc3RuYW1lUGFydFBhdHRlcm4gPSAvXlthLXpBLVowLTldW2EtejAtOUEtWl8tXXswLDYyfSQvLFxuICAgIGhvc3RuYW1lUGFydFN0YXJ0ID0gL14oW2EtekEtWjAtOV1bYS16MC05QS1aXy1dezAsNjJ9KSguKikkLyxcbiAgICAvLyBwcm90b2NvbHMgdGhhdCBjYW4gYWxsb3cgXCJ1bnNhZmVcIiBhbmQgXCJ1bndpc2VcIiBjaGFycy5cbiAgICB1bnNhZmVQcm90b2NvbCA9IHtcbiAgICAgICdqYXZhc2NyaXB0JzogdHJ1ZSxcbiAgICAgICdqYXZhc2NyaXB0Oic6IHRydWVcbiAgICB9LFxuICAgIC8vIHByb3RvY29scyB0aGF0IG5ldmVyIGhhdmUgYSBob3N0bmFtZS5cbiAgICBob3N0bGVzc1Byb3RvY29sID0ge1xuICAgICAgJ2phdmFzY3JpcHQnOiB0cnVlLFxuICAgICAgJ2phdmFzY3JpcHQ6JzogdHJ1ZVxuICAgIH0sXG4gICAgLy8gcHJvdG9jb2xzIHRoYXQgYWx3YXlzIGhhdmUgYSBwYXRoIGNvbXBvbmVudC5cbiAgICBwYXRoZWRQcm90b2NvbCA9IHtcbiAgICAgICdodHRwJzogdHJ1ZSxcbiAgICAgICdodHRwcyc6IHRydWUsXG4gICAgICAnZnRwJzogdHJ1ZSxcbiAgICAgICdnb3BoZXInOiB0cnVlLFxuICAgICAgJ2ZpbGUnOiB0cnVlLFxuICAgICAgJ2h0dHA6JzogdHJ1ZSxcbiAgICAgICdmdHA6JzogdHJ1ZSxcbiAgICAgICdnb3BoZXI6JzogdHJ1ZSxcbiAgICAgICdmaWxlOic6IHRydWVcbiAgICB9LFxuICAgIC8vIHByb3RvY29scyB0aGF0IGFsd2F5cyBjb250YWluIGEgLy8gYml0LlxuICAgIHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgICAgICdodHRwJzogdHJ1ZSxcbiAgICAgICdodHRwcyc6IHRydWUsXG4gICAgICAnZnRwJzogdHJ1ZSxcbiAgICAgICdnb3BoZXInOiB0cnVlLFxuICAgICAgJ2ZpbGUnOiB0cnVlLFxuICAgICAgJ2h0dHA6JzogdHJ1ZSxcbiAgICAgICdodHRwczonOiB0cnVlLFxuICAgICAgJ2Z0cDonOiB0cnVlLFxuICAgICAgJ2dvcGhlcjonOiB0cnVlLFxuICAgICAgJ2ZpbGU6JzogdHJ1ZVxuICAgIH0sXG4gICAgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG5mdW5jdGlvbiB1cmxQYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh1cmwgJiYgdHlwZW9mKHVybCkgPT09ICdvYmplY3QnICYmIHVybC5ocmVmKSByZXR1cm4gdXJsO1xuXG4gIGlmICh0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICsgdHlwZW9mIHVybCk7XG4gIH1cblxuICB2YXIgb3V0ID0ge30sXG4gICAgICByZXN0ID0gdXJsO1xuXG4gIC8vIHRyaW0gYmVmb3JlIHByb2NlZWRpbmcuXG4gIC8vIFRoaXMgaXMgdG8gc3VwcG9ydCBwYXJzZSBzdHVmZiBsaWtlIFwiICBodHRwOi8vZm9vLmNvbSAgXFxuXCJcbiAgcmVzdCA9IHJlc3QudHJpbSgpO1xuXG4gIHZhciBwcm90byA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICBpZiAocHJvdG8pIHtcbiAgICBwcm90byA9IHByb3RvWzBdO1xuICAgIHZhciBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICBvdXQucHJvdG9jb2wgPSBsb3dlclByb3RvO1xuICAgIHJlc3QgPSByZXN0LnN1YnN0cihwcm90by5sZW5ndGgpO1xuICB9XG5cbiAgLy8gZmlndXJlIG91dCBpZiBpdCdzIGdvdCBhIGhvc3RcbiAgLy8gdXNlckBzZXJ2ZXIgaXMgKmFsd2F5cyogaW50ZXJwcmV0ZWQgYXMgYSBob3N0bmFtZSwgYW5kIHVybFxuICAvLyByZXNvbHV0aW9uIHdpbGwgdHJlYXQgLy9mb28vYmFyIGFzIGhvc3Q9Zm9vLHBhdGg9YmFyIGJlY2F1c2UgdGhhdCdzXG4gIC8vIGhvdyB0aGUgYnJvd3NlciByZXNvbHZlcyByZWxhdGl2ZSBVUkxzLlxuICBpZiAoc2xhc2hlc0Rlbm90ZUhvc3QgfHwgcHJvdG8gfHwgcmVzdC5tYXRjaCgvXlxcL1xcL1teQFxcL10rQFteQFxcL10rLykpIHtcbiAgICB2YXIgc2xhc2hlcyA9IHJlc3Quc3Vic3RyKDAsIDIpID09PSAnLy8nO1xuICAgIGlmIChzbGFzaGVzICYmICEocHJvdG8gJiYgaG9zdGxlc3NQcm90b2NvbFtwcm90b10pKSB7XG4gICAgICByZXN0ID0gcmVzdC5zdWJzdHIoMik7XG4gICAgICBvdXQuc2xhc2hlcyA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFob3N0bGVzc1Byb3RvY29sW3Byb3RvXSAmJlxuICAgICAgKHNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaGVkUHJvdG9jb2xbcHJvdG9dKSkpIHtcbiAgICAvLyB0aGVyZSdzIGEgaG9zdG5hbWUuXG4gICAgLy8gdGhlIGZpcnN0IGluc3RhbmNlIG9mIC8sID8sIDssIG9yICMgZW5kcyB0aGUgaG9zdC5cbiAgICAvLyBkb24ndCBlbmZvcmNlIGZ1bGwgUkZDIGNvcnJlY3RuZXNzLCBqdXN0IGJlIHVuc3R1cGlkIGFib3V0IGl0LlxuXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gQCBpbiB0aGUgaG9zdG5hbWUsIHRoZW4gbm9uLWhvc3QgY2hhcnMgKmFyZSogYWxsb3dlZFxuICAgIC8vIHRvIHRoZSBsZWZ0IG9mIHRoZSBmaXJzdCBAIHNpZ24sIHVubGVzcyBzb21lIG5vbi1hdXRoIGNoYXJhY3RlclxuICAgIC8vIGNvbWVzICpiZWZvcmUqIHRoZSBALXNpZ24uXG4gICAgLy8gVVJMcyBhcmUgb2Jub3hpb3VzLlxuICAgIHZhciBhdFNpZ24gPSByZXN0LmluZGV4T2YoJ0AnKTtcbiAgICBpZiAoYXRTaWduICE9PSAtMSkge1xuICAgICAgdmFyIGF1dGggPSByZXN0LnNsaWNlKDAsIGF0U2lnbik7XG5cbiAgICAgIC8vIHRoZXJlICptYXkgYmUqIGFuIGF1dGhcbiAgICAgIHZhciBoYXNBdXRoID0gdHJ1ZTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gbm9uQXV0aENoYXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAoYXV0aC5pbmRleE9mKG5vbkF1dGhDaGFyc1tpXSkgIT09IC0xKSB7XG4gICAgICAgICAgLy8gbm90IGEgdmFsaWQgYXV0aC4gIFNvbWV0aGluZyBsaWtlIGh0dHA6Ly9mb28uY29tL2JhckBiYXovXG4gICAgICAgICAgaGFzQXV0aCA9IGZhbHNlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChoYXNBdXRoKSB7XG4gICAgICAgIC8vIHBsdWNrIG9mZiB0aGUgYXV0aCBwb3J0aW9uLlxuICAgICAgICBvdXQuYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICAgICAgcmVzdCA9IHJlc3Quc3Vic3RyKGF0U2lnbiArIDEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBmaXJzdE5vbkhvc3QgPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IG5vbkhvc3RDaGFycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHZhciBpbmRleCA9IHJlc3QuaW5kZXhPZihub25Ib3N0Q2hhcnNbaV0pO1xuICAgICAgaWYgKGluZGV4ICE9PSAtMSAmJlxuICAgICAgICAgIChmaXJzdE5vbkhvc3QgPCAwIHx8IGluZGV4IDwgZmlyc3ROb25Ib3N0KSkgZmlyc3ROb25Ib3N0ID0gaW5kZXg7XG4gICAgfVxuXG4gICAgaWYgKGZpcnN0Tm9uSG9zdCAhPT0gLTEpIHtcbiAgICAgIG91dC5ob3N0ID0gcmVzdC5zdWJzdHIoMCwgZmlyc3ROb25Ib3N0KTtcbiAgICAgIHJlc3QgPSByZXN0LnN1YnN0cihmaXJzdE5vbkhvc3QpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXQuaG9zdCA9IHJlc3Q7XG4gICAgICByZXN0ID0gJyc7XG4gICAgfVxuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB2YXIgcCA9IHBhcnNlSG9zdChvdXQuaG9zdCk7XG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhwKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGtleXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIG91dFtrZXldID0gcFtrZXldO1xuICAgIH1cblxuICAgIC8vIHdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgLy8gc28gZXZlbiBpZiBpdCdzIGVtcHR5LCBpdCBoYXMgdG8gYmUgcHJlc2VudC5cbiAgICBvdXQuaG9zdG5hbWUgPSBvdXQuaG9zdG5hbWUgfHwgJyc7XG5cbiAgICAvLyBpZiBob3N0bmFtZSBiZWdpbnMgd2l0aCBbIGFuZCBlbmRzIHdpdGggXVxuICAgIC8vIGFzc3VtZSB0aGF0IGl0J3MgYW4gSVB2NiBhZGRyZXNzLlxuICAgIHZhciBpcHY2SG9zdG5hbWUgPSBvdXQuaG9zdG5hbWVbMF0gPT09ICdbJyAmJlxuICAgICAgICBvdXQuaG9zdG5hbWVbb3V0Lmhvc3RuYW1lLmxlbmd0aCAtIDFdID09PSAnXSc7XG5cbiAgICAvLyB2YWxpZGF0ZSBhIGxpdHRsZS5cbiAgICBpZiAob3V0Lmhvc3RuYW1lLmxlbmd0aCA+IGhvc3RuYW1lTWF4TGVuKSB7XG4gICAgICBvdXQuaG9zdG5hbWUgPSAnJztcbiAgICB9IGVsc2UgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHZhciBob3N0cGFydHMgPSBvdXQuaG9zdG5hbWUuc3BsaXQoL1xcLi8pO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBob3N0cGFydHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHZhciBwYXJ0ID0gaG9zdHBhcnRzW2ldO1xuICAgICAgICBpZiAoIXBhcnQpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoIXBhcnQubWF0Y2goaG9zdG5hbWVQYXJ0UGF0dGVybikpIHtcbiAgICAgICAgICB2YXIgbmV3cGFydCA9ICcnO1xuICAgICAgICAgIGZvciAodmFyIGogPSAwLCBrID0gcGFydC5sZW5ndGg7IGogPCBrOyBqKyspIHtcbiAgICAgICAgICAgIGlmIChwYXJ0LmNoYXJDb2RlQXQoaikgPiAxMjcpIHtcbiAgICAgICAgICAgICAgLy8gd2UgcmVwbGFjZSBub24tQVNDSUkgY2hhciB3aXRoIGEgdGVtcG9yYXJ5IHBsYWNlaG9sZGVyXG4gICAgICAgICAgICAgIC8vIHdlIG5lZWQgdGhpcyB0byBtYWtlIHN1cmUgc2l6ZSBvZiBob3N0bmFtZSBpcyBub3RcbiAgICAgICAgICAgICAgLy8gYnJva2VuIGJ5IHJlcGxhY2luZyBub24tQVNDSUkgYnkgbm90aGluZ1xuICAgICAgICAgICAgICBuZXdwYXJ0ICs9ICd4JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5ld3BhcnQgKz0gcGFydFtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gd2UgdGVzdCBhZ2FpbiB3aXRoIEFTQ0lJIGNoYXIgb25seVxuICAgICAgICAgIGlmICghbmV3cGFydC5tYXRjaChob3N0bmFtZVBhcnRQYXR0ZXJuKSkge1xuICAgICAgICAgICAgdmFyIHZhbGlkUGFydHMgPSBob3N0cGFydHMuc2xpY2UoMCwgaSk7XG4gICAgICAgICAgICB2YXIgbm90SG9zdCA9IGhvc3RwYXJ0cy5zbGljZShpICsgMSk7XG4gICAgICAgICAgICB2YXIgYml0ID0gcGFydC5tYXRjaChob3N0bmFtZVBhcnRTdGFydCk7XG4gICAgICAgICAgICBpZiAoYml0KSB7XG4gICAgICAgICAgICAgIHZhbGlkUGFydHMucHVzaChiaXRbMV0pO1xuICAgICAgICAgICAgICBub3RIb3N0LnVuc2hpZnQoYml0WzJdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChub3RIb3N0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICByZXN0ID0gJy8nICsgbm90SG9zdC5qb2luKCcuJykgKyByZXN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3V0Lmhvc3RuYW1lID0gdmFsaWRQYXJ0cy5qb2luKCcuJyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBob3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgIG91dC5ob3N0bmFtZSA9IG91dC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIC8vIElETkEgU3VwcG9ydDogUmV0dXJucyBhIHB1bnkgY29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAgIC8vIEl0IG9ubHkgY29udmVydHMgdGhlIHBhcnQgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAgIC8vIGhhcyBub24gQVNDSUkgY2hhcmFjdGVycy4gSS5lLiBpdCBkb3NlbnQgbWF0dGVyIGlmXG4gICAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBpbiBBU0NJSS5cbiAgICAgIHZhciBkb21haW5BcnJheSA9IG91dC5ob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgdmFyIG5ld091dCA9IFtdO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgICd4bi0tJyArIHB1bnljb2RlLmVuY29kZShzKSA6IHMpO1xuICAgICAgfVxuICAgICAgb3V0Lmhvc3RuYW1lID0gbmV3T3V0LmpvaW4oJy4nKTtcbiAgICB9XG5cbiAgICBvdXQuaG9zdCA9IChvdXQuaG9zdG5hbWUgfHwgJycpICtcbiAgICAgICAgKChvdXQucG9ydCkgPyAnOicgKyBvdXQucG9ydCA6ICcnKTtcbiAgICBvdXQuaHJlZiArPSBvdXQuaG9zdDtcblxuICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICBpZiAoaXB2Nkhvc3RuYW1lKSB7XG4gICAgICBvdXQuaG9zdG5hbWUgPSBvdXQuaG9zdG5hbWUuc3Vic3RyKDEsIG91dC5ob3N0bmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIGlmIChyZXN0WzBdICE9PSAnLycpIHtcbiAgICAgICAgcmVzdCA9ICcvJyArIHJlc3Q7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbm93IHJlc3QgaXMgc2V0IHRvIHRoZSBwb3N0LWhvc3Qgc3R1ZmYuXG4gIC8vIGNob3Agb2ZmIGFueSBkZWxpbSBjaGFycy5cbiAgaWYgKCF1bnNhZmVQcm90b2NvbFtsb3dlclByb3RvXSkge1xuXG4gICAgLy8gRmlyc3QsIG1ha2UgMTAwJSBzdXJlIHRoYXQgYW55IFwiYXV0b0VzY2FwZVwiIGNoYXJzIGdldFxuICAgIC8vIGVzY2FwZWQsIGV2ZW4gaWYgZW5jb2RlVVJJQ29tcG9uZW50IGRvZXNuJ3QgdGhpbmsgdGhleVxuICAgIC8vIG5lZWQgdG8gYmUuXG4gICAgZm9yICh2YXIgaSA9IDAsIGwgPSBhdXRvRXNjYXBlLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgdmFyIGFlID0gYXV0b0VzY2FwZVtpXTtcbiAgICAgIHZhciBlc2MgPSBlbmNvZGVVUklDb21wb25lbnQoYWUpO1xuICAgICAgaWYgKGVzYyA9PT0gYWUpIHtcbiAgICAgICAgZXNjID0gZXNjYXBlKGFlKTtcbiAgICAgIH1cbiAgICAgIHJlc3QgPSByZXN0LnNwbGl0KGFlKS5qb2luKGVzYyk7XG4gICAgfVxuICB9XG5cblxuICAvLyBjaG9wIG9mZiBmcm9tIHRoZSB0YWlsIGZpcnN0LlxuICB2YXIgaGFzaCA9IHJlc3QuaW5kZXhPZignIycpO1xuICBpZiAoaGFzaCAhPT0gLTEpIHtcbiAgICAvLyBnb3QgYSBmcmFnbWVudCBzdHJpbmcuXG4gICAgb3V0Lmhhc2ggPSByZXN0LnN1YnN0cihoYXNoKTtcbiAgICByZXN0ID0gcmVzdC5zbGljZSgwLCBoYXNoKTtcbiAgfVxuICB2YXIgcW0gPSByZXN0LmluZGV4T2YoJz8nKTtcbiAgaWYgKHFtICE9PSAtMSkge1xuICAgIG91dC5zZWFyY2ggPSByZXN0LnN1YnN0cihxbSk7XG4gICAgb3V0LnF1ZXJ5ID0gcmVzdC5zdWJzdHIocW0gKyAxKTtcbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgb3V0LnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2Uob3V0LnF1ZXJ5KTtcbiAgICB9XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UoMCwgcW0pO1xuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIG91dC5zZWFyY2ggPSAnJztcbiAgICBvdXQucXVlcnkgPSB7fTtcbiAgfVxuICBpZiAocmVzdCkgb3V0LnBhdGhuYW1lID0gcmVzdDtcbiAgaWYgKHNsYXNoZWRQcm90b2NvbFtwcm90b10gJiZcbiAgICAgIG91dC5ob3N0bmFtZSAmJiAhb3V0LnBhdGhuYW1lKSB7XG4gICAgb3V0LnBhdGhuYW1lID0gJy8nO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICBpZiAob3V0LnBhdGhuYW1lIHx8IG91dC5zZWFyY2gpIHtcbiAgICBvdXQucGF0aCA9IChvdXQucGF0aG5hbWUgPyBvdXQucGF0aG5hbWUgOiAnJykgK1xuICAgICAgICAgICAgICAgKG91dC5zZWFyY2ggPyBvdXQuc2VhcmNoIDogJycpO1xuICB9XG5cbiAgLy8gZmluYWxseSwgcmVjb25zdHJ1Y3QgdGhlIGhyZWYgYmFzZWQgb24gd2hhdCBoYXMgYmVlbiB2YWxpZGF0ZWQuXG4gIG91dC5ocmVmID0gdXJsRm9ybWF0KG91dCk7XG4gIHJldHVybiBvdXQ7XG59XG5cbi8vIGZvcm1hdCBhIHBhcnNlZCBvYmplY3QgaW50byBhIHVybCBzdHJpbmdcbmZ1bmN0aW9uIHVybEZvcm1hdChvYmopIHtcbiAgLy8gZW5zdXJlIGl0J3MgYW4gb2JqZWN0LCBhbmQgbm90IGEgc3RyaW5nIHVybC5cbiAgLy8gSWYgaXQncyBhbiBvYmosIHRoaXMgaXMgYSBuby1vcC5cbiAgLy8gdGhpcyB3YXksIHlvdSBjYW4gY2FsbCB1cmxfZm9ybWF0KCkgb24gc3RyaW5nc1xuICAvLyB0byBjbGVhbiB1cCBwb3RlbnRpYWxseSB3b25reSB1cmxzLlxuICBpZiAodHlwZW9mKG9iaikgPT09ICdzdHJpbmcnKSBvYmogPSB1cmxQYXJzZShvYmopO1xuXG4gIHZhciBhdXRoID0gb2JqLmF1dGggfHwgJyc7XG4gIGlmIChhdXRoKSB7XG4gICAgYXV0aCA9IGVuY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICBhdXRoID0gYXV0aC5yZXBsYWNlKC8lM0EvaSwgJzonKTtcbiAgICBhdXRoICs9ICdAJztcbiAgfVxuXG4gIHZhciBwcm90b2NvbCA9IG9iai5wcm90b2NvbCB8fCAnJyxcbiAgICAgIHBhdGhuYW1lID0gb2JqLnBhdGhuYW1lIHx8ICcnLFxuICAgICAgaGFzaCA9IG9iai5oYXNoIHx8ICcnLFxuICAgICAgaG9zdCA9IGZhbHNlLFxuICAgICAgcXVlcnkgPSAnJztcblxuICBpZiAob2JqLmhvc3QgIT09IHVuZGVmaW5lZCkge1xuICAgIGhvc3QgPSBhdXRoICsgb2JqLmhvc3Q7XG4gIH0gZWxzZSBpZiAob2JqLmhvc3RuYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBob3N0ID0gYXV0aCArIChvYmouaG9zdG5hbWUuaW5kZXhPZignOicpID09PSAtMSA/XG4gICAgICAgIG9iai5ob3N0bmFtZSA6XG4gICAgICAgICdbJyArIG9iai5ob3N0bmFtZSArICddJyk7XG4gICAgaWYgKG9iai5wb3J0KSB7XG4gICAgICBob3N0ICs9ICc6JyArIG9iai5wb3J0O1xuICAgIH1cbiAgfVxuXG4gIGlmIChvYmoucXVlcnkgJiYgdHlwZW9mIG9iai5xdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKG9iai5xdWVyeSkubGVuZ3RoKSB7XG4gICAgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkob2JqLnF1ZXJ5KTtcbiAgfVxuXG4gIHZhciBzZWFyY2ggPSBvYmouc2VhcmNoIHx8IChxdWVyeSAmJiAoJz8nICsgcXVlcnkpKSB8fCAnJztcblxuICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wuc3Vic3RyKC0xKSAhPT0gJzonKSBwcm90b2NvbCArPSAnOic7XG5cbiAgLy8gb25seSB0aGUgc2xhc2hlZFByb3RvY29scyBnZXQgdGhlIC8vLiAgTm90IG1haWx0bzosIHhtcHA6LCBldGMuXG4gIC8vIHVubGVzcyB0aGV5IGhhZCB0aGVtIHRvIGJlZ2luIHdpdGguXG4gIGlmIChvYmouc2xhc2hlcyB8fFxuICAgICAgKCFwcm90b2NvbCB8fCBzbGFzaGVkUHJvdG9jb2xbcHJvdG9jb2xdKSAmJiBob3N0ICE9PSBmYWxzZSkge1xuICAgIGhvc3QgPSAnLy8nICsgKGhvc3QgfHwgJycpO1xuICAgIGlmIChwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQXQoMCkgIT09ICcvJykgcGF0aG5hbWUgPSAnLycgKyBwYXRobmFtZTtcbiAgfSBlbHNlIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSAnJztcbiAgfVxuXG4gIGlmIChoYXNoICYmIGhhc2guY2hhckF0KDApICE9PSAnIycpIGhhc2ggPSAnIycgKyBoYXNoO1xuICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQXQoMCkgIT09ICc/Jykgc2VhcmNoID0gJz8nICsgc2VhcmNoO1xuXG4gIHJldHVybiBwcm90b2NvbCArIGhvc3QgKyBwYXRobmFtZSArIHNlYXJjaCArIGhhc2g7XG59XG5cbmZ1bmN0aW9uIHVybFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICByZXR1cm4gdXJsRm9ybWF0KHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkpO1xufVxuXG5mdW5jdGlvbiB1cmxSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcblxuICBzb3VyY2UgPSB1cmxQYXJzZSh1cmxGb3JtYXQoc291cmNlKSwgZmFsc2UsIHRydWUpO1xuICByZWxhdGl2ZSA9IHVybFBhcnNlKHVybEZvcm1hdChyZWxhdGl2ZSksIGZhbHNlLCB0cnVlKTtcblxuICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgc291cmNlLmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gIGlmIChyZWxhdGl2ZS5ocmVmID09PSAnJykge1xuICAgIHNvdXJjZS5ocmVmID0gdXJsRm9ybWF0KHNvdXJjZSk7XG4gICAgcmV0dXJuIHNvdXJjZTtcbiAgfVxuXG4gIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICByZWxhdGl2ZS5wcm90b2NvbCA9IHNvdXJjZS5wcm90b2NvbDtcbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdICYmXG4gICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lICYmICFyZWxhdGl2ZS5wYXRobmFtZSkge1xuICAgICAgcmVsYXRpdmUucGF0aCA9IHJlbGF0aXZlLnBhdGhuYW1lID0gJy8nO1xuICAgIH1cbiAgICByZWxhdGl2ZS5ocmVmID0gdXJsRm9ybWF0KHJlbGF0aXZlKTtcbiAgICByZXR1cm4gcmVsYXRpdmU7XG4gIH1cblxuICBpZiAocmVsYXRpdmUucHJvdG9jb2wgJiYgcmVsYXRpdmUucHJvdG9jb2wgIT09IHNvdXJjZS5wcm90b2NvbCkge1xuICAgIC8vIGlmIGl0J3MgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAvLyBmaXJzdCwgaWYgaXQncyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgIC8vIGJlY2F1c2UgdGhhdCdzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICBpZiAoIXNsYXNoZWRQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIHJlbGF0aXZlLmhyZWYgPSB1cmxGb3JtYXQocmVsYXRpdmUpO1xuICAgICAgcmV0dXJuIHJlbGF0aXZlO1xuICAgIH1cbiAgICBzb3VyY2UucHJvdG9jb2wgPSByZWxhdGl2ZS5wcm90b2NvbDtcbiAgICBpZiAoIXJlbGF0aXZlLmhvc3QgJiYgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCAnJykuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9ICcnO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSAnJztcbiAgICAgIGlmIChyZWxQYXRoWzBdICE9PSAnJykgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICByZWxhdGl2ZS5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH1cbiAgICBzb3VyY2UucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICBzb3VyY2Uuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHNvdXJjZS5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHNvdXJjZS5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCAnJztcbiAgICBzb3VyY2UuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgc291cmNlLmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICBzb3VyY2UucG9ydCA9IHJlbGF0aXZlLnBvcnQ7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChzb3VyY2UucGF0aG5hbWUgIT09IHVuZGVmaW5lZCB8fCBzb3VyY2Uuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHNvdXJjZS5wYXRoID0gKHNvdXJjZS5wYXRobmFtZSA/IHNvdXJjZS5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgIChzb3VyY2Uuc2VhcmNoID8gc291cmNlLnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgc291cmNlLnNsYXNoZXMgPSBzb3VyY2Uuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHNvdXJjZS5ocmVmID0gdXJsRm9ybWF0KHNvdXJjZSk7XG4gICAgcmV0dXJuIHNvdXJjZTtcbiAgfVxuXG4gIHZhciBpc1NvdXJjZUFicyA9IChzb3VyY2UucGF0aG5hbWUgJiYgc291cmNlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nKSxcbiAgICAgIGlzUmVsQWJzID0gKFxuICAgICAgICAgIHJlbGF0aXZlLmhvc3QgIT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nXG4gICAgICApLFxuICAgICAgbXVzdEVuZEFicyA9IChpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fFxuICAgICAgICAgICAgICAgICAgICAoc291cmNlLmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKSxcbiAgICAgIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzLFxuICAgICAgc3JjUGF0aCA9IHNvdXJjZS5wYXRobmFtZSAmJiBzb3VyY2UucGF0aG5hbWUuc3BsaXQoJy8nKSB8fCBbXSxcbiAgICAgIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdCgnLycpIHx8IFtdLFxuICAgICAgcHN5Y2hvdGljID0gc291cmNlLnByb3RvY29sICYmXG4gICAgICAgICAgIXNsYXNoZWRQcm90b2NvbFtzb3VyY2UucHJvdG9jb2xdO1xuXG4gIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgLy8gbGlua3MgbGlrZSAuLi8uLiBzaG91bGQgYmUgYWJsZVxuICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gIC8vIHNvdXJjZS5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gIC8vIExhdGVyIG9uLCBwdXQgdGhlIGZpcnN0IHBhdGggcGFydCBpbnRvIHRoZSBob3N0IGZpZWxkLlxuICBpZiAocHN5Y2hvdGljKSB7XG5cbiAgICBkZWxldGUgc291cmNlLmhvc3RuYW1lO1xuICAgIGRlbGV0ZSBzb3VyY2UucG9ydDtcbiAgICBpZiAoc291cmNlLmhvc3QpIHtcbiAgICAgIGlmIChzcmNQYXRoWzBdID09PSAnJykgc3JjUGF0aFswXSA9IHNvdXJjZS5ob3N0O1xuICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQoc291cmNlLmhvc3QpO1xuICAgIH1cbiAgICBkZWxldGUgc291cmNlLmhvc3Q7XG4gICAgaWYgKHJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgICBkZWxldGUgcmVsYXRpdmUuaG9zdG5hbWU7XG4gICAgICBkZWxldGUgcmVsYXRpdmUucG9ydDtcbiAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgIGlmIChyZWxQYXRoWzBdID09PSAnJykgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHJlbGF0aXZlLmhvc3Q7XG4gICAgfVxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzICYmIChyZWxQYXRoWzBdID09PSAnJyB8fCBzcmNQYXRoWzBdID09PSAnJyk7XG4gIH1cblxuICBpZiAoaXNSZWxBYnMpIHtcbiAgICAvLyBpdCdzIGFic29sdXRlLlxuICAgIHNvdXJjZS5ob3N0ID0gKHJlbGF0aXZlLmhvc3QgfHwgcmVsYXRpdmUuaG9zdCA9PT0gJycpID9cbiAgICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogc291cmNlLmhvc3Q7XG4gICAgc291cmNlLmhvc3RuYW1lID0gKHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSAnJykgP1xuICAgICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogc291cmNlLmhvc3RuYW1lO1xuICAgIHNvdXJjZS5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgc291cmNlLnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgc3JjUGF0aC5wb3AoKTtcbiAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgc291cmNlLnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICBzb3VyY2UucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgfSBlbHNlIGlmICgnc2VhcmNoJyBpbiByZWxhdGl2ZSkge1xuICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgIHNvdXJjZS5ob3N0bmFtZSA9IHNvdXJjZS5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICB2YXIgYXV0aEluSG9zdCA9IHNvdXJjZS5ob3N0ICYmIHNvdXJjZS5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgP1xuICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2UuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICBzb3VyY2UuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgc291cmNlLmhvc3QgPSBzb3VyY2UuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHNvdXJjZS5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgc291cmNlLnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChzb3VyY2UucGF0aG5hbWUgIT09IHVuZGVmaW5lZCB8fCBzb3VyY2Uuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHNvdXJjZS5wYXRoID0gKHNvdXJjZS5wYXRobmFtZSA/IHNvdXJjZS5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgIChzb3VyY2Uuc2VhcmNoID8gc291cmNlLnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgc291cmNlLmhyZWYgPSB1cmxGb3JtYXQoc291cmNlKTtcbiAgICByZXR1cm4gc291cmNlO1xuICB9XG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBubyBwYXRoIGF0IGFsbC4gIGVhc3kuXG4gICAgLy8gd2UndmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICBkZWxldGUgc291cmNlLnBhdGhuYW1lO1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAoIXNvdXJjZS5zZWFyY2gpIHtcbiAgICAgIHNvdXJjZS5wYXRoID0gJy8nICsgc291cmNlLnNlYXJjaDtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIHNvdXJjZS5wYXRoO1xuICAgIH1cbiAgICBzb3VyY2UuaHJlZiA9IHVybEZvcm1hdChzb3VyY2UpO1xuICAgIHJldHVybiBzb3VyY2U7XG4gIH1cbiAgLy8gaWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIC8vIGhvd2V2ZXIsIGlmIGl0IGVuZHMgaW4gYW55dGhpbmcgZWxzZSBub24tc2xhc2h5LFxuICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICB2YXIgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICB2YXIgaGFzVHJhaWxpbmdTbGFzaCA9IChcbiAgICAgIChzb3VyY2UuaG9zdCB8fCByZWxhdGl2ZS5ob3N0KSAmJiAobGFzdCA9PT0gJy4nIHx8IGxhc3QgPT09ICcuLicpIHx8XG4gICAgICBsYXN0ID09PSAnJyk7XG5cbiAgLy8gc3RyaXAgc2luZ2xlIGRvdHMsIHJlc29sdmUgZG91YmxlIGRvdHMgdG8gcGFyZW50IGRpclxuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gc3JjUGF0aC5sZW5ndGg7IGkgPj0gMDsgaS0tKSB7XG4gICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgaWYgKGxhc3QgPT0gJy4nKSB7XG4gICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoIW11c3RFbmRBYnMgJiYgIXJlbW92ZUFsbERvdHMpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHNyY1BhdGgudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSAnJyAmJlxuICAgICAgKCFzcmNQYXRoWzBdIHx8IHNyY1BhdGhbMF0uY2hhckF0KDApICE9PSAnLycpKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIChzcmNQYXRoLmpvaW4oJy8nKS5zdWJzdHIoLTEpICE9PSAnLycpKSB7XG4gICAgc3JjUGF0aC5wdXNoKCcnKTtcbiAgfVxuXG4gIHZhciBpc0Fic29sdXRlID0gc3JjUGF0aFswXSA9PT0gJycgfHxcbiAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckF0KDApID09PSAnLycpO1xuXG4gIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICBzb3VyY2UuaG9zdG5hbWUgPSBzb3VyY2UuaG9zdCA9IGlzQWJzb2x1dGUgPyAnJyA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6ICcnO1xuICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgdmFyIGF1dGhJbkhvc3QgPSBzb3VyY2UuaG9zdCAmJiBzb3VyY2UuaG9zdC5pbmRleE9mKCdAJykgPiAwID9cbiAgICAgICAgICAgICAgICAgICAgIHNvdXJjZS5ob3N0LnNwbGl0KCdAJykgOiBmYWxzZTtcbiAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgc291cmNlLmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICBzb3VyY2UuaG9zdCA9IHNvdXJjZS5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICB9XG4gIH1cblxuICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyB8fCAoc291cmNlLmhvc3QgJiYgc3JjUGF0aC5sZW5ndGgpO1xuXG4gIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIHNvdXJjZS5wYXRobmFtZSA9IHNyY1BhdGguam9pbignLycpO1xuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmIChzb3VyY2UucGF0aG5hbWUgIT09IHVuZGVmaW5lZCB8fCBzb3VyY2Uuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICBzb3VyY2UucGF0aCA9IChzb3VyY2UucGF0aG5hbWUgPyBzb3VyY2UucGF0aG5hbWUgOiAnJykgK1xuICAgICAgICAgICAgICAgICAgKHNvdXJjZS5zZWFyY2ggPyBzb3VyY2Uuc2VhcmNoIDogJycpO1xuICB9XG4gIHNvdXJjZS5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCBzb3VyY2UuYXV0aDtcbiAgc291cmNlLnNsYXNoZXMgPSBzb3VyY2Uuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICBzb3VyY2UuaHJlZiA9IHVybEZvcm1hdChzb3VyY2UpO1xuICByZXR1cm4gc291cmNlO1xufVxuXG5mdW5jdGlvbiBwYXJzZUhvc3QoaG9zdCkge1xuICB2YXIgb3V0ID0ge307XG4gIHZhciBwb3J0ID0gcG9ydFBhdHRlcm4uZXhlYyhob3N0KTtcbiAgaWYgKHBvcnQpIHtcbiAgICBwb3J0ID0gcG9ydFswXTtcbiAgICBpZiAocG9ydCAhPT0gJzonKSB7XG4gICAgICBvdXQucG9ydCA9IHBvcnQuc3Vic3RyKDEpO1xuICAgIH1cbiAgICBob3N0ID0gaG9zdC5zdWJzdHIoMCwgaG9zdC5sZW5ndGggLSBwb3J0Lmxlbmd0aCk7XG4gIH1cbiAgaWYgKGhvc3QpIG91dC5ob3N0bmFtZSA9IGhvc3Q7XG4gIHJldHVybiBvdXQ7XG59XG5cbn0oKSk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwidmFyIHByb2Nlc3M9cmVxdWlyZShcIl9fYnJvd3NlcmlmeV9wcm9jZXNzXCIpLGdsb2JhbD10eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge307Ly8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbnZhciBmb3JtYXRSZWdFeHAgPSAvJVtzZGolXS9nO1xuZXhwb3J0cy5mb3JtYXQgPSBmdW5jdGlvbihmKSB7XG4gIGlmICghaXNTdHJpbmcoZikpIHtcbiAgICB2YXIgb2JqZWN0cyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBvYmplY3RzLnB1c2goaW5zcGVjdChhcmd1bWVudHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdHMuam9pbignICcpO1xuICB9XG5cbiAgdmFyIGkgPSAxO1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIGxlbiA9IGFyZ3MubGVuZ3RoO1xuICB2YXIgc3RyID0gU3RyaW5nKGYpLnJlcGxhY2UoZm9ybWF0UmVnRXhwLCBmdW5jdGlvbih4KSB7XG4gICAgaWYgKHggPT09ICclJScpIHJldHVybiAnJSc7XG4gICAgaWYgKGkgPj0gbGVuKSByZXR1cm4geDtcbiAgICBzd2l0Y2ggKHgpIHtcbiAgICAgIGNhc2UgJyVzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWQnOiByZXR1cm4gTnVtYmVyKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclaic6XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFyZ3NbaSsrXSk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuICAgICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4geDtcbiAgICB9XG4gIH0pO1xuICBmb3IgKHZhciB4ID0gYXJnc1tpXTsgaSA8IGxlbjsgeCA9IGFyZ3NbKytpXSkge1xuICAgIGlmIChpc051bGwoeCkgfHwgIWlzT2JqZWN0KHgpKSB7XG4gICAgICBzdHIgKz0gJyAnICsgeDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyICs9ICcgJyArIGluc3BlY3QoeCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHI7XG59O1xuXG5cbi8vIE1hcmsgdGhhdCBhIG1ldGhvZCBzaG91bGQgbm90IGJlIHVzZWQuXG4vLyBSZXR1cm5zIGEgbW9kaWZpZWQgZnVuY3Rpb24gd2hpY2ggd2FybnMgb25jZSBieSBkZWZhdWx0LlxuLy8gSWYgLS1uby1kZXByZWNhdGlvbiBpcyBzZXQsIHRoZW4gaXQgaXMgYSBuby1vcC5cbmV4cG9ydHMuZGVwcmVjYXRlID0gZnVuY3Rpb24oZm4sIG1zZykge1xuICAvLyBBbGxvdyBmb3IgZGVwcmVjYXRpbmcgdGhpbmdzIGluIHRoZSBwcm9jZXNzIG9mIHN0YXJ0aW5nIHVwLlxuICBpZiAoaXNVbmRlZmluZWQoZ2xvYmFsLnByb2Nlc3MpKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4cG9ydHMuZGVwcmVjYXRlKGZuLCBtc2cpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9jZXNzLm5vRGVwcmVjYXRpb24gPT09IHRydWUpIHtcbiAgICByZXR1cm4gZm47XG4gIH1cblxuICB2YXIgd2FybmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGRlcHJlY2F0ZWQoKSB7XG4gICAgaWYgKCF3YXJuZWQpIHtcbiAgICAgIGlmIChwcm9jZXNzLnRocm93RGVwcmVjYXRpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgICB9IGVsc2UgaWYgKHByb2Nlc3MudHJhY2VEZXByZWNhdGlvbikge1xuICAgICAgICBjb25zb2xlLnRyYWNlKG1zZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gICAgICB9XG4gICAgICB3YXJuZWQgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIHJldHVybiBkZXByZWNhdGVkO1xufTtcblxuXG52YXIgZGVidWdzID0ge307XG52YXIgZGVidWdFbnZpcm9uO1xuZXhwb3J0cy5kZWJ1Z2xvZyA9IGZ1bmN0aW9uKHNldCkge1xuICBpZiAoaXNVbmRlZmluZWQoZGVidWdFbnZpcm9uKSlcbiAgICBkZWJ1Z0Vudmlyb24gPSBwcm9jZXNzLmVudi5OT0RFX0RFQlVHIHx8ICcnO1xuICBzZXQgPSBzZXQudG9VcHBlckNhc2UoKTtcbiAgaWYgKCFkZWJ1Z3Nbc2V0XSkge1xuICAgIGlmIChuZXcgUmVnRXhwKCdcXFxcYicgKyBzZXQgKyAnXFxcXGInLCAnaScpLnRlc3QoZGVidWdFbnZpcm9uKSkge1xuICAgICAgdmFyIHBpZCA9IHByb2Nlc3MucGlkO1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyVzICVkOiAlcycsIHNldCwgcGlkLCBtc2cpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHt9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gZGVidWdzW3NldF07XG59O1xuXG5cbi8qKlxuICogRWNob3MgdGhlIHZhbHVlIG9mIGEgdmFsdWUuIFRyeXMgdG8gcHJpbnQgdGhlIHZhbHVlIG91dFxuICogaW4gdGhlIGJlc3Qgd2F5IHBvc3NpYmxlIGdpdmVuIHRoZSBkaWZmZXJlbnQgdHlwZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHByaW50IG91dC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgYWx0ZXJzIHRoZSBvdXRwdXQuXG4gKi9cbi8qIGxlZ2FjeTogb2JqLCBzaG93SGlkZGVuLCBkZXB0aCwgY29sb3JzKi9cbmZ1bmN0aW9uIGluc3BlY3Qob2JqLCBvcHRzKSB7XG4gIC8vIGRlZmF1bHQgb3B0aW9uc1xuICB2YXIgY3R4ID0ge1xuICAgIHNlZW46IFtdLFxuICAgIHN0eWxpemU6IHN0eWxpemVOb0NvbG9yXG4gIH07XG4gIC8vIGxlZ2FjeS4uLlxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSAzKSBjdHguZGVwdGggPSBhcmd1bWVudHNbMl07XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDQpIGN0eC5jb2xvcnMgPSBhcmd1bWVudHNbM107XG4gIGlmIChpc0Jvb2xlYW4ob3B0cykpIHtcbiAgICAvLyBsZWdhY3kuLi5cbiAgICBjdHguc2hvd0hpZGRlbiA9IG9wdHM7XG4gIH0gZWxzZSBpZiAob3B0cykge1xuICAgIC8vIGdvdCBhbiBcIm9wdGlvbnNcIiBvYmplY3RcbiAgICBleHBvcnRzLl9leHRlbmQoY3R4LCBvcHRzKTtcbiAgfVxuICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gIGlmIChpc1VuZGVmaW5lZChjdHguc2hvd0hpZGRlbikpIGN0eC5zaG93SGlkZGVuID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguZGVwdGgpKSBjdHguZGVwdGggPSAyO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmNvbG9ycykpIGN0eC5jb2xvcnMgPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jdXN0b21JbnNwZWN0KSkgY3R4LmN1c3RvbUluc3BlY3QgPSB0cnVlO1xuICBpZiAoY3R4LmNvbG9ycykgY3R4LnN0eWxpemUgPSBzdHlsaXplV2l0aENvbG9yO1xuICByZXR1cm4gZm9ybWF0VmFsdWUoY3R4LCBvYmosIGN0eC5kZXB0aCk7XG59XG5leHBvcnRzLmluc3BlY3QgPSBpbnNwZWN0O1xuXG5cbi8vIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSNncmFwaGljc1xuaW5zcGVjdC5jb2xvcnMgPSB7XG4gICdib2xkJyA6IFsxLCAyMl0sXG4gICdpdGFsaWMnIDogWzMsIDIzXSxcbiAgJ3VuZGVybGluZScgOiBbNCwgMjRdLFxuICAnaW52ZXJzZScgOiBbNywgMjddLFxuICAnd2hpdGUnIDogWzM3LCAzOV0sXG4gICdncmV5JyA6IFs5MCwgMzldLFxuICAnYmxhY2snIDogWzMwLCAzOV0sXG4gICdibHVlJyA6IFszNCwgMzldLFxuICAnY3lhbicgOiBbMzYsIDM5XSxcbiAgJ2dyZWVuJyA6IFszMiwgMzldLFxuICAnbWFnZW50YScgOiBbMzUsIDM5XSxcbiAgJ3JlZCcgOiBbMzEsIDM5XSxcbiAgJ3llbGxvdycgOiBbMzMsIDM5XVxufTtcblxuLy8gRG9uJ3QgdXNlICdibHVlJyBub3QgdmlzaWJsZSBvbiBjbWQuZXhlXG5pbnNwZWN0LnN0eWxlcyA9IHtcbiAgJ3NwZWNpYWwnOiAnY3lhbicsXG4gICdudW1iZXInOiAneWVsbG93JyxcbiAgJ2Jvb2xlYW4nOiAneWVsbG93JyxcbiAgJ3VuZGVmaW5lZCc6ICdncmV5JyxcbiAgJ251bGwnOiAnYm9sZCcsXG4gICdzdHJpbmcnOiAnZ3JlZW4nLFxuICAnZGF0ZSc6ICdtYWdlbnRhJyxcbiAgLy8gXCJuYW1lXCI6IGludGVudGlvbmFsbHkgbm90IHN0eWxpbmdcbiAgJ3JlZ2V4cCc6ICdyZWQnXG59O1xuXG5cbmZ1bmN0aW9uIHN0eWxpemVXaXRoQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgdmFyIHN0eWxlID0gaW5zcGVjdC5zdHlsZXNbc3R5bGVUeXBlXTtcblxuICBpZiAoc3R5bGUpIHtcbiAgICByZXR1cm4gJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVswXSArICdtJyArIHN0ciArXG4gICAgICAgICAgICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMV0gKyAnbSc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIHN0eWxpemVOb0NvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHJldHVybiBzdHI7XG59XG5cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYXJyYXkpIHtcbiAgdmFyIGhhc2ggPSB7fTtcblxuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbCwgaWR4KSB7XG4gICAgaGFzaFt2YWxdID0gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGhhc2g7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzKSB7XG4gIC8vIFByb3ZpZGUgYSBob29rIGZvciB1c2VyLXNwZWNpZmllZCBpbnNwZWN0IGZ1bmN0aW9ucy5cbiAgLy8gQ2hlY2sgdGhhdCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbiBpbnNwZWN0IGZ1bmN0aW9uIG9uIGl0XG4gIGlmIChjdHguY3VzdG9tSW5zcGVjdCAmJlxuICAgICAgdmFsdWUgJiZcbiAgICAgIGlzRnVuY3Rpb24odmFsdWUuaW5zcGVjdCkgJiZcbiAgICAgIC8vIEZpbHRlciBvdXQgdGhlIHV0aWwgbW9kdWxlLCBpdCdzIGluc3BlY3QgZnVuY3Rpb24gaXMgc3BlY2lhbFxuICAgICAgdmFsdWUuaW5zcGVjdCAhPT0gZXhwb3J0cy5pbnNwZWN0ICYmXG4gICAgICAvLyBBbHNvIGZpbHRlciBvdXQgYW55IHByb3RvdHlwZSBvYmplY3RzIHVzaW5nIHRoZSBjaXJjdWxhciBjaGVjay5cbiAgICAgICEodmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlID09PSB2YWx1ZSkpIHtcbiAgICB2YXIgcmV0ID0gdmFsdWUuaW5zcGVjdChyZWN1cnNlVGltZXMsIGN0eCk7XG4gICAgaWYgKCFpc1N0cmluZyhyZXQpKSB7XG4gICAgICByZXQgPSBmb3JtYXRWYWx1ZShjdHgsIHJldCwgcmVjdXJzZVRpbWVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIFByaW1pdGl2ZSB0eXBlcyBjYW5ub3QgaGF2ZSBwcm9wZXJ0aWVzXG4gIHZhciBwcmltaXRpdmUgPSBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSk7XG4gIGlmIChwcmltaXRpdmUpIHtcbiAgICByZXR1cm4gcHJpbWl0aXZlO1xuICB9XG5cbiAgLy8gTG9vayB1cCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0LlxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgdmFyIHZpc2libGVLZXlzID0gYXJyYXlUb0hhc2goa2V5cyk7XG5cbiAgaWYgKGN0eC5zaG93SGlkZGVuKSB7XG4gICAga2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHZhbHVlKTtcbiAgfVxuXG4gIC8vIElFIGRvZXNuJ3QgbWFrZSBlcnJvciBmaWVsZHMgbm9uLWVudW1lcmFibGVcbiAgLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2llL2R3dzUyc2J0KHY9dnMuOTQpLmFzcHhcbiAgaWYgKGlzRXJyb3IodmFsdWUpXG4gICAgICAmJiAoa2V5cy5pbmRleE9mKCdtZXNzYWdlJykgPj0gMCB8fCBrZXlzLmluZGV4T2YoJ2Rlc2NyaXB0aW9uJykgPj0gMCkpIHtcbiAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgLy8gU29tZSB0eXBlIG9mIG9iamVjdCB3aXRob3V0IHByb3BlcnRpZXMgY2FuIGJlIHNob3J0Y3V0dGVkLlxuICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgIHZhciBuYW1lID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tGdW5jdGlvbicgKyBuYW1lICsgJ10nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH1cbiAgICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKERhdGUucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAnZGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGJhc2UgPSAnJywgYXJyYXkgPSBmYWxzZSwgYnJhY2VzID0gWyd7JywgJ30nXTtcblxuICAvLyBNYWtlIEFycmF5IHNheSB0aGF0IHRoZXkgYXJlIEFycmF5XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIGFycmF5ID0gdHJ1ZTtcbiAgICBicmFjZXMgPSBbJ1snLCAnXSddO1xuICB9XG5cbiAgLy8gTWFrZSBmdW5jdGlvbnMgc2F5IHRoYXQgdGhleSBhcmUgZnVuY3Rpb25zXG4gIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgIHZhciBuID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgYmFzZSA9ICcgW0Z1bmN0aW9uJyArIG4gKyAnXSc7XG4gIH1cblxuICAvLyBNYWtlIFJlZ0V4cHMgc2F5IHRoYXQgdGhleSBhcmUgUmVnRXhwc1xuICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGRhdGVzIHdpdGggcHJvcGVydGllcyBmaXJzdCBzYXkgdGhlIGRhdGVcbiAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGVycm9yIHdpdGggbWVzc2FnZSBmaXJzdCBzYXkgdGhlIGVycm9yXG4gIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgKCFhcnJheSB8fCB2YWx1ZS5sZW5ndGggPT0gMCkpIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArIGJyYWNlc1sxXTtcbiAgfVxuXG4gIGlmIChyZWN1cnNlVGltZXMgPCAwKSB7XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbT2JqZWN0XScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG5cbiAgY3R4LnNlZW4ucHVzaCh2YWx1ZSk7XG5cbiAgdmFyIG91dHB1dDtcbiAgaWYgKGFycmF5KSB7XG4gICAgb3V0cHV0ID0gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cyk7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSk7XG4gICAgfSk7XG4gIH1cblxuICBjdHguc2Vlbi5wb3AoKTtcblxuICByZXR1cm4gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKSB7XG4gIGlmIChpc1VuZGVmaW5lZCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCd1bmRlZmluZWQnLCAndW5kZWZpbmVkJyk7XG4gIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICB2YXIgc2ltcGxlID0gJ1xcJycgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkucmVwbGFjZSgvXlwifFwiJC9nLCAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykgKyAnXFwnJztcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoc2ltcGxlLCAnc3RyaW5nJyk7XG4gIH1cbiAgaWYgKGlzTnVtYmVyKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ251bWJlcicpO1xuICBpZiAoaXNCb29sZWFuKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ2Jvb2xlYW4nKTtcbiAgLy8gRm9yIHNvbWUgcmVhc29uIHR5cGVvZiBudWxsIGlzIFwib2JqZWN0XCIsIHNvIHNwZWNpYWwgY2FzZSBoZXJlLlxuICBpZiAoaXNOdWxsKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ251bGwnLCAnbnVsbCcpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yKHZhbHVlKSB7XG4gIHJldHVybiAnWycgKyBFcnJvci5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgKyAnXSc7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cykge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gdmFsdWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgaWYgKGhhc093blByb3BlcnR5KHZhbHVlLCBTdHJpbmcoaSkpKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIFN0cmluZyhpKSwgdHJ1ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaCgnJyk7XG4gICAgfVxuICB9XG4gIGtleXMuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICBpZiAoIWtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAga2V5LCB0cnVlKSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KSB7XG4gIHZhciBuYW1lLCBzdHIsIGRlc2M7XG4gIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHZhbHVlLCBrZXkpIHx8IHsgdmFsdWU6IHZhbHVlW2tleV0gfTtcbiAgaWYgKGRlc2MuZ2V0KSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlci9TZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoIWhhc093blByb3BlcnR5KHZpc2libGVLZXlzLCBrZXkpKSB7XG4gICAgbmFtZSA9ICdbJyArIGtleSArICddJztcbiAgfVxuICBpZiAoIXN0cikge1xuICAgIGlmIChjdHguc2Vlbi5pbmRleE9mKGRlc2MudmFsdWUpIDwgMCkge1xuICAgICAgaWYgKGlzTnVsbChyZWN1cnNlVGltZXMpKSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgbnVsbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIHJlY3Vyc2VUaW1lcyAtIDEpO1xuICAgICAgfVxuICAgICAgaWYgKHN0ci5pbmRleE9mKCdcXG4nKSA+IC0xKSB7XG4gICAgICAgIGlmIChhcnJheSkge1xuICAgICAgICAgIHN0ciA9IHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKS5zdWJzdHIoMik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RyID0gJ1xcbicgKyBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbQ2lyY3VsYXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKGlzVW5kZWZpbmVkKG5hbWUpKSB7XG4gICAgaWYgKGFycmF5ICYmIGtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICAgIG5hbWUgPSBKU09OLnN0cmluZ2lmeSgnJyArIGtleSk7XG4gICAgaWYgKG5hbWUubWF0Y2goL15cIihbYS16QS1aX11bYS16QS1aXzAtOV0qKVwiJC8pKSB7XG4gICAgICBuYW1lID0gbmFtZS5zdWJzdHIoMSwgbmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnbmFtZScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKF5cInxcIiQpL2csIFwiJ1wiKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnc3RyaW5nJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5hbWUgKyAnOiAnICsgc3RyO1xufVxuXG5cbmZ1bmN0aW9uIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKSB7XG4gIHZhciBudW1MaW5lc0VzdCA9IDA7XG4gIHZhciBsZW5ndGggPSBvdXRwdXQucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cikge1xuICAgIG51bUxpbmVzRXN0Kys7XG4gICAgaWYgKGN1ci5pbmRleE9mKCdcXG4nKSA+PSAwKSBudW1MaW5lc0VzdCsrO1xuICAgIHJldHVybiBwcmV2ICsgY3VyLnJlcGxhY2UoL1xcdTAwMWJcXFtcXGRcXGQ/bS9nLCAnJykubGVuZ3RoICsgMTtcbiAgfSwgMCk7XG5cbiAgaWYgKGxlbmd0aCA+IDYwKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArXG4gICAgICAgICAgIChiYXNlID09PSAnJyA/ICcnIDogYmFzZSArICdcXG4gJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBvdXRwdXQuam9pbignLFxcbiAgJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBicmFjZXNbMV07XG4gIH1cblxuICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArICcgJyArIG91dHB1dC5qb2luKCcsICcpICsgJyAnICsgYnJhY2VzWzFdO1xufVxuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5leHBvcnRzLmlzQnVmZmVyID0gcmVxdWlyZSgnLi9zdXBwb3J0L2lzQnVmZmVyJyk7XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn1cblxuXG5mdW5jdGlvbiBwYWQobikge1xuICByZXR1cm4gbiA8IDEwID8gJzAnICsgbi50b1N0cmluZygxMCkgOiBuLnRvU3RyaW5nKDEwKTtcbn1cblxuXG52YXIgbW9udGhzID0gWydKYW4nLCAnRmViJywgJ01hcicsICdBcHInLCAnTWF5JywgJ0p1bicsICdKdWwnLCAnQXVnJywgJ1NlcCcsXG4gICAgICAgICAgICAgICdPY3QnLCAnTm92JywgJ0RlYyddO1xuXG4vLyAyNiBGZWIgMTY6MTk6MzRcbmZ1bmN0aW9uIHRpbWVzdGFtcCgpIHtcbiAgdmFyIGQgPSBuZXcgRGF0ZSgpO1xuICB2YXIgdGltZSA9IFtwYWQoZC5nZXRIb3VycygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0TWludXRlcygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0U2Vjb25kcygpKV0uam9pbignOicpO1xuICByZXR1cm4gW2QuZ2V0RGF0ZSgpLCBtb250aHNbZC5nZXRNb250aCgpXSwgdGltZV0uam9pbignICcpO1xufVxuXG5cbi8vIGxvZyBpcyBqdXN0IGEgdGhpbiB3cmFwcGVyIHRvIGNvbnNvbGUubG9nIHRoYXQgcHJlcGVuZHMgYSB0aW1lc3RhbXBcbmV4cG9ydHMubG9nID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCclcyAtICVzJywgdGltZXN0YW1wKCksIGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cykpO1xufTtcblxuXG4vKipcbiAqIEluaGVyaXQgdGhlIHByb3RvdHlwZSBtZXRob2RzIGZyb20gb25lIGNvbnN0cnVjdG9yIGludG8gYW5vdGhlci5cbiAqXG4gKiBUaGUgRnVuY3Rpb24ucHJvdG90eXBlLmluaGVyaXRzIGZyb20gbGFuZy5qcyByZXdyaXR0ZW4gYXMgYSBzdGFuZGFsb25lXG4gKiBmdW5jdGlvbiAobm90IG9uIEZ1bmN0aW9uLnByb3RvdHlwZSkuIE5PVEU6IElmIHRoaXMgZmlsZSBpcyB0byBiZSBsb2FkZWRcbiAqIGR1cmluZyBib290c3RyYXBwaW5nIHRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmUgcmV3cml0dGVuIHVzaW5nIHNvbWUgbmF0aXZlXG4gKiBmdW5jdGlvbnMgYXMgcHJvdG90eXBlIHNldHVwIHVzaW5nIG5vcm1hbCBKYXZhU2NyaXB0IGRvZXMgbm90IHdvcmsgYXNcbiAqIGV4cGVjdGVkIGR1cmluZyBib290c3RyYXBwaW5nIChzZWUgbWlycm9yLmpzIGluIHIxMTQ5MDMpLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gd2hpY2ggbmVlZHMgdG8gaW5oZXJpdCB0aGVcbiAqICAgICBwcm90b3R5cGUuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBzdXBlckN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gdG8gaW5oZXJpdCBwcm90b3R5cGUgZnJvbS5cbiAqL1xuZXhwb3J0cy5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG5cbmV4cG9ydHMuX2V4dGVuZCA9IGZ1bmN0aW9uKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgIWlzT2JqZWN0KGFkZCkpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59O1xuXG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuIiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGV2ZSA9IHJlcXVpcmUoJ2V2ZScpO1xudmFyIHJlUHJlZml4ZWQgPSAvXmdsdWVcXC4vO1xuXG4vKipcbiAgIyMgRXZlbnRzXG5cbiAgR2x1ZSB1c2VzIFtldmVdKGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS13ZWJwbGF0Zm9ybS9ldmUpIHVuZGVyIHRoZSBob29kLFxuICBhbmQgZXhwb3NlcyBhIHNpbXBsZSBpbnRlcmZhY2UgdG8gZXZlIGV2ZW50cyB0aHJvdWdoIHRoZSBgZ2x1ZS5ldmVudHNgXG4gIGludGVyZmFjZS5cblxuICBJZiB1c2luZyBldmUgZGlyZWN0bHkgdGhlc2UgZXZlbnRzIGFyZSBuYW1lc3BhY2VkIHdpdGggdGhlIHByZWZpeCBvZlxuICBgZ2x1ZS5gIHRvIGF2b2lkIGV2ZW50IG5hbWUgY2xhc2hlcyBvbiB0aGUgYnVzLCBidXQgeW91IGNhbiB1c2UgdGhlXG4gIGBnbHVlLmV2ZW50c2AgZW5kcG9pbnQgdG8gYXR0YWNoIHRvIGV2ZSB3aXRob3V0IHRoZSBuYW1lc3BhY2UgaWYgeW91IHByZWZlci5cblxuICBGb3IgZXhhbXBsZTpcblxuICA8PDwgZXhhbXBsZXMvZXZlbnQtbmFtZXNwYWNpbmcuanNcblxuKiovXG5bJ29uJywgJ29uY2UnLCAnb2ZmJ10uZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcbiAgZXhwb3J0c1ttZXRob2RdID0gZnVuY3Rpb24obmFtZSwgaGFuZGxlcikge1xuICAgIGlmICghIHJlUHJlZml4ZWQudGVzdChuYW1lKSkge1xuICAgICAgbmFtZSA9ICdnbHVlLicgKyBuYW1lO1xuICAgIH1cblxuICAgIC8vIHJlZ2lzdGVyIHRoZSBoYW5kbGVyXG4gICAgZXZlW21ldGhvZF0obmFtZSwgaGFuZGxlcik7XG4gIH07XG59KTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuLyogZ2xvYmFsIHdpbmRvdzogZmFsc2UgKi9cbi8qIGdsb2JhbCBkb2N1bWVudDogZmFsc2UgKi9cbi8qIGdsb2JhbCBsb2NhdGlvbjogZmFsc2UgKi9cbi8qIGdsb2JhbCBDdXN0b21FdmVudDogZmFsc2UgKi9cbi8qIGdsb2JhbCBpbzogZmFsc2UgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGFzeW5jID0gcmVxdWlyZSgnYXN5bmMnKTtcbnZhciB1cmwgPSByZXF1aXJlKCd1cmwnKTtcbnZhciBldmUgPSByZXF1aXJlKCdldmUnKTtcbnZhciBxc2EgPSByZXF1aXJlKCdmZG9tL3FzYScpO1xudmFyIG9uID0gcmVxdWlyZSgnZmRvbS9vbicpO1xudmFyIGV4dGVuZCA9IHJlcXVpcmUoJ2NvZy9leHRlbmQnKTtcbnZhciBkZWZhdWx0cyA9IHJlcXVpcmUoJ2NvZy9kZWZhdWx0cycpO1xudmFyIGxvZ2dlciA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKTtcbnZhciBkZWJ1ZyA9IGxvZ2dlcignZ2x1ZScpO1xudmFyIHNpZ25hbGxlciA9IHJlcXVpcmUoJ3J0Yy1zaWduYWxsZXInKTtcbnZhciBtZWRpYSA9IHJlcXVpcmUoJ3J0Yy1tZWRpYScpO1xudmFyIGNhcHR1cmVDb25maWcgPSByZXF1aXJlKCdydGMtY2FwdHVyZWNvbmZpZycpO1xudmFyIHRyYW5zZm9ybSA9IHJlcXVpcmUoJ3NkcC10cmFuc2Zvcm0nKTtcbnZhciByZXNldEVsID0gcmVxdWlyZSgncnRjLWNvcmUvcmVzZXQnKTtcbi8vIHZhciBsaW5lciA9IHJlcXVpcmUoJ3NkcC1saW5lcycpO1xuXG52YXIgcmVTZXAgPSAvW1xcc1xcLF1cXHMqLztcbnZhciByZVRyYWlsaW5nU2xhc2ggPSAvXFwvJC87XG52YXIgY2FuR2V0U291cmNlcyA9IHR5cGVvZiBNZWRpYVN0cmVhbVRyYWNrICE9ICd1bmRlZmluZWQnICYmXG4gIE1lZGlhU3RyZWFtVHJhY2suZ2V0U291cmNlcztcblxuLy8gaW5pdGlhbGlzZSBvdXIgY29uZmlnICh1c2luZyBydGMtIG5hbWVkIG1ldGFkYXRhIHRhZ3MpXG52YXIgY29uZmlnID0gZGVmYXVsdHMoe30sIHJlcXVpcmUoJ2Zkb20vbWV0YScpKC9ecnRjLSguKikkLyksIHtcbiAgcm9vbTogbG9jYXRpb24uaGFzaC5zbGljZSgxKSxcbiAgc2lnbmFsaG9zdDogbG9jYXRpb24ub3JpZ2luIHx8ICdodHRwOi8vcnRjLmlvL3N3aXRjaGJvYXJkLydcbn0pO1xuXG52YXIgU2Vzc2lvbk1hbmFnZXIgPSByZXF1aXJlKCcuL3Nlc3Npb25tYW5hZ2VyJyk7XG52YXIgc2Vzc2lvbk1ncjtcbnZhciBzb3VyY2VzO1xuXG4vKipcbiAgIyBydGMtZ2x1ZVxuXG4gIEdsdWUgaXMgYSBoaWdoLWxldmVsIGFwcHJvYWNoIHRvIGJ1aWxkaW5nIFdlYlJUQyBhcHBsaWNhdGlvbnMuIEl0IGlzXG4gIHByaW1hcmlseSBkZXNpZ25lZCBmb3Igd2ViIGFwcGxpY2F0aW9uIGNvZGVycyB3aG8gd291bGQgcHJlZmVyIHRvIHNwZW5kXG4gIHRoZWlyIHRpbWUgaW4gSFRNTCBhbmQgQ1NTIHJhdGhlciB0aGFuIEpTLlxuXG4gICMjIEV4YW1wbGUgVXNhZ2VcblxuICBHbHVlIHdvcmtzIGJ5IGxvb2tpbmcgZm9yIEhUTUwgdGFncyB0aGF0IGZvbGxvdyBwYXJ0aWN1bGFyIGNvbnZlbnRpb25zXG4gIHdpdGggcmVnYXJkcyB0byBuYW1lZCBhdHRyaWJ1dGVkLCBldGMuICBGb3IgaW5zdGFuY2UsIGNvbnNpZGVyIHRoZVxuICBmb2xsb3dpbmcgSFRNTDpcblxuICA8PDwgZXhhbXBsZXMvY2FwdHVyZS1vbmx5Lmh0bWxcblxuICBJdCBpcyB0aGVuIHBvc3NpYmxlIHRvIHR3ZWFrIHRoZSBgZ2V0VXNlck1lZGlhYCBjb25zdHJhaW50cyB1c2luZyBzb21lXG4gIGZsYWdzIGluIHRoZSBgcnRjLWNhcHR1cmVgIGF0dHJpYnV0ZTpcblxuICA8PDwgZXhhbXBsZXMvY2FwdHVyZS10d2Vha3Jlcy5odG1sXG5cbiAgRm9yIHRob3NlIHdobyBwcmVmZXIgdXNpbmcgc2VwYXJhdGUgYXR0cmlidXRlcywgeW91IGNhbiBhY2hpZXZlIHNpbWlsYXJcbiAgYmVoYXZpb3VyIHVzaW5nIHRoZSBgcnRjLXJlc29sdXRpb25gIChvciBgcnRjLXJlc2ApIGF0dHJpYnV0ZTpcblxuICA8PDwgZXhhbXBsZXMvcmVzLWF0dHJpYnV0ZS5odG1sXG5cbiAgIyMgQ29uZmVyZW5jaW5nIEV4YW1wbGVcblxuICBUaGUgZm9sbG93aW5nIGlzIGEgc2ltcGxlIGV4YW1wbGUgb2YgY29uZmVyZW5jaW5nIHVzaW5nIHNvbWUgaG9zdGVkIHJ0Yy5pb1xuICBzaWduYWxsaW5nOlxuXG4gIDw8PCBleGFtcGxlcy9jb25mZXJlbmNlLXNpbXBsZS5odG1sXG5cbiAgIyMgR2V0dGluZyBHbHVlXG5cbiAgUHJpbWFyaWx5IGdsdWUgaXMgZGVzaWduZWQgZm9yIHVzZSBpbiBhIHN0YW5kYWxvbmUgc2l0dWF0aW9uLCBhbmQgdGh1c1xuICBjb21lcyBwcmUtcGFja2FnZWQgaW4gYSBVTURqc1xuICBbZGlzdHJpYnV0aW9uXShodHRwczovL2dpdGh1Yi5jb20vcnRjLWlvL3J0Yy1nbHVlL3RyZWUvbWFzdGVyL2Rpc3QpLiBJZlxuICB5b3UgcHJlZmVyIHdvcmtpbmcgd2l0aCBicm93c2VyaWZ5LCB0aGVuIGl0IHdpbGwgc3RpbGwgd29yayBxdWl0ZSBuaWNlbHlcbiAgYW5kIHlvdSBzaG91bGQganVzdCBgbnBtIGluc3RhbGwgcnRjLWdsdWVgIGxpa2UgeW91IHdvdWxkIHdpdGggb3RoZXJcbiAgbW9kdWxlcyBvZiB0aGUgcnRjLmlvIHN1aXRlLlxuXG4gICMjIFJ1bm5pbmcgdGhlIEV4YW1wbGVzXG5cbiAgVGhpcyBtb2R1bGUgb2YgdGhlIFtydGMuaW9dKGh0dHBzOi8vcnRjLmlvLykgc3VpdGUgaXMgYSBsaXR0bGUgZGlmZmVyZW50XG4gIHRvIG90aGVycyBpbiB0aGF0IGl0IGNvbWVzIHdpdGggYSByZWFkeSB0byBydW4ganMgZmlsZS4gIFNpbXBseSBzdGFydFxuICBhIHdlYnNlcnZlciBpbiB0aGUgcm9vdCBvZiB0aGUgZGlyZWN0b3J5IGFmdGVyIGNsb25pbmcuICBJZiB5b3UgYXJlIGxvb2tpbmdcbiAgZm9yIGEgZ29vZCBvbmUsIEknZCByZWNvbW1lbmQgW3N0XShodHRwczovL2dpdGh1Yi5jb20vaXNhYWNzL3N0KS5cblxuICAjIyBUYXJnZXRlZCBNZWRpYSBDYXB0dXJlXG5cbiAgVGhlIGRyYWZ0XG4gIFtNZWRpYSBDYXB0dXJlIHNwZWNdKGh0dHA6Ly9kZXYudzMub3JnLzIwMTEvd2VicnRjL2VkaXRvci9nZXR1c2VybWVkaWEuaHRtbClcbiAgaW50cm9kdWNlcyB0aGUgYWJpbGl0eSB0byBxdWVyeSBtZWRpYSBkZXZpY2VzIG9uIHRoZSBtYWNoaW5lLiAgVGhpcyBpc1xuICBjdXJyZW50bHkgYXZhaWxhYmxlIHRocm91Z2ggdGhlIGBNZWRpYVN0cmVhbVRyYWNrLmdldFNvdXJjZXNgIGZ1bmN0aW9uLlxuXG4gIElmIGF2YWlsYWJsZSB0aGVuIHlvdSBjYW4gdGFyZ2V0IHRoZSBjYXB0dXJlIG9mIGEgcGFydGljdWxhciBpbnB1dCBkZXZpY2VcbiAgdGhyb3VnaCB0aGUgdXNlIG9mIGEgbnVtYmVyZWQgZGV2aWNlIGNhcHR1cmUgc3BlY2lmaWNhdGlvbi4gIEZvciBleGFtcGxlOlxuXG4gIGBgYGh0bWxcbiAgPHZpZGVvIHJ0Yy1jYXB0dXJlPVwiY2FtZXJhOjFcIj48L3ZpZGVvPlxuICBgYGBcblxuICBXb3VsZCBhdHR0ZW1wdCB0byBjYXB0dXJlIHRoZSAybmQgKDAtaW5kZXhlZCkgY2FtZXJhIGF2YWlsYWJsZSBvbiB0aGVcbiAgbWFjaGluZSAoaWYgaXQgaXMgYWJsZSB0byBxdWVyeSBkZXZpY2VzKS4gIFRoZSBmb2xsb3dpbmcgaXMgYSBsYXJnZXJcbiAgZXhhbXBsZTpcblxuICA8PDwgZXhhbXBsZXMvY2FwdHVyZS1tdWx0aWNhbS5odG1sXG5cbiAgIyMgT24gQ3VzdG9tIEF0dHJpYnV0ZXNcblxuICBXaGlsZSB3ZSBoYXZlbid0IDEwMCUgZGVjaWRlZCB3ZSBhcmUgbGVhbmluZyB0b3dhcmRzIHRoZSB1c2Ugb2YgY3VzdG9tXG4gIGBydGMtKmAgYXR0cmlidXRlcyBmb3IgaW5mbHVlbmNpbmcgdGhlIGJlaGF2aW91ciBvZiB0aGUgYHJ0Yy1nbHVlYCBsaWJyYXJ5LlxuICBXaGlsZSBjdXJyZW50bHkgdGhpcyBpcyBpbiB2aW9sYXRpb24gd2l0aCB0aGUgSFRNTDUgc3BlYywgaXQgaXMgYW4gYXJlYVxuICBvZiBhY3RpdmUgZGlzY3Vzc2lvbiBpbiBXM0MgbGFuZCAoZ2l2ZW4gW0FuZ3VsYXJKU10oaHR0cDovL2FuZ3VsYXJqcy5vcmcvKVxuICBoYXMgYWRvcHRlZCB0aGUgYG5nLSpgIGF0dHJpYnV0ZXMgYW5kIGlzIHByb3ZpbmcgcG9wdWxhcikuXG5cbiAgIyMjIERvY3VtZW50IE1ldGFkYXRhXG5cbiAgSW4gdGhlIGBydGMtZ2x1ZWAgbGlicmFyeSB3ZSB1c2UgZG9jdW1lbnQgbGV2ZWwgYDxtZXRhPmAgdGFncyB0byBwcm92aWRlXG4gIGdsdWUgd2l0aCBjb25maWd1cmF0aW9uIGluZm9ybWF0aW9uLiAgVGhlcmUgYXJlIGEgbnVtYmVyIG9mIGNvbmZpZ3VyYWJsZVxuICBvcHRpb25zLCBlYWNoIHdoaWNoIGlzIHVzZWQgaW4gdGhlIGZvcm0gb2Y6XG5cbiAgYGBgaHRtbFxuICA8bWV0YSBuYW1lPVwicnRjLSVmbGFnbmFtZSVcIiBjb250ZW50PVwiY29uZmlnIGNvbnRlbnRcIiAvPlxuICBgYGBcblxuICAjIyMjIHJ0Yy1yb29tXG5cbiAgQSBjdXN0b20gcm9vbSB0aGF0IG5ldyBjb252ZXJzYXRpb25zIHdpbGwgYmUgY3JlYXRlZCBpbi4gIElmIG5vdCBzcGVjaWZpZWRcbiAgdGhpcyB3aWxsIGRlZmF1bHQgdG8gYSB2YWx1ZSBvZiBgYXV0b2AuXG5cbiAgIyMjIyBydGMtcm9sZVxuXG4gIEluIHNvbWUgY29uZmVyZW5jZSBzY2VuYXJpb3MsIGRpZmZlcmVudCBwYXJ0aWNpcGFudHMgYXJlIGFzc2lnbmVkIGRpZmZlcmVudFxuICByb2xlcyAoZS5nLiBzdHVkZW50L3RlYWNoZXIsIGNvbnN1bHRhbnQvY3VzdG9tZXIsIGV0YykuICBCeSBzcGVjaWZ5aW5nIHRoZVxuICBgcnRjLXJvbGVgIG1ldGFkYXRhIHlvdSB0aGlzIHJvbGUgaW5mb3JtYXRpb24gd2lsbCBiZSBhbm5vdW5jZWQgYXMgcGFydFxuICBvZiB0aGUgYHJ0Yy1xdWlja2Nvbm5lY3RgIGluaXRpYWxpemF0aW9uLlxuXG4gICMjIFJlZmVyZW5jZVxuXG4gICMjIyBFbGVtZW50IEF0dHJpYnV0ZXNcblxuICAjIyMjIHJ0Yy1jYXB0dXJlXG5cbiAgVGhlIHByZXNlbmNlIG9mIHRoZSBgcnRjLWNhcHR1cmVgIGF0dHJpYnV0ZSBpbiBhIGB2aWRlb2Agb3IgYGF1ZGlvYCBlbGVtZW50XG4gIGluZGljYXRlcyB0aGF0IGl0IGlzIGEgZ2V0VXNlck1lZGlhIGNhcHR1cmUgdGFyZ2V0LlxuXG4gICMjIyMgcnRjLXBlZXJcblxuICBUbyBiZSBjb21wbGV0ZWQuXG5cbioqL1xudmFyIGdsdWUgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNjb3BlLCBvcHRzKSB7XG4gIHZhciBzdGFydHVwT3BzID0gW107XG4gIHZhciBkZWJ1Z1RhcmdldDtcblxuICAvLyBpbml0aWFsaXNlIHRoZSByZW1vdGUgZWxlbWVudHNcbiAgdmFyIHBlZXJzID0gcXNhKCcqW3J0Yy1wZWVyXScsIHNjb3BlKS5tYXAoaW5pdFBlZXIpO1xuXG4gIC8vIGlmIHdlIGhhdmUgcGVlcnMsIHRoZW4gd2UgYXJlIGdvaW5nIHRvIG5lZWQgcHJpbXVzXG4gIGlmIChwZWVycy5sZW5ndGggPiAwKSB7XG4gICAgc3RhcnR1cE9wcy5wdXNoKGxvYWRQcmltdXMpO1xuICB9XG5cbiAgLy8gYXBwbHkgYW55IGV4dGVybmFsIG9wdHMgdG8gdGhlIGNvbmZpZ3VyYXRpb25cbiAgZXh0ZW5kKGNvbmZpZywgb3B0cyk7XG5cbiAgLy8gZGV0ZXJtaW5lIGlmIHdlIGFyZSBkZWJ1Z2dpbmdcbiAgZGVidWdUYXJnZXQgPSAoY29uZmlnIHx8IHt9KS5kZWJ1ZztcbiAgaWYgKGRlYnVnVGFyZ2V0KSB7XG4gICAgaWYgKGRlYnVnVGFyZ2V0ID09PSB0cnVlKSB7XG4gICAgICBsb2dnZXIuZW5hYmxlKCcqJyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGVidWdUYXJnZXQpKSB7XG4gICAgICBsb2dnZXIuZW5hYmxlLmFwcGx5KGxvZ2dlciwgZGVidWdUYXJnZXQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGxvZ2dlci5lbmFibGUoZGVidWdUYXJnZXQpO1xuICAgIH1cbiAgfVxuXG4gIC8vIHJ1biB0aGUgc3RhcnR1cCBvcGVyYXRpb25zXG4gIGFzeW5jLnBhcmFsbGVsKHN0YXJ0dXBPcHMsIGZ1bmN0aW9uKGVycikge1xuICAgIC8vIFRPRE86IGNoZWNrIGVycm9yc1xuICAgIGRlYnVnKCdzdGFydHVwIG9wcyBjb21wbGV0ZWQsIHN0YXJ0aW5nIGdsdWUnLCBjb25maWcpO1xuICAgIGV2ZSgnZ2x1ZS5yZWFkeScpO1xuXG4gICAgLy8gaWYgd2UgZG9uJ3QgaGF2ZSBhIHJvb20gbmFtZSwgZ2VuZXJhdGUgYSByb29tIG5hbWVcbiAgICBpZiAoISBjb25maWcucm9vbSkge1xuICAgICAgY29uZmlnLnJvb20gPSBnZW5lcmF0ZVJvb21OYW1lKCk7XG4gICAgfVxuXG4gICAgLy8gY3JlYXRlIHRoZSBzZXNzaW9uIG1hbmFnZXJcbiAgICBzZXNzaW9uTWdyID0gdHlwZW9mIFByaW11cyAhPSAndW5kZWZpbmVkJyAmJiBuZXcgU2Vzc2lvbk1hbmFnZXIoY29uZmlnKTtcblxuICAgIGlmIChzZXNzaW9uTWdyKSB7XG4gICAgICBzZXNzaW9uTWdyLm9uY2UoJ2FjdGl2ZScsIGZ1bmN0aW9uKCkge1xuICAgICAgICBxc2EoJypbcnRjLWNhcHR1cmVdJywgc2NvcGUpLmZvckVhY2goaW5pdENhcHR1cmUpO1xuXG4gICAgICAgIC8vIGlmIHdlIGhhdmUgYW55IHBlZXJzLCB0aGVuIGFubm91bmNlIG91cnNlbHZlcyB2aWEgdGhlIHNlc3Npb24gbWFuYWdlclxuICAgICAgICBpZiAocGVlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHNlc3Npb25NZ3IuYW5ub3VuY2UoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRyaWdnZXIgYSBnbHVlIHNlc3Npb24gYWN0aXZlIGV2ZW50XG4gICAgICAgIGV2ZSgnZ2x1ZS5jb25uZWN0ZWQnLCBudWxsLCBzZXNzaW9uTWdyLnNpZ25hbGxlciwgc2Vzc2lvbk1ncik7XG4gICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBxc2EoJypbcnRjLWNhcHR1cmVdJywgc2NvcGUpLmZvckVhY2goaW5pdENhcHR1cmUpO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyB3aXJlIGluIHRoZSBldmVudHMgaGVscGVyXG5nbHVlLmV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG5cbi8vIGV4cG9zZSB0aGUgY29uZmlnIHRocm91Z2ggZ2x1ZVxuZ2x1ZS5jb25maWcgPSBjb25maWc7XG5cbi8vIGF1dG9sb2FkIGdsdWVcbmlmICh0eXBlb2Ygd2luZG93ICE9ICd1bmRlZmluZWQnKSB7XG4gIG9uKCdsb2FkJywgd2luZG93LCBmdW5jdGlvbigpIHtcbiAgICAvLyBjaGVjayBpZiB3ZSBjYW4gYXV0b2xvYWRcbiAgICBpZiAoY29uZmlnLmF1dG9sb2FkID09PSB1bmRlZmluZWQgfHwgY29uZmlnLmF1dG9sb2FkKSB7XG4gICAgICBnbHVlKCk7XG4gICAgfVxuICB9KTtcbn1cblxuLyoqXG4gICMjIyBJbnRlcm5hbCBGdW5jdGlvbnNcbioqL1xuXG4vKipcbiAgIyMjIyBpbml0UGVlcihlbClcblxuICBIYW5kbGUgdGhlIGluaXRpYWxpemF0aW9uIG9mIGEgcnRjLXJlbW90ZSB0YXJnZXRcbioqL1xuZnVuY3Rpb24gaW5pdFBlZXIoZWwpIHtcbiAgdmFyIHByb3BWYWx1ZSA9IGVsLmdldEF0dHJpYnV0ZSgncnRjLXBlZXInKTtcbiAgdmFyIHRhcmdldFN0cmVhbSA9IGVsLmdldEF0dHJpYnV0ZSgncnRjLXN0cmVhbScpO1xuICB2YXIgcGVlclJvbGVzID0gcHJvcFZhbHVlID8gcHJvcFZhbHVlLnNwbGl0KHJlU2VwKSA6IFsnKiddO1xuXG4gIC8vIGNyZWF0ZSBhIGRhdGEgY29udGFpbmVyIHRoYXQgd2Ugd2lsbCBhdHRhY2ggdG8gdGhlIGVsZW1lbnRcbiAgdmFyIGRhdGEgPSBlbC5fcnRjIHx8IChlbC5fcnRjID0ge30pO1xuXG4gIGZ1bmN0aW9uIGF0dGFjaFN0cmVhbShzdHJlYW0pIHtcbiAgICBkZWJ1ZygnYXR0YWNoaW5nIHN0cmVhbScpO1xuICAgIG1lZGlhKHN0cmVhbSkucmVuZGVyKGVsKTtcbiAgICBkYXRhLnN0cmVhbUlkID0gc3RyZWFtLmlkO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRkU3RyZWFtKHN0cmVhbSwgcGVlcikge1xuICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgYSBzdHJlYW0gb3IgYWxyZWFkeSBoYXZlIGEgc3RyZWFtIGlkIHRoZW4gYmFpbFxuICAgIGlmIChkYXRhLnN0cmVhbUlkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gaWYgd2UgaGF2ZSBhIHBhcnRpY3VsYXIgdGFyZ2V0IHN0cmVhbSwgdGhlbiBnbyBsb29raW5nIGZvciBpdFxuICAgIGlmICh0YXJnZXRTdHJlYW0pIHtcbiAgICAgIGRlYnVnKCdyZXF1ZXN0aW5nIHN0cmVhbSBkYXRhJyk7XG4gICAgICBzZXNzaW9uTWdyLmdldFN0cmVhbURhdGEoc3RyZWFtLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgIGRlYnVnKCdnb3Qgc3RyZWFtIGRhdGEnLCBkYXRhKTtcblxuICAgICAgICAvLyBpZiBpdCdzIGEgbWF0Y2gsIHRoZW4gYXR0YWNoXG4gICAgICAgIGlmIChkYXRhICYmIGRhdGEubmFtZSA9PT0gdGFyZ2V0U3RyZWFtKSB7XG4gICAgICAgICAgYXR0YWNoU3RyZWFtKHN0cmVhbSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBvdGhlcndpc2UsIGF1dG9tYXRpY2FsbHkgYXNzb2NpYXRlIHdpdGggdGhlIGVsZW1lbnRcbiAgICBlbHNlIHtcbiAgICAgIGF0dGFjaFN0cmVhbShzdHJlYW0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIGl0ZXJhdGUgdGhyb3VnaCB0aGUgcGVlcnMgYW5kIG1vbml0b3IgZXZlbnRzIGZvciB0aGF0IHBlZXJcbiAgcGVlclJvbGVzLmZvckVhY2goZnVuY3Rpb24ocm9sZSkge1xuICAgIGV2ZS5vbignZ2x1ZS5wZWVyLmFjdGl2ZS4nICsgcm9sZSwgZnVuY3Rpb24ocGVlciwgcGVlcklkKSB7XG4gICAgICAvLyBpZiB0aGUgZWxlbWVudCBhbHJlYWR5IGhhcyBhIHBlZXIsIHRoZW4gZG8gbm90aGluZ1xuICAgICAgaWYgKGRhdGEucGVlcklkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZGVidWcoJ3BlZXIgYWN0aXZlJywgcGVlci5nZXRSZW1vdGVTdHJlYW1zKCkpO1xuXG4gICAgICAvLyBhc3NvY2lhdGUgdGhlIHBlZXIgaWQgd2l0aCB0aGUgZWxlbWVudFxuICAgICAgZGF0YS5wZWVySWQgPSBwZWVySWQ7XG5cbiAgICAgIC8vIGFkZCBleGlzdGluZyBzdHJlYW1zXG4gICAgICBbXS5zbGljZS5jYWxsKHBlZXIuZ2V0UmVtb3RlU3RyZWFtcygpKS5mb3JFYWNoKGFkZFN0cmVhbSk7XG5cbiAgICAgIC8vIGxpc3RlbiBmb3IgYWRkIHN0cmFlbSBldmVudHNcbiAgICAgIHBlZXIuYWRkRXZlbnRMaXN0ZW5lcignYWRkc3RyZWFtJywgZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgIGFkZFN0cmVhbShldnQuc3RyZWFtLCBwZWVyKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBldmUub24oJ2dsdWUucGVlci5sZWF2ZScsIGZ1bmN0aW9uKHBlZXIsIHBlZXJJZCkge1xuICAgIC8vIGlmIHRoZSBwZWVyIGxlYXZpbmcgbWF0Y2hlcyB0aGUgcmVtb3RlIHBlZXIsIHRoZW4gY2xlYW51cFxuICAgIGlmIChkYXRhLnBlZXJJZCA9PT0gcGVlcklkKSB7XG4gICAgICAvLyByZXNldCB0aGUgdGFyZ2V0IG1lZGlhIGVsZW1lbnRcbiAgICAgIHJlc2V0RWwoZWwpO1xuXG4gICAgICAvLyByZXNldCB0aGUgcnRjIGRhdGFcbiAgICAgIGRhdGEgPSBlbC5fcnRjID0ge307XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gZWw7XG59XG5cbi8qKlxuICAjIyMjIGluaXRDYXB0dXJlKGVsKVxuXG4gIEhhbmRsZSB0aGUgaW5pdGlhbGl6YXRpb24gb2YgYW4gcnRjLWNhcHR1cmUgdGFyZ2V0XG4qKi9cbmZ1bmN0aW9uIGluaXRDYXB0dXJlKGVsKSB7XG4gIC8vIHJlYWQgdGhlIGNhcHR1cmUgaW5zdHJ1Y3Rpb25zXG4gIHZhciBjb25maWdUZXh0ID0gZWwuZ2V0QXR0cmlidXRlKCdydGMtY2FwdHVyZScpIHx8ICcnO1xuICB2YXIgcmVzID0gZWwuZ2V0QXR0cmlidXRlKCdydGMtcmVzb2x1dGlvbicpIHx8IGVsLmdldEF0dHJpYnV0ZSgncnRjLXJlcycpO1xuICB2YXIgZnBzID0gZWwuZ2V0QXR0cmlidXRlKCdydGMtZnBzJyk7XG5cbiAgaWYgKHJlcykge1xuICAgIGNvbmZpZ1RleHQgKz0gJyBtaW46JyArIHJlcyArICcgbWF4OicgKyByZXM7XG4gIH1cblxuICBpZiAoZnBzKSB7XG4gICAgY29uZmlnVGV4dCArPSAnIG1pbmZwczonICsgZnBzICsgJyBtYXhmcHM6JyArIGZwcztcbiAgfVxuXG4gIC8vIHBhdGNoIGluIGEgY2FwdHVyZSBtZXRob2QgdG8gdGhlIGVsZW1lbnRcbiAgZWwuY2FwdHVyZSA9IGVuYWJsZUNhcHR1cmUoZWwsIGNhcHR1cmVDb25maWcoY29uZmlnVGV4dCkpO1xuXG4gIC8vIHRyaWdnZXIgY2FwdHVyZVxuICBlbC5jYXB0dXJlKGZ1bmN0aW9uKHN0cmVhbSkge1xuICAgIC8vIGJyb2FkY2FzdCB0aGUgc3RyZWFtIHRocm91Z2ggdGhlIHNlc3Npb24gbWFuYWdlclxuICAgIGlmIChzZXNzaW9uTWdyKSB7XG4gICAgICBzZXNzaW9uTWdyLmJyb2FkY2FzdChzdHJlYW0sIHsgbmFtZTogZWwuaWQgfSk7XG4gICAgfVxuICB9KTtcbn1cblxuLyoqIGludGVybmFsIGhlbHBlcnMgKi9cblxuZnVuY3Rpb24gZW5hYmxlQ2FwdHVyZShlbCwgY29uZmlnKSB7XG5cbiAgZnVuY3Rpb24gY2FwKGNhbGxiYWNrKSB7XG4gICAgdmFyIHN0cmVhbSA9IG1lZGlhKHtcbiAgICAgIGNvbnN0cmFpbnRzOiBjb25maWcudG9Db25zdHJhaW50cyh7XG4gICAgICAgIHNvdXJjZXM6IHNvdXJjZXNcbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyByZW5kZXIgdGhlIHN0cmVhbSB0byB0aGUgdGFyZ2V0IGVsZW1lbnRcbiAgICBzdHJlYW0ucmVuZGVyKGVsKTtcblxuICAgIC8vIGNhcHR1cmUgYW5kIHJlcG9ydCBlcnJvcnNcbiAgICBzdHJlYW0ub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ0Vycm9yIGF0dGVtcHRpbmcgdG8gY2FwdHVyZSBtZWRpYSwgcmVxdWVzdGVkIGNvbnN0cmFpbnRzJyxcbiAgICAgICAgc3RyZWFtLmNvbnN0cmFpbnRzXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgLy8gZW1pdCBhIGNhcHR1cmUgZXZlbnQgdGhyb3VnaCB0aGUgZWxlbWVudFxuICAgIHN0cmVhbS5vbignY2FwdHVyZScsIGZ1bmN0aW9uKHN0cmVhbSkge1xuICAgICAgLy8gZGlzcGF0Y2ggdGhlIGNhcHR1cmUgZXZlbnRcbiAgICAgIGVsLmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdjYXB0dXJlJywge1xuICAgICAgICBkZXRhaWw6IHsgc3RyZWFtOiBzdHJlYW0gfVxuICAgICAgfSkpO1xuXG4gICAgICAvLyB0cmlnZ2VyIHRoZSBjYWxsYmFjayBpZiBvbmUgc3VwcGxpZWRcbiAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjYWxsYmFjayhzdHJlYW0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIHNvdXJjZXMsIG9yIGNhbm5vdCBnZXQgc291cmNlIGluZm9ybWF0aW9uXG4gICAgLy8gdGhlbiBza2lwIHN0cmFpZ2h0IHRvIGNhcHR1cmVcbiAgICBpZiAoc291cmNlcyB8fCAoISBjYW5HZXRTb3VyY2VzKSkge1xuICAgICAgcmV0dXJuIGNhcChjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLy8gZ2V0IGFuZCB1cGRhdGUgc291cmNlc1xuICAgIE1lZGlhU3RyZWFtVHJhY2suZ2V0U291cmNlcyhmdW5jdGlvbihzKSB7XG4gICAgICAvLyB1cGRhdGUgdGhlIHNvdXJjZXNcbiAgICAgIHNvdXJjZXMgPSBzO1xuXG4gICAgICAvLyBjYXB0dXJlXG4gICAgICBjYXAoY2FsbGJhY2spXG4gICAgfSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlUm9vbU5hbWUoKSB7XG4gIGxvY2F0aW9uLmhhc2ggPSBNYXRoLnBvdygyLCA1MykgKiBNYXRoLnJhbmRvbSgpO1xuXG4gIHJldHVybiBsb2NhdGlvbi5oYXNoLnNsaWNlKDEpO1xufVxuXG5mdW5jdGlvbiBsb2FkUHJpbXVzKGNhbGxiYWNrKSB7XG4gIHJldHVybiBzaWduYWxsZXIubG9hZFByaW11cyhjb25maWcuc2lnbmFsaG9zdCwgY2FsbGJhY2spO1xufSIsInZhciBwcm9jZXNzPXJlcXVpcmUoXCJfX2Jyb3dzZXJpZnlfcHJvY2Vzc1wiKTsvKmdsb2JhbCBzZXRJbW1lZGlhdGU6IGZhbHNlLCBzZXRUaW1lb3V0OiBmYWxzZSwgY29uc29sZTogZmFsc2UgKi9cbihmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgYXN5bmMgPSB7fTtcblxuICAgIC8vIGdsb2JhbCBvbiB0aGUgc2VydmVyLCB3aW5kb3cgaW4gdGhlIGJyb3dzZXJcbiAgICB2YXIgcm9vdCwgcHJldmlvdXNfYXN5bmM7XG5cbiAgICByb290ID0gdGhpcztcbiAgICBpZiAocm9vdCAhPSBudWxsKSB7XG4gICAgICBwcmV2aW91c19hc3luYyA9IHJvb3QuYXN5bmM7XG4gICAgfVxuXG4gICAgYXN5bmMubm9Db25mbGljdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcm9vdC5hc3luYyA9IHByZXZpb3VzX2FzeW5jO1xuICAgICAgICByZXR1cm4gYXN5bmM7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIG9ubHlfb25jZShmbikge1xuICAgICAgICB2YXIgY2FsbGVkID0gZmFsc2U7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChjYWxsZWQpIHRocm93IG5ldyBFcnJvcihcIkNhbGxiYWNrIHdhcyBhbHJlYWR5IGNhbGxlZC5cIik7XG4gICAgICAgICAgICBjYWxsZWQgPSB0cnVlO1xuICAgICAgICAgICAgZm4uYXBwbHkocm9vdCwgYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vLy8gY3Jvc3MtYnJvd3NlciBjb21wYXRpYmxpdHkgZnVuY3Rpb25zIC8vLy9cblxuICAgIHZhciBfZWFjaCA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yKSB7XG4gICAgICAgIGlmIChhcnIuZm9yRWFjaCkge1xuICAgICAgICAgICAgcmV0dXJuIGFyci5mb3JFYWNoKGl0ZXJhdG9yKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgaXRlcmF0b3IoYXJyW2ldLCBpLCBhcnIpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHZhciBfbWFwID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IpIHtcbiAgICAgICAgaWYgKGFyci5tYXApIHtcbiAgICAgICAgICAgIHJldHVybiBhcnIubWFwKGl0ZXJhdG9yKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgICAgICBfZWFjaChhcnIsIGZ1bmN0aW9uICh4LCBpLCBhKSB7XG4gICAgICAgICAgICByZXN1bHRzLnB1c2goaXRlcmF0b3IoeCwgaSwgYSkpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfTtcblxuICAgIHZhciBfcmVkdWNlID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIG1lbW8pIHtcbiAgICAgICAgaWYgKGFyci5yZWR1Y2UpIHtcbiAgICAgICAgICAgIHJldHVybiBhcnIucmVkdWNlKGl0ZXJhdG9yLCBtZW1vKTtcbiAgICAgICAgfVxuICAgICAgICBfZWFjaChhcnIsIGZ1bmN0aW9uICh4LCBpLCBhKSB7XG4gICAgICAgICAgICBtZW1vID0gaXRlcmF0b3IobWVtbywgeCwgaSwgYSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICB9O1xuXG4gICAgdmFyIF9rZXlzID0gZnVuY3Rpb24gKG9iaikge1xuICAgICAgICBpZiAoT2JqZWN0LmtleXMpIHtcbiAgICAgICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhvYmopO1xuICAgICAgICB9XG4gICAgICAgIHZhciBrZXlzID0gW107XG4gICAgICAgIGZvciAodmFyIGsgaW4gb2JqKSB7XG4gICAgICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGspO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBrZXlzO1xuICAgIH07XG5cbiAgICAvLy8vIGV4cG9ydGVkIGFzeW5jIG1vZHVsZSBmdW5jdGlvbnMgLy8vL1xuXG4gICAgLy8vLyBuZXh0VGljayBpbXBsZW1lbnRhdGlvbiB3aXRoIGJyb3dzZXItY29tcGF0aWJsZSBmYWxsYmFjayAvLy8vXG4gICAgaWYgKHR5cGVvZiBwcm9jZXNzID09PSAndW5kZWZpbmVkJyB8fCAhKHByb2Nlc3MubmV4dFRpY2spKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBhc3luYy5uZXh0VGljayA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgICAgIC8vIG5vdCBhIGRpcmVjdCBhbGlhcyBmb3IgSUUxMCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICAgICAgc2V0SW1tZWRpYXRlKGZuKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUgPSBhc3luYy5uZXh0VGljaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGFzeW5jLm5leHRUaWNrID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlID0gYXN5bmMubmV4dFRpY2s7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGFzeW5jLm5leHRUaWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgICAgICAgaWYgKHR5cGVvZiBzZXRJbW1lZGlhdGUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUgPSBzZXRJbW1lZGlhdGU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUgPSBhc3luYy5uZXh0VGljaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jLmVhY2ggPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgaWYgKCFhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY29tcGxldGVkID0gMDtcbiAgICAgICAgX2VhY2goYXJyLCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgaXRlcmF0b3IoeCwgb25seV9vbmNlKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBhc3luYy5mb3JFYWNoID0gYXN5bmMuZWFjaDtcblxuICAgIGFzeW5jLmVhY2hTZXJpZXMgPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgaWYgKCFhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY29tcGxldGVkID0gMDtcbiAgICAgICAgdmFyIGl0ZXJhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihhcnJbY29tcGxldGVkXSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBsZXRlZCArPSAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcGxldGVkID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlcmF0ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGl0ZXJhdGUoKTtcbiAgICB9O1xuICAgIGFzeW5jLmZvckVhY2hTZXJpZXMgPSBhc3luYy5lYWNoU2VyaWVzO1xuXG4gICAgYXN5bmMuZWFjaExpbWl0ID0gZnVuY3Rpb24gKGFyciwgbGltaXQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZm4gPSBfZWFjaExpbWl0KGxpbWl0KTtcbiAgICAgICAgZm4uYXBwbHkobnVsbCwgW2FyciwgaXRlcmF0b3IsIGNhbGxiYWNrXSk7XG4gICAgfTtcbiAgICBhc3luYy5mb3JFYWNoTGltaXQgPSBhc3luYy5lYWNoTGltaXQ7XG5cbiAgICB2YXIgX2VhY2hMaW1pdCA9IGZ1bmN0aW9uIChsaW1pdCkge1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICBpZiAoIWFyci5sZW5ndGggfHwgbGltaXQgPD0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgICAgICAgICB2YXIgc3RhcnRlZCA9IDA7XG4gICAgICAgICAgICB2YXIgcnVubmluZyA9IDA7XG5cbiAgICAgICAgICAgIChmdW5jdGlvbiByZXBsZW5pc2ggKCkge1xuICAgICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB3aGlsZSAocnVubmluZyA8IGxpbWl0ICYmIHN0YXJ0ZWQgPCBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgcnVubmluZyArPSAxO1xuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvcihhcnJbc3RhcnRlZCAtIDFdLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcGxldGVkICs9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcnVubmluZyAtPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwbGVuaXNoKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICB9O1xuICAgIH07XG5cblxuICAgIHZhciBkb1BhcmFsbGVsID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW2FzeW5jLmVhY2hdLmNvbmNhdChhcmdzKSk7XG4gICAgICAgIH07XG4gICAgfTtcbiAgICB2YXIgZG9QYXJhbGxlbExpbWl0ID0gZnVuY3Rpb24obGltaXQsIGZuKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW19lYWNoTGltaXQobGltaXQpXS5jb25jYXQoYXJncykpO1xuICAgICAgICB9O1xuICAgIH07XG4gICAgdmFyIGRvU2VyaWVzID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW2FzeW5jLmVhY2hTZXJpZXNdLmNvbmNhdChhcmdzKSk7XG4gICAgICAgIH07XG4gICAgfTtcblxuXG4gICAgdmFyIF9hc3luY01hcCA9IGZ1bmN0aW9uIChlYWNoZm4sIGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciByZXN1bHRzID0gW107XG4gICAgICAgIGFyciA9IF9tYXAoYXJyLCBmdW5jdGlvbiAoeCwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIHtpbmRleDogaSwgdmFsdWU6IHh9O1xuICAgICAgICB9KTtcbiAgICAgICAgZWFjaGZuKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbiAoZXJyLCB2KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0c1t4LmluZGV4XSA9IHY7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIGFzeW5jLm1hcCA9IGRvUGFyYWxsZWwoX2FzeW5jTWFwKTtcbiAgICBhc3luYy5tYXBTZXJpZXMgPSBkb1NlcmllcyhfYXN5bmNNYXApO1xuICAgIGFzeW5jLm1hcExpbWl0ID0gZnVuY3Rpb24gKGFyciwgbGltaXQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gX21hcExpbWl0KGxpbWl0KShhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIHZhciBfbWFwTGltaXQgPSBmdW5jdGlvbihsaW1pdCkge1xuICAgICAgICByZXR1cm4gZG9QYXJhbGxlbExpbWl0KGxpbWl0LCBfYXN5bmNNYXApO1xuICAgIH07XG5cbiAgICAvLyByZWR1Y2Ugb25seSBoYXMgYSBzZXJpZXMgdmVyc2lvbiwgYXMgZG9pbmcgcmVkdWNlIGluIHBhcmFsbGVsIHdvbid0XG4gICAgLy8gd29yayBpbiBtYW55IHNpdHVhdGlvbnMuXG4gICAgYXN5bmMucmVkdWNlID0gZnVuY3Rpb24gKGFyciwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGFzeW5jLmVhY2hTZXJpZXMoYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKG1lbW8sIHgsIGZ1bmN0aW9uIChlcnIsIHYpIHtcbiAgICAgICAgICAgICAgICBtZW1vID0gdjtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgbWVtbyk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLy8gaW5qZWN0IGFsaWFzXG4gICAgYXN5bmMuaW5qZWN0ID0gYXN5bmMucmVkdWNlO1xuICAgIC8vIGZvbGRsIGFsaWFzXG4gICAgYXN5bmMuZm9sZGwgPSBhc3luYy5yZWR1Y2U7XG5cbiAgICBhc3luYy5yZWR1Y2VSaWdodCA9IGZ1bmN0aW9uIChhcnIsIG1lbW8sIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcmV2ZXJzZWQgPSBfbWFwKGFyciwgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KS5yZXZlcnNlKCk7XG4gICAgICAgIGFzeW5jLnJlZHVjZShyZXZlcnNlZCwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICB9O1xuICAgIC8vIGZvbGRyIGFsaWFzXG4gICAgYXN5bmMuZm9sZHIgPSBhc3luYy5yZWR1Y2VSaWdodDtcblxuICAgIHZhciBfZmlsdGVyID0gZnVuY3Rpb24gKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICAgICAgYXJyID0gX21hcChhcnIsIGZ1bmN0aW9uICh4LCBpKSB7XG4gICAgICAgICAgICByZXR1cm4ge2luZGV4OiBpLCB2YWx1ZTogeH07XG4gICAgICAgIH0pO1xuICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgudmFsdWUsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKF9tYXAocmVzdWx0cy5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEuaW5kZXggLSBiLmluZGV4O1xuICAgICAgICAgICAgfSksIGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHgudmFsdWU7XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgYXN5bmMuZmlsdGVyID0gZG9QYXJhbGxlbChfZmlsdGVyKTtcbiAgICBhc3luYy5maWx0ZXJTZXJpZXMgPSBkb1NlcmllcyhfZmlsdGVyKTtcbiAgICAvLyBzZWxlY3QgYWxpYXNcbiAgICBhc3luYy5zZWxlY3QgPSBhc3luYy5maWx0ZXI7XG4gICAgYXN5bmMuc2VsZWN0U2VyaWVzID0gYXN5bmMuZmlsdGVyU2VyaWVzO1xuXG4gICAgdmFyIF9yZWplY3QgPSBmdW5jdGlvbiAoZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgICAgICBhcnIgPSBfbWFwKGFyciwgZnVuY3Rpb24gKHgsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiB7aW5kZXg6IGksIHZhbHVlOiB4fTtcbiAgICAgICAgfSk7XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKF9tYXAocmVzdWx0cy5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEuaW5kZXggLSBiLmluZGV4O1xuICAgICAgICAgICAgfSksIGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHgudmFsdWU7XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgYXN5bmMucmVqZWN0ID0gZG9QYXJhbGxlbChfcmVqZWN0KTtcbiAgICBhc3luYy5yZWplY3RTZXJpZXMgPSBkb1NlcmllcyhfcmVqZWN0KTtcblxuICAgIHZhciBfZGV0ZWN0ID0gZnVuY3Rpb24gKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgbWFpbl9jYWxsYmFjaykge1xuICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2soeCk7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIG1haW5fY2FsbGJhY2soKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBhc3luYy5kZXRlY3QgPSBkb1BhcmFsbGVsKF9kZXRlY3QpO1xuICAgIGFzeW5jLmRldGVjdFNlcmllcyA9IGRvU2VyaWVzKF9kZXRlY3QpO1xuXG4gICAgYXN5bmMuc29tZSA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgICAgIGFzeW5jLmVhY2goYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIG1haW5fY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8vIGFueSBhbGlhc1xuICAgIGFzeW5jLmFueSA9IGFzeW5jLnNvbWU7XG5cbiAgICBhc3luYy5ldmVyeSA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgICAgIGFzeW5jLmVhY2goYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgaWYgKCF2KSB7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh0cnVlKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvLyBhbGwgYWxpYXNcbiAgICBhc3luYy5hbGwgPSBhc3luYy5ldmVyeTtcblxuICAgIGFzeW5jLnNvcnRCeSA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBhc3luYy5tYXAoYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uIChlcnIsIGNyaXRlcmlhKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwge3ZhbHVlOiB4LCBjcml0ZXJpYTogY3JpdGVyaWF9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGZuID0gZnVuY3Rpb24gKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhID0gbGVmdC5jcml0ZXJpYSwgYiA9IHJpZ2h0LmNyaXRlcmlhO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYSA8IGIgPyAtMSA6IGEgPiBiID8gMSA6IDA7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBfbWFwKHJlc3VsdHMuc29ydChmbiksIGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4LnZhbHVlO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGFzeW5jLmF1dG8gPSBmdW5jdGlvbiAodGFza3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIHZhciBrZXlzID0gX2tleXModGFza3MpO1xuICAgICAgICBpZiAoIWtleXMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmVzdWx0cyA9IHt9O1xuXG4gICAgICAgIHZhciBsaXN0ZW5lcnMgPSBbXTtcbiAgICAgICAgdmFyIGFkZExpc3RlbmVyID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMudW5zaGlmdChmbik7XG4gICAgICAgIH07XG4gICAgICAgIHZhciByZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXJzW2ldID09PSBmbikge1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB2YXIgdGFza0NvbXBsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgX2VhY2gobGlzdGVuZXJzLnNsaWNlKDApLCBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKF9rZXlzKHJlc3VsdHMpLmxlbmd0aCA9PT0ga2V5cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBfZWFjaChrZXlzLCBmdW5jdGlvbiAoaykge1xuICAgICAgICAgICAgdmFyIHRhc2sgPSAodGFza3Nba10gaW5zdGFuY2VvZiBGdW5jdGlvbikgPyBbdGFza3Nba11dOiB0YXNrc1trXTtcbiAgICAgICAgICAgIHZhciB0YXNrQ2FsbGJhY2sgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzYWZlUmVzdWx0cyA9IHt9O1xuICAgICAgICAgICAgICAgICAgICBfZWFjaChfa2V5cyhyZXN1bHRzKSwgZnVuY3Rpb24ocmtleSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2FmZVJlc3VsdHNbcmtleV0gPSByZXN1bHRzW3JrZXldO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2FmZVJlc3VsdHNba10gPSBhcmdzO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHNhZmVSZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RvcCBzdWJzZXF1ZW50IGVycm9ycyBoaXR0aW5nIGNhbGxiYWNrIG11bHRpcGxlIHRpbWVzXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlKHRhc2tDb21wbGV0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHZhciByZXF1aXJlcyA9IHRhc2suc2xpY2UoMCwgTWF0aC5hYnModGFzay5sZW5ndGggLSAxKSkgfHwgW107XG4gICAgICAgICAgICB2YXIgcmVhZHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIF9yZWR1Y2UocmVxdWlyZXMsIGZ1bmN0aW9uIChhLCB4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoYSAmJiByZXN1bHRzLmhhc093blByb3BlcnR5KHgpKTtcbiAgICAgICAgICAgICAgICB9LCB0cnVlKSAmJiAhcmVzdWx0cy5oYXNPd25Qcm9wZXJ0eShrKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAocmVhZHkoKSkge1xuICAgICAgICAgICAgICAgIHRhc2tbdGFzay5sZW5ndGggLSAxXSh0YXNrQ2FsbGJhY2ssIHJlc3VsdHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGxpc3RlbmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVhZHkoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFza1t0YXNrLmxlbmd0aCAtIDFdKHRhc2tDYWxsYmFjaywgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGxpc3RlbmVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGFzeW5jLndhdGVyZmFsbCA9IGZ1bmN0aW9uICh0YXNrcywgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgaWYgKHRhc2tzLmNvbnN0cnVjdG9yICE9PSBBcnJheSkge1xuICAgICAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IHRvIHdhdGVyZmFsbCBtdXN0IGJlIGFuIGFycmF5IG9mIGZ1bmN0aW9ucycpO1xuICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGFza3MubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgd3JhcEl0ZXJhdG9yID0gZnVuY3Rpb24gKGl0ZXJhdG9yKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5leHQgPSBpdGVyYXRvci5uZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzLnB1c2god3JhcEl0ZXJhdG9yKG5leHQpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MucHVzaChjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuICAgICAgICB3cmFwSXRlcmF0b3IoYXN5bmMuaXRlcmF0b3IodGFza3MpKSgpO1xuICAgIH07XG5cbiAgICB2YXIgX3BhcmFsbGVsID0gZnVuY3Rpb24oZWFjaGZuLCB0YXNrcywgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgaWYgKHRhc2tzLmNvbnN0cnVjdG9yID09PSBBcnJheSkge1xuICAgICAgICAgICAgZWFjaGZuLm1hcCh0YXNrcywgZnVuY3Rpb24gKGZuLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgICAgICAgICBmbihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChudWxsLCBlcnIsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0cyA9IHt9O1xuICAgICAgICAgICAgZWFjaGZuLmVhY2goX2tleXModGFza3MpLCBmdW5jdGlvbiAoaywgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICB0YXNrc1trXShmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHNba10gPSBhcmdzO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBhc3luYy5wYXJhbGxlbCA9IGZ1bmN0aW9uICh0YXNrcywgY2FsbGJhY2spIHtcbiAgICAgICAgX3BhcmFsbGVsKHsgbWFwOiBhc3luYy5tYXAsIGVhY2g6IGFzeW5jLmVhY2ggfSwgdGFza3MsIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgYXN5bmMucGFyYWxsZWxMaW1pdCA9IGZ1bmN0aW9uKHRhc2tzLCBsaW1pdCwgY2FsbGJhY2spIHtcbiAgICAgICAgX3BhcmFsbGVsKHsgbWFwOiBfbWFwTGltaXQobGltaXQpLCBlYWNoOiBfZWFjaExpbWl0KGxpbWl0KSB9LCB0YXNrcywgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBhc3luYy5zZXJpZXMgPSBmdW5jdGlvbiAodGFza3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmICh0YXNrcy5jb25zdHJ1Y3RvciA9PT0gQXJyYXkpIHtcbiAgICAgICAgICAgIGFzeW5jLm1hcFNlcmllcyh0YXNrcywgZnVuY3Rpb24gKGZuLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgICAgICAgICBmbihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChudWxsLCBlcnIsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0cyA9IHt9O1xuICAgICAgICAgICAgYXN5bmMuZWFjaFNlcmllcyhfa2V5cyh0YXNrcyksIGZ1bmN0aW9uIChrLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHRhc2tzW2tdKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHRzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGFzeW5jLml0ZXJhdG9yID0gZnVuY3Rpb24gKHRhc2tzKSB7XG4gICAgICAgIHZhciBtYWtlQ2FsbGJhY2sgPSBmdW5jdGlvbiAoaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBmbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAodGFza3MubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhc2tzW2luZGV4XS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZm4ubmV4dCgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGZuLm5leHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChpbmRleCA8IHRhc2tzLmxlbmd0aCAtIDEpID8gbWFrZUNhbGxiYWNrKGluZGV4ICsgMSk6IG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGZuO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gbWFrZUNhbGxiYWNrKDApO1xuICAgIH07XG5cbiAgICBhc3luYy5hcHBseSA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZm4uYXBwbHkoXG4gICAgICAgICAgICAgICAgbnVsbCwgYXJncy5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSlcbiAgICAgICAgICAgICk7XG4gICAgICAgIH07XG4gICAgfTtcblxuICAgIHZhciBfY29uY2F0ID0gZnVuY3Rpb24gKGVhY2hmbiwgYXJyLCBmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHIgPSBbXTtcbiAgICAgICAgZWFjaGZuKGFyciwgZnVuY3Rpb24gKHgsIGNiKSB7XG4gICAgICAgICAgICBmbih4LCBmdW5jdGlvbiAoZXJyLCB5KSB7XG4gICAgICAgICAgICAgICAgciA9IHIuY29uY2F0KHkgfHwgW10pO1xuICAgICAgICAgICAgICAgIGNiKGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCByKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBhc3luYy5jb25jYXQgPSBkb1BhcmFsbGVsKF9jb25jYXQpO1xuICAgIGFzeW5jLmNvbmNhdFNlcmllcyA9IGRvU2VyaWVzKF9jb25jYXQpO1xuXG4gICAgYXN5bmMud2hpbHN0ID0gZnVuY3Rpb24gKHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAodGVzdCgpKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYXN5bmMud2hpbHN0KHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgYXN5bmMuZG9XaGlsc3QgPSBmdW5jdGlvbiAoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKSB7XG4gICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0ZXN0KCkpIHtcbiAgICAgICAgICAgICAgICBhc3luYy5kb1doaWxzdChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGFzeW5jLnVudGlsID0gZnVuY3Rpb24gKHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAoIXRlc3QoKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFzeW5jLnVudGlsKHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgYXN5bmMuZG9VbnRpbCA9IGZ1bmN0aW9uIChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCF0ZXN0KCkpIHtcbiAgICAgICAgICAgICAgICBhc3luYy5kb1VudGlsKGl0ZXJhdG9yLCB0ZXN0LCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgYXN5bmMucXVldWUgPSBmdW5jdGlvbiAod29ya2VyLCBjb25jdXJyZW5jeSkge1xuICAgICAgICBpZiAoY29uY3VycmVuY3kgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uY3VycmVuY3kgPSAxO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIF9pbnNlcnQocSwgZGF0YSwgcG9zLCBjYWxsYmFjaykge1xuICAgICAgICAgIGlmKGRhdGEuY29uc3RydWN0b3IgIT09IEFycmF5KSB7XG4gICAgICAgICAgICAgIGRhdGEgPSBbZGF0YV07XG4gICAgICAgICAgfVxuICAgICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgICAgdmFyIGl0ZW0gPSB7XG4gICAgICAgICAgICAgICAgICBkYXRhOiB0YXNrLFxuICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogbnVsbFxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGlmIChwb3MpIHtcbiAgICAgICAgICAgICAgICBxLnRhc2tzLnVuc2hpZnQoaXRlbSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcS50YXNrcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKHEuc2F0dXJhdGVkICYmIHEudGFza3MubGVuZ3RoID09PSBjb25jdXJyZW5jeSkge1xuICAgICAgICAgICAgICAgICAgcS5zYXR1cmF0ZWQoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUocS5wcm9jZXNzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB3b3JrZXJzID0gMDtcbiAgICAgICAgdmFyIHEgPSB7XG4gICAgICAgICAgICB0YXNrczogW10sXG4gICAgICAgICAgICBjb25jdXJyZW5jeTogY29uY3VycmVuY3ksXG4gICAgICAgICAgICBzYXR1cmF0ZWQ6IG51bGwsXG4gICAgICAgICAgICBlbXB0eTogbnVsbCxcbiAgICAgICAgICAgIGRyYWluOiBudWxsLFxuICAgICAgICAgICAgcHVzaDogZnVuY3Rpb24gKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIF9pbnNlcnQocSwgZGF0YSwgZmFsc2UsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1bnNoaWZ0OiBmdW5jdGlvbiAoZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgX2luc2VydChxLCBkYXRhLCB0cnVlLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvY2VzczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmICh3b3JrZXJzIDwgcS5jb25jdXJyZW5jeSAmJiBxLnRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGFzayA9IHEudGFza3Muc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHEuZW1wdHkgJiYgcS50YXNrcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHEuZW1wdHkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB3b3JrZXJzICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd29ya2VycyAtPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRhc2suY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXNrLmNhbGxiYWNrLmFwcGx5KHRhc2ssIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocS5kcmFpbiAmJiBxLnRhc2tzLmxlbmd0aCArIHdvcmtlcnMgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBxLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBxLnByb2Nlc3MoKTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNiID0gb25seV9vbmNlKG5leHQpO1xuICAgICAgICAgICAgICAgICAgICB3b3JrZXIodGFzay5kYXRhLCBjYik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxlbmd0aDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBxLnRhc2tzLmxlbmd0aDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBydW5uaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdvcmtlcnM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBxO1xuICAgIH07XG5cbiAgICBhc3luYy5jYXJnbyA9IGZ1bmN0aW9uICh3b3JrZXIsIHBheWxvYWQpIHtcbiAgICAgICAgdmFyIHdvcmtpbmcgICAgID0gZmFsc2UsXG4gICAgICAgICAgICB0YXNrcyAgICAgICA9IFtdO1xuXG4gICAgICAgIHZhciBjYXJnbyA9IHtcbiAgICAgICAgICAgIHRhc2tzOiB0YXNrcyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHBheWxvYWQsXG4gICAgICAgICAgICBzYXR1cmF0ZWQ6IG51bGwsXG4gICAgICAgICAgICBlbXB0eTogbnVsbCxcbiAgICAgICAgICAgIGRyYWluOiBudWxsLFxuICAgICAgICAgICAgcHVzaDogZnVuY3Rpb24gKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgaWYoZGF0YS5jb25zdHJ1Y3RvciAhPT0gQXJyYXkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YSA9IFtkYXRhXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgX2VhY2goZGF0YSwgZnVuY3Rpb24odGFzaykge1xuICAgICAgICAgICAgICAgICAgICB0YXNrcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHRhc2ssXG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjazogdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBudWxsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2FyZ28uc2F0dXJhdGVkICYmIHRhc2tzLmxlbmd0aCA9PT0gcGF5bG9hZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FyZ28uc2F0dXJhdGVkKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUoY2FyZ28ucHJvY2Vzcyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvY2VzczogZnVuY3Rpb24gcHJvY2VzcygpIHtcbiAgICAgICAgICAgICAgICBpZiAod29ya2luZykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmICh0YXNrcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYoY2FyZ28uZHJhaW4pIGNhcmdvLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgdHMgPSB0eXBlb2YgcGF5bG9hZCA9PT0gJ251bWJlcidcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IHRhc2tzLnNwbGljZSgwLCBwYXlsb2FkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogdGFza3Muc3BsaWNlKDApO1xuXG4gICAgICAgICAgICAgICAgdmFyIGRzID0gX21hcCh0cywgZnVuY3Rpb24gKHRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRhc2suZGF0YTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGlmKGNhcmdvLmVtcHR5KSBjYXJnby5lbXB0eSgpO1xuICAgICAgICAgICAgICAgIHdvcmtpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHdvcmtlcihkcywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICB3b3JraW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICAgICAgICAgICAgICAgIF9lYWNoKHRzLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhLmNhbGxiYWNrLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbGVuZ3RoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhc2tzLmxlbmd0aDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBydW5uaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdvcmtpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBjYXJnbztcbiAgICB9O1xuXG4gICAgdmFyIF9jb25zb2xlX2ZuID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgZm4uYXBwbHkobnVsbCwgYXJncy5jb25jYXQoW2Z1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29uc29sZS5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChjb25zb2xlW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfZWFjaChhcmdzLCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGVbbmFtZV0oeCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1dKSk7XG4gICAgICAgIH07XG4gICAgfTtcbiAgICBhc3luYy5sb2cgPSBfY29uc29sZV9mbignbG9nJyk7XG4gICAgYXN5bmMuZGlyID0gX2NvbnNvbGVfZm4oJ2RpcicpO1xuICAgIC8qYXN5bmMuaW5mbyA9IF9jb25zb2xlX2ZuKCdpbmZvJyk7XG4gICAgYXN5bmMud2FybiA9IF9jb25zb2xlX2ZuKCd3YXJuJyk7XG4gICAgYXN5bmMuZXJyb3IgPSBfY29uc29sZV9mbignZXJyb3InKTsqL1xuXG4gICAgYXN5bmMubWVtb2l6ZSA9IGZ1bmN0aW9uIChmbiwgaGFzaGVyKSB7XG4gICAgICAgIHZhciBtZW1vID0ge307XG4gICAgICAgIHZhciBxdWV1ZXMgPSB7fTtcbiAgICAgICAgaGFzaGVyID0gaGFzaGVyIHx8IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIG1lbW9pemVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICAgICAgICAgIHZhciBrZXkgPSBoYXNoZXIuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICAgICAgICBpZiAoa2V5IGluIG1lbW8pIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5hcHBseShudWxsLCBtZW1vW2tleV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoa2V5IGluIHF1ZXVlcykge1xuICAgICAgICAgICAgICAgIHF1ZXVlc1trZXldLnB1c2goY2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcXVldWVzW2tleV0gPSBbY2FsbGJhY2tdO1xuICAgICAgICAgICAgICAgIGZuLmFwcGx5KG51bGwsIGFyZ3MuY29uY2F0KFtmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lbW9ba2V5XSA9IGFyZ3VtZW50cztcbiAgICAgICAgICAgICAgICAgICAgdmFyIHEgPSBxdWV1ZXNba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHF1ZXVlc1trZXldO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IHEubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcVtpXS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgbWVtb2l6ZWQubWVtbyA9IG1lbW87XG4gICAgICAgIG1lbW9pemVkLnVubWVtb2l6ZWQgPSBmbjtcbiAgICAgICAgcmV0dXJuIG1lbW9pemVkO1xuICAgIH07XG5cbiAgICBhc3luYy51bm1lbW9pemUgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAoZm4udW5tZW1vaXplZCB8fCBmbikuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfTtcblxuICAgIGFzeW5jLnRpbWVzID0gZnVuY3Rpb24gKGNvdW50LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGNvdW50ZXIgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBjb3VudGVyLnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFzeW5jLm1hcChjb3VudGVyLCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBhc3luYy50aW1lc1NlcmllcyA9IGZ1bmN0aW9uIChjb3VudCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBjb3VudGVyID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICAgICAgY291bnRlci5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhc3luYy5tYXBTZXJpZXMoY291bnRlciwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgYXN5bmMuY29tcG9zZSA9IGZ1bmN0aW9uICgvKiBmdW5jdGlvbnMuLi4gKi8pIHtcbiAgICAgICAgdmFyIGZucyA9IEFycmF5LnByb3RvdHlwZS5yZXZlcnNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB0aGF0ID0gdGhpcztcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgICAgICAgICBhc3luYy5yZWR1Y2UoZm5zLCBhcmdzLCBmdW5jdGlvbiAobmV3YXJncywgZm4sIGNiKSB7XG4gICAgICAgICAgICAgICAgZm4uYXBwbHkodGhhdCwgbmV3YXJncy5jb25jYXQoW2Z1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGVyciA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5leHRhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgY2IoZXJyLCBuZXh0YXJncyk7XG4gICAgICAgICAgICAgICAgfV0pKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5hcHBseSh0aGF0LCBbZXJyXS5jb25jYXQocmVzdWx0cykpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgfTtcblxuICAgIHZhciBfYXBwbHlFYWNoID0gZnVuY3Rpb24gKGVhY2hmbiwgZm5zIC8qYXJncy4uLiovKSB7XG4gICAgICAgIHZhciBnbyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB0aGF0ID0gdGhpcztcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgICAgICAgICByZXR1cm4gZWFjaGZuKGZucywgZnVuY3Rpb24gKGZuLCBjYikge1xuICAgICAgICAgICAgICAgIGZuLmFwcGx5KHRoYXQsIGFyZ3MuY29uY2F0KFtjYl0pKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjYWxsYmFjayk7XG4gICAgICAgIH07XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgICAgICAgICAgcmV0dXJuIGdvLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGdvO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBhc3luYy5hcHBseUVhY2ggPSBkb1BhcmFsbGVsKF9hcHBseUVhY2gpO1xuICAgIGFzeW5jLmFwcGx5RWFjaFNlcmllcyA9IGRvU2VyaWVzKF9hcHBseUVhY2gpO1xuXG4gICAgYXN5bmMuZm9yZXZlciA9IGZ1bmN0aW9uIChmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgZnVuY3Rpb24gbmV4dChlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZuKG5leHQpO1xuICAgICAgICB9XG4gICAgICAgIG5leHQoKTtcbiAgICB9O1xuXG4gICAgLy8gQU1EIC8gUmVxdWlyZUpTXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgIT09ICd1bmRlZmluZWQnICYmIGRlZmluZS5hbWQpIHtcbiAgICAgICAgZGVmaW5lKFtdLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gYXN5bmM7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBOb2RlLmpzXG4gICAgZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBhc3luYztcbiAgICB9XG4gICAgLy8gaW5jbHVkZWQgZGlyZWN0bHkgdmlhIDxzY3JpcHQ+IHRhZ1xuICAgIGVsc2Uge1xuICAgICAgICByb290LmFzeW5jID0gYXN5bmM7XG4gICAgfVxuXG59KCkpO1xuIiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4jIyBjb2cvZGVmYXVsdHNcblxuYGBganNcbnZhciBkZWZhdWx0cyA9IHJlcXVpcmUoJ2NvZy9kZWZhdWx0cycpO1xuYGBgXG5cbiMjIyBkZWZhdWx0cyh0YXJnZXQsICopXG5cblNoYWxsb3cgY29weSBvYmplY3QgcHJvcGVydGllcyBmcm9tIHRoZSBzdXBwbGllZCBzb3VyY2Ugb2JqZWN0cyAoKikgaW50b1xudGhlIHRhcmdldCBvYmplY3QsIHJldHVybmluZyB0aGUgdGFyZ2V0IG9iamVjdCBvbmNlIGNvbXBsZXRlZC4gIERvIG5vdCxcbmhvd2V2ZXIsIG92ZXJ3cml0ZSBleGlzdGluZyBrZXlzIHdpdGggbmV3IHZhbHVlczpcblxuYGBganNcbmRlZmF1bHRzKHsgYTogMSwgYjogMiB9LCB7IGM6IDMgfSwgeyBkOiA0IH0sIHsgYjogNSB9KSk7XG5gYGBcblxuU2VlIGFuIGV4YW1wbGUgb24gW3JlcXVpcmViaW5dKGh0dHA6Ly9yZXF1aXJlYmluLmNvbS8/Z2lzdD02MDc5NDc1KS5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih0YXJnZXQpIHtcbiAgLy8gZW5zdXJlIHdlIGhhdmUgYSB0YXJnZXRcbiAgdGFyZ2V0ID0gdGFyZ2V0IHx8IHt9O1xuXG4gIC8vIGl0ZXJhdGUgdGhyb3VnaCB0aGUgc291cmNlcyBhbmQgY29weSB0byB0aGUgdGFyZ2V0XG4gIFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKS5mb3JFYWNoKGZ1bmN0aW9uKHNvdXJjZSkge1xuICAgIGlmICghIHNvdXJjZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAodmFyIHByb3AgaW4gc291cmNlKSB7XG4gICAgICBpZiAodGFyZ2V0W3Byb3BdID09PSB2b2lkIDApIHtcbiAgICAgICAgdGFyZ2V0W3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHRhcmdldDtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4jIyBjb2cvZXh0ZW5kXG5cbmBgYGpzXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnY29nL2V4dGVuZCcpO1xuYGBgXG5cbiMjIyBleHRlbmQodGFyZ2V0LCAqKVxuXG5TaGFsbG93IGNvcHkgb2JqZWN0IHByb3BlcnRpZXMgZnJvbSB0aGUgc3VwcGxpZWQgc291cmNlIG9iamVjdHMgKCopIGludG9cbnRoZSB0YXJnZXQgb2JqZWN0LCByZXR1cm5pbmcgdGhlIHRhcmdldCBvYmplY3Qgb25jZSBjb21wbGV0ZWQ6XG5cbmBgYGpzXG5leHRlbmQoeyBhOiAxLCBiOiAyIH0sIHsgYzogMyB9LCB7IGQ6IDQgfSwgeyBiOiA1IH0pKTtcbmBgYFxuXG5TZWUgYW4gZXhhbXBsZSBvbiBbcmVxdWlyZWJpbl0oaHR0cDovL3JlcXVpcmViaW4uY29tLz9naXN0PTYwNzk0NzUpLlxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHRhcmdldCkge1xuICBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkuZm9yRWFjaChmdW5jdGlvbihzb3VyY2UpIHtcbiAgICBpZiAoISBzb3VyY2UpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBwcm9wIGluIHNvdXJjZSkge1xuICAgICAgdGFyZ2V0W3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHRhcmdldDtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gICMjIGNvZy9qc29ucGFyc2VcblxuICBgYGBqc1xuICB2YXIganNvbnBhcnNlID0gcmVxdWlyZSgnY29nL2pzb25wYXJzZScpO1xuICBgYGBcblxuICAjIyMganNvbnBhcnNlKGlucHV0KVxuXG4gIFRoaXMgZnVuY3Rpb24gd2lsbCBhdHRlbXB0IHRvIGF1dG9tYXRpY2FsbHkgZGV0ZWN0IHN0cmluZ2lmaWVkIEpTT04sIGFuZFxuICB3aGVuIGRldGVjdGVkIHdpbGwgcGFyc2UgaW50byBKU09OIG9iamVjdHMuICBUaGUgZnVuY3Rpb24gbG9va3MgZm9yIHN0cmluZ3NcbiAgdGhhdCBsb29rIGFuZCBzbWVsbCBsaWtlIHN0cmluZ2lmaWVkIEpTT04sIGFuZCBpZiBmb3VuZCBhdHRlbXB0cyB0b1xuICBgSlNPTi5wYXJzZWAgdGhlIGlucHV0IGludG8gYSB2YWxpZCBvYmplY3QuXG5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihpbnB1dCkge1xuICB2YXIgaXNTdHJpbmcgPSB0eXBlb2YgaW5wdXQgPT0gJ3N0cmluZycgfHwgKGlucHV0IGluc3RhbmNlb2YgU3RyaW5nKTtcbiAgdmFyIHJlTnVtZXJpYyA9IC9eXFwtP1xcZCtcXC4/XFxkKiQvO1xuICB2YXIgc2hvdWxkUGFyc2UgO1xuICB2YXIgZmlyc3RDaGFyO1xuICB2YXIgbGFzdENoYXI7XG5cbiAgaWYgKCghIGlzU3RyaW5nKSB8fCBpbnB1dC5sZW5ndGggPCAyKSB7XG4gICAgaWYgKGlzU3RyaW5nICYmIHJlTnVtZXJpYy50ZXN0KGlucHV0KSkge1xuICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoaW5wdXQpO1xuICAgIH1cblxuICAgIHJldHVybiBpbnB1dDtcbiAgfVxuXG4gIC8vIGNoZWNrIGZvciB0cnVlIG9yIGZhbHNlXG4gIGlmIChpbnB1dCA9PT0gJ3RydWUnIHx8IGlucHV0ID09PSAnZmFsc2UnKSB7XG4gICAgcmV0dXJuIGlucHV0ID09PSAndHJ1ZSc7XG4gIH1cblxuICAvLyBjaGVjayBmb3IgbnVsbFxuICBpZiAoaW5wdXQgPT09ICdudWxsJykge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gZ2V0IHRoZSBmaXJzdCBhbmQgbGFzdCBjaGFyYWN0ZXJzXG4gIGZpcnN0Q2hhciA9IGlucHV0LmNoYXJBdCgwKTtcbiAgbGFzdENoYXIgPSBpbnB1dC5jaGFyQXQoaW5wdXQubGVuZ3RoIC0gMSk7XG5cbiAgLy8gZGV0ZXJtaW5lIHdoZXRoZXIgd2Ugc2hvdWxkIEpTT04ucGFyc2UgdGhlIGlucHV0XG4gIHNob3VsZFBhcnNlID1cbiAgICAoZmlyc3RDaGFyID09ICd7JyAmJiBsYXN0Q2hhciA9PSAnfScpIHx8XG4gICAgKGZpcnN0Q2hhciA9PSAnWycgJiYgbGFzdENoYXIgPT0gJ10nKTtcblxuICBpZiAoc2hvdWxkUGFyc2UpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIEpTT04ucGFyc2UoaW5wdXQpO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgLy8gYXBwYXJlbnRseSBpdCB3YXNuJ3QgdmFsaWQganNvbiwgY2Fycnkgb24gd2l0aCByZWd1bGFyIHByb2Nlc3NpbmdcbiAgICB9XG4gIH1cblxuXG4gIHJldHVybiByZU51bWVyaWMudGVzdChpbnB1dCkgPyBwYXJzZUZsb2F0KGlucHV0KSA6IGlucHV0O1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAgIyMgY29nL2xvZ2dlclxuXG4gIGBgYGpzXG4gIHZhciBsb2dnZXIgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJyk7XG4gIGBgYFxuXG4gIFNpbXBsZSBicm93c2VyIGxvZ2dpbmcgb2ZmZXJpbmcgc2ltaWxhciBmdW5jdGlvbmFsaXR5IHRvIHRoZVxuICBbZGVidWddKGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9kZWJ1ZykgbW9kdWxlLlxuXG4gICMjIyBVc2FnZVxuXG4gIENyZWF0ZSB5b3VyIHNlbGYgYSBuZXcgbG9nZ2luZyBpbnN0YW5jZSBhbmQgZ2l2ZSBpdCBhIG5hbWU6XG5cbiAgYGBganNcbiAgdmFyIGRlYnVnID0gbG9nZ2VyKCdwaGlsJyk7XG4gIGBgYFxuXG4gIE5vdyBkbyBzb21lIGRlYnVnZ2luZzpcblxuICBgYGBqc1xuICBkZWJ1ZygnaGVsbG8nKTtcbiAgYGBgXG5cbiAgQXQgdGhpcyBzdGFnZSwgbm8gbG9nIG91dHB1dCB3aWxsIGJlIGdlbmVyYXRlZCBiZWNhdXNlIHlvdXIgbG9nZ2VyIGlzXG4gIGN1cnJlbnRseSBkaXNhYmxlZC4gIEVuYWJsZSBpdDpcblxuICBgYGBqc1xuICBsb2dnZXIuZW5hYmxlKCdwaGlsJyk7XG4gIGBgYFxuXG4gIE5vdyBkbyBzb21lIG1vcmUgbG9nZ2VyOlxuXG4gIGBgYGpzXG4gIGRlYnVnKCdPaCB0aGlzIGlzIHNvIG11Y2ggbmljZXIgOiknKTtcbiAgLy8gLS0+IHBoaWw6IE9oIHRoaXMgaXMgc29tZSBtdWNoIG5pY2VyIDopXG4gIGBgYFxuXG4gICMjIyBSZWZlcmVuY2VcbioqL1xuXG52YXIgYWN0aXZlID0gW107XG52YXIgdW5sZWFzaExpc3RlbmVycyA9IFtdO1xudmFyIHRhcmdldHMgPSBbIGNvbnNvbGUgXTtcblxuLyoqXG4gICMjIyMgbG9nZ2VyKG5hbWUpXG5cbiAgQ3JlYXRlIGEgbmV3IGxvZ2dpbmcgaW5zdGFuY2UuXG4qKi9cbnZhciBsb2dnZXIgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgLy8gaW5pdGlhbCBlbmFibGVkIGNoZWNrXG4gIHZhciBlbmFibGVkID0gY2hlY2tBY3RpdmUoKTtcblxuICBmdW5jdGlvbiBjaGVja0FjdGl2ZSgpIHtcbiAgICByZXR1cm4gZW5hYmxlZCA9IGFjdGl2ZS5pbmRleE9mKCcqJykgPj0gMCB8fCBhY3RpdmUuaW5kZXhPZihuYW1lKSA+PSAwO1xuICB9XG5cbiAgLy8gcmVnaXN0ZXIgdGhlIGNoZWNrIGFjdGl2ZSB3aXRoIHRoZSBsaXN0ZW5lcnMgYXJyYXlcbiAgdW5sZWFzaExpc3RlbmVyc1t1bmxlYXNoTGlzdGVuZXJzLmxlbmd0aF0gPSBjaGVja0FjdGl2ZTtcblxuICAvLyByZXR1cm4gdGhlIGFjdHVhbCBsb2dnaW5nIGZ1bmN0aW9uXG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblxuICAgIC8vIGlmIHdlIGhhdmUgYSBzdHJpbmcgbWVzc2FnZVxuICAgIGlmICh0eXBlb2YgYXJnc1swXSA9PSAnc3RyaW5nJyB8fCAoYXJnc1swXSBpbnN0YW5jZW9mIFN0cmluZykpIHtcbiAgICAgIGFyZ3NbMF0gPSBuYW1lICsgJzogJyArIGFyZ3NbMF07XG4gICAgfVxuXG4gICAgLy8gaWYgbm90IGVuYWJsZWQsIGJhaWxcbiAgICBpZiAoISBlbmFibGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gbG9nXG4gICAgdGFyZ2V0cy5mb3JFYWNoKGZ1bmN0aW9uKHRhcmdldCkge1xuICAgICAgdGFyZ2V0LmxvZy5hcHBseSh0YXJnZXQsIGFyZ3MpO1xuICAgIH0pO1xuICB9O1xufTtcblxuLyoqXG4gICMjIyMgbG9nZ2VyLnJlc2V0KClcblxuICBSZXNldCBsb2dnaW5nIChyZW1vdmUgdGhlIGRlZmF1bHQgY29uc29sZSBsb2dnZXIsIGZsYWcgYWxsIGxvZ2dlcnMgYXNcbiAgaW5hY3RpdmUsIGV0YywgZXRjLlxuKiovXG5sb2dnZXIucmVzZXQgPSBmdW5jdGlvbigpIHtcbiAgLy8gcmVzZXQgdGFyZ2V0cyBhbmQgYWN0aXZlIHN0YXRlc1xuICB0YXJnZXRzID0gW107XG4gIGFjdGl2ZSA9IFtdO1xuXG4gIHJldHVybiBsb2dnZXIuZW5hYmxlKCk7XG59O1xuXG4vKipcbiAgIyMjIyBsb2dnZXIudG8odGFyZ2V0KVxuXG4gIEFkZCBhIGxvZ2dpbmcgdGFyZ2V0LiAgVGhlIGxvZ2dlciBtdXN0IGhhdmUgYSBgbG9nYCBtZXRob2QgYXR0YWNoZWQuXG5cbioqL1xubG9nZ2VyLnRvID0gZnVuY3Rpb24odGFyZ2V0KSB7XG4gIHRhcmdldHMgPSB0YXJnZXRzLmNvbmNhdCh0YXJnZXQgfHwgW10pO1xuXG4gIHJldHVybiBsb2dnZXI7XG59O1xuXG4vKipcbiAgIyMjIyBsb2dnZXIuZW5hYmxlKG5hbWVzKilcblxuICBFbmFibGUgbG9nZ2luZyB2aWEgdGhlIG5hbWVkIGxvZ2dpbmcgaW5zdGFuY2VzLiAgVG8gZW5hYmxlIGxvZ2dpbmcgdmlhIGFsbFxuICBpbnN0YW5jZXMsIHlvdSBjYW4gcGFzcyBhIHdpbGRjYXJkOlxuXG4gIGBgYGpzXG4gIGxvZ2dlci5lbmFibGUoJyonKTtcbiAgYGBgXG5cbiAgX19UT0RPOl9fIHdpbGRjYXJkIGVuYWJsZXJzXG4qKi9cbmxvZ2dlci5lbmFibGUgPSBmdW5jdGlvbigpIHtcbiAgLy8gdXBkYXRlIHRoZSBhY3RpdmVcbiAgYWN0aXZlID0gYWN0aXZlLmNvbmNhdChbXS5zbGljZS5jYWxsKGFyZ3VtZW50cykpO1xuXG4gIC8vIHRyaWdnZXIgdGhlIHVubGVhc2ggbGlzdGVuZXJzXG4gIHVubGVhc2hMaXN0ZW5lcnMuZm9yRWFjaChmdW5jdGlvbihsaXN0ZW5lcikge1xuICAgIGxpc3RlbmVyKCk7XG4gIH0pO1xuXG4gIHJldHVybiBsb2dnZXI7XG59OyIsIi8vIENvcHlyaWdodCAoYykgMjAxMyBBZG9iZSBTeXN0ZW1zIEluY29ycG9yYXRlZC4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbi8vIFxuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy8gXG4vLyBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vIFxuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8vIOKUjOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUkCBcXFxcXG4vLyDilIIgRXZlIDAuNC4yIC0gSmF2YVNjcmlwdCBFdmVudHMgTGlicmFyeSAgICAgICAgICAgICAgICAgICAgICDilIIgXFxcXFxuLy8g4pSc4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSkIFxcXFxcbi8vIOKUgiBBdXRob3IgRG1pdHJ5IEJhcmFub3Zza2l5IChodHRwOi8vZG1pdHJ5LmJhcmFub3Zza2l5LmNvbS8pIOKUgiBcXFxcXG4vLyDilJTilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilJggXFxcXFxuXG4oZnVuY3Rpb24gKGdsb2IpIHtcbiAgICB2YXIgdmVyc2lvbiA9IFwiMC40LjJcIixcbiAgICAgICAgaGFzID0gXCJoYXNPd25Qcm9wZXJ0eVwiLFxuICAgICAgICBzZXBhcmF0b3IgPSAvW1xcLlxcL10vLFxuICAgICAgICB3aWxkY2FyZCA9IFwiKlwiLFxuICAgICAgICBmdW4gPSBmdW5jdGlvbiAoKSB7fSxcbiAgICAgICAgbnVtc29ydCA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYSAtIGI7XG4gICAgICAgIH0sXG4gICAgICAgIGN1cnJlbnRfZXZlbnQsXG4gICAgICAgIHN0b3AsXG4gICAgICAgIGV2ZW50cyA9IHtuOiB7fX0sXG4gICAgLypcXFxuICAgICAqIGV2ZVxuICAgICBbIG1ldGhvZCBdXG5cbiAgICAgKiBGaXJlcyBldmVudCB3aXRoIGdpdmVuIGBuYW1lYCwgZ2l2ZW4gc2NvcGUgYW5kIG90aGVyIHBhcmFtZXRlcnMuXG5cbiAgICAgPiBBcmd1bWVudHNcblxuICAgICAtIG5hbWUgKHN0cmluZykgbmFtZSBvZiB0aGUgKmV2ZW50KiwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZFxuICAgICAtIHNjb3BlIChvYmplY3QpIGNvbnRleHQgZm9yIHRoZSBldmVudCBoYW5kbGVyc1xuICAgICAtIHZhcmFyZ3MgKC4uLikgdGhlIHJlc3Qgb2YgYXJndW1lbnRzIHdpbGwgYmUgc2VudCB0byBldmVudCBoYW5kbGVyc1xuXG4gICAgID0gKG9iamVjdCkgYXJyYXkgb2YgcmV0dXJuZWQgdmFsdWVzIGZyb20gdGhlIGxpc3RlbmVyc1xuICAgIFxcKi9cbiAgICAgICAgZXZlID0gZnVuY3Rpb24gKG5hbWUsIHNjb3BlKSB7XG5cdFx0XHRuYW1lID0gU3RyaW5nKG5hbWUpO1xuICAgICAgICAgICAgdmFyIGUgPSBldmVudHMsXG4gICAgICAgICAgICAgICAgb2xkc3RvcCA9IHN0b3AsXG4gICAgICAgICAgICAgICAgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMiksXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzID0gZXZlLmxpc3RlbmVycyhuYW1lKSxcbiAgICAgICAgICAgICAgICB6ID0gMCxcbiAgICAgICAgICAgICAgICBmID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgbCxcbiAgICAgICAgICAgICAgICBpbmRleGVkID0gW10sXG4gICAgICAgICAgICAgICAgcXVldWUgPSB7fSxcbiAgICAgICAgICAgICAgICBvdXQgPSBbXSxcbiAgICAgICAgICAgICAgICBjZSA9IGN1cnJlbnRfZXZlbnQsXG4gICAgICAgICAgICAgICAgZXJyb3JzID0gW107XG4gICAgICAgICAgICBjdXJyZW50X2V2ZW50ID0gbmFtZTtcbiAgICAgICAgICAgIHN0b3AgPSAwO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGlpID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGlpOyBpKyspIGlmIChcInpJbmRleFwiIGluIGxpc3RlbmVyc1tpXSkge1xuICAgICAgICAgICAgICAgIGluZGV4ZWQucHVzaChsaXN0ZW5lcnNbaV0uekluZGV4KTtcbiAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXJzW2ldLnpJbmRleCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcXVldWVbbGlzdGVuZXJzW2ldLnpJbmRleF0gPSBsaXN0ZW5lcnNbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaW5kZXhlZC5zb3J0KG51bXNvcnQpO1xuICAgICAgICAgICAgd2hpbGUgKGluZGV4ZWRbel0gPCAwKSB7XG4gICAgICAgICAgICAgICAgbCA9IHF1ZXVlW2luZGV4ZWRbeisrXV07XG4gICAgICAgICAgICAgICAgb3V0LnB1c2gobC5hcHBseShzY29wZSwgYXJncykpO1xuICAgICAgICAgICAgICAgIGlmIChzdG9wKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0b3AgPSBvbGRzdG9wO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbCA9IGxpc3RlbmVyc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAoXCJ6SW5kZXhcIiBpbiBsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsLnpJbmRleCA9PSBpbmRleGVkW3pdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXQucHVzaChsLmFwcGx5KHNjb3BlLCBhcmdzKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RvcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHorKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsID0gcXVldWVbaW5kZXhlZFt6XV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbCAmJiBvdXQucHVzaChsLmFwcGx5KHNjb3BlLCBhcmdzKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0b3ApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSB3aGlsZSAobClcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXVlW2wuekluZGV4XSA9IGw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBvdXQucHVzaChsLmFwcGx5KHNjb3BlLCBhcmdzKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdG9wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0b3AgPSBvbGRzdG9wO1xuICAgICAgICAgICAgY3VycmVudF9ldmVudCA9IGNlO1xuICAgICAgICAgICAgcmV0dXJuIG91dC5sZW5ndGggPyBvdXQgOiBudWxsO1xuICAgICAgICB9O1xuXHRcdC8vIFVuZG9jdW1lbnRlZC4gRGVidWcgb25seS5cblx0XHRldmUuX2V2ZW50cyA9IGV2ZW50cztcbiAgICAvKlxcXG4gICAgICogZXZlLmxpc3RlbmVyc1xuICAgICBbIG1ldGhvZCBdXG5cbiAgICAgKiBJbnRlcm5hbCBtZXRob2Qgd2hpY2ggZ2l2ZXMgeW91IGFycmF5IG9mIGFsbCBldmVudCBoYW5kbGVycyB0aGF0IHdpbGwgYmUgdHJpZ2dlcmVkIGJ5IHRoZSBnaXZlbiBgbmFtZWAuXG5cbiAgICAgPiBBcmd1bWVudHNcblxuICAgICAtIG5hbWUgKHN0cmluZykgbmFtZSBvZiB0aGUgZXZlbnQsIGRvdCAoYC5gKSBvciBzbGFzaCAoYC9gKSBzZXBhcmF0ZWRcblxuICAgICA9IChhcnJheSkgYXJyYXkgb2YgZXZlbnQgaGFuZGxlcnNcbiAgICBcXCovXG4gICAgZXZlLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoc2VwYXJhdG9yKSxcbiAgICAgICAgICAgIGUgPSBldmVudHMsXG4gICAgICAgICAgICBpdGVtLFxuICAgICAgICAgICAgaXRlbXMsXG4gICAgICAgICAgICBrLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIGlpLFxuICAgICAgICAgICAgaixcbiAgICAgICAgICAgIGpqLFxuICAgICAgICAgICAgbmVzLFxuICAgICAgICAgICAgZXMgPSBbZV0sXG4gICAgICAgICAgICBvdXQgPSBbXTtcbiAgICAgICAgZm9yIChpID0gMCwgaWkgPSBuYW1lcy5sZW5ndGg7IGkgPCBpaTsgaSsrKSB7XG4gICAgICAgICAgICBuZXMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoaiA9IDAsIGpqID0gZXMubGVuZ3RoOyBqIDwgamo7IGorKykge1xuICAgICAgICAgICAgICAgIGUgPSBlc1tqXS5uO1xuICAgICAgICAgICAgICAgIGl0ZW1zID0gW2VbbmFtZXNbaV1dLCBlW3dpbGRjYXJkXV07XG4gICAgICAgICAgICAgICAgayA9IDI7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGstLSkge1xuICAgICAgICAgICAgICAgICAgICBpdGVtID0gaXRlbXNba107XG4gICAgICAgICAgICAgICAgICAgIGlmIChpdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXMucHVzaChpdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dCA9IG91dC5jb25jYXQoaXRlbS5mIHx8IFtdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVzID0gbmVzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfTtcbiAgICBcbiAgICAvKlxcXG4gICAgICogZXZlLm9uXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBCaW5kcyBnaXZlbiBldmVudCBoYW5kbGVyIHdpdGggYSBnaXZlbiBuYW1lLiBZb3UgY2FuIHVzZSB3aWxkY2FyZHMg4oCcYCpg4oCdIGZvciB0aGUgbmFtZXM6XG4gICAgIHwgZXZlLm9uKFwiKi51bmRlci4qXCIsIGYpO1xuICAgICB8IGV2ZShcIm1vdXNlLnVuZGVyLmZsb29yXCIpOyAvLyB0cmlnZ2VycyBmXG4gICAgICogVXNlIEBldmUgdG8gdHJpZ2dlciB0aGUgbGlzdGVuZXIuXG4gICAgICoqXG4gICAgID4gQXJndW1lbnRzXG4gICAgICoqXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZCwgd2l0aCBvcHRpb25hbCB3aWxkY2FyZHNcbiAgICAgLSBmIChmdW5jdGlvbikgZXZlbnQgaGFuZGxlciBmdW5jdGlvblxuICAgICAqKlxuICAgICA9IChmdW5jdGlvbikgcmV0dXJuZWQgZnVuY3Rpb24gYWNjZXB0cyBhIHNpbmdsZSBudW1lcmljIHBhcmFtZXRlciB0aGF0IHJlcHJlc2VudHMgei1pbmRleCBvZiB0aGUgaGFuZGxlci4gSXQgaXMgYW4gb3B0aW9uYWwgZmVhdHVyZSBhbmQgb25seSB1c2VkIHdoZW4geW91IG5lZWQgdG8gZW5zdXJlIHRoYXQgc29tZSBzdWJzZXQgb2YgaGFuZGxlcnMgd2lsbCBiZSBpbnZva2VkIGluIGEgZ2l2ZW4gb3JkZXIsIGRlc3BpdGUgb2YgdGhlIG9yZGVyIG9mIGFzc2lnbm1lbnQuIFxuICAgICA+IEV4YW1wbGU6XG4gICAgIHwgZXZlLm9uKFwibW91c2VcIiwgZWF0SXQpKDIpO1xuICAgICB8IGV2ZS5vbihcIm1vdXNlXCIsIHNjcmVhbSk7XG4gICAgIHwgZXZlLm9uKFwibW91c2VcIiwgY2F0Y2hJdCkoMSk7XG4gICAgICogVGhpcyB3aWxsIGVuc3VyZSB0aGF0IGBjYXRjaEl0KClgIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGJlZm9yZSBgZWF0SXQoKWAuXG5cdCAqXG4gICAgICogSWYgeW91IHdhbnQgdG8gcHV0IHlvdXIgaGFuZGxlciBiZWZvcmUgbm9uLWluZGV4ZWQgaGFuZGxlcnMsIHNwZWNpZnkgYSBuZWdhdGl2ZSB2YWx1ZS5cbiAgICAgKiBOb3RlOiBJIGFzc3VtZSBtb3N0IG9mIHRoZSB0aW1lIHlvdSBkb27igJl0IG5lZWQgdG8gd29ycnkgYWJvdXQgei1pbmRleCwgYnV0IGl04oCZcyBuaWNlIHRvIGhhdmUgdGhpcyBmZWF0dXJlIOKAnGp1c3QgaW4gY2FzZeKAnS5cbiAgICBcXCovXG4gICAgZXZlLm9uID0gZnVuY3Rpb24gKG5hbWUsIGYpIHtcblx0XHRuYW1lID0gU3RyaW5nKG5hbWUpO1xuXHRcdGlmICh0eXBlb2YgZiAhPSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdHJldHVybiBmdW5jdGlvbiAoKSB7fTtcblx0XHR9XG4gICAgICAgIHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoc2VwYXJhdG9yKSxcbiAgICAgICAgICAgIGUgPSBldmVudHM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBpaSA9IG5hbWVzLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIGUgPSBlLm47XG4gICAgICAgICAgICBlID0gZS5oYXNPd25Qcm9wZXJ0eShuYW1lc1tpXSkgJiYgZVtuYW1lc1tpXV0gfHwgKGVbbmFtZXNbaV1dID0ge246IHt9fSk7XG4gICAgICAgIH1cbiAgICAgICAgZS5mID0gZS5mIHx8IFtdO1xuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IGUuZi5sZW5ndGg7IGkgPCBpaTsgaSsrKSBpZiAoZS5mW2ldID09IGYpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW47XG4gICAgICAgIH1cbiAgICAgICAgZS5mLnB1c2goZik7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoekluZGV4KSB7XG4gICAgICAgICAgICBpZiAoK3pJbmRleCA9PSArekluZGV4KSB7XG4gICAgICAgICAgICAgICAgZi56SW5kZXggPSArekluZGV4O1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5mXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBSZXR1cm5zIGZ1bmN0aW9uIHRoYXQgd2lsbCBmaXJlIGdpdmVuIGV2ZW50IHdpdGggb3B0aW9uYWwgYXJndW1lbnRzLlxuXHQgKiBBcmd1bWVudHMgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byB0aGUgcmVzdWx0IGZ1bmN0aW9uIHdpbGwgYmUgYWxzb1xuXHQgKiBjb25jYXRlZCB0byB0aGUgbGlzdCBvZiBmaW5hbCBhcmd1bWVudHMuXG4gXHQgfCBlbC5vbmNsaWNrID0gZXZlLmYoXCJjbGlja1wiLCAxLCAyKTtcbiBcdCB8IGV2ZS5vbihcImNsaWNrXCIsIGZ1bmN0aW9uIChhLCBiLCBjKSB7XG4gXHQgfCAgICAgY29uc29sZS5sb2coYSwgYiwgYyk7IC8vIDEsIDIsIFtldmVudCBvYmplY3RdXG4gXHQgfCB9KTtcbiAgICAgPiBBcmd1bWVudHNcblx0IC0gZXZlbnQgKHN0cmluZykgZXZlbnQgbmFtZVxuXHQgLSB2YXJhcmdzICjigKYpIGFuZCBhbnkgb3RoZXIgYXJndW1lbnRzXG5cdCA9IChmdW5jdGlvbikgcG9zc2libGUgZXZlbnQgaGFuZGxlciBmdW5jdGlvblxuICAgIFxcKi9cblx0ZXZlLmYgPSBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHR2YXIgYXR0cnMgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0XHRcdGV2ZS5hcHBseShudWxsLCBbZXZlbnQsIG51bGxdLmNvbmNhdChhdHRycykuY29uY2F0KFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKSkpO1xuXHRcdH07XG5cdH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5zdG9wXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBJcyB1c2VkIGluc2lkZSBhbiBldmVudCBoYW5kbGVyIHRvIHN0b3AgdGhlIGV2ZW50LCBwcmV2ZW50aW5nIGFueSBzdWJzZXF1ZW50IGxpc3RlbmVycyBmcm9tIGZpcmluZy5cbiAgICBcXCovXG4gICAgZXZlLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHN0b3AgPSAxO1xuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5udFxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogQ291bGQgYmUgdXNlZCBpbnNpZGUgZXZlbnQgaGFuZGxlciB0byBmaWd1cmUgb3V0IGFjdHVhbCBuYW1lIG9mIHRoZSBldmVudC5cbiAgICAgKipcbiAgICAgPiBBcmd1bWVudHNcbiAgICAgKipcbiAgICAgLSBzdWJuYW1lIChzdHJpbmcpICNvcHRpb25hbCBzdWJuYW1lIG9mIHRoZSBldmVudFxuICAgICAqKlxuICAgICA9IChzdHJpbmcpIG5hbWUgb2YgdGhlIGV2ZW50LCBpZiBgc3VibmFtZWAgaXMgbm90IHNwZWNpZmllZFxuICAgICAqIG9yXG4gICAgID0gKGJvb2xlYW4pIGB0cnVlYCwgaWYgY3VycmVudCBldmVudOKAmXMgbmFtZSBjb250YWlucyBgc3VibmFtZWBcbiAgICBcXCovXG4gICAgZXZlLm50ID0gZnVuY3Rpb24gKHN1Ym5hbWUpIHtcbiAgICAgICAgaWYgKHN1Ym5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUmVnRXhwKFwiKD86XFxcXC58XFxcXC98XilcIiArIHN1Ym5hbWUgKyBcIig/OlxcXFwufFxcXFwvfCQpXCIpLnRlc3QoY3VycmVudF9ldmVudCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGN1cnJlbnRfZXZlbnQ7XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLm50c1xuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogQ291bGQgYmUgdXNlZCBpbnNpZGUgZXZlbnQgaGFuZGxlciB0byBmaWd1cmUgb3V0IGFjdHVhbCBuYW1lIG9mIHRoZSBldmVudC5cbiAgICAgKipcbiAgICAgKipcbiAgICAgPSAoYXJyYXkpIG5hbWVzIG9mIHRoZSBldmVudFxuICAgIFxcKi9cbiAgICBldmUubnRzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY3VycmVudF9ldmVudC5zcGxpdChzZXBhcmF0b3IpO1xuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5vZmZcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIFJlbW92ZXMgZ2l2ZW4gZnVuY3Rpb24gZnJvbSB0aGUgbGlzdCBvZiBldmVudCBsaXN0ZW5lcnMgYXNzaWduZWQgdG8gZ2l2ZW4gbmFtZS5cblx0ICogSWYgbm8gYXJndW1lbnRzIHNwZWNpZmllZCBhbGwgdGhlIGV2ZW50cyB3aWxsIGJlIGNsZWFyZWQuXG4gICAgICoqXG4gICAgID4gQXJndW1lbnRzXG4gICAgICoqXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZCwgd2l0aCBvcHRpb25hbCB3aWxkY2FyZHNcbiAgICAgLSBmIChmdW5jdGlvbikgZXZlbnQgaGFuZGxlciBmdW5jdGlvblxuICAgIFxcKi9cbiAgICAvKlxcXG4gICAgICogZXZlLnVuYmluZFxuICAgICBbIG1ldGhvZCBdXG4gICAgICoqXG4gICAgICogU2VlIEBldmUub2ZmXG4gICAgXFwqL1xuICAgIGV2ZS5vZmYgPSBldmUudW5iaW5kID0gZnVuY3Rpb24gKG5hbWUsIGYpIHtcblx0XHRpZiAoIW5hbWUpIHtcblx0XHQgICAgZXZlLl9ldmVudHMgPSBldmVudHMgPSB7bjoge319O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cbiAgICAgICAgdmFyIG5hbWVzID0gbmFtZS5zcGxpdChzZXBhcmF0b3IpLFxuICAgICAgICAgICAgZSxcbiAgICAgICAgICAgIGtleSxcbiAgICAgICAgICAgIHNwbGljZSxcbiAgICAgICAgICAgIGksIGlpLCBqLCBqaixcbiAgICAgICAgICAgIGN1ciA9IFtldmVudHNdO1xuICAgICAgICBmb3IgKGkgPSAwLCBpaSA9IG5hbWVzLmxlbmd0aDsgaSA8IGlpOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBjdXIubGVuZ3RoOyBqICs9IHNwbGljZS5sZW5ndGggLSAyKSB7XG4gICAgICAgICAgICAgICAgc3BsaWNlID0gW2osIDFdO1xuICAgICAgICAgICAgICAgIGUgPSBjdXJbal0ubjtcbiAgICAgICAgICAgICAgICBpZiAobmFtZXNbaV0gIT0gd2lsZGNhcmQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVbbmFtZXNbaV1dKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzcGxpY2UucHVzaChlW25hbWVzW2ldXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGtleSBpbiBlKSBpZiAoZVtoYXNdKGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNwbGljZS5wdXNoKGVba2V5XSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY3VyLnNwbGljZS5hcHBseShjdXIsIHNwbGljZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMCwgaWkgPSBjdXIubGVuZ3RoOyBpIDwgaWk7IGkrKykge1xuICAgICAgICAgICAgZSA9IGN1cltpXTtcbiAgICAgICAgICAgIHdoaWxlIChlLm4pIHtcbiAgICAgICAgICAgICAgICBpZiAoZikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZS5mKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSAwLCBqaiA9IGUuZi5sZW5ndGg7IGogPCBqajsgaisrKSBpZiAoZS5mW2pdID09IGYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLmYuc3BsaWNlKGosIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgIWUuZi5sZW5ndGggJiYgZGVsZXRlIGUuZjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBmb3IgKGtleSBpbiBlLm4pIGlmIChlLm5baGFzXShrZXkpICYmIGUubltrZXldLmYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBmdW5jcyA9IGUubltrZXldLmY7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSAwLCBqaiA9IGZ1bmNzLmxlbmd0aDsgaiA8IGpqOyBqKyspIGlmIChmdW5jc1tqXSA9PSBmKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Muc3BsaWNlKGosIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgIWZ1bmNzLmxlbmd0aCAmJiBkZWxldGUgZS5uW2tleV0uZjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBlLmY7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoa2V5IGluIGUubikgaWYgKGUubltoYXNdKGtleSkgJiYgZS5uW2tleV0uZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGUubltrZXldLmY7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZSA9IGUubjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgLypcXFxuICAgICAqIGV2ZS5vbmNlXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKipcbiAgICAgKiBCaW5kcyBnaXZlbiBldmVudCBoYW5kbGVyIHdpdGggYSBnaXZlbiBuYW1lIHRvIG9ubHkgcnVuIG9uY2UgdGhlbiB1bmJpbmQgaXRzZWxmLlxuICAgICB8IGV2ZS5vbmNlKFwibG9naW5cIiwgZik7XG4gICAgIHwgZXZlKFwibG9naW5cIik7IC8vIHRyaWdnZXJzIGZcbiAgICAgfCBldmUoXCJsb2dpblwiKTsgLy8gbm8gbGlzdGVuZXJzXG4gICAgICogVXNlIEBldmUgdG8gdHJpZ2dlciB0aGUgbGlzdGVuZXIuXG4gICAgICoqXG4gICAgID4gQXJndW1lbnRzXG4gICAgICoqXG4gICAgIC0gbmFtZSAoc3RyaW5nKSBuYW1lIG9mIHRoZSBldmVudCwgZG90IChgLmApIG9yIHNsYXNoIChgL2ApIHNlcGFyYXRlZCwgd2l0aCBvcHRpb25hbCB3aWxkY2FyZHNcbiAgICAgLSBmIChmdW5jdGlvbikgZXZlbnQgaGFuZGxlciBmdW5jdGlvblxuICAgICAqKlxuICAgICA9IChmdW5jdGlvbikgc2FtZSByZXR1cm4gZnVuY3Rpb24gYXMgQGV2ZS5vblxuICAgIFxcKi9cbiAgICBldmUub25jZSA9IGZ1bmN0aW9uIChuYW1lLCBmKSB7XG4gICAgICAgIHZhciBmMiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGV2ZS51bmJpbmQobmFtZSwgZjIpO1xuICAgICAgICAgICAgcmV0dXJuIGYuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGV2ZS5vbihuYW1lLCBmMik7XG4gICAgfTtcbiAgICAvKlxcXG4gICAgICogZXZlLnZlcnNpb25cbiAgICAgWyBwcm9wZXJ0eSAoc3RyaW5nKSBdXG4gICAgICoqXG4gICAgICogQ3VycmVudCB2ZXJzaW9uIG9mIHRoZSBsaWJyYXJ5LlxuICAgIFxcKi9cbiAgICBldmUudmVyc2lvbiA9IHZlcnNpb247XG4gICAgZXZlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gXCJZb3UgYXJlIHJ1bm5pbmcgRXZlIFwiICsgdmVyc2lvbjtcbiAgICB9O1xuICAgICh0eXBlb2YgbW9kdWxlICE9IFwidW5kZWZpbmVkXCIgJiYgbW9kdWxlLmV4cG9ydHMpID8gKG1vZHVsZS5leHBvcnRzID0gZXZlKSA6ICh0eXBlb2YgZGVmaW5lICE9IFwidW5kZWZpbmVkXCIgPyAoZGVmaW5lKFwiZXZlXCIsIFtdLCBmdW5jdGlvbigpIHsgcmV0dXJuIGV2ZTsgfSkpIDogKGdsb2IuZXZlID0gZXZlKSk7XG59KSh0aGlzKTtcbiIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBxc2EgPSByZXF1aXJlKCcuL3FzYScpO1xudmFyIHJlQm9vbCA9IC9eKHRydWV8ZmFsc2UpJC9pXG5cbi8qKlxuICAjIyMgbWV0YShyZWdleD8pXG5cbiAgRmluZCBhbGwgdGhlIGA8bWV0YT5gIHRhZ3MgdGhhdCBoYXZlIGEgbmFtZSBhdHRyaWJ1dGUgYW5kIGNvbGxhdGUgYXMgYVxuICBzaW1wbGUgSlMgb2JqZWN0cyB3aGV0aGVyIHRoZSBjb250ZW50IG9mIHRoZSB0YWcgaXMgdGhlIHZhbHVlLlxuXG4gIDw8PCBleGFtcGxlcy9tZXRhLmpzXG5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihyZWdleCkge1xuICB2YXIgZGF0YSA9IHt9O1xuXG4gIC8vIGZpbmQgYWxsIHRoZSBtZXRhIHRhZ3Mgd2l0aCBhIG5hbWUgYW5kIGV4dHJhY3QgdGhlIGNvbnRlbnRcbiAgcXNhKCdtZXRhW25hbWVdJykuZm9yRWFjaChmdW5jdGlvbih0YWcpIHtcbiAgICB2YXIgbmFtZSA9IHRhZy5nZXRBdHRyaWJ1dGUoJ25hbWUnKTtcbiAgICB2YXIgbWF0Y2ggPSByZWdleCA/IHJlZ2V4LmV4ZWMobmFtZSkgOiBbbmFtZSwgbmFtZV07XG5cbiAgICBpZiAobWF0Y2gpIHtcbiAgICAgIGRhdGFbbWF0Y2hbMV0gfHwgbWF0Y2hbMF1dID0gY29lcmNlKHRhZy5nZXRBdHRyaWJ1dGUoJ2NvbnRlbnQnKSB8fCAnJyk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gZGF0YTtcbn07XG5cbmZ1bmN0aW9uIGNvZXJjZSh2YWx1ZSkge1xuICB2YWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpIHx8IHZhbHVlO1xuXG4gIGlmIChyZUJvb2wudGVzdCh2YWx1ZSkpIHtcbiAgICB2YWx1ZSA9IHZhbHVlID09ICd0cnVlJztcbiAgfVxuXG4gIHJldHVybiB2YWx1ZTtcbn0iLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAgIyMjIG9uXG5cbiAgYGBgXG4gIGYobmFtZSwgPT4gZWwsID0+IGNiKVxuICBgYGBcblxuICBUaGUgYG9uYCBoZWxwZXIgYXNzaXN0cyB3aXRoIHdvcmtpbmcgd2l0aCBET00gZXZlbnRzIGFuZCBiZWluZyBhYmxlIHRvIG1hcFxuICB0aG9zZSB0byBhIG5vZGUgY2FsbGJhY2sgc3R5bGUgZnVuY3Rpb24gaW4gdGhlIGZvcm06XG5cbiAgYGBganNcbiAgZnVuY3Rpb24oZXJyLCBldnQpIHtcbiAgfVxuICBgYGBcblxuICBXaGVuIHRoZSBldmVudCBpcyB0cmlnZ2VyZWQgYnkgdGhlIGBlbGAgdGhlIGNhbGxiYWNrIGlzIGZpcmVkIHBhc3NpbmdcbiAgYSBudWxsIHZhbHVlIHRvIHRoZSBgZXJyYCBhcmd1bWVudC5cblxuICA8PDwgZXhhbXBsZXMvb24uanNcbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihuYW1lLCBlbCwgY2FsbGJhY2spIHtcbiAgZnVuY3Rpb24gYmluZCh0LCB0cmlnZ2VyKSB7XG4gICAgdmFyIGJ1ZmZlcmVkID0gW107XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVFdmVudChldnQpIHtcbiAgICAgIGlmICh0eXBlb2YgdHJpZ2dlciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiB0cmlnZ2VyKG51bGwsIGV2dCk7XG4gICAgICB9XG5cbiAgICAgIC8vIG90aGVyd2lzZSwgYnVmZmVyIHRoZSBldmVudFxuICAgICAgYnVmZmVyZWRbYnVmZmVyZWQubGVuZ3RoXSA9IGV2dDtcbiAgICB9XG5cbiAgICAvLyBsaXN0ZW4gZm9yIGV2ZW50c1xuICAgIHQuYWRkRXZlbnRMaXN0ZW5lcihuYW1lLCBoYW5kbGVFdmVudCk7XG5cbiAgICAvLyBpZiB3ZSBoYXZlIGJlZW4gcHJvdmlkZWQgYSB0cmlnZ2VyIGZ1bmN0aW9uIChub3QgYW4gYXJyYXkgaW5kZXgpXG4gICAgLy8gdGhlbiByZXR1cm4gdGhlIGhhbmRsZSBldmVudCBjYWxsXG4gICAgcmV0dXJuIHR5cGVvZiB0cmlnZ2VyID09ICdmdW5jdGlvbicgPyBoYW5kbGVFdmVudCA6IGZ1bmN0aW9uKGNiKSB7XG4gICAgICB0cmlnZ2VyID0gY2I7XG5cbiAgICAgIC8vIGlmIHdlIGhhdmUgYSBidWZmZXJlZCByZXN1bHRzLCB0cmlnZ2VyIHRob3NlIG5vd1xuICAgICAgaWYgKGJ1ZmZlcmVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYnVmZmVyZWQuc3BsaWNlKDApLmZvckVhY2goZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgICAgY2IobnVsbCwgZXZ0KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBlbCA/IGJpbmQoZWwsIGNhbGxiYWNrKSA6IGJpbmQ7XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4vKiBnbG9iYWwgZG9jdW1lbnQ6IGZhbHNlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBjbGFzc1NlbGVjdG9yUkUgPSAvXlxcLihbXFx3XFwtXSspJC87XG52YXIgaWRTZWxlY3RvclJFID0gL14jKFtcXHdcXC1dKykkLztcbnZhciB0YWdTZWxlY3RvclJFID0gL15bXFx3XFwtXSskLztcblxuLyoqXG4gICMjIyBxc2Eoc2VsZWN0b3IsIHNjb3BlPylcblxuICBUaGlzIGZ1bmN0aW9uIGlzIHVzZWQgdG8gZ2V0IHRoZSByZXN1bHRzIG9mIHRoZSBxdWVyeVNlbGVjdG9yQWxsIG91dHB1dFxuICBpbiB0aGUgZmFzdGVzdCBwb3NzaWJsZSB3YXkuICBUaGlzIGNvZGUgaXMgdmVyeSBtdWNoIGJhc2VkIG9uIHRoZVxuICBpbXBsZW1lbnRhdGlvbiBpblxuICBbemVwdG9dKGh0dHBzOi8vZ2l0aHViLmNvbS9tYWRyb2JieS96ZXB0by9ibG9iL21hc3Rlci9zcmMvemVwdG8uanMjTDEwNCksXG4gIGJ1dCBwZXJoYXBzIG5vdCBxdWl0ZSBhcyB0ZXJzZS5cblxuICA8PDwgZXhhbXBsZXMvcXNhLmpzXG5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzZWxlY3Rvciwgc2NvcGUpIHtcbiAgdmFyIGlkU2VhcmNoO1xuXG4gIC8vIGRlZmF1bHQgdGhlIGVsZW1lbnQgdG8gdGhlIGRvY3VtZW50XG4gIHNjb3BlID0gc2NvcGUgfHwgZG9jdW1lbnQ7XG5cbiAgLy8gZGV0ZXJtaW5lIHdoZXRoZXIgd2UgYXJlIGRvaW5nIGFuIGlkIHNlYXJjaCBvciBub3RcbiAgaWRTZWFyY2ggPSBzY29wZSA9PT0gZG9jdW1lbnQgJiYgaWRTZWxlY3RvclJFLnRlc3Qoc2VsZWN0b3IpO1xuXG4gIC8vIHBlcmZvcm0gdGhlIHNlYXJjaFxuICByZXR1cm4gaWRTZWFyY2ggP1xuICAgIC8vIHdlIGFyZSBkb2luZyBhbiBpZCBzZWFyY2gsIHJldHVybiB0aGUgZWxlbWVudCBzZWFyY2ggaW4gYW4gYXJyYXlcbiAgICBbc2NvcGUuZ2V0RWxlbWVudEJ5SWQoUmVnRXhwLiQxKV0gOlxuICAgIC8vIG5vdCBhbiBpZCBzZWFyY2gsIGNhbGwgdGhlIGFwcHJvcHJpYXRlIHNlbGVjdG9yXG4gICAgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXG4gICAgICAgIGNsYXNzU2VsZWN0b3JSRS50ZXN0KHNlbGVjdG9yKSA/XG4gICAgICAgICAgc2NvcGUuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShSZWdFeHAuJDEpIDpcbiAgICAgICAgICAgIHRhZ1NlbGVjdG9yUkUudGVzdChzZWxlY3RvcikgP1xuICAgICAgICAgICAgICBzY29wZS5nZXRFbGVtZW50c0J5VGFnTmFtZShzZWxlY3RvcikgOlxuICAgICAgICAgICAgICBzY29wZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKVxuICAgICk7XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciByZVNlcGFyYXRvciA9IC9bXFwsXFxzXVxccyovO1xudmFyIG9mZkZsYWdzID0gWydmYWxzZScsICdub25lJywgJ29mZiddO1xuXG5cbi8qKlxuICAjIHJ0Yy1jYXB0dXJlY29uZmlnXG5cbiAgVGhpcyBpcyBhIHNpbXBsZSBwYXJzZXIgdGhhdCB0YWtlcyBhIHN0cmluZyBvZiB0ZXh0IGFuZCBkZXRlcm1pbmVzIHdoYXRcbiAgdGhhdCBtZWFucyBpbiB0aGUgY29udGV4dCBvZiBXZWJSVEMuXG5cbiAgIyMgV2h5P1xuXG4gIEl0IHByb3ZpZGVzIGEgc2ltcGxlLCB0ZXh0dWFsIHdheSBvZiBkZXNjcmliaW5nIHlvdXIgcmVxdWlyZW1lbnRzIGZvclxuICBtZWRpYSBjYXB0dXJlLiAgVHJ5aW5nIHRvIHJlbWVtYmVyIHRoZSBzdHJ1Y3R1cmUgb2YgdGhlIGNvbnN0cmFpbnRzIG9iamVjdFxuICBpcyBwYWluZnVsLlxuXG4gICMjIEhvd1xuXG4gIEEgc2ltcGxlIHRleHQgc3RyaW5nIGlzIGNvbnZlcnRlZCB0byBhbiBpbnRlcm1lZGlhdGUgSlMgb2JqZWN0XG4gIHJlcHJlc2VudGF0aW9uLCB3aGljaCBjYW4gdGhlbiBiZSBjb252ZXJ0ZWQgdG8gYSBnZXRVc2VyTWVkaWEgY29uc3RyYWludHNcbiAgZGF0YSBzdHJ1Y3R1cmUgdXNpbmcgYSBgdG9Db25zdHJhaW50cygpYCBjYWxsLlxuXG4gIEZvciBleGFtcGxlLCB0aGUgZm9sbG93aW5nIHRleHQgaW5wdXQ6XG5cbiAgYGBgXG4gIGNhbWVyYSBtaW46MTI4MHg3MjAgbWF4OjEyODB4NzIwIG1pbjoxNWZwcyBtYXg6MjVmcHNcbiAgYGBgXG5cbiAgSXMgY29udmVydGVkIGludG8gYW4gaW50ZXJtZWRpYSByZXByZXNlbnRhdGlvbiAodmlhIHRoZSBgQ2FwdHVyZUNvbmZpZ2BcbiAgdXRpbGl0eSBjbGFzcykgdGhhdCBsb29rcyBsaWtlIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBganNcbiAge1xuICAgIGNhbWVyYTogMCxcbiAgICBtaWNyb3Bob25lOiAwLFxuICAgIHJlczoge1xuICAgICAgbWluOiB7IHc6IDEyODAsIGg6IDcyMCB9LFxuICAgICAgbWF4OiB7IHc6IDEyODAsIGg6IDcyMCB9XG4gICAgfSxcblxuICAgIGZwczoge1xuICAgICAgbWluOiAxNSxcbiAgICAgIG1heDogMjVcbiAgICB9XG4gIH1cbiAgYGBgXG5cbiAgV2hpY2ggaW4gdHVybiBpcyBjb252ZXJ0ZWQgaW50byB0aGUgZm9sbG93aW5nIG1lZGlhIGNvbnN0cmFpbnRzIGZvclxuICBhIGdldFVzZXJNZWRpYSBjYWxsOlxuXG4gIGBgYGpzXG4gIHtcbiAgICBhdWRpbzogdHJ1ZSxcbiAgICB2aWRlbzoge1xuICAgICAgbWFuZGF0b3J5OiB7XG4gICAgICAgIG1pbkZyYW1lUmF0ZTogMTUsXG4gICAgICAgIG1heEZyYW1lUmF0ZTogMjUsXG5cbiAgICAgICAgbWluV2lkdGg6IDEyODAsXG4gICAgICAgIG1pbkhlaWdodDogNzIwLFxuICAgICAgICBtYXhXaWR0aDogMTI4MCxcbiAgICAgICAgbWF4SGVpZ2h0OiA3MjBcbiAgICAgIH0sXG5cbiAgICAgIG9wdGlvbmFsOiBbXVxuICAgIH1cbiAgfVxuICBgYGBcblxuICAjIyMgRXhwZXJpbWVudGFsOiBUYXJnZXRlZCBEZXZpY2UgQ2FwdHVyZVxuXG4gIFdoaWxlIHRoZSBgcnRjLWNhcHR1cmVjb25maWdgIG1vZHVsZSBpdHNlbGYgZG9lc24ndCBjb250YWluIGFueSBtZWRpYVxuICBpZGVudGlmaWNhdGlvbiBsb2dpYywgaXQgaXMgYWJsZSB0byB0aGUgc291cmNlcyBpbmZvcm1hdGlvbiBmcm9tIGFcbiAgYE1lZGlhU3RyZWFtVHJhY2suZ2V0U291cmNlc2AgY2FsbCB0byBnZW5lcmF0ZSBkZXZpY2UgdGFyZ2V0ZWQgY29uc3RyYWludHMuXG5cbiAgRm9yIGluc3RhbmNlLCB0aGUgZm9sbG93aW5nIGV4YW1wbGUgZGVtb25zdHJhdGVzIGhvdyB3ZSBjYW4gcmVxdWVzdFxuICBgY2FtZXJhOjFgICh0aGUgMm5kIHZpZGVvIGRldmljZSBvbiBvdXIgbG9jYWwgbWFjaGluZSkgd2hlbiB3ZSBhcmUgbWFraW5nXG4gIGEgZ2V0VXNlck1lZGlhIGNhbGw6XG5cbiAgPDw8IGV4YW1wbGVzL2NhbWVyYS10d28uanNcblxuICBJdCdzIHdvcnRoIG5vdGluZyB0aGF0IGlmIHRoZSByZXF1ZXN0ZWQgZGV2aWNlIGRvZXMgbm90IGV4aXN0IG9uIHRoZVxuICBtYWNoaW5lIChpbiB0aGUgY2FzZSBhYm92ZSwgaWYgeW91ciBtYWNoaW5lIG9ubHkgaGFzIGEgc2luZ2xlIHdlYmNhbSAtIGFzXG4gIGlzIGNvbW1vbikgdGhlbiBubyBkZXZpY2Ugc2VsZWN0aW9uIGNvbnN0cmFpbnRzIHdpbGwgYmUgZ2VuZXJhdGVkIChpLmUuXG4gIHRoZSBzdGFuZGFyZCBgeyB2aWRlbzogdHJ1ZSwgYXVkaW86IHRydWUgfWAgY29uc3RyYWludHMgd2lsbCBiZSByZXR1cm5lZFxuICBmcm9tIHRoZSBgdG9Db25zdHJhaW50c2AgY2FsbCkuXG5cbiAgIyMjIEV4cGVyaW1lbnRhbDogU2NyZWVuIENhcHR1cmVcblxuICBJZiB5b3UgYXJlIHdvcmtpbmcgd2l0aCBjaHJvbWUgYW5kIHNlcnZpbmcgY29udGVudCBvZiBhIEhUVFBTIGNvbm5lY3Rpb24sXG4gIHRoZW4geW91IHdpbGwgYmUgYWJsZSB0byBleHBlcmltZW50IHdpdGggZXhwZXJpbWVudGFsIGdldFVzZXJNZWRpYSBzY3JlZW5cbiAgY2FwdHVyZS5cblxuICBJbiB0aGUgc2ltcGxlc3QgY2FzZSwgc2NyZWVuIGNhcHR1cmUgY2FuIGJlIGludm9rZWQgYnkgdXNpbmcgdGhlIGNhcHR1cmVcbiAgc3RyaW5nIG9mOlxuXG4gIGBgYFxuICBzY3JlZW5cbiAgYGBgXG5cbiAgV2hpY2ggZ2VuZXJhdGVzIHRoZSBmb2xsb3dpbmcgY29udHJhaW50czpcblxuICBgYGBqc1xuICB7XG4gICAgYXVkaW86IGZhbHNlLFxuICAgIHZpZGVvOiB7XG4gICAgICBtYW5kYXRvcnk6IHtcbiAgICAgICAgY2hyb21lTWVkaWFTb3VyY2U6ICdzY3JlZW4nXG4gICAgICB9LFxuXG4gICAgICBvcHRpb25hbDogW11cbiAgICB9XG4gIH1cbiAgYGBgXG5cbiAgIyMgUmVmZXJlbmNlXG5cbioqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGlucHV0KSB7XG4gIC8vIGNyZWF0ZSBhIG5ldyBjb25maWd1cmF0aW9uIG9iamVjdCB1c2luZyBkZWZhdWx0c1xuICB2YXIgY29uZmlnID0gbmV3IENhcHR1cmVDb25maWcoKTtcblxuICAvLyBwcm9jZXNzIGVhY2ggb2YgdGhlIGRpcmVjdGl2ZXNcbiAgKGlucHV0IHx8ICcnKS5zcGxpdChyZVNlcGFyYXRvcikuZm9yRWFjaChmdW5jdGlvbihkaXJlY3RpdmUpIHtcbiAgICAvLyBub3cgZnVydGhlciBzcGxpdCB0aGUgZGlyZWN0aXZlIG9uIHRoZSA6IGNoYXJhY3RlclxuICAgIHZhciBwYXJ0cyA9IGRpcmVjdGl2ZS5zcGxpdCgnOicpO1xuICAgIHZhciBtZXRob2QgPSBjb25maWdbKHBhcnRzWzBdIHx8ICcnKS50b0xvd2VyQ2FzZSgpXTtcblxuICAgIC8vIGlmIHdlIGhhdmUgdGhlIG1ldGhvZCBhcHBseVxuICAgIGlmICh0eXBlb2YgbWV0aG9kID09ICdmdW5jdGlvbicpIHtcbiAgICAgIG1ldGhvZC5hcHBseShjb25maWcsIHBhcnRzLnNsaWNlKDEpKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBjb25maWc7XG59O1xuXG4vKipcbiAgIyMjIENhcHR1cmVDb25maWdcblxuICBUaGlzIGlzIGEgdXRpbGl0eSBjbGFzcyB0aGF0IGlzIHVzZWQgdG8gdXBkYXRlIGNhcHR1cmUgY29uZmlndXJhdGlvblxuICBkZXRhaWxzIGFuZCBpcyBhYmxlIHRvIGdlbmVyYXRlIHN1aXRhYmxlIGdldFVzZXJNZWRpYSBjb25zdHJhaW50cyBiYXNlZFxuICBvbiB0aGUgY29uZmlndXJhdGlvbi5cblxuKiovXG5mdW5jdGlvbiBDYXB0dXJlQ29uZmlnKCkge1xuICBpZiAoISAodGhpcyBpbnN0YW5jZW9mIENhcHR1cmVDb25maWcpKSB7XG4gICAgcmV0dXJuIG5ldyBDYXB0dXJlQ29uZmlnKCk7XG4gIH1cblxuICAvLyBpbml0aWFsaXNlIHRoZSBiYXNlIGNvbmZpZ1xuICB0aGlzLmNmZyA9IHtcbiAgICBtaWNyb3Bob25lOiB0cnVlXG4gIH07XG59XG5cbi8qKlxuICAjIyMjIGNhbWVyYShpbmRleClcblxuICBVcGRhdGUgdGhlIGNhbWVyYSBjb25maWd1cmF0aW9uIHRvIHRoZSBzcGVjaWZpZWQgaW5kZXhcbioqL1xuQ2FwdHVyZUNvbmZpZy5wcm90b3R5cGUuY2FtZXJhID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgdGhpcy5jZmcuY2FtZXJhID0gdHJ1ZU9yVmFsdWUoaW5kZXgpO1xufTtcblxuLyoqXG4gICMjIyMgbWljcm9waG9uZShpbmRleClcblxuICBVcGRhdGUgdGhlIG1pY3JvcGhvbmUgY29uZmlndXJhdGlvbiB0byB0aGUgc3BlY2lmaWVkIGluZGV4XG4qKi9cbkNhcHR1cmVDb25maWcucHJvdG90eXBlLm1pY3JvcGhvbmUgPSBmdW5jdGlvbihpbmRleCkge1xuICB0aGlzLmNmZy5taWNyb3Bob25lID0gdHJ1ZU9yVmFsdWUoaW5kZXgpO1xufTtcblxuLyoqXG4gICMjIyMgc2NyZWVuKHRhcmdldClcblxuICBTcGVjaWZ5IHRoYXQgd2Ugd291bGQgbGlrZSB0byBjYXB0dXJlIHRoZSBzY3JlZW5cbioqL1xuQ2FwdHVyZUNvbmZpZy5wcm90b3R5cGUuc2NyZWVuID0gZnVuY3Rpb24oKSB7XG4gIC8vIHVuc2V0IHRoZSBtaWNyb3Bob25lIGNvbmZpZ1xuICBkZWxldGUgdGhpcy5jZmcubWljcm9waG9uZTtcblxuICAvLyBzZXQgdGhlIHNjcmVlbiBjb25maWd1cmF0aW9uXG4gIHRoaXMuY2ZnLnNjcmVlbiA9IHRydWU7XG59O1xuXG4vKipcbiAgIyMjIyBtYXgoZGF0YSlcblxuICBVcGRhdGUgYSBtYXhpbXVtIGNvbnN0cmFpbnQuICBJZiBhbiBmcHMgY29uc3RyYWludCB0aGlzIHdpbGwgYmUgZGlyZWN0ZWRcbiAgdG8gdGhlIGBtYXhmcHNgIG1vZGlmaWVyLlxuXG4qKi9cbkNhcHR1cmVDb25maWcucHJvdG90eXBlLm1heCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgdmFyIHJlcztcblxuICAvLyBpZiB0aGlzIGlzIGFuIGZwcyBzcGVjaWZpY2F0aW9uIHBhcnNlXG4gIGlmIChkYXRhLnNsaWNlKC0zKS50b0xvd2VyQ2FzZSgpID09ICdmcHMnKSB7XG4gICAgcmV0dXJuIHRoaXMubWF4ZnBzKGRhdGEpO1xuICB9XG5cbiAgLy8gcGFyc2UgdGhlIHJlc29sdXRpb25cbiAgcmVzID0gdGhpcy5fcGFyc2VSZXMoZGF0YSk7XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgZnBzIGNvbmZpZyBzdHVmZlxuICB0aGlzLmNmZy5yZXMgPSB0aGlzLmNmZy5yZXMgfHwge307XG4gIHRoaXMuY2ZnLnJlcy5tYXggPSByZXM7XG59O1xuXG4vKipcbiAgIyMjIyBtYXhmcHMoZGF0YSlcblxuICBVcGRhdGUgdGhlIG1heGltdW0gZnBzXG4qKi9cbkNhcHR1cmVDb25maWcucHJvdG90eXBlLm1heGZwcyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgLy8gZW5zdXJlIHdlIGhhdmUgYW4gZnBzIGNvbXBvbmVudFxuICB0aGlzLmNmZy5mcHMgPSB0aGlzLmNmZy5mcHMgfHwge307XG5cbiAgLy8gc2V0IHRoZSBtYXggZnBzXG4gIHRoaXMuY2ZnLmZwcy5tYXggPSBwYXJzZUZsb2F0KGRhdGEuc2xpY2UoMCwgLTMpKTtcbn07XG5cbi8qKlxuICAjIyMjIG1pbihkYXRhKVxuXG4gIFVwZGF0ZSBhIG1pbmltdW0gY29uc3RyYWludC4gIFRoaXMgY2FuIGJlIGVpdGhlciByZWxhdGVkIHRvIHJlc29sdXRpb25cbiAgb3IgRlBTLlxuKiovXG5DYXB0dXJlQ29uZmlnLnByb3RvdHlwZS5taW4gPSBmdW5jdGlvbihkYXRhKSB7XG4gIHZhciByZXM7XG5cbiAgLy8gaWYgdGhpcyBpcyBhbiBmcHMgc3BlY2lmaWNhdGlvbiBwYXJzZVxuICBpZiAoZGF0YS5zbGljZSgtMykudG9Mb3dlckNhc2UoKSA9PSAnZnBzJykge1xuICAgIHJldHVybiB0aGlzLm1pbmZwcyhkYXRhKTtcbiAgfVxuXG4gIC8vIHBhcnNlIHRoZSByZXNvbHV0aW9uXG4gIHJlcyA9IHRoaXMuX3BhcnNlUmVzKGRhdGEpO1xuXG4gIC8vIGluaXRpYWxpc2UgdGhlIGZwcyBjb25maWcgc3R1ZmZcbiAgdGhpcy5jZmcucmVzID0gdGhpcy5jZmcucmVzIHx8IHt9O1xuXG4gIC8vIGFkZCB0aGUgbWluXG4gIHRoaXMuY2ZnLnJlcy5taW4gPSByZXM7XG59O1xuXG4vKipcbiAgIyMjIyBtaW5mcHMoZGF0YSlcblxuICBVcGRhdGUgdGhlIG1pbmltdW0gZnBzXG4qKi9cbkNhcHR1cmVDb25maWcucHJvdG90eXBlLm1pbmZwcyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgLy8gZW5zdXJlIHdlIGhhdmUgYW4gZnBzIGNvbXBvbmVudFxuICB0aGlzLmNmZy5mcHMgPSB0aGlzLmNmZy5mcHMgfHwge307XG5cbiAgLy8gc2V0IHRoZSBtYXggZnBzXG4gIHRoaXMuY2ZnLmZwcy5taW4gPSBwYXJzZUZsb2F0KGRhdGEuc2xpY2UoMCwgLTMpKTtcbn07XG5cbi8qKlxuICAjIyMjIHRvQ29uc3RyYWludHMob3B0cz8pXG5cbiAgQ29udmVydCB0aGUgaW50ZXJuYWwgY29uZmlndXJhdGlvbiBvYmplY3QgdG8gYSB2YWxpZCBtZWRpYSBjb25zdHJhaW50c1xuICByZXByZXNlbnRhdGlvbi4gIEluIGNvbXBhdGlibGUgYnJvd3NlcnMgYSBsaXN0IG9mIG1lZGlhIHNvdXJjZXMgY2FuXG4gIGJlIHBhc3NlZCB0aHJvdWdoIGluIHRoZSBgb3B0cy5zb3VyY2VzYCB0byBjcmVhdGUgY29udHJhaW50cyB0aGF0IHdpbGxcbiAgdGFyZ2V0IGEgc3BlY2lmaWMgZGV2aWNlIHdoZW4gY2FwdHVyZWQuXG5cbiAgPDw8IGV4YW1wbGVzL2NhcHR1cmUtdGFyZ2V0cy5qc1xuXG4qKi9cbkNhcHR1cmVDb25maWcucHJvdG90eXBlLnRvQ29uc3RyYWludHMgPSBmdW5jdGlvbihvcHRzKSB7XG4gIHZhciBjZmcgPSB0aGlzLmNmZztcbiAgdmFyIGNvbnN0cmFpbnRzID0ge1xuICAgIGF1ZGlvOiBjZmcubWljcm9waG9uZSA9PT0gdHJ1ZSB8fFxuICAgICAgKHR5cGVvZiBjZmcubWljcm9waG9uZSA9PSAnbnVtYmVyJyAmJiBjZmcubWljcm9waG9uZSA+PSAwKSxcblxuICAgIHZpZGVvOiBjZmcuY2FtZXJhID09PSB0cnVlIHx8IGNmZy5zY3JlZW4gfHxcbiAgICAgICh0eXBlb2YgY2ZnLmNhbWVyYSA9PSAnbnVtYmVyJyAmJiBjZmcuY2FtZXJhID49IDApXG4gIH07XG5cbiAgLy8gbWFuZGF0b3J5IGNvbnN0cmFpbnRzXG4gIHZhciBtID0ge1xuICAgIHZpZGVvOiB7fSxcbiAgICBhdWRpbzoge31cbiAgfTtcblxuICAvLyBvcHRpb25hbCBjb25zdHJhaW50c1xuICB2YXIgbyA9IHtcbiAgICB2aWRlbzogW10sXG4gICAgYXVkaW86IFtdXG4gIH07XG5cbiAgdmFyIHNvdXJjZXMgPSAob3B0cyB8fCB7fSkuc291cmNlcyB8fCBbXTtcbiAgdmFyIGNhbWVyYXMgPSBzb3VyY2VzLmZpbHRlcihmdW5jdGlvbihpbmZvKSB7XG4gICAgcmV0dXJuIGluZm8gJiYgaW5mby5raW5kID09PSAndmlkZW8nO1xuICB9KTtcbiAgdmFyIG1pY3JvcGhvbmVzID0gc291cmNlcy5maWx0ZXIoZnVuY3Rpb24oaW5mbykge1xuICAgIHJldHVybiBpbmZvICYmIGluZm8ua2luZCA9PT0gJ2F1ZGlvJztcbiAgfSk7XG4gIHZhciBzZWxlY3RlZFNvdXJjZTtcblxuICBmdW5jdGlvbiBjb21wbGV4Q29uc3RyYWludHModGFyZ2V0KSB7XG4gICAgaWYgKGNvbnN0cmFpbnRzW3RhcmdldF0gJiYgdHlwZW9mIGNvbnN0cmFpbnRzW3RhcmdldF0gIT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0cmFpbnRzW3RhcmdldF0gPSB7XG4gICAgICAgIG1hbmRhdG9yeTogbVt0YXJnZXRdLFxuICAgICAgICBvcHRpb25hbDogb1t0YXJnZXRdXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8vIGZwc1xuICBpZiAoY2ZnLmZwcykge1xuICAgIGNvbXBsZXhDb25zdHJhaW50cygndmlkZW8nKTtcbiAgICBjZmcuZnBzLm1pbiAmJiAobS52aWRlby5taW5GcmFtZVJhdGUgPSBjZmcuZnBzLm1pbik7XG4gICAgY2ZnLmZwcy5tYXggJiYgKG0udmlkZW8ubWF4RnJhbWVSYXRlID0gY2ZnLmZwcy5tYXgpO1xuICB9XG5cbiAgLy8gbWluIHJlcyBzcGVjaWZpZWRcbiAgaWYgKGNmZy5yZXMgJiYgY2ZnLnJlcy5taW4pIHtcbiAgICBjb21wbGV4Q29uc3RyYWludHMoJ3ZpZGVvJyk7XG4gICAgbS52aWRlby5taW5XaWR0aCA9IGNmZy5yZXMubWluLnc7XG4gICAgbS52aWRlby5taW5IZWlnaHQgPSBjZmcucmVzLm1pbi5oO1xuICB9XG5cbiAgLy8gbWF4IHJlcyBzcGVjaWZpZWRcbiAgaWYgKGNmZy5yZXMgJiYgY2ZnLnJlcy5tYXgpIHtcbiAgICBjb21wbGV4Q29uc3RyYWludHMoJ3ZpZGVvJyk7XG4gICAgbS52aWRlby5tYXhXaWR0aCA9IGNmZy5yZXMubWF4Lnc7XG4gICAgbS52aWRlby5tYXhIZWlnaHQgPSBjZmcucmVzLm1heC5oO1xuICB9XG5cbiAgLy8gaW5wdXQgY2FtZXJhIHNlbGVjdGlvblxuICBpZiAodHlwZW9mIGNmZy5jYW1lcmEgPT0gJ251bWJlcicgJiYgY2FtZXJhcy5sZW5ndGgpIHtcbiAgICBzZWxlY3RlZFNvdXJjZSA9IGNhbWVyYXNbY2ZnLmNhbWVyYV07XG5cbiAgICBpZiAoc2VsZWN0ZWRTb3VyY2UpIHtcbiAgICAgIGNvbXBsZXhDb25zdHJhaW50cygndmlkZW8nKTtcbiAgICAgIG8udmlkZW8ucHVzaCh7IHNvdXJjZUlkOiBzZWxlY3RlZFNvdXJjZS5pZCB9KTtcbiAgICB9XG4gIH1cblxuICAvLyBpbnB1dCBtaWNyb3Bob25lIHNlbGVjdGlvblxuICBpZiAodHlwZW9mIGNmZy5taWNyb3Bob25lID09ICdudW1iZXInICYmIG1pY3JvcGhvbmVzLmxlbmd0aCkge1xuICAgIHNlbGVjdGVkU291cmNlID0gbWljcm9waG9uZXNbY2ZnLm1pY3JvcGhvbmVdO1xuXG4gICAgaWYgKHNlbGVjdGVkU291cmNlKSB7XG4gICAgICBjb21wbGV4Q29uc3RyYWludHMoJ2F1ZGlvJyk7XG4gICAgICBvLmF1ZGlvLnB1c2goeyBzb3VyY2VJZDogc2VsZWN0ZWRTb3VyY2UuaWQgfSk7XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgd2UgaGF2ZSBzY3JlZW4gY29uc3RyYWludHMsIG1ha2UgbWFnaWMgaGFwcGVuXG4gIGlmICh0eXBlb2YgY2ZnLnNjcmVlbiAhPSAndW5kZWZpbmVkJykge1xuICAgIGNvbXBsZXhDb25zdHJhaW50cygndmlkZW8nKTtcbiAgICBtLnZpZGVvLmNocm9tZU1lZGlhU291cmNlID0gJ3NjcmVlbic7XG4gIH1cblxuICByZXR1cm4gY29uc3RyYWludHM7XG59O1xuXG4vKipcbiAgIyMjIFwiSW50ZXJuYWxcIiBtZXRob2RzXG4qKi9cblxuLyoqXG4gICMjIyMgX3BhcnNlUmVzKGRhdGEpXG5cbiAgUGFyc2UgYSByZXNvbHV0aW9uIHNwZWNpZmllciAoZS5nLiAxMjgweDcyMCkgaW50byBhIHNpbXBsZSBKUyBvYmplY3RcbiAgKGUuZy4geyB3OiAxMjgwLCBoOiA3MjAgfSlcbioqL1xuQ2FwdHVyZUNvbmZpZy5wcm90b3R5cGUuX3BhcnNlUmVzID0gZnVuY3Rpb24oZGF0YSkge1xuICAvLyBzcGxpdCB0aGUgZGF0YSBvbiB0aGUgJ3gnIGNoYXJhY3RlclxuICB2YXIgcGFydHMgPSBkYXRhLnNwbGl0KCd4Jyk7XG5cbiAgLy8gaWYgd2UgZG9uJ3QgaGF2ZSB0d28gcGFydHMsIHRoZW4gY29tcGxhaW5cbiAgaWYgKHBhcnRzLmxlbmd0aCA8IDIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcmVzb2x1dGlvbiBzcGVjaWZpY2F0aW9uOiAnICsgZGF0YSk7XG4gIH1cblxuICAvLyByZXR1cm4gdGhlIHdpZHRoIGFuZCBoZWlnaHQgb2JqZWN0XG4gIHJldHVybiB7XG4gICAgdzogcGFyc2VJbnQocGFydHNbMF0sIDEwKSxcbiAgICBoOiBwYXJzZUludChwYXJ0c1sxXSwgMTApXG4gIH07XG59O1xuXG4vKiBpbnRlcm5hbCBoZWxwZXIgKi9cblxuZnVuY3Rpb24gdHJ1ZU9yVmFsdWUodmFsKSB7XG4gIGlmICh0eXBlb2YgdmFsID09ICdzdHJpbmcnICYmIG9mZkZsYWdzLmluZGV4T2YodmFsLnRvTG93ZXJDYXNlKCkpID49IDApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdmFsID09PSB1bmRlZmluZWQgfHwgdmFsID09PSAnJyB8fCBwYXJzZUludCh2YWwgfHwgMCwgMTApO1xufSIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4vKiBnbG9iYWwgd2luZG93OiBmYWxzZSAqL1xuLyogZ2xvYmFsIG5hdmlnYXRvcjogZmFsc2UgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgYnJvd3NlcnMgPSB7XG4gIGNocm9tZTogL0Nocm9tKD86ZXxpdW0pXFwvKFswLTldKylcXC4vLFxuICBmaXJlZm94OiAvRmlyZWZveFxcLyhbMC05XSspXFwuLyxcbiAgb3BlcmE6IC9PcGVyYVxcLyhbMC05XSspXFwuL1xufTtcblxuLyoqXG4jIyBydGMtY29yZS9kZXRlY3RcblxuQSBicm93c2VyIGRldGVjdGlvbiBoZWxwZXIgZm9yIGFjY2Vzc2luZyBwcmVmaXgtZnJlZSB2ZXJzaW9ucyBvZiB0aGUgdmFyaW91c1xuV2ViUlRDIHR5cGVzLlxuXG4jIyMgRXhhbXBsZSBVc2FnZVxuXG5JZiB5b3Ugd2FudGVkIHRvIGdldCB0aGUgbmF0aXZlIGBSVENQZWVyQ29ubmVjdGlvbmAgcHJvdG90eXBlIGluIGFueSBicm93c2VyXG55b3UgY291bGQgZG8gdGhlIGZvbGxvd2luZzpcblxuYGBganNcbnZhciBkZXRlY3QgPSByZXF1aXJlKCdydGMtY29yZS9kZXRlY3QnKTsgLy8gYWxzbyBhdmFpbGFibGUgaW4gcnRjL2RldGVjdFxudmFyIFJUQ1BlZXJDb25uZWN0aW9uID0gZGV0ZWN0KCdSVENQZWVyQ29ubmVjdGlvbicpO1xuYGBgXG5cblRoaXMgd291bGQgcHJvdmlkZSB3aGF0ZXZlciB0aGUgYnJvd3NlciBwcmVmaXhlZCB2ZXJzaW9uIG9mIHRoZVxuUlRDUGVlckNvbm5lY3Rpb24gaXMgYXZhaWxhYmxlIChgd2Via2l0UlRDUGVlckNvbm5lY3Rpb25gLFxuYG1velJUQ1BlZXJDb25uZWN0aW9uYCwgZXRjKS5cbioqL1xudmFyIGRldGVjdCA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odGFyZ2V0LCBwcmVmaXhlcykge1xuICB2YXIgcHJlZml4SWR4O1xuICB2YXIgcHJlZml4O1xuICB2YXIgdGVzdE5hbWU7XG4gIHZhciBob3N0T2JqZWN0ID0gdGhpcyB8fCAodHlwZW9mIHdpbmRvdyAhPSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6IHVuZGVmaW5lZCk7XG5cbiAgLy8gaWYgd2UgaGF2ZSBubyBob3N0IG9iamVjdCwgdGhlbiBhYm9ydFxuICBpZiAoISBob3N0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gaW5pdGlhbGlzZSB0byBkZWZhdWx0IHByZWZpeGVzXG4gIC8vIChyZXZlcnNlIG9yZGVyIGFzIHdlIHVzZSBhIGRlY3JlbWVudGluZyBmb3IgbG9vcClcbiAgcHJlZml4ZXMgPSAocHJlZml4ZXMgfHwgWydtcycsICdvJywgJ21veicsICd3ZWJraXQnXSkuY29uY2F0KCcnKTtcblxuICAvLyBpdGVyYXRlIHRocm91Z2ggdGhlIHByZWZpeGVzIGFuZCByZXR1cm4gdGhlIGNsYXNzIGlmIGZvdW5kIGluIGdsb2JhbFxuICBmb3IgKHByZWZpeElkeCA9IHByZWZpeGVzLmxlbmd0aDsgcHJlZml4SWR4LS07ICkge1xuICAgIHByZWZpeCA9IHByZWZpeGVzW3ByZWZpeElkeF07XG5cbiAgICAvLyBjb25zdHJ1Y3QgdGhlIHRlc3QgY2xhc3MgbmFtZVxuICAgIC8vIGlmIHdlIGhhdmUgYSBwcmVmaXggZW5zdXJlIHRoZSB0YXJnZXQgaGFzIGFuIHVwcGVyY2FzZSBmaXJzdCBjaGFyYWN0ZXJcbiAgICAvLyBzdWNoIHRoYXQgYSB0ZXN0IGZvciBnZXRVc2VyTWVkaWEgd291bGQgcmVzdWx0IGluIGFcbiAgICAvLyBzZWFyY2ggZm9yIHdlYmtpdEdldFVzZXJNZWRpYVxuICAgIHRlc3ROYW1lID0gcHJlZml4ICsgKHByZWZpeCA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgdGFyZ2V0LnNsaWNlKDEpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQpO1xuXG4gICAgaWYgKHR5cGVvZiBob3N0T2JqZWN0W3Rlc3ROYW1lXSAhPSAndW5kZWZpbmVkJykge1xuICAgICAgLy8gdXBkYXRlIHRoZSBsYXN0IHVzZWQgcHJlZml4XG4gICAgICBkZXRlY3QuYnJvd3NlciA9IGRldGVjdC5icm93c2VyIHx8IHByZWZpeC50b0xvd2VyQ2FzZSgpO1xuXG4gICAgICAvLyByZXR1cm4gdGhlIGhvc3Qgb2JqZWN0IG1lbWJlclxuICAgICAgcmV0dXJuIGhvc3RPYmplY3RbdGFyZ2V0XSA9IGhvc3RPYmplY3RbdGVzdE5hbWVdO1xuICAgIH1cbiAgfVxufTtcblxuLy8gZGV0ZWN0IG1vemlsbGEgKHllcywgdGhpcyBmZWVscyBkaXJ0eSlcbmRldGVjdC5tb3ogPSB0eXBlb2YgbmF2aWdhdG9yICE9ICd1bmRlZmluZWQnICYmICEhbmF2aWdhdG9yLm1vekdldFVzZXJNZWRpYTtcblxuLy8gdGltZSB0byBkbyBzb21lIHVzZXJhZ2VudCBzbmlmZmluZyAtIGl0IGZlZWxzIGRpcnR5IGJlY2F1c2UgaXQgaXMgOi9cbmlmICh0eXBlb2YgbmF2aWdhdG9yICE9ICd1bmRlZmluZWQnKSB7XG4gIE9iamVjdC5rZXlzKGJyb3dzZXJzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHZhciBtYXRjaCA9IGJyb3dzZXJzW2tleV0uZXhlYyhuYXZpZ2F0b3IudXNlckFnZW50KTtcbiAgICBpZiAobWF0Y2gpIHtcbiAgICAgIGRldGVjdC5icm93c2VyID0ga2V5O1xuICAgICAgZGV0ZWN0LmJyb3dzZXJWZXJzaW9uID0gZGV0ZWN0LnZlcnNpb24gPSBwYXJzZUludChtYXRjaFsxXSwgMTApO1xuICAgIH1cbiAgfSk7XG59XG5lbHNlIHtcbiAgZGV0ZWN0LmJyb3dzZXIgPSAnbm9kZSc7XG4gIGRldGVjdC5icm93c2VyVmVyc2lvbiA9IGRldGVjdC52ZXJzaW9uID0gJz8nOyAvLyBUT0RPOiBnZXQgbm9kZSB2ZXJzaW9uXG59IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gICMjIHJ0Yy1jb3JlL3Jlc2V0XG5cbiAgVGhpcyBpcyBhIHNpbXBsZSwgY3Jvc3MtYnJvd3NlciBtZXRob2QgZm9yIHJlc2V0dGluZyBhIG1lZGlhIGVsZW1lbnRcbiAgYmFjayB0byBhIGluaXRpYWwgc3RhdGUgYWZ0ZXIgaGF2aW5nIG1lZGlhIGF0dGFjaGVkLlxuXG4qKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZWwpIHtcbiAgLy8gcmVtb3ZlIHRoZSBzb3VyY2VcbiAgZWwuc3JjID0gbnVsbDtcblxuICAvLyBjaGVjayBmb3IgbW96XG4gIGlmIChlbC5tb3pTcmNPYmplY3QpIHtcbiAgICBlbC5tb3pTcmNPYmplY3QgPSBudWxsO1xuICB9XG5cbiAgLy8gY2hlY2sgZm9yIGN1cnJlbnRTcmNcbiAgaWYgKGVsLmN1cnJlbnRTcmMpIHtcbiAgICBlbC5jdXJyZW50U3JjID0gbnVsbDtcbiAgfVxuXG4gIC8vIHJldHVybiB0aGUgaW5wdXQgKG1hcCBmcmllbmRseSlcbiAgcmV0dXJuIGVsO1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuLyogZ2xvYmFsIG5hdmlnYXRvcjogZmFsc2UgKi9cbi8qIGdsb2JhbCB3aW5kb3c6IGZhbHNlICovXG4vKiBnbG9iYWwgZG9jdW1lbnQ6IGZhbHNlICovXG4vKiBnbG9iYWwgTWVkaWFTdHJlYW06IGZhbHNlICovXG4vKiBnbG9iYWwgSFRNTFZpZGVvRWxlbWVudDogZmFsc2UgKi9cbi8qIGdsb2JhbCBIVE1MQXVkaW9FbGVtZW50OiBmYWxzZSAqL1xuXG4vKipcbiAgIyBydGMtbWVkaWFcblxuICBTaW1wbGUgW2dldFVzZXJNZWRpYV0oaHR0cDovL2Rldi53My5vcmcvMjAxMS93ZWJydGMvZWRpdG9yL2dldHVzZXJtZWRpYS5odG1sKVxuICBjcm9zcy1icm93c2VyIHdyYXBwZXJzLiAgUGFydCBvZiB0aGUgW3J0Yy5pb10oaHR0cDovL3J0Yy5pby8pIHN1aXRlLCB3aGljaCBpc1xuICBzcG9uc29yZWQgYnkgW05JQ1RBXShodHRwOi8vb3Blbm5pY3RhLmNvbSkgYW5kIHJlbGVhc2VkIHVuZGVyIGFuXG4gIFtBcGFjaGUgMi4wIGxpY2Vuc2VdKC9MSUNFTlNFKS5cblxuICAjIyBFeGFtcGxlIFVzYWdlXG5cbiAgQ2FwdHVyaW5nIG1lZGlhIG9uIHlvdXIgbWFjaGluZSBpcyBhcyBzaW1wbGUgYXM6XG5cbiAgYGBganNcbiAgcmVxdWlyZSgncnRjLW1lZGlhJykoKTtcbiAgYGBgXG5cbiAgV2hpbGUgdGhpcyB3aWxsIGluIGZhY3Qgc3RhcnQgdGhlIHVzZXIgbWVkaWEgY2FwdHVyZSBwcm9jZXNzLCBpdCB3b24ndFxuICBkbyBhbnl0aGluZyB3aXRoIGl0LiAgTGV0cyB0YWtlIGEgbG9vayBhdCBhIG1vcmUgcmVhbGlzdGljIGV4YW1wbGU6XG5cbiAgPDw8IGV4YW1wbGVzL3JlbmRlci10by1ib2R5LmpzXG5cbiAgW3J1biBvbiByZXF1aXJlYmluXShodHRwOi8vcmVxdWlyZWJpbi5jb20vP2dpc3Q9NjA4NTQ1MClcblxuICBJbiB0aGUgY29kZSBhYm92ZSwgd2UgYXJlIGNyZWF0aW5nIGEgbmV3IGluc3RhbmNlIG9mIG91ciB1c2VyTWVkaWEgd3JhcHBlclxuICB1c2luZyB0aGUgYG1lZGlhKClgIGNhbGwgYW5kIHRoZW4gdGVsbGluZyBpdCB0byByZW5kZXIgdG8gdGhlXG4gIGBkb2N1bWVudC5ib2R5YCBvbmNlIHZpZGVvIHN0YXJ0cyBzdHJlYW1pbmcuICBXZSBjYW4gZnVydGhlciBleHBhbmQgdGhlXG4gIGNvZGUgb3V0IHRvIHRoZSBmb2xsb3dpbmcgdG8gYWlkIG91ciB1bmRlcnN0YW5kaW5nIG9mIHdoYXQgaXMgZ29pbmcgb246XG5cbiAgPDw8IGV4YW1wbGVzL2NhcHR1cmUtZXhwbGljaXQuanNcblxuICBUaGUgY29kZSBhYm92ZSBpcyB3cml0dGVuIGluIGEgbW9yZSB0cmFkaXRpb25hbCBKUyBzdHlsZSwgYnV0IGZlZWwgZnJlZVxuICB0byB1c2UgdGhlIGZpcnN0IHN0eWxlIGFzIGl0J3MgcXVpdGUgc2FmZSAodGhhbmtzIHRvIHNvbWUgY2hlY2tzIGluIHRoZVxuICBjb2RlKS5cblxuICAjIyMgRXZlbnRzXG5cbiAgT25jZSBhIG1lZGlhIG9iamVjdCBoYXMgYmVlbiBjcmVhdGVkLCBpdCB3aWxsIHByb3ZpZGUgYSBudW1iZXIgb2YgZXZlbnRzXG4gIHRocm91Z2ggdGhlIHN0YW5kYXJkIG5vZGUgRXZlbnRFbWl0dGVyIEFQSS5cblxuICAjIyMjIGBjYXB0dXJlYFxuXG4gIFRoZSBgY2FwdHVyZWAgZXZlbnQgaXMgdHJpZ2dlcmVkIG9uY2UgdGhlIHJlcXVlc3RlZCBtZWRpYSBzdHJlYW0gaGFzXG4gIGJlZW4gY2FwdHVyZWQgYnkgdGhlIGJyb3dzZXIuXG5cbiAgPDw8IGV4YW1wbGVzL2NhcHR1cmUtZXZlbnQuanNcblxuICAjIyMjIGByZW5kZXJgXG5cbiAgVGhlIGByZW5kZXJgIGV2ZW50IGlzIHRyaWdnZXJlZCBvbmNlIHRoZSBzdHJlYW0gaGFzIGJlZW4gcmVuZGVyZWRcbiAgdG8gdGhlIGFueSBzdXBwbGllZCAob3IgY3JlYXRlZCkgdmlkZW8gZWxlbWVudHMuXG5cbiAgV2hpbGUgaXQgbWlnaHQgc2VlbSBhIGxpdHRsZSBjb25mdXNpbmcgdGhhdCB3aGVuIHRoZSBgcmVuZGVyYCBldmVudFxuICBmaXJlcyB0aGF0IGl0IHJldHVybnMgYW4gYXJyYXkgb2YgZWxlbWVudHMgcmF0aGVyIHRoYW4gYSBzaW5nbGUgZWxlbWVudFxuICAod2hpY2ggaXMgd2hhdCBpcyBwcm92aWRlZCB3aGVuIGNhbGxpbmcgdGhlIGByZW5kZXJgIG1ldGhvZCkuXG5cbiAgVGhpcyBvY2N1cnMgYmVjYXVzZSBpdCBpcyBjb21wbGV0ZWx5IHZhbGlkIHRvIHJlbmRlciBhIHNpbmdsZSBjYXB0dXJlZFxuICBtZWRpYSBzdHJlYW0gdG8gbXVsdGlwbGUgbWVkaWEgZWxlbWVudHMgb24gYSBwYWdlLiAgVGhlIGByZW5kZXJgIGV2ZW50XG4gIGlzIHJlcG9ydGluZyBvbmNlIHRoZSByZW5kZXIgb3BlcmF0aW9uIGhhcyBjb21wbGV0ZWQgZm9yIGFsbCB0YXJnZXRzIHRoYXRcbiAgaGF2ZSBiZWVuIHJlZ2lzdGVyZWQgd2l0aCB0aGUgY2FwdHVyZSBzdHJlYW0uXG5cbiAgIyMgUmVmZXJlbmNlXG5cbioqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKSgnbWVkaWEnKTtcbnZhciBleHRlbmQgPSByZXF1aXJlKCdjb2cvZXh0ZW5kJyk7XG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgncnRjLWNvcmUvZGV0ZWN0Jyk7XG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbi8vIG1vbmtleSBwYXRjaCBnZXRVc2VyTWVkaWEgZnJvbSB0aGUgcHJlZml4ZWQgdmVyc2lvblxubmF2aWdhdG9yLmdldFVzZXJNZWRpYSA9IG5hdmlnYXRvci5nZXRVc2VyTWVkaWEgfHxcbiAgZGV0ZWN0LmNhbGwobmF2aWdhdG9yLCAnZ2V0VXNlck1lZGlhJyk7XG5cbi8vIHBhdGNoIHdpbmRvdyB1cmxcbndpbmRvdy5VUkwgPSB3aW5kb3cuVVJMIHx8IGRldGVjdCgnVVJMJyk7XG5cbi8vIHBhdGNoIG1lZGlhIHN0cmVhbVxud2luZG93Lk1lZGlhU3RyZWFtID0gZGV0ZWN0KCdNZWRpYVN0cmVhbScpO1xuXG4vKipcbiAgIyMjIG1lZGlhXG5cbiAgYGBgXG4gIG1lZGlhKG9wdHM/KVxuICBgYGBcblxuICBDYXB0dXJlIG1lZGlhIHVzaW5nIHRoZSB1bmRlcmx5aW5nXG4gIFtnZXRVc2VyTWVkaWFdKGh0dHA6Ly93d3cudzMub3JnL1RSL21lZGlhY2FwdHVyZS1zdHJlYW1zLykgQVBJLlxuXG4gIFRoZSBmdW5jdGlvbiBhY2NlcHRzIGEgc2luZ2xlIGFyZ3VtZW50IHdoaWNoIGNhbiBiZSBlaXRoZXIgYmU6XG5cbiAgLSBhLiBBbiBvcHRpb25zIG9iamVjdCAoc2VlIGJlbG93KSwgb3I7XG4gIC0gYi4gQW4gZXhpc3RpbmdcbiAgICBbTWVkaWFTdHJlYW1dKGh0dHA6Ly93d3cudzMub3JnL1RSL21lZGlhY2FwdHVyZS1zdHJlYW1zLyNtZWRpYXN0cmVhbSkgdGhhdFxuICAgIHRoZSBtZWRpYSBvYmplY3Qgd2lsbCBiaW5kIHRvIGFuZCBwcm92aWRlIHlvdSBzb21lIERPTSBoZWxwZXJzIGZvci5cblxuICBUaGUgZnVuY3Rpb24gc3VwcG9ydHMgdGhlIGZvbGxvd2luZyBvcHRpb25zOlxuXG4gIC0gYGNhcHR1cmVgIC0gV2hldGhlciBjYXB0dXJlIHNob3VsZCBiZSBpbml0aWF0ZWQgYXV0b21hdGljYWxseS4gRGVmYXVsdHNcbiAgICB0byB0cnVlLCBidXQgdG9nZ2xlZCB0byBmYWxzZSBhdXRvbWF0aWNhbGx5IGlmIGFuIGV4aXN0aW5nIHN0cmVhbSBpc1xuICAgIHByb3ZpZGVkLlxuXG4gIC0gYG11dGVkYCAtIFdoZXRoZXIgdGhlIHZpZGVvIGVsZW1lbnQgY3JlYXRlZCBmb3IgdGhpcyBzdHJlYW0gc2hvdWxkIGJlXG4gICAgbXV0ZWQuICBEZWZhdWx0IGlzIHRydWUgYnV0IGlzIHNldCB0byBmYWxzZSB3aGVuIGFuIGV4aXN0aW5nIHN0cmVhbSBpc1xuICAgIHBhc3NlZC5cblxuICAtIGBjb25zdHJhaW50c2AgLSBUaGUgY29uc3RyYWludCBvcHRpb24gYWxsb3dzIHlvdSB0byBzcGVjaWZ5IHBhcnRpY3VsYXJcbiAgICBtZWRpYSBjYXB0dXJlIGNvbnN0cmFpbnRzIHdoaWNoIGNhbiBhbGxvdyB5b3UgZG8gZG8gc29tZSBwcmV0dHkgY29vbFxuICAgIHRyaWNrcy4gIEJ5IGRlZmF1bHQsIHRoZSBjb250cmFpbnRzIHVzZWQgdG8gcmVxdWVzdCB0aGUgbWVkaWEgYXJlXG4gICAgZmFpcmx5IHN0YW5kYXJkIGRlZmF1bHRzOlxuXG4gICAgYGBganNcbiAgICAgIHtcbiAgICAgICAgdmlkZW86IHtcbiAgICAgICAgICBtYW5kYXRvcnk6IHt9LFxuICAgICAgICAgIG9wdGlvbmFsOiBbXVxuICAgICAgICB9LFxuICAgICAgICBhdWRpbzogdHJ1ZVxuICAgICAgfVxuICAgIGBgYFxuXG4qKi9cbmZ1bmN0aW9uIE1lZGlhKG9wdHMpIHtcbiAgaWYgKCEgKHRoaXMgaW5zdGFuY2VvZiBNZWRpYSkpIHtcbiAgICByZXR1cm4gbmV3IE1lZGlhKG9wdHMpO1xuICB9XG5cbiAgLy8gaW5oZXJpdGVkXG4gIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG4gIC8vIGlmIHRoZSBvcHRzIGlzIGEgbWVkaWEgc3RyZWFtIGluc3RhbmNlLCB0aGVuIGhhbmRsZSB0aGF0IGFwcHJvcHJpYXRlbHlcbiAgaWYgKG9wdHMgJiYgb3B0cyBpbnN0YW5jZW9mIE1lZGlhU3RyZWFtKSB7XG4gICAgb3B0cyA9IHtcbiAgICAgIHN0cmVhbTogb3B0cyxcbiAgICAgIGNhcHR1cmU6IGZhbHNlLFxuICAgICAgbXV0ZWQ6IGZhbHNlXG4gICAgfTtcbiAgfVxuXG4gIC8vIGlmIHdlJ3ZlIGJlZW4gcGFzc2VkIG9wdHMgYW5kIHRoZXkgbG9vayBsaWtlIGNvbnN0cmFpbnRzLCBtb3ZlIHRoaW5nc1xuICAvLyBhcm91bmQgYSBsaXR0bGVcbiAgaWYgKG9wdHMgJiYgKG9wdHMuYXVkaW8gfHwgb3B0cy52aWRlbykpIHtcbiAgICBvcHRzID0ge1xuICAgICAgY29uc3RyYWludHM6IG9wdHNcbiAgICB9O1xuICB9XG5cbiAgLy8gZW5zdXJlIHdlIGhhdmUgb3B0c1xuICBvcHRzID0gZXh0ZW5kKHt9LCB7XG4gICAgY2FwdHVyZTogdHJ1ZSxcbiAgICBtdXRlZDogdHJ1ZSxcbiAgICBjb25zdHJhaW50czoge1xuICAgICAgdmlkZW86IHtcbiAgICAgICAgbWFuZGF0b3J5OiB7fSxcbiAgICAgICAgb3B0aW9uYWw6IFtdXG4gICAgICB9LFxuICAgICAgYXVkaW86IHRydWVcbiAgICB9XG4gIH0sIG9wdHMpO1xuXG4gIC8vIHNhdmUgdGhlIGNvbnN0cmFpbnRzXG4gIHRoaXMuY29uc3RyYWludHMgPSBvcHRzLmNvbnN0cmFpbnRzO1xuXG4gIC8vIGlmIGEgbmFtZSBoYXMgYmVlbiBzcGVjaWZpZWQgaW4gdGhlIG9wdHMsIHNhdmUgaXQgdG8gdGhlIG1lZGlhXG4gIHRoaXMubmFtZSA9IG9wdHMubmFtZTtcblxuICAvLyBpbml0aWFsaXNlIHRoZSBzdHJlYW0gdG8gbnVsbFxuICB0aGlzLnN0cmVhbSA9IG9wdHMuc3RyZWFtIHx8IG51bGw7XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgbXV0ZWQgc3RhdGVcbiAgdGhpcy5tdXRlZCA9IHR5cGVvZiBvcHRzLm11dGVkID09ICd1bmRlZmluZWQnIHx8IG9wdHMubXV0ZWQ7XG5cbiAgLy8gY3JlYXRlIGEgYmluZGluZ3MgYXJyYXkgc28gd2UgaGF2ZSBhIHJvdWdoIGlkZWEgb2Ygd2hlcmVcbiAgLy8gd2UgaGF2ZSBiZWVuIGF0dGFjaGVkIHRvXG4gIC8vIFRPRE86IHJldmlzaXQgd2hldGhlciB0aGlzIGlzIHRoZSBiZXN0IHdheSB0byBtYW5hZ2UgdGhpc1xuICB0aGlzLl9iaW5kaW5ncyA9IFtdO1xuXG4gIC8vIGlmIHdlIGFyZSBhdXRvc3RhcnRpbmcsIGNhcHR1cmUgbWVkaWEgb24gdGhlIG5leHQgdGlja1xuICBpZiAob3B0cy5jYXB0dXJlKSB7XG4gICAgc2V0VGltZW91dCh0aGlzLmNhcHR1cmUuYmluZCh0aGlzKSwgMCk7XG4gIH1cbn1cblxudXRpbC5pbmhlcml0cyhNZWRpYSwgRXZlbnRFbWl0dGVyKTtcbm1vZHVsZS5leHBvcnRzID0gTWVkaWE7XG5cbi8qKlxuICAjIyMgY2FwdHVyZVxuXG4gIGBgYFxuICBjYXB0dXJlKGNvbnN0cmFpbnRzLCBjYWxsYmFjaylcbiAgYGBgXG5cbiAgQ2FwdHVyZSBtZWRpYS4gIElmIGNvbnN0cmFpbnRzIGFyZSBwcm92aWRlZCwgdGhlbiB0aGV5IHdpbGxcbiAgb3ZlcnJpZGUgdGhlIGRlZmF1bHQgY29uc3RyYWludHMgdGhhdCB3ZXJlIHVzZWQgd2hlbiB0aGUgbWVkaWEgb2JqZWN0IHdhc1xuICBjcmVhdGVkLlxuKiovXG5NZWRpYS5wcm90b3R5cGUuY2FwdHVyZSA9IGZ1bmN0aW9uKGNvbnN0cmFpbnRzLCBjYWxsYmFjaykge1xuICB2YXIgbWVkaWEgPSB0aGlzO1xuICB2YXIgaGFuZGxlRW5kID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ2VuZCcpO1xuXG4gIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIHN0cmVhbSwgdGhlbiBhYm9ydFxuICBpZiAodGhpcy5zdHJlYW0pIHsgcmV0dXJuOyB9XG5cbiAgLy8gaWYgbm8gY29uc3RyYWludHMgaGF2ZSBiZWVuIHByb3ZpZGVkLCBidXQgd2UgaGF2ZVxuICAvLyBhIGNhbGxiYWNrLCBkZWFsIHdpdGggaXRcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50cyA9PSAnZnVuY3Rpb24nKSB7XG4gICAgY2FsbGJhY2sgPSBjb25zdHJhaW50cztcbiAgICBjb25zdHJhaW50cyA9IHRoaXMuY29uc3RyYWludHM7XG4gIH1cblxuICAvLyBpZiB3ZSBoYXZlIGEgY2FsbGJhY2ssIGJpbmQgdG8gdGhlIHN0YXJ0IGV2ZW50XG4gIGlmICh0eXBlb2YgY2FsbGJhY2sgPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRoaXMub25jZSgnY2FwdHVyZScsIGNhbGxiYWNrLmJpbmQodGhpcykpO1xuICB9XG5cbiAgLy8gZ2V0IHVzZXIgbWVkaWEsIHVzaW5nIGVpdGhlciB0aGUgcHJvdmlkZWQgY29uc3RyYWludHMgb3IgdGhlXG4gIC8vIGRlZmF1bHQgY29uc3RyYWludHNcbiAgbmF2aWdhdG9yLmdldFVzZXJNZWRpYShcbiAgICBjb25zdHJhaW50cyB8fCB0aGlzLmNvbnN0cmFpbnRzLFxuICAgIGZ1bmN0aW9uKHN0cmVhbSkge1xuICAgICAgaWYgKHR5cGVvZiBzdHJlYW0uYWRkRXZlbnRMaXN0ZW5lciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHN0cmVhbS5hZGRFdmVudExpc3RlbmVyKCdlbmRlZCcsIGhhbmRsZUVuZCk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgc3RyZWFtLm9uZW5kZWQgPSBoYW5kbGVFbmQ7XG4gICAgICB9XG5cbiAgICAgIC8vIHNhdmUgdGhlIHN0cmVhbSBhbmQgZW1pdCB0aGUgc3RhcnQgbWV0aG9kXG4gICAgICBtZWRpYS5zdHJlYW0gPSBzdHJlYW07XG4gICAgICBtZWRpYS5lbWl0KCdjYXB0dXJlJywgc3RyZWFtKTtcbiAgICB9LFxuICAgIHRoaXMuX2hhbmRsZUZhaWwuYmluZCh0aGlzKVxuICApO1xufTtcblxuLyoqXG4gICMjIyByZW5kZXJcblxuICBgYGBqc1xuICByZW5kZXIodGFyZ2V0LCBvcHRzPywgY2FsbGJhY2s/KVxuICBgYGBcblxuICBSZW5kZXIgdGhlIGNhcHR1cmVkIG1lZGlhIHRvIHRoZSBzcGVjaWZpZWQgdGFyZ2V0IGVsZW1lbnQuICBXaGlsZSBwcmV2aW91c1xuICB2ZXJzaW9ucyBvZiBydGMtbWVkaWEgYWNjZXB0ZWQgYSBzZWxlY3RvciBzdHJpbmcgb3IgYW4gYXJyYXkgb2YgZWxlbWVudHNcbiAgdGhpcyBoYXMgYmVlbiBkcm9wcGVkIGluIGZhdm91ciBvZiBfX29uZSBzaW5nbGUgdGFyZ2V0IGVsZW1lbnRfXy5cblxuICBJZiB0aGUgdGFyZ2V0IGVsZW1lbnQgaXMgYSB2YWxpZCBNZWRpYUVsZW1lbnQgdGhlbiBpdCB3aWxsIGJlY29tZSB0aGVcbiAgdGFyZ2V0IG9mIHRoZSBjYXB0dXJlZCBtZWRpYSBzdHJlYW0uICBJZiwgaG93ZXZlciwgaXQgaXMgYSBnZW5lcmljIERPTVxuICBlbGVtZW50IGl0IHdpbGwgYSBuZXcgTWVkaWEgZWxlbWVudCB3aWxsIGJlIGNyZWF0ZWQgdGhhdCB1c2luZyB0aGUgdGFyZ2V0XG4gIGFzIGl0J3MgcGFyZW50LlxuXG4gIEEgc2ltcGxlIGV4YW1wbGUgb2YgcmVxdWVzdGluZyBkZWZhdWx0IG1lZGlhIGNhcHR1cmUgYW5kIHJlbmRlcmluZyB0byB0aGVcbiAgZG9jdW1lbnQgYm9keSBpcyBzaG93biBiZWxvdzpcblxuICA8PDwgZXhhbXBsZXMvcmVuZGVyLXRvLWJvZHkuanNcblxuICBZb3UgbWF5IG9wdGlvbmFsbHkgcHJvdmlkZSBhIGNhbGxiYWNrIHRvIHRoaXMgZnVuY3Rpb24sIHdoaWNoIGlzXG4gIHdpbGwgYmUgdHJpZ2dlcmVkIG9uY2UgZWFjaCBvZiB0aGUgbWVkaWEgZWxlbWVudHMgaGFzIHN0YXJ0ZWQgcGxheWluZ1xuICB0aGUgc3RyZWFtOlxuXG4gIDw8PCBleGFtcGxlcy9yZW5kZXItY2FwdHVyZS1jYWxsYmFjay5qc1xuXG4qKi9cbk1lZGlhLnByb3RvdHlwZS5yZW5kZXIgPSBmdW5jdGlvbih0YXJnZXQsIG9wdHMsIGNhbGxiYWNrKSB7XG4gIC8vIGlmIHRoZSB0YXJnZXQgaXMgYW4gYXJyYXksIGV4dHJhY3QgdGhlIGZpcnN0IGVsZW1lbnRcbiAgaWYgKEFycmF5LmlzQXJyYXkodGFyZ2V0KSkge1xuICAgIC8vIGxvZyBhIHdhcm5pbmdcbiAgICBjb25zb2xlLmxvZygnV0FSTklORzogcnRjLW1lZGlhIHJlbmRlciAoYXMgb2YgMS54KSBleHBlY3RzIGEgc2luZ2xlIHRhcmdldCcpO1xuICAgIHRhcmdldCA9IHRhcmdldFswXTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb3B0cyA9PSAnZnVuY3Rpb24nKSB7XG4gICAgY2FsbGJhY2sgPSBvcHRzO1xuICAgIG9wdHMgPSB7fTtcbiAgfVxuXG4gIC8vIGVuc3VyZSB3ZSBoYXZlIG9wdHNcbiAgb3B0cyA9IG9wdHMgfHwge307XG5cbiAgLy8gY3JlYXRlIHRoZSB2aWRlbyAvIGF1ZGlvIGVsZW1lbnRzXG4gIHRhcmdldCA9IHRoaXMuX3ByZXBhcmVFbGVtZW50KG9wdHMsIHRhcmdldCk7XG5cbiAgLy8gaWYgbm8gc3RyZWFtIHdhcyBzcGVjaWZpZWQsIHdhaXQgZm9yIHRoZSBzdHJlYW0gdG8gaW5pdGlhbGl6ZVxuICBpZiAoISB0aGlzLnN0cmVhbSkge1xuICAgIHRoaXMub25jZSgnY2FwdHVyZScsIHRoaXMuX2JpbmRTdHJlYW0uYmluZCh0aGlzKSk7XG4gIH1cbiAgLy8gb3RoZXJ3aXNlLCBiaW5kIHRoZSBzdHJlYW0gbm93XG4gIGVsc2Uge1xuICAgIHRoaXMuX2JpbmRTdHJlYW0odGhpcy5zdHJlYW0pO1xuICB9XG5cbiAgLy8gaWYgd2UgaGF2ZSBhIGNhbGxiYWNrIHRoZW4gdHJpZ2dlciBvbiB0aGUgcmVuZGVyIGV2ZW50XG4gIGlmICh0eXBlb2YgY2FsbGJhY2sgPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRoaXMub25jZSgncmVuZGVyJywgY2FsbGJhY2spO1xuICB9XG5cbiAgcmV0dXJuIHRhcmdldDtcbn07XG5cbi8qKlxuICAjIyMgc3RvcCgpXG5cbiAgU3RvcCB0aGUgbWVkaWEgc3RyZWFtXG4qKi9cbk1lZGlhLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24ob3B0cykge1xuICB2YXIgbWVkaWEgPSB0aGlzO1xuXG4gIGlmICghIHRoaXMuc3RyZWFtKSB7IHJldHVybjsgfVxuXG4gIC8vIHJlbW92ZSBiaW5kaW5nc1xuICB0aGlzLl91bmJpbmQob3B0cyk7XG5cbiAgLy8gc3RvcCB0aGUgc3RyZWFtLCBhbmQgdGVsbCB0aGUgd29ybGRcbiAgdGhpcy5zdHJlYW0uc3RvcCgpO1xuXG4gIC8vIG9uIGNhcHR1cmUgcmViaW5kXG4gIHRoaXMub25jZSgnY2FwdHVyZScsIG1lZGlhLl9iaW5kU3RyZWFtLmJpbmQobWVkaWEpKTtcblxuICAvLyByZW1vdmUgdGhlIHJlZmVyZW5jZSB0byB0aGUgc3RyZWFtXG4gIHRoaXMuc3RyZWFtID0gbnVsbDtcbn07XG5cbi8qKlxuICAjIyBEZWJ1Z2dpbmcgVGlwc1xuXG4gIENocm9tZSBhbmQgQ2hyb21pdW0gY2FuIGJvdGggYmUgc3RhcnRlZCB3aXRoIHRoZSBmb2xsb3dpbmcgZmxhZzpcblxuICBgYGBcbiAgLS11c2UtZmFrZS1kZXZpY2UtZm9yLW1lZGlhLXN0cmVhbVxuICBgYGBcblxuICBUaGlzIHVzZXMgYSBmYWtlIHN0cmVhbSBmb3IgdGhlIGdldFVzZXJNZWRpYSgpIGNhbGwgcmF0aGVyIHRoYW4gYXR0ZW1wdGluZ1xuICB0byBjYXB0dXJlIHRoZSBhY3R1YWwgY2FtZXJhLiAgVGhpcyBpcyB1c2VmdWwgd2hlbiBkb2luZyBhdXRvbWF0ZWQgdGVzdGluZ1xuICBhbmQgYWxzbyBpZiB5b3Ugd2FudCB0byB0ZXN0IGNvbm5lY3Rpdml0eSBiZXR3ZWVuIHR3byBicm93c2VyIGluc3RhbmNlcyBhbmRcbiAgd2FudCB0byBkaXN0aW5ndWlzaCBiZXR3ZWVuIHRoZSB0d28gbG9jYWwgdmlkZW9zLlxuXG4gICMjIEludGVybmFsIE1ldGhvZHNcblxuICBUaGVyZSBhcmUgYSBudW1iZXIgb2YgaW50ZXJuYWwgbWV0aG9kcyB0aGF0IGFyZSB1c2VkIGluIHRoZSBgcnRjLW1lZGlhYFxuICBpbXBsZW1lbnRhdGlvbi4gVGhlc2UgYXJlIG91dGxpbmVkIGJlbG93LCBidXQgbm90IGV4cGVjdGVkIHRvIGJlIG9mXG4gIGdlbmVyYWwgdXNlLlxuXG4qKi9cblxuLyoqXG4gICMjIyBfcHJlcGFyZUVsZW1lbnQob3B0cywgZWxlbWVudClcblxuICBUaGUgcHJlcGFyZUVsZW1lbnQgZnVuY3Rpb24gaXMgdXNlZCB0byBwcmVwYXJlIERPTSBlbGVtZW50cyB0aGF0IHdpbGxcbiAgcmVjZWl2ZSB0aGUgbWVkaWEgc3RyZWFtcyBvbmNlIHRoZSBzdHJlYW0gaGF2ZSBiZWVuIHN1Y2Nlc3NmdWxseSBjYXB0dXJlZC5cbioqL1xuTWVkaWEucHJvdG90eXBlLl9wcmVwYXJlRWxlbWVudCA9IGZ1bmN0aW9uKG9wdHMsIGVsZW1lbnQpIHtcbiAgdmFyIHBhcmVudDtcbiAgdmFyIHZhbGlkRWxlbWVudCA9IChlbGVtZW50IGluc3RhbmNlb2YgSFRNTFZpZGVvRWxlbWVudCkgfHxcbiAgICAgICAgKGVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MQXVkaW9FbGVtZW50KTtcbiAgdmFyIHByZXNlcnZlQXNwZWN0UmF0aW8gPVxuICAgICAgICB0eXBlb2Ygb3B0cy5wcmVzZXJ2ZUFzcGVjdFJhdGlvID09ICd1bmRlZmluZWQnIHx8XG4gICAgICAgIG9wdHMucHJlc2VydmVBc3BlY3RSYXRpbztcblxuICAvLyBwZXJmb3JtIHNvbWUgYWRkaXRpb25hbCBjaGVja3MgZm9yIHRoaW5ncyB0aGF0IFwibG9va1wiIGxpa2UgYVxuICAvLyBtZWRpYSBlbGVtZW50XG4gIHZhbGlkRWxlbWVudCA9IHZhbGlkRWxlbWVudCB8fCAodHlwZW9mIGVsZW1lbnQucGxheSA9PSAnZnVuY3Rpb24nKSAmJiAoXG4gICAgdHlwZW9mIGVsZW1lbnQubW96U3JjT2JqZWN0ICE9ICd1bmRlZmluZWQnIHx8XG4gICAgdHlwZW9mIGVsZW1lbnQuc3JjICE9ICd1bmRlZmluZWQnKTtcblxuICAvLyBpZiB0aGUgZWxlbWVudCBpcyBub3QgYSB2aWRlbyBlbGVtZW50LCB0aGVuIGNyZWF0ZSBvbmVcbiAgaWYgKCEgdmFsaWRFbGVtZW50KSB7XG4gICAgcGFyZW50ID0gZWxlbWVudDtcblxuICAgIC8vIGNyZWF0ZSBhIG5ldyB2aWRlbyBlbGVtZW50XG4gICAgLy8gVE9ETzogY3JlYXRlIGFuIGFwcHJvcHJpYXRlIGVsZW1lbnQgYmFzZWQgb24gdGhlIHR5cGVzIG9mIHRyYWNrc1xuICAgIC8vIGF2YWlsYWJsZVxuICAgIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd2aWRlbycpO1xuXG4gICAgLy8gaWYgd2UgYXJlIHByZXNlcnZpbmcgYXNwZWN0IHJhdGlvIGRvIHRoYXQgbm93XG4gICAgaWYgKHByZXNlcnZlQXNwZWN0UmF0aW8pIHtcbiAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJycpO1xuICAgIH1cblxuICAgIC8vIGFkZCB0byB0aGUgcGFyZW50XG4gICAgcGFyZW50LmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLXBsYXlpbmcnLCBmYWxzZSk7XG4gIH1cblxuICAvLyBpZiBtdXRlZCwgaW5qZWN0IHRoZSBtdXRlZCBhdHRyaWJ1dGVcbiAgaWYgKGVsZW1lbnQgJiYgdGhpcy5tdXRlZCkge1xuICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdtdXRlZCcsICcnKTtcbiAgfVxuXG4gIC8vIGZsYWcgdGhlIGVsZW1lbnQgYXMgYm91bmRcbiAgdGhpcy5fYmluZGluZ3MucHVzaCh7XG4gICAgZWw6IGVsZW1lbnQsXG4gICAgb3B0czogb3B0c1xuICB9KTtcblxuICByZXR1cm4gZWxlbWVudDtcbn07XG5cbi8qKlxuICAjIyMgX2JpbmRTdHJlYW0oc3RyZWFtKVxuXG4gIEJpbmQgYSBzdHJlYW0gdG8gcHJldmlvdXNseSBwcmVwYXJlZCBET00gZWxlbWVudHMuXG5cbioqL1xuTWVkaWEucHJvdG90eXBlLl9iaW5kU3RyZWFtID0gZnVuY3Rpb24oc3RyZWFtKSB7XG4gIHZhciBtZWRpYSA9IHRoaXM7XG4gIHZhciBlbGVtZW50cyA9IFtdO1xuICB2YXIgd2FpdGluZyA9IFtdO1xuXG4gIGZ1bmN0aW9uIGNoZWNrV2FpdGluZygpIHtcbiAgICAvLyBpZiB3ZSBoYXZlIG5vIHdhaXRpbmcgZWxlbWVudHMsIGJ1dCBzb21lIGVsZW1lbnRzXG4gICAgLy8gdHJpZ2dlciB0aGUgc3RhcnQgZXZlbnRcbiAgICBpZiAod2FpdGluZy5sZW5ndGggPT09IDAgJiYgZWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgbWVkaWEuZW1pdCgncmVuZGVyJywgZWxlbWVudHNbMF0pO1xuXG4gICAgICBlbGVtZW50cy5tYXAoZnVuY3Rpb24oZWwpIHtcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlKCdkYXRhLXBsYXlpbmcnLCB0cnVlKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBsYXliYWNrU3RhcnRlZChldnQpIHtcbiAgICB2YXIgZWwgPSBldnQudGFyZ2V0IHx8IGV2dC5zcmNFbGVtZW50O1xuICAgIHZhciB2aWRlb0luZGV4ID0gZWxlbWVudHMuaW5kZXhPZihlbCk7XG5cbiAgICBpZiAodmlkZW9JbmRleCA+PSAwKSB7XG4gICAgICB3YWl0aW5nLnNwbGljZSh2aWRlb0luZGV4LCAxKTtcbiAgICB9XG5cbiAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdwbGF5aW5nJywgcGxheWJhY2tTdGFydGVkKTtcbiAgICBjaGVja1dhaXRpbmcoKTtcbiAgfVxuXG4gIC8vIGl0ZXJhdGUgdGhyb3VnaCB0aGUgYmluZGluZ3MgYW5kIGJpbmQgdGhlIHN0cmVhbVxuICBlbGVtZW50cyA9IHRoaXMuX2JpbmRpbmdzLm1hcChmdW5jdGlvbihiaW5kaW5nKSB7XG4gICAgLy8gY2hlY2sgZm9yIG1velNyY09iamVjdFxuICAgIGlmICh0eXBlb2YgYmluZGluZy5lbC5tb3pTcmNPYmplY3QgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGJpbmRpbmcuZWwubW96U3JjT2JqZWN0ID0gc3RyZWFtO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGJpbmRpbmcuZWwuc3JjID0gbWVkaWEuX2NyZWF0ZU9iamVjdFVSTChzdHJlYW0pIHx8IHN0cmVhbTtcbiAgICB9XG5cbiAgICAvLyBhdHRlbXB0IHRvIHBsYXkgdGhlIHZpZGVvXG4gICAgaWYgKHR5cGVvZiBiaW5kaW5nLmVsLnBsYXkgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgYmluZGluZy5lbC5wbGF5KCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJpbmRpbmcuZWw7XG4gIH0pO1xuXG4gIC8vIGZpbmQgdGhlIGVsZW1lbnRzIHdlIGFyZSB3YWl0aW5nIG9uXG4gIHdhaXRpbmcgPSBlbGVtZW50cy5maWx0ZXIoZnVuY3Rpb24oZWwpIHtcbiAgICByZXR1cm4gZWwucmVhZHlTdGF0ZSA8IDM7IC8vIHJlYWR5c3RhdGUgPCBIQVZFX0ZVVFVSRV9EQVRBXG4gIH0pO1xuXG4gIC8vIHdhaXQgZm9yIGFsbCB0aGUgdmlkZW8gZWxlbWVudHNcbiAgd2FpdGluZy5tYXAoZnVuY3Rpb24oZWwpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdwbGF5aW5nJywgcGxheWJhY2tTdGFydGVkLCBmYWxzZSk7XG4gIH0pO1xuXG4gIGNoZWNrV2FpdGluZygpO1xufTtcblxuLyoqXG4gICMjIyBfdW5iaW5kKClcblxuICBHcmFjZWZ1bGx5IGRldGFjaCBlbGVtZW50cyB0aGF0IGFyZSB1c2luZyB0aGUgc3RyZWFtIGZyb20gdGhlXG4gIGN1cnJlbnQgc3RyZWFtLlxuKiovXG5NZWRpYS5wcm90b3R5cGUuX3VuYmluZCA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgLy8gZW5zdXJlIHdlIGhhdmUgb3B0c1xuICBvcHRzID0gb3B0cyB8fCB7fTtcblxuICAvLyBpdGVyYXRlIHRocm91Z2ggdGhlIGJpbmRpbmdzIGFuZCBkZXRhY2ggc3RyZWFtc1xuICB0aGlzLl9iaW5kaW5ncy5mb3JFYWNoKGZ1bmN0aW9uKGJpbmRpbmcpIHtcbiAgICB2YXIgZWxlbWVudCA9IGJpbmRpbmcuZWw7XG5cbiAgICAvLyByZW1vdmUgdGhlIHNvdXJjZVxuICAgIGVsZW1lbnQuc3JjID0gbnVsbDtcblxuICAgIC8vIGNoZWNrIGZvciBtb3pcbiAgICBpZiAoZWxlbWVudC5tb3pTcmNPYmplY3QpIHtcbiAgICAgIGVsZW1lbnQubW96U3JjT2JqZWN0ID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBjaGVjayBmb3IgY3VycmVudFNyY1xuICAgIGlmIChlbGVtZW50LmN1cnJlbnRTcmMpIHtcbiAgICAgIGVsZW1lbnQuY3VycmVudFNyYyA9IG51bGw7XG4gICAgfVxuICB9KTtcbn07XG5cbi8qKlxuICAjIyMgX2NyZWF0ZU9iamVjdFVybChzdHJlYW0pXG5cbiAgVGhpcyBtZXRob2QgaXMgdXNlZCB0byBjcmVhdGUgYW4gb2JqZWN0IHVybCB0aGF0IGNhbiBiZSBhdHRhY2hlZCB0byBhIHZpZGVvXG4gIG9yIGF1ZGlvIGVsZW1lbnQuICBPYmplY3QgdXJscyBhcmUgY2FjaGVkIHRvIGVuc3VyZSBvbmx5IG9uZSBpcyBjcmVhdGVkXG4gIHBlciBzdHJlYW0uXG4qKi9cbk1lZGlhLnByb3RvdHlwZS5fY3JlYXRlT2JqZWN0VVJMID0gZnVuY3Rpb24oc3RyZWFtKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdpbmRvdy5VUkwuY3JlYXRlT2JqZWN0VVJMKHN0cmVhbSk7XG4gIH1cbiAgY2F0Y2ggKGUpIHtcbiAgfVxufTtcblxuLyoqXG4gICMjIyBfaGFuZGxlU3VjY2VzcyhzdHJlYW0pXG5cbiAgSGFuZGxlIHRoZSBzdWNjZXNzIGNvbmRpdGlvbiBvZiBhIGBnZXRVc2VyTWVkaWFgIGNhbGwuXG5cbioqL1xuTWVkaWEucHJvdG90eXBlLl9oYW5kbGVTdWNjZXNzID0gZnVuY3Rpb24oc3RyZWFtKSB7XG4gIC8vIHVwZGF0ZSB0aGUgYWN0aXZlIHN0cmVhbSB0aGF0IHdlIGFyZSBjb25uZWN0ZWQgdG9cbiAgdGhpcy5zdHJlYW0gPSBzdHJlYW07XG5cbiAgLy8gZW1pdCB0aGUgc3RyZWFtIGV2ZW50XG4gIHRoaXMuZW1pdCgnc3RyZWFtJywgc3RyZWFtKTtcbn07XG5cbi8qKlxuICAjIyMgX2hhbmRsZUZhaWwoZXZ0KVxuXG4gIEhhbmRsZSB0aGUgZmFpbHVyZSBjb25kaXRpb24gb2YgYSBgZ2V0VXNlck1lZGlhYCBjYWxsLlxuXG4qKi9cbk1lZGlhLnByb3RvdHlwZS5faGFuZGxlRmFpbCA9IGZ1bmN0aW9uKGVycikge1xuICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbi8qIGdsb2JhbCB3aW5kb3c6IGZhbHNlICovXG4vKiBnbG9iYWwgbmF2aWdhdG9yOiBmYWxzZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuIyMgcnRjLWNvcmUvZGV0ZWN0XG5cbkEgYnJvd3NlciBkZXRlY3Rpb24gaGVscGVyIGZvciBhY2Nlc3NpbmcgcHJlZml4LWZyZWUgdmVyc2lvbnMgb2YgdGhlIHZhcmlvdXNcbldlYlJUQyB0eXBlcy5cblxuIyMjIEV4YW1wbGUgVXNhZ2VcblxuSWYgeW91IHdhbnRlZCB0byBnZXQgdGhlIG5hdGl2ZSBgUlRDUGVlckNvbm5lY3Rpb25gIHByb3RvdHlwZSBpbiBhbnkgYnJvd3NlclxueW91IGNvdWxkIGRvIHRoZSBmb2xsb3dpbmc6XG5cbmBgYGpzXG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgncnRjLWNvcmUvZGV0ZWN0Jyk7IC8vIGFsc28gYXZhaWxhYmxlIGluIHJ0Yy9kZXRlY3RcbnZhciBSVENQZWVyQ29ubmVjdGlvbiA9IGRldGVjdCgnUlRDUGVlckNvbm5lY3Rpb24nKTtcbmBgYFxuXG5UaGlzIHdvdWxkIHByb3ZpZGUgd2hhdGV2ZXIgdGhlIGJyb3dzZXIgcHJlZml4ZWQgdmVyc2lvbiBvZiB0aGVcblJUQ1BlZXJDb25uZWN0aW9uIGlzIGF2YWlsYWJsZSAoYHdlYmtpdFJUQ1BlZXJDb25uZWN0aW9uYCxcbmBtb3pSVENQZWVyQ29ubmVjdGlvbmAsIGV0YykuXG4qKi9cbnZhciBkZXRlY3QgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHRhcmdldCwgcHJlZml4ZXMpIHtcbiAgdmFyIHByZWZpeElkeDtcbiAgdmFyIHByZWZpeDtcbiAgdmFyIHRlc3ROYW1lO1xuICB2YXIgaG9zdE9iamVjdCA9IHRoaXMgfHwgKHR5cGVvZiB3aW5kb3cgIT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiB1bmRlZmluZWQpO1xuXG4gIC8vIGlmIHdlIGhhdmUgbm8gaG9zdCBvYmplY3QsIHRoZW4gYWJvcnRcbiAgaWYgKCEgaG9zdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIGluaXRpYWxpc2UgdG8gZGVmYXVsdCBwcmVmaXhlc1xuICAvLyAocmV2ZXJzZSBvcmRlciBhcyB3ZSB1c2UgYSBkZWNyZW1lbnRpbmcgZm9yIGxvb3ApXG4gIHByZWZpeGVzID0gKHByZWZpeGVzIHx8IFsnbXMnLCAnbycsICdtb3onLCAnd2Via2l0J10pLmNvbmNhdCgnJyk7XG5cbiAgLy8gaXRlcmF0ZSB0aHJvdWdoIHRoZSBwcmVmaXhlcyBhbmQgcmV0dXJuIHRoZSBjbGFzcyBpZiBmb3VuZCBpbiBnbG9iYWxcbiAgZm9yIChwcmVmaXhJZHggPSBwcmVmaXhlcy5sZW5ndGg7IHByZWZpeElkeC0tOyApIHtcbiAgICBwcmVmaXggPSBwcmVmaXhlc1twcmVmaXhJZHhdO1xuXG4gICAgLy8gY29uc3RydWN0IHRoZSB0ZXN0IGNsYXNzIG5hbWVcbiAgICAvLyBpZiB3ZSBoYXZlIGEgcHJlZml4IGVuc3VyZSB0aGUgdGFyZ2V0IGhhcyBhbiB1cHBlcmNhc2UgZmlyc3QgY2hhcmFjdGVyXG4gICAgLy8gc3VjaCB0aGF0IGEgdGVzdCBmb3IgZ2V0VXNlck1lZGlhIHdvdWxkIHJlc3VsdCBpbiBhXG4gICAgLy8gc2VhcmNoIGZvciB3ZWJraXRHZXRVc2VyTWVkaWFcbiAgICB0ZXN0TmFtZSA9IHByZWZpeCArIChwcmVmaXggP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHRhcmdldC5zbGljZSgxKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0KTtcblxuICAgIGlmICh0eXBlb2YgaG9zdE9iamVjdFt0ZXN0TmFtZV0gIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIC8vIHVwZGF0ZSB0aGUgbGFzdCB1c2VkIHByZWZpeFxuICAgICAgZGV0ZWN0LmJyb3dzZXIgPSBkZXRlY3QuYnJvd3NlciB8fCBwcmVmaXgudG9Mb3dlckNhc2UoKTtcblxuICAgICAgLy8gcmV0dXJuIHRoZSBob3N0IG9iamVjdCBtZW1iZXJcbiAgICAgIHJldHVybiBob3N0T2JqZWN0W3RhcmdldF0gPSBob3N0T2JqZWN0W3Rlc3ROYW1lXTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIGRldGVjdCBtb3ppbGxhICh5ZXMsIHRoaXMgZmVlbHMgZGlydHkpXG5kZXRlY3QubW96ID0gdHlwZW9mIG5hdmlnYXRvciAhPSAndW5kZWZpbmVkJyAmJiAhIW5hdmlnYXRvci5tb3pHZXRVc2VyTWVkaWE7XG5cbi8vIGluaXRpYWxpc2UgdGhlIHByZWZpeCBhcyB1bmtub3duXG5kZXRlY3QuYnJvd3NlciA9IHVuZGVmaW5lZDsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZGVidWcgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJykoJ3J0Yy1zaWduYWxsZXItYW5ub3VuY2UnKTtcbnZhciBleHRlbmQgPSByZXF1aXJlKCdjb2cvZXh0ZW5kJyk7XG52YXIgcm9sZXMgPSBbJ2EnLCAnYiddO1xuXG4vKipcbiAgIyMjIGFubm91bmNlXG5cbiAgYGBgXG4gIC9hbm5vdW5jZXx7XCJpZFwiOiBcIi4uLlwiLCAuLi4gfVxuICBgYGBcblxuICBXaGVuIGFuIGFubm91bmNlIG1lc3NhZ2UgaXMgcmVjZWl2ZWQgYnkgdGhlIHNpZ25hbGxlciwgdGhlIGF0dGFjaGVkXG4gIG9iamVjdCBkYXRhIGlzIGRlY29kZWQgYW5kIHRoZSBzaWduYWxsZXIgZW1pdHMgYW4gYGFubm91bmNlYCBtZXNzYWdlLlxuXG4gICMjIyMgRXZlbnRzIFRyaWdnZXJlZCBpbiByZXNwb25zZSB0byBgL2Fubm91bmNlYFxuXG4gIFRoZXJlIGFyZSB0d28gZGlmZmVyZW50IHR5cGVzIG9mIGBwZWVyOmAgZXZlbnRzIHRoYXQgY2FuIGJlIHRyaWdnZXJlZFxuICBpbiBvbiBwZWVyIEIgdG8gY2FsbGluZyB0aGUgYGFubm91bmNlYCBtZXRob2Qgb24gcGVlciBBLlxuXG4gIC0gYHBlZXI6YW5ub3VuY2VgXG5cbiAgICBUaGUgYHBlZXI6YW5ub3VuY2VgIGV2ZW50IGlzIHRyaWdnZXJlZCB3aGVuIGEgbmV3IHBlZXIgaGFzIGJlZW5cbiAgICBkaXNjb3ZlcmVkLiAgVGhlIGRhdGEgZm9yIHRoZSBuZXcgcGVlciAoYXMgYW4gSlMgb2JqZWN0KSBpcyBwcm92aWRlZFxuICAgIGFzIHRoZSBmaXJzdCBhcmd1bWVudCBvZiB0aGUgZXZlbnQgaGFuZGxlci5cblxuICAtIGBwZWVyOnVwZGF0ZWBcblxuICAgIElmIGEgcGVlciBcInJlYW5ub3VuY2VzXCIgdGhlbiBhIGBwZWVyOnVwZGF0ZWAgZXZlbnQgd2lsbCBiZSB0cmlnZ2VyZWRcbiAgICByYXRoZXIgdGhhbiBhIGBwZWVyOmFubm91bmNlYCBldmVudC5cblxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNpZ25hbGxlcikge1xuXG4gIGZ1bmN0aW9uIGNvcHlEYXRhKHRhcmdldCwgc291cmNlKSB7XG4gICAgaWYgKHRhcmdldCAmJiBzb3VyY2UpIHtcbiAgICAgIGZvciAodmFyIGtleSBpbiBzb3VyY2UpIHtcbiAgICAgICAgaWYgKGtleSAhPSAnY2xvY2snKSB7XG4gICAgICAgICAgdGFyZ2V0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0YXJnZXQ7XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24oYXJncywgbWVzc2FnZVR5cGUsIGNsb2NrKSB7XG4gICAgdmFyIGRhdGEgPSBhcmdzWzBdO1xuICAgIHZhciBwZWVyO1xuXG4gICAgLy8gaWYgd2UgaGF2ZSB2YWxpZCBkYXRhIHRoZW4gcHJvY2Vzc1xuICAgIGlmIChkYXRhICYmIGRhdGEuaWQpIHtcbiAgICAgIC8vIGNoZWNrIHRvIHNlZSBpZiB0aGlzIGlzIGEga25vd24gcGVlclxuICAgICAgcGVlciA9IHNpZ25hbGxlci5wZWVycy5nZXQoZGF0YS5pZCk7XG5cbiAgICAgIC8vIGlmIHRoZSBwZWVyIGlzIGV4aXN0aW5nLCB0aGVuIHVwZGF0ZSB0aGUgZGF0YVxuICAgICAgaWYgKHBlZXIpIHtcbiAgICAgICAgZGVidWcoJ3NpZ25hbGxlcjogJyArIHNpZ25hbGxlci5pZCArICcgcmVjZWl2ZWQgdXBkYXRlLCBkYXRhOiAnLCBkYXRhKTtcblxuICAgICAgICAvLyB1cGRhdGUgdGhlIGRhdGFcbiAgICAgICAgY29weURhdGEocGVlci5kYXRhLCBkYXRhKTtcblxuICAgICAgICAvLyB0cmlnZ2VyIHRoZSBwZWVyIHVwZGF0ZSBldmVudFxuICAgICAgICByZXR1cm4gc2lnbmFsbGVyLmVtaXQoJ3BlZXI6dXBkYXRlJywgZGF0YSk7XG4gICAgICB9XG5cbiAgICAgIC8vIGNyZWF0ZSBhIG5ldyBwZWVyXG4gICAgICBwZWVyID0ge1xuICAgICAgICBpZDogZGF0YS5pZCxcblxuICAgICAgICAvLyBpbml0aWFsaXNlIHRoZSBsb2NhbCByb2xlIGluZGV4XG4gICAgICAgIHJvbGVJZHg6IFtkYXRhLmlkLCBzaWduYWxsZXIuaWRdLnNvcnQoKS5pbmRleE9mKGRhdGEuaWQpLFxuXG4gICAgICAgIC8vIGluaXRpYWxpc2UgdGhlIHZlY3RvciBjbG9ja1xuICAgICAgICBjbG9jazogY2xvY2sgfHwgeyBhOiAwLCBiOiAwIH0sXG5cbiAgICAgICAgLy8gaW5pdGlhbGlzZSB0aGUgcGVlciBkYXRhXG4gICAgICAgIGRhdGE6IHt9XG4gICAgICB9O1xuXG4gICAgICAvLyBpbml0aWFsaXNlIHRoZSBwZWVyIGRhdGFcbiAgICAgIGNvcHlEYXRhKHBlZXIuZGF0YSwgZGF0YSk7XG5cbiAgICAgIC8vIHNldCB0aGUgcGVlciBkYXRhXG4gICAgICBzaWduYWxsZXIucGVlcnMuc2V0KGRhdGEuaWQsIHBlZXIpO1xuXG4gICAgICAvLyBpZiB0aGlzIGlzIGFuIGluaXRpYWwgYW5ub3VuY2UgbWVzc2FnZSAobm8gdmVjdG9yIGNsb2NrIGF0dGFjaGVkKVxuICAgICAgLy8gdGhlbiBzZW5kIGEgYW5ub3VuY2UgcmVwbHlcbiAgICAgIGlmIChzaWduYWxsZXIuYXV0b3JlcGx5ICYmICghIGNsb2NrKSkge1xuICAgICAgICBzaWduYWxsZXJcbiAgICAgICAgICAudG8oZGF0YS5pZClcbiAgICAgICAgICAuc2VuZCgnL2Fubm91bmNlJywgc2lnbmFsbGVyLmF0dHJpYnV0ZXMpO1xuICAgICAgfVxuXG4gICAgICAvLyBlbWl0IGEgbmV3IHBlZXIgYW5ub3VuY2UgZXZlbnRcbiAgICAgIHJldHVybiBzaWduYWxsZXIuZW1pdCgncGVlcjphbm5vdW5jZScsIGRhdGEsIHBlZXIpO1xuICAgIH1cbiAgfTtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gICMjIHNpZ25hbGxlciBtZXNzYWdlIGhhbmRsZXJzXG5cbioqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNpZ25hbGxlcikge1xuICByZXR1cm4ge1xuICAgIGFubm91bmNlOiByZXF1aXJlKCcuL2Fubm91bmNlJykoc2lnbmFsbGVyKSxcbiAgICBsZWF2ZTogcmVxdWlyZSgnLi9sZWF2ZScpKHNpZ25hbGxlciksXG4gICAgbG9jazogcmVxdWlyZSgnLi9sb2NrJykoc2lnbmFsbGVyKSxcbiAgICB1bmxvY2s6IHJlcXVpcmUoJy4vdW5sb2NrJykoc2lnbmFsbGVyKVxuICB9O1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAgIyMjIGxlYXZlXG5cbiAgYGBgXG4gIC9sZWF2ZXx7XCJpZFwiOlwiLi4uXCJ9XG4gIGBgYFxuXG4gIFdoZW4gYSBsZWF2ZSBtZXNzYWdlIGlzIHJlY2VpdmVkIGZyb20gYSBwZWVyLCB3ZSBjaGVjayB0byBzZWUgaWYgdGhhdCBpc1xuICBhIHBlZXIgdGhhdCB3ZSBhcmUgbWFuYWdpbmcgc3RhdGUgaW5mb3JtYXRpb24gZm9yIGFuZCBpZiB3ZSBhcmUgdGhlbiB0aGVcbiAgcGVlciBzdGF0ZSBpcyByZW1vdmVkLlxuXG4gICMjIyMgRXZlbnRzIHRyaWdnZXJlZCBpbiByZXNwb25zZSB0byBgL2xlYXZlYCBtZXNzYWdlc1xuXG4gIFRoZSBmb2xsb3dpbmcgZXZlbnQocykgYXJlIHRyaWdnZXJlZCB3aGVuIGEgYC9sZWF2ZWAgYWN0aW9uIGlzIHJlY2VpdmVkXG4gIGZyb20gYSBwZWVyIHNpZ25hbGxlcjpcblxuICAtIGBwZWVyOmxlYXZlYFxuXG4gICAgVGhlIGBwZWVyOmxlYXZlYCBldmVudCBpcyBlbWl0dGVkIG9uY2UgYSBgL2xlYXZlYCBtZXNzYWdlIGlzIGNhcHR1cmVkXG4gICAgZnJvbSBhIHBlZXIuICBQcmlvciB0byB0aGUgZXZlbnQgYmVpbmcgZGlzcGF0Y2hlZCwgdGhlIGludGVybmFsIHBlZXJzXG4gICAgZGF0YSBpbiB0aGUgc2lnbmFsbGVyIGlzIHJlbW92ZWQgYnV0IGNhbiBiZSBhY2Nlc3NlZCBpbiAybmQgYXJndW1lbnRcbiAgICBvZiB0aGUgZXZlbnQgaGFuZGxlci5cblxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNpZ25hbGxlcikge1xuICByZXR1cm4gZnVuY3Rpb24oYXJncykge1xuICAgIHZhciBkYXRhID0gYXJnc1swXTtcbiAgICB2YXIgcGVlciA9IHNpZ25hbGxlci5wZWVycy5nZXQoZGF0YSAmJiBkYXRhLmlkKTtcblxuICAgIC8vIHJlbW92ZSB0aGUgcGVlciBmcm9tIHRoZSBwZWVycyBkYXRhXG4gICAgaWYgKHBlZXIpIHtcbiAgICAgIHNpZ25hbGxlci5wZWVycy5kZWxldGUoZGF0YS5pZCk7XG4gICAgfVxuXG4gICAgLy8gZW1pdCB0aGUgZXZlbnRcbiAgICBzaWduYWxsZXIuZW1pdCgncGVlcjpsZWF2ZScsIGRhdGEuaWQsIHBlZXIpO1xuICB9O1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZGVidWcgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJykoJ3J0Yy1zaWduYWxsZXItbG9jaycpO1xudmFyIHZjID0gcmVxdWlyZSgndmVjdG9yY2xvY2snKTtcbnZhciBGYXN0TWFwID0gcmVxdWlyZSgnY29sbGVjdGlvbnMvZmFzdC1tYXAnKTtcblxuLyoqXG4gICMjIyBsb2NrXG5cbiAgYGBgXG4gIC9sb2NrXG4gIGBgYFxuXG4gIEEgYC9sb2NrYCByZXF1ZXN0IGNhbiBvbmx5IGJlIHNlbnQgd2l0aGluIHRoZSBjb250ZXh0IG9mIGEgYC90b2AgbWVzc2FnZVxuICBhbmQgdGh1cyBtdXN0IGNvbnRhaW4gc291cmNlIGRhdGEgdG8gYmUgcHJvY2Vzc2VkIGNvcnJlY3RseS4gIFRoZSBgL2xvY2tgXG4gIG1lc3NhZ2UgaXMgdXNlZCB0byBjb29yZGluYXRlIGJldHdlbiB0d28gcmVtb3RlIHBlZXJzIGluIHRoZSBjYXNlIHRoYXRcbiAgYm90aCBwZWVycyB3aGljaCB0byBjb21tZW5jZSByZW5lZ290aWF0aW9uIGF0IHRoZSBzYW1lIHRpbWUuXG5cbiAgSW4gdGhlIGNhc2UgdGhhdCB0d28gcGVlcnMgYXR0ZW1wdCB0byByZW5lZ290aWF0ZSB3aXRoIGVhY2ggb3RoZXIgYXQgdGhlXG4gIHNhbWUgdGltZSwgdGhlbiB0aGUgcGVlciB0aGF0IGhhcyBiZWVuIGlkZW50aWZpZWQgYXMgcGFydHkgYGFgIGluIHRoZSBwZWVyXG4gIHJlbGF0aW9uc2hpcCB3aWxsIHRha2Ugb24gdGhlIHJvbGUgb2YgdGhlIGluaXRpYXRvciBpbiB0aGUgbmVnb3RpYXRpb24gYW5kXG4gIHBhcnR5IGBiYCB3aWxsIHJlc3BvbmQgdG8gdGhlIG9mZmVyIHNkcC5cblxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNpZ25hbGxlcikge1xuICByZXR1cm4gZnVuY3Rpb24oYXJncywgbWVzc2FnZVR5cGUsIGNsb2NrLCBzcmNTdGF0ZSkge1xuICAgIHZhciBjbG9ja0NvbXBhcmlzb247XG4gICAgdmFyIHN1Y2Nlc3MgPSBmYWxzZTtcbiAgICB2YXIgbGFiZWwgPSBhcmdzWzBdO1xuXG4gICAgLy8gaWYgd2UgZG9uJ3QgaGF2ZSBhIGNsb2NrIHZhbHVlIG9yIGRvbid0IGtub3cgYWJvdXQgdGhlIHNvdXJjZVxuICAgIC8vIHRoZW4ganVzdCBkcm9wIHRoZSBtZXNzYWdlXG4gICAgaWYgKCghIGNsb2NrKSB8fCAoISBzcmNTdGF0ZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBkZWJ1ZygncmVjZWl2ZWQgXCInICsgbGFiZWwgKyAnXCIgbG9jayByZXF1ZXN0IGZyb20gc3JjOiAnICsgc3JjU3RhdGUuaWQpO1xuICAgIGNsb2NrQ29tcGFyaXNvbiA9IHZjLmNvbXBhcmUoY2xvY2ssIHNyY1N0YXRlLmNsb2NrKTtcblxuICAgIC8vIGlmIHRoZSByZW1vdGUgY2xvY2sgaXMgZ3JlYXRlciB0aGFuIHRoZSBsb2NrIGNsb2NrIHN0YXRlXG4gICAgLy8gdGhlbiB0aGUgbG9jayBpcyBhdXRvbWF0aWNhbGx5IHN1Y2Nlc3NmdWxcbiAgICBzdWNjZXNzID0gKCEgc2lnbmFsbGVyLmxvY2tzLmdldChsYWJlbCkpIHx8XG4gICAgICBjbG9ja0NvbXBhcmlzb24gPiAwIHx8XG4gICAgICAoY2xvY2tDb21wYXJpc29uID09PSAwICYmIHNyY1N0YXRlLnJvbGVJZHggPT09IDApO1xuXG4gICAgZGVidWcoJ3NpZ25hbGxlciAnICsgc2lnbmFsbGVyLmlkICsgJyBjaGVja2luZyBsb2NrIHN0YXRlJyk7XG4gICAgZGVidWcoJ2Nsb2NrIHZhbHVlIGluIG1lc3NhZ2U6ICcsIGNsb2NrKTtcbiAgICBkZWJ1ZygnY2FjaGVkIHBlZXIgY2xvY2sgc3RhdGU6ICcsIHNyY1N0YXRlLmNsb2NrKTtcbiAgICBkZWJ1ZygnY2xvY2sgY29tcGFyaXNvbiA9ICcgKyBjbG9ja0NvbXBhcmlzb24gKyAnIG9rOiAnICsgc3VjY2Vzcywgc3JjU3RhdGUpO1xuXG4gICAgLy8gaWYgdGhlIGxvY2sgaXMgc3VjY2Vzc2Z1bCwgdGhlbiBhZGQgdGhlIGxvY2sgaW5mbyB0byB0aGUgc3JjU3RhdGVcbiAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgLy8gZW5zdXJlIHdlIGhhdmUgYSBsb2NrcyBtZW1iZXJcbiAgICAgIHNyY1N0YXRlLmxvY2tzID0gc3JjU3RhdGUubG9ja3MgfHwgbmV3IEZhc3RNYXAoKTtcblxuICAgICAgLy8gY3JlYXRlIHRoZSBsb2NrXG4gICAgICBzcmNTdGF0ZS5sb2Nrcy5zZXQobGFiZWwsIHsgaWQ6IGFyZ3NbMV0gfHwgJycgfSk7XG4gICAgfVxuXG4gICAgLy8gc2VuZCB0aGUgbG9jayByZXN1bHRcbiAgICBzaWduYWxsZXIudG8oc3JjU3RhdGUuaWQpLnNlbmQoJy9sb2NrcmVzdWx0Jywge1xuICAgICAgbGFiZWw6IGxhYmVsLFxuICAgICAgb2s6IHN1Y2Nlc3NcbiAgICB9KTtcbiAgfTtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGRlYnVnID0gcmVxdWlyZSgnY29nL2xvZ2dlcicpKCdydGMtc2lnbmFsbGVyLWxvY2snKTtcbnZhciB2YyA9IHJlcXVpcmUoJ3ZlY3RvcmNsb2NrJyk7XG5cbi8qKlxuICAjIyMgdW5sb2NrXG5cbiAgYGBgXG4gIC91bmxvY2t8bGFiZWxcbiAgYGBgXG5cbiAgQ2xlYXIgYSByZW1vdGUgbG9ja1xuXG4qKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oc2lnbmFsbGVyKSB7XG4gIHJldHVybiBmdW5jdGlvbihhcmdzLCBtZXNzYWdlVHlwZSwgY2xvY2ssIHNyY1N0YXRlKSB7XG4gICAgdmFyIGxhYmVsID0gYXJnc1swXTtcbiAgICB2YXIgb2sgPSBmYWxzZTtcblxuICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgYSBjbG9jayB2YWx1ZSBvciBkb24ndCBrbm93IGFib3V0IHRoZSBzb3VyY2VcbiAgICAvLyB0aGVuIGp1c3QgZHJvcCB0aGUgbWVzc2FnZVxuICAgIGlmICgoISBjbG9jaykgfHwgKCEgc3JjU3RhdGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZGVidWcoJ3JlY2VpdmVkIFwiJyArIGxhYmVsICsgJ1wiIHVubG9jayByZXF1ZXN0IGZyb20gc3JjOiAnICsgc3JjU3RhdGUuaWQpO1xuXG4gICAgLy8gaWYgdGhlIHBlZXIgaGFzIGFuIGFjdGl2ZSBsb2NrLCByZW1vdmUgaXRcbiAgICBpZiAoc3JjU3RhdGUubG9ja3MpIHtcbiAgICAgIC8vIFRPRE86IGNoZWNrIGZvciBhIG1hdGNoaW5nIGxvY2tpZFxuICAgICAgc3JjU3RhdGUubG9ja3MuZGVsZXRlKGxhYmVsKTtcbiAgICAgIG9rID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBzZW5kIHRoZSBsb2NrIG1lc3NhZ2VcbiAgICBzaWduYWxsZXIudG8oc3JjU3RhdGUuaWQpLnNlbmQoJy91bmxvY2tyZXN1bHQnLCB7XG4gICAgICBsYWJlbDogbGFiZWwsXG4gICAgICBvazogb2tcbiAgICB9KTtcbiAgfTtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGRlYnVnID0gcmVxdWlyZSgnY29nL2xvZ2dlcicpKCdydGMtc2lnbmFsbGVyJyk7XG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgncnRjLWNvcmUvZGV0ZWN0Jyk7XG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIHV1aWQgPSByZXF1aXJlKCd1dWlkJyk7XG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnY29nL2V4dGVuZCcpO1xudmFyIEZhc3RNYXAgPSByZXF1aXJlKCdjb2xsZWN0aW9ucy9mYXN0LW1hcCcpO1xudmFyIHZjID0gcmVxdWlyZSgndmVjdG9yY2xvY2snKTtcblxuLyoqXG4gICMgcnRjLXNpZ25hbGxlclxuXG4gIFRoZSBgcnRjLXNpZ25hbGxlcmAgbW9kdWxlIHByb3ZpZGVzIGEgdHJhbnNwb3J0bGVzcyBzaWduYWxsaW5nXG4gIG1lY2hhbmlzbSBmb3IgV2ViUlRDLlxuXG4gICMjIFB1cnBvc2VcblxuICBUaGUgc2lnbmFsbGVyIHByb3ZpZGVzIHNldCBvZiBjbGllbnQtc2lkZSB0b29scyB0aGF0IGFzc2lzdCB3aXRoIHRoZVxuICBzZXR0aW5nIHVwIGFuIGBQZWVyQ29ubmVjdGlvbmAgYW5kIGhlbHBpbmcgdGhlbSBjb21tdW5pY2F0ZS4gQWxsIHRoYXQgaXNcbiAgcmVxdWlyZWQgZm9yIHRoZSBzaWduYWxsZXIgdG8gb3BlcmF0ZSBpcyBhIHN1aXRhYmxlIG1lc3Nlbmdlci5cblxuICBBIG1lc3NlbmdlciBpcyBhIHNpbXBsZSBvYmplY3QgdGhhdCBpbXBsZW1lbnRzIG5vZGVcbiAgW0V2ZW50RW1pdHRlcl0oaHR0cDovL25vZGVqcy5vcmcvYXBpL2V2ZW50cy5odG1sKSBzdHlsZSBgb25gIGV2ZW50cyBmb3JcbiAgYG9wZW5gLCBgY2xvc2VgLCBgbWVzc2FnZWAgZXZlbnRzLCBhbmQgYWxzbyBhIGBzZW5kYCBtZXRob2QgYnkgd2hpY2hcbiAgZGF0YSB3aWxsIGJlIHNlbmQgXCJvdmVyLXRoZS13aXJlXCIuXG5cbiAgQnkgdXNpbmcgdGhpcyBhcHByb2FjaCwgd2UgY2FuIGNvbmR1Y3Qgc2lnbmFsbGluZyBvdmVyIGFueSBudW1iZXIgb2ZcbiAgbWVjaGFuaXNtczpcblxuICAtIGxvY2FsLCBpbiBtZW1vcnkgbWVzc2FnZSBwYXNzaW5nXG4gIC0gdmlhIFdlYlNvY2tldHMgYW5kIGhpZ2hlciBsZXZlbCBhYnN0cmFjdGlvbnMgKHN1Y2ggYXNcbiAgICBbcHJpbXVzXShodHRwczovL2dpdGh1Yi5jb20vcHJpbXVzL3ByaW11cykpXG4gIC0gYWxzbyBvdmVyIFdlYlJUQyBkYXRhLWNoYW5uZWxzICh2ZXJ5IG1ldGEsIGFuZCBhZG1pdHRlZGx5IGEgbGl0dGxlXG4gICAgY29tcGxpY2F0ZWQpLlxuXG4gICMjIEdldHRpbmcgU3RhcnRlZFxuXG4gIFRvIHdvcmsgd2l0aCB0aGUgc2lnbmFsbGVyLCB5b3UgZmlyc3QgbmVlZCBhIG1lc3NlbmdlciBvZiBzb21lIGtpbmQuIElmIHlvdVxuICBoYXZlIHJ1biB1cCBhIHZlcnNpb24gb2YgdGhlXG4gIFtydGMtc3dpdGNoYm9hcmRdKGh0dHBzOi8vZ2l0aHViLmNvbS9ydGMtaW8vcnRjLXN3aXRjaGJvYXJkKSBzb21ld2hlcmUgdGhlblxuICB0aGUgZm9sbG93aW5nIGV4YW1wbGUgc2hvdWxkIHdvcms6XG5cbiAgPDw8IGV4YW1wbGVzL3NpZ25hbGxpbmctdmlhLXN3aXRjaGJvYXJkLmpzXG5cbiAgV2hpbGUgdGhlIGV4YW1wbGUgYWJvdmUgZGVtb25zdHJhdGVzIGNvbW11bmljYXRpb24gYmV0d2VlbiB0d28gZW5kcG9pbnRzXG4gIHZpYSB3ZWJzb2NrZXRzLCBpdCBkb2VzIG5vdCBnbyBpbnRvIGRldGFpbCBvbiBzZXR0aW5nIHVwIGEgV2ViUlRDIHBlZXJcbiAgY29ubmVjdGlvbiAoYXMgdGhhdCBpcyBzaWduaWZpY2FudGx5IG1vcmUgaW52b2x2ZWQpLiAgSWYgeW91IGFyZSBsb29raW5nIGZvclxuICBhbiBlYXN5IHdheSB0byBkbyB0aGlzLCBJJ2QgcmVjb21tZW5kIGNoZWNraW5nIG91dFxuICBbcnRjLXF1aWNrY29ubmVjdF0oaHR0cHM6Ly9naXRodWIuY29tL3J0Yy1pby9ydGMtcXVpY2tjb25uZWN0KSBvclxuICBbcnRjLWdsdWVdKGh0dHBzOi8vZ2l0aHViLmNvbS9ydGMtaW8vcnRjLWdsdWUpLlxuXG4gICMjIFNpZ25hbCBGbG93IERpYWdyYW1zXG5cbiAgRGlzcGxheWVkIGJlbG93IGFyZSBzb21lIGRpYWdyYW1zIGhvdyB0aGUgc2lnbmFsbGluZyBmbG93IGJldHdlZW4gcGVlcnNcbiAgYmVoYXZlcy4gIEluIGVhY2ggb2YgdGhlIGRpYWdyYW1zIHdlIGlsbHVzdHJhdGUgdGhyZWUgcGVlcnMgKEEsIEIgYW5kIEMpXG4gIHBhcnRpY2lwYXRpbmcgZGlzY292ZXJ5IGFuZCBjb29yZGluYXRpbmcgUlRDUGVlckNvbm5lY3Rpb24gaGFuZHNoYWtlcy5cblxuICBJbiBlYWNoIGNhc2UsIG9ubHkgdGhlIGludGVyYWN0aW9uIGJldHdlZW4gdGhlIGNsaWVudHMgaXMgcmVwcmVzZW50ZWQgbm90XG4gIGhvdyBhIHNpZ25hbGxpbmcgc2VydmVyXG4gIChzdWNoIGFzIFtydGMtc3dpdGNoYm9hcmRdKGh0dHBzOi8vZ2l0aHViLmNvbS9ydGMtaW8vcnRjLXN3aXRjaGJvYXJkKSkgd291bGRcbiAgcGFzcyBvbiBicm9hZGNhc3QgbWVzc2FnZXMsIGV0Yy4gIFRoaXMgaXMgZG9uZSBmb3IgdHdvIHJlYXNvbnM6XG5cbiAgMS4gSXQgaXMgb3V0IG9mIHNjb3BlIG9mIHRoaXMgZG9jdW1lbnRhdGlvbi5cbiAgMi4gVGhlIGBydGMtc2lnbmFsbGVyYCBoYXMgYmVlbiBkZXNpZ25lZCB0byB3b3JrIHdpdGhvdXQgaGF2aW5nIHRvIHJlbHkgb25cbiAgICAgYW55IGludGVsbGlnZW5jZSBpbiB0aGUgc2VydmVyIHNpZGUgc2lnbmFsbGluZyBjb21wb25lbnQuICBJbiB0aGVcbiAgICAgaW5zdGFuY2UgdGhhdCBhIHNpZ25hbGxlciBicm9hZGNhc3RzIGFsbCBtZXNzYWdlcyB0byBhbGwgY29ubmVjdGVkIHBlZXJzXG4gICAgIHRoZW4gYHJ0Yy1zaWduYWxsZXJgIHNob3VsZCBiZSBzbWFydCBlbm91Z2ggdG8gbWFrZSBzdXJlIGV2ZXJ5dGhpbmcgd29ya3NcbiAgICAgYXMgZXhwZWN0ZWQuXG5cbiAgIyMjIFBlZXIgRGlzY292ZXJ5IC8gQW5ub3VuY2VtZW50XG5cbiAgVGhpcyBkaWFncmFtIGlsbHVzdHJhdGVzIHRoZSBwcm9jZXNzIG9mIGhvdyBwZWVyIGBBYCBhbm5vdW5jZXMgaXRzZWxmIHRvXG4gIHBlZXJzIGBCYCBhbmQgYENgLCBhbmQgaW4gdHVybiB0aGV5IGFubm91bmNlIHRoZW1zZWx2ZXMuXG5cbiAgIVtdKGh0dHBzOi8vcmF3LmdpdGh1Yi5jb20vcnRjLWlvL3J0Yy1zaWduYWxsZXIvbWFzdGVyL2RvY3MvYW5ub3VuY2UucG5nKVxuXG4gICMjIyBFZGl0aW5nIC8gVXBkYXRpbmcgdGhlIERpYWdyYW1zXG5cbiAgRWFjaCBvZiB0aGUgZGlhZ3JhbXMgaGFzIGJlZW4gZ2VuZXJhdGVkIHVzaW5nXG4gIFttc2NnZW5dKGh0dHA6Ly93d3cubWN0ZXJuYW4ubWUudWsvbXNjZ2VuL2luZGV4Lmh0bWwpIGFuZCB0aGUgc291cmNlIGZvclxuICB0aGVzZSBkb2N1bWVudHMgY2FuIGJlIGZvdW5kIGluIHRoZSBgZG9jcy9gIGZvbGRlciBvZiB0aGlzIHJlcG9zaXRvcnkuXG5cbiAgIyMgUmVmZXJlbmNlXG5cbiAgVGhlIGBydGMtc2lnbmFsbGVyYCBtb2R1bGUgaXMgZGVzaWduZWQgdG8gYmUgdXNlZCBwcmltYXJpbHkgaW4gYSBmdW5jdGlvbmFsXG4gIHdheSBhbmQgd2hlbiBjYWxsZWQgaXQgY3JlYXRlcyBhIG5ldyBzaWduYWxsZXIgdGhhdCB3aWxsIGVuYWJsZVxuICB5b3UgdG8gY29tbXVuaWNhdGUgd2l0aCBvdGhlciBwZWVycyB2aWEgeW91ciBtZXNzYWdpbmcgbmV0d29yay5cblxuICBgYGBqc1xuICAvLyBjcmVhdGUgYSBzaWduYWxsZXIgZnJvbSBzb21ldGhpbmcgdGhhdCBrbm93cyBob3cgdG8gc2VuZCBtZXNzYWdlc1xuICB2YXIgc2lnbmFsbGVyID0gcmVxdWlyZSgncnRjLXNpZ25hbGxlcicpKG1lc3Nlbmdlcik7XG4gIGBgYFxuXG4qKi9cbnZhciBzaWcgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG1lc3Nlbmdlciwgb3B0cykge1xuXG4gIC8vIGdldCB0aGUgYXV0b3JlcGx5IHNldHRpbmdcbiAgdmFyIGF1dG9yZXBseSA9IChvcHRzIHx8IHt9KS5hdXRvcmVwbHk7XG5cbiAgLy8gY3JlYXRlIHRoZSBzaWduYWxsZXJcbiAgdmFyIHNpZ25hbGxlciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcblxuICAvLyBpbml0aWFsaXNlIHRoZSBpZFxuICB2YXIgaWQgPSBzaWduYWxsZXIuaWQgPSB1dWlkLnY0KCk7XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgYXR0cmlidXRlc1xuICB2YXIgYXR0cmlidXRlcyA9IHNpZ25hbGxlci5hdHRyaWJ1dGVzID0ge1xuICAgIGJyb3dzZXI6IGRldGVjdC5icm93c2VyLFxuICAgIGJyb3dzZXJWZXJzaW9uOiBkZXRlY3QuYnJvd3NlclZlcnNpb24sXG4gICAgaWQ6IGlkXG4gIH07XG5cbiAgLy8gY3JlYXRlIHRoZSBwZWVycyBtYXBcbiAgdmFyIHBlZXJzID0gc2lnbmFsbGVyLnBlZXJzID0gbmV3IEZhc3RNYXAoKTtcblxuICAvLyBjcmVhdGUgb3VyIGxvY2tzIG1hcFxuICB2YXIgbG9ja3MgPSBzaWduYWxsZXIubG9ja3MgPSBuZXcgRmFzdE1hcCgpO1xuXG4gIC8vIGluaXRpYWxpc2UgdGhlIGRhdGEgZXZlbnQgbmFtZVxuICB2YXIgZGF0YUV2ZW50ID0gKG9wdHMgfHwge30pLmRhdGFFdmVudCB8fCAnZGF0YSc7XG4gIHZhciBvcGVuRXZlbnQgPSAob3B0cyB8fCB7fSkub3BlbkV2ZW50IHx8ICdvcGVuJztcbiAgdmFyIHdyaXRlTWV0aG9kID0gKG9wdHMgfHwge30pLndyaXRlTWV0aG9kIHx8ICd3cml0ZSc7XG4gIHZhciBjbG9zZU1ldGhvZCA9IChvcHRzIHx8IHt9KS5jbG9zZU1ldGhvZCB8fCAnY2xvc2UnO1xuXG4gIC8vIGV4dHJhY3QgdGhlIHdyaXRlIGFuZCBjbG9zZSBmdW5jdGlvbiByZWZlcmVuY2VzXG4gIHZhciB3cml0ZSA9IG1lc3Nlbmdlclt3cml0ZU1ldGhvZF07XG4gIHZhciBjbG9zZSA9IG1lc3NlbmdlcltjbG9zZU1ldGhvZF07XG5cbiAgLy8gc2V0IHRoZSBhdXRvcmVwbHkgZmxhZ1xuICBzaWduYWxsZXIuYXV0b3JlcGx5ID0gYXV0b3JlcGx5ID09PSB1bmRlZmluZWQgfHwgYXV0b3JlcGx5O1xuXG4gIC8vIGNyZWF0ZSB0aGUgcHJvY2Vzc29yXG4gIHZhciBwcm9jZXNzb3IgPSByZXF1aXJlKCcuL3Byb2Nlc3NvcicpKHNpZ25hbGxlcik7XG5cbiAgLy8gaWYgdGhlIG1lc3NlbmdlciBkb2Vzbid0IHByb3ZpZGUgYSB2YWxpZCB3cml0ZSBtZXRob2QsIHRoZW4gY29tcGxhaW5cbiAgaWYgKHR5cGVvZiB3cml0ZSAhPSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm92aWRlZCBtZXNzZW5nZXIgZG9lcyBub3QgaW1wbGVtZW50IGEgXCInICtcbiAgICAgIHdyaXRlTWV0aG9kICsgJ1wiIHdyaXRlIG1ldGhvZCcpO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJlcGFyZUFyZyhhcmcpIHtcbiAgICBpZiAodHlwZW9mIGFyZyA9PSAnb2JqZWN0JyAmJiAoISAoYXJnIGluc3RhbmNlb2YgU3RyaW5nKSkpIHtcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhcmcpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2YgYXJnID09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBhcmc7XG4gIH1cblxuICAvKipcbiAgICAjIyMgc2lnbmFsbGVyI3NlbmQoZGF0YSlcblxuICAgIFNlbmQgZGF0YSBvdmVyIHRoZSBtZXNzZW5naW5nIGludGVyZmFjZS5cbiAgKiovXG4gIHZhciBzZW5kID0gc2lnbmFsbGVyLnNlbmQgPSBmdW5jdGlvbigpIHtcbiAgICAvLyBpdGVyYXRlIG92ZXIgdGhlIGFyZ3VtZW50cyBhbmQgc3RyaW5naWZ5IGFzIHJlcXVpcmVkXG4gICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgdmFyIGRhdGFsaW5lID0gYXJncy5tYXAocHJlcGFyZUFyZykuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ3wnKTtcblxuICAgIC8vIHNlbmQgdGhlIGRhdGEgb3ZlciB0aGUgbWVzc2VuZ2VyXG4gICAgcmV0dXJuIHdyaXRlLmNhbGwobWVzc2VuZ2VyLCBkYXRhbGluZSk7XG4gIH07XG5cbiAgLyoqXG4gICAgIyMjIHNpZ25hbGxlciNhbm5vdW5jZShkYXRhPylcblxuICAgIFRoZSBgYW5ub3VuY2VgIGZ1bmN0aW9uIG9mIHRoZSBzaWduYWxsZXIgd2lsbCBwYXNzIGFuIGAvYW5ub3VuY2VgIG1lc3NhZ2VcbiAgICB0aHJvdWdoIHRoZSBtZXNzZW5nZXIgbmV0d29yay4gIFdoZW4gbm8gYWRkaXRpb25hbCBkYXRhIGlzIHN1cHBsaWVkIHRvXG4gICAgdGhpcyBmdW5jdGlvbiB0aGVuIG9ubHkgdGhlIGlkIG9mIHRoZSBzaWduYWxsZXIgaXMgc2VudCB0byBhbGwgYWN0aXZlXG4gICAgbWVtYmVycyBvZiB0aGUgbWVzc2VuZ2luZyBuZXR3b3JrLlxuXG4gICAgQXMgYSB1bmlxdWUgaXQgaXMgZ2VuZXJhbGx5IGluc3VmZmljaWVudCBpbmZvcm1hdGlvbiB0byBkZXRlcm1pbmUgd2hldGhlclxuICAgIGEgcGVlciBpcyBhIGdvb2QgbWF0Y2ggZm9yIGFub3RoZXIgKGZvciBpbnN0YW5jZSwgIHlvdSBtaWdodCBiZSBsb29raW5nXG4gICAgZm9yIG90aGVyIHBhcnRpZXMgYnkgbmFtZSBvciByb2xlKSBpdCBpcyBnZW5lcmFsbHkgYSBnb29kIGlkZWEgdG8gcHJvdmlkZVxuICAgIHNvbWUgYWRkaXRpb25hbCBpbmZvcm1hdGlvbiBkdXJpbmcgdGhpcyBhbm5vdW5jZSBjYWxsOlxuXG4gICAgYGBganNcbiAgICBzaWduYWxsZXIuYW5ub3VuY2UoeyByb2xlOiAndHJhbnNsYXRvcicgfSk7XG4gICAgYGBgXG5cbiAgICBfX05PVEU6X18gSW4gc29tZSBwYXJ0aWN1bGFyIG1lc3NlbmdlciB0eXBlcyBtYXkgYXR0YWNoIG9yIGluZmVyXG4gICAgYWRkaXRpb25hbCBkYXRhIGR1cmluZyB0aGUgYW5ub3VuY2UgcGhhc2UuICBGb3IgaW5zdGFuY2UsIHNvY2tldC5pb1xuICAgIGNvbm5lY3Rpb25zIGFyZSBnZW5lcmFsbHkgb3JnYW5pc2VkIGludG8gcm9vbXMgd2hpY2ggaXMgaW5mZXJyZWRcbiAgICBpbmZvcm1hdGlvbiB0aGF0IGxpbWl0cyB0aGUgbWVzc2FnaW5nIHNjb3BlLlxuICAqKi9cbiAgc2lnbmFsbGVyLmFubm91bmNlID0gZnVuY3Rpb24oZGF0YSwgc2VuZGVyKSB7XG4gICAgLy8gdXBkYXRlIGludGVybmFsIGF0dHJpYnV0ZXNcbiAgICBleHRlbmQoYXR0cmlidXRlcywgZGF0YSwgeyBpZDogc2lnbmFsbGVyLmlkIH0pO1xuXG4gICAgLy8gc2VuZCB0aGUgYXR0cmlidXRlcyBvdmVyIHRoZSBuZXR3b3JrXG4gICAgcmV0dXJuIChzZW5kZXIgfHwgc2VuZCkoJy9hbm5vdW5jZScsIGF0dHJpYnV0ZXMpO1xuICB9O1xuXG4gIC8qKlxuICAgICMjIyBzaWduYWxsZXIjbGVhdmUoKVxuXG4gICAgTGVhdmUgdGhlIG1lc3NlbmdlciBtZXNoXG4gICoqL1xuICBzaWduYWxsZXIubGVhdmUgPSBmdW5jdGlvbigpIHtcbiAgICAvLyBzZW5kIHRoZSBsZWF2ZSBzaWduYWxcbiAgICBzZW5kKCcvbGVhdmUnLCB7IGlkOiBpZCB9KTtcblxuICAgIC8vIGNhbGwgdGhlIGNsb3NlIG1ldGhvZFxuICAgIGlmICh0eXBlb2YgY2xvc2UgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY2xvc2UuY2FsbChtZXNzZW5nZXIpO1xuICAgIH1cbiAgfTtcblxuICAvKipcbiAgICAjIyMgc2lnbmFsbGVyI2xvY2sodGFyZ2V0SWQsIG9wdHM/LCBjYWxsYmFjaz8pXG5cbiAgICBBdHRlbXB0IHRvIGdldCBhIHRlbXBvcmFyeSBleGNsdXNpdmUgbG9jayBvbiB0aGUgY29tbXVuaWNhdGlvblxuICAgIGNoYW5uZWwgYmV0d2VlbiB0aGUgbG9jYWwgc2lnbmFsbGVyIGFuZCB0aGUgc3BlY2lmaWVkIHRhcmdldCBwZWVyIGlkLlxuICAqKi9cbiAgc2lnbmFsbGVyLmxvY2sgPSBmdW5jdGlvbih0YXJnZXRJZCwgb3B0cywgY2FsbGJhY2spIHtcbiAgICB2YXIgcGVlciA9IHBlZXJzLmdldCh0YXJnZXRJZCk7XG4gICAgdmFyIGFjdGl2ZUxvY2s7XG4gICAgdmFyIGxvY2tpZCA9IHV1aWQudjQoKTtcbiAgICB2YXIgbGFiZWw7XG5cbiAgICBmdW5jdGlvbiBoYW5kbGVMb2NrUmVzdWx0KHJlc3VsdCwgc3JjKSB7XG4gICAgICB2YXIgb2sgPSByZXN1bHQgJiYgcmVzdWx0Lm9rO1xuXG4gICAgICAvLyBpZiB0aGUgc291cmNlIGRvZXMgbm90IG1hdGNoIHRoZSB0YXJnZXQgdGhlbiBhYm9ydFxuICAgICAgaWYgKCghIHNyYykgfHwgKHNyYy5pZCAhPT0gdGFyZ2V0SWQpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gaWYgdGhlIHJlc3VsdCBsYWJlbCBpcyBub3QgYSBtYXRjaCwgdGhlbiBhYm9ydFxuICAgICAgaWYgKCghIHJlc3VsdCkgfHwgKHJlc3VsdC5sYWJlbCAhPT0gbGFiZWwpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gZG9uJ3QgbGlzdGVuIGZvciBhbnkgZnVydGhlciBsb2NrIHJlc3VsdCBtZXNzYWdlc1xuICAgICAgc2lnbmFsbGVyLnJlbW92ZUxpc3RlbmVyKCdsb2NrcmVzdWx0JywgaGFuZGxlTG9ja1Jlc3VsdCk7XG5cbiAgICAgIC8vIGlmIHdlIGRvbid0IGhhdmUgYW4gZXJyb3IgY29uZGl0aW9uLCBjcmVhdGUgYW4gYWN0aXZlIGxvY2FsIGxvY2tcbiAgICAgIGlmIChvaykge1xuICAgICAgICBsb2Nrcy5zZXQobGFiZWwsIGFjdGl2ZUxvY2sgPSB7IGlkOiBsb2NraWQgfSk7XG4gICAgICB9XG4gICAgICAvLyBvdGhlcndpc2UsIGRlbGV0ZSB0aGUgbG9jYWwgcHJvdmlzaW9uYWwgbG9ja1xuICAgICAgZWxzZSBpZiAoYWN0aXZlTG9jaykge1xuICAgICAgICBsb2Nrcy5kZWxldGUobGFiZWwpO1xuICAgICAgfVxuXG4gICAgICBjYWxsYmFjayhvayA/IG51bGwgOiBuZXcgRXJyb3IoJ2NvdWxkIG5vdCBhY3F1aXJlIGxvY2snKSk7XG4gICAgfVxuXG4gICAgLy8gY2hlY2sgZm9yIG5vIGxhYmVsIGJlaW5nIHN1cHBsaWVkXG4gICAgaWYgKHR5cGVvZiBvcHRzID09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNhbGxiYWNrID0gb3B0cztcbiAgICAgIG9wdHMgPSB7fTtcbiAgICB9XG5cbiAgICAvLyBlbnN1cmUgd2UgaGF2ZSBhIGNhbGxiYWNrXG4gICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuXG4gICAgLy8gaWYgdGhlIHBlZXIgaXMgbm90IGtub3duLCB0aGVuIHdlIGNhbm5vdCBpbml0aWF0ZSBhIGxvY2tcbiAgICBpZiAoISBwZWVyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCd1bmtub3duIHRhcmdldCBpZCAtIGNhbm5vdCBpbml0aWF0ZSBsb2NrJykpO1xuICAgIH1cblxuICAgIC8vIGNyZWF0ZSBhIGRlZmF1bHQgbGFiZWwgaWYgbm9uZSBwcm92aWRlZFxuICAgIGxhYmVsID0gKG9wdHMgfHwge30pLmxhYmVsIHx8IChvcHRzIHx8IHt9KS5uYW1lIHx8ICdkZWZhdWx0JztcblxuICAgIC8vIGlmIHdlIGhhdmUgYSBsb2NhbCBsb2NrIGFscmVhZHkgaW4gcGxhY2UsIHRoZW4gcmV0dXJuIG9rXG4gICAgYWN0aXZlTG9jayA9IGxvY2tzLmdldChsYWJlbCk7XG4gICAgaWYgKGFjdGl2ZUxvY2sgJiYgKCEgYWN0aXZlTG9jay5wcm92aXNpb25hbCkpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgIH1cblxuICAgIC8vIGVuc3VyZSB3ZSBoYXZlIGxvY2tzIGZvciB0aGUgcGVlclxuICAgIHBlZXIubG9ja3MgPSBwZWVyLmxvY2tzIHx8IG5ldyBGYXN0TWFwKCk7XG5cbiAgICAvLyBpZiBhIHJlbW90ZSBsb2NrIGlzIGluIHBsYWNlLCBlcnJvciBvdXRcbiAgICBpZiAocGVlci5sb2Nrcy5nZXQobGFiZWwpKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdyZW1vdGUgbG9jayBpbiBwbGFjZSwgY2Fubm90IHJlcXVlc3QgbG9jaycpKTtcbiAgICB9XG5cbiAgICAvLyBjcmVhdGUgYSBwcm92aXNpb25hbCBsb2NrXG4gICAgbG9ja3Muc2V0KGxhYmVsLCBhY3RpdmVMb2NrID0geyBpZDogbG9ja2lkLCBwcm92aXNpb25hbDogdHJ1ZSB9KTtcblxuICAgIC8vIHdhaXQgZm9yIHRoZSBsb2NrIHJlc3VsdFxuICAgIHNpZ25hbGxlci5vbignbG9ja3Jlc3VsdCcsIGhhbmRsZUxvY2tSZXN1bHQpO1xuXG4gICAgLy8gc2VuZCB0aGUgbG9jayBtZXNzYWdlXG4gICAgc2lnbmFsbGVyLnRvKHRhcmdldElkKS5zZW5kKCcvbG9jaycsIGxhYmVsLCBsb2NraWQpO1xuICB9O1xuXG4gIC8qKlxuICAgICMjIyBzaWduYWxsZXIjdG8odGFyZ2V0SWQpXG5cbiAgICBUaGUgdG8gbWV0aG9kIHJldHVybnMgYW4gZW5jYXBzdWxhdGVkXG5cbiAgKiovXG4gIHNpZ25hbGxlci50byA9IGZ1bmN0aW9uKHRhcmdldElkKSB7XG4gICAgLy8gY3JlYXRlIGEgc2VuZGVyIHRoYXQgd2lsbCBwcmVwZW5kIG1lc3NhZ2VzIHdpdGggL3RvfHRhcmdldElkfFxuICAgIHZhciBzZW5kZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIC8vIGdldCB0aGUgcGVlciAoeWVzIHdoZW4gc2VuZCBpcyBjYWxsZWQgdG8gbWFrZSBzdXJlIGl0IGhhc24ndCBsZWZ0KVxuICAgICAgdmFyIHBlZXIgPSBzaWduYWxsZXIucGVlcnMuZ2V0KHRhcmdldElkKTtcbiAgICAgIHZhciBhcmdzO1xuXG4gICAgICBpZiAoISBwZWVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBwZWVyOiAnICsgdGFyZ2V0SWQpO1xuICAgICAgfVxuXG4gICAgICBhcmdzID0gW1xuICAgICAgICAnL3RvJyxcbiAgICAgICAgdGFyZ2V0SWQsXG4gICAgICAgIHsgaWQ6IHNpZ25hbGxlci5pZCwgY2xvY2s6IHBlZXIuY2xvY2sgfVxuICAgICAgXS5jb25jYXQoW10uc2xpY2UuY2FsbChhcmd1bWVudHMpKTtcblxuICAgICAgLy8gaW5jcmVtZW50IHRoZSBwZWVyIGNsb2NrLCB1c2luZyB0aGUgcm9sZSBvZiB0aGUgbG9jYWxcbiAgICAgIC8vIHNpZ25hbGxlci4gIElmIHRoZSBwZWVyIHJvbGUgaXMgMCwgdGhlbiB0aGUgc2lnbmFsbGVycyByb2xlIGlzIDFcbiAgICAgIC8vIGFuZCB1c2luZyB4b3IgKF4pIHdpbGwgZ2VuZXJhdGUgdGhlIGNvcnJlY3QgaW5kZXhcbiAgICAgIHZjLmluY3JlbWVudChwZWVyLCBbJ2EnLCAnYiddW3BlZXIucm9sZUlkeCBeIDFdKTtcblxuICAgICAgLy8gd3JpdGUgb24gbmV4dCB0aWNrIHRvIGVuc3VyZSBjbG9jayB1cGRhdGVzIGFyZSBoYW5kbGVkIGNvcnJlY3RseVxuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGFyZ3MubWFwKHByZXBhcmVBcmcpLmZpbHRlcihCb29sZWFuKS5qb2luKCd8Jyk7XG4gICAgICAgIGRlYnVnKCdUWCAoJyArIHRhcmdldElkICsgJyk6ICcsIG1zZyk7XG5cbiAgICAgICAgLy8gaW5jbHVkZSB0aGUgY3VycmVudCBjbG9jayB2YWx1ZSBpbiB3aXRoIHRoZSBwYXlsb2FkXG4gICAgICAgIHdyaXRlLmNhbGwobWVzc2VuZ2VyLCBtc2cpO1xuICAgICAgfSwgMCk7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICBhbm5vdW5jZTogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICByZXR1cm4gc2lnbmFsbGVyLmFubm91bmNlKGRhdGEsIHNlbmRlcik7XG4gICAgICB9LFxuXG4gICAgICBzZW5kOiBzZW5kZXIsXG4gICAgfVxuICB9O1xuXG4gIC8qKlxuXG4gICAgIyMjIHNpZ25hbGxlciN1bmxvY2sodGFyZ2V0SWQsIG9wdHM/KVxuXG4gICoqL1xuICBzaWduYWxsZXIudW5sb2NrID0gZnVuY3Rpb24odGFyZ2V0SWQsIG9wdHMsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHBlZXIgPSBwZWVycy5nZXQodGFyZ2V0SWQpO1xuICAgIHZhciBsYWJlbDtcblxuICAgIGZ1bmN0aW9uIGhhbmRsZVVubG9ja1Jlc3VsdChyZXN1bHQsIHNyYykge1xuICAgICAgdmFyIG9rID0gcmVzdWx0ICYmIHJlc3VsdC5vaztcblxuICAgICAgLy8gaWYgbm90IHRoZSBjb3JyZWN0IHNvdXJjZSB0aGVuIGFib3J0XG4gICAgICBpZiAoKCEgc3JjKSB8fCAoc3JjLmlkICE9PSB0YXJnZXRJZCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBpZiB0aGlzIGlzIG5vdCBhbiB1bmxvY2sgcmVzdWx0IGZvciB0aGlzIGxhYmVsLCB0aGVuIGFib3J0XG4gICAgICBpZiAoKCEgcmVzdWx0KSB8fCAocmVzdWx0LmxhYmVsICE9PSBsYWJlbCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGxpc3RlbmVyXG4gICAgICBzaWduYWxsZXIucmVtb3ZlTGlzdGVuZXIoJ3VubG9ja3Jlc3VsdCcsIGhhbmRsZVVubG9ja1Jlc3VsdCk7XG5cbiAgICAgIC8vIGlmIG9rLCByZW1vdmUgb3VyIGxvY2FsIGxvY2tcbiAgICAgIGlmIChvaykge1xuICAgICAgICBsb2Nrcy5kZWxldGUobGFiZWwpO1xuICAgICAgfVxuXG4gICAgICAvLyB0cmlnZ2VyIHRoZSBjYWxsYmFja1xuICAgICAgY2FsbGJhY2sob2sgPyBudWxsIDogbmV3IEVycm9yKCdjb3VsZCBub3QgcmVsZWFzZSBsb2NrOiAnICsgbGFiZWwpKTtcbiAgICB9XG5cbiAgICAvLyBoYW5kbGUgdGhlIG5vIG9wdHMgY2FzZVxuICAgIGlmICh0eXBlb2Ygb3B0cyA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYWxsYmFjayA9IG9wdHM7XG4gICAgICBvcHRzID0ge307XG4gICAgfVxuXG4gICAgLy8gZW5zdXJlIHdlIGhhdmUgYSBjYWxsYmFja1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcblxuICAgIC8vIHNldCBhIGRlZmF1bHQgbGFiZWwgdmFsdWVcbiAgICBsYWJlbCA9IChvcHRzIHx8IHt9KS5sYWJlbCB8fCAob3B0cyB8fCB7fSkubmFtZSB8fCAnZGVmYXVsdCc7XG5cbiAgICAvLyBpZiB3ZSBoYXZlIHRoZSBwZWVyIGFuZCBsb2NhbCBsb2NrIHRoZW4gYWN0aW9uIHRoZSB1bmxvY2tcbiAgICBpZiAocGVlciAmJiBsb2Nrcy5nZXQobGFiZWwpKSB7XG4gICAgICBzaWduYWxsZXIub24oJ3VubG9ja3Jlc3VsdCcsIGhhbmRsZVVubG9ja1Jlc3VsdCk7XG4gICAgICBzaWduYWxsZXIudG8odGFyZ2V0SWQpLnNlbmQoJy91bmxvY2snLCBsYWJlbCwgbG9ja3MuZ2V0KGxhYmVsKSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKG5ldyBFcnJvcignbm8gbG9jYWwgbG9jayB3aXRoIGxhYmVsICcgKyBsYWJlbCkpO1xuICAgIH1cbiAgfTtcblxuICAvLyBoYW5kbGUgbWVzc2FnZSBkYXRhIGV2ZW50c1xuICBtZXNzZW5nZXIub24oZGF0YUV2ZW50LCBwcm9jZXNzb3IpO1xuXG4gIC8vIHBhc3MgdGhyb3VnaCBvcGVuIGV2ZW50c1xuICBtZXNzZW5nZXIub24ob3BlbkV2ZW50LCBzaWduYWxsZXIuZW1pdC5iaW5kKHNpZ25hbGxlciwgJ29wZW4nKSk7XG5cbiAgcmV0dXJuIHNpZ25hbGxlcjtcbn07XG5cbnNpZy5sb2FkUHJpbXVzID0gcmVxdWlyZSgnLi9wcmltdXMtbG9hZGVyJyk7IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBTaGltID0gcmVxdWlyZShcIi4vc2hpbVwiKTtcbnZhciBHZW5lcmljQ29sbGVjdGlvbiA9IHJlcXVpcmUoXCIuL2dlbmVyaWMtY29sbGVjdGlvblwiKTtcbnZhciBHZW5lcmljTWFwID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1tYXBcIik7XG52YXIgUHJvcGVydHlDaGFuZ2VzID0gcmVxdWlyZShcIi4vbGlzdGVuL3Byb3BlcnR5LWNoYW5nZXNcIik7XG5cbi8vIEJ1cmdsZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vZG9tZW5pYy9kaWN0XG5cbm1vZHVsZS5leHBvcnRzID0gRGljdDtcbmZ1bmN0aW9uIERpY3QodmFsdWVzLCBnZXREZWZhdWx0KSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIERpY3QpKSB7XG4gICAgICAgIHJldHVybiBuZXcgRGljdCh2YWx1ZXMsIGdldERlZmF1bHQpO1xuICAgIH1cbiAgICBnZXREZWZhdWx0ID0gZ2V0RGVmYXVsdCB8fCBGdW5jdGlvbi5ub29wO1xuICAgIHRoaXMuZ2V0RGVmYXVsdCA9IGdldERlZmF1bHQ7XG4gICAgdGhpcy5zdG9yZSA9IHt9O1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmFkZEVhY2godmFsdWVzKTtcbn1cblxuRGljdC5EaWN0ID0gRGljdDsgLy8gaGFjayBzbyByZXF1aXJlKFwiZGljdFwiKS5EaWN0IHdpbGwgd29yayBpbiBNb250YWdlSlMuXG5cbmZ1bmN0aW9uIG1hbmdsZShrZXkpIHtcbiAgICByZXR1cm4gXCJ+XCIgKyBrZXk7XG59XG5cbmZ1bmN0aW9uIHVubWFuZ2xlKG1hbmdsZWQpIHtcbiAgICByZXR1cm4gbWFuZ2xlZC5zbGljZSgxKTtcbn1cblxuT2JqZWN0LmFkZEVhY2goRGljdC5wcm90b3R5cGUsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChEaWN0LnByb3RvdHlwZSwgR2VuZXJpY01hcC5wcm90b3R5cGUpO1xuT2JqZWN0LmFkZEVhY2goRGljdC5wcm90b3R5cGUsIFByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUpO1xuXG5EaWN0LnByb3RvdHlwZS5jb25zdHJ1Y3RDbG9uZSA9IGZ1bmN0aW9uICh2YWx1ZXMpIHtcbiAgICByZXR1cm4gbmV3IHRoaXMuY29uc3RydWN0b3IodmFsdWVzLCB0aGlzLm1hbmdsZSwgdGhpcy5nZXREZWZhdWx0KTtcbn07XG5cbkRpY3QucHJvdG90eXBlLmFzc2VydFN0cmluZyA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAodHlwZW9mIGtleSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwia2V5IG11c3QgYmUgYSBzdHJpbmcgYnV0IEdvdCBcIiArIGtleSk7XG4gICAgfVxufVxuXG5EaWN0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsdWUpIHtcbiAgICB0aGlzLmFzc2VydFN0cmluZyhrZXkpO1xuICAgIHZhciBtYW5nbGVkID0gbWFuZ2xlKGtleSk7XG4gICAgaWYgKG1hbmdsZWQgaW4gdGhpcy5zdG9yZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdG9yZVttYW5nbGVkXTtcbiAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdChrZXkpO1xuICAgIH1cbn07XG5cbkRpY3QucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgdGhpcy5hc3NlcnRTdHJpbmcoa2V5KTtcbiAgICB2YXIgbWFuZ2xlZCA9IG1hbmdsZShrZXkpO1xuICAgIGlmIChtYW5nbGVkIGluIHRoaXMuc3RvcmUpIHsgLy8gdXBkYXRlXG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNCZWZvcmVNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgdGhpcy5zdG9yZVttYW5nbGVkXSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdG9yZVttYW5nbGVkXSA9IHZhbHVlO1xuICAgICAgICBpZiAodGhpcy5kaXNwYXRjaGVzTWFwQ2hhbmdlcykge1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaE1hcENoYW5nZShrZXksIHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBlbHNlIHsgLy8gY3JlYXRlXG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxlbmd0aCsrO1xuICAgICAgICB0aGlzLnN0b3JlW21hbmdsZWRdID0gdmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoTWFwQ2hhbmdlKGtleSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbn07XG5cbkRpY3QucHJvdG90eXBlLmhhcyA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICB0aGlzLmFzc2VydFN0cmluZyhrZXkpO1xuICAgIHZhciBtYW5nbGVkID0gbWFuZ2xlKGtleSk7XG4gICAgcmV0dXJuIG1hbmdsZWQgaW4gdGhpcy5zdG9yZTtcbn07XG5cbkRpY3QucHJvdG90eXBlW1wiZGVsZXRlXCJdID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHRoaXMuYXNzZXJ0U3RyaW5nKGtleSk7XG4gICAgdmFyIG1hbmdsZWQgPSBtYW5nbGUoa2V5KTtcbiAgICBpZiAobWFuZ2xlZCBpbiB0aGlzLnN0b3JlKSB7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgdGhpcy5zdG9yZVttYW5nbGVkXSk7XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHRoaXMuc3RvcmVbbWFuZ2xlKGtleSldO1xuICAgICAgICB0aGlzLmxlbmd0aC0tO1xuICAgICAgICBpZiAodGhpcy5kaXNwYXRjaGVzTWFwQ2hhbmdlcykge1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaE1hcENoYW5nZShrZXksIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn07XG5cbkRpY3QucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBrZXksIG1hbmdsZWQ7XG4gICAgZm9yIChtYW5nbGVkIGluIHRoaXMuc3RvcmUpIHtcbiAgICAgICAga2V5ID0gdW5tYW5nbGUobWFuZ2xlZCk7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgdGhpcy5zdG9yZVttYW5nbGVkXSk7XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHRoaXMuc3RvcmVbbWFuZ2xlZF07XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoTWFwQ2hhbmdlKGtleSwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmxlbmd0aCA9IDA7XG59O1xuXG5EaWN0LnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIGJhc2lzLCB0aGlzcCkge1xuICAgIGZvciAodmFyIG1hbmdsZWQgaW4gdGhpcy5zdG9yZSkge1xuICAgICAgICBiYXNpcyA9IGNhbGxiYWNrLmNhbGwodGhpc3AsIGJhc2lzLCB0aGlzLnN0b3JlW21hbmdsZWRdLCB1bm1hbmdsZShtYW5nbGVkKSwgdGhpcyk7XG4gICAgfVxuICAgIHJldHVybiBiYXNpcztcbn07XG5cbkRpY3QucHJvdG90eXBlLnJlZHVjZVJpZ2h0ID0gZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcywgdGhpc3ApIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIHN0b3JlID0gdGhpcy5zdG9yZTtcbiAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5zdG9yZSkucmVkdWNlUmlnaHQoZnVuY3Rpb24gKGJhc2lzLCBtYW5nbGVkKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHRoaXNwLCBiYXNpcywgc3RvcmVbbWFuZ2xlZF0sIHVubWFuZ2xlKG1hbmdsZWQpLCBzZWxmKTtcbiAgICB9LCBiYXNpcyk7XG59O1xuXG5EaWN0LnByb3RvdHlwZS5vbmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGtleTtcbiAgICBmb3IgKGtleSBpbiB0aGlzLnN0b3JlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0b3JlW2tleV07XG4gICAgfVxufTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBTaGltID0gcmVxdWlyZShcIi4vc2hpbVwiKTtcbnZhciBTZXQgPSByZXF1aXJlKFwiLi9mYXN0LXNldFwiKTtcbnZhciBHZW5lcmljQ29sbGVjdGlvbiA9IHJlcXVpcmUoXCIuL2dlbmVyaWMtY29sbGVjdGlvblwiKTtcbnZhciBHZW5lcmljTWFwID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1tYXBcIik7XG52YXIgUHJvcGVydHlDaGFuZ2VzID0gcmVxdWlyZShcIi4vbGlzdGVuL3Byb3BlcnR5LWNoYW5nZXNcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gRmFzdE1hcDtcblxuZnVuY3Rpb24gRmFzdE1hcCh2YWx1ZXMsIGVxdWFscywgaGFzaCwgZ2V0RGVmYXVsdCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBGYXN0TWFwKSkge1xuICAgICAgICByZXR1cm4gbmV3IEZhc3RNYXAodmFsdWVzLCBlcXVhbHMsIGhhc2gsIGdldERlZmF1bHQpO1xuICAgIH1cbiAgICBlcXVhbHMgPSBlcXVhbHMgfHwgT2JqZWN0LmVxdWFscztcbiAgICBoYXNoID0gaGFzaCB8fCBPYmplY3QuaGFzaDtcbiAgICBnZXREZWZhdWx0ID0gZ2V0RGVmYXVsdCB8fCBGdW5jdGlvbi5ub29wO1xuICAgIHRoaXMuY29udGVudEVxdWFscyA9IGVxdWFscztcbiAgICB0aGlzLmNvbnRlbnRIYXNoID0gaGFzaDtcbiAgICB0aGlzLmdldERlZmF1bHQgPSBnZXREZWZhdWx0O1xuICAgIHRoaXMuc3RvcmUgPSBuZXcgU2V0KFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIGZ1bmN0aW9uIGtleXNFcXVhbChhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gZXF1YWxzKGEua2V5LCBiLmtleSk7XG4gICAgICAgIH0sXG4gICAgICAgIGZ1bmN0aW9uIGtleUhhc2goaXRlbSkge1xuICAgICAgICAgICAgcmV0dXJuIGhhc2goaXRlbS5rZXkpO1xuICAgICAgICB9XG4gICAgKTtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5hZGRFYWNoKHZhbHVlcyk7XG59XG5cbkZhc3RNYXAuRmFzdE1hcCA9IEZhc3RNYXA7IC8vIGhhY2sgc28gcmVxdWlyZShcImZhc3QtbWFwXCIpLkZhc3RNYXAgd2lsbCB3b3JrIGluIE1vbnRhZ2VKU1xuXG5PYmplY3QuYWRkRWFjaChGYXN0TWFwLnByb3RvdHlwZSwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlKTtcbk9iamVjdC5hZGRFYWNoKEZhc3RNYXAucHJvdG90eXBlLCBHZW5lcmljTWFwLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChGYXN0TWFwLnByb3RvdHlwZSwgUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZSk7XG5cbkZhc3RNYXAucHJvdG90eXBlLmNvbnN0cnVjdENsb25lID0gZnVuY3Rpb24gKHZhbHVlcykge1xuICAgIHJldHVybiBuZXcgdGhpcy5jb25zdHJ1Y3RvcihcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICB0aGlzLmNvbnRlbnRFcXVhbHMsXG4gICAgICAgIHRoaXMuY29udGVudEhhc2gsXG4gICAgICAgIHRoaXMuZ2V0RGVmYXVsdFxuICAgICk7XG59O1xuXG5GYXN0TWFwLnByb3RvdHlwZS5sb2cgPSBmdW5jdGlvbiAoY2hhcm1hcCwgc3RyaW5naWZ5KSB7XG4gICAgc3RyaW5naWZ5ID0gc3RyaW5naWZ5IHx8IHRoaXMuc3RyaW5naWZ5O1xuICAgIHRoaXMuc3RvcmUubG9nKGNoYXJtYXAsIHN0cmluZ2lmeSk7XG59O1xuXG5GYXN0TWFwLnByb3RvdHlwZS5zdHJpbmdpZnkgPSBmdW5jdGlvbiAoaXRlbSwgbGVhZGVyKSB7XG4gICAgcmV0dXJuIGxlYWRlciArIEpTT04uc3RyaW5naWZ5KGl0ZW0ua2V5KSArIFwiOiBcIiArIEpTT04uc3RyaW5naWZ5KGl0ZW0udmFsdWUpO1xufVxuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFNoaW0gPSByZXF1aXJlKFwiLi9zaGltXCIpO1xudmFyIERpY3QgPSByZXF1aXJlKFwiLi9kaWN0XCIpO1xudmFyIExpc3QgPSByZXF1aXJlKFwiLi9saXN0XCIpO1xudmFyIEdlbmVyaWNDb2xsZWN0aW9uID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1jb2xsZWN0aW9uXCIpO1xudmFyIEdlbmVyaWNTZXQgPSByZXF1aXJlKFwiLi9nZW5lcmljLXNldFwiKTtcbnZhciBUcmVlTG9nID0gcmVxdWlyZShcIi4vdHJlZS1sb2dcIik7XG52YXIgUHJvcGVydHlDaGFuZ2VzID0gcmVxdWlyZShcIi4vbGlzdGVuL3Byb3BlcnR5LWNoYW5nZXNcIik7XG5cbnZhciBvYmplY3RfaGFzID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxubW9kdWxlLmV4cG9ydHMgPSBGYXN0U2V0O1xuXG5mdW5jdGlvbiBGYXN0U2V0KHZhbHVlcywgZXF1YWxzLCBoYXNoLCBnZXREZWZhdWx0KSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEZhc3RTZXQpKSB7XG4gICAgICAgIHJldHVybiBuZXcgRmFzdFNldCh2YWx1ZXMsIGVxdWFscywgaGFzaCwgZ2V0RGVmYXVsdCk7XG4gICAgfVxuICAgIGVxdWFscyA9IGVxdWFscyB8fCBPYmplY3QuZXF1YWxzO1xuICAgIGhhc2ggPSBoYXNoIHx8IE9iamVjdC5oYXNoO1xuICAgIGdldERlZmF1bHQgPSBnZXREZWZhdWx0IHx8IEZ1bmN0aW9uLm5vb3A7XG4gICAgdGhpcy5jb250ZW50RXF1YWxzID0gZXF1YWxzO1xuICAgIHRoaXMuY29udGVudEhhc2ggPSBoYXNoO1xuICAgIHRoaXMuZ2V0RGVmYXVsdCA9IGdldERlZmF1bHQ7XG4gICAgdGhpcy5idWNrZXRzID0gbmV3IHRoaXMuQnVja2V0cyhudWxsLCB0aGlzLkJ1Y2tldCk7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xuICAgIHRoaXMuYWRkRWFjaCh2YWx1ZXMpO1xufVxuXG5GYXN0U2V0LkZhc3RTZXQgPSBGYXN0U2V0OyAvLyBoYWNrIHNvIHJlcXVpcmUoXCJmYXN0LXNldFwiKS5GYXN0U2V0IHdpbGwgd29yayBpbiBNb250YWdlSlNcblxuT2JqZWN0LmFkZEVhY2goRmFzdFNldC5wcm90b3R5cGUsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChGYXN0U2V0LnByb3RvdHlwZSwgR2VuZXJpY1NldC5wcm90b3R5cGUpO1xuT2JqZWN0LmFkZEVhY2goRmFzdFNldC5wcm90b3R5cGUsIFByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUpO1xuXG5GYXN0U2V0LnByb3RvdHlwZS5CdWNrZXRzID0gRGljdDtcbkZhc3RTZXQucHJvdG90eXBlLkJ1Y2tldCA9IExpc3Q7XG5cbkZhc3RTZXQucHJvdG90eXBlLmNvbnN0cnVjdENsb25lID0gZnVuY3Rpb24gKHZhbHVlcykge1xuICAgIHJldHVybiBuZXcgdGhpcy5jb25zdHJ1Y3RvcihcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICB0aGlzLmNvbnRlbnRFcXVhbHMsXG4gICAgICAgIHRoaXMuY29udGVudEhhc2gsXG4gICAgICAgIHRoaXMuZ2V0RGVmYXVsdFxuICAgICk7XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgaGFzaCA9IHRoaXMuY29udGVudEhhc2godmFsdWUpO1xuICAgIHJldHVybiB0aGlzLmJ1Y2tldHMuZ2V0KGhhc2gpLmhhcyh2YWx1ZSk7XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgaGFzaCA9IHRoaXMuY29udGVudEhhc2godmFsdWUpO1xuICAgIHZhciBidWNrZXRzID0gdGhpcy5idWNrZXRzO1xuICAgIGlmIChidWNrZXRzLmhhcyhoYXNoKSkge1xuICAgICAgICByZXR1cm4gYnVja2V0cy5nZXQoaGFzaCkuZ2V0KHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0KHZhbHVlKTtcbiAgICB9XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZVsnZGVsZXRlJ10gPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgaGFzaCA9IHRoaXMuY29udGVudEhhc2godmFsdWUpO1xuICAgIHZhciBidWNrZXRzID0gdGhpcy5idWNrZXRzO1xuICAgIGlmIChidWNrZXRzLmhhcyhoYXNoKSkge1xuICAgICAgICB2YXIgYnVja2V0ID0gYnVja2V0cy5nZXQoaGFzaCk7XG4gICAgICAgIGlmIChidWNrZXRbXCJkZWxldGVcIl0odmFsdWUpKSB7XG4gICAgICAgICAgICB0aGlzLmxlbmd0aC0tO1xuICAgICAgICAgICAgaWYgKGJ1Y2tldC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBidWNrZXRzW1wiZGVsZXRlXCJdKGhhc2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcblxuRmFzdFNldC5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5idWNrZXRzLmNsZWFyKCk7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xufTtcblxuRmFzdFNldC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIGhhc2ggPSB0aGlzLmNvbnRlbnRIYXNoKHZhbHVlKTtcbiAgICB2YXIgYnVja2V0cyA9IHRoaXMuYnVja2V0cztcbiAgICBpZiAoIWJ1Y2tldHMuaGFzKGhhc2gpKSB7XG4gICAgICAgIGJ1Y2tldHMuc2V0KGhhc2gsIG5ldyB0aGlzLkJ1Y2tldChudWxsLCB0aGlzLmNvbnRlbnRFcXVhbHMpKTtcbiAgICB9XG4gICAgaWYgKCFidWNrZXRzLmdldChoYXNoKS5oYXModmFsdWUpKSB7XG4gICAgICAgIGJ1Y2tldHMuZ2V0KGhhc2gpLmFkZCh2YWx1ZSk7XG4gICAgICAgIHRoaXMubGVuZ3RoKys7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIGJhc2lzIC8qLCB0aGlzcCovKSB7XG4gICAgdmFyIHRoaXNwID0gYXJndW1lbnRzWzJdO1xuICAgIHZhciBidWNrZXRzID0gdGhpcy5idWNrZXRzO1xuICAgIHZhciBpbmRleCA9IDA7XG4gICAgcmV0dXJuIGJ1Y2tldHMucmVkdWNlKGZ1bmN0aW9uIChiYXNpcywgYnVja2V0KSB7XG4gICAgICAgIHJldHVybiBidWNrZXQucmVkdWNlKGZ1bmN0aW9uIChiYXNpcywgdmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHRoaXNwLCBiYXNpcywgdmFsdWUsIGluZGV4KyssIHRoaXMpO1xuICAgICAgICB9LCBiYXNpcywgdGhpcyk7XG4gICAgfSwgYmFzaXMsIHRoaXMpO1xufTtcblxuRmFzdFNldC5wcm90b3R5cGUub25lID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVja2V0cy5vbmUoKS5vbmUoKTtcbiAgICB9XG59O1xuXG5GYXN0U2V0LnByb3RvdHlwZS5pdGVyYXRlID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmJ1Y2tldHMudmFsdWVzKCkuZmxhdHRlbigpLml0ZXJhdGUoKTtcbn07XG5cbkZhc3RTZXQucHJvdG90eXBlLmxvZyA9IGZ1bmN0aW9uIChjaGFybWFwLCBsb2dOb2RlLCBjYWxsYmFjaywgdGhpc3ApIHtcbiAgICBjaGFybWFwID0gY2hhcm1hcCB8fCBUcmVlTG9nLnVuaWNvZGVTaGFycDtcbiAgICBsb2dOb2RlID0gbG9nTm9kZSB8fCB0aGlzLmxvZ05vZGU7XG4gICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNvbnNvbGUubG9nO1xuICAgICAgICB0aGlzcCA9IGNvbnNvbGU7XG4gICAgfVxuICAgIGNhbGxiYWNrID0gY2FsbGJhY2suYmluZCh0aGlzcCk7XG5cbiAgICB2YXIgYnVja2V0cyA9IHRoaXMuYnVja2V0cztcbiAgICB2YXIgaGFzaGVzID0gYnVja2V0cy5rZXlzKCk7XG4gICAgaGFzaGVzLmZvckVhY2goZnVuY3Rpb24gKGhhc2gsIGluZGV4KSB7XG4gICAgICAgIHZhciBicmFuY2g7XG4gICAgICAgIHZhciBsZWFkZXI7XG4gICAgICAgIGlmIChpbmRleCA9PT0gaGFzaGVzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIGJyYW5jaCA9IGNoYXJtYXAuZnJvbUFib3ZlO1xuICAgICAgICAgICAgbGVhZGVyID0gJyAnO1xuICAgICAgICB9IGVsc2UgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICBicmFuY2ggPSBjaGFybWFwLmJyYW5jaERvd247XG4gICAgICAgICAgICBsZWFkZXIgPSBjaGFybWFwLnN0cmFmZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJyYW5jaCA9IGNoYXJtYXAuZnJvbUJvdGg7XG4gICAgICAgICAgICBsZWFkZXIgPSBjaGFybWFwLnN0cmFmZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgYnVja2V0ID0gYnVja2V0cy5nZXQoaGFzaCk7XG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpc3AsIGJyYW5jaCArIGNoYXJtYXAudGhyb3VnaCArIGNoYXJtYXAuYnJhbmNoRG93biArICcgJyArIGhhc2gpO1xuICAgICAgICBidWNrZXQuZm9yRWFjaChmdW5jdGlvbiAodmFsdWUsIG5vZGUpIHtcbiAgICAgICAgICAgIHZhciBicmFuY2gsIGJlbG93O1xuICAgICAgICAgICAgaWYgKG5vZGUgPT09IGJ1Y2tldC5oZWFkLnByZXYpIHtcbiAgICAgICAgICAgICAgICBicmFuY2ggPSBjaGFybWFwLmZyb21BYm92ZTtcbiAgICAgICAgICAgICAgICBiZWxvdyA9ICcgJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnJhbmNoID0gY2hhcm1hcC5mcm9tQm90aDtcbiAgICAgICAgICAgICAgICBiZWxvdyA9IGNoYXJtYXAuc3RyYWZlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIHdyaXR0ZW47XG4gICAgICAgICAgICBsb2dOb2RlKFxuICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF3cml0dGVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHRoaXNwLCBsZWFkZXIgKyAnICcgKyBicmFuY2ggKyBjaGFybWFwLnRocm91Z2ggKyBjaGFybWFwLnRocm91Z2ggKyBsaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdyaXR0ZW4gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzcCwgbGVhZGVyICsgJyAnICsgYmVsb3cgKyAnICAnICsgbGluZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwodGhpc3AsIGxlYWRlciArICcgJyArIGNoYXJtYXAuc3RyYWZlICsgJyAgJyArIGxpbmUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuRmFzdFNldC5wcm90b3R5cGUubG9nTm9kZSA9IGZ1bmN0aW9uIChub2RlLCB3cml0ZSkge1xuICAgIHZhciB2YWx1ZSA9IG5vZGUudmFsdWU7XG4gICAgaWYgKE9iamVjdCh2YWx1ZSkgPT09IHZhbHVlKSB7XG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCA0KS5zcGxpdChcIlxcblwiKS5mb3JFYWNoKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgICAgICB3cml0ZShcIiBcIiArIGxpbmUpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB3cml0ZShcIiBcIiArIHZhbHVlKTtcbiAgICB9XG59O1xuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBHZW5lcmljQ29sbGVjdGlvbjtcbmZ1bmN0aW9uIEdlbmVyaWNDb2xsZWN0aW9uKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNvbnN0cnVjdC4gR2VuZXJpY0NvbGxlY3Rpb24gaXMgYSBtaXhpbi5cIik7XG59XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5hZGRFYWNoID0gZnVuY3Rpb24gKHZhbHVlcykge1xuICAgIGlmICh2YWx1ZXMgJiYgT2JqZWN0KHZhbHVlcykgPT09IHZhbHVlcykge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlcy5mb3JFYWNoID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIHZhbHVlcy5mb3JFYWNoKHRoaXMuYWRkLCB0aGlzKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWVzLmxlbmd0aCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgLy8gQXJyYXktbGlrZSBvYmplY3RzIHRoYXQgZG8gbm90IGltcGxlbWVudCBmb3JFYWNoLCBlcmdvLFxuICAgICAgICAgICAgLy8gQXJndW1lbnRzXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZhbHVlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkKHZhbHVlc1tpXSwgaSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyh2YWx1ZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkKHZhbHVlc1trZXldLCBrZXkpO1xuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBUaGlzIGlzIHN1ZmZpY2llbnRseSBnZW5lcmljIGZvciBNYXAgKHNpbmNlIHRoZSB2YWx1ZSBtYXkgYmUgYSBrZXkpXG4vLyBhbmQgb3JkZXJlZCBjb2xsZWN0aW9ucyAoc2luY2UgaXQgZm9yd2FyZHMgdGhlIGVxdWFscyBhcmd1bWVudClcbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5kZWxldGVFYWNoID0gZnVuY3Rpb24gKHZhbHVlcywgZXF1YWxzKSB7XG4gICAgdmFsdWVzLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHRoaXNbXCJkZWxldGVcIl0odmFsdWUsIGVxdWFscyk7XG4gICAgfSwgdGhpcyk7XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBhbGwgb2YgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnMgYXJlIGltcGxlbWVudGVkIGluIHRlcm1zIG9mIFwicmVkdWNlXCIuXG4vLyBzb21lIG5lZWQgXCJjb25zdHJ1Y3RDbG9uZVwiLlxuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuZm9yRWFjaCA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKiwgdGhpc3AqLykge1xuICAgIHZhciB0aGlzcCA9IGFyZ3VtZW50c1sxXTtcbiAgICByZXR1cm4gdGhpcy5yZWR1Y2UoZnVuY3Rpb24gKHVuZGVmaW5lZCwgdmFsdWUsIGtleSwgb2JqZWN0LCBkZXB0aCkge1xuICAgICAgICBjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwga2V5LCBvYmplY3QsIGRlcHRoKTtcbiAgICB9LCB1bmRlZmluZWQpO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLm1hcCA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKiwgdGhpc3AqLykge1xuICAgIHZhciB0aGlzcCA9IGFyZ3VtZW50c1sxXTtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgdGhpcy5yZWR1Y2UoZnVuY3Rpb24gKHVuZGVmaW5lZCwgdmFsdWUsIGtleSwgb2JqZWN0LCBkZXB0aCkge1xuICAgICAgICByZXN1bHQucHVzaChjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwga2V5LCBvYmplY3QsIGRlcHRoKSk7XG4gICAgfSwgdW5kZWZpbmVkKTtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmVudW1lcmF0ZSA9IGZ1bmN0aW9uIChzdGFydCkge1xuICAgIGlmIChzdGFydCA9PSBudWxsKSB7XG4gICAgICAgIHN0YXJ0ID0gMDtcbiAgICB9XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHRoaXMucmVkdWNlKGZ1bmN0aW9uICh1bmRlZmluZWQsIHZhbHVlKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKFtzdGFydCsrLCB2YWx1ZV0pO1xuICAgIH0sIHVuZGVmaW5lZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5ncm91cCA9IGZ1bmN0aW9uIChjYWxsYmFjaywgdGhpc3AsIGVxdWFscykge1xuICAgIGVxdWFscyA9IGVxdWFscyB8fCBPYmplY3QuZXF1YWxzO1xuICAgIHZhciBncm91cHMgPSBbXTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAodmFsdWUsIGtleSwgb2JqZWN0KSB7XG4gICAgICAgIHZhciBrZXkgPSBjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwga2V5LCBvYmplY3QpO1xuICAgICAgICB2YXIgaW5kZXggPSBrZXlzLmluZGV4T2Yoa2V5LCBlcXVhbHMpO1xuICAgICAgICB2YXIgZ3JvdXA7XG4gICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgIGdyb3VwID0gW107XG4gICAgICAgICAgICBncm91cHMucHVzaChba2V5LCBncm91cF0pO1xuICAgICAgICAgICAga2V5cy5wdXNoKGtleSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBncm91cCA9IGdyb3Vwc1tpbmRleF1bMV07XG4gICAgICAgIH1cbiAgICAgICAgZ3JvdXAucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGdyb3Vwcztcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS50b0FycmF5ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLm1hcChGdW5jdGlvbi5pZGVudGl0eSk7XG59O1xuXG4vLyB0aGlzIGRlcGVuZHMgb24gc3RyaW5nYWJsZSBrZXlzLCB3aGljaCBhcHBseSB0byBBcnJheSBhbmQgSXRlcmF0b3Jcbi8vIGJlY2F1c2UgdGhleSBoYXZlIG51bWVyaWMga2V5cyBhbmQgYWxsIE1hcHMgc2luY2UgdGhleSBtYXkgdXNlXG4vLyBzdHJpbmdzIGFzIGtleXMuICBMaXN0LCBTZXQsIGFuZCBTb3J0ZWRTZXQgaGF2ZSBub2RlcyBmb3Iga2V5cywgc29cbi8vIHRvT2JqZWN0IHdvdWxkIG5vdCBiZSBtZWFuaW5nZnVsLlxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnRvT2JqZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBvYmplY3QgPSB7fTtcbiAgICB0aGlzLnJlZHVjZShmdW5jdGlvbiAodW5kZWZpbmVkLCB2YWx1ZSwga2V5KSB7XG4gICAgICAgIG9iamVjdFtrZXldID0gdmFsdWU7XG4gICAgfSwgdW5kZWZpbmVkKTtcbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmZpbHRlciA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKiwgdGhpc3AqLykge1xuICAgIHZhciB0aGlzcCA9IGFyZ3VtZW50c1sxXTtcbiAgICB2YXIgcmVzdWx0ID0gdGhpcy5jb25zdHJ1Y3RDbG9uZSgpO1xuICAgIHRoaXMucmVkdWNlKGZ1bmN0aW9uICh1bmRlZmluZWQsIHZhbHVlLCBrZXksIG9iamVjdCwgZGVwdGgpIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrLmNhbGwodGhpc3AsIHZhbHVlLCBrZXksIG9iamVjdCwgZGVwdGgpKSB7XG4gICAgICAgICAgICByZXN1bHQuYWRkKHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH0sIHVuZGVmaW5lZCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5ldmVyeSA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKiwgdGhpc3AqLykge1xuICAgIHZhciB0aGlzcCA9IGFyZ3VtZW50c1sxXTtcbiAgICByZXR1cm4gdGhpcy5yZWR1Y2UoZnVuY3Rpb24gKHJlc3VsdCwgdmFsdWUsIGtleSwgb2JqZWN0LCBkZXB0aCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0ICYmIGNhbGxiYWNrLmNhbGwodGhpc3AsIHZhbHVlLCBrZXksIG9iamVjdCwgZGVwdGgpO1xuICAgIH0sIHRydWUpO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnNvbWUgPSBmdW5jdGlvbiAoY2FsbGJhY2sgLyosIHRoaXNwKi8pIHtcbiAgICB2YXIgdGhpc3AgPSBhcmd1bWVudHNbMV07XG4gICAgcmV0dXJuIHRoaXMucmVkdWNlKGZ1bmN0aW9uIChyZXN1bHQsIHZhbHVlLCBrZXksIG9iamVjdCwgZGVwdGgpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCB8fCBjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwga2V5LCBvYmplY3QsIGRlcHRoKTtcbiAgICB9LCBmYWxzZSk7XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuYWxsID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmV2ZXJ5KEJvb2xlYW4pO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmFueSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zb21lKEJvb2xlYW4pO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLm1pbiA9IGZ1bmN0aW9uIChjb21wYXJlKSB7XG4gICAgY29tcGFyZSA9IGNvbXBhcmUgfHwgdGhpcy5jb250ZW50Q29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcbiAgICB2YXIgZmlyc3QgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLnJlZHVjZShmdW5jdGlvbiAocmVzdWx0LCB2YWx1ZSkge1xuICAgICAgICBpZiAoZmlyc3QpIHtcbiAgICAgICAgICAgIGZpcnN0ID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gY29tcGFyZSh2YWx1ZSwgcmVzdWx0KSA8IDAgPyB2YWx1ZSA6IHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH0sIHVuZGVmaW5lZCk7XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUubWF4ID0gZnVuY3Rpb24gKGNvbXBhcmUpIHtcbiAgICBjb21wYXJlID0gY29tcGFyZSB8fCB0aGlzLmNvbnRlbnRDb21wYXJlIHx8IE9iamVjdC5jb21wYXJlO1xuICAgIHZhciBmaXJzdCA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXMucmVkdWNlKGZ1bmN0aW9uIChyZXN1bHQsIHZhbHVlKSB7XG4gICAgICAgIGlmIChmaXJzdCkge1xuICAgICAgICAgICAgZmlyc3QgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBjb21wYXJlKHZhbHVlLCByZXN1bHQpID4gMCA/IHZhbHVlIDogcmVzdWx0O1xuICAgICAgICB9XG4gICAgfSwgdW5kZWZpbmVkKTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5zdW0gPSBmdW5jdGlvbiAoemVybykge1xuICAgIHplcm8gPSB6ZXJvID09PSB1bmRlZmluZWQgPyAwIDogemVybztcbiAgICByZXR1cm4gdGhpcy5yZWR1Y2UoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgcmV0dXJuIGEgKyBiO1xuICAgIH0sIHplcm8pO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmF2ZXJhZ2UgPSBmdW5jdGlvbiAoemVybykge1xuICAgIHZhciBzdW0gPSB6ZXJvID09PSB1bmRlZmluZWQgPyAwIDogemVybztcbiAgICB2YXIgY291bnQgPSB6ZXJvID09PSB1bmRlZmluZWQgPyAwIDogemVybztcbiAgICB0aGlzLnJlZHVjZShmdW5jdGlvbiAodW5kZWZpbmVkLCB2YWx1ZSkge1xuICAgICAgICBzdW0gKz0gdmFsdWU7XG4gICAgICAgIGNvdW50ICs9IDE7XG4gICAgfSwgdW5kZWZpbmVkKTtcbiAgICByZXR1cm4gc3VtIC8gY291bnQ7XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuY29uY2F0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciByZXN1bHQgPSB0aGlzLmNvbnN0cnVjdENsb25lKHRoaXMpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlc3VsdC5hZGRFYWNoKGFyZ3VtZW50c1tpXSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuZmxhdHRlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMucmVkdWNlKGZ1bmN0aW9uIChyZXN1bHQsIGFycmF5KSB7XG4gICAgICAgIGFycmF5LmZvckVhY2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB0aGlzLnB1c2godmFsdWUpO1xuICAgICAgICB9LCByZXN1bHQsIHNlbGYpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sIFtdKTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS56aXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRhYmxlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICB0YWJsZS51bnNoaWZ0KHRoaXMpO1xuICAgIHJldHVybiBBcnJheS51bnppcCh0YWJsZSk7XG59XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5qb2luID0gZnVuY3Rpb24gKGRlbGltaXRlcikge1xuICAgIHJldHVybiB0aGlzLnJlZHVjZShmdW5jdGlvbiAocmVzdWx0LCBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIGRlbGltaXRlciArIHN0cmluZztcbiAgICB9KTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5zb3J0ZWQgPSBmdW5jdGlvbiAoY29tcGFyZSwgYnksIG9yZGVyKSB7XG4gICAgY29tcGFyZSA9IGNvbXBhcmUgfHwgdGhpcy5jb250ZW50Q29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcbiAgICAvLyBhY2NvdW50IGZvciBjb21wYXJhdG9ycyBnZW5lcmF0ZWQgYnkgRnVuY3Rpb24uYnlcbiAgICBpZiAoY29tcGFyZS5ieSkge1xuICAgICAgICBieSA9IGNvbXBhcmUuYnk7XG4gICAgICAgIGNvbXBhcmUgPSBjb21wYXJlLmNvbXBhcmUgfHwgdGhpcy5jb250ZW50Q29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBieSA9IGJ5IHx8IEZ1bmN0aW9uLmlkZW50aXR5O1xuICAgIH1cbiAgICBpZiAob3JkZXIgPT09IHVuZGVmaW5lZClcbiAgICAgICAgb3JkZXIgPSAxO1xuICAgIHJldHVybiB0aGlzLm1hcChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYnk6IGJ5KGl0ZW0pLFxuICAgICAgICAgICAgdmFsdWU6IGl0ZW1cbiAgICAgICAgfTtcbiAgICB9KVxuICAgIC5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgIHJldHVybiBjb21wYXJlKGEuYnksIGIuYnkpICogb3JkZXI7XG4gICAgfSlcbiAgICAubWFwKGZ1bmN0aW9uIChwYWlyKSB7XG4gICAgICAgIHJldHVybiBwYWlyLnZhbHVlO1xuICAgIH0pO1xufTtcblxuR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnJldmVyc2VkID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmNvbnN0cnVjdENsb25lKHRoaXMpLnJldmVyc2UoKTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uIChkZXB0aCwgbWVtbykge1xuICAgIGlmIChkZXB0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlcHRoID0gSW5maW5pdHk7XG4gICAgfSBlbHNlIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgdmFyIGNsb25lID0gdGhpcy5jb25zdHJ1Y3RDbG9uZSgpO1xuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAodmFsdWUsIGtleSkge1xuICAgICAgICBjbG9uZS5hZGQoT2JqZWN0LmNsb25lKHZhbHVlLCBkZXB0aCAtIDEsIG1lbW8pLCBrZXkpO1xuICAgIH0sIHRoaXMpO1xuICAgIHJldHVybiBjbG9uZTtcbn07XG5cbkdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5vbmx5ID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gdGhpcy5vbmUoKTtcbiAgICB9XG59O1xuXG5HZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuaXRlcmF0b3IgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuaXRlcmF0ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xufTtcblxucmVxdWlyZShcIi4vc2hpbS1hcnJheVwiKTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBPYmplY3QgPSByZXF1aXJlKFwiLi9zaGltLW9iamVjdFwiKTtcbnZhciBNYXBDaGFuZ2VzID0gcmVxdWlyZShcIi4vbGlzdGVuL21hcC1jaGFuZ2VzXCIpO1xudmFyIFByb3BlcnR5Q2hhbmdlcyA9IHJlcXVpcmUoXCIuL2xpc3Rlbi9wcm9wZXJ0eS1jaGFuZ2VzXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEdlbmVyaWNNYXA7XG5mdW5jdGlvbiBHZW5lcmljTWFwKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNvbnN0cnVjdC4gR2VuZXJpY01hcCBpcyBhIG1peGluLlwiKTtcbn1cblxuT2JqZWN0LmFkZEVhY2goR2VuZXJpY01hcC5wcm90b3R5cGUsIE1hcENoYW5nZXMucHJvdG90eXBlKTtcbk9iamVjdC5hZGRFYWNoKEdlbmVyaWNNYXAucHJvdG90eXBlLCBQcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlKTtcblxuLy8gYWxsIG9mIHRoZXNlIG1ldGhvZHMgZGVwZW5kIG9uIHRoZSBjb25zdHJ1Y3RvciBwcm92aWRpbmcgYSBgc3RvcmVgIHNldFxuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5pc01hcCA9IHRydWU7XG5cbkdlbmVyaWNNYXAucHJvdG90eXBlLmFkZEVhY2ggPSBmdW5jdGlvbiAodmFsdWVzKSB7XG4gICAgaWYgKHZhbHVlcyAmJiBPYmplY3QodmFsdWVzKSA9PT0gdmFsdWVzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVzLmZvckVhY2ggPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgLy8gY29weSBtYXAtYWxpa2VzXG4gICAgICAgICAgICBpZiAodmFsdWVzLmlzTWFwID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICAvLyBpdGVyYXRlIGtleSB2YWx1ZSBwYWlycyBvZiBvdGhlciBpdGVyYWJsZXNcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLmZvckVhY2goZnVuY3Rpb24gKHBhaXIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXQocGFpclswXSwgcGFpclsxXSk7XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBjb3B5IG90aGVyIG9iamVjdHMgYXMgbWFwLWFsaWtlc1xuICAgICAgICAgICAgT2JqZWN0LmtleXModmFsdWVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldChrZXksIHZhbHVlc1trZXldKTtcbiAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufVxuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsdWUpIHtcbiAgICB2YXIgaXRlbSA9IHRoaXMuc3RvcmUuZ2V0KG5ldyB0aGlzLkl0ZW0oa2V5KSk7XG4gICAgaWYgKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0udmFsdWU7XG4gICAgfSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHQoa2V5KTtcbiAgICB9XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgIHZhciBpdGVtID0gbmV3IHRoaXMuSXRlbShrZXksIHZhbHVlKTtcbiAgICB2YXIgZm91bmQgPSB0aGlzLnN0b3JlLmdldChpdGVtKTtcbiAgICB2YXIgZ3JldyA9IGZhbHNlO1xuICAgIGlmIChmb3VuZCkgeyAvLyB1cGRhdGVcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hCZWZvcmVNYXBDaGFuZ2Uoa2V5LCBmb3VuZC52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZm91bmQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hNYXBDaGFuZ2Uoa2V5LCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgeyAvLyBjcmVhdGVcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hCZWZvcmVNYXBDaGFuZ2Uoa2V5LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnN0b3JlLmFkZChpdGVtKSkge1xuICAgICAgICAgICAgdGhpcy5sZW5ndGgrKztcbiAgICAgICAgICAgIGdyZXcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoTWFwQ2hhbmdlKGtleSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBncmV3O1xufTtcblxuR2VuZXJpY01hcC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICByZXR1cm4gdGhpcy5zZXQoa2V5LCB2YWx1ZSk7XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuc3RvcmUuaGFzKG5ldyB0aGlzLkl0ZW0oa2V5KSk7XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZVsnZGVsZXRlJ10gPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgdmFyIGl0ZW0gPSBuZXcgdGhpcy5JdGVtKGtleSk7XG4gICAgaWYgKHRoaXMuc3RvcmUuaGFzKGl0ZW0pKSB7XG4gICAgICAgIHZhciBmcm9tID0gdGhpcy5zdG9yZS5nZXQoaXRlbSkudmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNNYXBDaGFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlTWFwQ2hhbmdlKGtleSwgZnJvbSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdG9yZVtcImRlbGV0ZVwiXShpdGVtKTtcbiAgICAgICAgdGhpcy5sZW5ndGgtLTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hNYXBDaGFuZ2Uoa2V5LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIga2V5cztcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzTWFwQ2hhbmdlcykge1xuICAgICAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hCZWZvcmVNYXBDaGFuZ2Uoa2V5LCB2YWx1ZSk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICBrZXlzID0gdGhpcy5rZXlzKCk7XG4gICAgfVxuICAgIHRoaXMuc3RvcmUuY2xlYXIoKTtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgaWYgKHRoaXMuZGlzcGF0Y2hlc01hcENoYW5nZXMpIHtcbiAgICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hNYXBDaGFuZ2Uoa2V5KTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxufTtcblxuR2VuZXJpY01hcC5wcm90b3R5cGUucmVkdWNlID0gZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcywgdGhpc3ApIHtcbiAgICByZXR1cm4gdGhpcy5zdG9yZS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2lzLCBpdGVtKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjay5jYWxsKHRoaXNwLCBiYXNpcywgaXRlbS52YWx1ZSwgaXRlbS5rZXksIHRoaXMpO1xuICAgIH0sIGJhc2lzLCB0aGlzKTtcbn07XG5cbkdlbmVyaWNNYXAucHJvdG90eXBlLnJlZHVjZVJpZ2h0ID0gZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcywgdGhpc3ApIHtcbiAgICByZXR1cm4gdGhpcy5zdG9yZS5yZWR1Y2VSaWdodChmdW5jdGlvbiAoYmFzaXMsIGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwodGhpc3AsIGJhc2lzLCBpdGVtLnZhbHVlLCBpdGVtLmtleSwgdGhpcyk7XG4gICAgfSwgYmFzaXMsIHRoaXMpO1xufTtcblxuR2VuZXJpY01hcC5wcm90b3R5cGUua2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5tYXAoZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgcmV0dXJuIGtleTtcbiAgICB9KTtcbn07XG5cbkdlbmVyaWNNYXAucHJvdG90eXBlLnZhbHVlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5tYXAoRnVuY3Rpb24uaWRlbnRpdHkpO1xufTtcblxuR2VuZXJpY01hcC5wcm90b3R5cGUuZW50cmllcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5tYXAoZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgcmV0dXJuIFtrZXksIHZhbHVlXTtcbiAgICB9KTtcbn07XG5cbi8vIFhYWCBkZXByZWNhdGVkXG5HZW5lcmljTWFwLnByb3RvdHlwZS5pdGVtcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5lbnRyaWVzKCk7XG59O1xuXG5HZW5lcmljTWFwLnByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbiAodGhhdCwgZXF1YWxzKSB7XG4gICAgZXF1YWxzID0gZXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgaWYgKHRoaXMgPT09IHRoYXQpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIGlmIChPYmplY3QuY2FuKHRoYXQsIFwiZXZlcnlcIikpIHtcbiAgICAgICAgcmV0dXJuIHRoYXQubGVuZ3RoID09PSB0aGlzLmxlbmd0aCAmJiB0aGF0LmV2ZXJ5KGZ1bmN0aW9uICh2YWx1ZSwga2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gZXF1YWxzKHRoaXMuZ2V0KGtleSksIHZhbHVlKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh0aGF0KTtcbiAgICAgICAgcmV0dXJuIGtleXMubGVuZ3RoID09PSB0aGlzLmxlbmd0aCAmJiBPYmplY3Qua2V5cyh0aGF0KS5ldmVyeShmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gZXF1YWxzKHRoaXMuZ2V0KGtleSksIHRoYXRba2V5XSk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH1cbn07XG5cbkdlbmVyaWNNYXAucHJvdG90eXBlLkl0ZW0gPSBJdGVtO1xuXG5mdW5jdGlvbiBJdGVtKGtleSwgdmFsdWUpIHtcbiAgICB0aGlzLmtleSA9IGtleTtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG59XG5cbkl0ZW0ucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5lcXVhbHModGhpcy5rZXksIHRoYXQua2V5KSAmJiBPYmplY3QuZXF1YWxzKHRoaXMudmFsdWUsIHRoYXQudmFsdWUpO1xufTtcblxuSXRlbS5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5jb21wYXJlKHRoaXMua2V5LCB0aGF0LmtleSk7XG59O1xuXG4iLCJcbnZhciBPYmplY3QgPSByZXF1aXJlKFwiLi9zaGltLW9iamVjdFwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBHZW5lcmljT3JkZXI7XG5mdW5jdGlvbiBHZW5lcmljT3JkZXIoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY29uc3RydWN0LiBHZW5lcmljT3JkZXIgaXMgYSBtaXhpbi5cIik7XG59XG5cbkdlbmVyaWNPcmRlci5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKHRoYXQsIGVxdWFscykge1xuICAgIGVxdWFscyA9IGVxdWFscyB8fCB0aGlzLmNvbnRlbnRFcXVhbHMgfHwgT2JqZWN0LmVxdWFscztcblxuICAgIGlmICh0aGlzID09PSB0aGF0KSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoIXRoYXQpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gKFxuICAgICAgICB0aGlzLmxlbmd0aCA9PT0gdGhhdC5sZW5ndGggJiZcbiAgICAgICAgdGhpcy56aXAodGhhdCkuZXZlcnkoZnVuY3Rpb24gKHBhaXIpIHtcbiAgICAgICAgICAgIHJldHVybiBlcXVhbHMocGFpclswXSwgcGFpclsxXSk7XG4gICAgICAgIH0pXG4gICAgKTtcbn07XG5cbkdlbmVyaWNPcmRlci5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uICh0aGF0LCBjb21wYXJlKSB7XG4gICAgY29tcGFyZSA9IGNvbXBhcmUgfHwgdGhpcy5jb250ZW50Q29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcblxuICAgIGlmICh0aGlzID09PSB0aGF0KSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBpZiAoIXRoYXQpIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgdmFyIGxlbmd0aCA9IE1hdGgubWluKHRoaXMubGVuZ3RoLCB0aGF0Lmxlbmd0aCk7XG4gICAgdmFyIGNvbXBhcmlzb24gPSB0aGlzLnppcCh0aGF0KS5yZWR1Y2UoZnVuY3Rpb24gKGNvbXBhcmlzb24sIHBhaXIsIGluZGV4KSB7XG4gICAgICAgIGlmIChjb21wYXJpc29uID09PSAwKSB7XG4gICAgICAgICAgICBpZiAoaW5kZXggPj0gbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmlzb247XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb21wYXJlKHBhaXJbMF0sIHBhaXJbMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmlzb247XG4gICAgICAgIH1cbiAgICB9LCAwKTtcbiAgICBpZiAoY29tcGFyaXNvbiA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdGhpcy5sZW5ndGggLSB0aGF0Lmxlbmd0aDtcbiAgICB9XG4gICAgcmV0dXJuIGNvbXBhcmlzb247XG59O1xuXG4iLCJcbm1vZHVsZS5leHBvcnRzID0gR2VuZXJpY1NldDtcbmZ1bmN0aW9uIEdlbmVyaWNTZXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY29uc3RydWN0LiBHZW5lcmljU2V0IGlzIGEgbWl4aW4uXCIpO1xufVxuXG5HZW5lcmljU2V0LnByb3RvdHlwZS51bmlvbiA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgdmFyIHVuaW9uID0gIHRoaXMuY29uc3RydWN0Q2xvbmUodGhpcyk7XG4gICAgdW5pb24uYWRkRWFjaCh0aGF0KTtcbiAgICByZXR1cm4gdW5pb247XG59O1xuXG5HZW5lcmljU2V0LnByb3RvdHlwZS5pbnRlcnNlY3Rpb24gPSBmdW5jdGlvbiAodGhhdCkge1xuICAgIHJldHVybiB0aGlzLmNvbnN0cnVjdENsb25lKHRoaXMuZmlsdGVyKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhhdC5oYXModmFsdWUpO1xuICAgIH0pKTtcbn07XG5cbkdlbmVyaWNTZXQucHJvdG90eXBlLmRpZmZlcmVuY2UgPSBmdW5jdGlvbiAodGhhdCkge1xuICAgIHZhciB1bmlvbiA9ICB0aGlzLmNvbnN0cnVjdENsb25lKHRoaXMpO1xuICAgIHVuaW9uLmRlbGV0ZUVhY2godGhhdCk7XG4gICAgcmV0dXJuIHVuaW9uO1xufTtcblxuR2VuZXJpY1NldC5wcm90b3R5cGUuc3ltbWV0cmljRGlmZmVyZW5jZSA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgdmFyIHVuaW9uID0gdGhpcy51bmlvbih0aGF0KTtcbiAgICB2YXIgaW50ZXJzZWN0aW9uID0gdGhpcy5pbnRlcnNlY3Rpb24odGhhdCk7XG4gICAgcmV0dXJuIHVuaW9uLmRpZmZlcmVuY2UoaW50ZXJzZWN0aW9uKTtcbn07XG5cbkdlbmVyaWNTZXQucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uICh0aGF0LCBlcXVhbHMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIChcbiAgICAgICAgT2JqZWN0LmNhbih0aGF0LCBcInJlZHVjZVwiKSAmJlxuICAgICAgICB0aGlzLmxlbmd0aCA9PT0gdGhhdC5sZW5ndGggJiZcbiAgICAgICAgdGhhdC5yZWR1Y2UoZnVuY3Rpb24gKGVxdWFsLCB2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGVxdWFsICYmIHNlbGYuaGFzKHZhbHVlLCBlcXVhbHMpO1xuICAgICAgICB9LCB0cnVlKVxuICAgICk7XG59O1xuXG4vLyBXM0MgRE9NVG9rZW5MaXN0IEFQSSBvdmVybGFwIChkb2VzIG5vdCBoYW5kbGUgdmFyaWFkaWMgYXJndW1lbnRzKVxuXG5HZW5lcmljU2V0LnByb3RvdHlwZS5jb250YWlucyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiB0aGlzLmhhcyh2YWx1ZSk7XG59O1xuXG5HZW5lcmljU2V0LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gdGhpc1tcImRlbGV0ZVwiXSh2YWx1ZSk7XG59O1xuXG5HZW5lcmljU2V0LnByb3RvdHlwZS50b2dnbGUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICBpZiAodGhpcy5oYXModmFsdWUpKSB7XG4gICAgICAgIHRoaXNbXCJkZWxldGVcIl0odmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYWRkKHZhbHVlKTtcbiAgICB9XG59O1xuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBMaXN0O1xuXG52YXIgU2hpbSA9IHJlcXVpcmUoXCIuL3NoaW1cIik7XG52YXIgR2VuZXJpY0NvbGxlY3Rpb24gPSByZXF1aXJlKFwiLi9nZW5lcmljLWNvbGxlY3Rpb25cIik7XG52YXIgR2VuZXJpY09yZGVyID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1vcmRlclwiKTtcbnZhciBQcm9wZXJ0eUNoYW5nZXMgPSByZXF1aXJlKFwiLi9saXN0ZW4vcHJvcGVydHktY2hhbmdlc1wiKTtcbnZhciBSYW5nZUNoYW5nZXMgPSByZXF1aXJlKFwiLi9saXN0ZW4vcmFuZ2UtY2hhbmdlc1wiKTtcblxuZnVuY3Rpb24gTGlzdCh2YWx1ZXMsIGVxdWFscywgZ2V0RGVmYXVsdCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBMaXN0KSkge1xuICAgICAgICByZXR1cm4gbmV3IExpc3QodmFsdWVzLCBlcXVhbHMsIGdldERlZmF1bHQpO1xuICAgIH1cbiAgICB2YXIgaGVhZCA9IHRoaXMuaGVhZCA9IG5ldyB0aGlzLk5vZGUoKTtcbiAgICBoZWFkLm5leHQgPSBoZWFkO1xuICAgIGhlYWQucHJldiA9IGhlYWQ7XG4gICAgdGhpcy5jb250ZW50RXF1YWxzID0gZXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgdGhpcy5nZXREZWZhdWx0ID0gZ2V0RGVmYXVsdCB8fCBGdW5jdGlvbi5ub29wO1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmFkZEVhY2godmFsdWVzKTtcbn1cblxuTGlzdC5MaXN0ID0gTGlzdDsgLy8gaGFjayBzbyByZXF1aXJlKFwibGlzdFwiKS5MaXN0IHdpbGwgd29yayBpbiBNb250YWdlSlNcblxuT2JqZWN0LmFkZEVhY2goTGlzdC5wcm90b3R5cGUsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChMaXN0LnByb3RvdHlwZSwgR2VuZXJpY09yZGVyLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChMaXN0LnByb3RvdHlwZSwgUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZSk7XG5PYmplY3QuYWRkRWFjaChMaXN0LnByb3RvdHlwZSwgUmFuZ2VDaGFuZ2VzLnByb3RvdHlwZSk7XG5cbkxpc3QucHJvdG90eXBlLmNvbnN0cnVjdENsb25lID0gZnVuY3Rpb24gKHZhbHVlcykge1xuICAgIHJldHVybiBuZXcgdGhpcy5jb25zdHJ1Y3Rvcih2YWx1ZXMsIHRoaXMuY29udGVudEVxdWFscywgdGhpcy5nZXREZWZhdWx0KTtcbn07XG5cbkxpc3QucHJvdG90eXBlLmZpbmQgPSBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIGVxdWFscyA9IGVxdWFscyB8fCB0aGlzLmNvbnRlbnRFcXVhbHM7XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgdmFyIGF0ID0gaGVhZC5uZXh0O1xuICAgIHdoaWxlIChhdCAhPT0gaGVhZCkge1xuICAgICAgICBpZiAoZXF1YWxzKGF0LnZhbHVlLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBhdDtcbiAgICAgICAgfVxuICAgICAgICBhdCA9IGF0Lm5leHQ7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUuZmluZExhc3QgPSBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIGVxdWFscyA9IGVxdWFscyB8fCB0aGlzLmNvbnRlbnRFcXVhbHM7XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgdmFyIGF0ID0gaGVhZC5wcmV2O1xuICAgIHdoaWxlIChhdCAhPT0gaGVhZCkge1xuICAgICAgICBpZiAoZXF1YWxzKGF0LnZhbHVlLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBhdDtcbiAgICAgICAgfVxuICAgICAgICBhdCA9IGF0LnByZXY7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUuaGFzID0gZnVuY3Rpb24gKHZhbHVlLCBlcXVhbHMpIHtcbiAgICByZXR1cm4gISF0aGlzLmZpbmQodmFsdWUsIGVxdWFscyk7XG59O1xuXG5MaXN0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIHZhciBmb3VuZCA9IHRoaXMuZmluZCh2YWx1ZSwgZXF1YWxzKTtcbiAgICBpZiAoZm91bmQpIHtcbiAgICAgICAgcmV0dXJuIGZvdW5kLnZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0KHZhbHVlKTtcbn07XG5cbi8vIExJRk8gKGRlbGV0ZSByZW1vdmVzIHRoZSBtb3N0IHJlY2VudGx5IGFkZGVkIGVxdWl2YWxlbnQgdmFsdWUpXG5MaXN0LnByb3RvdHlwZVsnZGVsZXRlJ10gPSBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIHZhciBmb3VuZCA9IHRoaXMuZmluZExhc3QodmFsdWUsIGVxdWFscyk7XG4gICAgaWYgKGZvdW5kKSB7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgICAgIHZhciBwbHVzID0gW107XG4gICAgICAgICAgICB2YXIgbWludXMgPSBbdmFsdWVdO1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaEJlZm9yZVJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCBmb3VuZC5pbmRleCk7XG4gICAgICAgIH1cbiAgICAgICAgZm91bmRbJ2RlbGV0ZSddKCk7XG4gICAgICAgIHRoaXMubGVuZ3RoLS07XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSW5kZXhlcyhmb3VuZC5uZXh0LCBmb3VuZC5pbmRleCk7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGZvdW5kLmluZGV4KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcblxuTGlzdC5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBsdXMsIG1pbnVzO1xuICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgbWludXMgPSB0aGlzLnRvQXJyYXkoKTtcbiAgICAgICAgcGx1cyA9IFtdO1xuICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIDApO1xuICAgIH1cbiAgICB0aGlzLmhlYWQubmV4dCA9IHRoaXMuaGVhZC5wcmV2ID0gdGhpcy5oZWFkO1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2hSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgMCk7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIG5vZGUgPSBuZXcgdGhpcy5Ob2RlKHZhbHVlKVxuICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgbm9kZS5pbmRleCA9IHRoaXMubGVuZ3RoO1xuICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UoW3ZhbHVlXSwgW10sIG5vZGUuaW5kZXgpO1xuICAgIH1cbiAgICB0aGlzLmhlYWQuYWRkQmVmb3JlKG5vZGUpO1xuICAgIHRoaXMubGVuZ3RoKys7XG4gICAgaWYgKHRoaXMuZGlzcGF0Y2hlc1JhbmdlQ2hhbmdlcykge1xuICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UoW3ZhbHVlXSwgW10sIG5vZGUuaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbkxpc3QucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgaWYgKHRoaXMuZGlzcGF0Y2hlc1JhbmdlQ2hhbmdlcykge1xuICAgICAgICB2YXIgcGx1cyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBtaW51cyA9IFtdXG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMubGVuZ3RoO1xuICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGluZGV4KTtcbiAgICAgICAgdmFyIHN0YXJ0ID0gdGhpcy5oZWFkLnByZXY7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgdmFyIG5vZGUgPSBuZXcgdGhpcy5Ob2RlKHZhbHVlKTtcbiAgICAgICAgaGVhZC5hZGRCZWZvcmUobm9kZSk7XG4gICAgfVxuICAgIHRoaXMubGVuZ3RoICs9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgaWYgKHRoaXMuZGlzcGF0Y2hlc1JhbmdlQ2hhbmdlcykge1xuICAgICAgICB0aGlzLnVwZGF0ZUluZGV4ZXMoc3RhcnQubmV4dCwgc3RhcnQuaW5kZXggPT09IHVuZGVmaW5lZCA/IDAgOiBzdGFydC5pbmRleCArIDEpO1xuICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGluZGV4KTtcbiAgICB9XG59O1xuXG5MaXN0LnByb3RvdHlwZS51bnNoaWZ0ID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgdmFyIHBsdXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICB2YXIgbWludXMgPSBbXTtcbiAgICAgICAgdGhpcy5kaXNwYXRjaEJlZm9yZVJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCAwKTtcbiAgICB9XG4gICAgdmFyIGF0ID0gdGhpcy5oZWFkO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgdmFyIG5vZGUgPSBuZXcgdGhpcy5Ob2RlKHZhbHVlKTtcbiAgICAgICAgYXQuYWRkQWZ0ZXIobm9kZSk7XG4gICAgICAgIGF0ID0gbm9kZTtcbiAgICB9XG4gICAgdGhpcy5sZW5ndGggKz0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIHRoaXMudXBkYXRlSW5kZXhlcyh0aGlzLmhlYWQubmV4dCwgMCk7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2hSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgMCk7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUucG9wID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB2YWx1ZTtcbiAgICB2YXIgaGVhZCA9IHRoaXMuaGVhZDtcbiAgICBpZiAoaGVhZC5wcmV2ICE9PSBoZWFkKSB7XG4gICAgICAgIHZhbHVlID0gaGVhZC5wcmV2LnZhbHVlO1xuICAgICAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgICAgICB2YXIgcGx1cyA9IFtdO1xuICAgICAgICAgICAgdmFyIG1pbnVzID0gW3ZhbHVlXTtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGF0Y2hCZWZvcmVSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgaW5kZXgpO1xuICAgICAgICB9XG4gICAgICAgIGhlYWQucHJldlsnZGVsZXRlJ10oKTtcbiAgICAgICAgdGhpcy5sZW5ndGgtLTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGF0Y2hlc1JhbmdlQ2hhbmdlcykge1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaFJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCBpbmRleCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufTtcblxuTGlzdC5wcm90b3R5cGUuc2hpZnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHZhbHVlO1xuICAgIHZhciBoZWFkID0gdGhpcy5oZWFkO1xuICAgIGlmIChoZWFkLnByZXYgIT09IGhlYWQpIHtcbiAgICAgICAgdmFsdWUgPSBoZWFkLm5leHQudmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgICAgIHZhciBwbHVzID0gW107XG4gICAgICAgICAgICB2YXIgbWludXMgPSBbdmFsdWVdO1xuICAgICAgICAgICAgdGhpcy5kaXNwYXRjaEJlZm9yZVJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCAwKTtcbiAgICAgICAgfVxuICAgICAgICBoZWFkLm5leHRbJ2RlbGV0ZSddKCk7XG4gICAgICAgIHRoaXMubGVuZ3RoLS07XG4gICAgICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSW5kZXhlcyh0aGlzLmhlYWQubmV4dCwgMCk7XG4gICAgICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIDApO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn07XG5cbkxpc3QucHJvdG90eXBlLnBlZWsgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuaGVhZCAhPT0gdGhpcy5oZWFkLm5leHQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGVhZC5uZXh0LnZhbHVlO1xuICAgIH1cbn07XG5cbkxpc3QucHJvdG90eXBlLnBva2UgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICBpZiAodGhpcy5oZWFkICE9PSB0aGlzLmhlYWQubmV4dCkge1xuICAgICAgICB0aGlzLmhlYWQubmV4dC52YWx1ZSA9IHZhbHVlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucHVzaCh2YWx1ZSk7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUub25lID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnBlZWsoKTtcbn07XG5cbi8vIGFuIGludGVybmFsIHV0aWxpdHkgZm9yIGNvZXJjaW5nIGluZGV4IG9mZnNldHMgdG8gbm9kZXNcbkxpc3QucHJvdG90eXBlLnNjYW4gPSBmdW5jdGlvbiAoYXQsIGZhbGxiYWNrKSB7XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgaWYgKHR5cGVvZiBhdCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICB2YXIgY291bnQgPSBhdDtcbiAgICAgICAgaWYgKGNvdW50ID49IDApIHtcbiAgICAgICAgICAgIGF0ID0gaGVhZC5uZXh0O1xuICAgICAgICAgICAgd2hpbGUgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgY291bnQtLTtcbiAgICAgICAgICAgICAgICBhdCA9IGF0Lm5leHQ7XG4gICAgICAgICAgICAgICAgaWYgKGF0ID09IGhlYWQpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXQgPSBoZWFkO1xuICAgICAgICAgICAgd2hpbGUgKGNvdW50IDwgMCkge1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICAgICAgYXQgPSBhdC5wcmV2O1xuICAgICAgICAgICAgICAgIGlmIChhdCA9PSBoZWFkKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXQ7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGF0IHx8IGZhbGxiYWNrO1xuICAgIH1cbn07XG5cbi8vIGF0IGFuZCBlbmQgbWF5IGJvdGggYmUgcG9zaXRpdmUgb3IgbmVnYXRpdmUgbnVtYmVycyAoaW4gd2hpY2ggY2FzZXMgdGhleVxuLy8gY29ycmVzcG9uZCB0byBudW1lcmljIGluZGljaWVzLCBvciBub2Rlcylcbkxpc3QucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKGF0LCBlbmQpIHtcbiAgICB2YXIgc2xpY2VkID0gW107XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgYXQgPSB0aGlzLnNjYW4oYXQsIGhlYWQubmV4dCk7XG4gICAgZW5kID0gdGhpcy5zY2FuKGVuZCwgaGVhZCk7XG5cbiAgICB3aGlsZSAoYXQgIT09IGVuZCAmJiBhdCAhPT0gaGVhZCkge1xuICAgICAgICBzbGljZWQucHVzaChhdC52YWx1ZSk7XG4gICAgICAgIGF0ID0gYXQubmV4dDtcbiAgICB9XG5cbiAgICByZXR1cm4gc2xpY2VkO1xufTtcblxuTGlzdC5wcm90b3R5cGUuc3BsaWNlID0gZnVuY3Rpb24gKGF0LCBsZW5ndGggLyouLi5wbHVzKi8pIHtcbiAgICByZXR1cm4gdGhpcy5zd2FwKGF0LCBsZW5ndGgsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMikpO1xufTtcblxuTGlzdC5wcm90b3R5cGUuc3dhcCA9IGZ1bmN0aW9uIChzdGFydCwgbGVuZ3RoLCBwbHVzKSB7XG4gICAgdmFyIGluaXRpYWwgPSBzdGFydDtcbiAgICAvLyBzdGFydCB3aWxsIGJlIGhlYWQgaWYgc3RhcnQgaXMgbnVsbCBvciAtMSAobWVhbmluZyBmcm9tIHRoZSBlbmQpLCBidXRcbiAgICAvLyB3aWxsIGJlIGhlYWQubmV4dCBpZiBzdGFydCBpcyAwIChtZWFuaW5nIGZyb20gdGhlIGJlZ2lubmluZylcbiAgICBzdGFydCA9IHRoaXMuc2NhbihzdGFydCwgdGhpcy5oZWFkKTtcbiAgICBpZiAobGVuZ3RoID09IG51bGwpIHtcbiAgICAgICAgbGVuZ3RoID0gSW5maW5pdHk7XG4gICAgfVxuICAgIHBsdXMgPSBBcnJheS5mcm9tKHBsdXMpO1xuXG4gICAgLy8gY29sbGVjdCB0aGUgbWludXMgYXJyYXlcbiAgICB2YXIgbWludXMgPSBbXTtcbiAgICB2YXIgYXQgPSBzdGFydDtcbiAgICB3aGlsZSAobGVuZ3RoLS0gJiYgbGVuZ3RoID49IDAgJiYgYXQgIT09IHRoaXMuaGVhZCkge1xuICAgICAgICBtaW51cy5wdXNoKGF0LnZhbHVlKTtcbiAgICAgICAgYXQgPSBhdC5uZXh0O1xuICAgIH1cblxuICAgIC8vIGJlZm9yZSByYW5nZSBjaGFuZ2VcbiAgICB2YXIgaW5kZXgsIHN0YXJ0Tm9kZTtcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gdGhpcy5oZWFkKSB7XG4gICAgICAgICAgICBpbmRleCA9IHRoaXMubGVuZ3RoO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0LnByZXYgPT09IHRoaXMuaGVhZCkge1xuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5kZXggPSBzdGFydC5pbmRleDtcbiAgICAgICAgfVxuICAgICAgICBzdGFydE5vZGUgPSBzdGFydC5wcmV2O1xuICAgICAgICB0aGlzLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGluZGV4KTtcbiAgICB9XG5cbiAgICAvLyBkZWxldGUgbWludXNcbiAgICB2YXIgYXQgPSBzdGFydDtcbiAgICBmb3IgKHZhciBpID0gMCwgYXQgPSBzdGFydDsgaSA8IG1pbnVzLmxlbmd0aDsgaSsrLCBhdCA9IGF0Lm5leHQpIHtcbiAgICAgICAgYXRbXCJkZWxldGVcIl0oKTtcbiAgICB9XG4gICAgLy8gYWRkIHBsdXNcbiAgICBpZiAoaW5pdGlhbCA9PSBudWxsICYmIGF0ID09PSB0aGlzLmhlYWQpIHtcbiAgICAgICAgYXQgPSB0aGlzLmhlYWQubmV4dDtcbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwbHVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBub2RlID0gbmV3IHRoaXMuTm9kZShwbHVzW2ldKTtcbiAgICAgICAgYXQuYWRkQmVmb3JlKG5vZGUpO1xuICAgIH1cbiAgICAvLyBhZGp1c3QgbGVuZ3RoXG4gICAgdGhpcy5sZW5ndGggKz0gcGx1cy5sZW5ndGggLSBtaW51cy5sZW5ndGg7XG5cbiAgICAvLyBhZnRlciByYW5nZSBjaGFuZ2VcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gdGhpcy5oZWFkKSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUluZGV4ZXModGhpcy5oZWFkLm5leHQsIDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVJbmRleGVzKHN0YXJ0Tm9kZS5uZXh0LCBzdGFydE5vZGUuaW5kZXggKyAxKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmRpc3BhdGNoUmFuZ2VDaGFuZ2UocGx1cywgbWludXMsIGluZGV4KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbWludXM7XG59O1xuXG5MaXN0LnByb3RvdHlwZS5yZXZlcnNlID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmRpc3BhdGNoZXNSYW5nZUNoYW5nZXMpIHtcbiAgICAgICAgdmFyIG1pbnVzID0gdGhpcy50b0FycmF5KCk7XG4gICAgICAgIHZhciBwbHVzID0gbWludXMucmV2ZXJzZWQoKTtcbiAgICAgICAgdGhpcy5kaXNwYXRjaEJlZm9yZVJhbmdlQ2hhbmdlKHBsdXMsIG1pbnVzLCAwKTtcbiAgICB9XG4gICAgdmFyIGF0ID0gdGhpcy5oZWFkO1xuICAgIGRvIHtcbiAgICAgICAgdmFyIHRlbXAgPSBhdC5uZXh0O1xuICAgICAgICBhdC5uZXh0ID0gYXQucHJldjtcbiAgICAgICAgYXQucHJldiA9IHRlbXA7XG4gICAgICAgIGF0ID0gYXQubmV4dDtcbiAgICB9IHdoaWxlIChhdCAhPT0gdGhpcy5oZWFkKTtcbiAgICBpZiAodGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzKSB7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2hSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgMCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufTtcblxuTGlzdC5wcm90b3R5cGUuc29ydCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnN3YXAoMCwgdGhpcy5sZW5ndGgsIHRoaXMuc29ydGVkKCkpO1xufTtcblxuLy8gVE9ETyBhY2NvdW50IGZvciBtaXNzaW5nIGJhc2lzIGFyZ3VtZW50XG5MaXN0LnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIGJhc2lzIC8qLCB0aGlzcCovKSB7XG4gICAgdmFyIHRoaXNwID0gYXJndW1lbnRzWzJdO1xuICAgIHZhciBoZWFkID0gdGhpcy5oZWFkO1xuICAgIHZhciBhdCA9IGhlYWQubmV4dDtcbiAgICB3aGlsZSAoYXQgIT09IGhlYWQpIHtcbiAgICAgICAgYmFzaXMgPSBjYWxsYmFjay5jYWxsKHRoaXNwLCBiYXNpcywgYXQudmFsdWUsIGF0LCB0aGlzKTtcbiAgICAgICAgYXQgPSBhdC5uZXh0O1xuICAgIH1cbiAgICByZXR1cm4gYmFzaXM7XG59O1xuXG5MaXN0LnByb3RvdHlwZS5yZWR1Y2VSaWdodCA9IGZ1bmN0aW9uIChjYWxsYmFjaywgYmFzaXMgLyosIHRoaXNwKi8pIHtcbiAgICB2YXIgdGhpc3AgPSBhcmd1bWVudHNbMl07XG4gICAgdmFyIGhlYWQgPSB0aGlzLmhlYWQ7XG4gICAgdmFyIGF0ID0gaGVhZC5wcmV2O1xuICAgIHdoaWxlIChhdCAhPT0gaGVhZCkge1xuICAgICAgICBiYXNpcyA9IGNhbGxiYWNrLmNhbGwodGhpc3AsIGJhc2lzLCBhdC52YWx1ZSwgYXQsIHRoaXMpO1xuICAgICAgICBhdCA9IGF0LnByZXY7XG4gICAgfVxuICAgIHJldHVybiBiYXNpcztcbn07XG5cbkxpc3QucHJvdG90eXBlLnVwZGF0ZUluZGV4ZXMgPSBmdW5jdGlvbiAobm9kZSwgaW5kZXgpIHtcbiAgICB3aGlsZSAobm9kZSAhPT0gdGhpcy5oZWFkKSB7XG4gICAgICAgIG5vZGUuaW5kZXggPSBpbmRleCsrO1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0O1xuICAgIH1cbn07XG5cbkxpc3QucHJvdG90eXBlLm1ha2VPYnNlcnZhYmxlID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuaGVhZC5pbmRleCA9IC0xO1xuICAgIHRoaXMudXBkYXRlSW5kZXhlcyh0aGlzLmhlYWQubmV4dCwgMCk7XG4gICAgdGhpcy5kaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzID0gdHJ1ZTtcbn07XG5cbkxpc3QucHJvdG90eXBlLml0ZXJhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBMaXN0SXRlcmF0b3IodGhpcy5oZWFkKTtcbn07XG5cbmZ1bmN0aW9uIExpc3RJdGVyYXRvcihoZWFkKSB7XG4gICAgdGhpcy5oZWFkID0gaGVhZDtcbiAgICB0aGlzLmF0ID0gaGVhZC5uZXh0O1xufTtcblxuTGlzdEl0ZXJhdG9yLnByb3RvdHlwZS5uZXh0ID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmF0ID09PSB0aGlzLmhlYWQpIHtcbiAgICAgICAgdGhyb3cgU3RvcEl0ZXJhdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgdmFsdWUgPSB0aGlzLmF0LnZhbHVlO1xuICAgICAgICB0aGlzLmF0ID0gdGhpcy5hdC5uZXh0O1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxufTtcblxuTGlzdC5wcm90b3R5cGUuTm9kZSA9IE5vZGU7XG5cbmZ1bmN0aW9uIE5vZGUodmFsdWUpIHtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gICAgdGhpcy5wcmV2ID0gbnVsbDtcbiAgICB0aGlzLm5leHQgPSBudWxsO1xufTtcblxuTm9kZS5wcm90b3R5cGVbJ2RlbGV0ZSddID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMucHJldi5uZXh0ID0gdGhpcy5uZXh0O1xuICAgIHRoaXMubmV4dC5wcmV2ID0gdGhpcy5wcmV2O1xufTtcblxuTm9kZS5wcm90b3R5cGUuYWRkQmVmb3JlID0gZnVuY3Rpb24gKG5vZGUpIHtcbiAgICB2YXIgcHJldiA9IHRoaXMucHJldjtcbiAgICB0aGlzLnByZXYgPSBub2RlO1xuICAgIG5vZGUucHJldiA9IHByZXY7XG4gICAgcHJldi5uZXh0ID0gbm9kZTtcbiAgICBub2RlLm5leHQgPSB0aGlzO1xufTtcblxuTm9kZS5wcm90b3R5cGUuYWRkQWZ0ZXIgPSBmdW5jdGlvbiAobm9kZSkge1xuICAgIHZhciBuZXh0ID0gdGhpcy5uZXh0O1xuICAgIHRoaXMubmV4dCA9IG5vZGU7XG4gICAgbm9kZS5uZXh0ID0gbmV4dDtcbiAgICBuZXh0LnByZXYgPSBub2RlO1xuICAgIG5vZGUucHJldiA9IHRoaXM7XG59O1xuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFdlYWtNYXAgPSByZXF1aXJlKFwid2Vhay1tYXBcIik7XG52YXIgTGlzdCA9IHJlcXVpcmUoXCIuLi9saXN0XCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1hcENoYW5nZXM7XG5mdW5jdGlvbiBNYXBDaGFuZ2VzKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNvbnN0cnVjdC4gTWFwQ2hhbmdlcyBpcyBhIG1peGluLlwiKTtcbn1cblxudmFyIG9iamVjdF9vd25zID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLypcbiAgICBPYmplY3QgbWFwIGNoYW5nZSBkZXNjcmlwdG9ycyBjYXJyeSBpbmZvcm1hdGlvbiBuZWNlc3NhcnkgZm9yIGFkZGluZyxcbiAgICByZW1vdmluZywgZGlzcGF0Y2hpbmcsIGFuZCBzaG9ydGluZyBldmVudHMgdG8gbGlzdGVuZXJzIGZvciBtYXAgY2hhbmdlc1xuICAgIGZvciBhIHBhcnRpY3VsYXIga2V5IG9uIGEgcGFydGljdWxhciBvYmplY3QuICBUaGVzZSBkZXNjcmlwdG9ycyBhcmUgdXNlZFxuICAgIGhlcmUgZm9yIHNoYWxsb3cgbWFwIGNoYW5nZXMuXG5cbiAgICB7XG4gICAgICAgIHdpbGxDaGFuZ2VMaXN0ZW5lcnM6QXJyYXkoRnVuY3Rpb24pXG4gICAgICAgIGNoYW5nZUxpc3RlbmVyczpBcnJheShGdW5jdGlvbilcbiAgICB9XG4qL1xuXG52YXIgbWFwQ2hhbmdlRGVzY3JpcHRvcnMgPSBuZXcgV2Vha01hcCgpO1xuXG5NYXBDaGFuZ2VzLnByb3RvdHlwZS5nZXRBbGxNYXBDaGFuZ2VEZXNjcmlwdG9ycyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgRGljdCA9IHJlcXVpcmUoXCIuLi9kaWN0XCIpO1xuICAgIGlmICghbWFwQ2hhbmdlRGVzY3JpcHRvcnMuaGFzKHRoaXMpKSB7XG4gICAgICAgIG1hcENoYW5nZURlc2NyaXB0b3JzLnNldCh0aGlzLCBEaWN0KCkpO1xuICAgIH1cbiAgICByZXR1cm4gbWFwQ2hhbmdlRGVzY3JpcHRvcnMuZ2V0KHRoaXMpO1xufTtcblxuTWFwQ2hhbmdlcy5wcm90b3R5cGUuZ2V0TWFwQ2hhbmdlRGVzY3JpcHRvciA9IGZ1bmN0aW9uICh0b2tlbikge1xuICAgIHZhciB0b2tlbkNoYW5nZURlc2NyaXB0b3JzID0gdGhpcy5nZXRBbGxNYXBDaGFuZ2VEZXNjcmlwdG9ycygpO1xuICAgIHRva2VuID0gdG9rZW4gfHwgXCJcIjtcbiAgICBpZiAoIXRva2VuQ2hhbmdlRGVzY3JpcHRvcnMuaGFzKHRva2VuKSkge1xuICAgICAgICB0b2tlbkNoYW5nZURlc2NyaXB0b3JzLnNldCh0b2tlbiwge1xuICAgICAgICAgICAgd2lsbENoYW5nZUxpc3RlbmVyczogbmV3IExpc3QoKSxcbiAgICAgICAgICAgIGNoYW5nZUxpc3RlbmVyczogbmV3IExpc3QoKVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHRva2VuQ2hhbmdlRGVzY3JpcHRvcnMuZ2V0KHRva2VuKTtcbn07XG5cbk1hcENoYW5nZXMucHJvdG90eXBlLmFkZE1hcENoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyLCB0b2tlbiwgYmVmb3JlQ2hhbmdlKSB7XG4gICAgaWYgKCF0aGlzLmlzT2JzZXJ2YWJsZSAmJiB0aGlzLm1ha2VPYnNlcnZhYmxlKSB7XG4gICAgICAgIC8vIGZvciBBcnJheVxuICAgICAgICB0aGlzLm1ha2VPYnNlcnZhYmxlKCk7XG4gICAgfVxuICAgIHZhciBkZXNjcmlwdG9yID0gdGhpcy5nZXRNYXBDaGFuZ2VEZXNjcmlwdG9yKHRva2VuKTtcbiAgICB2YXIgbGlzdGVuZXJzO1xuICAgIGlmIChiZWZvcmVDaGFuZ2UpIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci53aWxsQ2hhbmdlTGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGxpc3RlbmVycyA9IGRlc2NyaXB0b3IuY2hhbmdlTGlzdGVuZXJzO1xuICAgIH1cbiAgICBsaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwiZGlzcGF0Y2hlc01hcENoYW5nZXNcIiwge1xuICAgICAgICB2YWx1ZTogdHJ1ZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcbiAgICB9KTtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gZnVuY3Rpb24gY2FuY2VsTWFwQ2hhbmdlTGlzdGVuZXIoKSB7XG4gICAgICAgIGlmICghc2VsZikge1xuICAgICAgICAgICAgLy8gVE9ETyB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCByZW1vdmUgbWFwIGNoYW5nZSBsaXN0ZW5lciBhZ2FpblwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBzZWxmLnJlbW92ZU1hcENoYW5nZUxpc3RlbmVyKGxpc3RlbmVyLCB0b2tlbiwgYmVmb3JlQ2hhbmdlKTtcbiAgICAgICAgc2VsZiA9IG51bGw7XG4gICAgfTtcbn07XG5cbk1hcENoYW5nZXMucHJvdG90eXBlLnJlbW92ZU1hcENoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyLCB0b2tlbiwgYmVmb3JlQ2hhbmdlKSB7XG4gICAgdmFyIGRlc2NyaXB0b3IgPSB0aGlzLmdldE1hcENoYW5nZURlc2NyaXB0b3IodG9rZW4pO1xuXG4gICAgdmFyIGxpc3RlbmVycztcbiAgICBpZiAoYmVmb3JlQ2hhbmdlKSB7XG4gICAgICAgIGxpc3RlbmVycyA9IGRlc2NyaXB0b3Iud2lsbENoYW5nZUxpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLmNoYW5nZUxpc3RlbmVycztcbiAgICB9XG5cbiAgICB2YXIgbm9kZSA9IGxpc3RlbmVycy5maW5kTGFzdChsaXN0ZW5lcik7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHJlbW92ZSBsaXN0ZW5lcjogZG9lcyBub3QgZXhpc3QuXCIpO1xuICAgIH1cbiAgICBub2RlW1wiZGVsZXRlXCJdKCk7XG59O1xuXG5NYXBDaGFuZ2VzLnByb3RvdHlwZS5kaXNwYXRjaE1hcENoYW5nZSA9IGZ1bmN0aW9uIChrZXksIHZhbHVlLCBiZWZvcmVDaGFuZ2UpIHtcbiAgICB2YXIgZGVzY3JpcHRvcnMgPSB0aGlzLmdldEFsbE1hcENoYW5nZURlc2NyaXB0b3JzKCk7XG4gICAgdmFyIGNoYW5nZU5hbWUgPSBcIk1hcFwiICsgKGJlZm9yZUNoYW5nZSA/IFwiV2lsbENoYW5nZVwiIDogXCJDaGFuZ2VcIik7XG4gICAgZGVzY3JpcHRvcnMuZm9yRWFjaChmdW5jdGlvbiAoZGVzY3JpcHRvciwgdG9rZW4pIHtcblxuICAgICAgICBpZiAoZGVzY3JpcHRvci5pc0FjdGl2ZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVzY3JpcHRvci5pc0FjdGl2ZSA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGlzdGVuZXJzO1xuICAgICAgICBpZiAoYmVmb3JlQ2hhbmdlKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLndpbGxDaGFuZ2VMaXN0ZW5lcnM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLmNoYW5nZUxpc3RlbmVycztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0b2tlbk5hbWUgPSBcImhhbmRsZVwiICsgKFxuICAgICAgICAgICAgdG9rZW4uc2xpY2UoMCwgMSkudG9VcHBlckNhc2UoKSArXG4gICAgICAgICAgICB0b2tlbi5zbGljZSgxKVxuICAgICAgICApICsgY2hhbmdlTmFtZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gZGlzcGF0Y2ggdG8gZWFjaCBsaXN0ZW5lclxuICAgICAgICAgICAgbGlzdGVuZXJzLmZvckVhY2goZnVuY3Rpb24gKGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVyW3Rva2VuTmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJbdG9rZW5OYW1lXSh2YWx1ZSwga2V5LCB0aGlzKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGxpc3RlbmVyLmNhbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXIuY2FsbChsaXN0ZW5lciwgdmFsdWUsIGtleSwgdGhpcyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSGFuZGxlciBcIiArIGxpc3RlbmVyICsgXCIgaGFzIG5vIG1ldGhvZCBcIiArIHRva2VuTmFtZSArIFwiIGFuZCBpcyBub3QgY2FsbGFibGVcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBkZXNjcmlwdG9yLmlzQWN0aXZlID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgIH0sIHRoaXMpO1xufTtcblxuTWFwQ2hhbmdlcy5wcm90b3R5cGUuYWRkQmVmb3JlTWFwQ2hhbmdlTGlzdGVuZXIgPSBmdW5jdGlvbiAobGlzdGVuZXIsIHRva2VuKSB7XG4gICAgcmV0dXJuIHRoaXMuYWRkTWFwQ2hhbmdlTGlzdGVuZXIobGlzdGVuZXIsIHRva2VuLCB0cnVlKTtcbn07XG5cbk1hcENoYW5nZXMucHJvdG90eXBlLnJlbW92ZUJlZm9yZU1hcENoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyLCB0b2tlbikge1xuICAgIHJldHVybiB0aGlzLnJlbW92ZU1hcENoYW5nZUxpc3RlbmVyKGxpc3RlbmVyLCB0b2tlbiwgdHJ1ZSk7XG59O1xuXG5NYXBDaGFuZ2VzLnByb3RvdHlwZS5kaXNwYXRjaEJlZm9yZU1hcENoYW5nZSA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2hNYXBDaGFuZ2Uoa2V5LCB2YWx1ZSwgdHJ1ZSk7XG59O1xuXG4iLCIvKlxuICAgIEJhc2VkIGluIHBhcnQgb24gb2JzZXJ2YWJsZSBhcnJheXMgZnJvbSBNb3Rvcm9sYSBNb2JpbGl0eeKAmXMgTW9udGFnZVxuICAgIENvcHlyaWdodCAoYykgMjAxMiwgTW90b3JvbGEgTW9iaWxpdHkgTExDLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICAgIDMtQ2xhdXNlIEJTRCBMaWNlbnNlXG4gICAgaHR0cHM6Ly9naXRodWIuY29tL21vdG9yb2xhLW1vYmlsaXR5L21vbnRhZ2UvYmxvYi9tYXN0ZXIvTElDRU5TRS5tZFxuKi9cblxuLypcbiAgICBUaGlzIG1vZHVsZSBpcyByZXNwb25zaWJsZSBmb3Igb2JzZXJ2aW5nIGNoYW5nZXMgdG8gb3duZWQgcHJvcGVydGllcyBvZlxuICAgIG9iamVjdHMgYW5kIGNoYW5nZXMgdG8gdGhlIGNvbnRlbnQgb2YgYXJyYXlzIGNhdXNlZCBieSBtZXRob2QgY2FsbHMuXG4gICAgVGhlIGludGVyZmFjZSBmb3Igb2JzZXJ2aW5nIGFycmF5IGNvbnRlbnQgY2hhbmdlcyBlc3RhYmxpc2hlcyB0aGUgbWV0aG9kc1xuICAgIG5lY2Vzc2FyeSBmb3IgYW55IGNvbGxlY3Rpb24gd2l0aCBvYnNlcnZhYmxlIGNvbnRlbnQuXG4qL1xuXG5yZXF1aXJlKFwiLi4vc2hpbVwiKTtcbnZhciBXZWFrTWFwID0gcmVxdWlyZShcIndlYWstbWFwXCIpO1xuXG52YXIgb2JqZWN0X293bnMgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4vKlxuICAgIE9iamVjdCBwcm9wZXJ0eSBkZXNjcmlwdG9ycyBjYXJyeSBpbmZvcm1hdGlvbiBuZWNlc3NhcnkgZm9yIGFkZGluZyxcbiAgICByZW1vdmluZywgZGlzcGF0Y2hpbmcsIGFuZCBzaG9ydGluZyBldmVudHMgdG8gbGlzdGVuZXJzIGZvciBwcm9wZXJ0eSBjaGFuZ2VzXG4gICAgZm9yIGEgcGFydGljdWxhciBrZXkgb24gYSBwYXJ0aWN1bGFyIG9iamVjdC4gIFRoZXNlIGRlc2NyaXB0b3JzIGFyZSB1c2VkXG4gICAgaGVyZSBmb3Igc2hhbGxvdyBwcm9wZXJ0eSBjaGFuZ2VzLlxuXG4gICAge1xuICAgICAgICB3aWxsQ2hhbmdlTGlzdGVuZXJzOkFycmF5KEZ1bmN0aW9uKVxuICAgICAgICBjaGFuZ2VMaXN0ZW5lcnM6QXJyYXkoRnVuY3Rpb24pXG4gICAgfVxuKi9cbnZhciBwcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzID0gbmV3IFdlYWtNYXAoKTtcblxuLy8gTWF5YmUgcmVtb3ZlIGVudHJpZXMgZnJvbSB0aGlzIHRhYmxlIGlmIHRoZSBjb3JyZXNwb25kaW5nIG9iamVjdCBubyBsb25nZXJcbi8vIGhhcyBhbnkgcHJvcGVydHkgY2hhbmdlIGxpc3RlbmVycyBmb3IgYW55IGtleS4gIEhvd2V2ZXIsIHRoZSBjb3N0IG9mXG4vLyBib29rLWtlZXBpbmcgaXMgcHJvYmFibHkgbm90IHdhcnJhbnRlZCBzaW5jZSBpdCB3b3VsZCBiZSByYXJlIGZvciBhblxuLy8gb2JzZXJ2ZWQgb2JqZWN0IHRvIG5vIGxvbmdlciBiZSBvYnNlcnZlZCB1bmxlc3MgaXQgd2FzIGFib3V0IHRvIGJlIGRpc3Bvc2VkXG4vLyBvZiBvciByZXVzZWQgYXMgYW4gb2JzZXJ2YWJsZS4gIFRoZSBvbmx5IGJlbmVmaXQgd291bGQgYmUgaW4gYXZvaWRpbmcgYnVsa1xuLy8gY2FsbHMgdG8gZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZSBldmVudHMgb24gb2JqZWN0cyB0aGF0IGhhdmUgbm8gbGlzdGVuZXJzLlxuXG4vKlxuICAgIFRvIG9ic2VydmUgc2hhbGxvdyBwcm9wZXJ0eSBjaGFuZ2VzIGZvciBhIHBhcnRpY3VsYXIga2V5IG9mIGEgcGFydGljdWxhclxuICAgIG9iamVjdCwgd2UgaW5zdGFsbCBhIHByb3BlcnR5IGRlc2NyaXB0b3Igb24gdGhlIG9iamVjdCB0aGF0IG92ZXJyaWRlcyB0aGUgcHJldmlvdXNcbiAgICBkZXNjcmlwdG9yLiAgVGhlIG92ZXJyaWRkZW4gZGVzY3JpcHRvcnMgYXJlIHN0b3JlZCBpbiB0aGlzIHdlYWsgbWFwLiAgVGhlXG4gICAgd2VhayBtYXAgYXNzb2NpYXRlcyBhbiBvYmplY3Qgd2l0aCBhbm90aGVyIG9iamVjdCB0aGF0IG1hcHMgcHJvcGVydHkgbmFtZXNcbiAgICB0byBwcm9wZXJ0eSBkZXNjcmlwdG9ycy5cblxuICAgIG92ZXJyaWRkZW5PYmplY3REZXNjcmlwdG9ycy5nZXQob2JqZWN0KVtrZXldXG5cbiAgICBXZSByZXRhaW4gdGhlIG9sZCBkZXNjcmlwdG9yIGZvciB2YXJpb3VzIHB1cnBvc2VzLiAgRm9yIG9uZSwgaWYgdGhlIHByb3BlcnR5XG4gICAgaXMgbm8gbG9uZ2VyIGJlaW5nIG9ic2VydmVkIGJ5IGFueW9uZSwgd2UgcmV2ZXJ0IHRoZSBwcm9wZXJ0eSBkZXNjcmlwdG9yIHRvXG4gICAgdGhlIG9yaWdpbmFsLiAgRm9yIFwidmFsdWVcIiBkZXNjcmlwdG9ycywgd2Ugc3RvcmUgdGhlIGFjdHVhbCB2YWx1ZSBvZiB0aGVcbiAgICBkZXNjcmlwdG9yIG9uIHRoZSBvdmVycmlkZGVuIGRlc2NyaXB0b3IsIHNvIHdoZW4gdGhlIHByb3BlcnR5IGlzIHJldmVydGVkLCBpdFxuICAgIHJldGFpbnMgdGhlIG1vc3QgcmVjZW50bHkgc2V0IHZhbHVlLiAgRm9yIFwiZ2V0XCIgYW5kIFwic2V0XCIgZGVzY3JpcHRvcnMsXG4gICAgd2Ugb2JzZXJ2ZSB0aGVuIGZvcndhcmQgXCJnZXRcIiBhbmQgXCJzZXRcIiBvcGVyYXRpb25zIHRvIHRoZSBvcmlnaW5hbCBkZXNjcmlwdG9yLlxuKi9cbnZhciBvdmVycmlkZGVuT2JqZWN0RGVzY3JpcHRvcnMgPSBuZXcgV2Vha01hcCgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFByb3BlcnR5Q2hhbmdlcztcblxuZnVuY3Rpb24gUHJvcGVydHlDaGFuZ2VzKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgaXMgYW4gYWJzdHJhY3QgaW50ZXJmYWNlLiBNaXggaXQuIERvbid0IGNvbnN0cnVjdCBpdFwiKTtcbn1cblxuUHJvcGVydHlDaGFuZ2VzLmRlYnVnID0gdHJ1ZTtcblxuUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5nZXRPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3IgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgaWYgKCFwcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzLmhhcyh0aGlzKSkge1xuICAgICAgICBwcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzLnNldCh0aGlzLCB7fSk7XG4gICAgfVxuICAgIHZhciBvYmplY3RQcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzID0gcHJvcGVydHlDaGFuZ2VEZXNjcmlwdG9ycy5nZXQodGhpcyk7XG4gICAgaWYgKCFvYmplY3Rfb3ducy5jYWxsKG9iamVjdFByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcnMsIGtleSkpIHtcbiAgICAgICAgb2JqZWN0UHJvcGVydHlDaGFuZ2VEZXNjcmlwdG9yc1trZXldID0ge1xuICAgICAgICAgICAgd2lsbENoYW5nZUxpc3RlbmVyczogW10sXG4gICAgICAgICAgICBjaGFuZ2VMaXN0ZW5lcnM6IFtdXG4gICAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RQcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzW2tleV07XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLmhhc093blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvciA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAoIXByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcnMuaGFzKHRoaXMpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHZhciBvYmplY3RQcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3JzID0gcHJvcGVydHlDaGFuZ2VEZXNjcmlwdG9ycy5nZXQodGhpcyk7XG4gICAgaWYgKCFvYmplY3Rfb3ducy5jYWxsKG9iamVjdFByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcnMsIGtleSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cblByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUuYWRkT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChrZXksIGxpc3RlbmVyLCBiZWZvcmVDaGFuZ2UpIHtcbiAgICBpZiAodGhpcy5tYWtlT2JzZXJ2YWJsZSAmJiAhdGhpcy5pc09ic2VydmFibGUpIHtcbiAgICAgICAgdGhpcy5tYWtlT2JzZXJ2YWJsZSgpOyAvLyBwYXJ0aWN1bGFybHkgZm9yIG9ic2VydmFibGUgYXJyYXlzLCBmb3JcbiAgICAgICAgLy8gdGhlaXIgbGVuZ3RoIHByb3BlcnR5XG4gICAgfVxuICAgIHZhciBkZXNjcmlwdG9yID0gUHJvcGVydHlDaGFuZ2VzLmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcih0aGlzLCBrZXkpO1xuICAgIHZhciBsaXN0ZW5lcnM7XG4gICAgaWYgKGJlZm9yZUNoYW5nZSkge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLndpbGxDaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci5jaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfVxuICAgIFByb3BlcnR5Q2hhbmdlcy5tYWtlUHJvcGVydHlPYnNlcnZhYmxlKHRoaXMsIGtleSk7XG4gICAgbGlzdGVuZXJzLnB1c2gobGlzdGVuZXIpO1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBmdW5jdGlvbiBjYW5jZWxPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKCkge1xuICAgICAgICBQcm9wZXJ0eUNoYW5nZXMucmVtb3ZlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lcihzZWxmLCBrZXksIGxpc3RlbmVycywgYmVmb3JlQ2hhbmdlKTtcbiAgICAgICAgc2VsZiA9IG51bGw7XG4gICAgfTtcbn07XG5cblByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUuYWRkQmVmb3JlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChrZXksIGxpc3RlbmVyKSB7XG4gICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5hZGRPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKHRoaXMsIGtleSwgbGlzdGVuZXIsIHRydWUpO1xufTtcblxuUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5yZW1vdmVPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGtleSwgbGlzdGVuZXIsIGJlZm9yZUNoYW5nZSkge1xuICAgIHZhciBkZXNjcmlwdG9yID0gUHJvcGVydHlDaGFuZ2VzLmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcih0aGlzLCBrZXkpO1xuXG4gICAgdmFyIGxpc3RlbmVycztcbiAgICBpZiAoYmVmb3JlQ2hhbmdlKSB7XG4gICAgICAgIGxpc3RlbmVycyA9IGRlc2NyaXB0b3Iud2lsbENoYW5nZUxpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLmNoYW5nZUxpc3RlbmVycztcbiAgICB9XG5cbiAgICB2YXIgaW5kZXggPSBsaXN0ZW5lcnMubGFzdEluZGV4T2YobGlzdGVuZXIpO1xuICAgIGlmIChpbmRleCA9PT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgcmVtb3ZlIGxpc3RlbmVyOiBkb2VzIG5vdCBleGlzdC5cIik7XG4gICAgfVxuICAgIGxpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXG4gICAgaWYgKGRlc2NyaXB0b3IuY2hhbmdlTGlzdGVuZXJzLmxlbmd0aCArIGRlc2NyaXB0b3Iud2lsbENoYW5nZUxpc3RlbmVycy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgUHJvcGVydHlDaGFuZ2VzLm1ha2VQcm9wZXJ0eVVub2JzZXJ2YWJsZSh0aGlzLCBrZXkpO1xuICAgIH1cbn07XG5cblByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUucmVtb3ZlQmVmb3JlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChrZXksIGxpc3RlbmVyKSB7XG4gICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5yZW1vdmVPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKHRoaXMsIGtleSwgbGlzdGVuZXIsIHRydWUpO1xufTtcblxuUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5kaXNwYXRjaE93blByb3BlcnR5Q2hhbmdlID0gZnVuY3Rpb24gKGtleSwgdmFsdWUsIGJlZm9yZUNoYW5nZSkge1xuICAgIHZhciBkZXNjcmlwdG9yID0gUHJvcGVydHlDaGFuZ2VzLmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcih0aGlzLCBrZXkpO1xuXG4gICAgaWYgKGRlc2NyaXB0b3IuaXNBY3RpdmUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkZXNjcmlwdG9yLmlzQWN0aXZlID0gdHJ1ZTtcblxuICAgIHZhciBsaXN0ZW5lcnM7XG4gICAgaWYgKGJlZm9yZUNoYW5nZSkge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLndpbGxDaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci5jaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgdmFyIGNoYW5nZU5hbWUgPSAoYmVmb3JlQ2hhbmdlID8gXCJXaWxsXCIgOiBcIlwiKSArIFwiQ2hhbmdlXCI7XG4gICAgdmFyIGdlbmVyaWNIYW5kbGVyTmFtZSA9IFwiaGFuZGxlUHJvcGVydHlcIiArIGNoYW5nZU5hbWU7XG4gICAgdmFyIHByb3BlcnR5TmFtZSA9IFN0cmluZyhrZXkpO1xuICAgIHByb3BlcnR5TmFtZSA9IHByb3BlcnR5TmFtZSAmJiBwcm9wZXJ0eU5hbWVbMF0udG9VcHBlckNhc2UoKSArIHByb3BlcnR5TmFtZS5zbGljZSgxKTtcbiAgICB2YXIgc3BlY2lmaWNIYW5kbGVyTmFtZSA9IFwiaGFuZGxlXCIgKyBwcm9wZXJ0eU5hbWUgKyBjaGFuZ2VOYW1lO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gZGlzcGF0Y2ggdG8gZWFjaCBsaXN0ZW5lclxuICAgICAgICBsaXN0ZW5lcnMuZm9yRWFjaChmdW5jdGlvbiAobGlzdGVuZXIpIHtcbiAgICAgICAgICAgIHZhciB0aGlzcCA9IGxpc3RlbmVyO1xuICAgICAgICAgICAgbGlzdGVuZXIgPSAoXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJbc3BlY2lmaWNIYW5kbGVyTmFtZV0gfHxcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcltnZW5lcmljSGFuZGxlck5hbWVdIHx8XG4gICAgICAgICAgICAgICAgbGlzdGVuZXJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIWxpc3RlbmVyLmNhbGwpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBldmVudCBsaXN0ZW5lciBmb3IgXCIgKyBzcGVjaWZpY0hhbmRsZXJOYW1lICsgXCIgb3IgXCIgKyBnZW5lcmljSGFuZGxlck5hbWUgKyBcIiBvciBjYWxsIG9uIFwiICsgbGlzdGVuZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGlzdGVuZXIuY2FsbCh0aGlzcCwgdmFsdWUsIGtleSwgdGhpcyk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGRlc2NyaXB0b3IuaXNBY3RpdmUgPSBmYWxzZTtcbiAgICB9XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLmRpc3BhdGNoQmVmb3JlT3duUHJvcGVydHlDaGFuZ2UgPSBmdW5jdGlvbiAoa2V5LCBsaXN0ZW5lcikge1xuICAgIHJldHVybiBQcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZSh0aGlzLCBrZXksIGxpc3RlbmVyLCB0cnVlKTtcbn07XG5cblByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUubWFrZVByb3BlcnR5T2JzZXJ2YWJsZSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAvLyBhcnJheXMgYXJlIHNwZWNpYWwuICB3ZSBkbyBub3Qgc3VwcG9ydCBkaXJlY3Qgc2V0dGluZyBvZiBwcm9wZXJ0aWVzXG4gICAgLy8gb24gYW4gYXJyYXkuICBpbnN0ZWFkLCBjYWxsIC5zZXQoaW5kZXgsIHZhbHVlKS4gIHRoaXMgaXMgb2JzZXJ2YWJsZS5cbiAgICAvLyAnbGVuZ3RoJyBwcm9wZXJ0eSBpcyBvYnNlcnZhYmxlIGZvciBhbGwgbXV0YXRpbmcgbWV0aG9kcyBiZWNhdXNlXG4gICAgLy8gb3VyIG92ZXJyaWRlcyBleHBsaWNpdGx5IGRpc3BhdGNoIHRoYXQgY2hhbmdlLlxuICAgIGlmIChBcnJheS5pc0FycmF5KHRoaXMpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIU9iamVjdC5pc0V4dGVuc2libGUodGhpcywga2V5KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBtYWtlIHByb3BlcnR5IFwiICsgSlNPTi5zdHJpbmdpZnkoa2V5KSArIFwiIG9ic2VydmFibGUgb24gXCIgKyB0aGlzICsgXCIgYmVjYXVzZSBvYmplY3QgaXMgbm90IGV4dGVuc2libGVcIik7XG4gICAgfVxuXG4gICAgdmFyIHN0YXRlO1xuICAgIGlmICh0eXBlb2YgdGhpcy5fX3N0YXRlX18gPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgc3RhdGUgPSB0aGlzLl9fc3RhdGVfXztcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0ZSA9IHt9O1xuICAgICAgICBpZiAoT2JqZWN0LmlzRXh0ZW5zaWJsZSh0aGlzLCBcIl9fc3RhdGVfX1wiKSkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwiX19zdGF0ZV9fXCIsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogc3RhdGUsXG4gICAgICAgICAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHN0YXRlW2tleV0gPSB0aGlzW2tleV07XG5cbiAgICAvLyBtZW1vaXplIG92ZXJyaWRkZW4gcHJvcGVydHkgZGVzY3JpcHRvciB0YWJsZVxuICAgIGlmICghb3ZlcnJpZGRlbk9iamVjdERlc2NyaXB0b3JzLmhhcyh0aGlzKSkge1xuICAgICAgICBvdmVycmlkZGVuUHJvcGVydHlEZXNjcmlwdG9ycyA9IHt9O1xuICAgICAgICBvdmVycmlkZGVuT2JqZWN0RGVzY3JpcHRvcnMuc2V0KHRoaXMsIG92ZXJyaWRkZW5Qcm9wZXJ0eURlc2NyaXB0b3JzKTtcbiAgICB9XG4gICAgdmFyIG92ZXJyaWRkZW5Qcm9wZXJ0eURlc2NyaXB0b3JzID0gb3ZlcnJpZGRlbk9iamVjdERlc2NyaXB0b3JzLmdldCh0aGlzKTtcblxuICAgIGlmIChvYmplY3Rfb3ducy5jYWxsKG92ZXJyaWRkZW5Qcm9wZXJ0eURlc2NyaXB0b3JzLCBrZXkpKSB7XG4gICAgICAgIC8vIGlmIHdlIGhhdmUgYWxyZWFkeSByZWNvcmRlZCBhbiBvdmVycmlkZGVuIHByb3BlcnR5IGRlc2NyaXB0b3IsXG4gICAgICAgIC8vIHdlIGhhdmUgYWxyZWFkeSBpbnN0YWxsZWQgdGhlIG9ic2VydmVyLCBzbyBzaG9ydC1oZXJlXG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyB3YWxrIHVwIHRoZSBwcm90b3R5cGUgY2hhaW4gdG8gZmluZCBhIHByb3BlcnR5IGRlc2NyaXB0b3IgZm9yXG4gICAgLy8gdGhlIHByb3BlcnR5IG5hbWVcbiAgICB2YXIgb3ZlcnJpZGRlbkRlc2NyaXB0b3I7XG4gICAgdmFyIGF0dGFjaGVkID0gdGhpcztcbiAgICB2YXIgZm9ybWVyRGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoYXR0YWNoZWQsIGtleSk7XG4gICAgZG8ge1xuICAgICAgICBvdmVycmlkZGVuRGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoYXR0YWNoZWQsIGtleSk7XG4gICAgICAgIGlmIChvdmVycmlkZGVuRGVzY3JpcHRvcikge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYXR0YWNoZWQgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YoYXR0YWNoZWQpO1xuICAgIH0gd2hpbGUgKGF0dGFjaGVkKTtcbiAgICAvLyBvciBkZWZhdWx0IHRvIGFuIHVuZGVmaW5lZCB2YWx1ZVxuICAgIG92ZXJyaWRkZW5EZXNjcmlwdG9yID0gb3ZlcnJpZGRlbkRlc2NyaXB0b3IgfHwge1xuICAgICAgICB2YWx1ZTogdW5kZWZpbmVkLFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfTtcblxuICAgIGlmICghb3ZlcnJpZGRlbkRlc2NyaXB0b3IuY29uZmlndXJhYmxlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IG9ic2VydmUgbm9uLWNvbmZpZ3VyYWJsZSBwcm9wZXJ0aWVzXCIpO1xuICAgIH1cblxuICAgIC8vIG1lbW9pemUgdGhlIGRlc2NyaXB0b3Igc28gd2Uga25vdyBub3QgdG8gaW5zdGFsbCBhbm90aGVyIGxheWVyLFxuICAgIC8vIGFuZCBzbyB3ZSBjYW4gcmV1c2UgdGhlIG92ZXJyaWRkZW4gZGVzY3JpcHRvciB3aGVuIHVuaW5zdGFsbGluZ1xuICAgIG92ZXJyaWRkZW5Qcm9wZXJ0eURlc2NyaXB0b3JzW2tleV0gPSBvdmVycmlkZGVuRGVzY3JpcHRvcjtcblxuICAgIC8vIGdpdmUgdXAgKmFmdGVyKiBzdG9yaW5nIHRoZSBvdmVycmlkZGVuIHByb3BlcnR5IGRlc2NyaXB0b3Igc28gaXRcbiAgICAvLyBjYW4gYmUgcmVzdG9yZWQgYnkgdW5pbnN0YWxsLiAgVW53cml0YWJsZSBwcm9wZXJ0aWVzIGFyZVxuICAgIC8vIHNpbGVudGx5IG5vdCBvdmVycmlkZW4uICBTaW5jZSBzdWNjZXNzIGlzIGluZGlzdGluZ3Vpc2hhYmxlIGZyb21cbiAgICAvLyBmYWlsdXJlLCB3ZSBsZXQgaXQgcGFzcyBidXQgZG9uJ3Qgd2FzdGUgdGltZSBvbiBpbnRlcmNlcHRpbmdcbiAgICAvLyBnZXQvc2V0LlxuICAgIGlmICghb3ZlcnJpZGRlbkRlc2NyaXB0b3Iud3JpdGFibGUgJiYgIW92ZXJyaWRkZW5EZXNjcmlwdG9yLnNldCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVE9ETyByZWZsZWN0IGN1cnJlbnQgdmFsdWUgb24gYSBkaXNwbGF5ZWQgcHJvcGVydHlcblxuICAgIHZhciBwcm9wZXJ0eUxpc3RlbmVyO1xuICAgIC8vIGluIGJvdGggb2YgdGhlc2UgbmV3IGRlc2NyaXB0b3IgdmFyaWFudHMsIHdlIHJldXNlIHRoZSBvdmVycmlkZGVuXG4gICAgLy8gZGVzY3JpcHRvciB0byBlaXRoZXIgc3RvcmUgdGhlIGN1cnJlbnQgdmFsdWUgb3IgYXBwbHkgZ2V0dGVyc1xuICAgIC8vIGFuZCBzZXR0ZXJzLiAgdGhpcyBpcyBoYW5keSBzaW5jZSB3ZSBjYW4gcmV1c2UgdGhlIG92ZXJyaWRkZW5cbiAgICAvLyBkZXNjcmlwdG9yIGlmIHdlIHVuaW5zdGFsbCB0aGUgb2JzZXJ2ZXIuICBXZSBldmVuIHByZXNlcnZlIHRoZVxuICAgIC8vIGFzc2lnbm1lbnQgc2VtYW50aWNzLCB3aGVyZSB3ZSBnZXQgdGhlIHZhbHVlIGZyb20gdXAgdGhlXG4gICAgLy8gcHJvdG90eXBlIGNoYWluLCBhbmQgc2V0IGFzIGFuIG93bmVkIHByb3BlcnR5LlxuICAgIGlmICgndmFsdWUnIGluIG92ZXJyaWRkZW5EZXNjcmlwdG9yKSB7XG4gICAgICAgIHByb3BlcnR5TGlzdGVuZXIgPSB7XG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3ZlcnJpZGRlbkRlc2NyaXB0b3IudmFsdWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gb3ZlcnJpZGRlbkRlc2NyaXB0b3IudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBQcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hCZWZvcmVPd25Qcm9wZXJ0eUNoYW5nZSh0aGlzLCBrZXksIG92ZXJyaWRkZW5EZXNjcmlwdG9yLnZhbHVlKTtcbiAgICAgICAgICAgICAgICBvdmVycmlkZGVuRGVzY3JpcHRvci52YWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIHN0YXRlW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBQcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZSh0aGlzLCBrZXksIHZhbHVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZW51bWVyYWJsZTogb3ZlcnJpZGRlbkRlc2NyaXB0b3IuZW51bWVyYWJsZSxcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgICB9O1xuICAgIH0gZWxzZSB7IC8vICdnZXQnIG9yICdzZXQnLCBidXQgbm90IG5lY2Vzc2FyaWx5IGJvdGhcbiAgICAgICAgcHJvcGVydHlMaXN0ZW5lciA9IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG92ZXJyaWRkZW5EZXNjcmlwdG9yLmdldC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBmb3JtZXJWYWx1ZTtcblxuICAgICAgICAgICAgICAgIC8vIGdldCB0aGUgYWN0dWFsIGZvcm1lciB2YWx1ZSBpZiBwb3NzaWJsZVxuICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9ybWVyVmFsdWUgPSBvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gY2FsbCB0aHJvdWdoIHRvIGFjdHVhbCBzZXR0ZXJcbiAgICAgICAgICAgICAgICBpZiAob3ZlcnJpZGRlbkRlc2NyaXB0b3Iuc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIG92ZXJyaWRkZW5EZXNjcmlwdG9yLnNldC5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHVzZSBnZXR0ZXIsIGlmIHBvc3NpYmxlLCB0byBkaXNjb3ZlciB3aGV0aGVyIHRoZSBzZXRcbiAgICAgICAgICAgICAgICAvLyB3YXMgc3VjY2Vzc2Z1bFxuICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBvdmVycmlkZGVuRGVzY3JpcHRvci5nZXQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGVba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBpZiBpdCBoYXMgbm90IGNoYW5nZWQsIHN1cHByZXNzIGEgbm90aWZpY2F0aW9uXG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSBmb3JtZXJWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFByb3BlcnR5Q2hhbmdlcy5kaXNwYXRjaEJlZm9yZU93blByb3BlcnR5Q2hhbmdlKHRoaXMsIGtleSwgZm9ybWVyVmFsdWUpO1xuXG4gICAgICAgICAgICAgICAgLy8gZGlzcGF0Y2ggdGhlIG5ldyB2YWx1ZTogdGhlIGdpdmVuIHZhbHVlIGlmIHRoZXJlIGlzXG4gICAgICAgICAgICAgICAgLy8gbm8gZ2V0dGVyLCBvciB0aGUgYWN0dWFsIHZhbHVlIGlmIHRoZXJlIGlzIG9uZVxuICAgICAgICAgICAgICAgIFByb3BlcnR5Q2hhbmdlcy5kaXNwYXRjaE93blByb3BlcnR5Q2hhbmdlKHRoaXMsIGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBvdmVycmlkZGVuRGVzY3JpcHRvci5lbnVtZXJhYmxlLFxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGtleSwgcHJvcGVydHlMaXN0ZW5lcik7XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLm1ha2VQcm9wZXJ0eVVub2JzZXJ2YWJsZSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAvLyBhcnJheXMgYXJlIHNwZWNpYWwuICB3ZSBkbyBub3Qgc3VwcG9ydCBkaXJlY3Qgc2V0dGluZyBvZiBwcm9wZXJ0aWVzXG4gICAgLy8gb24gYW4gYXJyYXkuICBpbnN0ZWFkLCBjYWxsIC5zZXQoaW5kZXgsIHZhbHVlKS4gIHRoaXMgaXMgb2JzZXJ2YWJsZS5cbiAgICAvLyAnbGVuZ3RoJyBwcm9wZXJ0eSBpcyBvYnNlcnZhYmxlIGZvciBhbGwgbXV0YXRpbmcgbWV0aG9kcyBiZWNhdXNlXG4gICAgLy8gb3VyIG92ZXJyaWRlcyBleHBsaWNpdGx5IGRpc3BhdGNoIHRoYXQgY2hhbmdlLlxuICAgIGlmIChBcnJheS5pc0FycmF5KHRoaXMpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIW92ZXJyaWRkZW5PYmplY3REZXNjcmlwdG9ycy5oYXModGhpcykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgdW5pbnN0YWxsIG9ic2VydmVyIG9uIHByb3BlcnR5XCIpO1xuICAgIH1cbiAgICB2YXIgb3ZlcnJpZGRlblByb3BlcnR5RGVzY3JpcHRvcnMgPSBvdmVycmlkZGVuT2JqZWN0RGVzY3JpcHRvcnMuZ2V0KHRoaXMpO1xuXG4gICAgaWYgKCFvdmVycmlkZGVuUHJvcGVydHlEZXNjcmlwdG9yc1trZXldKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHVuaW5zdGFsbCBvYnNlcnZlciBvbiBwcm9wZXJ0eVwiKTtcbiAgICB9XG5cbiAgICB2YXIgb3ZlcnJpZGRlbkRlc2NyaXB0b3IgPSBvdmVycmlkZGVuUHJvcGVydHlEZXNjcmlwdG9yc1trZXldO1xuICAgIGRlbGV0ZSBvdmVycmlkZGVuUHJvcGVydHlEZXNjcmlwdG9yc1trZXldO1xuXG4gICAgdmFyIHN0YXRlO1xuICAgIGlmICh0eXBlb2YgdGhpcy5fX3N0YXRlX18gPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgc3RhdGUgPSB0aGlzLl9fc3RhdGVfXztcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0ZSA9IHt9O1xuICAgICAgICBpZiAoT2JqZWN0LmlzRXh0ZW5zaWJsZSh0aGlzLCBcIl9fc3RhdGVfX1wiKSkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwiX19zdGF0ZV9fXCIsIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogc3RhdGUsXG4gICAgICAgICAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIGRlbGV0ZSBzdGF0ZVtrZXldO1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGtleSwgb3ZlcnJpZGRlbkRlc2NyaXB0b3IpO1xufTtcblxuLy8gY29uc3RydWN0b3IgZnVuY3Rpb25zXG5cblByb3BlcnR5Q2hhbmdlcy5nZXRPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3IgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXkpIHtcbiAgICBpZiAob2JqZWN0LmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcikge1xuICAgICAgICByZXR1cm4gb2JqZWN0LmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvcihrZXkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBQcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLmdldE93blByb3BlcnR5Q2hhbmdlRGVzY3JpcHRvci5jYWxsKG9iamVjdCwga2V5KTtcbiAgICB9XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMuaGFzT3duUHJvcGVydHlDaGFuZ2VEZXNjcmlwdG9yID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgaWYgKG9iamVjdC5oYXNPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3IpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdC5oYXNPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3Ioa2V5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eUNoYW5nZURlc2NyaXB0b3IuY2FsbChvYmplY3QsIGtleSk7XG4gICAgfVxufTtcblxuUHJvcGVydHlDaGFuZ2VzLmFkZE93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXksIGxpc3RlbmVyLCBiZWZvcmVDaGFuZ2UpIHtcbiAgICBpZiAoIU9iamVjdC5pc09iamVjdChvYmplY3QpKSB7XG4gICAgfSBlbHNlIGlmIChvYmplY3QuYWRkT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lcikge1xuICAgICAgICByZXR1cm4gb2JqZWN0LmFkZE93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIoa2V5LCBsaXN0ZW5lciwgYmVmb3JlQ2hhbmdlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5hZGRPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyLmNhbGwob2JqZWN0LCBrZXksIGxpc3RlbmVyLCBiZWZvcmVDaGFuZ2UpO1xuICAgIH1cbn07XG5cblByb3BlcnR5Q2hhbmdlcy5yZW1vdmVPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKG9iamVjdCwga2V5LCBsaXN0ZW5lciwgYmVmb3JlQ2hhbmdlKSB7XG4gICAgaWYgKCFPYmplY3QuaXNPYmplY3Qob2JqZWN0KSkge1xuICAgIH0gZWxzZSBpZiAob2JqZWN0LnJlbW92ZU93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdC5yZW1vdmVPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKGtleSwgbGlzdGVuZXIsIGJlZm9yZUNoYW5nZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUucmVtb3ZlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lci5jYWxsKG9iamVjdCwga2V5LCBsaXN0ZW5lciwgYmVmb3JlQ2hhbmdlKTtcbiAgICB9XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZSA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgdmFsdWUsIGJlZm9yZUNoYW5nZSkge1xuICAgIGlmICghT2JqZWN0LmlzT2JqZWN0KG9iamVjdCkpIHtcbiAgICB9IGVsc2UgaWYgKG9iamVjdC5kaXNwYXRjaE93blByb3BlcnR5Q2hhbmdlKSB7XG4gICAgICAgIHJldHVybiBvYmplY3QuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZShrZXksIHZhbHVlLCBiZWZvcmVDaGFuZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBQcm9wZXJ0eUNoYW5nZXMucHJvdG90eXBlLmRpc3BhdGNoT3duUHJvcGVydHlDaGFuZ2UuY2FsbChvYmplY3QsIGtleSwgdmFsdWUsIGJlZm9yZUNoYW5nZSk7XG4gICAgfVxufTtcblxuUHJvcGVydHlDaGFuZ2VzLmFkZEJlZm9yZU93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXksIGxpc3RlbmVyKSB7XG4gICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5hZGRPd25Qcm9wZXJ0eUNoYW5nZUxpc3RlbmVyKG9iamVjdCwga2V5LCBsaXN0ZW5lciwgdHJ1ZSk7XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMucmVtb3ZlQmVmb3JlT3duUHJvcGVydHlDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgbGlzdGVuZXIpIHtcbiAgICByZXR1cm4gUHJvcGVydHlDaGFuZ2VzLnJlbW92ZU93blByb3BlcnR5Q2hhbmdlTGlzdGVuZXIob2JqZWN0LCBrZXksIGxpc3RlbmVyLCB0cnVlKTtcbn07XG5cblByb3BlcnR5Q2hhbmdlcy5kaXNwYXRjaEJlZm9yZU93blByb3BlcnR5Q2hhbmdlID0gZnVuY3Rpb24gKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICAgIHJldHVybiBQcm9wZXJ0eUNoYW5nZXMuZGlzcGF0Y2hPd25Qcm9wZXJ0eUNoYW5nZShvYmplY3QsIGtleSwgdmFsdWUsIHRydWUpO1xufTtcblxuUHJvcGVydHlDaGFuZ2VzLm1ha2VQcm9wZXJ0eU9ic2VydmFibGUgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXkpIHtcbiAgICBpZiAob2JqZWN0Lm1ha2VQcm9wZXJ0eU9ic2VydmFibGUpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdC5tYWtlUHJvcGVydHlPYnNlcnZhYmxlKGtleSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFByb3BlcnR5Q2hhbmdlcy5wcm90b3R5cGUubWFrZVByb3BlcnR5T2JzZXJ2YWJsZS5jYWxsKG9iamVjdCwga2V5KTtcbiAgICB9XG59O1xuXG5Qcm9wZXJ0eUNoYW5nZXMubWFrZVByb3BlcnR5VW5vYnNlcnZhYmxlID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgaWYgKG9iamVjdC5tYWtlUHJvcGVydHlVbm9ic2VydmFibGUpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdC5tYWtlUHJvcGVydHlVbm9ic2VydmFibGUoa2V5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gUHJvcGVydHlDaGFuZ2VzLnByb3RvdHlwZS5tYWtlUHJvcGVydHlVbm9ic2VydmFibGUuY2FsbChvYmplY3QsIGtleSk7XG4gICAgfVxufTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXZWFrTWFwID0gcmVxdWlyZShcIndlYWstbWFwXCIpO1xudmFyIERpY3QgPSByZXF1aXJlKFwiLi4vZGljdFwiKTtcblxudmFyIHJhbmdlQ2hhbmdlRGVzY3JpcHRvcnMgPSBuZXcgV2Vha01hcCgpOyAvLyB7aXNBY3RpdmUsIHdpbGxDaGFuZ2VMaXN0ZW5lcnMsIGNoYW5nZUxpc3RlbmVyc31cblxubW9kdWxlLmV4cG9ydHMgPSBSYW5nZUNoYW5nZXM7XG5mdW5jdGlvbiBSYW5nZUNoYW5nZXMoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY29uc3RydWN0LiBSYW5nZUNoYW5nZXMgaXMgYSBtaXhpbi5cIik7XG59XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUuZ2V0QWxsUmFuZ2VDaGFuZ2VEZXNjcmlwdG9ycyA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoIXJhbmdlQ2hhbmdlRGVzY3JpcHRvcnMuaGFzKHRoaXMpKSB7XG4gICAgICAgIHJhbmdlQ2hhbmdlRGVzY3JpcHRvcnMuc2V0KHRoaXMsIERpY3QoKSk7XG4gICAgfVxuICAgIHJldHVybiByYW5nZUNoYW5nZURlc2NyaXB0b3JzLmdldCh0aGlzKTtcbn07XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUuZ2V0UmFuZ2VDaGFuZ2VEZXNjcmlwdG9yID0gZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdmFyIHRva2VuQ2hhbmdlRGVzY3JpcHRvcnMgPSB0aGlzLmdldEFsbFJhbmdlQ2hhbmdlRGVzY3JpcHRvcnMoKTtcbiAgICB0b2tlbiA9IHRva2VuIHx8IFwiXCI7XG4gICAgaWYgKCF0b2tlbkNoYW5nZURlc2NyaXB0b3JzLmhhcyh0b2tlbikpIHtcbiAgICAgICAgdG9rZW5DaGFuZ2VEZXNjcmlwdG9ycy5zZXQodG9rZW4sIHtcbiAgICAgICAgICAgIGlzQWN0aXZlOiBmYWxzZSxcbiAgICAgICAgICAgIGNoYW5nZUxpc3RlbmVyczogW10sXG4gICAgICAgICAgICB3aWxsQ2hhbmdlTGlzdGVuZXJzOiBbXVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHRva2VuQ2hhbmdlRGVzY3JpcHRvcnMuZ2V0KHRva2VuKTtcbn07XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUuYWRkUmFuZ2VDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChsaXN0ZW5lciwgdG9rZW4sIGJlZm9yZUNoYW5nZSkge1xuICAgIC8vIGEgY29uY2Vzc2lvbiBmb3Igb2JqZWN0cyBsaWtlIEFycmF5IHRoYXQgYXJlIG5vdCBpbmhlcmVudGx5IG9ic2VydmFibGVcbiAgICBpZiAoIXRoaXMuaXNPYnNlcnZhYmxlICYmIHRoaXMubWFrZU9ic2VydmFibGUpIHtcbiAgICAgICAgdGhpcy5tYWtlT2JzZXJ2YWJsZSgpO1xuICAgIH1cblxuICAgIHZhciBkZXNjcmlwdG9yID0gdGhpcy5nZXRSYW5nZUNoYW5nZURlc2NyaXB0b3IodG9rZW4pO1xuXG4gICAgdmFyIGxpc3RlbmVycztcbiAgICBpZiAoYmVmb3JlQ2hhbmdlKSB7XG4gICAgICAgIGxpc3RlbmVycyA9IGRlc2NyaXB0b3Iud2lsbENoYW5nZUxpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLmNoYW5nZUxpc3RlbmVycztcbiAgICB9XG5cbiAgICAvLyBldmVuIGlmIGFscmVhZHkgcmVnaXN0ZXJlZFxuICAgIGxpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgXCJkaXNwYXRjaGVzUmFuZ2VDaGFuZ2VzXCIsIHtcbiAgICAgICAgdmFsdWU6IHRydWUsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlXG4gICAgfSk7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGNhbmNlbFJhbmdlQ2hhbmdlTGlzdGVuZXIoKSB7XG4gICAgICAgIGlmICghc2VsZikge1xuICAgICAgICAgICAgLy8gVE9ETyB0aHJvdyBuZXcgRXJyb3IoXCJSYW5nZSBjaGFuZ2UgbGlzdGVuZXIgXCIgKyBKU09OLnN0cmluZ2lmeSh0b2tlbikgKyBcIiBoYXMgYWxyZWFkeSBiZWVuIGNhbmNlbGVkXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHNlbGYucmVtb3ZlUmFuZ2VDaGFuZ2VMaXN0ZW5lcihsaXN0ZW5lciwgdG9rZW4sIGJlZm9yZUNoYW5nZSk7XG4gICAgICAgIHNlbGYgPSBudWxsO1xuICAgIH07XG59O1xuXG5SYW5nZUNoYW5nZXMucHJvdG90eXBlLnJlbW92ZVJhbmdlQ2hhbmdlTGlzdGVuZXIgPSBmdW5jdGlvbiAobGlzdGVuZXIsIHRva2VuLCBiZWZvcmVDaGFuZ2UpIHtcbiAgICB2YXIgZGVzY3JpcHRvciA9IHRoaXMuZ2V0UmFuZ2VDaGFuZ2VEZXNjcmlwdG9yKHRva2VuKTtcblxuICAgIHZhciBsaXN0ZW5lcnM7XG4gICAgaWYgKGJlZm9yZUNoYW5nZSkge1xuICAgICAgICBsaXN0ZW5lcnMgPSBkZXNjcmlwdG9yLndpbGxDaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci5jaGFuZ2VMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgdmFyIGluZGV4ID0gbGlzdGVuZXJzLmxhc3RJbmRleE9mKGxpc3RlbmVyKTtcbiAgICBpZiAoaW5kZXggPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHJlbW92ZSBsaXN0ZW5lcjogZG9lcyBub3QgZXhpc3QuXCIpO1xuICAgIH1cbiAgICBsaXN0ZW5lcnMuc3BsaWNlKGluZGV4LCAxKTtcbn07XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUuZGlzcGF0Y2hSYW5nZUNoYW5nZSA9IGZ1bmN0aW9uIChwbHVzLCBtaW51cywgaW5kZXgsIGJlZm9yZUNoYW5nZSkge1xuICAgIHZhciBkZXNjcmlwdG9ycyA9IHRoaXMuZ2V0QWxsUmFuZ2VDaGFuZ2VEZXNjcmlwdG9ycygpO1xuICAgIHZhciBjaGFuZ2VOYW1lID0gXCJSYW5nZVwiICsgKGJlZm9yZUNoYW5nZSA/IFwiV2lsbENoYW5nZVwiIDogXCJDaGFuZ2VcIik7XG4gICAgZGVzY3JpcHRvcnMuZm9yRWFjaChmdW5jdGlvbiAoZGVzY3JpcHRvciwgdG9rZW4pIHtcblxuICAgICAgICBpZiAoZGVzY3JpcHRvci5pc0FjdGl2ZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVzY3JpcHRvci5pc0FjdGl2ZSA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBiZWZvcmUgb3IgYWZ0ZXJcbiAgICAgICAgdmFyIGxpc3RlbmVycztcbiAgICAgICAgaWYgKGJlZm9yZUNoYW5nZSkge1xuICAgICAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci53aWxsQ2hhbmdlTGlzdGVuZXJzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGlzdGVuZXJzID0gZGVzY3JpcHRvci5jaGFuZ2VMaXN0ZW5lcnM7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdG9rZW5OYW1lID0gXCJoYW5kbGVcIiArIChcbiAgICAgICAgICAgIHRva2VuLnNsaWNlKDAsIDEpLnRvVXBwZXJDYXNlKCkgK1xuICAgICAgICAgICAgdG9rZW4uc2xpY2UoMSlcbiAgICAgICAgKSArIGNoYW5nZU5hbWU7XG4gICAgICAgIC8vIG5vdGFibHksIGRlZmF1bHRzIHRvIFwiaGFuZGxlUmFuZ2VDaGFuZ2VcIiBvciBcImhhbmRsZVJhbmdlV2lsbENoYW5nZVwiXG4gICAgICAgIC8vIGlmIHRva2VuIGlzIFwiXCIgKHRoZSBkZWZhdWx0KVxuXG4gICAgICAgIC8vIGRpc3BhdGNoIGVhY2ggbGlzdGVuZXJcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxpc3RlbmVycy5mb3JFYWNoKGZ1bmN0aW9uIChsaXN0ZW5lcikge1xuICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lclt0b2tlbk5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyW3Rva2VuTmFtZV0ocGx1cywgbWludXMsIGluZGV4LCB0aGlzLCBiZWZvcmVDaGFuZ2UpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobGlzdGVuZXIuY2FsbCkge1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lci5jYWxsKHRoaXMsIHBsdXMsIG1pbnVzLCBpbmRleCwgdGhpcywgYmVmb3JlQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJIYW5kbGVyIFwiICsgbGlzdGVuZXIgKyBcIiBoYXMgbm8gbWV0aG9kIFwiICsgdG9rZW5OYW1lICsgXCIgYW5kIGlzIG5vdCBjYWxsYWJsZVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGRlc2NyaXB0b3IuaXNBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH0sIHRoaXMpO1xufTtcblxuUmFuZ2VDaGFuZ2VzLnByb3RvdHlwZS5hZGRCZWZvcmVSYW5nZUNoYW5nZUxpc3RlbmVyID0gZnVuY3Rpb24gKGxpc3RlbmVyLCB0b2tlbikge1xuICAgIHJldHVybiB0aGlzLmFkZFJhbmdlQ2hhbmdlTGlzdGVuZXIobGlzdGVuZXIsIHRva2VuLCB0cnVlKTtcbn07XG5cblJhbmdlQ2hhbmdlcy5wcm90b3R5cGUucmVtb3ZlQmVmb3JlUmFuZ2VDaGFuZ2VMaXN0ZW5lciA9IGZ1bmN0aW9uIChsaXN0ZW5lciwgdG9rZW4pIHtcbiAgICByZXR1cm4gdGhpcy5yZW1vdmVSYW5nZUNoYW5nZUxpc3RlbmVyKGxpc3RlbmVyLCB0b2tlbiwgdHJ1ZSk7XG59O1xuXG5SYW5nZUNoYW5nZXMucHJvdG90eXBlLmRpc3BhdGNoQmVmb3JlUmFuZ2VDaGFuZ2UgPSBmdW5jdGlvbiAocGx1cywgbWludXMsIGluZGV4KSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2hSYW5nZUNoYW5nZShwbHVzLCBtaW51cywgaW5kZXgsIHRydWUpO1xufTtcblxuIiwiLy8gQ29weXJpZ2h0IChDKSAyMDExIEdvb2dsZSBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5cbi8qKlxuICogQGZpbGVvdmVydmlldyBJbnN0YWxsIGEgbGVha3kgV2Vha01hcCBlbXVsYXRpb24gb24gcGxhdGZvcm1zIHRoYXRcbiAqIGRvbid0IHByb3ZpZGUgYSBidWlsdC1pbiBvbmUuXG4gKlxuICogPHA+QXNzdW1lcyB0aGF0IGFuIEVTNSBwbGF0Zm9ybSB3aGVyZSwgaWYge0Bjb2RlIFdlYWtNYXB9IGlzXG4gKiBhbHJlYWR5IHByZXNlbnQsIHRoZW4gaXQgY29uZm9ybXMgdG8gdGhlIGFudGljaXBhdGVkIEVTNlxuICogc3BlY2lmaWNhdGlvbi4gVG8gcnVuIHRoaXMgZmlsZSBvbiBhbiBFUzUgb3IgYWxtb3N0IEVTNVxuICogaW1wbGVtZW50YXRpb24gd2hlcmUgdGhlIHtAY29kZSBXZWFrTWFwfSBzcGVjaWZpY2F0aW9uIGRvZXMgbm90XG4gKiBxdWl0ZSBjb25mb3JtLCBydW4gPGNvZGU+cmVwYWlyRVM1LmpzPC9jb2RlPiBmaXJzdC5cbiAqXG4gKiA8cD4gRXZlbiB0aG91Z2ggV2Vha01hcE1vZHVsZSBpcyBub3QgZ2xvYmFsLCB0aGUgbGludGVyIHRoaW5rcyBpdFxuICogaXMsIHdoaWNoIGlzIHdoeSBpdCBpcyBpbiB0aGUgb3ZlcnJpZGVzIGxpc3QgYmVsb3cuXG4gKlxuICogQGF1dGhvciBNYXJrIFMuIE1pbGxlclxuICogQHJlcXVpcmVzIGNyeXB0bywgQXJyYXlCdWZmZXIsIFVpbnQ4QXJyYXksIG5hdmlnYXRvclxuICogQG92ZXJyaWRlcyBXZWFrTWFwLCBzZXMsIFByb3h5XG4gKiBAb3ZlcnJpZGVzIFdlYWtNYXBNb2R1bGVcbiAqL1xuXG4vKipcbiAqIFRoaXMge0Bjb2RlIFdlYWtNYXB9IGVtdWxhdGlvbiBpcyBvYnNlcnZhYmx5IGVxdWl2YWxlbnQgdG8gdGhlXG4gKiBFUy1IYXJtb255IFdlYWtNYXAsIGJ1dCB3aXRoIGxlYWtpZXIgZ2FyYmFnZSBjb2xsZWN0aW9uIHByb3BlcnRpZXMuXG4gKlxuICogPHA+QXMgd2l0aCB0cnVlIFdlYWtNYXBzLCBpbiB0aGlzIGVtdWxhdGlvbiwgYSBrZXkgZG9lcyBub3RcbiAqIHJldGFpbiBtYXBzIGluZGV4ZWQgYnkgdGhhdCBrZXkgYW5kIChjcnVjaWFsbHkpIGEgbWFwIGRvZXMgbm90XG4gKiByZXRhaW4gdGhlIGtleXMgaXQgaW5kZXhlcy4gQSBtYXAgYnkgaXRzZWxmIGFsc28gZG9lcyBub3QgcmV0YWluXG4gKiB0aGUgdmFsdWVzIGFzc29jaWF0ZWQgd2l0aCB0aGF0IG1hcC5cbiAqXG4gKiA8cD5Ib3dldmVyLCB0aGUgdmFsdWVzIGFzc29jaWF0ZWQgd2l0aCBhIGtleSBpbiBzb21lIG1hcCBhcmVcbiAqIHJldGFpbmVkIHNvIGxvbmcgYXMgdGhhdCBrZXkgaXMgcmV0YWluZWQgYW5kIHRob3NlIGFzc29jaWF0aW9ucyBhcmVcbiAqIG5vdCBvdmVycmlkZGVuLiBGb3IgZXhhbXBsZSwgd2hlbiB1c2VkIHRvIHN1cHBvcnQgbWVtYnJhbmVzLCBhbGxcbiAqIHZhbHVlcyBleHBvcnRlZCBmcm9tIGEgZ2l2ZW4gbWVtYnJhbmUgd2lsbCBsaXZlIGZvciB0aGUgbGlmZXRpbWVcbiAqIHRoZXkgd291bGQgaGF2ZSBoYWQgaW4gdGhlIGFic2VuY2Ugb2YgYW4gaW50ZXJwb3NlZCBtZW1icmFuZS4gRXZlblxuICogd2hlbiB0aGUgbWVtYnJhbmUgaXMgcmV2b2tlZCwgYWxsIG9iamVjdHMgdGhhdCB3b3VsZCBoYXZlIGJlZW5cbiAqIHJlYWNoYWJsZSBpbiB0aGUgYWJzZW5jZSBvZiByZXZvY2F0aW9uIHdpbGwgc3RpbGwgYmUgcmVhY2hhYmxlLCBhc1xuICogZmFyIGFzIHRoZSBHQyBjYW4gdGVsbCwgZXZlbiB0aG91Z2ggdGhleSB3aWxsIG5vIGxvbmdlciBiZSByZWxldmFudFxuICogdG8gb25nb2luZyBjb21wdXRhdGlvbi5cbiAqXG4gKiA8cD5UaGUgQVBJIGltcGxlbWVudGVkIGhlcmUgaXMgYXBwcm94aW1hdGVseSB0aGUgQVBJIGFzIGltcGxlbWVudGVkXG4gKiBpbiBGRjYuMGExIGFuZCBhZ3JlZWQgdG8gYnkgTWFya00sIEFuZHJlYXMgR2FsLCBhbmQgRGF2ZSBIZXJtYW4sXG4gKiByYXRoZXIgdGhhbiB0aGUgb2ZmaWFsbHkgYXBwcm92ZWQgcHJvcG9zYWwgcGFnZS4gVE9ETyhlcmlnaHRzKTpcbiAqIHVwZ3JhZGUgdGhlIGVjbWFzY3JpcHQgV2Vha01hcCBwcm9wb3NhbCBwYWdlIHRvIGV4cGxhaW4gdGhpcyBBUElcbiAqIGNoYW5nZSBhbmQgcHJlc2VudCB0byBFY21hU2NyaXB0IGNvbW1pdHRlZSBmb3IgdGhlaXIgYXBwcm92YWwuXG4gKlxuICogPHA+VGhlIGZpcnN0IGRpZmZlcmVuY2UgYmV0d2VlbiB0aGUgZW11bGF0aW9uIGhlcmUgYW5kIHRoYXQgaW5cbiAqIEZGNi4wYTEgaXMgdGhlIHByZXNlbmNlIG9mIG5vbiBlbnVtZXJhYmxlIHtAY29kZSBnZXRfX18sIGhhc19fXyxcbiAqIHNldF9fXywgYW5kIGRlbGV0ZV9fX30gbWV0aG9kcyBvbiBXZWFrTWFwIGluc3RhbmNlcyB0byByZXByZXNlbnRcbiAqIHdoYXQgd291bGQgYmUgdGhlIGhpZGRlbiBpbnRlcm5hbCBwcm9wZXJ0aWVzIG9mIGEgcHJpbWl0aXZlXG4gKiBpbXBsZW1lbnRhdGlvbi4gV2hlcmVhcyB0aGUgRkY2LjBhMSBXZWFrTWFwLnByb3RvdHlwZSBtZXRob2RzXG4gKiByZXF1aXJlIHRoZWlyIHtAY29kZSB0aGlzfSB0byBiZSBhIGdlbnVpbmUgV2Vha01hcCBpbnN0YW5jZSAoaS5lLixcbiAqIGFuIG9iamVjdCBvZiB7QGNvZGUgW1tDbGFzc11dfSBcIldlYWtNYXB9KSwgc2luY2UgdGhlcmUgaXMgbm90aGluZ1xuICogdW5mb3JnZWFibGUgYWJvdXQgdGhlIHBzZXVkby1pbnRlcm5hbCBtZXRob2QgbmFtZXMgdXNlZCBoZXJlLFxuICogbm90aGluZyBwcmV2ZW50cyB0aGVzZSBlbXVsYXRlZCBwcm90b3R5cGUgbWV0aG9kcyBmcm9tIGJlaW5nXG4gKiBhcHBsaWVkIHRvIG5vbi1XZWFrTWFwcyB3aXRoIHBzZXVkby1pbnRlcm5hbCBtZXRob2RzIG9mIHRoZSBzYW1lXG4gKiBuYW1lcy5cbiAqXG4gKiA8cD5Bbm90aGVyIGRpZmZlcmVuY2UgaXMgdGhhdCBvdXIgZW11bGF0ZWQge0Bjb2RlXG4gKiBXZWFrTWFwLnByb3RvdHlwZX0gaXMgbm90IGl0c2VsZiBhIFdlYWtNYXAuIEEgcHJvYmxlbSB3aXRoIHRoZVxuICogY3VycmVudCBGRjYuMGExIEFQSSBpcyB0aGF0IFdlYWtNYXAucHJvdG90eXBlIGlzIGl0c2VsZiBhIFdlYWtNYXBcbiAqIHByb3ZpZGluZyBhbWJpZW50IG11dGFiaWxpdHkgYW5kIGFuIGFtYmllbnQgY29tbXVuaWNhdGlvbnNcbiAqIGNoYW5uZWwuIFRodXMsIGlmIGEgV2Vha01hcCBpcyBhbHJlYWR5IHByZXNlbnQgYW5kIGhhcyB0aGlzXG4gKiBwcm9ibGVtLCByZXBhaXJFUzUuanMgd3JhcHMgaXQgaW4gYSBzYWZlIHdyYXBwcGVyIGluIG9yZGVyIHRvXG4gKiBwcmV2ZW50IGFjY2VzcyB0byB0aGlzIGNoYW5uZWwuIChTZWVcbiAqIFBBVENIX01VVEFCTEVfRlJPWkVOX1dFQUtNQVBfUFJPVE8gaW4gcmVwYWlyRVM1LmpzKS5cbiAqL1xuXG4vKipcbiAqIElmIHRoaXMgaXMgYSBmdWxsIDxhIGhyZWY9XG4gKiBcImh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9lcy1sYWIvd2lraS9TZWN1cmVhYmxlRVM1XCJcbiAqID5zZWN1cmVhYmxlIEVTNTwvYT4gcGxhdGZvcm0gYW5kIHRoZSBFUy1IYXJtb255IHtAY29kZSBXZWFrTWFwfSBpc1xuICogYWJzZW50LCBpbnN0YWxsIGFuIGFwcHJveGltYXRlIGVtdWxhdGlvbi5cbiAqXG4gKiA8cD5JZiBXZWFrTWFwIGlzIHByZXNlbnQgYnV0IGNhbm5vdCBzdG9yZSBzb21lIG9iamVjdHMsIHVzZSBvdXIgYXBwcm94aW1hdGVcbiAqIGVtdWxhdGlvbiBhcyBhIHdyYXBwZXIuXG4gKlxuICogPHA+SWYgdGhpcyBpcyBhbG1vc3QgYSBzZWN1cmVhYmxlIEVTNSBwbGF0Zm9ybSwgdGhlbiBXZWFrTWFwLmpzXG4gKiBzaG91bGQgYmUgcnVuIGFmdGVyIHJlcGFpckVTNS5qcy5cbiAqXG4gKiA8cD5TZWUge0Bjb2RlIFdlYWtNYXB9IGZvciBkb2N1bWVudGF0aW9uIG9mIHRoZSBnYXJiYWdlIGNvbGxlY3Rpb25cbiAqIHByb3BlcnRpZXMgb2YgdGhpcyBXZWFrTWFwIGVtdWxhdGlvbi5cbiAqL1xuKGZ1bmN0aW9uIFdlYWtNYXBNb2R1bGUoKSB7XG4gIFwidXNlIHN0cmljdFwiO1xuXG4gIGlmICh0eXBlb2Ygc2VzICE9PSAndW5kZWZpbmVkJyAmJiBzZXMub2sgJiYgIXNlcy5vaygpKSB7XG4gICAgLy8gYWxyZWFkeSB0b28gYnJva2VuLCBzbyBnaXZlIHVwXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLyoqXG4gICAqIEluIHNvbWUgY2FzZXMgKGN1cnJlbnQgRmlyZWZveCksIHdlIG11c3QgbWFrZSBhIGNob2ljZSBiZXR3ZWVlbiBhXG4gICAqIFdlYWtNYXAgd2hpY2ggaXMgY2FwYWJsZSBvZiB1c2luZyBhbGwgdmFyaWV0aWVzIG9mIGhvc3Qgb2JqZWN0cyBhc1xuICAgKiBrZXlzIGFuZCBvbmUgd2hpY2ggaXMgY2FwYWJsZSBvZiBzYWZlbHkgdXNpbmcgcHJveGllcyBhcyBrZXlzLiBTZWVcbiAgICogY29tbWVudHMgYmVsb3cgYWJvdXQgSG9zdFdlYWtNYXAgYW5kIERvdWJsZVdlYWtNYXAgZm9yIGRldGFpbHMuXG4gICAqXG4gICAqIFRoaXMgZnVuY3Rpb24gKHdoaWNoIGlzIGEgZ2xvYmFsLCBub3QgZXhwb3NlZCB0byBndWVzdHMpIG1hcmtzIGFcbiAgICogV2Vha01hcCBhcyBwZXJtaXR0ZWQgdG8gZG8gd2hhdCBpcyBuZWNlc3NhcnkgdG8gaW5kZXggYWxsIGhvc3RcbiAgICogb2JqZWN0cywgYXQgdGhlIGNvc3Qgb2YgbWFraW5nIGl0IHVuc2FmZSBmb3IgcHJveGllcy5cbiAgICpcbiAgICogRG8gbm90IGFwcGx5IHRoaXMgZnVuY3Rpb24gdG8gYW55dGhpbmcgd2hpY2ggaXMgbm90IGEgZ2VudWluZVxuICAgKiBmcmVzaCBXZWFrTWFwLlxuICAgKi9cbiAgZnVuY3Rpb24gd2Vha01hcFBlcm1pdEhvc3RPYmplY3RzKG1hcCkge1xuICAgIC8vIGlkZW50aXR5IG9mIGZ1bmN0aW9uIHVzZWQgYXMgYSBzZWNyZXQgLS0gZ29vZCBlbm91Z2ggYW5kIGNoZWFwXG4gICAgaWYgKG1hcC5wZXJtaXRIb3N0T2JqZWN0c19fXykge1xuICAgICAgbWFwLnBlcm1pdEhvc3RPYmplY3RzX19fKHdlYWtNYXBQZXJtaXRIb3N0T2JqZWN0cyk7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2Ygc2VzICE9PSAndW5kZWZpbmVkJykge1xuICAgIHNlcy53ZWFrTWFwUGVybWl0SG9zdE9iamVjdHMgPSB3ZWFrTWFwUGVybWl0SG9zdE9iamVjdHM7XG4gIH1cblxuICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbHJlYWR5IGEgZ29vZC1lbm91Z2ggV2Vha01hcCBpbXBsZW1lbnRhdGlvbiwgYW5kIGlmIHNvXG4gIC8vIGV4aXQgd2l0aG91dCByZXBsYWNpbmcgaXQuXG4gIGlmICh0eXBlb2YgV2Vha01hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBIb3N0V2Vha01hcCA9IFdlYWtNYXA7XG4gICAgLy8gVGhlcmUgaXMgYSBXZWFrTWFwIC0tIGlzIGl0IGdvb2QgZW5vdWdoP1xuICAgIGlmICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAvRmlyZWZveC8udGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSkge1xuICAgICAgLy8gV2UncmUgbm93ICphc3N1bWluZyBub3QqLCBiZWNhdXNlIGFzIG9mIHRoaXMgd3JpdGluZyAoMjAxMy0wNS0wNilcbiAgICAgIC8vIEZpcmVmb3gncyBXZWFrTWFwcyBoYXZlIGEgbWlzY2VsbGFueSBvZiBvYmplY3RzIHRoZXkgd29uJ3QgYWNjZXB0LCBhbmRcbiAgICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gbWFrZSBhbiBleGhhdXN0aXZlIGxpc3QsIGFuZCB0ZXN0aW5nIGZvciBqdXN0IG9uZVxuICAgICAgLy8gd2lsbCBiZSBhIHByb2JsZW0gaWYgdGhhdCBvbmUgaXMgZml4ZWQgYWxvbmUgKGFzIHRoZXkgZGlkIGZvciBFdmVudCkuXG5cbiAgICAgIC8vIElmIHRoZXJlIGlzIGEgcGxhdGZvcm0gdGhhdCB3ZSAqY2FuKiByZWxpYWJseSB0ZXN0IG9uLCBoZXJlJ3MgaG93IHRvXG4gICAgICAvLyBkbyBpdDpcbiAgICAgIC8vICB2YXIgcHJvYmxlbWF0aWMgPSAuLi4gO1xuICAgICAgLy8gIHZhciB0ZXN0SG9zdE1hcCA9IG5ldyBIb3N0V2Vha01hcCgpO1xuICAgICAgLy8gIHRyeSB7XG4gICAgICAvLyAgICB0ZXN0SG9zdE1hcC5zZXQocHJvYmxlbWF0aWMsIDEpOyAgLy8gRmlyZWZveCAyMCB3aWxsIHRocm93IGhlcmVcbiAgICAgIC8vICAgIGlmICh0ZXN0SG9zdE1hcC5nZXQocHJvYmxlbWF0aWMpID09PSAxKSB7XG4gICAgICAvLyAgICAgIHJldHVybjtcbiAgICAgIC8vICAgIH1cbiAgICAgIC8vICB9IGNhdGNoIChlKSB7fVxuXG4gICAgICAvLyBGYWxsIHRocm91Z2ggdG8gaW5zdGFsbGluZyBvdXIgV2Vha01hcC5cbiAgICB9IGVsc2Uge1xuICAgICAgbW9kdWxlLmV4cG9ydHMgPSBXZWFrTWFwO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuXG4gIHZhciBob3AgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuICB2YXIgZ29wbiA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzO1xuICB2YXIgZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbiAgdmFyIGlzRXh0ZW5zaWJsZSA9IE9iamVjdC5pc0V4dGVuc2libGU7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGRlcGVuZHMgb24gSElEREVOX05BTUUgYmVpbmcgYm90aCA8aT51bmd1ZXNzYWJsZTwvaT4gYW5kXG4gICAqIDxpPnVuZGlzY292ZXJhYmxlPC9pPiBieSB1bnRydXN0ZWQgY29kZS5cbiAgICpcbiAgICogPHA+R2l2ZW4gdGhlIGtub3duIHdlYWtuZXNzZXMgb2YgTWF0aC5yYW5kb20oKSBvbiBleGlzdGluZ1xuICAgKiBicm93c2VycywgaXQgZG9lcyBub3QgZ2VuZXJhdGUgdW5ndWVzc2FiaWxpdHkgd2UgY2FuIGJlIGNvbmZpZGVudFxuICAgKiBvZi5cbiAgICpcbiAgICogPHA+SXQgaXMgdGhlIG1vbmtleSBwYXRjaGluZyBsb2dpYyBpbiB0aGlzIGZpbGUgdGhhdCBpcyBpbnRlbmRlZFxuICAgKiB0byBlbnN1cmUgdW5kaXNjb3ZlcmFiaWxpdHkuIFRoZSBiYXNpYyBpZGVhIGlzIHRoYXQgdGhlcmUgYXJlXG4gICAqIHRocmVlIGZ1bmRhbWVudGFsIG1lYW5zIG9mIGRpc2NvdmVyaW5nIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0OlxuICAgKiBUaGUgZm9yL2luIGxvb3AsIE9iamVjdC5rZXlzKCksIGFuZCBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcygpLFxuICAgKiBhcyB3ZWxsIGFzIHNvbWUgcHJvcG9zZWQgRVM2IGV4dGVuc2lvbnMgdGhhdCBhcHBlYXIgb24gb3VyXG4gICAqIHdoaXRlbGlzdC4gVGhlIGZpcnN0IHR3byBvbmx5IGRpc2NvdmVyIGVudW1lcmFibGUgcHJvcGVydGllcywgYW5kXG4gICAqIHdlIG9ubHkgdXNlIEhJRERFTl9OQU1FIHRvIG5hbWUgYSBub24tZW51bWVyYWJsZSBwcm9wZXJ0eSwgc28gdGhlXG4gICAqIG9ubHkgcmVtYWluaW5nIHRocmVhdCBzaG91bGQgYmUgZ2V0T3duUHJvcGVydHlOYW1lcyBhbmQgc29tZVxuICAgKiBwcm9wb3NlZCBFUzYgZXh0ZW5zaW9ucyB0aGF0IGFwcGVhciBvbiBvdXIgd2hpdGVsaXN0LiBXZSBtb25rZXlcbiAgICogcGF0Y2ggdGhlbSB0byByZW1vdmUgSElEREVOX05BTUUgZnJvbSB0aGUgbGlzdCBvZiBwcm9wZXJ0aWVzIHRoZXlcbiAgICogcmV0dXJucy5cbiAgICpcbiAgICogPHA+VE9ETyhlcmlnaHRzKTogT24gYSBwbGF0Zm9ybSB3aXRoIGJ1aWx0LWluIFByb3hpZXMsIHByb3hpZXNcbiAgICogY291bGQgYmUgdXNlZCB0byB0cmFwIGFuZCB0aGVyZWJ5IGRpc2NvdmVyIHRoZSBISURERU5fTkFNRSwgc28gd2VcbiAgICogbmVlZCB0byBtb25rZXkgcGF0Y2ggUHJveHkuY3JlYXRlLCBQcm94eS5jcmVhdGVGdW5jdGlvbiwgZXRjLCBpblxuICAgKiBvcmRlciB0byB3cmFwIHRoZSBwcm92aWRlZCBoYW5kbGVyIHdpdGggdGhlIHJlYWwgaGFuZGxlciB3aGljaFxuICAgKiBmaWx0ZXJzIG91dCBhbGwgdHJhcHMgdXNpbmcgSElEREVOX05BTUUuXG4gICAqXG4gICAqIDxwPlRPRE8oZXJpZ2h0cyk6IFJldmlzaXQgTWlrZSBTdGF5J3Mgc3VnZ2VzdGlvbiB0aGF0IHdlIHVzZSBhblxuICAgKiBlbmNhcHN1bGF0ZWQgZnVuY3Rpb24gYXQgYSBub3QtbmVjZXNzYXJpbHktc2VjcmV0IG5hbWUsIHdoaWNoXG4gICAqIHVzZXMgdGhlIFN0aWVnbGVyIHNoYXJlZC1zdGF0ZSByaWdodHMgYW1wbGlmaWNhdGlvbiBwYXR0ZXJuIHRvXG4gICAqIHJldmVhbCB0aGUgYXNzb2NpYXRlZCB2YWx1ZSBvbmx5IHRvIHRoZSBXZWFrTWFwIGluIHdoaWNoIHRoaXMga2V5XG4gICAqIGlzIGFzc29jaWF0ZWQgd2l0aCB0aGF0IHZhbHVlLiBTaW5jZSBvbmx5IHRoZSBrZXkgcmV0YWlucyB0aGVcbiAgICogZnVuY3Rpb24sIHRoZSBmdW5jdGlvbiBjYW4gYWxzbyByZW1lbWJlciB0aGUga2V5IHdpdGhvdXQgY2F1c2luZ1xuICAgKiBsZWFrYWdlIG9mIHRoZSBrZXksIHNvIHRoaXMgZG9lc24ndCB2aW9sYXRlIG91ciBnZW5lcmFsIGdjXG4gICAqIGdvYWxzLiBJbiBhZGRpdGlvbiwgYmVjYXVzZSB0aGUgbmFtZSBuZWVkIG5vdCBiZSBhIGd1YXJkZWRcbiAgICogc2VjcmV0LCB3ZSBjb3VsZCBlZmZpY2llbnRseSBoYW5kbGUgY3Jvc3MtZnJhbWUgZnJvemVuIGtleXMuXG4gICAqL1xuICB2YXIgSElEREVOX05BTUVfUFJFRklYID0gJ3dlYWttYXA6JztcbiAgdmFyIEhJRERFTl9OQU1FID0gSElEREVOX05BTUVfUFJFRklYICsgJ2lkZW50OicgKyBNYXRoLnJhbmRvbSgpICsgJ19fXyc7XG5cbiAgaWYgKHR5cGVvZiBjcnlwdG8gIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgdHlwZW9mIEFycmF5QnVmZmVyID09PSAnZnVuY3Rpb24nICYmXG4gICAgICB0eXBlb2YgVWludDhBcnJheSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBhYiA9IG5ldyBBcnJheUJ1ZmZlcigyNSk7XG4gICAgdmFyIHU4cyA9IG5ldyBVaW50OEFycmF5KGFiKTtcbiAgICBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKHU4cyk7XG4gICAgSElEREVOX05BTUUgPSBISURERU5fTkFNRV9QUkVGSVggKyAncmFuZDonICtcbiAgICAgIEFycmF5LnByb3RvdHlwZS5tYXAuY2FsbCh1OHMsIGZ1bmN0aW9uKHU4KSB7XG4gICAgICAgIHJldHVybiAodTggJSAzNikudG9TdHJpbmcoMzYpO1xuICAgICAgfSkuam9pbignJykgKyAnX19fJztcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzTm90SGlkZGVuTmFtZShuYW1lKSB7XG4gICAgcmV0dXJuICEoXG4gICAgICAgIG5hbWUuc3Vic3RyKDAsIEhJRERFTl9OQU1FX1BSRUZJWC5sZW5ndGgpID09IEhJRERFTl9OQU1FX1BSRUZJWCAmJlxuICAgICAgICBuYW1lLnN1YnN0cihuYW1lLmxlbmd0aCAtIDMpID09PSAnX19fJyk7XG4gIH1cblxuICAvKipcbiAgICogTW9ua2V5IHBhdGNoIGdldE93blByb3BlcnR5TmFtZXMgdG8gYXZvaWQgcmV2ZWFsaW5nIHRoZVxuICAgKiBISURERU5fTkFNRS5cbiAgICpcbiAgICogPHA+VGhlIEVTNS4xIHNwZWMgcmVxdWlyZXMgZWFjaCBuYW1lIHRvIGFwcGVhciBvbmx5IG9uY2UsIGJ1dCBhc1xuICAgKiBvZiB0aGlzIHdyaXRpbmcsIHRoaXMgcmVxdWlyZW1lbnQgaXMgY29udHJvdmVyc2lhbCBmb3IgRVM2LCBzbyB3ZVxuICAgKiBtYWRlIHRoaXMgY29kZSByb2J1c3QgYWdhaW5zdCB0aGlzIGNhc2UuIElmIHRoZSByZXN1bHRpbmcgZXh0cmFcbiAgICogc2VhcmNoIHR1cm5zIG91dCB0byBiZSBleHBlbnNpdmUsIHdlIGNhbiBwcm9iYWJseSByZWxheCB0aGlzIG9uY2VcbiAgICogRVM2IGlzIGFkZXF1YXRlbHkgc3VwcG9ydGVkIG9uIGFsbCBtYWpvciBicm93c2VycywgaWZmIG5vIGJyb3dzZXJcbiAgICogdmVyc2lvbnMgd2Ugc3VwcG9ydCBhdCB0aGF0IHRpbWUgaGF2ZSByZWxheGVkIHRoaXMgY29uc3RyYWludFxuICAgKiB3aXRob3V0IHByb3ZpZGluZyBidWlsdC1pbiBFUzYgV2Vha01hcHMuXG4gICAqL1xuICBkZWZQcm9wKE9iamVjdCwgJ2dldE93blByb3BlcnR5TmFtZXMnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uIGZha2VHZXRPd25Qcm9wZXJ0eU5hbWVzKG9iaikge1xuICAgICAgcmV0dXJuIGdvcG4ob2JqKS5maWx0ZXIoaXNOb3RIaWRkZW5OYW1lKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBnZXRQcm9wZXJ0eU5hbWVzIGlzIG5vdCBpbiBFUzUgYnV0IGl0IGlzIHByb3Bvc2VkIGZvciBFUzYgYW5kXG4gICAqIGRvZXMgYXBwZWFyIGluIG91ciB3aGl0ZWxpc3QsIHNvIHdlIG5lZWQgdG8gY2xlYW4gaXQgdG9vLlxuICAgKi9cbiAgaWYgKCdnZXRQcm9wZXJ0eU5hbWVzJyBpbiBPYmplY3QpIHtcbiAgICB2YXIgb3JpZ2luYWxHZXRQcm9wZXJ0eU5hbWVzID0gT2JqZWN0LmdldFByb3BlcnR5TmFtZXM7XG4gICAgZGVmUHJvcChPYmplY3QsICdnZXRQcm9wZXJ0eU5hbWVzJywge1xuICAgICAgdmFsdWU6IGZ1bmN0aW9uIGZha2VHZXRQcm9wZXJ0eU5hbWVzKG9iaikge1xuICAgICAgICByZXR1cm4gb3JpZ2luYWxHZXRQcm9wZXJ0eU5hbWVzKG9iaikuZmlsdGVyKGlzTm90SGlkZGVuTmFtZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogPHA+VG8gdHJlYXQgb2JqZWN0cyBhcyBpZGVudGl0eS1rZXlzIHdpdGggcmVhc29uYWJsZSBlZmZpY2llbmN5XG4gICAqIG9uIEVTNSBieSBpdHNlbGYgKGkuZS4sIHdpdGhvdXQgYW55IG9iamVjdC1rZXllZCBjb2xsZWN0aW9ucyksIHdlXG4gICAqIG5lZWQgdG8gYWRkIGEgaGlkZGVuIHByb3BlcnR5IHRvIHN1Y2gga2V5IG9iamVjdHMgd2hlbiB3ZVxuICAgKiBjYW4uIFRoaXMgcmFpc2VzIHNldmVyYWwgaXNzdWVzOlxuICAgKiA8dWw+XG4gICAqIDxsaT5BcnJhbmdpbmcgdG8gYWRkIHRoaXMgcHJvcGVydHkgdG8gb2JqZWN0cyBiZWZvcmUgd2UgbG9zZSB0aGVcbiAgICogICAgIGNoYW5jZSwgYW5kXG4gICAqIDxsaT5IaWRpbmcgdGhlIGV4aXN0ZW5jZSBvZiB0aGlzIG5ldyBwcm9wZXJ0eSBmcm9tIG1vc3RcbiAgICogICAgIEphdmFTY3JpcHQgY29kZS5cbiAgICogPGxpPlByZXZlbnRpbmcgPGk+Y2VydGlmaWNhdGlvbiB0aGVmdDwvaT4sIHdoZXJlIG9uZSBvYmplY3QgaXNcbiAgICogICAgIGNyZWF0ZWQgZmFsc2VseSBjbGFpbWluZyB0byBiZSB0aGUga2V5IG9mIGFuIGFzc29jaWF0aW9uXG4gICAqICAgICBhY3R1YWxseSBrZXllZCBieSBhbm90aGVyIG9iamVjdC5cbiAgICogPGxpPlByZXZlbnRpbmcgPGk+dmFsdWUgdGhlZnQ8L2k+LCB3aGVyZSB1bnRydXN0ZWQgY29kZSB3aXRoXG4gICAqICAgICBhY2Nlc3MgdG8gYSBrZXkgb2JqZWN0IGJ1dCBub3QgYSB3ZWFrIG1hcCBuZXZlcnRoZWxlc3NcbiAgICogICAgIG9idGFpbnMgYWNjZXNzIHRvIHRoZSB2YWx1ZSBhc3NvY2lhdGVkIHdpdGggdGhhdCBrZXkgaW4gdGhhdFxuICAgKiAgICAgd2VhayBtYXAuXG4gICAqIDwvdWw+XG4gICAqIFdlIGRvIHNvIGJ5XG4gICAqIDx1bD5cbiAgICogPGxpPk1ha2luZyB0aGUgbmFtZSBvZiB0aGUgaGlkZGVuIHByb3BlcnR5IHVuZ3Vlc3NhYmxlLCBzbyBcIltdXCJcbiAgICogICAgIGluZGV4aW5nLCB3aGljaCB3ZSBjYW5ub3QgaW50ZXJjZXB0LCBjYW5ub3QgYmUgdXNlZCB0byBhY2Nlc3NcbiAgICogICAgIGEgcHJvcGVydHkgd2l0aG91dCBrbm93aW5nIHRoZSBuYW1lLlxuICAgKiA8bGk+TWFraW5nIHRoZSBoaWRkZW4gcHJvcGVydHkgbm9uLWVudW1lcmFibGUsIHNvIHdlIG5lZWQgbm90XG4gICAqICAgICB3b3JyeSBhYm91dCBmb3ItaW4gbG9vcHMgb3Ige0Bjb2RlIE9iamVjdC5rZXlzfSxcbiAgICogPGxpPm1vbmtleSBwYXRjaGluZyB0aG9zZSByZWZsZWN0aXZlIG1ldGhvZHMgdGhhdCB3b3VsZFxuICAgKiAgICAgcHJldmVudCBleHRlbnNpb25zLCB0byBhZGQgdGhpcyBoaWRkZW4gcHJvcGVydHkgZmlyc3QsXG4gICAqIDxsaT5tb25rZXkgcGF0Y2hpbmcgdGhvc2UgbWV0aG9kcyB0aGF0IHdvdWxkIHJldmVhbCB0aGlzXG4gICAqICAgICBoaWRkZW4gcHJvcGVydHkuXG4gICAqIDwvdWw+XG4gICAqIFVuZm9ydHVuYXRlbHksIGJlY2F1c2Ugb2Ygc2FtZS1vcmlnaW4gaWZyYW1lcywgd2UgY2Fubm90IHJlbGlhYmx5XG4gICAqIGFkZCB0aGlzIGhpZGRlbiBwcm9wZXJ0eSBiZWZvcmUgYW4gb2JqZWN0IGJlY29tZXNcbiAgICogbm9uLWV4dGVuc2libGUuIEluc3RlYWQsIGlmIHdlIGVuY291bnRlciBhIG5vbi1leHRlbnNpYmxlIG9iamVjdFxuICAgKiB3aXRob3V0IGEgaGlkZGVuIHJlY29yZCB0aGF0IHdlIGNhbiBkZXRlY3QgKHdoZXRoZXIgb3Igbm90IGl0IGhhc1xuICAgKiBhIGhpZGRlbiByZWNvcmQgc3RvcmVkIHVuZGVyIGEgbmFtZSBzZWNyZXQgdG8gdXMpLCB0aGVuIHdlIGp1c3RcbiAgICogdXNlIHRoZSBrZXkgb2JqZWN0IGl0c2VsZiB0byByZXByZXNlbnQgaXRzIGlkZW50aXR5IGluIGEgYnJ1dGVcbiAgICogZm9yY2UgbGVha3kgbWFwIHN0b3JlZCBpbiB0aGUgd2VhayBtYXAsIGxvc2luZyBhbGwgdGhlIGFkdmFudGFnZXNcbiAgICogb2Ygd2Vha25lc3MgZm9yIHRoZXNlLlxuICAgKi9cbiAgZnVuY3Rpb24gZ2V0SGlkZGVuUmVjb3JkKGtleSkge1xuICAgIGlmIChrZXkgIT09IE9iamVjdChrZXkpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdOb3QgYW4gb2JqZWN0OiAnICsga2V5KTtcbiAgICB9XG4gICAgdmFyIGhpZGRlblJlY29yZCA9IGtleVtISURERU5fTkFNRV07XG4gICAgaWYgKGhpZGRlblJlY29yZCAmJiBoaWRkZW5SZWNvcmQua2V5ID09PSBrZXkpIHsgcmV0dXJuIGhpZGRlblJlY29yZDsgfVxuICAgIGlmICghaXNFeHRlbnNpYmxlKGtleSkpIHtcbiAgICAgIC8vIFdlYWsgbWFwIG11c3QgYnJ1dGUgZm9yY2UsIGFzIGV4cGxhaW5lZCBpbiBkb2MtY29tbWVudCBhYm92ZS5cbiAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgfVxuICAgIHZhciBnZXRzID0gW107XG4gICAgdmFyIHZhbHMgPSBbXTtcbiAgICBoaWRkZW5SZWNvcmQgPSB7XG4gICAgICBrZXk6IGtleSwgICAvLyBzZWxmIHBvaW50ZXIgZm9yIHF1aWNrIG93biBjaGVjayBhYm92ZS5cbiAgICAgIGdldHM6IGdldHMsIC8vIGdldF9fXyBtZXRob2RzIGlkZW50aWZ5aW5nIHdlYWsgbWFwc1xuICAgICAgdmFsczogdmFscyAgLy8gdmFsdWVzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGtleSBpbiBlYWNoXG4gICAgICAgICAgICAgICAgICAvLyBjb3JyZXNwb25kaW5nIHdlYWsgbWFwLlxuICAgIH07XG4gICAgZGVmUHJvcChrZXksIEhJRERFTl9OQU1FLCB7XG4gICAgICB2YWx1ZTogaGlkZGVuUmVjb3JkLFxuICAgICAgd3JpdGFibGU6IGZhbHNlLFxuICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICBjb25maWd1cmFibGU6IGZhbHNlXG4gICAgfSk7XG4gICAgcmV0dXJuIGhpZGRlblJlY29yZDtcbiAgfVxuXG5cbiAgLyoqXG4gICAqIE1vbmtleSBwYXRjaCBvcGVyYXRpb25zIHRoYXQgd291bGQgbWFrZSB0aGVpciBhcmd1bWVudFxuICAgKiBub24tZXh0ZW5zaWJsZS5cbiAgICpcbiAgICogPHA+VGhlIG1vbmtleSBwYXRjaGVkIHZlcnNpb25zIHRocm93IGEgVHlwZUVycm9yIGlmIHRoZWlyXG4gICAqIGFyZ3VtZW50IGlzIG5vdCBhbiBvYmplY3QsIHNvIGl0IHNob3VsZCBvbmx5IGJlIGRvbmUgdG8gZnVuY3Rpb25zXG4gICAqIHRoYXQgc2hvdWxkIHRocm93IGEgVHlwZUVycm9yIGFueXdheSBpZiB0aGVpciBhcmd1bWVudCBpcyBub3QgYW5cbiAgICogb2JqZWN0LlxuICAgKi9cbiAgKGZ1bmN0aW9uKCl7XG4gICAgdmFyIG9sZEZyZWV6ZSA9IE9iamVjdC5mcmVlemU7XG4gICAgZGVmUHJvcChPYmplY3QsICdmcmVlemUnLCB7XG4gICAgICB2YWx1ZTogZnVuY3Rpb24gaWRlbnRpZnlpbmdGcmVlemUob2JqKSB7XG4gICAgICAgIGdldEhpZGRlblJlY29yZChvYmopO1xuICAgICAgICByZXR1cm4gb2xkRnJlZXplKG9iaik7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdmFyIG9sZFNlYWwgPSBPYmplY3Quc2VhbDtcbiAgICBkZWZQcm9wKE9iamVjdCwgJ3NlYWwnLCB7XG4gICAgICB2YWx1ZTogZnVuY3Rpb24gaWRlbnRpZnlpbmdTZWFsKG9iaikge1xuICAgICAgICBnZXRIaWRkZW5SZWNvcmQob2JqKTtcbiAgICAgICAgcmV0dXJuIG9sZFNlYWwob2JqKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB2YXIgb2xkUHJldmVudEV4dGVuc2lvbnMgPSBPYmplY3QucHJldmVudEV4dGVuc2lvbnM7XG4gICAgZGVmUHJvcChPYmplY3QsICdwcmV2ZW50RXh0ZW5zaW9ucycsIHtcbiAgICAgIHZhbHVlOiBmdW5jdGlvbiBpZGVudGlmeWluZ1ByZXZlbnRFeHRlbnNpb25zKG9iaikge1xuICAgICAgICBnZXRIaWRkZW5SZWNvcmQob2JqKTtcbiAgICAgICAgcmV0dXJuIG9sZFByZXZlbnRFeHRlbnNpb25zKG9iaik7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pKCk7XG5cblxuICBmdW5jdGlvbiBjb25zdEZ1bmMoZnVuYykge1xuICAgIGZ1bmMucHJvdG90eXBlID0gbnVsbDtcbiAgICByZXR1cm4gT2JqZWN0LmZyZWV6ZShmdW5jKTtcbiAgfVxuXG4gIC8vIFJpZ2h0IG5vdyAoMTIvMjUvMjAxMikgdGhlIGhpc3RvZ3JhbSBzdXBwb3J0cyB0aGUgY3VycmVudFxuICAvLyByZXByZXNlbnRhdGlvbi4gV2Ugc2hvdWxkIGNoZWNrIHRoaXMgb2NjYXNpb25hbGx5LCBhcyBhIHRydWVcbiAgLy8gY29uc3RhbnQgdGltZSByZXByZXNlbnRhdGlvbiBpcyBlYXN5LlxuICAvLyB2YXIgaGlzdG9ncmFtID0gW107XG5cbiAgdmFyIE91cldlYWtNYXAgPSBmdW5jdGlvbigpIHtcbiAgICAvLyBXZSBhcmUgY3VycmVudGx5ICgxMi8yNS8yMDEyKSBuZXZlciBlbmNvdW50ZXJpbmcgYW55IHByZW1hdHVyZWx5XG4gICAgLy8gbm9uLWV4dGVuc2libGUga2V5cy5cbiAgICB2YXIga2V5cyA9IFtdOyAvLyBicnV0ZSBmb3JjZSBmb3IgcHJlbWF0dXJlbHkgbm9uLWV4dGVuc2libGUga2V5cy5cbiAgICB2YXIgdmFscyA9IFtdOyAvLyBicnV0ZSBmb3JjZSBmb3IgY29ycmVzcG9uZGluZyB2YWx1ZXMuXG5cbiAgICBmdW5jdGlvbiBnZXRfX18oa2V5LCBvcHRfZGVmYXVsdCkge1xuICAgICAgdmFyIGhyID0gZ2V0SGlkZGVuUmVjb3JkKGtleSk7XG4gICAgICB2YXIgaSwgdnM7XG4gICAgICBpZiAoaHIpIHtcbiAgICAgICAgaSA9IGhyLmdldHMuaW5kZXhPZihnZXRfX18pO1xuICAgICAgICB2cyA9IGhyLnZhbHM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpID0ga2V5cy5pbmRleE9mKGtleSk7XG4gICAgICAgIHZzID0gdmFscztcbiAgICAgIH1cbiAgICAgIHJldHVybiAoaSA+PSAwKSA/IHZzW2ldIDogb3B0X2RlZmF1bHQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFzX19fKGtleSkge1xuICAgICAgdmFyIGhyID0gZ2V0SGlkZGVuUmVjb3JkKGtleSk7XG4gICAgICB2YXIgaTtcbiAgICAgIGlmIChocikge1xuICAgICAgICBpID0gaHIuZ2V0cy5pbmRleE9mKGdldF9fXyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpID0ga2V5cy5pbmRleE9mKGtleSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gaSA+PSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldF9fXyhrZXksIHZhbHVlKSB7XG4gICAgICB2YXIgaHIgPSBnZXRIaWRkZW5SZWNvcmQoa2V5KTtcbiAgICAgIHZhciBpO1xuICAgICAgaWYgKGhyKSB7XG4gICAgICAgIGkgPSBoci5nZXRzLmluZGV4T2YoZ2V0X19fKTtcbiAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgIGhyLnZhbHNbaV0gPSB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbi8vICAgICAgICAgIGkgPSBoci5nZXRzLmxlbmd0aDtcbi8vICAgICAgICAgIGhpc3RvZ3JhbVtpXSA9IChoaXN0b2dyYW1baV0gfHwgMCkgKyAxO1xuICAgICAgICAgIGhyLmdldHMucHVzaChnZXRfX18pO1xuICAgICAgICAgIGhyLnZhbHMucHVzaCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGkgPSBrZXlzLmluZGV4T2Yoa2V5KTtcbiAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgIHZhbHNbaV0gPSB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBrZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICB2YWxzLnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVsZXRlX19fKGtleSkge1xuICAgICAgdmFyIGhyID0gZ2V0SGlkZGVuUmVjb3JkKGtleSk7XG4gICAgICB2YXIgaTtcbiAgICAgIGlmIChocikge1xuICAgICAgICBpID0gaHIuZ2V0cy5pbmRleE9mKGdldF9fXyk7XG4gICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICBoci5nZXRzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICBoci52YWxzLnNwbGljZShpLCAxKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaSA9IGtleXMuaW5kZXhPZihrZXkpO1xuICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAga2V5cy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgdmFscy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlKE91cldlYWtNYXAucHJvdG90eXBlLCB7XG4gICAgICBnZXRfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhnZXRfX18pIH0sXG4gICAgICBoYXNfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhoYXNfX18pIH0sXG4gICAgICBzZXRfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhzZXRfX18pIH0sXG4gICAgICBkZWxldGVfX186IHsgdmFsdWU6IGNvbnN0RnVuYyhkZWxldGVfX18pIH1cbiAgICB9KTtcbiAgfTtcbiAgT3VyV2Vha01hcC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKE9iamVjdC5wcm90b3R5cGUsIHtcbiAgICBnZXQ6IHtcbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJuIHRoZSB2YWx1ZSBtb3N0IHJlY2VudGx5IGFzc29jaWF0ZWQgd2l0aCBrZXksIG9yXG4gICAgICAgKiBvcHRfZGVmYXVsdCBpZiBub25lLlxuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gZ2V0KGtleSwgb3B0X2RlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0X19fKGtleSwgb3B0X2RlZmF1bHQpO1xuICAgICAgfSxcbiAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSxcblxuICAgIGhhczoge1xuICAgICAgLyoqXG4gICAgICAgKiBJcyB0aGVyZSBhIHZhbHVlIGFzc29jaWF0ZWQgd2l0aCBrZXkgaW4gdGhpcyBXZWFrTWFwP1xuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gaGFzKGtleSkge1xuICAgICAgICByZXR1cm4gdGhpcy5oYXNfX18oa2V5KTtcbiAgICAgIH0sXG4gICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0sXG5cbiAgICBzZXQ6IHtcbiAgICAgIC8qKlxuICAgICAgICogQXNzb2NpYXRlIHZhbHVlIHdpdGgga2V5IGluIHRoaXMgV2Vha01hcCwgb3ZlcndyaXRpbmcgYW55XG4gICAgICAgKiBwcmV2aW91cyBhc3NvY2lhdGlvbiBpZiBwcmVzZW50LlxuICAgICAgICovXG4gICAgICB2YWx1ZTogZnVuY3Rpb24gc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgdGhpcy5zZXRfX18oa2V5LCB2YWx1ZSk7XG4gICAgICB9LFxuICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9LFxuXG4gICAgJ2RlbGV0ZSc6IHtcbiAgICAgIC8qKlxuICAgICAgICogUmVtb3ZlIGFueSBhc3NvY2lhdGlvbiBmb3Iga2V5IGluIHRoaXMgV2Vha01hcCwgcmV0dXJuaW5nXG4gICAgICAgKiB3aGV0aGVyIHRoZXJlIHdhcyBvbmUuXG4gICAgICAgKlxuICAgICAgICogPHA+Tm90ZSB0aGF0IHRoZSBib29sZWFuIHJldHVybiBoZXJlIGRvZXMgbm90IHdvcmsgbGlrZSB0aGVcbiAgICAgICAqIHtAY29kZSBkZWxldGV9IG9wZXJhdG9yLiBUaGUge0Bjb2RlIGRlbGV0ZX0gb3BlcmF0b3IgcmV0dXJuc1xuICAgICAgICogd2hldGhlciB0aGUgZGVsZXRpb24gc3VjY2VlZHMgYXQgYnJpbmdpbmcgYWJvdXQgYSBzdGF0ZSBpblxuICAgICAgICogd2hpY2ggdGhlIGRlbGV0ZWQgcHJvcGVydHkgaXMgYWJzZW50LiBUaGUge0Bjb2RlIGRlbGV0ZX1cbiAgICAgICAqIG9wZXJhdG9yIHRoZXJlZm9yZSByZXR1cm5zIHRydWUgaWYgdGhlIHByb3BlcnR5IHdhcyBhbHJlYWR5XG4gICAgICAgKiBhYnNlbnQsIHdoZXJlYXMgdGhpcyB7QGNvZGUgZGVsZXRlfSBtZXRob2QgcmV0dXJucyBmYWxzZSBpZlxuICAgICAgICogdGhlIGFzc29jaWF0aW9uIHdhcyBhbHJlYWR5IGFic2VudC5cbiAgICAgICAqL1xuICAgICAgdmFsdWU6IGZ1bmN0aW9uIHJlbW92ZShrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlX19fKGtleSk7XG4gICAgICB9LFxuICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9XG4gIH0pO1xuXG4gIGlmICh0eXBlb2YgSG9zdFdlYWtNYXAgPT09ICdmdW5jdGlvbicpIHtcbiAgICAoZnVuY3Rpb24oKSB7XG4gICAgICAvLyBJZiB3ZSBnb3QgaGVyZSwgdGhlbiB0aGUgcGxhdGZvcm0gaGFzIGEgV2Vha01hcCBidXQgd2UgYXJlIGNvbmNlcm5lZFxuICAgICAgLy8gdGhhdCBpdCBtYXkgcmVmdXNlIHRvIHN0b3JlIHNvbWUga2V5IHR5cGVzLiBUaGVyZWZvcmUsIG1ha2UgYSBtYXBcbiAgICAgIC8vIGltcGxlbWVudGF0aW9uIHdoaWNoIG1ha2VzIHVzZSBvZiBib3RoIGFzIHBvc3NpYmxlLlxuXG4gICAgICBmdW5jdGlvbiBEb3VibGVXZWFrTWFwKCkge1xuICAgICAgICAvLyBQcmVmZXJhYmxlLCB0cnVseSB3ZWFrIG1hcC5cbiAgICAgICAgdmFyIGhtYXAgPSBuZXcgSG9zdFdlYWtNYXAoKTtcblxuICAgICAgICAvLyBPdXIgaGlkZGVuLXByb3BlcnR5LWJhc2VkIHBzZXVkby13ZWFrLW1hcC4gTGF6aWx5IGluaXRpYWxpemVkIGluIHRoZVxuICAgICAgICAvLyAnc2V0JyBpbXBsZW1lbnRhdGlvbjsgdGh1cyB3ZSBjYW4gYXZvaWQgcGVyZm9ybWluZyBleHRyYSBsb29rdXBzIGlmXG4gICAgICAgIC8vIHdlIGtub3cgYWxsIGVudHJpZXMgYWN0dWFsbHkgc3RvcmVkIGFyZSBlbnRlcmVkIGluICdobWFwJy5cbiAgICAgICAgdmFyIG9tYXAgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgLy8gSGlkZGVuLXByb3BlcnR5IG1hcHMgYXJlIG5vdCBjb21wYXRpYmxlIHdpdGggcHJveGllcyBiZWNhdXNlIHByb3hpZXNcbiAgICAgICAgLy8gY2FuIG9ic2VydmUgdGhlIGhpZGRlbiBuYW1lIGFuZCBlaXRoZXIgYWNjaWRlbnRhbGx5IGV4cG9zZSBpdCBvciBmYWlsXG4gICAgICAgIC8vIHRvIGFsbG93IHRoZSBoaWRkZW4gcHJvcGVydHkgdG8gYmUgc2V0LiBUaGVyZWZvcmUsIHdlIGRvIG5vdCBhbGxvd1xuICAgICAgICAvLyBhcmJpdHJhcnkgV2Vha01hcHMgdG8gc3dpdGNoIHRvIHVzaW5nIGhpZGRlbiBwcm9wZXJ0aWVzLCBidXQgb25seVxuICAgICAgICAvLyB0aG9zZSB3aGljaCBuZWVkIHRoZSBhYmlsaXR5LCBhbmQgdW5wcml2aWxlZ2VkIGNvZGUgaXMgbm90IGFsbG93ZWRcbiAgICAgICAgLy8gdG8gc2V0IHRoZSBmbGFnLlxuICAgICAgICB2YXIgZW5hYmxlU3dpdGNoaW5nID0gZmFsc2U7XG5cbiAgICAgICAgZnVuY3Rpb24gZGdldChrZXksIG9wdF9kZWZhdWx0KSB7XG4gICAgICAgICAgaWYgKG9tYXApIHtcbiAgICAgICAgICAgIHJldHVybiBobWFwLmhhcyhrZXkpID8gaG1hcC5nZXQoa2V5KVxuICAgICAgICAgICAgICAgIDogb21hcC5nZXRfX18oa2V5LCBvcHRfZGVmYXVsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBobWFwLmdldChrZXksIG9wdF9kZWZhdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkaGFzKGtleSkge1xuICAgICAgICAgIHJldHVybiBobWFwLmhhcyhrZXkpIHx8IChvbWFwID8gb21hcC5oYXNfX18oa2V5KSA6IGZhbHNlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICAgIGlmIChlbmFibGVTd2l0Y2hpbmcpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGhtYXAuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBpZiAoIW9tYXApIHsgb21hcCA9IG5ldyBPdXJXZWFrTWFwKCk7IH1cbiAgICAgICAgICAgICAgb21hcC5zZXRfX18oa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGhtYXAuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRkZWxldGUoa2V5KSB7XG4gICAgICAgICAgaG1hcFsnZGVsZXRlJ10oa2V5KTtcbiAgICAgICAgICBpZiAob21hcCkgeyBvbWFwLmRlbGV0ZV9fXyhrZXkpOyB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZShPdXJXZWFrTWFwLnByb3RvdHlwZSwge1xuICAgICAgICAgIGdldF9fXzogICAgeyB2YWx1ZTogY29uc3RGdW5jKGRnZXQpIH0sXG4gICAgICAgICAgaGFzX19fOiAgICB7IHZhbHVlOiBjb25zdEZ1bmMoZGhhcykgfSxcbiAgICAgICAgICBzZXRfX186ICAgIHsgdmFsdWU6IGNvbnN0RnVuYyhkc2V0KSB9LFxuICAgICAgICAgIGRlbGV0ZV9fXzogeyB2YWx1ZTogY29uc3RGdW5jKGRkZWxldGUpIH0sXG4gICAgICAgICAgcGVybWl0SG9zdE9iamVjdHNfX186IHsgdmFsdWU6IGNvbnN0RnVuYyhmdW5jdGlvbih0b2tlbikge1xuICAgICAgICAgICAgaWYgKHRva2VuID09PSB3ZWFrTWFwUGVybWl0SG9zdE9iamVjdHMpIHtcbiAgICAgICAgICAgICAgZW5hYmxlU3dpdGNoaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignYm9ndXMgY2FsbCB0byBwZXJtaXRIb3N0T2JqZWN0c19fXycpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIERvdWJsZVdlYWtNYXAucHJvdG90eXBlID0gT3VyV2Vha01hcC5wcm90b3R5cGU7XG4gICAgICBtb2R1bGUuZXhwb3J0cyA9IERvdWJsZVdlYWtNYXA7XG5cbiAgICAgIC8vIGRlZmluZSAuY29uc3RydWN0b3IgdG8gaGlkZSBPdXJXZWFrTWFwIGN0b3JcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShXZWFrTWFwLnByb3RvdHlwZSwgJ2NvbnN0cnVjdG9yJywge1xuICAgICAgICB2YWx1ZTogV2Vha01hcCxcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsICAvLyBhcyBkZWZhdWx0IC5jb25zdHJ1Y3RvciBpc1xuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlXG4gICAgICB9KTtcbiAgICB9KSgpO1xuICB9IGVsc2Uge1xuICAgIC8vIFRoZXJlIGlzIG5vIGhvc3QgV2Vha01hcCwgc28gd2UgbXVzdCB1c2UgdGhlIGVtdWxhdGlvbi5cblxuICAgIC8vIEVtdWxhdGVkIFdlYWtNYXBzIGFyZSBpbmNvbXBhdGlibGUgd2l0aCBuYXRpdmUgcHJveGllcyAoYmVjYXVzZSBwcm94aWVzXG4gICAgLy8gY2FuIG9ic2VydmUgdGhlIGhpZGRlbiBuYW1lKSwgc28gd2UgbXVzdCBkaXNhYmxlIFByb3h5IHVzYWdlIChpblxuICAgIC8vIEFycmF5TGlrZSBhbmQgRG9tYWRvLCBjdXJyZW50bHkpLlxuICAgIGlmICh0eXBlb2YgUHJveHkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBQcm94eSA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IE91cldlYWtNYXA7XG4gIH1cbn0pKCk7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLypcbiAgICBCYXNlZCBpbiBwYXJ0IG9uIGV4dHJhcyBmcm9tIE1vdG9yb2xhIE1vYmlsaXR54oCZcyBNb250YWdlXG4gICAgQ29weXJpZ2h0IChjKSAyMDEyLCBNb3Rvcm9sYSBNb2JpbGl0eSBMTEMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gICAgMy1DbGF1c2UgQlNEIExpY2Vuc2VcbiAgICBodHRwczovL2dpdGh1Yi5jb20vbW90b3JvbGEtbW9iaWxpdHkvbW9udGFnZS9ibG9iL21hc3Rlci9MSUNFTlNFLm1kXG4qL1xuXG52YXIgRnVuY3Rpb24gPSByZXF1aXJlKFwiLi9zaGltLWZ1bmN0aW9uXCIpO1xudmFyIEdlbmVyaWNDb2xsZWN0aW9uID0gcmVxdWlyZShcIi4vZ2VuZXJpYy1jb2xsZWN0aW9uXCIpO1xudmFyIEdlbmVyaWNPcmRlciA9IHJlcXVpcmUoXCIuL2dlbmVyaWMtb3JkZXJcIik7XG52YXIgV2Vha01hcCA9IHJlcXVpcmUoXCJ3ZWFrLW1hcFwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBBcnJheTtcblxuQXJyYXkuZW1wdHkgPSBbXTtcblxuaWYgKE9iamVjdC5mcmVlemUpIHtcbiAgICBPYmplY3QuZnJlZXplKEFycmF5LmVtcHR5KTtcbn1cblxuQXJyYXkuZnJvbSA9IGZ1bmN0aW9uICh2YWx1ZXMpIHtcbiAgICB2YXIgYXJyYXkgPSBbXTtcbiAgICBhcnJheS5hZGRFYWNoKHZhbHVlcyk7XG4gICAgcmV0dXJuIGFycmF5O1xufTtcblxuQXJyYXkudW56aXAgPSBmdW5jdGlvbiAodGFibGUpIHtcbiAgICB2YXIgdHJhbnNwb3NlID0gW107XG4gICAgdmFyIGxlbmd0aCA9IEluZmluaXR5O1xuICAgIC8vIGNvbXB1dGUgc2hvcnRlc3Qgcm93XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcm93ID0gdGFibGVbaV07XG4gICAgICAgIHRhYmxlW2ldID0gcm93LnRvQXJyYXkoKTtcbiAgICAgICAgaWYgKHJvdy5sZW5ndGggPCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGxlbmd0aCA9IHJvdy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcm93ID0gdGFibGVbaV07XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcm93Lmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICBpZiAoaiA8IGxlbmd0aCAmJiBqIGluIHJvdykge1xuICAgICAgICAgICAgICAgIHRyYW5zcG9zZVtqXSA9IHRyYW5zcG9zZVtqXSB8fCBbXTtcbiAgICAgICAgICAgICAgICB0cmFuc3Bvc2Vbal1baV0gPSByb3dbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRyYW5zcG9zZTtcbn07XG5cbmZ1bmN0aW9uIGRlZmluZShrZXksIHZhbHVlKSB7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFycmF5LnByb3RvdHlwZSwga2V5LCB7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2VcbiAgICB9KTtcbn1cblxuZGVmaW5lKFwiYWRkRWFjaFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuYWRkRWFjaCk7XG5kZWZpbmUoXCJkZWxldGVFYWNoXCIsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5kZWxldGVFYWNoKTtcbmRlZmluZShcInRvQXJyYXlcIiwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnRvQXJyYXkpO1xuZGVmaW5lKFwidG9PYmplY3RcIiwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnRvT2JqZWN0KTtcbmRlZmluZShcImFsbFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuYWxsKTtcbmRlZmluZShcImFueVwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuYW55KTtcbmRlZmluZShcIm1pblwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUubWluKTtcbmRlZmluZShcIm1heFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUubWF4KTtcbmRlZmluZShcInN1bVwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuc3VtKTtcbmRlZmluZShcImF2ZXJhZ2VcIiwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLmF2ZXJhZ2UpO1xuZGVmaW5lKFwib25seVwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUub25seSk7XG5kZWZpbmUoXCJmbGF0dGVuXCIsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5mbGF0dGVuKTtcbmRlZmluZShcInppcFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuemlwKTtcbmRlZmluZShcImVudW1lcmF0ZVwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUuZW51bWVyYXRlKTtcbmRlZmluZShcImdyb3VwXCIsIEdlbmVyaWNDb2xsZWN0aW9uLnByb3RvdHlwZS5ncm91cCk7XG5kZWZpbmUoXCJzb3J0ZWRcIiwgR2VuZXJpY0NvbGxlY3Rpb24ucHJvdG90eXBlLnNvcnRlZCk7XG5kZWZpbmUoXCJyZXZlcnNlZFwiLCBHZW5lcmljQ29sbGVjdGlvbi5wcm90b3R5cGUucmV2ZXJzZWQpO1xuXG5kZWZpbmUoXCJjb25zdHJ1Y3RDbG9uZVwiLCBmdW5jdGlvbiAodmFsdWVzKSB7XG4gICAgdmFyIGNsb25lID0gbmV3IHRoaXMuY29uc3RydWN0b3IoKTtcbiAgICBjbG9uZS5hZGRFYWNoKHZhbHVlcyk7XG4gICAgcmV0dXJuIGNsb25lO1xufSk7XG5cbmRlZmluZShcImhhc1wiLCBmdW5jdGlvbiAodmFsdWUsIGVxdWFscykge1xuICAgIHJldHVybiB0aGlzLmZpbmQodmFsdWUsIGVxdWFscykgIT09IC0xO1xufSk7XG5cbmRlZmluZShcImdldFwiLCBmdW5jdGlvbiAoaW5kZXgsIGRlZmF1bHRWYWx1ZSkge1xuICAgIGlmICgraW5kZXggIT09IGluZGV4KVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbmRpY2llcyBtdXN0IGJlIG51bWJlcnNcIik7XG4gICAgaWYgKCFpbmRleCBpbiB0aGlzKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbaW5kZXhdO1xuICAgIH1cbn0pO1xuXG5kZWZpbmUoXCJzZXRcIiwgZnVuY3Rpb24gKGluZGV4LCB2YWx1ZSkge1xuICAgIHRoaXMuc3BsaWNlKGluZGV4LCAxLCB2YWx1ZSk7XG4gICAgcmV0dXJuIHRydWU7XG59KTtcblxuZGVmaW5lKFwiYWRkXCIsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHRoaXMucHVzaCh2YWx1ZSk7XG4gICAgcmV0dXJuIHRydWU7XG59KTtcblxuZGVmaW5lKFwiZGVsZXRlXCIsIGZ1bmN0aW9uICh2YWx1ZSwgZXF1YWxzKSB7XG4gICAgdmFyIGluZGV4ID0gdGhpcy5maW5kKHZhbHVlLCBlcXVhbHMpO1xuICAgIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgdGhpcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufSk7XG5cbmRlZmluZShcImZpbmRcIiwgZnVuY3Rpb24gKHZhbHVlLCBlcXVhbHMpIHtcbiAgICBlcXVhbHMgPSBlcXVhbHMgfHwgdGhpcy5jb250ZW50RXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIGlmIChpbmRleCBpbiB0aGlzICYmIGVxdWFscyh0aGlzW2luZGV4XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIC0xO1xufSk7XG5cbmRlZmluZShcImZpbmRMYXN0XCIsIGZ1bmN0aW9uICh2YWx1ZSwgZXF1YWxzKSB7XG4gICAgZXF1YWxzID0gZXF1YWxzIHx8IHRoaXMuY29udGVudEVxdWFscyB8fCBPYmplY3QuZXF1YWxzO1xuICAgIHZhciBpbmRleCA9IHRoaXMubGVuZ3RoO1xuICAgIGRvIHtcbiAgICAgICAgaW5kZXgtLTtcbiAgICAgICAgaWYgKGluZGV4IGluIHRoaXMgJiYgZXF1YWxzKHRoaXNbaW5kZXhdLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBpbmRleDtcbiAgICAgICAgfVxuICAgIH0gd2hpbGUgKGluZGV4ID4gMCk7XG4gICAgcmV0dXJuIC0xO1xufSk7XG5cbmRlZmluZShcInN3YXBcIiwgZnVuY3Rpb24gKGluZGV4LCBsZW5ndGgsIHBsdXMpIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCwgMik7XG4gICAgaWYgKHBsdXMpIHtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHBsdXMpKSB7XG4gICAgICAgICAgICBwbHVzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwocGx1cyk7XG4gICAgICAgIH1cbiAgICAgICAgYXJncy5wdXNoLmFwcGx5KGFyZ3MsIHBsdXMpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zcGxpY2UuYXBwbHkodGhpcywgYXJncyk7XG59KTtcblxuZGVmaW5lKFwib25lXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKHZhciBpIGluIHRoaXMpIHtcbiAgICAgICAgaWYgKE9iamVjdC5vd25zKHRoaXMsIGkpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpc1tpXTtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5kZWZpbmUoXCJjbGVhclwiLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xuICAgIHJldHVybiB0aGlzO1xufSk7XG5cbmRlZmluZShcImNvbXBhcmVcIiwgZnVuY3Rpb24gKHRoYXQsIGNvbXBhcmUpIHtcbiAgICBjb21wYXJlID0gY29tcGFyZSB8fCBPYmplY3QuY29tcGFyZTtcbiAgICB2YXIgaTtcbiAgICB2YXIgbGVuZ3RoO1xuICAgIHZhciBsaHM7XG4gICAgdmFyIHJocztcbiAgICB2YXIgcmVsYXRpdmU7XG5cbiAgICBpZiAodGhpcyA9PT0gdGhhdCkge1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBpZiAoIXRoYXQgfHwgIUFycmF5LmlzQXJyYXkodGhhdCkpIHtcbiAgICAgICAgcmV0dXJuIEdlbmVyaWNPcmRlci5wcm90b3R5cGUuY29tcGFyZS5jYWxsKHRoaXMsIHRoYXQsIGNvbXBhcmUpO1xuICAgIH1cblxuICAgIGxlbmd0aCA9IE1hdGgubWluKHRoaXMubGVuZ3RoLCB0aGF0Lmxlbmd0aCk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGkgaW4gdGhpcykge1xuICAgICAgICAgICAgaWYgKCEoaSBpbiB0aGF0KSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGhzID0gdGhpc1tpXTtcbiAgICAgICAgICAgICAgICByaHMgPSB0aGF0W2ldO1xuICAgICAgICAgICAgICAgIHJlbGF0aXZlID0gY29tcGFyZShsaHMsIHJocyk7XG4gICAgICAgICAgICAgICAgaWYgKHJlbGF0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWxhdGl2ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoaSBpbiB0aGF0KSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmxlbmd0aCAtIHRoYXQubGVuZ3RoO1xufSk7XG5cbmRlZmluZShcImVxdWFsc1wiLCBmdW5jdGlvbiAodGhhdCwgZXF1YWxzKSB7XG4gICAgZXF1YWxzID0gZXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgdmFyIGkgPSAwO1xuICAgIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aDtcbiAgICB2YXIgbGVmdDtcbiAgICB2YXIgcmlnaHQ7XG5cbiAgICBpZiAodGhpcyA9PT0gdGhhdCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKCF0aGF0IHx8ICFBcnJheS5pc0FycmF5KHRoYXQpKSB7XG4gICAgICAgIHJldHVybiBHZW5lcmljT3JkZXIucHJvdG90eXBlLmVxdWFscy5jYWxsKHRoaXMsIHRoYXQpO1xuICAgIH1cblxuICAgIGlmIChsZW5ndGggIT09IHRoYXQubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKDsgaSA8IGxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBpZiAoaSBpbiB0aGlzKSB7XG4gICAgICAgICAgICAgICAgaWYgKCEoaSBpbiB0aGF0KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxlZnQgPSB0aGlzW2ldO1xuICAgICAgICAgICAgICAgIHJpZ2h0ID0gdGhhdFtpXTtcbiAgICAgICAgICAgICAgICBpZiAoIWVxdWFscyhsZWZ0LCByaWdodCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgaW4gdGhhdCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufSk7XG5cbmRlZmluZShcImNsb25lXCIsIGZ1bmN0aW9uIChkZXB0aCwgbWVtbykge1xuICAgIGlmIChkZXB0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlcHRoID0gSW5maW5pdHk7XG4gICAgfSBlbHNlIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgbWVtbyA9IG1lbW8gfHwgbmV3IFdlYWtNYXAoKTtcbiAgICB2YXIgY2xvbmUgPSBbXTtcbiAgICBmb3IgKHZhciBpIGluIHRoaXMpIHtcbiAgICAgICAgaWYgKE9iamVjdC5vd25zKHRoaXMsIGkpKSB7XG4gICAgICAgICAgICBjbG9uZVtpXSA9IE9iamVjdC5jbG9uZSh0aGlzW2ldLCBkZXB0aCAtIDEsIG1lbW8pO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gY2xvbmU7XG59KTtcblxuZGVmaW5lKFwiaXRlcmF0ZVwiLCBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICAgIHJldHVybiBuZXcgQXJyYXlJdGVyYXRvcih0aGlzLCBzdGFydCwgZW5kKTtcbn0pO1xuXG5kZWZpbmUoXCJJdGVyYXRvclwiLCBBcnJheUl0ZXJhdG9yKTtcblxuZnVuY3Rpb24gQXJyYXlJdGVyYXRvcihhcnJheSwgc3RhcnQsIGVuZCkge1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbiAgICB0aGlzLnN0YXJ0ID0gc3RhcnQgPT0gbnVsbCA/IDAgOiBzdGFydDtcbiAgICB0aGlzLmVuZCA9IGVuZDtcbn07XG5cbkFycmF5SXRlcmF0b3IucHJvdG90eXBlLm5leHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuc3RhcnQgPT09ICh0aGlzLmVuZCA9PSBudWxsID8gdGhpcy5hcnJheS5sZW5ndGggOiB0aGlzLmVuZCkpIHtcbiAgICAgICAgdGhyb3cgU3RvcEl0ZXJhdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5hcnJheVt0aGlzLnN0YXJ0KytdO1xuICAgIH1cbn07XG5cbiIsIlxubW9kdWxlLmV4cG9ydHMgPSBGdW5jdGlvbjtcblxuLyoqXG4gICAgQSB1dGlsaXR5IHRvIHJlZHVjZSB1bm5lY2Vzc2FyeSBhbGxvY2F0aW9ucyBvZiA8Y29kZT5mdW5jdGlvbiAoKSB7fTwvY29kZT5cbiAgICBpbiBpdHMgbWFueSBjb2xvcmZ1bCB2YXJpYXRpb25zLiAgSXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zXG4gICAgPGNvZGU+dW5kZWZpbmVkPC9jb2RlPiB0aHVzIG1ha2VzIGEgc3VpdGFibGUgZGVmYXVsdCBpbiBzb21lIGNpcmN1bXN0YW5jZXMuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6RnVuY3Rpb24ubm9vcFxuKi9cbkZ1bmN0aW9uLm5vb3AgPSBmdW5jdGlvbiAoKSB7XG59O1xuXG4vKipcbiAgICBBIHV0aWxpdHkgdG8gcmVkdWNlIHVubmVjZXNzYXJ5IGFsbG9jYXRpb25zIG9mIDxjb2RlPmZ1bmN0aW9uICh4KSB7cmV0dXJuXG4gICAgeH08L2NvZGU+IGluIGl0cyBtYW55IGNvbG9yZnVsIGJ1dCB1bHRpbWF0ZWx5IHdhc3RlZnVsIHBhcmFtZXRlciBuYW1lXG4gICAgdmFyaWF0aW9ucy5cblxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpGdW5jdGlvbi5pZGVudGl0eVxuICAgIEBwYXJhbSB7QW55fSBhbnkgdmFsdWVcbiAgICBAcmV0dXJucyB7QW55fSB0aGF0IHZhbHVlXG4qL1xuRnVuY3Rpb24uaWRlbnRpdHkgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG59O1xuXG4vKipcbiAgICBBIHV0aWxpdHkgZm9yIGNyZWF0aW5nIGEgY29tcGFyYXRvciBmdW5jdGlvbiBmb3IgYSBwYXJ0aWN1bGFyIGFzcGVjdCBvZiBhXG4gICAgZmlndXJhdGl2ZSBjbGFzcyBvZiBvYmplY3RzLlxuXG4gICAgQGZ1bmN0aW9uIGV4dGVybmFsOkZ1bmN0aW9uLmJ5XG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gcmVsYXRpb24gQSBmdW5jdGlvbiB0aGF0IGFjY2VwdHMgYSB2YWx1ZSBhbmQgcmV0dXJucyBhXG4gICAgY29ycmVzcG9uZGluZyB2YWx1ZSB0byB1c2UgYXMgYSByZXByZXNlbnRhdGl2ZSB3aGVuIHNvcnRpbmcgdGhhdCBvYmplY3QuXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gY29tcGFyZSBhbiBhbHRlcm5hdGUgY29tcGFyYXRvciBmb3IgY29tcGFyaW5nIHRoZVxuICAgIHJlcHJlc2VudGVkIHZhbHVlcy4gIFRoZSBkZWZhdWx0IGlzIDxjb2RlPk9iamVjdC5jb21wYXJlPC9jb2RlPiwgd2hpY2hcbiAgICBkb2VzIGEgZGVlcCwgdHlwZS1zZW5zaXRpdmUsIHBvbHltb3JwaGljIGNvbXBhcmlzb24uXG4gICAgQHJldHVybnMge0Z1bmN0aW9ufSBhIGNvbXBhcmF0b3IgdGhhdCBoYXMgYmVlbiBhbm5vdGF0ZWQgd2l0aFxuICAgIDxjb2RlPmJ5PC9jb2RlPiBhbmQgPGNvZGU+Y29tcGFyZTwvY29kZT4gcHJvcGVydGllcyBzb1xuICAgIDxjb2RlPnNvcnRlZDwvY29kZT4gY2FuIHBlcmZvcm0gYSB0cmFuc2Zvcm0gdGhhdCByZWR1Y2VzIHRoZSBuZWVkIHRvIGNhbGxcbiAgICA8Y29kZT5ieTwvY29kZT4gb24gZWFjaCBzb3J0ZWQgb2JqZWN0IHRvIGp1c3Qgb25jZS5cbiAqL1xuRnVuY3Rpb24uYnkgPSBmdW5jdGlvbiAoYnkgLCBjb21wYXJlKSB7XG4gICAgY29tcGFyZSA9IGNvbXBhcmUgfHwgT2JqZWN0LmNvbXBhcmU7XG4gICAgYnkgPSBieSB8fCBGdW5jdGlvbi5pZGVudGl0eTtcbiAgICB2YXIgY29tcGFyZUJ5ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgcmV0dXJuIGNvbXBhcmUoYnkoYSksIGJ5KGIpKTtcbiAgICB9O1xuICAgIGNvbXBhcmVCeS5jb21wYXJlID0gY29tcGFyZTtcbiAgICBjb21wYXJlQnkuYnkgPSBieTtcbiAgICByZXR1cm4gY29tcGFyZUJ5O1xufTtcblxuLy8gVE9ETyBkb2N1bWVudFxuRnVuY3Rpb24uZ2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgICAgIHJldHVybiBPYmplY3QuZ2V0KG9iamVjdCwga2V5KTtcbiAgICB9O1xufTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXZWFrTWFwID0gcmVxdWlyZShcIndlYWstbWFwXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IE9iamVjdDtcblxuLypcbiAgICBCYXNlZCBpbiBwYXJ0IG9uIGV4dHJhcyBmcm9tIE1vdG9yb2xhIE1vYmlsaXR54oCZcyBNb250YWdlXG4gICAgQ29weXJpZ2h0IChjKSAyMDEyLCBNb3Rvcm9sYSBNb2JpbGl0eSBMTEMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gICAgMy1DbGF1c2UgQlNEIExpY2Vuc2VcbiAgICBodHRwczovL2dpdGh1Yi5jb20vbW90b3JvbGEtbW9iaWxpdHkvbW9udGFnZS9ibG9iL21hc3Rlci9MSUNFTlNFLm1kXG4qL1xuXG4vKipcbiAgICBEZWZpbmVzIGV4dGVuc2lvbnMgdG8gaW50cmluc2ljIDxjb2RlPk9iamVjdDwvY29kZT4uXG4gICAgQHNlZSBbT2JqZWN0IGNsYXNzXXtAbGluayBleHRlcm5hbDpPYmplY3R9XG4qL1xuXG4vKipcbiAgICBBIHV0aWxpdHkgb2JqZWN0IHRvIGF2b2lkIHVubmVjZXNzYXJ5IGFsbG9jYXRpb25zIG9mIGFuIGVtcHR5IG9iamVjdFxuICAgIDxjb2RlPnt9PC9jb2RlPi4gIFRoaXMgb2JqZWN0IGlzIGZyb3plbiBzbyBpdCBpcyBzYWZlIHRvIHNoYXJlLlxuXG4gICAgQG9iamVjdCBleHRlcm5hbDpPYmplY3QuZW1wdHlcbiovXG5PYmplY3QuZW1wdHkgPSBPYmplY3QuZnJlZXplKE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXG4vKipcbiAgICBSZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIHZhbHVlIGlzIGFuIG9iamVjdCwgYXMgb3Bwb3NlZCB0byBhIHZhbHVlLlxuICAgIFVuYm94ZWQgbnVtYmVycywgc3RyaW5ncywgdHJ1ZSwgZmFsc2UsIHVuZGVmaW5lZCwgYW5kIG51bGwgYXJlIG5vdFxuICAgIG9iamVjdHMuICBBcnJheXMgYXJlIG9iamVjdHMuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmlzT2JqZWN0XG4gICAgQHBhcmFtIHtBbnl9IHZhbHVlXG4gICAgQHJldHVybnMge0Jvb2xlYW59IHdoZXRoZXIgdGhlIGdpdmVuIHZhbHVlIGlzIGFuIG9iamVjdFxuKi9cbk9iamVjdC5pc09iamVjdCA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0KG9iamVjdCkgPT09IG9iamVjdDtcbn07XG5cbi8qKlxuICAgIFJldHVybnMgdGhlIHZhbHVlIG9mIGFuIGFueSB2YWx1ZSwgcGFydGljdWxhcmx5IG9iamVjdHMgdGhhdFxuICAgIGltcGxlbWVudCA8Y29kZT52YWx1ZU9mPC9jb2RlPi5cblxuICAgIDxwPk5vdGUgdGhhdCwgdW5saWtlIHRoZSBwcmVjZWRlbnQgb2YgbWV0aG9kcyBsaWtlXG4gICAgPGNvZGU+T2JqZWN0LmVxdWFsczwvY29kZT4gYW5kIDxjb2RlPk9iamVjdC5jb21wYXJlPC9jb2RlPiB3b3VsZCBzdWdnZXN0LFxuICAgIHRoaXMgbWV0aG9kIGlzIG5hbWVkIDxjb2RlPk9iamVjdC5nZXRWYWx1ZU9mPC9jb2RlPiBpbnN0ZWFkIG9mXG4gICAgPGNvZGU+dmFsdWVPZjwvY29kZT4uICBUaGlzIGlzIGEgZGVsaWNhdGUgaXNzdWUsIGJ1dCB0aGUgYmFzaXMgb2YgdGhpc1xuICAgIGRlY2lzaW9uIGlzIHRoYXQgdGhlIEphdmFTY3JpcHQgcnVudGltZSB3b3VsZCBiZSBmYXIgbW9yZSBsaWtlbHkgdG9cbiAgICBhY2NpZGVudGFsbHkgY2FsbCB0aGlzIG1ldGhvZCB3aXRoIG5vIGFyZ3VtZW50cywgYXNzdW1pbmcgdGhhdCBpdCB3b3VsZFxuICAgIHJldHVybiB0aGUgdmFsdWUgb2YgPGNvZGU+T2JqZWN0PC9jb2RlPiBpdHNlbGYgaW4gdmFyaW91cyBzaXR1YXRpb25zLFxuICAgIHdoZXJlYXMgPGNvZGU+T2JqZWN0LmVxdWFscyhPYmplY3QsIG51bGwpPC9jb2RlPiBwcm90ZWN0cyBhZ2FpbnN0IHRoaXMgY2FzZVxuICAgIGJ5IG5vdGluZyB0aGF0IDxjb2RlPk9iamVjdDwvY29kZT4gb3ducyB0aGUgPGNvZGU+ZXF1YWxzPC9jb2RlPiBwcm9wZXJ0eVxuICAgIGFuZCB0aGVyZWZvcmUgZG9lcyBub3QgZGVsZWdhdGUgdG8gaXQuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmdldFZhbHVlT2ZcbiAgICBAcGFyYW0ge0FueX0gdmFsdWUgYSB2YWx1ZSBvciBvYmplY3Qgd3JhcHBpbmcgYSB2YWx1ZVxuICAgIEByZXR1cm5zIHtBbnl9IHRoZSBwcmltaXRpdmUgdmFsdWUgb2YgdGhhdCBvYmplY3QsIGlmIG9uZSBleGlzdHMsIG9yIHBhc3Nlc1xuICAgIHRoZSB2YWx1ZSB0aHJvdWdoXG4qL1xuT2JqZWN0LmdldFZhbHVlT2YgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICBpZiAoT2JqZWN0LmNhbih2YWx1ZSwgXCJ2YWx1ZU9mXCIpKSB7XG4gICAgICAgIHZhbHVlID0gdmFsdWUudmFsdWVPZigpO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59O1xuXG52YXIgaGFzaE1hcCA9IG5ldyBXZWFrTWFwKCk7XG5PYmplY3QuaGFzaCA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICBpZiAoT2JqZWN0LmNhbihvYmplY3QsIFwiaGFzaFwiKSkge1xuICAgICAgICByZXR1cm4gXCJcIiArIG9iamVjdC5oYXNoKCk7XG4gICAgfSBlbHNlIGlmIChPYmplY3Qob2JqZWN0KSA9PT0gb2JqZWN0KSB7XG4gICAgICAgIGlmICghaGFzaE1hcC5oYXMob2JqZWN0KSkge1xuICAgICAgICAgICAgaGFzaE1hcC5zZXQob2JqZWN0LCBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhhc2hNYXAuZ2V0KG9iamVjdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFwiXCIgKyBvYmplY3Q7XG4gICAgfVxufTtcblxuLyoqXG4gICAgQSBzaG9ydGhhbmQgZm9yIDxjb2RlPk9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsXG4gICAga2V5KTwvY29kZT4uICBSZXR1cm5zIHdoZXRoZXIgdGhlIG9iamVjdCBvd25zIGEgcHJvcGVydHkgZm9yIHRoZSBnaXZlbiBrZXkuXG4gICAgSXQgZG9lcyBub3QgY29uc3VsdCB0aGUgcHJvdG90eXBlIGNoYWluIGFuZCB3b3JrcyBmb3IgYW55IHN0cmluZyAoaW5jbHVkaW5nXG4gICAgXCJoYXNPd25Qcm9wZXJ0eVwiKSBleGNlcHQgXCJfX3Byb3RvX19cIi5cblxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3Qub3duc1xuICAgIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAgICBAcGFyYW0ge1N0cmluZ30ga2V5XG4gICAgQHJldHVybnMge0Jvb2xlYW59IHdoZXRoZXIgdGhlIG9iamVjdCBvd25zIGEgcHJvcGVydHkgd2ZvciB0aGUgZ2l2ZW4ga2V5LlxuKi9cbnZhciBvd25zID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcbk9iamVjdC5vd25zID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgcmV0dXJuIG93bnMuY2FsbChvYmplY3QsIGtleSk7XG59O1xuXG4vKipcbiAgICBSZXR1cm5zIHdoZXRoZXIgYSB2YWx1ZSBpbXBsZW1lbnRzIGEgcGFydGljdWxhciBkdWNrLXR5cGUgbWV0aG9kLlxuXG4gICAgPHA+VG8gcXVhbGlmeSBhcyBhIGR1Y2stdHlwZSBtZXRob2QsIHRoZSB2YWx1ZSBpbiBxdWVzdGlvbiBtdXN0IGhhdmUgYVxuICAgIG1ldGhvZCBieSB0aGUgZ2l2ZW4gbmFtZSBvbiB0aGUgcHJvdG90eXBlIGNoYWluLiAgVG8gZGlzdGluZ3Vpc2ggaXQgZnJvbVxuICAgIGEgcHJvcGVydHkgb2YgYW4gb2JqZWN0IGxpdGVyYWwsIHRoZSBwcm9wZXJ0eSBtdXN0IG5vdCBiZSBvd25lZCBieSB0aGVcbiAgICBvYmplY3QgZGlyZWN0bHkuXG5cbiAgICA8cD5BIHZhbHVlIHRoYXQgaW1wbGVtZW50cyBhIG1ldGhvZCBpcyBub3QgbmVjZXNzYXJpbHkgYW4gb2JqZWN0LCBmb3JcbiAgICBleGFtcGxlLCBudW1iZXJzIGltcGxlbWVudCA8Y29kZT52YWx1ZU9mPC9jb2RlPiwgc28gdGhpcyBpcyBmdW5jdGlvblxuICAgIGRvZXMgbm90IGltcGx5IDxjb2RlPk9iamVjdC5pc09iamVjdDwvY29kZT4gb2YgdGhlIHNhbWUgdmFsdWUuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmNhblxuICAgIEBwYXJhbSB7QW55fSB2YWx1ZSBhIHZhbHVlXG4gICAgQHBhcmFtIHtTdHJpbmd9IG5hbWUgYSBtZXRob2QgbmFtZVxuICAgIEByZXR1cm5zIHtCb29sZWFufSB3aGV0aGVyIHRoZSBnaXZlbiB2YWx1ZSBpbXBsZW1lbnRzIHRoZSBnaXZlbiBtZXRob2RcblxuKi9cbk9iamVjdC5jYW4gPSBmdW5jdGlvbiAob2JqZWN0LCBuYW1lKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgb2JqZWN0ICE9IG51bGwgJiYgLy8gZmFsc2Ugb25seSBmb3IgbnVsbCAqYW5kKiB1bmRlZmluZWRcbiAgICAgICAgdHlwZW9mIG9iamVjdFtuYW1lXSA9PT0gXCJmdW5jdGlvblwiICYmXG4gICAgICAgICFvd25zLmNhbGwob2JqZWN0LCBuYW1lKVxuICAgICk7XG59O1xuXG4vKipcbiAgICBBIHV0aWxpdHkgdGhhdCBpcyBsaWtlIE9iamVjdC5vd25zIGJ1dCBpcyBhbHNvIHVzZWZ1bCBmb3IgZmluZGluZ1xuICAgIHByb3BlcnRpZXMgb24gdGhlIHByb3RvdHlwZSBjaGFpbiwgcHJvdmlkZWQgdGhhdCB0aGV5IGRvIG5vdCByZWZlciB0b1xuICAgIG1ldGhvZHMgb24gdGhlIE9iamVjdCBwcm90b3R5cGUuICBXb3JrcyBmb3IgYWxsIHN0cmluZ3MgZXhjZXB0IFwiX19wcm90b19fXCIuXG5cbiAgICA8cD5BbHRlcm5hdGVseSwgeW91IGNvdWxkIHVzZSB0aGUgXCJpblwiIG9wZXJhdG9yIGFzIGxvbmcgYXMgdGhlIG9iamVjdFxuICAgIGRlc2NlbmRzIGZyb20gXCJudWxsXCIgaW5zdGVhZCBvZiB0aGUgT2JqZWN0LnByb3RvdHlwZSwgYXMgd2l0aFxuICAgIDxjb2RlPk9iamVjdC5jcmVhdGUobnVsbCk8L2NvZGU+LiAgSG93ZXZlcixcbiAgICA8Y29kZT5PYmplY3QuY3JlYXRlKG51bGwpPC9jb2RlPiBvbmx5IHdvcmtzIGluIGZ1bGx5IGNvbXBsaWFudCBFY21hU2NyaXB0IDVcbiAgICBKYXZhU2NyaXB0IGVuZ2luZXMgYW5kIGNhbm5vdCBiZSBmYWl0aGZ1bGx5IHNoaW1tZWQuXG5cbiAgICA8cD5JZiB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGFuIGluc3RhbmNlIG9mIGEgdHlwZSB0aGF0IGltcGxlbWVudHMgYSBtZXRob2RcbiAgICBuYW1lZCBcImhhc1wiLCB0aGlzIGZ1bmN0aW9uIGRlZmVycyB0byB0aGUgY29sbGVjdGlvbiwgc28gdGhpcyBtZXRob2QgY2FuIGJlXG4gICAgdXNlZCB0byBnZW5lcmljYWxseSBoYW5kbGUgb2JqZWN0cywgYXJyYXlzLCBvciBvdGhlciBjb2xsZWN0aW9ucy4gIEluIHRoYXRcbiAgICBjYXNlLCB0aGUgZG9tYWluIG9mIHRoZSBrZXkgZGVwZW5kcyBvbiB0aGUgaW5zdGFuY2UuXG5cbiAgICBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAgQHBhcmFtIHtTdHJpbmd9IGtleVxuICAgIEByZXR1cm5zIHtCb29sZWFufSB3aGV0aGVyIHRoZSBvYmplY3QsIG9yIGFueSBvZiBpdHMgcHJvdG90eXBlcyBleGNlcHRcbiAgICA8Y29kZT5PYmplY3QucHJvdG90eXBlPC9jb2RlPlxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3QuaGFzXG4qL1xuT2JqZWN0LmhhcyA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk9iamVjdC5oYXMgY2FuJ3QgYWNjZXB0IG5vbi1vYmplY3Q6IFwiICsgdHlwZW9mIG9iamVjdCk7XG4gICAgfVxuICAgIC8vIGZvcndhcmQgdG8gbWFwcGVkIGNvbGxlY3Rpb25zIHRoYXQgaW1wbGVtZW50IFwiaGFzXCJcbiAgICBpZiAoT2JqZWN0LmNhbihvYmplY3QsIFwiaGFzXCIpKSB7XG4gICAgICAgIHJldHVybiBvYmplY3QuaGFzKGtleSk7XG4gICAgLy8gb3RoZXJ3aXNlIHJlcG9ydCB3aGV0aGVyIHRoZSBrZXkgaXMgb24gdGhlIHByb3RvdHlwZSBjaGFpbixcbiAgICAvLyBhcyBsb25nIGFzIGl0IGlzIG5vdCBvbmUgb2YgdGhlIG1ldGhvZHMgb24gb2JqZWN0LnByb3RvdHlwZVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGtleSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm4ga2V5IGluIG9iamVjdCAmJiBvYmplY3Rba2V5XSAhPT0gT2JqZWN0LnByb3RvdHlwZVtrZXldO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIktleSBtdXN0IGJlIGEgc3RyaW5nIGZvciBPYmplY3QuaGFzIG9uIHBsYWluIG9iamVjdHNcIik7XG4gICAgfVxufTtcblxuLyoqXG4gICAgR2V0cyB0aGUgdmFsdWUgZm9yIGEgY29ycmVzcG9uZGluZyBrZXkgZnJvbSBhbiBvYmplY3QuXG5cbiAgICA8cD5Vc2VzIE9iamVjdC5oYXMgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdGhlcmUgaXMgYSBjb3JyZXNwb25kaW5nIHZhbHVlIGZvclxuICAgIHRoZSBnaXZlbiBrZXkuICBBcyBzdWNoLCA8Y29kZT5PYmplY3QuZ2V0PC9jb2RlPiBpcyBjYXBhYmxlIG9mIHJldHJpdmluZ1xuICAgIHZhbHVlcyBmcm9tIHRoZSBwcm90b3R5cGUgY2hhaW4gYXMgbG9uZyBhcyB0aGV5IGFyZSBub3QgZnJvbSB0aGVcbiAgICA8Y29kZT5PYmplY3QucHJvdG90eXBlPC9jb2RlPi5cblxuICAgIDxwPklmIHRoZXJlIGlzIG5vIGNvcnJlc3BvbmRpbmcgdmFsdWUsIHJldHVybnMgdGhlIGdpdmVuIGRlZmF1bHQsIHdoaWNoIG1heVxuICAgIGJlIDxjb2RlPnVuZGVmaW5lZDwvY29kZT4uXG5cbiAgICA8cD5JZiB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGFuIGluc3RhbmNlIG9mIGEgdHlwZSB0aGF0IGltcGxlbWVudHMgYSBtZXRob2RcbiAgICBuYW1lZCBcImdldFwiLCB0aGlzIGZ1bmN0aW9uIGRlZmVycyB0byB0aGUgY29sbGVjdGlvbiwgc28gdGhpcyBtZXRob2QgY2FuIGJlXG4gICAgdXNlZCB0byBnZW5lcmljYWxseSBoYW5kbGUgb2JqZWN0cywgYXJyYXlzLCBvciBvdGhlciBjb2xsZWN0aW9ucy4gIEluIHRoYXRcbiAgICBjYXNlLCB0aGUgZG9tYWluIG9mIHRoZSBrZXkgZGVwZW5kcyBvbiB0aGUgaW1wbGVtZW50YXRpb24uICBGb3IgYSBgTWFwYCxcbiAgICBmb3IgZXhhbXBsZSwgdGhlIGtleSBtaWdodCBiZSBhbnkgb2JqZWN0LlxuXG4gICAgQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgIEBwYXJhbSB7U3RyaW5nfSBrZXlcbiAgICBAcGFyYW0ge0FueX0gdmFsdWUgYSBkZWZhdWx0IHRvIHJldHVybiwgPGNvZGU+dW5kZWZpbmVkPC9jb2RlPiBpZiBvbWl0dGVkXG4gICAgQHJldHVybnMge0FueX0gdmFsdWUgZm9yIGtleSwgb3IgZGVmYXVsdCB2YWx1ZVxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3QuZ2V0XG4qL1xuT2JqZWN0LmdldCA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gXCJvYmplY3RcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJPYmplY3QuZ2V0IGNhbid0IGFjY2VwdCBub24tb2JqZWN0OiBcIiArIHR5cGVvZiBvYmplY3QpO1xuICAgIH1cbiAgICAvLyBmb3J3YXJkIHRvIG1hcHBlZCBjb2xsZWN0aW9ucyB0aGF0IGltcGxlbWVudCBcImdldFwiXG4gICAgaWYgKE9iamVjdC5jYW4ob2JqZWN0LCBcImdldFwiKSkge1xuICAgICAgICByZXR1cm4gb2JqZWN0LmdldChrZXksIHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5oYXMob2JqZWN0LCBrZXkpKSB7XG4gICAgICAgIHJldHVybiBvYmplY3Rba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxufTtcblxuLyoqXG4gICAgU2V0cyB0aGUgdmFsdWUgZm9yIGEgZ2l2ZW4ga2V5IG9uIGFuIG9iamVjdC5cblxuICAgIDxwPklmIHRoZSBnaXZlbiBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgYSB0eXBlIHRoYXQgaW1wbGVtZW50cyBhIG1ldGhvZFxuICAgIG5hbWVkIFwic2V0XCIsIHRoaXMgZnVuY3Rpb24gZGVmZXJzIHRvIHRoZSBjb2xsZWN0aW9uLCBzbyB0aGlzIG1ldGhvZCBjYW4gYmVcbiAgICB1c2VkIHRvIGdlbmVyaWNhbGx5IGhhbmRsZSBvYmplY3RzLCBhcnJheXMsIG9yIG90aGVyIGNvbGxlY3Rpb25zLiAgQXMgc3VjaCxcbiAgICB0aGUga2V5IGRvbWFpbiB2YXJpZXMgYnkgdGhlIG9iamVjdCB0eXBlLlxuXG4gICAgQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgIEBwYXJhbSB7U3RyaW5nfSBrZXlcbiAgICBAcGFyYW0ge0FueX0gdmFsdWVcbiAgICBAcmV0dXJucyA8Y29kZT51bmRlZmluZWQ8L2NvZGU+XG4gICAgQGZ1bmN0aW9uIGV4dGVybmFsOk9iamVjdC5zZXRcbiovXG5PYmplY3Quc2V0ID0gZnVuY3Rpb24gKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICAgIGlmIChPYmplY3QuY2FuKG9iamVjdCwgXCJzZXRcIikpIHtcbiAgICAgICAgb2JqZWN0LnNldChrZXksIHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3Rba2V5XSA9IHZhbHVlO1xuICAgIH1cbn07XG5cbk9iamVjdC5hZGRFYWNoID0gZnVuY3Rpb24gKHRhcmdldCwgc291cmNlKSB7XG4gICAgaWYgKCFzb3VyY2UpIHtcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5jYW4oc291cmNlLCBcImZvckVhY2hcIikpIHtcbiAgICAgICAgLy8gY29weSBtYXAtYWxpa2VzXG4gICAgICAgIGlmICh0eXBlb2Ygc291cmNlLmtleXMgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgc291cmNlLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIC8vIGl0ZXJhdGUga2V5IHZhbHVlIHBhaXJzIG9mIG90aGVyIGl0ZXJhYmxlc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc291cmNlLmZvckVhY2goZnVuY3Rpb24gKHBhaXIpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRbcGFpclswXV0gPSBwYWlyWzFdO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjb3B5IG90aGVyIG9iamVjdHMgYXMgbWFwLWFsaWtlc1xuICAgICAgICBPYmplY3Qua2V5cyhzb3VyY2UpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgdGFyZ2V0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG59O1xuXG4vKipcbiAgICBJdGVyYXRlcyBvdmVyIHRoZSBvd25lZCBwcm9wZXJ0aWVzIG9mIGFuIG9iamVjdC5cblxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3QuZm9yRWFjaFxuICAgIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgYW4gb2JqZWN0IHRvIGl0ZXJhdGUuXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgYSBmdW5jdGlvbiB0byBjYWxsIGZvciBldmVyeSBrZXkgYW5kIHZhbHVlXG4gICAgcGFpciBpbiB0aGUgb2JqZWN0LiAgUmVjZWl2ZXMgPGNvZGU+dmFsdWU8L2NvZGU+LCA8Y29kZT5rZXk8L2NvZGU+LFxuICAgIGFuZCA8Y29kZT5vYmplY3Q8L2NvZGU+IGFzIGFyZ3VtZW50cy5cbiAgICBAcGFyYW0ge09iamVjdH0gdGhpc3AgdGhlIDxjb2RlPnRoaXM8L2NvZGU+IHRvIHBhc3MgdGhyb3VnaCB0byB0aGVcbiAgICBjYWxsYmFja1xuKi9cbk9iamVjdC5mb3JFYWNoID0gZnVuY3Rpb24gKG9iamVjdCwgY2FsbGJhY2ssIHRoaXNwKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzcCwgb2JqZWN0W2tleV0sIGtleSwgb2JqZWN0KTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICAgIEl0ZXJhdGVzIG92ZXIgdGhlIG93bmVkIHByb3BlcnRpZXMgb2YgYSBtYXAsIGNvbnN0cnVjdGluZyBhIG5ldyBhcnJheSBvZlxuICAgIG1hcHBlZCB2YWx1ZXMuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0Lm1hcFxuICAgIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgYW4gb2JqZWN0IHRvIGl0ZXJhdGUuXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgYSBmdW5jdGlvbiB0byBjYWxsIGZvciBldmVyeSBrZXkgYW5kIHZhbHVlXG4gICAgcGFpciBpbiB0aGUgb2JqZWN0LiAgUmVjZWl2ZXMgPGNvZGU+dmFsdWU8L2NvZGU+LCA8Y29kZT5rZXk8L2NvZGU+LFxuICAgIGFuZCA8Y29kZT5vYmplY3Q8L2NvZGU+IGFzIGFyZ3VtZW50cy5cbiAgICBAcGFyYW0ge09iamVjdH0gdGhpc3AgdGhlIDxjb2RlPnRoaXM8L2NvZGU+IHRvIHBhc3MgdGhyb3VnaCB0byB0aGVcbiAgICBjYWxsYmFja1xuICAgIEByZXR1cm5zIHtBcnJheX0gdGhlIHJlc3BlY3RpdmUgdmFsdWVzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFjayBmb3IgZWFjaFxuICAgIGl0ZW0gaW4gdGhlIG9iamVjdC5cbiovXG5PYmplY3QubWFwID0gZnVuY3Rpb24gKG9iamVjdCwgY2FsbGJhY2ssIHRoaXNwKSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKG9iamVjdCkubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwodGhpc3AsIG9iamVjdFtrZXldLCBrZXksIG9iamVjdCk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAgICBSZXR1cm5zIHRoZSB2YWx1ZXMgZm9yIG93bmVkIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0LlxuXG4gICAgQGZ1bmN0aW9uIGV4dGVybmFsOk9iamVjdC5tYXBcbiAgICBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAgQHJldHVybnMge0FycmF5fSB0aGUgcmVzcGVjdGl2ZSB2YWx1ZSBmb3IgZWFjaCBvd25lZCBwcm9wZXJ0eSBvZiB0aGVcbiAgICBvYmplY3QuXG4qL1xuT2JqZWN0LnZhbHVlcyA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0Lm1hcChvYmplY3QsIEZ1bmN0aW9uLmlkZW50aXR5KTtcbn07XG5cbi8vIFRPRE8gaW5saW5lIGRvY3VtZW50IGNvbmNhdFxuT2JqZWN0LmNvbmNhdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb2JqZWN0ID0ge307XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgT2JqZWN0LmFkZEVhY2gob2JqZWN0LCBhcmd1bWVudHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxuT2JqZWN0LmZyb20gPSBPYmplY3QuY29uY2F0O1xuXG4vKipcbiAgICBSZXR1cm5zIHdoZXRoZXIgdHdvIHZhbHVlcyBhcmUgaWRlbnRpY2FsLiAgQW55IHZhbHVlIGlzIGlkZW50aWNhbCB0byBpdHNlbGZcbiAgICBhbmQgb25seSBpdHNlbGYuICBUaGlzIGlzIG11Y2ggbW9yZSByZXN0aWN0aXZlIHRoYW4gZXF1aXZhbGVuY2UgYW5kIHN1YnRseVxuICAgIGRpZmZlcmVudCB0aGFuIHN0cmljdCBlcXVhbGl0eSwgPGNvZGU+PT09PC9jb2RlPiBiZWNhdXNlIG9mIGVkZ2UgY2FzZXNcbiAgICBpbmNsdWRpbmcgbmVnYXRpdmUgemVybyBhbmQgPGNvZGU+TmFOPC9jb2RlPi4gIElkZW50aXR5IGlzIHVzZWZ1bCBmb3JcbiAgICByZXNvbHZpbmcgY29sbGlzaW9ucyBhbW9uZyBrZXlzIGluIGEgbWFwcGluZyB3aGVyZSB0aGUgZG9tYWluIGlzIGFueSB2YWx1ZS5cbiAgICBUaGlzIG1ldGhvZCBkb2VzIG5vdCBkZWxnYXRlIHRvIGFueSBtZXRob2Qgb24gYW4gb2JqZWN0IGFuZCBjYW5ub3QgYmVcbiAgICBvdmVycmlkZGVuLlxuICAgIEBzZWUgaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9aGFybW9ueTplZ2FsXG4gICAgQHBhcmFtIHtBbnl9IHRoaXNcbiAgICBAcGFyYW0ge0FueX0gdGhhdFxuICAgIEByZXR1cm5zIHtCb29sZWFufSB3aGV0aGVyIHRoaXMgYW5kIHRoYXQgYXJlIGlkZW50aWNhbFxuICAgIEBmdW5jdGlvbiBleHRlcm5hbDpPYmplY3QuaXNcbiovXG5PYmplY3QuaXMgPSBmdW5jdGlvbiAoeCwgeSkge1xuICAgIGlmICh4ID09PSB5KSB7XG4gICAgICAgIC8vIDAgPT09IC0wLCBidXQgdGhleSBhcmUgbm90IGlkZW50aWNhbFxuICAgICAgICByZXR1cm4geCAhPT0gMCB8fCAxIC8geCA9PT0gMSAvIHk7XG4gICAgfVxuICAgIC8vIE5hTiAhPT0gTmFOLCBidXQgdGhleSBhcmUgaWRlbnRpY2FsLlxuICAgIC8vIE5hTnMgYXJlIHRoZSBvbmx5IG5vbi1yZWZsZXhpdmUgdmFsdWUsIGkuZS4sIGlmIHggIT09IHgsXG4gICAgLy8gdGhlbiB4IGlzIGEgTmFOLlxuICAgIC8vIGlzTmFOIGlzIGJyb2tlbjogaXQgY29udmVydHMgaXRzIGFyZ3VtZW50IHRvIG51bWJlciwgc29cbiAgICAvLyBpc05hTihcImZvb1wiKSA9PiB0cnVlXG4gICAgcmV0dXJuIHggIT09IHggJiYgeSAhPT0geTtcbn07XG5cbi8qKlxuICAgIFBlcmZvcm1zIGEgcG9seW1vcnBoaWMsIHR5cGUtc2Vuc2l0aXZlIGRlZXAgZXF1aXZhbGVuY2UgY29tcGFyaXNvbiBvZiBhbnlcbiAgICB0d28gdmFsdWVzLlxuXG4gICAgPHA+QXMgYSBiYXNpYyBwcmluY2lwbGUsIGFueSB2YWx1ZSBpcyBlcXVpdmFsZW50IHRvIGl0c2VsZiAoYXMgaW5cbiAgICBpZGVudGl0eSksIGFueSBib3hlZCB2ZXJzaW9uIG9mIGl0c2VsZiAoYXMgYSA8Y29kZT5uZXcgTnVtYmVyKDEwKTwvY29kZT4gaXNcbiAgICB0byAxMCksIGFuZCBhbnkgZGVlcCBjbG9uZSBvZiBpdHNlbGYuXG5cbiAgICA8cD5FcXVpdmFsZW5jZSBoYXMgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuXG4gICAgPHVsPlxuICAgICAgICA8bGk+PHN0cm9uZz5wb2x5bW9ycGhpYzo8L3N0cm9uZz5cbiAgICAgICAgICAgIElmIHRoZSBnaXZlbiBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgYSB0eXBlIHRoYXQgaW1wbGVtZW50cyBhXG4gICAgICAgICAgICBtZXRob2RzIG5hbWVkIFwiZXF1YWxzXCIsIHRoaXMgZnVuY3Rpb24gZGVmZXJzIHRvIHRoZSBtZXRob2QuICBTbyxcbiAgICAgICAgICAgIHRoaXMgZnVuY3Rpb24gY2FuIHNhZmVseSBjb21wYXJlIGFueSB2YWx1ZXMgcmVnYXJkbGVzcyBvZiB0eXBlLFxuICAgICAgICAgICAgaW5jbHVkaW5nIHVuZGVmaW5lZCwgbnVsbCwgbnVtYmVycywgc3RyaW5ncywgYW55IHBhaXIgb2Ygb2JqZWN0c1xuICAgICAgICAgICAgd2hlcmUgZWl0aGVyIGltcGxlbWVudHMgXCJlcXVhbHNcIiwgb3Igb2JqZWN0IGxpdGVyYWxzIHRoYXQgbWF5IGV2ZW5cbiAgICAgICAgICAgIGNvbnRhaW4gYW4gXCJlcXVhbHNcIiBrZXkuXG4gICAgICAgIDxsaT48c3Ryb25nPnR5cGUtc2Vuc2l0aXZlOjwvc3Ryb25nPlxuICAgICAgICAgICAgSW5jb21wYXJhYmxlIHR5cGVzIGFyZSBub3QgZXF1YWwuICBObyBvYmplY3QgaXMgZXF1aXZhbGVudCB0byBhbnlcbiAgICAgICAgICAgIGFycmF5LiAgTm8gc3RyaW5nIGlzIGVxdWFsIHRvIGFueSBvdGhlciBudW1iZXIuXG4gICAgICAgIDxsaT48c3Ryb25nPmRlZXA6PC9zdHJvbmc+XG4gICAgICAgICAgICBDb2xsZWN0aW9ucyB3aXRoIGVxdWl2YWxlbnQgY29udGVudCBhcmUgZXF1aXZhbGVudCwgcmVjdXJzaXZlbHkuXG4gICAgICAgIDxsaT48c3Ryb25nPmVxdWl2YWxlbmNlOjwvc3Ryb25nPlxuICAgICAgICAgICAgSWRlbnRpY2FsIHZhbHVlcyBhbmQgb2JqZWN0cyBhcmUgZXF1aXZhbGVudCwgYnV0IHNvIGFyZSBjb2xsZWN0aW9uc1xuICAgICAgICAgICAgdGhhdCBjb250YWluIGVxdWl2YWxlbnQgY29udGVudC4gIFdoZXRoZXIgb3JkZXIgaXMgaW1wb3J0YW50IHZhcmllc1xuICAgICAgICAgICAgYnkgdHlwZS4gIEZvciBBcnJheXMgYW5kIGxpc3RzLCBvcmRlciBpcyBpbXBvcnRhbnQuICBGb3IgT2JqZWN0cyxcbiAgICAgICAgICAgIG1hcHMsIGFuZCBzZXRzLCBvcmRlciBpcyBub3QgaW1wb3J0YW50LiAgQm94ZWQgb2JqZWN0cyBhcmUgbXV0YWxseVxuICAgICAgICAgICAgZXF1aXZhbGVudCB3aXRoIHRoZWlyIHVuYm94ZWQgdmFsdWVzLCBieSB2aXJ0dWUgb2YgdGhlIHN0YW5kYXJkXG4gICAgICAgICAgICA8Y29kZT52YWx1ZU9mPC9jb2RlPiBtZXRob2QuXG4gICAgPC91bD5cbiAgICBAcGFyYW0gdGhpc1xuICAgIEBwYXJhbSB0aGF0XG4gICAgQHJldHVybnMge0Jvb2xlYW59IHdoZXRoZXIgdGhlIHZhbHVlcyBhcmUgZGVlcGx5IGVxdWl2YWxlbnRcbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmVxdWFsc1xuKi9cbk9iamVjdC5lcXVhbHMgPSBmdW5jdGlvbiAoYSwgYiwgZXF1YWxzKSB7XG4gICAgZXF1YWxzID0gZXF1YWxzIHx8IE9iamVjdC5lcXVhbHM7XG4gICAgLy8gdW5ib3ggb2JqZWN0cywgYnV0IGRvIG5vdCBjb25mdXNlIG9iamVjdCBsaXRlcmFsc1xuICAgIGEgPSBPYmplY3QuZ2V0VmFsdWVPZihhKTtcbiAgICBiID0gT2JqZWN0LmdldFZhbHVlT2YoYik7XG4gICAgaWYgKGEgPT09IGIpXG4gICAgICAgIC8vIDAgPT09IC0wLCBidXQgdGhleSBhcmUgbm90IGVxdWFsXG4gICAgICAgIHJldHVybiBhICE9PSAwIHx8IDEgLyBhID09PSAxIC8gYjtcbiAgICBpZiAoYSA9PT0gbnVsbCB8fCBiID09PSBudWxsKVxuICAgICAgICByZXR1cm4gYSA9PT0gYjtcbiAgICBpZiAoT2JqZWN0LmNhbihhLCBcImVxdWFsc1wiKSlcbiAgICAgICAgcmV0dXJuIGEuZXF1YWxzKGIsIGVxdWFscyk7XG4gICAgLy8gY29tbXV0YXRpdmVcbiAgICBpZiAoT2JqZWN0LmNhbihiLCBcImVxdWFsc1wiKSlcbiAgICAgICAgcmV0dXJuIGIuZXF1YWxzKGEsIGVxdWFscyk7XG4gICAgaWYgKHR5cGVvZiBhID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiBiID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHZhciBhUHJvdG90eXBlID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKGEpO1xuICAgICAgICB2YXIgYlByb3RvdHlwZSA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihiKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgYVByb3RvdHlwZSA9PT0gYlByb3RvdHlwZSAmJiAoXG4gICAgICAgICAgICAgICAgYVByb3RvdHlwZSA9PT0gT2JqZWN0LnByb3RvdHlwZSB8fFxuICAgICAgICAgICAgICAgIGFQcm90b3R5cGUgPT09IG51bGxcbiAgICAgICAgICAgIClcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gYSkge1xuICAgICAgICAgICAgICAgIGlmICghZXF1YWxzKGFba2V5XSwgYltrZXldKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIGIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWVxdWFscyhhW2tleV0sIGJba2V5XSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8vIE5hTiAhPT0gTmFOLCBidXQgdGhleSBhcmUgZXF1YWwuXG4gICAgLy8gTmFOcyBhcmUgdGhlIG9ubHkgbm9uLXJlZmxleGl2ZSB2YWx1ZSwgaS5lLiwgaWYgeCAhPT0geCxcbiAgICAvLyB0aGVuIHggaXMgYSBOYU4uXG4gICAgLy8gaXNOYU4gaXMgYnJva2VuOiBpdCBjb252ZXJ0cyBpdHMgYXJndW1lbnQgdG8gbnVtYmVyLCBzb1xuICAgIC8vIGlzTmFOKFwiZm9vXCIpID0+IHRydWVcbiAgICByZXR1cm4gYSAhPT0gYSAmJiBiICE9PSBiO1xufTtcblxuLy8gQmVjYXVzZSBhIHJldHVybiB2YWx1ZSBvZiAwIGZyb20gYSBgY29tcGFyZWAgZnVuY3Rpb24gIG1heSBtZWFuIGVpdGhlclxuLy8gXCJlcXVhbHNcIiBvciBcImlzIGluY29tcGFyYWJsZVwiLCBgZXF1YWxzYCBjYW5ub3QgYmUgZGVmaW5lZCBpbiB0ZXJtcyBvZlxuLy8gYGNvbXBhcmVgLiAgSG93ZXZlciwgYGNvbXBhcmVgICpjYW4qIGJlIGRlZmluZWQgaW4gdGVybXMgb2YgYGVxdWFsc2AgYW5kXG4vLyBgbGVzc1RoYW5gLiAgQWdhaW4gaG93ZXZlciwgbW9yZSBvZnRlbiBpdCB3b3VsZCBiZSBkZXNpcmFibGUgdG8gaW1wbGVtZW50XG4vLyBhbGwgb2YgdGhlIGNvbXBhcmlzb24gZnVuY3Rpb25zIGluIHRlcm1zIG9mIGNvbXBhcmUgcmF0aGVyIHRoYW4gdGhlIG90aGVyXG4vLyB3YXkgYXJvdW5kLlxuXG4vKipcbiAgICBEZXRlcm1pbmVzIHRoZSBvcmRlciBpbiB3aGljaCBhbnkgdHdvIG9iamVjdHMgc2hvdWxkIGJlIHNvcnRlZCBieSByZXR1cm5pbmdcbiAgICBhIG51bWJlciB0aGF0IGhhcyBhbiBhbmFsb2dvdXMgcmVsYXRpb25zaGlwIHRvIHplcm8gYXMgdGhlIGxlZnQgdmFsdWUgdG9cbiAgICB0aGUgcmlnaHQuICBUaGF0IGlzLCBpZiB0aGUgbGVmdCBpcyBcImxlc3MgdGhhblwiIHRoZSByaWdodCwgdGhlIHJldHVybmVkXG4gICAgdmFsdWUgd2lsbCBiZSBcImxlc3MgdGhhblwiIHplcm8sIHdoZXJlIFwibGVzcyB0aGFuXCIgbWF5IGJlIGFueSBvdGhlclxuICAgIHRyYW5zaXRpdmUgcmVsYXRpb25zaGlwLlxuXG4gICAgPHA+QXJyYXlzIGFyZSBjb21wYXJlZCBieSB0aGUgZmlyc3QgZGl2ZXJnaW5nIHZhbHVlcywgb3IgYnkgbGVuZ3RoLlxuXG4gICAgPHA+QW55IHR3byB2YWx1ZXMgdGhhdCBhcmUgaW5jb21wYXJhYmxlIHJldHVybiB6ZXJvLiAgQXMgc3VjaCxcbiAgICA8Y29kZT5lcXVhbHM8L2NvZGU+IHNob3VsZCBub3QgYmUgaW1wbGVtZW50ZWQgd2l0aCA8Y29kZT5jb21wYXJlPC9jb2RlPlxuICAgIHNpbmNlIGluY29tcGFyYWJpbGl0eSBpcyBpbmRpc3Rpbmd1aXNoYWJsZSBmcm9tIGVxdWFsaXR5LlxuXG4gICAgPHA+U29ydHMgc3RyaW5ncyBsZXhpY29ncmFwaGljYWxseS4gIFRoaXMgaXMgbm90IHN1aXRhYmxlIGZvciBhbnlcbiAgICBwYXJ0aWN1bGFyIGludGVybmF0aW9uYWwgc2V0dGluZy4gIERpZmZlcmVudCBsb2NhbGVzIHNvcnQgdGhlaXIgcGhvbmUgYm9va3NcbiAgICBpbiB2ZXJ5IGRpZmZlcmVudCB3YXlzLCBwYXJ0aWN1bGFybHkgcmVnYXJkaW5nIGRpYWNyaXRpY3MgYW5kIGxpZ2F0dXJlcy5cblxuICAgIDxwPklmIHRoZSBnaXZlbiBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgYSB0eXBlIHRoYXQgaW1wbGVtZW50cyBhIG1ldGhvZFxuICAgIG5hbWVkIFwiY29tcGFyZVwiLCB0aGlzIGZ1bmN0aW9uIGRlZmVycyB0byB0aGUgaW5zdGFuY2UuICBUaGUgbWV0aG9kIGRvZXMgbm90XG4gICAgbmVlZCB0byBiZSBhbiBvd25lZCBwcm9wZXJ0eSB0byBkaXN0aW5ndWlzaCBpdCBmcm9tIGFuIG9iamVjdCBsaXRlcmFsIHNpbmNlXG4gICAgb2JqZWN0IGxpdGVyYWxzIGFyZSBpbmNvbXBhcmFibGUuICBVbmxpa2UgPGNvZGU+T2JqZWN0PC9jb2RlPiBob3dldmVyLFxuICAgIDxjb2RlPkFycmF5PC9jb2RlPiBpbXBsZW1lbnRzIDxjb2RlPmNvbXBhcmU8L2NvZGU+LlxuXG4gICAgQHBhcmFtIHtBbnl9IGxlZnRcbiAgICBAcGFyYW0ge0FueX0gcmlnaHRcbiAgICBAcmV0dXJucyB7TnVtYmVyfSBhIHZhbHVlIGhhdmluZyB0aGUgc2FtZSB0cmFuc2l0aXZlIHJlbGF0aW9uc2hpcCB0byB6ZXJvXG4gICAgYXMgdGhlIGxlZnQgYW5kIHJpZ2h0IHZhbHVlcy5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmNvbXBhcmVcbiovXG5PYmplY3QuY29tcGFyZSA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgLy8gdW5ib3ggb2JqZWN0cywgYnV0IGRvIG5vdCBjb25mdXNlIG9iamVjdCBsaXRlcmFsc1xuICAgIC8vIG1lcmNpZnVsbHkgaGFuZGxlcyB0aGUgRGF0ZSBjYXNlXG4gICAgYSA9IE9iamVjdC5nZXRWYWx1ZU9mKGEpO1xuICAgIGIgPSBPYmplY3QuZ2V0VmFsdWVPZihiKTtcbiAgICB2YXIgYVR5cGUgPSB0eXBlb2YgYTtcbiAgICB2YXIgYlR5cGUgPSB0eXBlb2YgYjtcbiAgICBpZiAoYSA9PT0gYilcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgaWYgKGFUeXBlICE9PSBiVHlwZSlcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgaWYgKGFUeXBlID09PSBcIm51bWJlclwiKVxuICAgICAgICByZXR1cm4gYSAtIGI7XG4gICAgaWYgKGFUeXBlID09PSBcInN0cmluZ1wiKVxuICAgICAgICByZXR1cm4gYSA8IGIgPyAtMSA6IDE7XG4gICAgICAgIC8vIHRoZSBwb3NzaWJpbGl0eSBvZiBlcXVhbGl0eSBlbGltaWF0ZWQgYWJvdmVcbiAgICBpZiAoT2JqZWN0LmNhbihhLCBcImNvbXBhcmVcIikpXG4gICAgICAgIHJldHVybiBhLmNvbXBhcmUoYik7XG4gICAgLy8gbm90IGNvbW11dGF0aXZlLCB0aGUgcmVsYXRpb25zaGlwIGlzIHJldmVyc2VkXG4gICAgaWYgKE9iamVjdC5jYW4oYiwgXCJjb21wYXJlXCIpKVxuICAgICAgICByZXR1cm4gLWIuY29tcGFyZShhKTtcbiAgICByZXR1cm4gMDtcbn07XG5cbi8qKlxuICAgIENyZWF0ZXMgYSBkZWVwIGNvcHkgb2YgYW55IHZhbHVlLiAgVmFsdWVzLCBiZWluZyBpbW11dGFibGUsIGFyZVxuICAgIHJldHVybmVkIHdpdGhvdXQgYWx0ZXJuYXRpb24uICBGb3J3YXJkcyB0byA8Y29kZT5jbG9uZTwvY29kZT4gb25cbiAgICBvYmplY3RzIGFuZCBhcnJheXMuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmNsb25lXG4gICAgQHBhcmFtIHtBbnl9IHZhbHVlIGEgdmFsdWUgdG8gY2xvbmVcbiAgICBAcGFyYW0ge051bWJlcn0gZGVwdGggYW4gb3B0aW9uYWwgdHJhdmVyc2FsIGRlcHRoLCBkZWZhdWx0cyB0byBpbmZpbml0eS5cbiAgICBBIHZhbHVlIG9mIDxjb2RlPjA8L2NvZGU+IG1lYW5zIHRvIG1ha2Ugbm8gY2xvbmUgYW5kIHJldHVybiB0aGUgdmFsdWVcbiAgICBkaXJlY3RseS5cbiAgICBAcGFyYW0ge01hcH0gbWVtbyBhbiBvcHRpb25hbCBtZW1vIG9mIGFscmVhZHkgdmlzaXRlZCBvYmplY3RzIHRvIHByZXNlcnZlXG4gICAgcmVmZXJlbmNlIGN5Y2xlcy4gIFRoZSBjbG9uZWQgb2JqZWN0IHdpbGwgaGF2ZSB0aGUgZXhhY3Qgc2FtZSBzaGFwZSBhcyB0aGVcbiAgICBvcmlnaW5hbCwgYnV0IG5vIGlkZW50aWNhbCBvYmplY3RzLiAgVGUgbWFwIG1heSBiZSBsYXRlciB1c2VkIHRvIGFzc29jaWF0ZVxuICAgIGFsbCBvYmplY3RzIGluIHRoZSBvcmlnaW5hbCBvYmplY3QgZ3JhcGggd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIG1lbWJlciBvZlxuICAgIHRoZSBjbG9uZWQgZ3JhcGguXG4gICAgQHJldHVybnMgYSBjb3B5IG9mIHRoZSB2YWx1ZVxuKi9cbk9iamVjdC5jbG9uZSA9IGZ1bmN0aW9uICh2YWx1ZSwgZGVwdGgsIG1lbW8pIHtcbiAgICB2YWx1ZSA9IE9iamVjdC5nZXRWYWx1ZU9mKHZhbHVlKTtcbiAgICBtZW1vID0gbWVtbyB8fCBuZXcgV2Vha01hcCgpO1xuICAgIGlmIChkZXB0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlcHRoID0gSW5maW5pdHk7XG4gICAgfSBlbHNlIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICAgIGlmIChPYmplY3QuaXNPYmplY3QodmFsdWUpKSB7XG4gICAgICAgIGlmICghbWVtby5oYXModmFsdWUpKSB7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmNhbih2YWx1ZSwgXCJjbG9uZVwiKSkge1xuICAgICAgICAgICAgICAgIG1lbW8uc2V0KHZhbHVlLCB2YWx1ZS5jbG9uZShkZXB0aCwgbWVtbykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvdG90eXBlID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAocHJvdG90eXBlID09PSBudWxsIHx8IHByb3RvdHlwZSA9PT0gT2JqZWN0LnByb3RvdHlwZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2xvbmUgPSBPYmplY3QuY3JlYXRlKHByb3RvdHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIG1lbW8uc2V0KHZhbHVlLCBjbG9uZSk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmVba2V5XSA9IE9iamVjdC5jbG9uZSh2YWx1ZVtrZXldLCBkZXB0aCAtIDEsIG1lbW8pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2xvbmUgXCIgKyB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vLmdldCh2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn07XG5cbi8qKlxuICAgIFJlbW92ZXMgYWxsIHByb3BlcnRpZXMgb3duZWQgYnkgdGhpcyBvYmplY3QgbWFraW5nIHRoZSBvYmplY3Qgc3VpdGFibGUgZm9yXG4gICAgcmV1c2UuXG5cbiAgICBAZnVuY3Rpb24gZXh0ZXJuYWw6T2JqZWN0LmNsZWFyXG4gICAgQHJldHVybnMgdGhpc1xuKi9cbk9iamVjdC5jbGVhciA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICBpZiAoT2JqZWN0LmNhbihvYmplY3QsIFwiY2xlYXJcIikpIHtcbiAgICAgICAgb2JqZWN0LmNsZWFyKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpLFxuICAgICAgICAgICAgaSA9IGtleXMubGVuZ3RoO1xuICAgICAgICB3aGlsZSAoaSkge1xuICAgICAgICAgICAgaS0tO1xuICAgICAgICAgICAgZGVsZXRlIG9iamVjdFtrZXlzW2ldXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxuIiwiXG4vKipcbiAgICBhY2NlcHRzIGEgc3RyaW5nOyByZXR1cm5zIHRoZSBzdHJpbmcgd2l0aCByZWdleCBtZXRhY2hhcmFjdGVycyBlc2NhcGVkLlxuICAgIHRoZSByZXR1cm5lZCBzdHJpbmcgY2FuIHNhZmVseSBiZSB1c2VkIHdpdGhpbiBhIHJlZ2V4IHRvIG1hdGNoIGEgbGl0ZXJhbFxuICAgIHN0cmluZy4gZXNjYXBlZCBjaGFyYWN0ZXJzIGFyZSBbLCBdLCB7LCB9LCAoLCApLCAtLCAqLCArLCA/LCAuLCBcXCwgXiwgJCxcbiAgICB8LCAjLCBbY29tbWFdLCBhbmQgd2hpdGVzcGFjZS5cbiovXG5pZiAoIVJlZ0V4cC5lc2NhcGUpIHtcbiAgICB2YXIgc3BlY2lhbCA9IC9bLVtcXF17fSgpKis/LlxcXFxeJHwsI1xcc10vZztcbiAgICBSZWdFeHAuZXNjYXBlID0gZnVuY3Rpb24gKHN0cmluZykge1xuICAgICAgICByZXR1cm4gc3RyaW5nLnJlcGxhY2Uoc3BlY2lhbCwgXCJcXFxcJCZcIik7XG4gICAgfTtcbn1cblxuIiwiXG52YXIgQXJyYXkgPSByZXF1aXJlKFwiLi9zaGltLWFycmF5XCIpO1xudmFyIE9iamVjdCA9IHJlcXVpcmUoXCIuL3NoaW0tb2JqZWN0XCIpO1xudmFyIEZ1bmN0aW9uID0gcmVxdWlyZShcIi4vc2hpbS1mdW5jdGlvblwiKTtcbnZhciBSZWdFeHAgPSByZXF1aXJlKFwiLi9zaGltLXJlZ2V4cFwiKTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gVHJlZUxvZztcblxuZnVuY3Rpb24gVHJlZUxvZygpIHtcbn1cblxuVHJlZUxvZy5hc2NpaSA9IHtcbiAgICBpbnRlcnNlY3Rpb246IFwiK1wiLFxuICAgIHRocm91Z2g6IFwiLVwiLFxuICAgIGJyYW5jaFVwOiBcIitcIixcbiAgICBicmFuY2hEb3duOiBcIitcIixcbiAgICBmcm9tQmVsb3c6IFwiLlwiLFxuICAgIGZyb21BYm92ZTogXCInXCIsXG4gICAgZnJvbUJvdGg6IFwiK1wiLFxuICAgIHN0cmFmZTogXCJ8XCJcbn07XG5cblRyZWVMb2cudW5pY29kZVJvdW5kID0ge1xuICAgIGludGVyc2VjdGlvbjogXCJcXHUyNTRiXCIsXG4gICAgdGhyb3VnaDogXCJcXHUyNTAxXCIsXG4gICAgYnJhbmNoVXA6IFwiXFx1MjUzYlwiLFxuICAgIGJyYW5jaERvd246IFwiXFx1MjUzM1wiLFxuICAgIGZyb21CZWxvdzogXCJcXHUyNTZkXCIsIC8vIHJvdW5kIGNvcm5lclxuICAgIGZyb21BYm92ZTogXCJcXHUyNTcwXCIsIC8vIHJvdW5kIGNvcm5lclxuICAgIGZyb21Cb3RoOiBcIlxcdTI1MjNcIixcbiAgICBzdHJhZmU6IFwiXFx1MjUwM1wiXG59O1xuXG5UcmVlTG9nLnVuaWNvZGVTaGFycCA9IHtcbiAgICBpbnRlcnNlY3Rpb246IFwiXFx1MjU0YlwiLFxuICAgIHRocm91Z2g6IFwiXFx1MjUwMVwiLFxuICAgIGJyYW5jaFVwOiBcIlxcdTI1M2JcIixcbiAgICBicmFuY2hEb3duOiBcIlxcdTI1MzNcIixcbiAgICBmcm9tQmVsb3c6IFwiXFx1MjUwZlwiLCAvLyBzaGFycCBjb3JuZXJcbiAgICBmcm9tQWJvdmU6IFwiXFx1MjUxN1wiLCAvLyBzaGFycCBjb3JuZXJcbiAgICBmcm9tQm90aDogXCJcXHUyNTIzXCIsXG4gICAgc3RyYWZlOiBcIlxcdTI1MDNcIlxufTtcblxuIiwidmFyIGdsb2JhbD10eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge307XG52YXIgcm5nO1xuXG5pZiAoZ2xvYmFsLmNyeXB0byAmJiBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKSB7XG4gIC8vIFdIQVRXRyBjcnlwdG8tYmFzZWQgUk5HIC0gaHR0cDovL3dpa2kud2hhdHdnLm9yZy93aWtpL0NyeXB0b1xuICAvLyBNb2RlcmF0ZWx5IGZhc3QsIGhpZ2ggcXVhbGl0eVxuICB2YXIgX3JuZHM4ID0gbmV3IFVpbnQ4QXJyYXkoMTYpO1xuICBybmcgPSBmdW5jdGlvbiB3aGF0d2dSTkcoKSB7XG4gICAgY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhfcm5kczgpO1xuICAgIHJldHVybiBfcm5kczg7XG4gIH07XG59XG5cbmlmICghcm5nKSB7XG4gIC8vIE1hdGgucmFuZG9tKCktYmFzZWQgKFJORylcbiAgLy9cbiAgLy8gSWYgYWxsIGVsc2UgZmFpbHMsIHVzZSBNYXRoLnJhbmRvbSgpLiAgSXQncyBmYXN0LCBidXQgaXMgb2YgdW5zcGVjaWZpZWRcbiAgLy8gcXVhbGl0eS5cbiAgdmFyICBfcm5kcyA9IG5ldyBBcnJheSgxNik7XG4gIHJuZyA9IGZ1bmN0aW9uKCkge1xuICAgIGZvciAodmFyIGkgPSAwLCByOyBpIDwgMTY7IGkrKykge1xuICAgICAgaWYgKChpICYgMHgwMykgPT09IDApIHIgPSBNYXRoLnJhbmRvbSgpICogMHgxMDAwMDAwMDA7XG4gICAgICBfcm5kc1tpXSA9IHIgPj4+ICgoaSAmIDB4MDMpIDw8IDMpICYgMHhmZjtcbiAgICB9XG5cbiAgICByZXR1cm4gX3JuZHM7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcm5nO1xuXG4iLCJ2YXIgQnVmZmVyPXJlcXVpcmUoXCJfX2Jyb3dzZXJpZnlfQnVmZmVyXCIpOy8vICAgICB1dWlkLmpzXG4vL1xuLy8gICAgIENvcHlyaWdodCAoYykgMjAxMC0yMDEyIFJvYmVydCBLaWVmZmVyXG4vLyAgICAgTUlUIExpY2Vuc2UgLSBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwXG5cbi8vIFVuaXF1ZSBJRCBjcmVhdGlvbiByZXF1aXJlcyBhIGhpZ2ggcXVhbGl0eSByYW5kb20gIyBnZW5lcmF0b3IuICBXZSBmZWF0dXJlXG4vLyBkZXRlY3QgdG8gZGV0ZXJtaW5lIHRoZSBiZXN0IFJORyBzb3VyY2UsIG5vcm1hbGl6aW5nIHRvIGEgZnVuY3Rpb24gdGhhdFxuLy8gcmV0dXJucyAxMjgtYml0cyBvZiByYW5kb21uZXNzLCBzaW5jZSB0aGF0J3Mgd2hhdCdzIHVzdWFsbHkgcmVxdWlyZWRcbnZhciBfcm5nID0gcmVxdWlyZSgnLi9ybmcnKTtcblxuLy8gQnVmZmVyIGNsYXNzIHRvIHVzZVxudmFyIEJ1ZmZlckNsYXNzID0gdHlwZW9mKEJ1ZmZlcikgPT0gJ2Z1bmN0aW9uJyA/IEJ1ZmZlciA6IEFycmF5O1xuXG4vLyBNYXBzIGZvciBudW1iZXIgPC0+IGhleCBzdHJpbmcgY29udmVyc2lvblxudmFyIF9ieXRlVG9IZXggPSBbXTtcbnZhciBfaGV4VG9CeXRlID0ge307XG5mb3IgKHZhciBpID0gMDsgaSA8IDI1NjsgaSsrKSB7XG4gIF9ieXRlVG9IZXhbaV0gPSAoaSArIDB4MTAwKS50b1N0cmluZygxNikuc3Vic3RyKDEpO1xuICBfaGV4VG9CeXRlW19ieXRlVG9IZXhbaV1dID0gaTtcbn1cblxuLy8gKipgcGFyc2UoKWAgLSBQYXJzZSBhIFVVSUQgaW50byBpdCdzIGNvbXBvbmVudCBieXRlcyoqXG5mdW5jdGlvbiBwYXJzZShzLCBidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IChidWYgJiYgb2Zmc2V0KSB8fCAwLCBpaSA9IDA7XG5cbiAgYnVmID0gYnVmIHx8IFtdO1xuICBzLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvWzAtOWEtZl17Mn0vZywgZnVuY3Rpb24ob2N0KSB7XG4gICAgaWYgKGlpIDwgMTYpIHsgLy8gRG9uJ3Qgb3ZlcmZsb3chXG4gICAgICBidWZbaSArIGlpKytdID0gX2hleFRvQnl0ZVtvY3RdO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gWmVybyBvdXQgcmVtYWluaW5nIGJ5dGVzIGlmIHN0cmluZyB3YXMgc2hvcnRcbiAgd2hpbGUgKGlpIDwgMTYpIHtcbiAgICBidWZbaSArIGlpKytdID0gMDtcbiAgfVxuXG4gIHJldHVybiBidWY7XG59XG5cbi8vICoqYHVucGFyc2UoKWAgLSBDb252ZXJ0IFVVSUQgYnl0ZSBhcnJheSAoYWxhIHBhcnNlKCkpIGludG8gYSBzdHJpbmcqKlxuZnVuY3Rpb24gdW5wYXJzZShidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IG9mZnNldCB8fCAwLCBidGggPSBfYnl0ZVRvSGV4O1xuICByZXR1cm4gIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXSArICctJyArXG4gICAgICAgICAgYnRoW2J1ZltpKytdXSArIGJ0aFtidWZbaSsrXV0gKyAnLScgK1xuICAgICAgICAgIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICsgJy0nICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXSArICctJyArXG4gICAgICAgICAgYnRoW2J1ZltpKytdXSArIGJ0aFtidWZbaSsrXV0gK1xuICAgICAgICAgIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXTtcbn1cblxuLy8gKipgdjEoKWAgLSBHZW5lcmF0ZSB0aW1lLWJhc2VkIFVVSUQqKlxuLy9cbi8vIEluc3BpcmVkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS9MaW9zSy9VVUlELmpzXG4vLyBhbmQgaHR0cDovL2RvY3MucHl0aG9uLm9yZy9saWJyYXJ5L3V1aWQuaHRtbFxuXG4vLyByYW5kb20gIydzIHdlIG5lZWQgdG8gaW5pdCBub2RlIGFuZCBjbG9ja3NlcVxudmFyIF9zZWVkQnl0ZXMgPSBfcm5nKCk7XG5cbi8vIFBlciA0LjUsIGNyZWF0ZSBhbmQgNDgtYml0IG5vZGUgaWQsICg0NyByYW5kb20gYml0cyArIG11bHRpY2FzdCBiaXQgPSAxKVxudmFyIF9ub2RlSWQgPSBbXG4gIF9zZWVkQnl0ZXNbMF0gfCAweDAxLFxuICBfc2VlZEJ5dGVzWzFdLCBfc2VlZEJ5dGVzWzJdLCBfc2VlZEJ5dGVzWzNdLCBfc2VlZEJ5dGVzWzRdLCBfc2VlZEJ5dGVzWzVdXG5dO1xuXG4vLyBQZXIgNC4yLjIsIHJhbmRvbWl6ZSAoMTQgYml0KSBjbG9ja3NlcVxudmFyIF9jbG9ja3NlcSA9IChfc2VlZEJ5dGVzWzZdIDw8IDggfCBfc2VlZEJ5dGVzWzddKSAmIDB4M2ZmZjtcblxuLy8gUHJldmlvdXMgdXVpZCBjcmVhdGlvbiB0aW1lXG52YXIgX2xhc3RNU2VjcyA9IDAsIF9sYXN0TlNlY3MgPSAwO1xuXG4vLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2Jyb29mYS9ub2RlLXV1aWQgZm9yIEFQSSBkZXRhaWxzXG5mdW5jdGlvbiB2MShvcHRpb25zLCBidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IGJ1ZiAmJiBvZmZzZXQgfHwgMDtcbiAgdmFyIGIgPSBidWYgfHwgW107XG5cbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgdmFyIGNsb2Nrc2VxID0gb3B0aW9ucy5jbG9ja3NlcSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jbG9ja3NlcSA6IF9jbG9ja3NlcTtcblxuICAvLyBVVUlEIHRpbWVzdGFtcHMgYXJlIDEwMCBuYW5vLXNlY29uZCB1bml0cyBzaW5jZSB0aGUgR3JlZ29yaWFuIGVwb2NoLFxuICAvLyAoMTU4Mi0xMC0xNSAwMDowMCkuICBKU051bWJlcnMgYXJlbid0IHByZWNpc2UgZW5vdWdoIGZvciB0aGlzLCBzb1xuICAvLyB0aW1lIGlzIGhhbmRsZWQgaW50ZXJuYWxseSBhcyAnbXNlY3MnIChpbnRlZ2VyIG1pbGxpc2Vjb25kcykgYW5kICduc2VjcydcbiAgLy8gKDEwMC1uYW5vc2Vjb25kcyBvZmZzZXQgZnJvbSBtc2Vjcykgc2luY2UgdW5peCBlcG9jaCwgMTk3MC0wMS0wMSAwMDowMC5cbiAgdmFyIG1zZWNzID0gb3B0aW9ucy5tc2VjcyAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5tc2VjcyA6IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gIC8vIFBlciA0LjIuMS4yLCB1c2UgY291bnQgb2YgdXVpZCdzIGdlbmVyYXRlZCBkdXJpbmcgdGhlIGN1cnJlbnQgY2xvY2tcbiAgLy8gY3ljbGUgdG8gc2ltdWxhdGUgaGlnaGVyIHJlc29sdXRpb24gY2xvY2tcbiAgdmFyIG5zZWNzID0gb3B0aW9ucy5uc2VjcyAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5uc2VjcyA6IF9sYXN0TlNlY3MgKyAxO1xuXG4gIC8vIFRpbWUgc2luY2UgbGFzdCB1dWlkIGNyZWF0aW9uIChpbiBtc2VjcylcbiAgdmFyIGR0ID0gKG1zZWNzIC0gX2xhc3RNU2VjcykgKyAobnNlY3MgLSBfbGFzdE5TZWNzKS8xMDAwMDtcblxuICAvLyBQZXIgNC4yLjEuMiwgQnVtcCBjbG9ja3NlcSBvbiBjbG9jayByZWdyZXNzaW9uXG4gIGlmIChkdCA8IDAgJiYgb3B0aW9ucy5jbG9ja3NlcSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgY2xvY2tzZXEgPSBjbG9ja3NlcSArIDEgJiAweDNmZmY7XG4gIH1cblxuICAvLyBSZXNldCBuc2VjcyBpZiBjbG9jayByZWdyZXNzZXMgKG5ldyBjbG9ja3NlcSkgb3Igd2UndmUgbW92ZWQgb250byBhIG5ld1xuICAvLyB0aW1lIGludGVydmFsXG4gIGlmICgoZHQgPCAwIHx8IG1zZWNzID4gX2xhc3RNU2VjcykgJiYgb3B0aW9ucy5uc2VjcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbnNlY3MgPSAwO1xuICB9XG5cbiAgLy8gUGVyIDQuMi4xLjIgVGhyb3cgZXJyb3IgaWYgdG9vIG1hbnkgdXVpZHMgYXJlIHJlcXVlc3RlZFxuICBpZiAobnNlY3MgPj0gMTAwMDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3V1aWQudjEoKTogQ2FuXFwndCBjcmVhdGUgbW9yZSB0aGFuIDEwTSB1dWlkcy9zZWMnKTtcbiAgfVxuXG4gIF9sYXN0TVNlY3MgPSBtc2VjcztcbiAgX2xhc3ROU2VjcyA9IG5zZWNzO1xuICBfY2xvY2tzZXEgPSBjbG9ja3NlcTtcblxuICAvLyBQZXIgNC4xLjQgLSBDb252ZXJ0IGZyb20gdW5peCBlcG9jaCB0byBHcmVnb3JpYW4gZXBvY2hcbiAgbXNlY3MgKz0gMTIyMTkyOTI4MDAwMDA7XG5cbiAgLy8gYHRpbWVfbG93YFxuICB2YXIgdGwgPSAoKG1zZWNzICYgMHhmZmZmZmZmKSAqIDEwMDAwICsgbnNlY3MpICUgMHgxMDAwMDAwMDA7XG4gIGJbaSsrXSA9IHRsID4+PiAyNCAmIDB4ZmY7XG4gIGJbaSsrXSA9IHRsID4+PiAxNiAmIDB4ZmY7XG4gIGJbaSsrXSA9IHRsID4+PiA4ICYgMHhmZjtcbiAgYltpKytdID0gdGwgJiAweGZmO1xuXG4gIC8vIGB0aW1lX21pZGBcbiAgdmFyIHRtaCA9IChtc2VjcyAvIDB4MTAwMDAwMDAwICogMTAwMDApICYgMHhmZmZmZmZmO1xuICBiW2krK10gPSB0bWggPj4+IDggJiAweGZmO1xuICBiW2krK10gPSB0bWggJiAweGZmO1xuXG4gIC8vIGB0aW1lX2hpZ2hfYW5kX3ZlcnNpb25gXG4gIGJbaSsrXSA9IHRtaCA+Pj4gMjQgJiAweGYgfCAweDEwOyAvLyBpbmNsdWRlIHZlcnNpb25cbiAgYltpKytdID0gdG1oID4+PiAxNiAmIDB4ZmY7XG5cbiAgLy8gYGNsb2NrX3NlcV9oaV9hbmRfcmVzZXJ2ZWRgIChQZXIgNC4yLjIgLSBpbmNsdWRlIHZhcmlhbnQpXG4gIGJbaSsrXSA9IGNsb2Nrc2VxID4+PiA4IHwgMHg4MDtcblxuICAvLyBgY2xvY2tfc2VxX2xvd2BcbiAgYltpKytdID0gY2xvY2tzZXEgJiAweGZmO1xuXG4gIC8vIGBub2RlYFxuICB2YXIgbm9kZSA9IG9wdGlvbnMubm9kZSB8fCBfbm9kZUlkO1xuICBmb3IgKHZhciBuID0gMDsgbiA8IDY7IG4rKykge1xuICAgIGJbaSArIG5dID0gbm9kZVtuXTtcbiAgfVxuXG4gIHJldHVybiBidWYgPyBidWYgOiB1bnBhcnNlKGIpO1xufVxuXG4vLyAqKmB2NCgpYCAtIEdlbmVyYXRlIHJhbmRvbSBVVUlEKipcblxuLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9icm9vZmEvbm9kZS11dWlkIGZvciBBUEkgZGV0YWlsc1xuZnVuY3Rpb24gdjQob3B0aW9ucywgYnVmLCBvZmZzZXQpIHtcbiAgLy8gRGVwcmVjYXRlZCAtICdmb3JtYXQnIGFyZ3VtZW50LCBhcyBzdXBwb3J0ZWQgaW4gdjEuMlxuICB2YXIgaSA9IGJ1ZiAmJiBvZmZzZXQgfHwgMDtcblxuICBpZiAodHlwZW9mKG9wdGlvbnMpID09ICdzdHJpbmcnKSB7XG4gICAgYnVmID0gb3B0aW9ucyA9PSAnYmluYXJ5JyA/IG5ldyBCdWZmZXJDbGFzcygxNikgOiBudWxsO1xuICAgIG9wdGlvbnMgPSBudWxsO1xuICB9XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIHZhciBybmRzID0gb3B0aW9ucy5yYW5kb20gfHwgKG9wdGlvbnMucm5nIHx8IF9ybmcpKCk7XG5cbiAgLy8gUGVyIDQuNCwgc2V0IGJpdHMgZm9yIHZlcnNpb24gYW5kIGBjbG9ja19zZXFfaGlfYW5kX3Jlc2VydmVkYFxuICBybmRzWzZdID0gKHJuZHNbNl0gJiAweDBmKSB8IDB4NDA7XG4gIHJuZHNbOF0gPSAocm5kc1s4XSAmIDB4M2YpIHwgMHg4MDtcblxuICAvLyBDb3B5IGJ5dGVzIHRvIGJ1ZmZlciwgaWYgcHJvdmlkZWRcbiAgaWYgKGJ1Zikge1xuICAgIGZvciAodmFyIGlpID0gMDsgaWkgPCAxNjsgaWkrKykge1xuICAgICAgYnVmW2kgKyBpaV0gPSBybmRzW2lpXTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmIHx8IHVucGFyc2Uocm5kcyk7XG59XG5cbi8vIEV4cG9ydCBwdWJsaWMgQVBJXG52YXIgdXVpZCA9IHY0O1xudXVpZC52MSA9IHYxO1xudXVpZC52NCA9IHY0O1xudXVpZC5wYXJzZSA9IHBhcnNlO1xudXVpZC51bnBhcnNlID0gdW5wYXJzZTtcbnV1aWQuQnVmZmVyQ2xhc3MgPSBCdWZmZXJDbGFzcztcblxubW9kdWxlLmV4cG9ydHMgPSB1dWlkO1xuIiwiLy8gUGFyYW1zIGFyZSBjb250YWluZXJzLFxuLy8gd2hpY2ggaGF2ZSBhIGNsb2NrIGtleSB7IGNsb2NrOiB7fSB9XG5cbi8vIGluY3JlbWVudHMgdGhlIGNvdW50ZXIgZm9yIG5vZGVJZFxuZXhwb3J0cy5pbmNyZW1lbnQgPSBmdW5jdGlvbihvLCBub2RlSWQpIHtcbiAgaWYoby5jbG9jaykge1xuICAgIG8uY2xvY2tbbm9kZUlkXSA9ICh0eXBlb2Ygby5jbG9ja1tub2RlSWRdID09ICd1bmRlZmluZWQnID8gMSA6IG8uY2xvY2tbbm9kZUlkXSArIDEpO1xuICB9IGVsc2Uge1xuICAgIG9bbm9kZUlkXSA9ICh0eXBlb2Ygb1tub2RlSWRdID09ICd1bmRlZmluZWQnID8gMSA6IG9bbm9kZUlkXSArIDEpO1xuICB9XG4gIHJldHVybiBvO1xufTtcblxuZnVuY3Rpb24gYWxsS2V5cyhhLCBiKXtcbiAgdmFyIGxhc3QgPSBudWxsO1xuICByZXR1cm4gT2JqZWN0LmtleXMoYSlcbiAgICAuY29uY2F0KE9iamVjdC5rZXlzKGIpKVxuICAgIC5zb3J0KClcbiAgICAuZmlsdGVyKGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgIC8vIHRvIG1ha2UgYSBzZXQgb2Ygc29ydGVkIGtleXMgdW5pcXVlLCBqdXN0IGNoZWNrIHRoYXQgY29uc2VjdXRpdmUga2V5cyBhcmUgZGlmZmVyZW50XG4gICAgICB2YXIgaXNEdXBsaWNhdGUgPSAoaXRlbSA9PSBsYXN0KTtcbiAgICAgIGxhc3QgPSBpdGVtO1xuICAgICAgcmV0dXJuICFpc0R1cGxpY2F0ZTtcbiAgICB9KTtcbn1cblxuLy8gbGlrZSBhIHJlZ3VsYXIgc29ydCBmdW5jdGlvbiwgcmV0dXJuczpcbi8vIGlmIGEgPCBiOiAtMVxuLy8gaWYgYSA9PSBiOiAwXG4vLyBpZiBhID4gYjogMVxuLy8gRS5nLiBpZiB1c2VkIHRvIHNvcnQgYW4gYXJyYXkgb2Yga2V5cywgd2lsbCBvcmRlciB0aGVtIGluIGFzY2VuZGluZyBvcmRlciAoMSwgMiwgMyAuLilcbmV4cG9ydHMuYXNjU29ydCA9IGV4cG9ydHMuY29tcGFyZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgdmFyIGlzR3JlYXRlciA9IGZhbHNlLFxuICAgICAgaXNMZXNzID0gZmFsc2U7XG5cbiAgLy8gYWxsb3cgdGhpcyBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCBvYmplY3RzIHRoYXQgY29udGFpbiBjbG9ja3MsIG9yIHRoZSBjbG9ja3MgdGhlbXNlbHZlc1xuICBpZihhLmNsb2NrKSBhID0gYS5jbG9jaztcbiAgaWYoYi5jbG9jaykgYiA9IGIuY2xvY2s7XG5cbiAgYWxsS2V5cyhhLCBiKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHZhciBkaWZmID0gKGFba2V5XSB8fCAwKSAtIChiW2tleV0gfHwgMCk7XG4gICAgaWYoZGlmZiA+IDApIGlzR3JlYXRlciA9IHRydWU7XG4gICAgaWYoZGlmZiA8IDApIGlzTGVzcyA9IHRydWU7XG4gIH0pO1xuXG4gIGlmKGlzR3JlYXRlciAmJiBpc0xlc3MpIHJldHVybiAwO1xuICBpZihpc0xlc3MpIHJldHVybiAtMTtcbiAgaWYoaXNHcmVhdGVyKSByZXR1cm4gMTtcbiAgcmV0dXJuIDA7IC8vIG5laXRoZXIgaXMgc2V0LCBzbyBlcXVhbFxufTtcblxuLy8gc29ydCBpbiBkZXNjZW5kaW5nIG9yZGVyIChOLCAuLi4gMywgMiwgMSlcbmV4cG9ydHMuZGVzY1NvcnQgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiAwIC0gZXhwb3J0cy5hc2NTb3J0KGEsIGIpO1xufTtcblxuLy8gZXF1YWwsIG9yIG5vdCBsZXNzIGFuZCBub3QgZ3JlYXRlciB0aGFuXG5leHBvcnRzLmlzQ29uY3VycmVudCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgcmV0dXJuICEhKGV4cG9ydHMuY29tcGFyZShhLCBiKSA9PSAwKTtcbn07XG5cbi8vIGlkZW50aWNhbFxuZXhwb3J0cy5pc0lkZW50aWNhbCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgLy8gYWxsb3cgdGhpcyBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCBvYmplY3RzIHRoYXQgY29udGFpbiBjbG9ja3MsIG9yIHRoZSBjbG9ja3MgdGhlbXNlbHZlc1xuICBpZihhLmNsb2NrKSBhID0gYS5jbG9jaztcbiAgaWYoYi5jbG9jaykgYiA9IGIuY2xvY2s7XG5cbiAgcmV0dXJuIGFsbEtleXMoYSwgYikuZXZlcnkoZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYodHlwZW9mIGFba2V5XSA9PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgYltrZXldID09ICd1bmRlZmluZWQnKSByZXR1cm4gZmFsc2U7XG4gICAgdmFyIGRpZmYgPSBhW2tleV0gLSBiW2tleV07XG4gICAgaWYoZGlmZiAhPSAwKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xufTtcblxuXG4vLyBnaXZlbiB0d28gdmVjdG9yIGNsb2NrcywgcmV0dXJucyBhIG5ldyB2ZWN0b3IgY2xvY2sgd2l0aCBhbGwgdmFsdWVzIGdyZWF0ZXIgdGhhblxuLy8gdGhvc2Ugb2YgdGhlIG1lcmdlZCBjbG9ja3NcbmV4cG9ydHMubWVyZ2UgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHZhciBsYXN0ID0gbnVsbCwgcmVzdWx0ID0ge30sIHdhbnRDb250YWluZXIgPSBmYWxzZTtcbiAgLy8gYWxsb3cgdGhpcyBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCBvYmplY3RzIHRoYXQgY29udGFpbiBjbG9ja3MsIG9yIHRoZSBjbG9ja3MgdGhlbXNlbHZlc1xuICBpZihhLmNsb2NrICYmIGIuY2xvY2spIHdhbnRDb250YWluZXIgPSB0cnVlO1xuICBpZihhLmNsb2NrKSBhID0gYS5jbG9jaztcbiAgaWYoYi5jbG9jaykgYiA9IGIuY2xvY2s7XG5cbiAgYWxsS2V5cyhhLCBiKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gTWF0aC5tYXgoYVtrZXldIHx8IDAsIGJba2V5XSB8fCAwKTtcbiAgfSk7XG4gIGlmKHdhbnRDb250YWluZXIpIHtcbiAgICByZXR1cm4geyBjbG9jazogcmVzdWx0IH07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmV4cG9ydHMuR1QgPSAxO1xuZXhwb3J0cy5MVCA9IC0xO1xuZXhwb3J0cy5DT05DVVJSRU5UID0gMDtcbiIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4vKiBnbG9iYWwgZG9jdW1lbnQsIGxvY2F0aW9uLCBQcmltdXM6IGZhbHNlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciB1cmwgPSByZXF1aXJlKCd1cmwnKTtcbnZhciByZVRyYWlsaW5nU2xhc2ggPSAvXFwvJC87XG5cbi8qKlxuICAjIyMgc2lnbmFsbGVyLmxvYWRQcmltdXMoc2lnbmFsaG9zdCwgY2FsbGJhY2spXG5cbioqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzaWduYWxob3N0LCBjYWxsYmFjaykge1xuICB2YXIgc2NyaXB0O1xuICB2YXIgYmFzZVVybDtcbiAgdmFyIGJhc2VQYXRoO1xuICB2YXIgc2NyaXB0U3JjO1xuXG4gIC8vIGlmIHRoZSBzaWduYWxob3N0IGlzIGEgZnVuY3Rpb24sIHdlIGFyZSBpbiBzaW5nbGUgYXJnIGNhbGxpbmcgbW9kZVxuICBpZiAodHlwZW9mIHNpZ25hbGhvc3QgPT0gJ2Z1bmN0aW9uJykge1xuICAgIGNhbGxiYWNrID0gc2lnbmFsaG9zdDtcbiAgICBzaWduYWxob3N0ID0gbG9jYXRpb24ub3JpZ2luO1xuICB9XG5cbiAgLy8gcmVhZCB0aGUgYmFzZSBwYXRoXG4gIGJhc2VVcmwgPSBzaWduYWxob3N0LnJlcGxhY2UocmVUcmFpbGluZ1NsYXNoLCAnJyk7XG4gIGJhc2VQYXRoID0gdXJsLnBhcnNlKHNpZ25hbGhvc3QpLnBhdGhuYW1lO1xuICBzY3JpcHRTcmMgPSBiYXNlVXJsICsgJy9ydGMuaW8vcHJpbXVzLmpzJztcblxuICAvLyBsb29rIGZvciB0aGUgc2NyaXB0IGZpcnN0XG4gIHNjcmlwdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NjcmlwdFtzcmM9XCInICsgc2NyaXB0U3JjICsgJ1wiXScpO1xuXG4gIC8vIGlmIHdlIGZvdW5kLCB0aGUgc2NyaXB0IHRyaWdnZXIgdGhlIGNhbGxiYWNrIGltbWVkaWF0ZWx5XG4gIGlmIChzY3JpcHQgJiYgdHlwZW9mIFByaW11cyAhPSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBjYWxsYmFjayhudWxsLCBQcmltdXMpO1xuICB9XG5cbiAgLy8gb3RoZXJ3aXNlIGNyZWF0ZSB0aGUgc2NyaXB0IGFuZCBsb2FkIHByaW11c1xuICBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgc2NyaXB0LnNyYyA9IHNjcmlwdFNyYztcblxuICBzY3JpcHQub25lcnJvciA9IGNhbGxiYWNrO1xuICBzY3JpcHQub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgLy8gaWYgd2UgaGF2ZSBhIHNpZ25hbGhvc3QgdGhhdCBpcyBub3QgYmFzZXBhdGhlZCBhdCAvXG4gICAgLy8gdGhlbiB0d2VhayB0aGUgcHJpbXVzIHByb3RvdHlwZVxuICAgIGlmIChiYXNlUGF0aCAhPT0gJy8nKSB7XG4gICAgICBQcmltdXMucHJvdG90eXBlLnBhdGhuYW1lID0gYmFzZVBhdGgucmVwbGFjZShyZVRyYWlsaW5nU2xhc2gsICcnKSArXG4gICAgICAgIFByaW11cy5wcm90b3R5cGUucGF0aG5hbWU7XG4gICAgfVxuXG4gICAgY2FsbGJhY2sobnVsbCwgUHJpbXVzKTtcbiAgfTtcblxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNjcmlwdCk7XG59OyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKSgncnRjLXNpZ25hbGxlci1wcm9jZXNzb3InKTtcbnZhciBqc29ucGFyc2UgPSByZXF1aXJlKCdjb2cvanNvbnBhcnNlJyk7XG52YXIgdmMgPSByZXF1aXJlKCd2ZWN0b3JjbG9jaycpO1xuXG4vKipcbiAgIyMgc2lnbmFsbGVyIHByb2Nlc3MgaGFuZGxpbmdcblxuICBXaGVuIGEgc2lnbmFsbGVyJ3MgdW5kZXJsaW5nIG1lc3NlbmdlciBlbWl0cyBhIGBkYXRhYCBldmVudCB0aGlzIGlzXG4gIGRlbGVnYXRlZCB0byBhIHNpbXBsZSBtZXNzYWdlIHBhcnNlciwgd2hpY2ggYXBwbGllcyB0aGUgZm9sbG93aW5nIHNpbXBsZVxuICBsb2dpYzpcblxuICAtIElzIHRoZSBtZXNzYWdlIGEgYC90b2AgbWVzc2FnZS4gSWYgc28sIHNlZSBpZiB0aGUgbWVzc2FnZSBpcyBmb3IgdGhpc1xuICAgIHNpZ25hbGxlciAoY2hlY2tpbmcgdGhlIHRhcmdldCBpZCAtIDJuZCBhcmcpLiAgSWYgc28gcGFzcyB0aGVcbiAgICByZW1haW5kZXIgb2YgdGhlIG1lc3NhZ2Ugb250byB0aGUgc3RhbmRhcmQgcHJvY2Vzc2luZyBjaGFpbi4gIElmIG5vdCxcbiAgICBkaXNjYXJkIHRoZSBtZXNzYWdlLlxuXG4gIC0gSXMgdGhlIG1lc3NhZ2UgYSBjb21tYW5kIG1lc3NhZ2UgKHByZWZpeGVkIHdpdGggYSBmb3J3YXJkIHNsYXNoKS4gSWYgc28sXG4gICAgbG9vayBmb3IgYW4gYXBwcm9wcmlhdGUgbWVzc2FnZSBoYW5kbGVyIGFuZCBwYXNzIHRoZSBtZXNzYWdlIHBheWxvYWQgb25cbiAgICB0byBpdC5cblxuICAtIEZpbmFsbHksIGRvZXMgdGhlIG1lc3NhZ2UgbWF0Y2ggYW55IHBhdHRlcm5zIHRoYXQgd2UgYXJlIGxpc3RlbmluZyBmb3I/XG4gICAgSWYgc28sIHRoZW4gcGFzcyB0aGUgZW50aXJlIG1lc3NhZ2UgY29udGVudHMgb250byB0aGUgcmVnaXN0ZXJlZCBoYW5kbGVyLlxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNpZ25hbGxlcikge1xuICB2YXIgaGFuZGxlcnMgPSByZXF1aXJlKCcuL2hhbmRsZXJzJykoc2lnbmFsbGVyKTtcblxuICBmdW5jdGlvbiBzZW5kRXZlbnQocGFydHMsIHNyY1N0YXRlLCBkYXRhKSB7XG4gICAgLy8gaW5pdGlhbGlzZSB0aGUgZXZlbnQgbmFtZVxuICAgIHZhciBldnROYW1lID0gcGFydHNbMF0uc2xpY2UoMSk7XG5cbiAgICAvLyBjb252ZXJ0IGFueSB2YWxpZCBqc29uIG9iamVjdHMgdG8ganNvblxuICAgIHZhciBhcmdzID0gcGFydHMuc2xpY2UoMSkubWFwKGpzb25wYXJzZSk7XG5cbiAgICBzaWduYWxsZXIuZW1pdC5hcHBseShcbiAgICAgIHNpZ25hbGxlcixcbiAgICAgIFtldnROYW1lXS5jb25jYXQoYXJncykuY29uY2F0KFtzcmNTdGF0ZSwgZGF0YV0pXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbihvcmlnaW5hbERhdGEpIHtcbiAgICB2YXIgaWQgPSBzaWduYWxsZXIuaWQ7XG4gICAgdmFyIGRhdGEgPSBvcmlnaW5hbERhdGE7XG4gICAgdmFyIGlzTWF0Y2ggPSB0cnVlO1xuICAgIHZhciBwYXJ0cztcbiAgICB2YXIgaGFuZGxlcjtcbiAgICB2YXIgc3JjRGF0YTtcbiAgICB2YXIgc3JjU3RhdGU7XG5cbiAgICBkZWJ1Zygnc2lnbmFsbGVyICcgKyBzaWduYWxsZXIuaWQgKyAnIHJlY2VpdmVkIGRhdGE6ICcgKyBvcmlnaW5hbERhdGEpO1xuXG4gICAgLy8gcHJvY2VzcyAvdG8gbWVzc2FnZXNcbiAgICBpZiAoZGF0YS5zbGljZSgwLCAzKSA9PT0gJy90bycpIHtcbiAgICAgIGlzTWF0Y2ggPSBkYXRhLnNsaWNlKDQsIGlkLmxlbmd0aCArIDQpID09PSBpZDtcbiAgICAgIGlmIChpc01hdGNoKSB7XG4gICAgICAgIHBhcnRzID0gZGF0YS5zbGljZSg1ICsgaWQubGVuZ3RoKS5zcGxpdCgnfCcpLm1hcChqc29ucGFyc2UpO1xuXG4gICAgICAgIC8vIGdldCB0aGUgc291cmNlIGRhdGFcbiAgICAgICAgc3JjRGF0YSA9IHBhcnRzWzBdO1xuICAgICAgICBzcmNTdGF0ZSA9IHNpZ25hbGxlci5wZWVycy5nZXQoc3JjRGF0YSAmJiBzcmNEYXRhLmlkKTtcblxuICAgICAgICAvLyBleHRyYWN0IHRoZSB2ZWN0b3IgY2xvY2sgYW5kIHVwZGF0ZSB0aGUgcGFydHNcbiAgICAgICAgcGFydHMgPSBwYXJ0cy5zbGljZSgxKS5tYXAoanNvbnBhcnNlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiB0aGlzIGlzIG5vdCBhIG1hdGNoLCB0aGVuIGJhaWxcbiAgICBpZiAoISBpc01hdGNoKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gY2hvcCB0aGUgZGF0YSBpbnRvIHBhcnRzXG4gICAgcGFydHMgPSBwYXJ0cyB8fCBkYXRhLnNwbGl0KCd8JykubWFwKGpzb25wYXJzZSk7XG5cbiAgICAvLyBpZiB3ZSBoYXZlIGEgc3BlY2lmaWMgaGFuZGxlciBmb3IgdGhlIGFjdGlvbiwgdGhlbiBpbnZva2VcbiAgICBpZiAocGFydHNbMF0uY2hhckF0KDApID09PSAnLycpIHtcbiAgICAgIC8vIGxvb2sgZm9yIGEgaGFuZGxlciBmb3IgdGhlIG1lc3NhZ2UgdHlwZVxuICAgICAgaGFuZGxlciA9IGhhbmRsZXJzW3BhcnRzWzBdLnNsaWNlKDEpXTtcblxuICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgaGFuZGxlcihcbiAgICAgICAgICBwYXJ0cy5zbGljZSgxKSxcbiAgICAgICAgICBwYXJ0c1swXS5zbGljZSgxKSxcbiAgICAgICAgICBzcmNEYXRhICYmIHNyY0RhdGEuY2xvY2ssXG4gICAgICAgICAgc3JjU3RhdGVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBzZW5kRXZlbnQocGFydHMsIHNyY1N0YXRlLCBvcmlnaW5hbERhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGlmIHdlIGhhdmUgYSBjbG9jayB2YWx1ZSAoYW5kIGEgc291cmNlIHBlZXIpLCB0aGVuIG1lcmdlIHRoZSBjbG9ja1xuICAgIGlmIChzcmNEYXRhICYmIHNyY0RhdGEuY2xvY2sgJiYgc3JjU3RhdGUpIHtcbiAgICAgIHNyY1N0YXRlLmNsb2NrID0gdmMubWVyZ2Uoc3JjU3RhdGUuY2xvY2ssIHNyY0RhdGEuY2xvY2spO1xuICAgIH1cbiAgfTtcbn07IiwiLyoganNoaW50IG5vZGU6IHRydWUgKi9cbi8qIGdsb2JhbCBSVENJY2VDYW5kaWRhdGU6IGZhbHNlICovXG4vKiBnbG9iYWwgUlRDU2Vzc2lvbkRlc2NyaXB0aW9uOiBmYWxzZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZGVidWcgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJykoJ2NvdXBsZScpO1xudmFyIGFzeW5jID0gcmVxdWlyZSgnYXN5bmMnKTtcbnZhciBtb25pdG9yID0gcmVxdWlyZSgnLi9tb25pdG9yJyk7XG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgnLi9kZXRlY3QnKTtcblxuLyoqXG4gICMjIHJ0Yy9jb3VwbGVcblxuICAjIyMgY291cGxlKHBjLCB0YXJnZXRJZCwgc2lnbmFsbGVyLCBvcHRzPylcblxuICBDb3VwbGUgYSBXZWJSVEMgY29ubmVjdGlvbiB3aXRoIGFub3RoZXIgd2VicnRjIGNvbm5lY3Rpb24gaWRlbnRpZmllZCBieVxuICBgdGFyZ2V0SWRgIHZpYSB0aGUgc2lnbmFsbGVyLlxuXG4gIFRoZSBmb2xsb3dpbmcgb3B0aW9ucyBjYW4gYmUgcHJvdmlkZWQgaW4gdGhlIGBvcHRzYCBhcmd1bWVudDpcblxuICAtIGBzZHBmaWx0ZXJgIChkZWZhdWx0OiBudWxsKVxuXG4gICAgQSBzaW1wbGUgZnVuY3Rpb24gZm9yIGZpbHRlcmluZyBTRFAgYXMgcGFydCBvZiB0aGUgcGVlclxuICAgIGNvbm5lY3Rpb24gaGFuZHNoYWtlIChzZWUgdGhlIFVzaW5nIEZpbHRlcnMgZGV0YWlscyBiZWxvdykuXG5cbiAgLSBgbWF4QXR0ZW1wdHNgIChkZWZhdWx0OiAxKVxuXG4gICAgSG93IG1hbnkgdGltZXMgc2hvdWxkIG5lZ290aWF0aW9uIGJlIGF0dGVtcHRlZC4gIFRoaXMgaXNcbiAgICAqKmV4cGVyaW1lbnRhbCoqIGZ1bmN0aW9uYWxpdHkgZm9yIGF0dGVtcHRpbmcgY29ubmVjdGlvbiBuZWdvdGlhdGlvblxuICAgIGlmIGl0IGZhaWxzLlxuXG4gIC0gYGF0dGVtcHREZWxheWAgKGRlZmF1bHQ6IDMwMDApXG5cbiAgICBUaGUgYW1vdW50IG9mIG1zIHRvIHdhaXQgYmV0d2VlbiBjb25uZWN0aW9uIG5lZ290aWF0aW9uIGF0dGVtcHRzLlxuXG4gICMjIyMgRXhhbXBsZSBVc2FnZVxuXG4gIGBgYGpzXG4gIHZhciBjb3VwbGUgPSByZXF1aXJlKCdydGMvY291cGxlJyk7XG5cbiAgY291cGxlKHBjLCAnNTQ4Nzk5NjUtY2U0My00MjZlLWE4ZWYtMDlhYzFlMzlhMTZkJywgc2lnbmFsbGVyKTtcbiAgYGBgXG5cbiAgIyMjIyBVc2luZyBGaWx0ZXJzXG5cbiAgSW4gY2VydGFpbiBpbnN0YW5jZXMgeW91IG1heSB3aXNoIHRvIG1vZGlmeSB0aGUgcmF3IFNEUCB0aGF0IGlzIHByb3ZpZGVkXG4gIGJ5IHRoZSBgY3JlYXRlT2ZmZXJgIGFuZCBgY3JlYXRlQW5zd2VyYCBjYWxscy4gIFRoaXMgY2FuIGJlIGRvbmUgYnkgcGFzc2luZ1xuICBhIGBzZHBmaWx0ZXJgIGZ1bmN0aW9uIChvciBhcnJheSkgaW4gdGhlIG9wdGlvbnMuICBGb3IgZXhhbXBsZTpcblxuICBgYGBqc1xuICAvLyBydW4gdGhlIHNkcCBmcm9tIHRocm91Z2ggYSBsb2NhbCB0d2Vha1NkcCBmdW5jdGlvbi5cbiAgY291cGxlKHBjLCAnNTQ4Nzk5NjUtY2U0My00MjZlLWE4ZWYtMDlhYzFlMzlhMTZkJywgc2lnbmFsbGVyLCB7XG4gICAgc2RwZmlsdGVyOiB0d2Vha1NkcFxuICB9KTtcbiAgYGBgXG5cbioqL1xuZnVuY3Rpb24gY291cGxlKGNvbm4sIHRhcmdldElkLCBzaWduYWxsZXIsIG9wdHMpIHtcbiAgLy8gY3JlYXRlIGEgbW9uaXRvciBmb3IgdGhlIGNvbm5lY3Rpb25cbiAgdmFyIG1vbiA9IG1vbml0b3IoY29ubik7XG4gIHZhciBibG9ja0lkO1xuICB2YXIgc3RhZ2VzID0ge307XG4gIHZhciBsb2NhbENhbmRpZGF0ZXMgPSBbXTtcbiAgdmFyIHF1ZXVlZENhbmRpZGF0ZXMgPSBbXTtcbiAgdmFyIHNkcEZpbHRlciA9IChvcHRzIHx8IHt9KS5zZHBmaWx0ZXI7XG5cbiAgLy8gcmV0cnkgaW1wbGVtZW50YXRpb25cbiAgdmFyIG1heEF0dGVtcHRzID0gKG9wdHMgfHwge30pLm1heEF0dGVtcHRzIHx8IDE7XG4gIHZhciBhdHRlbXB0RGVsYXkgPSAob3B0cyB8fCB7fSkuYXR0ZW1wdERlbGF5IHx8IDMwMDA7XG4gIHZhciBhdHRlbXB0ID0gMTtcbiAgdmFyIGF0dGVtcHRUaW1lcjtcbiAgdmFyIG9mZmVyVGltZW91dDtcblxuICAvLyBpbml0aWxhaXNlIHRoZSBuZWdvdGlhdGlvbiBoZWxwZXJzXG4gIHZhciBjcmVhdGVPZmZlciA9IG5lZ290aWF0ZSgnY3JlYXRlT2ZmZXInKTtcbiAgdmFyIGNyZWF0ZUFuc3dlciA9IG5lZ290aWF0ZSgnY3JlYXRlQW5zd2VyJyk7XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgcHJvY2Vzc2luZyBxdWV1ZSAob25lIGF0IGEgdGltZSBwbGVhc2UpXG4gIHZhciBxID0gYXN5bmMucXVldWUoZnVuY3Rpb24odGFzaywgY2IpIHtcbiAgICAvLyBpZiB0aGUgdGFzayBoYXMgbm8gb3BlcmF0aW9uLCB0aGVuIHRyaWdnZXIgdGhlIGNhbGxiYWNrIGltbWVkaWF0ZWx5XG4gICAgaWYgKHR5cGVvZiB0YXNrLm9wICE9ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBjYigpO1xuICAgIH1cblxuICAgIC8vIHByb2Nlc3MgdGhlIHRhc2sgb3BlcmF0aW9uXG4gICAgdGFzay5vcCh0YXNrLCBjYik7XG4gIH0sIDEpO1xuXG4gIC8vIGluaXRpYWxpc2Ugc2Vzc2lvbiBkZXNjcmlwdGlvbiBhbmQgaWNlY2FuZGlkYXRlIG9iamVjdHNcbiAgdmFyIFJUQ1Nlc3Npb25EZXNjcmlwdGlvbiA9IChvcHRzIHx8IHt9KS5SVENTZXNzaW9uRGVzY3JpcHRpb24gfHxcbiAgICBkZXRlY3QoJ1JUQ1Nlc3Npb25EZXNjcmlwdGlvbicpO1xuXG4gIHZhciBSVENJY2VDYW5kaWRhdGUgPSAob3B0cyB8fCB7fSkuUlRDSWNlQ2FuZGlkYXRlIHx8XG4gICAgZGV0ZWN0KCdSVENJY2VDYW5kaWRhdGUnKTtcblxuICBmdW5jdGlvbiBhYm9ydChzdGFnZSwgc2RwLCBjYikge1xuICAgIHZhciBzdGFnZUhhbmRsZXIgPSBzdGFnZXNbc3RhZ2VdO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVycikge1xuICAgICAgLy8gbG9nIHRoZSBlcnJvclxuICAgICAgY29uc29sZS5lcnJvcigncnRjL2NvdXBsZSBlcnJvciAoJyArIHN0YWdlICsgJyk6ICcsIGVycik7XG4gICAgICBxLnB1c2goeyBvcDogbG9ja1JlbGVhc2UgfSk7XG5cbiAgICAgIC8vIHJlYXR0ZW1wdCBjb3VwbGluZz9cbiAgICAgIGlmIChzdGFnZUhhbmRsZXIgJiYgYXR0ZW1wdCA8IG1heEF0dGVtcHRzICYmICghIGF0dGVtcHRUaW1lcikpIHtcbiAgICAgICAgYXR0ZW1wdFRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICBhdHRlbXB0ICs9IDE7XG4gICAgICAgICAgYXR0ZW1wdFRpbWVyID0gMDtcblxuICAgICAgICAgIGRlYnVnKCdyZWF0dGVtcHRpbmcgY29ubmVjdGlvbiAoYXR0ZW1wdDogJyArIGF0dGVtcHQgKyAnKScpO1xuICAgICAgICAgIHN0YWdlSGFuZGxlcigpO1xuICAgICAgICB9LCBhdHRlbXB0RGVsYXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGNiID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2IoZXJyKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gbmVnb3RpYXRlKG1ldGhvZE5hbWUpIHtcbiAgICB2YXIgaHNEZWJ1ZyA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKSgnaGFuZHNoYWtlLScgKyBtZXRob2ROYW1lKTtcblxuICAgIHJldHVybiBmdW5jdGlvbih0YXNrLCBjYikge1xuICAgICAgLy8gY3JlYXRlIHRoZSBvZmZlclxuICAgICAgZGVidWcoJ2NhbGxpbmcgJyArIG1ldGhvZE5hbWUpO1xuICAgICAgY29ublttZXRob2ROYW1lXShcbiAgICAgICAgZnVuY3Rpb24oZGVzYykge1xuXG4gICAgICAgICAgLy8gaWYgYSBmaWx0ZXIgaGFzIGJlZW4gc3BlY2lmaWVkLCB0aGVuIGFwcGx5IHRoZSBmaWx0ZXJcbiAgICAgICAgICBpZiAodHlwZW9mIHNkcEZpbHRlciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBkZXNjLnNkcCA9IHNkcEZpbHRlcihkZXNjLnNkcCwgY29ubiwgbWV0aG9kTmFtZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gaW5pdGlhbGlzZSB0aGUgbG9jYWwgZGVzY3JpcHRpb25cbiAgICAgICAgICBjb25uLnNldExvY2FsRGVzY3JpcHRpb24oXG4gICAgICAgICAgICBkZXNjLFxuXG4gICAgICAgICAgICAvLyBpZiBzdWNjZXNzZnVsLCB0aGVuIHNlbmQgdGhlIHNkcCBvdmVyIHRoZSB3aXJlXG4gICAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgLy8gc2VuZCB0aGUgc2RwXG4gICAgICAgICAgICAgIHNpZ25hbGxlci50byh0YXJnZXRJZCkuc2VuZCgnL3NkcCcsIGRlc2MpO1xuXG4gICAgICAgICAgICAgIC8vIGNhbGxiYWNrXG4gICAgICAgICAgICAgIGNiKCk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvLyBvbiBlcnJvciwgYWJvcnRcbiAgICAgICAgICAgIGFib3J0KG1ldGhvZE5hbWUsIGRlc2Muc2RwLCBjYilcbiAgICAgICAgICApO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIG9uIGVycm9yLCBhYm9ydFxuICAgICAgICBhYm9ydChtZXRob2ROYW1lLCAnJywgY2IpXG4gICAgICApO1xuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVMb2NhbENhbmRpZGF0ZShldnQpIHtcbiAgICBpZiAoZXZ0LmNhbmRpZGF0ZSkge1xuICAgICAgbG9jYWxDYW5kaWRhdGVzLnB1c2goZXZ0LmNhbmRpZGF0ZSk7XG4gICAgfVxuXG4gICAgaWYgKGNvbm4uaWNlR2F0aGVyaW5nU3RhdGUgPT09ICdjb21wbGV0ZScpIHtcbiAgICAgIGRlYnVnKCdpY2UgZ2F0aGVyaW5nIHN0YXRlIGNvbXBsZXRlLCBzZW5kaW5nIGNhbmRpZGF0ZXMnKVxuICAgICAgc2lnbmFsbGVyLnRvKHRhcmdldElkKS5zZW5kKCcvY2FuZGlkYXRlcycsIGxvY2FsQ2FuZGlkYXRlcy5zcGxpY2UoMCkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZVJlbW90ZUNhbmRpZGF0ZSh0YXJnZXRJZCwgZGF0YSkge1xuICAgIGlmICghIGNvbm4ucmVtb3RlRGVzY3JpcHRpb24pIHtcbiAgICAgIHJldHVybiBxdWV1ZWRDYW5kaWRhdGVzLnB1c2goZGF0YSk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbm4uYWRkSWNlQ2FuZGlkYXRlKG5ldyBSVENJY2VDYW5kaWRhdGUoZGF0YSkpO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgZGVidWcoJ2ludmFsaWRhdGUgY2FuZGlkYXRlIHNwZWNpZmllZDogJywgZGF0YSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlUmVtb3RlQ2FuZGlkYXRlQXJyYXkoZGF0YSwgc3JjKSB7XG4gICAgaWYgKCghIHNyYykgfHwgKHNyYy5pZCAhPT0gdGFyZ2V0SWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZGF0YS5mb3JFYWNoKGZ1bmN0aW9uKGNhbmRpZGF0ZSkge1xuICAgICAgaGFuZGxlUmVtb3RlQ2FuZGlkYXRlKHRhcmdldElkLCBjYW5kaWRhdGUpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlU2RwKGRhdGEsIHNyYykge1xuICAgIC8vIGlmIHRoZSBzb3VyY2UgaXMgdW5rbm93biBvciBub3QgYSBtYXRjaCwgdGhlbiBhYm9ydFxuICAgIGlmICgoISBzcmMpIHx8IChzcmMuaWQgIT09IHRhcmdldElkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIHByaW9yaXRpemUgc2V0dGluZyB0aGUgcmVtb3RlIGRlc2NyaXB0aW9uIG9wZXJhdGlvblxuICAgIHEucHVzaCh7IG9wOiBmdW5jdGlvbih0YXNrLCBjYikge1xuICAgICAgLy8gdXBkYXRlIHRoZSByZW1vdGUgZGVzY3JpcHRpb25cbiAgICAgIC8vIG9uY2Ugc3VjY2Vzc2Z1bCwgc2VuZCB0aGUgYW5zd2VyXG4gICAgICBjb25uLnNldFJlbW90ZURlc2NyaXB0aW9uKFxuICAgICAgICBuZXcgUlRDU2Vzc2lvbkRlc2NyaXB0aW9uKGRhdGEpLFxuXG4gICAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIC8vIGFwcGx5IGFueSBxdWV1ZWQgY2FuZGlkYXRlc1xuICAgICAgICAgIHF1ZXVlZENhbmRpZGF0ZXMuc3BsaWNlKDApLmZvckVhY2goZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgZGVidWcoJ2FwcGx5aW5nIHF1ZXVlZCBjYW5kaWRhdGUnKTtcbiAgICAgICAgICAgIGNvbm4uYWRkSWNlQ2FuZGlkYXRlKG5ldyBSVENJY2VDYW5kaWRhdGUoZGF0YSkpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gY3JlYXRlIHRoZSBhbnN3ZXJcbiAgICAgICAgICBpZiAoZGF0YS50eXBlID09PSAnb2ZmZXInKSB7XG4gICAgICAgICAgICBxdWV1ZShjcmVhdGVBbnN3ZXIpKCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gdHJpZ2dlciB0aGUgY2FsbGJhY2tcbiAgICAgICAgICBjYigpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFib3J0KGRhdGEudHlwZSA9PT0gJ29mZmVyJyA/ICdjcmVhdGVBbnN3ZXInIDogJ2NyZWF0ZU9mZmVyJywgZGF0YS5zZHAsIGNiKVxuICAgICAgKTtcbiAgICB9fSk7XG4gIH1cblxuICBmdW5jdGlvbiBsb2NrQWNxdWlyZSh0YXNrLCBjYikge1xuICAgIGRlYnVnKCdhdHRlbXB0aW5nIHRvIGFjcXVpcmUgbmVnb3RpYXRlIGxvY2sgd2l0aCB0YXJnZXQ6ICcgKyB0YXJnZXRJZCk7XG4gICAgc2lnbmFsbGVyLmxvY2sodGFyZ2V0SWQsIHsgbGFiZWw6ICduZWdvdGlhdGUnIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBkZWJ1ZygnZXJyb3IgZ2V0dGluZyBsb2NrLCByZXNldHRpbmcgcXVldWUnKTtcbiAgICAgICAgcXVldWVSZXNldCgpO1xuICAgICAgfVxuXG4gICAgICBjYihlcnIpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gbG9ja1JlbGVhc2UodGFzaywgY2IpIHtcbiAgICBzaWduYWxsZXIudW5sb2NrKHRhcmdldElkLCB7IGxhYmVsOiAnbmVnb3RpYXRlJyB9LCBjYik7XG4gIH1cblxuICBmdW5jdGlvbiBxdWV1ZShuZWdvdGlhdGVUYXNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcS5wdXNoKFtcbiAgICAgICAgeyBvcDogbG9ja0FjcXVpcmUgfSxcbiAgICAgICAgeyBvcDogbmVnb3RpYXRlVGFzayB9LFxuICAgICAgICB7IG9wOiBsb2NrUmVsZWFzZSB9XG4gICAgICBdKTtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gcXVldWVSZXNldCgpIHtcbiAgICBxLnRhc2tzLnNwbGljZSgwKTtcbiAgfVxuXG4gIC8vIGlmIHRoZSB0YXJnZXQgaWQgaXMgbm90IGEgc3RyaW5nLCB0aGVuIGNvbXBsYWluXG4gIGlmICh0eXBlb2YgdGFyZ2V0SWQgIT0gJ3N0cmluZycgJiYgKCEgKHRhcmdldElkIGluc3RhbmNlb2YgU3RyaW5nKSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJzJuZCBhcmd1bWVudCAodGFyZ2V0SWQpIHNob3VsZCBiZSBhIHN0cmluZycpO1xuICB9XG5cbiAgLy8gd2hlbiByZWdvdGlhdGlvbiBpcyBuZWVkZWQgbG9vayBmb3IgdGhlIHBlZXJcbiAgY29ubi5hZGRFdmVudExpc3RlbmVyKCduZWdvdGlhdGlvbm5lZWRlZCcsIGZ1bmN0aW9uKCkge1xuICAgIGRlYnVnKCdyZW5lZ290aWF0aW9uIHJlcXVpcmVkLCB3aWxsIGNyZWF0ZSBvZmZlciBpbiA1MG1zJyk7XG4gICAgY2xlYXJUaW1lb3V0KG9mZmVyVGltZW91dCk7XG4gICAgb2ZmZXJUaW1lb3V0ID0gc2V0VGltZW91dChxdWV1ZShjcmVhdGVPZmZlciksIDUwKTtcbiAgfSk7XG5cbiAgY29ubi5hZGRFdmVudExpc3RlbmVyKCdpY2VjYW5kaWRhdGUnLCBoYW5kbGVMb2NhbENhbmRpZGF0ZSk7XG5cbiAgLy8gd2hlbiB3ZSByZWNlaXZlIHNkcCwgdGhlblxuICBzaWduYWxsZXIub24oJ3NkcCcsIGhhbmRsZVNkcCk7XG4gIHNpZ25hbGxlci5vbignY2FuZGlkYXRlcycsIGhhbmRsZVJlbW90ZUNhbmRpZGF0ZUFycmF5KTtcblxuICAvLyB3aGVuIHRoZSBjb25uZWN0aW9uIGNsb3NlcywgcmVtb3ZlIGV2ZW50IGhhbmRsZXJzXG4gIG1vbi5vbmNlKCdjbG9zZWQnLCBmdW5jdGlvbigpIHtcbiAgICBkZWJ1ZygnY2xvc2VkJyk7XG5cbiAgICAvLyByZW1vdmUgbGlzdGVuZXJzXG4gICAgc2lnbmFsbGVyLnJlbW92ZUxpc3RlbmVyKCdzZHAnLCBoYW5kbGVTZHApO1xuICAgIHNpZ25hbGxlci5yZW1vdmVMaXN0ZW5lcignY2FuZGlkYXRlcycsIGhhbmRsZVJlbW90ZUNhbmRpZGF0ZUFycmF5KTtcbiAgfSk7XG5cbiAgLy8gcGF0Y2ggaW4gdGhlIGNyZWF0ZSBvZmZlciBmdW5jdGlvbnNcbiAgbW9uLmNyZWF0ZU9mZmVyID0gcXVldWUoY3JlYXRlT2ZmZXIpO1xuXG4gIHJldHVybiBtb247XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY291cGxlOyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICAjIyBydGMvZGV0ZWN0XG5cbiAgUHJvdmlkZSB0aGUgW3J0Yy1jb3JlL2RldGVjdF0oaHR0cHM6Ly9naXRodWIuY29tL3J0Yy1pby9ydGMtY29yZSNkZXRlY3QpIFxuICBmdW5jdGlvbmFsaXR5LlxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJ3J0Yy1jb3JlL2RldGVjdCcpOyIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2NvZy9sb2dnZXInKSgnZ2VuZXJhdG9ycycpO1xudmFyIGRldGVjdCA9IHJlcXVpcmUoJy4vZGV0ZWN0Jyk7XG52YXIgZGVmYXVsdHMgPSByZXF1aXJlKCdjb2cvZGVmYXVsdHMnKTtcblxudmFyIG1hcHBpbmdzID0ge1xuICBjcmVhdGU6IHtcbiAgICAvLyBkYXRhIGVuYWJsZXJcbiAgICBkYXRhOiBmdW5jdGlvbihjKSB7XG4gICAgICBpZiAoISBkZXRlY3QubW96KSB7XG4gICAgICAgIGMub3B0aW9uYWwgPSAoYy5vcHRpb25hbCB8fCBbXSkuY29uY2F0KHsgUnRwRGF0YUNoYW5uZWxzOiB0cnVlIH0pO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBkdGxzOiBmdW5jdGlvbihjKSB7XG4gICAgICBpZiAoISBkZXRlY3QubW96KSB7XG4gICAgICAgIGMub3B0aW9uYWwgPSAoYy5vcHRpb25hbCB8fCBbXSkuY29uY2F0KHsgRHRsc1NydHBLZXlBZ3JlZW1lbnQ6IHRydWUgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG4vLyBpbml0aWFsaXNlIGtub3duIGZsYWdzXG52YXIga25vd25GbGFncyA9IFsndmlkZW8nLCAnYXVkaW8nLCAnZGF0YSddO1xuXG4vKipcbiAgIyMgcnRjL2dlbmVyYXRvcnNcblxuICBUaGUgZ2VuZXJhdG9ycyBwYWNrYWdlIHByb3ZpZGVzIHNvbWUgdXRpbGl0eSBtZXRob2RzIGZvciBnZW5lcmF0aW5nXG4gIGNvbnN0cmFpbnQgb2JqZWN0cyBhbmQgc2ltaWxhciBjb25zdHJ1Y3RzLlxuXG4gIGBgYGpzXG4gIHZhciBnZW5lcmF0b3JzID0gcmVxdWlyZSgncnRjL2dlbmVyYXRvcnMnKTtcbiAgYGBgXG5cbioqL1xuXG4vKipcbiAgIyMjIGdlbmVyYXRvcnMuY29uZmlnKGNvbmZpZylcblxuICBHZW5lcmF0ZSBhIGNvbmZpZ3VyYXRpb24gb2JqZWN0IHN1aXRhYmxlIGZvciBwYXNzaW5nIGludG8gYW4gVzNDXG4gIFJUQ1BlZXJDb25uZWN0aW9uIGNvbnN0cnVjdG9yIGZpcnN0IGFyZ3VtZW50LCBiYXNlZCBvbiBvdXIgY3VzdG9tIGNvbmZpZy5cbioqL1xuZXhwb3J0cy5jb25maWcgPSBmdW5jdGlvbihjb25maWcpIHtcbiAgcmV0dXJuIGRlZmF1bHRzKGNvbmZpZywge1xuICAgIGljZVNlcnZlcnM6IFtdXG4gIH0pO1xufTtcblxuLyoqXG4gICMjIyBnZW5lcmF0b3JzLmNvbm5lY3Rpb25Db25zdHJhaW50cyhmbGFncywgY29uc3RyYWludHMpXG5cbiAgVGhpcyBpcyBhIGhlbHBlciBmdW5jdGlvbiB0aGF0IHdpbGwgZ2VuZXJhdGUgYXBwcm9wcmlhdGUgY29ubmVjdGlvblxuICBjb25zdHJhaW50cyBmb3IgYSBuZXcgYFJUQ1BlZXJDb25uZWN0aW9uYCBvYmplY3Qgd2hpY2ggaXMgY29uc3RydWN0ZWRcbiAgaW4gdGhlIGZvbGxvd2luZyB3YXk6XG5cbiAgYGBganNcbiAgdmFyIGNvbm4gPSBuZXcgUlRDUGVlckNvbm5lY3Rpb24oZmxhZ3MsIGNvbnN0cmFpbnRzKTtcbiAgYGBgXG5cbiAgSW4gbW9zdCBjYXNlcyB0aGUgY29uc3RyYWludHMgb2JqZWN0IGNhbiBiZSBsZWZ0IGVtcHR5LCBidXQgd2hlbiBjcmVhdGluZ1xuICBkYXRhIGNoYW5uZWxzIHNvbWUgYWRkaXRpb25hbCBvcHRpb25zIGFyZSByZXF1aXJlZC4gIFRoaXMgZnVuY3Rpb25cbiAgY2FuIGdlbmVyYXRlIHRob3NlIGFkZGl0aW9uYWwgb3B0aW9ucyBhbmQgaW50ZWxsaWdlbnRseSBjb21iaW5lIGFueVxuICB1c2VyIGRlZmluZWQgY29uc3RyYWludHMgKGluIGBjb25zdHJhaW50c2ApIHdpdGggc2hvcnRoYW5kIGZsYWdzIHRoYXRcbiAgbWlnaHQgYmUgcGFzc2VkIHdoaWxlIHVzaW5nIHRoZSBgcnRjLmNyZWF0ZUNvbm5lY3Rpb25gIGhlbHBlci5cbioqL1xuZXhwb3J0cy5jb25uZWN0aW9uQ29uc3RyYWludHMgPSBmdW5jdGlvbihmbGFncywgY29uc3RyYWludHMpIHtcbiAgdmFyIGdlbmVyYXRlZCA9IHt9O1xuICB2YXIgbSA9IG1hcHBpbmdzLmNyZWF0ZTtcbiAgdmFyIG91dDtcblxuICAvLyBpdGVyYXRlIHRocm91Z2ggdGhlIGZsYWdzIGFuZCBhcHBseSB0aGUgY3JlYXRlIG1hcHBpbmdzXG4gIE9iamVjdC5rZXlzKGZsYWdzIHx8IHt9KS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmIChtW2tleV0pIHtcbiAgICAgIG1ba2V5XShnZW5lcmF0ZWQpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gZ2VuZXJhdGUgdGhlIGNvbm5lY3Rpb24gY29uc3RyYWludHNcbiAgb3V0ID0gZGVmYXVsdHMoe30sIGNvbnN0cmFpbnRzLCBnZW5lcmF0ZWQpO1xuICBkZWJ1ZygnZ2VuZXJhdGVkIGNvbm5lY3Rpb24gY29uc3RyYWludHM6ICcsIG91dCk7XG5cbiAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICAjIyMgcGFyc2VGbGFncyhvcHRzKVxuXG4gIFRoaXMgaXMgYSBoZWxwZXIgZnVuY3Rpb24gdGhhdCB3aWxsIGV4dHJhY3Qga25vd24gZmxhZ3MgZnJvbSBhIGdlbmVyaWNcbiAgb3B0aW9ucyBvYmplY3QuXG4qKi9cbnZhciBwYXJzZUZsYWdzID0gZXhwb3J0cy5wYXJzZUZsYWdzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAvLyBlbnN1cmUgd2UgaGF2ZSBvcHRzXG4gIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcblxuICAvLyBkZWZhdWx0IHZpZGVvIGFuZCBhdWRpbyBmbGFncyB0byB0cnVlIGlmIHVuZGVmaW5lZFxuICBvcHRzLnZpZGVvID0gb3B0cy52aWRlbyB8fCB0eXBlb2Ygb3B0cy52aWRlbyA9PSAndW5kZWZpbmVkJztcbiAgb3B0cy5hdWRpbyA9IG9wdHMuYXVkaW8gfHwgdHlwZW9mIG9wdHMuYXVkaW8gPT0gJ3VuZGVmaW5lZCc7XG5cbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9wdHMgfHwge30pXG4gICAgLmZpbHRlcihmdW5jdGlvbihmbGFnKSB7XG4gICAgICByZXR1cm4gb3B0c1tmbGFnXTtcbiAgICB9KVxuICAgIC5tYXAoZnVuY3Rpb24oZmxhZykge1xuICAgICAgcmV0dXJuIGZsYWcudG9Mb3dlckNhc2UoKTtcbiAgICB9KVxuICAgIC5maWx0ZXIoZnVuY3Rpb24oZmxhZykge1xuICAgICAgcmV0dXJuIGtub3duRmxhZ3MuaW5kZXhPZihmbGFnKSA+PSAwO1xuICAgIH0pO1xufTsiLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICAjIHJ0Y1xuXG4gIFRoZSBgcnRjYCBwYWNrYWdlIGlzIGEgY29udmVuaWVuY2UgbGF5ZXIgZm9yIHdvcmtpbmcgd2l0aCB0aGUgcnRjLmlvIHRvb2xraXQuXG4gIENvbnNpZGVyIGl0IGEgYm94ZWQgc2V0IG9mIGxlZ28gb2YgdGhlIG1vc3QgY29tbW9uIHBpZWNlcyByZXF1aXJlZCB0byBidWlsZFxuICB0aGUgZnJvbnQtZW5kIGNvbXBvbmVudCBvZiBhIFdlYlJUQyBhcHBsaWNhdGlvbi5cblxuICAjIyBHZXR0aW5nIFN0YXJ0ZWRcblxuICBUTyBCRSBDT01QTEVURUQuXG5cbioqL1xuXG52YXIgZ2VuID0gcmVxdWlyZSgnLi9nZW5lcmF0b3JzJyk7XG5cbi8vIGV4cG9ydCBkZXRlY3RcbnZhciBkZXRlY3QgPSBleHBvcnRzLmRldGVjdCA9IHJlcXVpcmUoJy4vZGV0ZWN0Jyk7XG5cbi8vIGV4cG9ydCBjb2cgbG9nZ2VyIGZvciBjb252ZW5pZW5jZVxuZXhwb3J0cy5sb2dnZXIgPSByZXF1aXJlKCdjb2cvbG9nZ2VyJyk7XG5cbi8vIGV4cG9ydCBwZWVyIGNvbm5lY3Rpb25cbnZhciBSVENQZWVyQ29ubmVjdGlvbiA9XG5leHBvcnRzLlJUQ1BlZXJDb25uZWN0aW9uID0gZGV0ZWN0KCdSVENQZWVyQ29ubmVjdGlvbicpO1xuXG4vLyBhZGQgdGhlIGNvdXBsZSB1dGlsaXR5XG5leHBvcnRzLmNvdXBsZSA9IHJlcXVpcmUoJy4vY291cGxlJyk7XG5cbi8qKlxuICAjIyBGYWN0b3JpZXNcbioqL1xuXG4vKipcbiAgIyMjIGNyZWF0ZUNvbm5lY3Rpb24ob3B0cz8sIGNvbnN0cmFpbnRzPylcblxuICBDcmVhdGUgYSBuZXcgYFJUQ1BlZXJDb25uZWN0aW9uYCBhdXRvIGdlbmVyYXRpbmcgZGVmYXVsdCBvcHRzIGFzIHJlcXVpcmVkLlxuXG4gIGBgYGpzXG4gIHZhciBjb25uO1xuXG4gIC8vIHRoaXMgaXMgb2tcbiAgY29ubiA9IHJ0Yy5jcmVhdGVDb25uZWN0aW9uKCk7XG5cbiAgLy8gYW5kIHNvIGlzIHRoaXNcbiAgY29ubiA9IHJ0Yy5jcmVhdGVDb25uZWN0aW9uKHtcbiAgICBpY2VTZXJ2ZXJzOiBbXVxuICB9KTtcbiAgYGBgXG4qKi9cbmV4cG9ydHMuY3JlYXRlQ29ubmVjdGlvbiA9IGZ1bmN0aW9uKG9wdHMsIGNvbnN0cmFpbnRzKSB7XG4gIHJldHVybiBuZXcgUlRDUGVlckNvbm5lY3Rpb24oXG4gICAgLy8gZ2VuZXJhdGUgdGhlIGNvbmZpZyBiYXNlZCBvbiBvcHRpb25zIHByb3ZpZGVkXG4gICAgZ2VuLmNvbmZpZyhvcHRzKSxcblxuICAgIC8vIGdlbmVyYXRlIGFwcHJvcHJpYXRlIGNvbm5lY3Rpb24gY29uc3RyYWludHNcbiAgICBnZW4uY29ubmVjdGlvbkNvbnN0cmFpbnRzKG9wdHMsIGNvbnN0cmFpbnRzKVxuICApO1xufTsiLCJ2YXIgcHJvY2Vzcz1yZXF1aXJlKFwiX19icm93c2VyaWZ5X3Byb2Nlc3NcIik7LyoganNoaW50IG5vZGU6IHRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIGRlYnVnID0gcmVxdWlyZSgnY29nL2xvZ2dlcicpKCdtb25pdG9yJyk7XG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIFczQ19TVEFURVMgPSB7XG4gIE5FVzogJ25ldycsXG4gIExPQ0FMX09GRkVSOiAnaGF2ZS1sb2NhbC1vZmZlcicsXG4gIExPQ0FMX1BSQU5TV0VSOiAnaGF2ZS1sb2NhbC1wcmFuc3dlcicsXG4gIFJFTU9URV9QUkFOU1dFUjogJ2hhdmUtcmVtb3RlLXByYW5zd2VyJyxcbiAgQUNUSVZFOiAnYWN0aXZlJyxcbiAgQ0xPU0VEOiAnY2xvc2VkJ1xufTtcblxuLyoqXG4gICMjIHJ0Yy9tb25pdG9yXG5cbiAgSW4gbW9zdCBjdXJyZW50IGltcGxlbWVudGF0aW9ucyBvZiBgUlRDUGVlckNvbm5lY3Rpb25gIGl0IGlzIHF1aXRlXG4gIGRpZmZpY3VsdCB0byBkZXRlcm1pbmUgd2hldGhlciBhIHBlZXIgY29ubmVjdGlvbiBpcyBhY3RpdmUgYW5kIHJlYWR5XG4gIGZvciB1c2Ugb3Igbm90LiAgVGhlIG1vbml0b3IgcHJvdmlkZXMgc29tZSBhc3Npc3RhbmNlIGhlcmUgYnkgcHJvdmlkaW5nXG4gIGEgc2ltcGxlIGZ1bmN0aW9uIHRoYXQgcHJvdmlkZXMgYW4gYEV2ZW50RW1pdHRlcmAgd2hpY2ggZ2l2ZXMgdXBkYXRlc1xuICBvbiBhIGNvbm5lY3Rpb25zIHN0YXRlLlxuXG4gICMjIyBtb25pdG9yKHBjKSAtPiBFdmVudEVtaXR0ZXJcblxuICBgYGBqc1xuICB2YXIgbW9uaXRvciA9IHJlcXVpcmUoJ3J0Yy9tb25pdG9yJyk7XG4gIHZhciBwYyA9IG5ldyBSVENQZWVyQ29ubmVjdGlvbihjb25maWcpO1xuXG4gIC8vIHdhdGNoIHBjIGFuZCB3aGVuIGFjdGl2ZSBkbyBzb21ldGhpbmdcbiAgbW9uaXRvcihwYykub25jZSgnYWN0aXZlJywgZnVuY3Rpb24oKSB7XG4gICAgLy8gYWN0aXZlIGFuZCByZWFkeSB0byBnb1xuICB9KTtcbiAgYGBgXG5cbiAgRXZlbnRzIHByb3ZpZGVkIGJ5IHRoZSBtb25pdG9yIGFyZSBhcyBmb2xsb3dzOlxuXG4gIC0gYGFjdGl2ZWA6IHRyaWdnZXJlZCB3aGVuIHRoZSBjb25uZWN0aW9uIGlzIGFjdGl2ZSBhbmQgcmVhZHkgZm9yIHVzZVxuICAtIGBzdGFibGVgOiB0cmlnZ2VyZWQgd2hlbiB0aGUgY29ubmVjdGlvbiBpcyBpbiBhIHN0YWJsZSBzaWduYWxsaW5nIHN0YXRlXG4gIC0gYHVuc3RhYmxlYDogdHJpZ2dlciB3aGVuIHRoZSBjb25uZWN0aW9uIGlzIHJlbmVnb3RpYXRpbmcuXG5cbiAgSXQgc2hvdWxkIGJlIG5vdGVkLCB0aGF0IHRoZSBtb25pdG9yIGRvZXMgYSBjaGVjayB3aGVuIGl0IGlzIGZpcnN0IHBhc3NlZFxuICBhbiBgUlRDUGVlckNvbm5lY3Rpb25gIG9iamVjdCB0byBzZWUgaWYgdGhlIGBhY3RpdmVgIHN0YXRlIHBhc3NlcyBjaGVja3MuXG4gIElmIHNvLCB0aGUgYGFjdGl2ZWAgZXZlbnQgd2lsbCBiZSBmaXJlZCBpbiB0aGUgbmV4dCB0aWNrLlxuXG4gIElmIHlvdSByZXF1aXJlIGEgc3luY2hyb25vdXMgY2hlY2sgb2YgYSBjb25uZWN0aW9uJ3MgXCJvcGVubmVzc1wiIHRoZW5cbiAgdXNlIHRoZSBgbW9uaXRvci5pc0FjdGl2ZWAgdGVzdCBvdXRsaW5lZCBiZWxvdy5cbioqL1xudmFyIG1vbml0b3IgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHBjLCB0YWcpIHtcbiAgLy8gY3JlYXRlIGEgbmV3IGV2ZW50IGVtaXR0ZXIgd2hpY2ggd2lsbCBjb21tdW5pY2F0ZSBldmVudHNcbiAgdmFyIG1vbiA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgdmFyIGN1cnJlbnRTdGF0ZSA9IGdldFN0YXRlKHBjKTtcbiAgdmFyIGlzQWN0aXZlID0gbW9uLmFjdGl2ZSA9IGN1cnJlbnRTdGF0ZSA9PT0gVzNDX1NUQVRFUy5BQ1RJVkU7XG5cbiAgZnVuY3Rpb24gY2hlY2tTdGF0ZSgpIHtcbiAgICB2YXIgbmV3U3RhdGUgPSBnZXRTdGF0ZShwYywgdGFnKTtcbiAgICBkZWJ1ZygnY2FwdHVyZWQgc3RhdGUgY2hhbmdlLCBuZXcgc3RhdGU6ICcgKyBuZXdTdGF0ZSArXG4gICAgICAnLCBjdXJyZW50IHN0YXRlOiAnICsgY3VycmVudFN0YXRlKTtcblxuICAgIC8vIHVwZGF0ZSB0aGUgbW9uaXRvciBhY3RpdmUgZmxhZ1xuICAgIG1vbi5hY3RpdmUgPSBuZXdTdGF0ZSA9PT0gVzNDX1NUQVRFUy5BQ1RJVkU7XG5cbiAgICAvLyBpZiB3ZSBoYXZlIGEgc3RhdGUgY2hhbmdlLCBlbWl0IGFuIGV2ZW50IGZvciB0aGUgbmV3IHN0YXRlXG4gICAgaWYgKG5ld1N0YXRlICE9PSBjdXJyZW50U3RhdGUpIHtcbiAgICAgIG1vbi5lbWl0KGN1cnJlbnRTdGF0ZSA9IG5ld1N0YXRlKTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgY3VycmVudCBzdGF0ZSBpcyBhY3RpdmUsIHRyaWdnZXIgdGhlIGFjdGl2ZSBldmVudFxuICBpZiAoaXNBY3RpdmUpIHtcbiAgICBwcm9jZXNzLm5leHRUaWNrKG1vbi5lbWl0LmJpbmQobW9uLCBXM0NfU1RBVEVTLkFDVElWRSwgcGMpKTtcbiAgfVxuXG4gIC8vIHN0YXJ0IHdhdGNoaW5nIHN0dWZmIG9uIHRoZSBwY1xuICBwYy5hZGRFdmVudExpc3RlbmVyKCdzaWduYWxpbmdzdGF0ZWNoYW5nZScsIGNoZWNrU3RhdGUpO1xuICBwYy5hZGRFdmVudExpc3RlbmVyKCdpY2Vjb25uZWN0aW9uc3RhdGVjaGFuZ2UnLCBjaGVja1N0YXRlKTtcblxuICAvLyBwYXRjaCBpbiBhIHN0b3AgbWV0aG9kIGludG8gdGhlIGVtaXR0ZXJcbiAgbW9uLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgICBwYy5yZW1vdmVFdmVudExpc3RlbmVyKCdzaWduYWxpbmdzdGF0ZWNoYW5nZScsIGNoZWNrU3RhdGUpO1xuICAgIHBjLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ljZWNvbm5lY3Rpb25zdGF0ZWNoYW5nZScsIGNoZWNrU3RhdGUpO1xuICB9O1xuXG4gIHJldHVybiBtb247XG59O1xuXG4vKipcbiAgIyMjIG1vbml0b3IuZ2V0U3RhdGUocGMpXG5cbiAgUHJvdmlkZXMgYSB1bmlmaWVkIHN0YXRlIGRlZmluaXRpb24gZm9yIHRoZSBSVENQZWVyQ29ubmVjdGlvbiBiYXNlZFxuICBvbiBhIGZldyBjaGVja3MuXG5cbiAgSW4gZW1lcmdpbmcgdmVyc2lvbnMgb2YgdGhlIHNwZWMgd2UgaGF2ZSB2YXJpb3VzIHByb3BlcnRpZXMgc3VjaCBhc1xuICBgcmVhZHlTdGF0ZWAgdGhhdCBwcm92aWRlIGEgZGVmaW5pdGl2ZSBhbnN3ZXIgb24gdGhlIHN0YXRlIG9mIHRoZSBcbiAgY29ubmVjdGlvbi4gIEluIG9sZGVyIHZlcnNpb25zIHdlIG5lZWQgdG8gbG9vayBhdCB0aGluZ3MgbGlrZVxuICBgc2lnbmFsaW5nU3RhdGVgIGFuZCBgaWNlR2F0aGVyaW5nU3RhdGVgIHRvIG1ha2UgYW4gZWR1Y2F0ZWQgZ3Vlc3MgXG4gIGFzIHRvIHRoZSBjb25uZWN0aW9uIHN0YXRlLlxuKiovXG52YXIgZ2V0U3RhdGUgPSBtb25pdG9yLmdldFN0YXRlID0gZnVuY3Rpb24ocGMsIHRhZykge1xuICB2YXIgc2lnbmFsaW5nU3RhdGUgPSBwYyAmJiBwYy5zaWduYWxpbmdTdGF0ZTtcbiAgdmFyIGljZUdhdGhlcmluZ1N0YXRlID0gcGMgJiYgcGMuaWNlR2F0aGVyaW5nU3RhdGU7XG4gIHZhciBpY2VDb25uZWN0aW9uU3RhdGUgPSBwYyAmJiBwYy5pY2VDb25uZWN0aW9uU3RhdGU7XG4gIHZhciBsb2NhbERlc2M7XG4gIHZhciByZW1vdGVEZXNjO1xuICB2YXIgc3RhdGU7XG4gIHZhciBpc0FjdGl2ZTtcblxuICAvLyBpZiBubyBjb25uZWN0aW9uIHJldHVybiBjbG9zZWRcbiAgaWYgKCEgcGMpIHtcbiAgICByZXR1cm4gVzNDX1NUQVRFUy5DTE9TRUQ7XG4gIH1cblxuICAvLyBpbml0aWFsaXNlIHRoZSB0YWcgdG8gYW4gZW1wdHkgc3RyaW5nIGlmIG5vdCBwcm92aWRlZFxuICB0YWcgPSB0YWcgfHwgJyc7XG5cbiAgLy8gZ2V0IHRoZSBjb25uZWN0aW9uIGxvY2FsIGFuZCByZW1vdGUgZGVzY3JpcHRpb25cbiAgbG9jYWxEZXNjID0gcGMubG9jYWxEZXNjcmlwdGlvbjtcbiAgcmVtb3RlRGVzYyA9IHBjLnJlbW90ZURlc2NyaXB0aW9uO1xuXG4gIC8vIHVzZSB0aGUgc2lnbmFsbGluZyBzdGF0ZVxuICBzdGF0ZSA9IHNpZ25hbGluZ1N0YXRlO1xuXG4gIC8vIGlmIHN0YXRlID09ICdzdGFibGUnIHRoZW4gaW52ZXN0aWdhdGVcbiAgaWYgKHN0YXRlID09PSAnc3RhYmxlJykge1xuICAgIC8vIGluaXRpYWxpc2UgdGhlIHN0YXRlIHRvIG5ld1xuICAgIHN0YXRlID0gVzNDX1NUQVRFUy5ORVc7XG5cbiAgICAvLyBpZiB3ZSBoYXZlIGEgbG9jYWwgZGVzY3JpcHRpb24gYW5kIHJlbW90ZSBkZXNjcmlwdGlvbiBmbGFnXG4gICAgLy8gYXMgcHJhbnN3ZXJlZFxuICAgIGlmIChsb2NhbERlc2MgJiYgcmVtb3RlRGVzYykge1xuICAgICAgc3RhdGUgPSBXM0NfU1RBVEVTLlJFTU9URV9QUkFOU1dFUjtcbiAgICB9XG4gIH1cblxuICAvLyBjaGVjayB0byBzZWUgaWYgd2UgYXJlIGluIHRoZSBhY3RpdmUgc3RhdGVcbiAgaXNBY3RpdmUgPSAoc3RhdGUgPT09IFczQ19TVEFURVMuUkVNT1RFX1BSQU5TV0VSKSAmJlxuICAgIChpY2VDb25uZWN0aW9uU3RhdGUgPT09ICdjb25uZWN0ZWQnKTtcblxuICBkZWJ1Zyh0YWcgKyAnc2lnbmFsaW5nIHN0YXRlOiAnICsgc2lnbmFsaW5nU3RhdGUgK1xuICAgICcsIGljZUdhdGhlcmluZ1N0YXRlOiAnICsgaWNlR2F0aGVyaW5nU3RhdGUgK1xuICAgICcsIGljZUNvbm5lY3Rpb25TdGF0ZTogJyArIGljZUNvbm5lY3Rpb25TdGF0ZSk7XG4gIFxuICByZXR1cm4gaXNBY3RpdmUgPyBXM0NfU1RBVEVTLkFDVElWRSA6IHN0YXRlO1xufTtcblxuLyoqXG4gICMjIyBtb25pdG9yLmlzQWN0aXZlKHBjKSAtPiBCb29sZWFuXG5cbiAgVGVzdCBhbiBgUlRDUGVlckNvbm5lY3Rpb25gIHRvIHNlZSBpZiBpdCdzIGN1cnJlbnRseSBvcGVuLiAgVGhlIHRlc3QgZm9yXG4gIFwib3Blbm5lc3NcIiBsb29rcyBhdCBhIGNvbWJpbmF0aW9uIG9mIGN1cnJlbnQgYHNpZ25hbGluZ1N0YXRlYCBhbmRcbiAgYGljZUdhdGhlcmluZ1N0YXRlYC5cbioqL1xubW9uaXRvci5pc0FjdGl2ZSA9IGZ1bmN0aW9uKHBjKSB7XG4gIHZhciBpc1N0YWJsZSA9IHBjICYmIHBjLnNpZ25hbGluZ1N0YXRlID09PSAnc3RhYmxlJztcblxuICAvLyByZXR1cm4gd2l0aCB0aGUgY29ubmVjdGlvbiBpcyBhY3RpdmVcbiAgcmV0dXJuIGlzU3RhYmxlICYmIGdldFN0YXRlKHBjKSA9PT0gVzNDX1NUQVRFUy5BQ1RJVkU7XG59OyIsInZhciBwYXJzZXIgPSByZXF1aXJlKCcuL2xpYi9wYXJzZXInKTtcbnZhciB3cml0ZXIgPSByZXF1aXJlKCcuL2xpYi93cml0ZXInKTtcblxuZXhwb3J0cy53cml0ZSA9IHdyaXRlcjtcbmV4cG9ydHMucGFyc2UgPSBwYXJzZXIucGFyc2U7XG5leHBvcnRzLnBhcnNlRm10cENvbmZpZyA9IHBhcnNlci5wYXJzZUZtdHBDb25maWc7XG5leHBvcnRzLnBhcnNlUGF5bG9hZHMgPSBwYXJzZXIucGFyc2VQYXlsb2FkcztcbmV4cG9ydHMucGFyc2VSZW1vdGVDYW5kaWRhdGVzID0gcGFyc2VyLnBhcnNlUmVtb3RlQ2FuZGlkYXRlcztcbiIsInZhciBncmFtbWFyID0gbW9kdWxlLmV4cG9ydHMgPSB7XG4gIHY6IFt7XG4gICAgICBuYW1lOiAndmVyc2lvbicsXG4gICAgICByZWc6IC9eKFxcZCopJC9cbiAgfV0sXG4gIG86IFt7IC8vbz0tIDIwNTE4IDAgSU4gSVA0IDIwMy4wLjExMy4xXG4gICAgLy8gTkI6IHNlc3Npb25JZCB3aWxsIGJlIGEgU3RyaW5nIGluIG1vc3QgY2FzZXMgYmVjYXVzZSBpdCBpcyBodWdlXG4gICAgbmFtZTogJ29yaWdpbicsXG4gICAgcmVnOiAvXihcXFMqKSAoXFxkKikgKFxcZCopIChcXFMqKSBJUChcXGQpICguKikvLFxuICAgIG5hbWVzOiBbJ3VzZXJuYW1lJywgJ3Nlc3Npb25JZCcsICdzZXNzaW9uVmVyc2lvbicsICduZXRUeXBlJywgJ2lwVmVyJywgJ2FkZHJlc3MnXSxcbiAgICBmb3JtYXQ6IFwiJXMgJXMgJWQgJXMgSVAlZCAlc1wiXG4gIH1dLFxuICAvLyBkZWZhdWx0IHBhcnNpbmcgb2YgdGhlc2Ugb25seSAodGhvdWdoIHNvbWUgb2YgdGhlc2UgZmVlbCBvdXRkYXRlZClcbiAgczogW3sgbmFtZTogJ25hbWUnIH1dLFxuICBpOiBbeyBuYW1lOiAnZGVzY3JpcHRpb24nIH1dLFxuICB1OiBbeyBuYW1lOiAndXJpJyB9XSxcbiAgZTogW3sgbmFtZTogJ2VtYWlsJyB9XSxcbiAgcDogW3sgbmFtZTogJ3Bob25lJyB9XSxcbiAgejogW3sgbmFtZTogJ3RpbWV6b25lcycgfV0sIC8vIFRPRE86IHRoaXMgb25lIGNhbiBhY3R1YWxseSBiZSBwYXJzZWQgcHJvcGVybHkuLlxuICByOiBbeyBuYW1lOiAncmVwZWF0cycgfV0sICAgLy8gVE9ETzogdGhpcyBvbmUgY2FuIGFsc28gYmUgcGFyc2VkIHByb3Blcmx5XG4gIC8vazogW3t9XSwgLy8gb3V0ZGF0ZWQgdGhpbmcgaWdub3JlZFxuICB0OiBbeyAvL3Q9MCAwXG4gICAgbmFtZTogJ3RpbWluZycsXG4gICAgcmVnOiAvXihcXGQqKSAoXFxkKikvLFxuICAgIG5hbWVzOiBbJ3N0YXJ0JywgJ3N0b3AnXSxcbiAgICBmb3JtYXQ6IFwiJWQgJWRcIlxuICB9XSxcbiAgYzogW3sgLy9jPUlOIElQNCAxMC40Ny4xOTcuMjZcbiAgICAgIG5hbWU6ICdjb25uZWN0aW9uJyxcbiAgICAgIHJlZzogL15JTiBJUChcXGQpICguKikvLFxuICAgICAgbmFtZXM6IFsndmVyc2lvbicsICdpcCddLFxuICAgICAgZm9ybWF0OiBcIklOIElQJWQgJXNcIlxuICB9XSxcbiAgYjogW3sgLy9iPUFTOjQwMDBcbiAgICAgIHB1c2g6ICdiYW5kd2lkdGgnLFxuICAgICAgcmVnOiAvXihUSUFTfEFTfENUfFJSfFJTKVxcOihcXGQqKS8sXG4gICAgICBuYW1lczogWyd0eXBlJywgJ2xpbWl0J10sXG4gICAgICBmb3JtYXQ6IFwiJXM6JXNcIlxuICB9XSxcbiAgbTogW3sgLy9tPXZpZGVvIDUxNzQ0IFJUUC9BVlAgMTI2IDk3IDk4IDM0IDMxXG4gICAgICAvLyBOQjogc3BlY2lhbCAtIHB1c2hlcyB0byBzZXNzaW9uXG4gICAgICAvLyBUT0RPOiBydHAvZm10cCBzaG91bGQgYmUgZmlsdGVyZWQgYnkgdGhlIHBheWxvYWRzIGZvdW5kIGhlcmU/XG4gICAgICByZWc6IC9eKFxcdyopIChcXGQqKSAoW1xcd1xcL10qKVxccz8oLiopPy8sXG4gICAgICBuYW1lczogWyd0eXBlJywgJ3BvcnQnLCAncHJvdG9jb2wnLCAncGF5bG9hZHMnXSxcbiAgICAgIGZvcm1hdDogXCIlcyAlZCAlcyAlc1wiXG4gIH1dLFxuICBhOiBbXG4gICAgeyAvL2E9cnRwbWFwOjExMCBNUDRBLUxBVE0vOTAwMDBcbiAgICAgIHB1c2g6ICdydHAnLFxuICAgICAgcmVnOiAvXnJ0cG1hcFxcOihcXGQqKSAoXFx3KilcXC8oXFxkKikvLFxuICAgICAgbmFtZXM6IFsncGF5bG9hZCcsICdjb2RlYycsICdyYXRlJ10sXG4gICAgICBmb3JtYXQ6IFwicnRwbWFwOiVkICVzLyVkXCJcbiAgICB9LFxuICAgIHsgLy9hPWZtdHA6MTA4IHByb2ZpbGUtbGV2ZWwtaWQ9MjQ7b2JqZWN0PTIzO2JpdHJhdGU9NjQwMDBcbiAgICAgIHB1c2g6ICdmbXRwJyxcbiAgICAgIHJlZzogL15mbXRwXFw6KFxcZCopICguKikvLFxuICAgICAgbmFtZXM6IFsncGF5bG9hZCcsICdjb25maWcnXSxcbiAgICAgIGZvcm1hdDogXCJmbXRwOiVkICVzXCJcbiAgICB9LFxuICAgIHsgLy9hPXJ0Y3AtZmI6OTggdHJyLWludCAxMDBcbiAgICAgIHB1c2g6ICdydGNwRmJUcnJJbnQnLFxuICAgICAgcmVnOiAvXnJ0Y3AtZmJcXDooXFwqfFxcZCopIHRyci1pbnQgKFxcZCopLyxcbiAgICAgIG5hbWVzOiBbJ3BheWxvYWQnLCAndmFsdWUnXSxcbiAgICAgIGZvcm1hdDogXCJydGNwLWZiOiVkIHRyci1pbnQgJWRcIlxuICAgIH0sXG4gICAgeyAvL2E9cnRjcC1mYjo5OCBuYWNrIHJwc2lcbiAgICAgIHB1c2g6ICdydGNwRmInLFxuICAgICAgcmVnOiAvXnJ0Y3AtZmJcXDooXFwqfFxcZCopIChcXHcqKSA/KFxcdyopLyxcbiAgICAgIG5hbWVzOiBbJ3BheWxvYWQnLCAndHlwZScsICdzdWJ0eXBlJ10sXG4gICAgICBmb3JtYXQ6IFwicnRjcC1mYjolcyAlcyAlc1wiXG4gICAgfSxcbiAgICB7IC8vYT1leHRtYXA6MiB1cm46aWV0ZjpwYXJhbXM6cnRwLWhkcmV4dDp0b2Zmc2V0XG4gICAgICAvL2E9ZXh0bWFwOjEvcmVjdm9ubHkgVVJJLWdwcy1zdHJpbmdcbiAgICAgIHB1c2g6ICdleHQnLFxuICAgICAgcmVnOiAvXmV4dG1hcDooW2EtekEtWjAtOV9cXC9dKikgKFteIF0qKSA/KC4qKS8sXG4gICAgICBuYW1lczogWyd2YWx1ZScsICd1cmknLCAnY29uZmlnJ10sIC8vIHZhbHVlIG1heSBpbmNsdWRlIFwiL2RpcmVjdGlvblwiIHN1ZmZpeFxuICAgICAgZm9ybWF0OiBcImV4dG1hcDolcyAlcyAlc1wiXG4gICAgfSxcbiAgICB7XG4gICAgICAvL2E9Y3J5cHRvOjEgQUVTX0NNXzEyOF9ITUFDX1NIQTFfODAgaW5saW5lOlBTMXVRQ1ZlZUNGQ2FuVm1jamtwUHl3ak5XaGNZRDBtWFh0eGFWQlJ8Ml4yMHwxOjMyXG4gICAgICBwdXNoOiAnY3J5cHRvJyxcbiAgICAgIHJlZzogL15jcnlwdG86KFxcZCopIChbYS16QS1aMC05X10qKSA/KFteIF0qKSA/KC4qKS8sXG4gICAgICBuYW1lczogWydpZCcsICdzdWl0ZScsICdjb25maWcnLCAnc2Vzc2lvbkNvbmZpZyddLFxuICAgICAgZm9ybWF0OiBcImNyeXB0bzolZCAlcyAlcyAlc1wiXG4gICAgfSxcbiAgICB7IC8vYT1zZXR1cDphY3RwYXNzXG4gICAgICBuYW1lOiAnc2V0dXAnLFxuICAgICAgcmVnOiAvXnNldHVwXFw6KFxcdyopLyxcbiAgICAgIGZvcm1hdDogXCJzZXR1cDolc1wiXG4gICAgfSxcbiAgICB7IC8vYT1taWQ6MVxuICAgICAgbmFtZTogJ21pZCcsXG4gICAgICByZWc6IC9ebWlkXFw6KFxcdyopLyxcbiAgICAgIGZvcm1hdDogXCJtaWQ6JXNcIlxuICAgIH0sXG4gICAgeyAvL2E9cHRpbWU6MjBcbiAgICAgIG5hbWU6ICdwdGltZScsXG4gICAgICByZWc6IC9ecHRpbWVcXDooXFxkKikvLFxuICAgICAgZm9ybWF0OiBcInB0aW1lOiVkXCJcbiAgICB9LFxuICAgIHsgLy9hPW1heHB0aW1lOjYwXG4gICAgICBuYW1lOiAnbWF4cHRpbWUnLFxuICAgICAgcmVnOiAvXm1heHB0aW1lXFw6KFxcZCopLyxcbiAgICAgIGZvcm1hdDogXCJtYXhwdGltZTolZFwiXG4gICAgfSxcbiAgICB7IC8vYT1zZW5kcmVjdlxuICAgICAgbmFtZTogJ2RpcmVjdGlvbicsXG4gICAgICByZWc6IC9eKHNlbmRyZWN2fHJlY3Zvbmx5fHNlbmRvbmx5fGluYWN0aXZlKS8sXG4gICAgICBmb3JtYXQ6IFwiJXNcIlxuICAgIH0sXG4gICAgeyAvL2E9aWNlLXVmcmFnOkY3Z0lcbiAgICAgIG5hbWU6ICdpY2VVZnJhZycsXG4gICAgICByZWc6IC9eaWNlLXVmcmFnXFw6KC4qKS8sXG4gICAgICBmb3JtYXQ6IFwiaWNlLXVmcmFnOiVzXCJcbiAgICB9LFxuICAgIHsgLy9hPWljZS1wd2Q6eDljbWwvWXppY2hWMitYbGhpTXU4Z1xuICAgICAgbmFtZTogJ2ljZVB3ZCcsXG4gICAgICByZWc6IC9eaWNlLXB3ZFxcOiguKikvLFxuICAgICAgZm9ybWF0OiBcImljZS1wd2Q6JXNcIlxuICAgIH0sXG4gICAgeyAvL2E9ZmluZ2VycHJpbnQ6U0hBLTEgMDA6MTE6MjI6MzM6NDQ6NTU6NjY6Nzc6ODg6OTk6QUE6QkI6Q0M6REQ6RUU6RkY6MDA6MTE6MjI6MzNcbiAgICAgIG5hbWU6ICdmaW5nZXJwcmludCcsXG4gICAgICByZWc6IC9eZmluZ2VycHJpbnRcXDooXFxTKikgKC4qKS8sXG4gICAgICBuYW1lczogWyd0eXBlJywgJ2hhc2gnXSxcbiAgICAgIGZvcm1hdDogXCJmaW5nZXJwcmludDolcyAlc1wiXG4gICAgfSxcbiAgICB7IC8vYT1jYW5kaWRhdGU6MCAxIFVEUCAyMTEzNjY3MzI3IDIwMy4wLjExMy4xIDU0NDAwIHR5cCBob3N0XG4gICAgICBwdXNoOiAnY2FuZGlkYXRlcycsXG4gICAgICByZWc6IC9eY2FuZGlkYXRlOihcXFMqKSAoXFxkKikgKFxcUyopIChcXGQqKSAoXFxTKikgKFxcZCopIHR5cCAoXFxTKikvLFxuICAgICAgbmFtZXM6IFsnZm91bmRhdGlvbicsICdjb21wb25lbnQnLCAndHJhbnNwb3J0JywgJ3ByaW9yaXR5JywgJ2lwJywgJ3BvcnQnLCAndHlwZSddLFxuICAgICAgZm9ybWF0OiBcImNhbmRpZGF0ZTolcyAlZCAlcyAlZCAlcyAlZCB0eXAgJXNcIlxuICAgIH0sXG4gICAgeyAvL2E9cmVtb3RlLWNhbmRpZGF0ZXM6MSAyMDMuMC4xMTMuMSA1NDQwMCAyIDIwMy4wLjExMy4xIDU0NDAxIC4uLlxuICAgICAgbmFtZTogJ3JlbW90ZUNhbmRpZGF0ZXMnLFxuICAgICAgcmVnOiAvXnJlbW90ZS1jYW5kaWRhdGVzOiguKikvLFxuICAgICAgZm9ybWF0OiBcInJlbW90ZS1jYW5kaWRhdGVzOiVzXCJcbiAgICB9LFxuICAgIHsgLy9hPWljZS1vcHRpb25zOmdvb2dsZS1pY2VcbiAgICAgIG5hbWU6ICdpY2VPcHRpb25zJyxcbiAgICAgIHJlZzogL15pY2Utb3B0aW9uc1xcOiguKikvLFxuICAgICAgZm9ybWF0OiBcImljZS1vcHRpb25zOiVzXCJcbiAgICB9LFxuICAgIHsgLy9hPXNzcmM6MjU2NjEwNzU2OSBjbmFtZTp0OVlVOE0xVXhURjhZMUExXG4gICAgICBwdXNoOiBcInNzcmNzXCIsXG4gICAgICByZWc6IC9ec3NyY1xcOihcXGQqKSAoW2EtekEtWjAtOV9dKilcXDooLiopLyxcbiAgICAgIG5hbWVzOiBbJ2lkJywgJ2F0dHJpYnV0ZScsICd2YWx1ZSddLFxuICAgICAgZm9ybWF0OiBcInNzcmM6JWQgJXM6JXNcIlxuICAgIH0sXG4gICAgeyAvL2E9bXNpZC1zZW1hbnRpYzogV01TIEp2bGFtNVgzU1gxT1A2cG4yMHpXb2d2YUtKejVIamY5T25sVlxuICAgICAgbmFtZTogXCJtc2lkU2VtYW50aWNcIixcbiAgICAgIHJlZzogL15tc2lkLXNlbWFudGljXFw6IChcXHcqKSAoLiopLyxcbiAgICAgIG5hbWVzOiBbJ3NlbWFudGljJywgJ3Rva2VuJ10sXG4gICAgICBmb3JtYXQ6IFwibXNpZC1zZW1hbnRpYzogJXMgJXNcIiAvLyBzcGFjZSBhZnRlciBcIjpcIiBpcyBub3QgYWNjaWRlbnRhbFxuICAgIH0sXG4gICAgeyAvL2E9Z3JvdXA6QlVORExFIGF1ZGlvIHZpZGVvXG4gICAgICBwdXNoOiAnZ3JvdXBzJyxcbiAgICAgIHJlZzogL15ncm91cFxcOihcXHcqKSAoLiopLyxcbiAgICAgIG5hbWVzOiBbJ3R5cGUnLCAnbWlkcyddLFxuICAgICAgZm9ybWF0OiBcImdyb3VwOiVzICVzXCJcbiAgICB9LFxuICAgIHsgLy9hPXJ0Y3AtbXV4XG4gICAgICBuYW1lOiAncnRjcE11eCcsXG4gICAgICByZWc6IC9eKHJ0Y3AtbXV4KS9cbiAgICB9XG4gIF1cbn07XG5cbi8vIHNldCBzZW5zaWJsZSBkZWZhdWx0cyB0byBhdm9pZCBwb2xsdXRpbmcgdGhlIGdyYW1tYXIgd2l0aCBib3JpbmcgZGV0YWlsc1xuT2JqZWN0LmtleXMoZ3JhbW1hcikuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gIHZhciBvYmpzID0gZ3JhbW1hcltrZXldO1xuICBvYmpzLmZvckVhY2goZnVuY3Rpb24gKG9iaikge1xuICAgIGlmICghb2JqLnJlZykge1xuICAgICAgb2JqLnJlZyA9IC8oLiopLztcbiAgICB9XG4gICAgaWYgKCFvYmouZm9ybWF0KSB7XG4gICAgICBvYmouZm9ybWF0ID0gXCIlc1wiO1xuICAgIH1cbiAgfSk7XG59KTsgXG4iLCJ2YXIgdG9JbnRJZkludCA9IGZ1bmN0aW9uICh2KSB7XG4gIHJldHVybiBTdHJpbmcoTnVtYmVyKHYpKSA9PT0gdiA/IE51bWJlcih2KSA6IHY7XG59O1xuXG52YXIgYXR0YWNoUHJvcGVydGllcyA9IGZ1bmN0aW9uIChtYXRjaCwgbG9jYXRpb24sIG5hbWVzLCByYXdOYW1lKSB7XG4gIGlmIChyYXdOYW1lICYmICFuYW1lcykge1xuICAgIGxvY2F0aW9uW3Jhd05hbWVdID0gdG9JbnRJZkludChtYXRjaFsxXSk7XG4gIH1cbiAgZWxzZSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuYW1lcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgbG9jYXRpb25bbmFtZXNbaV1dID0gdG9JbnRJZkludChtYXRjaFtpKzFdKTtcbiAgICB9XG4gIH1cbn07XG5cbnZhciBwYXJzZVJlZyA9IGZ1bmN0aW9uIChvYmosIGxvY2F0aW9uLCBjb250ZW50KSB7XG4gIHZhciBuZWVkc0JsYW5rID0gb2JqLm5hbWUgJiYgb2JqLm5hbWVzO1xuICBpZiAob2JqLnB1c2ggJiYgIWxvY2F0aW9uW29iai5wdXNoXSkge1xuICAgIGxvY2F0aW9uW29iai5wdXNoXSA9IFtdO1xuICB9XG4gIGVsc2UgaWYgKG5lZWRzQmxhbmsgJiYgIWxvY2F0aW9uW29iai5uYW1lXSkge1xuICAgIGxvY2F0aW9uW29iai5uYW1lXSA9IHt9O1xuICB9XG4gIHZhciBrZXlMb2NhdGlvbiA9IG9iai5wdXNoID9cbiAgICB7fSA6ICAvLyBibGFuayBvYmplY3QgdGhhdCB3aWxsIGJlIHB1c2hlZFxuICAgIG5lZWRzQmxhbmsgPyBsb2NhdGlvbltvYmoubmFtZV0gOiBsb2NhdGlvbjsgLy8gb3RoZXJ3aXNlLCBuYW1lZCBsb2NhdGlvbiBvciByb290XG5cbiAgYXR0YWNoUHJvcGVydGllcyhjb250ZW50Lm1hdGNoKG9iai5yZWcpLCBrZXlMb2NhdGlvbiwgb2JqLm5hbWVzLCBvYmoubmFtZSk7XG5cbiAgaWYgKG9iai5wdXNoKSB7XG4gICAgbG9jYXRpb25bb2JqLnB1c2hdLnB1c2goa2V5TG9jYXRpb24pO1xuICB9XG59O1xuXG52YXIgZ3JhbW1hciA9IHJlcXVpcmUoJy4vZ3JhbW1hcicpO1xudmFyIHZhbGlkTGluZSA9IFJlZ0V4cC5wcm90b3R5cGUudGVzdC5iaW5kKC9eKFthLXpdKT0oLiopLyk7XG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoc2RwKSB7XG4gIHZhciBzZXNzaW9uID0ge31cbiAgICAsIG1lZGlhID0gW11cbiAgICAsIGxvY2F0aW9uID0gc2Vzc2lvbjsgLy8gcG9pbnRzIGF0IHdoZXJlIHByb3BlcnRpZXMgZ28gdW5kZXIgKG9uZSBvZiB0aGUgYWJvdmUpXG5cbiAgLy8gcGFyc2UgbGluZXMgd2UgdW5kZXJzdGFuZFxuICBzZHAuc3BsaXQoJ1xcbicpLmZpbHRlcih2YWxpZExpbmUpLmZvckVhY2goZnVuY3Rpb24gKGwpIHtcbiAgICB2YXIgdHlwZSA9IGxbMF07XG4gICAgdmFyIGNvbnRlbnQgPSBsLnNsaWNlKDIpO1xuICAgIGlmICh0eXBlID09PSAnbScpIHtcbiAgICAgIG1lZGlhLnB1c2goe3J0cDogW10sIGZtdHA6IFtdfSk7XG4gICAgICBsb2NhdGlvbiA9IG1lZGlhW21lZGlhLmxlbmd0aC0xXTsgLy8gcG9pbnQgYXQgbGF0ZXN0IG1lZGlhIGxpbmVcbiAgICB9XG5cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IChncmFtbWFyW3R5cGVdIHx8IFtdKS5sZW5ndGg7IGogKz0gMSkge1xuICAgICAgdmFyIG9iaiA9IGdyYW1tYXJbdHlwZV1bal07XG4gICAgICBpZiAob2JqLnJlZy50ZXN0KGNvbnRlbnQpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZVJlZyhvYmosIGxvY2F0aW9uLCBjb250ZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIHNlc3Npb24ubWVkaWEgPSBtZWRpYTsgLy8gbGluayBpdCB1cFxuICByZXR1cm4gc2Vzc2lvbjtcbn07XG5cbnZhciBmbXRwUmVkdWNlciA9IGZ1bmN0aW9uIChhY2MsIGV4cHIpIHtcbiAgdmFyIHMgPSBleHByLnNwbGl0KCc9Jyk7XG4gIGlmIChzLmxlbmd0aCA9PT0gMikge1xuICAgIGFjY1tzWzBdXSA9IHRvSW50SWZJbnQoc1sxXSk7XG4gIH1cbiAgcmV0dXJuIGFjYztcbn07XG5cbmV4cG9ydHMucGFyc2VGbXRwQ29uZmlnID0gZnVuY3Rpb24gKHN0cikge1xuICByZXR1cm4gc3RyLnNwbGl0KCc7JykucmVkdWNlKGZtdHBSZWR1Y2VyLCB7fSk7XG59O1xuXG5leHBvcnRzLnBhcnNlUGF5bG9hZHMgPSBmdW5jdGlvbiAoc3RyKSB7XG4gIHJldHVybiBzdHIuc3BsaXQoJyAnKS5tYXAoTnVtYmVyKTtcbn07XG5cbmV4cG9ydHMucGFyc2VSZW1vdGVDYW5kaWRhdGVzID0gZnVuY3Rpb24gKHN0cikge1xuICB2YXIgY2FuZGlkYXRlcyA9IFtdO1xuICB2YXIgcGFydHMgPSBzdHIuc3BsaXQoJyAnKS5tYXAodG9JbnRJZkludCk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoOyBpICs9IDMpIHtcbiAgICBjYW5kaWRhdGVzLnB1c2goe1xuICAgICAgY29tcG9uZW50OiBwYXJ0c1tpXSxcbiAgICAgIGlwOiBwYXJ0c1tpICsgMV0sXG4gICAgICBwb3J0OiBwYXJ0c1tpICsgMl1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gY2FuZGlkYXRlcztcbn07XG4iLCJ2YXIgZ3JhbW1hciA9IHJlcXVpcmUoJy4vZ3JhbW1hcicpO1xudmFyIGZvcm1hdCA9IHJlcXVpcmUoJ3V0aWwnKS5mb3JtYXQ7XG5cbnZhciBtYWtlTGluZSA9IGZ1bmN0aW9uICh0eXBlLCBvYmosIGxvY2F0aW9uKSB7XG4gIHZhciBhcmdzID0gW3R5cGUgKyAnPScgKyBvYmouZm9ybWF0XTtcbiAgaWYgKG9iai5uYW1lcykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb2JqLm5hbWVzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICB2YXIgbiA9IG9iai5uYW1lc1tpXTtcbiAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICBhcmdzLnB1c2gobG9jYXRpb25bb2JqLm5hbWVdW25dKTtcbiAgICAgIH1cbiAgICAgIGVsc2UgeyAvLyBmb3IgbUxpbmUgYW5kIHB1c2ggYXR0cmlidXRlc1xuICAgICAgICBhcmdzLnB1c2gobG9jYXRpb25bb2JqLm5hbWVzW2ldXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGVsc2Uge1xuICAgIGFyZ3MucHVzaChsb2NhdGlvbltvYmoubmFtZV0pO1xuICB9XG4gIHJldHVybiBmb3JtYXQuYXBwbHkobnVsbCwgYXJncyk7XG59O1xuXG4vLyBSRkMgc3BlY2lmaWVkIG9yZGVyXG4vLyBUT0RPOiBleHRlbmQgdGhpcyB3aXRoIGFsbCB0aGUgcmVzdFxudmFyIGRlZmF1bHRPdXRlck9yZGVyID0gW1xuICAndicsICdvJywgJ3MnLCAnaScsXG4gICd1JywgJ2UnLCAncCcsICdjJyxcbiAgJ2InLCAndCcsICdyJywgJ3onLCAnYSdcbl07XG52YXIgZGVmYXVsdElubmVyT3JkZXIgPSBbJ2knLCAnYycsICdiJywgJ2EnXTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChzZXNzaW9uLCBvcHRzKSB7XG4gIG9wdHMgPSBvcHRzIHx8IHt9O1xuICAvLyBlbnN1cmUgY2VydGFpbiBwcm9wZXJ0aWVzIGV4aXN0XG4gIGlmIChzZXNzaW9uLnZlcnNpb24gPT0gbnVsbCkge1xuICAgIHNlc3Npb24udmVyc2lvbiA9IDA7IC8vIFwidj0wXCIgbXVzdCBiZSB0aGVyZSAob25seSBkZWZpbmVkIHZlcnNpb24gYXRtKVxuICB9XG4gIGlmIChzZXNzaW9uLm5hbWUgPT0gbnVsbCkge1xuICAgIHNlc3Npb24ubmFtZSA9IFwiIFwiOyAvLyBcInM9IFwiIG11c3QgYmUgdGhlcmUgaWYgbm8gbWVhbmluZ2Z1bCBuYW1lIHNldFxuICB9XG4gIHNlc3Npb24ubWVkaWEuZm9yRWFjaChmdW5jdGlvbiAobUxpbmUpIHtcbiAgICBpZiAobUxpbmUucGF5bG9hZHMgPT0gbnVsbCkge1xuICAgICAgbUxpbmUucGF5bG9hZHMgPSBcIlwiO1xuICAgIH1cbiAgfSk7XG5cbiAgdmFyIG91dGVyT3JkZXIgPSBvcHRzLm91dGVyT3JkZXIgfHwgZGVmYXVsdE91dGVyT3JkZXI7XG4gIHZhciBpbm5lck9yZGVyID0gb3B0cy5pbm5lck9yZGVyIHx8IGRlZmF1bHRJbm5lck9yZGVyO1xuICB2YXIgc2RwID0gW107XG5cbiAgLy8gbG9vcCB0aHJvdWdoIG91dGVyT3JkZXIgZm9yIG1hdGNoaW5nIHByb3BlcnRpZXMgb24gc2Vzc2lvblxuICBvdXRlck9yZGVyLmZvckVhY2goZnVuY3Rpb24gKHR5cGUpIHtcbiAgICBncmFtbWFyW3R5cGVdLmZvckVhY2goZnVuY3Rpb24gKG9iaikge1xuICAgICAgaWYgKG9iai5uYW1lIGluIHNlc3Npb24pIHtcbiAgICAgICAgc2RwLnB1c2gobWFrZUxpbmUodHlwZSwgb2JqLCBzZXNzaW9uKSk7XG4gICAgICB9XG4gICAgICBlbHNlIGlmIChvYmoucHVzaCBpbiBzZXNzaW9uKSB7XG4gICAgICAgIHNlc3Npb25bb2JqLnB1c2hdLmZvckVhY2goZnVuY3Rpb24gKGVsKSB7XG4gICAgICAgICAgc2RwLnB1c2gobWFrZUxpbmUodHlwZSwgb2JqLCBlbCkpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gdGhlbiBmb3IgZWFjaCBtZWRpYSBsaW5lLCBmb2xsb3cgdGhlIGlubmVyT3JkZXJcbiAgc2Vzc2lvbi5tZWRpYS5mb3JFYWNoKGZ1bmN0aW9uIChtTGluZSkge1xuICAgIHNkcC5wdXNoKG1ha2VMaW5lKCdtJywgZ3JhbW1hci5tWzBdLCBtTGluZSkpO1xuXG4gICAgaW5uZXJPcmRlci5mb3JFYWNoKGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICBncmFtbWFyW3R5cGVdLmZvckVhY2goZnVuY3Rpb24gKG9iaikge1xuICAgICAgICBpZiAob2JqLm5hbWUgaW4gbUxpbmUpIHtcbiAgICAgICAgICBzZHAucHVzaChtYWtlTGluZSh0eXBlLCBvYmosIG1MaW5lKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAob2JqLnB1c2ggaW4gbUxpbmUpIHtcbiAgICAgICAgICBtTGluZVtvYmoucHVzaF0uZm9yRWFjaChmdW5jdGlvbiAoZWwpIHtcbiAgICAgICAgICAgIHNkcC5wdXNoKG1ha2VMaW5lKHR5cGUsIG9iaiwgZWwpKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBzZHAuam9pbignXFxuJykgKyAnXFxuJztcbn07XG4iLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuLyogZ2xvYmFsIGlvOiBmYWxzZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZXZlID0gcmVxdWlyZSgnZXZlJyk7XG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIHJ0YyA9IHJlcXVpcmUoJ3J0YycpO1xudmFyIGRlYnVnID0gcmVxdWlyZSgnY29nL2xvZ2dlcicpKCdnbHVlLXNlc3Npb25tYW5hZ2VyJyk7XG52YXIgY3JlYXRlU2lnbmFsbGVyID0gcmVxdWlyZSgncnRjLXNpZ25hbGxlcicpO1xudmFyIGV4dGVuZCA9IHJlcXVpcmUoJ2NvZy9leHRlbmQnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG4vKipcbiAgIyMjIFNlc3Npb25NYW5hZ2VyXG5cbiAgVGhlIFNlc3Npb25NYW5hZ2VyIGNsYXNzIGFzc2lzdHMgd2l0aCBpbnRlcmFjdGluZyB3aXRoIHRoZSBzaWduYWxsaW5nXG4gIHNlcnZlciBhbmQgY3JlYXRpbmcgcGVlciBjb25uZWN0aW9ucyBiZXR3ZWVuIHZhbGlkIHBhcnRpZXMuICBJdCB1c2VzXG4gIGV2ZSB0byBjcmVhdGUgYSBkZWNvdXBsZWQgd2F5IHRvIGdldCBwZWVyIGluZm9ybWF0aW9uLlxuXG4qKi9cbmZ1bmN0aW9uIFNlc3Npb25NYW5hZ2VyKGNvbmZpZykge1xuICBpZiAoISAodGhpcyBpbnN0YW5jZW9mIFNlc3Npb25NYW5hZ2VyKSkge1xuICAgIHJldHVybiBuZXcgU2Vzc2lvbk1hbmFnZXIoY29uZmlnKTtcbiAgfVxuXG4gIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG4gIC8vIGluaXRpYWxpc2UgdGhlIHJvb20gYW5kIG91ciByb2xlXG4gIHRoaXMucm9vbSA9IGNvbmZpZy5yb29tO1xuICB0aGlzLnJvbGUgPSBjb25maWcucm9sZTtcblxuICAvLyBzYXZlIHRoZSBjb25maWdcbiAgdGhpcy5jZmcgPSBjb25maWc7XG5cbiAgLy8gaW5pdGlhbGlzZSBvdXIgcGVlcnMgbGlzdFxuICB0aGlzLnBlZXJzID0ge307XG5cbiAgLy8gaW5pdGlhbGlzZSB0aGUgc3RyZWFtcyBkYXRhIGxpc3RcbiAgdGhpcy5zdHJlYW1zID0ge307XG5cbiAgLy8gY3JlYXRlIG91ciB1bmRlcmx5aW5nIHNvY2tldCBjb25uZWN0aW9uXG4gIHRoaXMuc29ja2V0ID0gbmV3IFByaW11cyhjb25maWcuc2lnbmFsaG9zdCk7XG4gIHRoaXMuc29ja2V0Lm9uKCdvcGVuJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2FjdGl2ZScpKTtcblxuICAvLyBjcmVhdGUgb3VyIHNpZ25hbGxpbmcgaW50ZXJmYWNlXG4gIHRoaXMuc2lnbmFsbGVyID0gY3JlYXRlU2lnbmFsbGVyKHRoaXMuc29ja2V0KTtcblxuICAvLyBob29rIHVwIHNpZ25hbGxlciBldmVudHNcbiAgdGhpcy5fYmluZEV2ZW50cyh0aGlzLnNpZ25hbGxlciwgY29uZmlnKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBTZXNzaW9uTWFuYWdlcjtcbnV0aWwuaW5oZXJpdHMoU2Vzc2lvbk1hbmFnZXIsIEV2ZW50RW1pdHRlcik7XG5cbi8qKlxuICAjIyMjIGFubm91bmNlKClcblxuICBBbm5vdW5jZSBvdXJzZWx2ZXMgb24gdGhlIHNpZ25hbGxpbmcgY2hhbm5lbFxuKiovXG5TZXNzaW9uTWFuYWdlci5wcm90b3R5cGUuYW5ub3VuY2UgPSBmdW5jdGlvbih0YXJnZXRJZCkge1xuICB2YXIgc2NvcGUgPSB0YXJnZXRJZCA/IHRoaXMuc2lnbmFsbGVyLnRvKHRhcmdldElkKSA6IHRoaXMuc2lnbmFsbGVyO1xuXG4gIGRlYnVnKCdhbm5vdW5jaW5nIHNlbGYgdG86ICcgKyAodGFyZ2V0SWQgfHwgJ2FsbCcpKTtcbiAgc2NvcGUuYW5ub3VuY2UoeyByb29tOiB0aGlzLnJvb20sIHJvbGU6IHRoaXMucm9sZSB9KTtcbn07XG5cbi8qKlxuICAjIyMjIGJyb2FkY2FzdChzdHJlYW0pXG5cbiAgQnJvYWRjYXN0IGEgc3RyZWFtIHRvIG91ciBjb25uZWN0ZWQgcGVlcnMuXG5cbioqL1xuU2Vzc2lvbk1hbmFnZXIucHJvdG90eXBlLmJyb2FkY2FzdCA9IGZ1bmN0aW9uKHN0cmVhbSwgZGF0YSkge1xuICB2YXIgcGVlcnMgPSB0aGlzLnBlZXJzO1xuICB2YXIgbWdyID0gdGhpcztcblxuICBmdW5jdGlvbiBjb25uZWN0UGVlcihwZWVyLCBwZWVySWQpIHtcbiAgICBtZ3IudGFnU3RyZWFtKHN0cmVhbSwgcGVlcklkLCBkYXRhKTtcblxuICAgIHRyeSB7XG4gICAgICBwZWVyLmFkZFN0cmVhbShzdHJlYW0pO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgZGVidWcoJ2NhcHR1cmVkIGVycm9yIGF0dGVtcHRpbmcgdG8gYWRkIHN0cmVhbTogJywgZSk7XG4gICAgfVxuICB9XG5cbiAgLy8gYWRkIHRvIGV4aXN0aW5nIHN0cmVhbXNcbiAgZGVidWcoJ2Jyb2FkY2FzdGluZyBzdHJlYW0gJyArIHN0cmVhbS5pZCArICcgdG8gZXhpc3RpbmcgcGVlcnMnKTtcbiAgT2JqZWN0LmtleXMocGVlcnMpLmZvckVhY2goZnVuY3Rpb24ocGVlcklkKSB7XG4gICAgaWYgKHBlZXJzW3BlZXJJZF0pIHtcbiAgICAgIGRlYnVnKCdicm9hZGNhc3RpbmcgdG8gcGVlcjogJyArIHBlZXJJZCk7XG4gICAgICBjb25uZWN0UGVlcihwZWVyc1twZWVySWRdLCBwZWVySWQpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gd2hlbiBhIG5ldyBwZWVyIGFycml2ZXMsIGFkZCBpdCB0byB0aGF0IHBlZXIgYWxzb1xuICBldmUub24oJ2dsdWUucGVlci5qb2luJywgZnVuY3Rpb24ocGVlciwgcGVlcklkKSB7XG4gICAgZGVidWcoJ3BlZXIgJyArIHBlZXJJZCArICcgam9pbmVkLCBjb25uZWN0aW5nIHRvIHN0cmVhbTogJyArIHN0cmVhbS5pZCk7XG5cbiAgICBjb25uZWN0UGVlcihwZWVyLCBwZWVySWQpO1xuICB9KTtcblxuICAvLyB3aGVuIHRoZSBzdHJlYW0gZW5kcyBkaXNjb25uZWN0IHRoZSBsaXN0ZW5lclxuICAvLyBUT0RPOiB1c2UgYWRkRXZlbnRMaXN0ZW5lciBvbmNlIHN1cHBvcnRlZFxuICBzdHJlYW0ub25lbmRlZCA9IGZ1bmN0aW9uKCkge1xuICAgIGV2ZS5vZmYoJ2dsdWUucGVlci5qb2luJywgY29ubmVjdFBlZXIpO1xuICB9O1xufTtcblxuLyoqXG4gICMjIyMgZ2V0U3RyZWFtRGF0YShzdHJlYW0sIGNhbGxiYWNrKVxuXG4gIEdpdmVuIHRoZSBpbnB1dCBzdHJlYW0gYHN0cmVhbWAsIHJldHVybiB0aGUgZGF0YSBmb3IgdGhlIHN0cmVhbS4gIFRoZVxuICBwcm92aWRlZCBgY2FsbGJhY2tgIHdpbGwgbm90IGJlIGNhbGxlZCB1bnRpbCByZWxldmFudCBkYXRhIGlzIGhlbGQgYnlcbiAgdGhlIHNlc3Npb24gbWFuYWdlci5cblxuKiovXG5TZXNzaW9uTWFuYWdlci5wcm90b3R5cGUuZ2V0U3RyZWFtRGF0YSA9IGZ1bmN0aW9uKHN0cmVhbSwgY2FsbGJhY2spIHtcbiAgdmFyIGlkID0gc3RyZWFtICYmIHN0cmVhbS5pZDtcbiAgdmFyIGRhdGEgPSB0aGlzLnN0cmVhbXNbaWRdO1xuXG4gIC8vIGlmIHdlIGRvbid0IGhhdmUgYW4gaWQsIHRoZW4gYWJvcnRcbiAgaWYgKCEgaWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBpZiB3ZSBoYXZlIGRhdGEgYWxyZWFkeSwgcmV0dXJuIGl0XG4gIGlmIChkYXRhKSB7XG4gICAgY2FsbGJhY2soZGF0YSk7XG4gIH1cbiAgLy8gb3RoZXJ3aXNlLCB3YWl0IGZvciB0aGUgZGF0YSB0byBiZSBjcmVhdGVkXG4gIGVsc2Uge1xuICAgIGV2ZS5vbmNlKCdnbHVlLnN0cmVhbWRhdGEuJyArIGlkLCBjYWxsYmFjayk7XG4gIH1cbn07XG5cbi8qKlxuICAjIyMjIHRhZ1N0cmVhbShzdHJlYW0sIHRhcmdldElkLCBkYXRhKVxuXG4gIFRoZSB0YWdTdHJlYW0gaXMgdXNlZCB0byBwYXNzIHN0cmVhbSBpZGVudGlmaWNhdGlvbiBpbmZvcm1hdGlvbiBhbG9uZyB0byB0aGVcbiAgdGFyZ2V0IHBlZXIuICBUaGlzIGluZm9ybWF0aW9uIGlzIHVzZWZ1bCB3aGVuIGEgcGFydGljdWxhciByZW1vdGUgbWVkaWFcbiAgZWxlbWVudCBpcyBleHBlY3RpbmcgdGhlIGNvbnRlbnRzIG9mIGEgcGFydGljdWxhciBjYXB0dXJlIHRhcmdldC5cblxuKiovXG5TZXNzaW9uTWFuYWdlci5wcm90b3R5cGUudGFnU3RyZWFtID0gZnVuY3Rpb24oc3RyZWFtLCB0YXJnZXRJZCwgZGF0YSkge1xuICB0aGlzLnNpZ25hbGxlci50byh0YXJnZXRJZCkuc2VuZCgnL3N0cmVhbWRhdGEnLCBleHRlbmQoe30sIGRhdGEsIHtcbiAgICBpZDogc3RyZWFtLmlkLFxuICAgIGxhYmVsOiBzdHJlYW0ubGFiZWxcbiAgfSkpO1xufTtcblxuLyogaW50ZXJuYWwgbWV0aG9kcyAqL1xuXG5TZXNzaW9uTWFuYWdlci5wcm90b3R5cGUuX2JpbmRFdmVudHMgPSBmdW5jdGlvbihzaWduYWxsZXIsIG9wdHMpIHtcbiAgdmFyIG1nciA9IHRoaXM7XG5cbiAgLy8gVE9ETzogZXh0cmFjdCB0aGUgbWVhbmluZ2Z1bCBwYXJ0cyBmcm9tIHRoZSBjb25maWdcbiAgLy8gdmFyIG9wdHMgPSB0aGlzLmNmZztcbiAgZGVidWcoJ2luaXRpYWxpemluZyBldmVudCBoYW5kbGVycycpO1xuXG4gIHNpZ25hbGxlci5vbigncGVlcjphbm5vdW5jZScsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICB2YXIgbnMgPSAnZ2x1ZS5wZWVyLmpvaW4uJyArIChkYXRhLnJvbGUgfHwgJ25vbmUnKVxuICAgIHZhciBwZWVyO1xuICAgIHZhciBtb25pdG9yO1xuXG4gICAgLy8gaWYgdGhlIHJvb20gZG9lcyBub3QgbWF0Y2ggb3VyIHJvb21cbiAgICAvLyBPUiwgd2UgYWxyZWFkeSBoYXZlIGFuIGFjdGl2ZSBwZWVyIGZvciB0aGF0IGlkLCB0aGVuIGFib3J0XG4gICAgZGVidWcoJ2NhcHR1cmVkIGFubm91bmNlIGV2ZW50IGZvciBwZWVyOiAnICsgZGF0YS5pZCk7XG4gICAgaWYgKGRhdGEucm9vbSAhPT0gbWdyLnJvb20pIHtcbiAgICAgIHJldHVybiBkZWJ1ZygncmVjZWl2ZWQgYW5ub3VuY2UgZm9yIGluY29ycmVjdCByb29tJyk7XG4gICAgfVxuXG4gICAgaWYgKG1nci5wZWVyc1tkYXRhLmlkXSkge1xuICAgICAgcmV0dXJuIGRlYnVnKCdrbm93biBwZWVyJyk7XG4gICAgfVxuXG4gICAgLy8gY3JlYXRlIG91ciBwZWVyIGNvbm5lY3Rpb25cbiAgICBwZWVyID0gbWdyLnBlZXJzW2RhdGEuaWRdID0gcnRjLmNyZWF0ZUNvbm5lY3Rpb24oXG4gICAgICBvcHRzLFxuICAgICAgb3B0cy5jb25zdHJhaW50c1xuICAgICk7XG5cbiAgICAvLyBjb3VwbGUgdGhlIGNvbm5lY3Rpb25zXG4gICAgbW9uaXRvciA9IHJ0Yy5jb3VwbGUocGVlciwgZGF0YS5pZCwgc2lnbmFsbGVyLCBvcHRzKTtcblxuICAgIC8vIHdhaXQgZm9yIHRoZSBtb25pdG9yIHRvIHRlbGwgdXMgd2UgaGF2ZSBhbiBhY3RpdmUgY29ubmVjdGlvblxuICAgIC8vIGJlZm9yZSBhdHRlbXB0aW5nIHRvIGJpbmQgdG8gYW55IFVJIGVsZW1lbnRzXG4gICAgbW9uaXRvci5vbmNlKCdhY3RpdmUnLCBmdW5jdGlvbigpIHtcbiAgICAgIGV2ZSgnZ2x1ZS5wZWVyLmFjdGl2ZS4nICsgKGRhdGEucm9sZSB8fCAnbm9uZScpLCBudWxsLCBwZWVyLCBkYXRhLmlkKTtcbiAgICB9KTtcblxuICAgIGV2ZSgnZ2x1ZS5wZWVyLmpvaW4uJyArIChkYXRhLnJvbGUgfHwgJ25vbmUnKSwgbnVsbCwgcGVlciwgZGF0YS5pZCk7XG4gIH0pO1xuXG4gIHNpZ25hbGxlci5vbigncGVlcjpsZWF2ZScsIGZ1bmN0aW9uKGlkKSB7XG4gICAgLy8gZ2V0IHRoZSBwZWVyXG4gICAgdmFyIHBlZXIgPSBtZ3IucGVlcnNbaWRdO1xuICAgIGRlYnVnKCdjYXB0dXJlZCBsZWF2ZSBldmVudCBmb3IgcGVlcjogJyArIGlkKTtcblxuICAgIC8vIGlmIHRoaXMgaXMgYSBwZWVyIHdlIGtub3cgYWJvdXQsIHRoZW4gY2xvc2UgYW5kIHNlbmQgYSBub3RpZmljYXRpb25cbiAgICBpZiAocGVlcikge1xuICAgICAgcGVlci5jbG9zZSgpO1xuICAgICAgbWdyLnBlZXJzW2lkXSA9IHVuZGVmaW5lZDtcblxuICAgICAgLy8gdHJpZ2dlciB0aGUgbm90aWZpY2F0aW9uXG4gICAgICBldmUoJ2dsdWUucGVlci5sZWF2ZScsIG51bGwsIHBlZXIsIGlkKTtcbiAgICB9XG4gIH0pO1xuXG4gIHNpZ25hbGxlci5vbignc3RyZWFtZGF0YScsIGZ1bmN0aW9uKGRhdGEsIHNyYykge1xuICAgIC8vIHNhdmUgdGhlIHN0cmVhbSBkYXRhIHRvIHRoZSBsb2NhbCBzdHJlYW1cbiAgICBtZ3Iuc3RyZWFtc1tkYXRhLmlkXSA9IGRhdGE7XG4gICAgZXZlKCdnbHVlLnN0cmVhbWRhdGEuJyArIGRhdGEuaWQsIG51bGwsIGRhdGEpO1xuICB9KTtcbn07Il19
(13)
});
