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
<video id="main" rtc-capture="camera min:1280x720" />

<!-- make magic happen -->
<script src="../dist/glue.js"></script>
</body>
</html>
```

### initRemote(el) __internal__

Handle the initialization of a rtc-remote target

### initCapture(el) __internal__

Handle the initialization of an rtc-capture target
