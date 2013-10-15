var glue = require('../..')(document);
var quickconnect = require('rtc-quickconnect');

// when we get a peer connect them in the html
quickconnect.on('peer', glue.connect);