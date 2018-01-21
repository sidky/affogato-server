const util = require('util')

const firebaseAdmin = require("firebase-admin");
const Hapi = require('hapi');
var caltrain = require('./caltrain.js');

var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE);

firebaseAdmin.initializeApp({
     credential: firebaseAdmin.credential.cert(serviceAccount),
     databaseURL: "https://affogato-190622.firebaseio.com/"
   });

// Create a server with a host and port
const server = Hapi.server({ 
    port: process.env.PORT || 8000 
});

async function start() {
    await server.register(require('./firebase-auth.js'));

    server.route({
        method: 'GET',
        path:'/hello', 
        handler: function (request, h) {
            return 'hello world';
        }
    });

    server.route({
        method: 'GET',
        path:'/caltrain/lines', 
        handler: function (request, h) {
            return caltrain.lines();
        }
    });

    server.route({
        method: 'GET',
        path:'/caltrain/patterns', 
        handler: function (request, h) {
            return caltrain.patterns(request.query.line_id);
        }
    });

    server.route({
        method: 'GET',
        path:'/caltrain/timetable', 
        handler: function (request, h) {
            return caltrain.timetable(request.query.line_id);
        }
    });

    server.route({
        method: 'GET',
        path:'/caltrain/stopPlaces', 
        handler: function (request, h) {
            var v = caltrain.stop_places();
            return v;
        }
    });

    server.route({
        method: 'GET',
        path: '/api/foo',
        config: {
            auth: 'firebase'
        },
        handler: function (request, h) {
            console.log(util.inspect(request.auth, false, null));
            var db = firebaseAdmin.database();
            var ref = db.ref("users");
            console.log("ref: %o", ref);
            var properties = {
                name: request.auth.credentials.name,
                picture: request.auth.credentials.picture,
                auth_time: request.auth.credentials.auth_time,
                email: request.auth.credentials.email
            }
            var userObject = {};
            userObject[request.auth.credentials.uid] = properties;

            ref.update(userObject);
            
            console.log("complete");
            return { 'foo': 1, 'bar': 'baz'};
        }
    });
   
    try {
        await server.start();
    } catch (err) {
        console.log(err);
        process.exit(1);
    }

    console.log('Server running at: ' + server.info.uri);
}

start();