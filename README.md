# rtc-glue

Glue is a high-level approach to building WebRTC applications. It is
primarily designed for web application coders who would prefer to spend
their time in HTML and CSS rather than JS.

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

## On Custom Attributes

While we haven't 100% decided we are leaning towards the use of custom
`rtc-*` attributes for influencing the behaviour of the `rtc-glue` library.
While currently this is in violation with the HTML5 spec, it is an area
of active discussion in W3C land (given [AngularJS](http://angularjs.org/)
has adopted the `ng-*` attributes and is proving popular).

### initRemote(el) __internal__

Handle the initialization of a rtc-remote target

### initCapture(el) __internal__

Handle the initialization of an rtc-capture target
