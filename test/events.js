var eve = require('eve');
var glue = require('..');
var test = require('tape');

// flag autoload false
glue.config.autoload = false;

test('get ready event directly from eve', function(t) {
  t.plan(1);

  eve.once('glue.ready', function() {
    t.pass('ok');
  });

  glue();
});

test('get ready event from the events interface', function(t) {
  t.plan(1);

  glue.events.once('ready', function() {
    t.pass('ok');
  });

  glue();
});

test('events interface also handles prefixed event names', function(t) {
  t.plan(1);

  glue.events.once('glue.ready', function() {
    t.pass('ok');
  });

  glue();
});