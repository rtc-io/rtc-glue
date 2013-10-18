# rtc-glue

Glue is a high-level approach to building WebRTC applications. It is
primarily designed for web application coders who would prefer to spend
their time in HTML and CSS rather than JS.

[![experimental](http://hughsk.github.io/stability-badges/dist/experimental.svg)](http://github.com/hughsk/stability-badges)

## Example Usage

Glue works by looking for HTML tags that follow particular conventions
with regards to named attributed, etc.  For instance, consider the
following HTML:

```html
<html>
<body>
<!-- video for our local capture -->
<video id="main" rtc-capture="camera" />

<!-- make magic happen -->
<script src="../dist/glue.js"></script>
</body>
</html>
```

It is then possible to tweak the `getUserMedia` constraints using some
flags in the `rtc-capture` attribute:

```html
<html>
<body>
<!-- video for our local capture -->
<video id="main" rtc-capture="camera min:1280x720" />

<!-- make magic happen -->
<script src="../dist/glue.js"></script>
</body>
</html>
```

For those who prefer using separate attributes, you can achieve similar
behaviour using the `rtc-resolution` (or `rtc-res`) attribute:

```html
<html>
<body>
<!-- video for our local capture -->
<video id="main" rtc-capture="camera" rtc-resolution="1280x720" />

<!-- make magic happen -->
<script src="../dist/glue.js"></script>
</body>
</html>
```

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

### initRemote(el) __internal__

Handle the initialization of a rtc-remote target

### initCapture(el) __internal__

Handle the initialization of an rtc-capture target

## License(s)

### Apache 2.0

Copyright 2013 National ICT Australia Limited (NICTA)

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
