const util = require('util');
const firebaseAdmin = require("firebase-admin");
const caltrain = require('./caltrain.js');

var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE);

firebaseAdmin.initializeApp({
     credential: firebaseAdmin.credential.cert(serviceAccount),
     databaseURL: "https://affogato-190622.firebaseio.com/"
   });

async function sync_prediction() {
    var prediction = await caltrain.stop_predictions();
    var db = firebaseAdmin.database();

    var prediction_ref = db.ref("caltrain/realtime");
    prediction_ref.set(prediction);
}

sync_prediction().catch(function(error) {
    console.log(error);
});