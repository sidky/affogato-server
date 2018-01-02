'use strict';

const firebaseAdmin = require("firebase-admin");
const Hapi = require('hapi');
//const hapiAuthFirebase = require('hapi-auth-firebase');

//var serviceAccount = require(process.env.FIREBASE_SERVICE);

// firebaseAdmin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//     databaseURL: "https://affogato-190622.firebaseio.com/"
//   });

// Create a server with a host and port
const server = Hapi.server({ 
    port: process.env.PORT || 8000 
});

server.ext('onRequest', (request, h) => {
    console.log('called: ' + request);
    return h.continue;
});

server.route({
    method: 'GET',
    path:'/hello', 
    handler: function (request, h) {

        return 'hello world';
    }
});

server.route({
    method: 'GET',
    path: '/api/foo',
    handler: function (request, h) {
        return { 'foo': 1, 'bar': 'baz'};
    }
});

async function start() {
    try {
        await server.start();
    } catch (err) {
        console.log(err);
        process.exit(1);
    }

    console.log("" + process.env.FIREBASE_SERVICE);

    console.log('Server running at: ' + server.info.uri);
}

start();