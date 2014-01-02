var glue = require('..');
var eve = require('eve');

eve.once('glue.ready', function() {
  // will be triggered when glue has initialized
});

glue.events.once('ready', function() {
  // will also be triggered once ready, and equivalent to glue.ready
  // when directly using eve
});

// listen for connected events
// NOTE: only trigger when a page has valid peer elements
glue.events.once('connected', function(signaller) {
	console.log('connected');

	signaller.on('color', function(data) {
		console.log('received color notification: ', arguments);
	});

	signaller.send('/color', {
		src: signaller.id,
		color: 'blue'
	});
});