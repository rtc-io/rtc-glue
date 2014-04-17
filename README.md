# rtc-glue

Glue is a high-level approach to building WebRTC applications. It is
primarily designed for web application coders who would prefer to spend
their time in HTML and CSS rather than JS.


[![NPM](https://nodei.co/npm/rtc-glue.png)](https://nodei.co/npm/rtc-glue/)

![unstable](https://img.shields.io/badge/stability-unstable-yellowgreen.svg)

## Example Usage

Glue works by looking for HTML tags that follow particular conventions
with regards to named attributed, etc.  For instance, consider the
following HTML:

```html
<html>
<body>
<!-- video for our local capture -->
<video id="main" rtc-capture="camera"></video>

<!-- make magic happen -->
<script src="index.js"></script>
</body>
</html>

```

Run locally with:

```
beefy --cwd examples/capture-only index.js
```

It is then possible to tweak the `getUserMedia` constraints using some
flags in the `rtc-capture` attribute:

```html
<html>
<body>
<!-- video for our local capture -->
<video id="main" rtc-capture="camera min:1280x720"></video>

<!-- make magic happen -->
<script src="index.js"></script>
</body>
</html>

```

Run locally with:

```
beefy --cwd examples/capture-tweakres index.js
```

For those who prefer using separate attributes, you can achieve similar
behaviour using the `rtc-resolution` (or `rtc-res`) attribute:

```html
<html>
<body>
<!-- video for our local capture -->
<video id="main" rtc-capture="camera" rtc-resolution="1280x720"></video>

<!-- make magic happen -->
<script src="index.js"></script>
</body>
</html>

```

Run locally with:

```
beefy --cwd examples/capture-res-attribute index.js
```

## Conferencing Example

The following is a simple example of conferencing using some hosted rtc.io
signalling:

```html
<html>
<head>
<style>
video {
  max-width: 640px;
}

video[rtc-capture] {
  max-width: 240px;
  float: right;
}
</style>
</head>
<body>
<!-- video for our local capture -->
<video id="main" rtc-capture="camera"></video>

<!-- remote container for our frient -->
<video rtc-peer rtc-stream="main" muted></video>

<!-- make magic happen -->
<script src="index.js"></script>
</body>
</html>

```

```js
var quickconnect = require('rtc-quickconnect');
var qc = quickconnect('http://rtc.io/switchboard/', { room: 'glue-simpleconf' });

// use glue to autowire elements to the page
require('rtc-glue')(qc);

```

Run locally with:

```
beefy --cwd examples/conference-simple index.js
```

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

```html
<html>
<body>
<!-- video for our local capture -->
<video id="main" rtc-capture="camera:0"></video>
<video id="secondary" rtc-capture="camera:1"></video>

<!-- make magic happen -->
<script src="index.js"></script>
</body>
</html>

```

```
beefy --cwd examples/capture-multicam index.js
```

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

```html
<html>
<head>
<!-- configure the signalling to use the test rtc.io public signaller -->
<meta name="rtc-signalhost" content="http://rtc.io/switchboard/">

<!-- tell glue that we want a data channel named "test" -->
<meta name="rtc-data" content="test">
</head>
<body>
<script src="../dist/glue.js"></script>
<script>
glue.events.on('test:open', function(dc, id) {
  console.log('data channel provided for peer: ' + id, dc);
});
</script>
</body>
</html>
```

## Reference

### Element Attributes

#### rtc-capture

The presence of the `rtc-capture` attribute in a `video` or `audio` element
indicates that it is a getUserMedia capture target.

#### rtc-peer

To be completed.

### Internal Functions

## License(s)

### Apache 2.0

Copyright 2014 National ICT Australia Limited (NICTA)

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
