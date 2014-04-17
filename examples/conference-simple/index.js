var quickconnect = require('rtc-quickconnect');
var qc = quickconnect('http://rtc.io/switchboard/', { room: 'glue-simpleconf' });

// use glue to autowire elements to the page
require('../../')(qc);
