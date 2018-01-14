var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var request = require('request');

var requestSettings = {
  method: 'GET',
  url: 'http://api.511.org/transit/TripUpdates?api_key=cb6ed7ea-2836-4f9e-a2d3-83a5467c9dde&agency=CT',
  encoding: null
};
// var v = request(requestSettings, function (error, response, body) {
//   if (!error && response.statusCode == 200) {
//     var feed = GtfsRealtimeBindings.FeedMessage.decode(body);
//     console.log(feed);
//     feed.entity.forEach(function(entity) {
//       if (entity.trip_update) {
//         console.log(entity.trip_update);
//       }
//     });
//   }
// });
// console.log('end' + v);

var caltrain = require('./caltrain.js');

var x = caltrain.lines();
console.log(x);
await x;
// let resp = await x;

// console.log(resp);