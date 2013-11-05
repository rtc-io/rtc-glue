var glue = require('..');
var eve = require('eve');

eve.once('glue.ready', function() {
  // will be triggered when glue has initialized
});

glue.events.once('ready', function() {
  // will also be triggered once ready, and equivalent to glue.ready
  // when directly using eve
});