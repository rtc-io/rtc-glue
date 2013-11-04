var http = require('http');
var server = http.createServer();
var port = parseInt(process.env.PORT, 10) || 3000;
var switchboard = require('rtc-switchboard')(server);

server.listen(3000);