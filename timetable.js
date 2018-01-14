const util = require('util');
const firebaseAdmin = require("firebase-admin");
var caltrain = require('./caltrain.js');

var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE);

firebaseAdmin.initializeApp({
     credential: firebaseAdmin.credential.cert(serviceAccount),
     databaseURL: "https://affogato-190622.firebaseio.com/"
   });

async function sync_data() {
    var stops = await caltrain.stop_places();

    var stop_list = {};

    stop_list['update_at'] = new Date().getTime();

    var stop_map = {};

    console.log(stops.length);

    for (var i = 0; i < stops.length; i++) {
        var stop = stops[i];
        console.log(stop.id);
        stop_map[stop.id] = stop;
    }

    stop_list['stops'] = stop_map;

    var db = firebaseAdmin.database();
    var ref = db.ref("caltrain/stop_list");

    ref.update(stop_list);
}

sync_data();



