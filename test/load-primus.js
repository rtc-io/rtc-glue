var crel = require('crel');
var eve = require('eve');
var glue = require('..');
var test = require('tape');
var qsa = require('dd/qsa');

function getPrimusCount() {
  var scripts = [].slice.call(document.getElementsByTagName('script'));

  return scripts.filter(function(script) {
    var src = script.getAttribute('src');

    // ensure this is not a primus script
    return /primus\.js$/.test(src);
  }).length;
}

// flag autoload false
glue.config.autoload = false;

test('get ready with 0 peers (no script load)', function(t) {
  t.plan(2);

  eve.once('glue.ready', function() {
    t.pass('received glue.ready event');
    t.equal(getPrimusCount(), 0);
  });

  glue();
});

test('create a test peer', function(t) {
  t.plan(1);
  document.body.appendChild(crel('video', { 'rtc-peer': '' }));
  t.equal(qsa('video[rtc-peer]').length, 1);
});

test('get ready with 1 peer (should load primus)', function(t) {
  t.plan(3);

  eve.once('glue.ready', function() {
    t.pass('received glue.ready event');
    t.equal(getPrimusCount(), 1);
    t.ok(Primus, 'primus defined');
  });

  glue();
});