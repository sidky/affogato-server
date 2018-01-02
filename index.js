const util = require('util')

const firebaseAdmin = require("firebase-admin");
const Hapi = require('hapi');
//const hapiAuthFirebase = require('hapi-auth-firebase');

var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE);

firebaseAdmin.initializeApp({
     credential: firebaseAdmin.credential.cert(serviceAccount),
     databaseURL: "https://affogato-190622.firebaseio.com/"
   });

// Create a server with a host and port
const server = Hapi.server({ 
    port: process.env.PORT || 8000 
});

const boom = require('boom');
const hoek = require('hoek');

const scheme = function(server, options) {
    const settings = hoek.clone(options);
    return {
        authenticate: async function (request, h) {
            const authorization = request.headers.authorization;

            if (!authorization) {
                // h.unauthenticated('Authorization header missing');
                throw boom.unauthorized(null, 'firebase', settings.unauthorizedAttributes);
            }

            const parts = authorization.split(" ");

            if (parts[0].toLowerCase() !== 'bearer') {
                throw boom.unauthorized(null, 'firebase', settings.unauthorizedAttributes);
            }

            if (parts.length !== 2) {
                throw boom.badRequest('Bad HTTP authentication header', 'firebase');
            }

            const credential = parts[1];
            try {
                const decodedToken = firebaseAdmin.auth().verifyIdToken(credential);
                if (!decodedToken) {
                    throw boom.unauthorized('Unable to authenticate user', 'firebase', settings.unauthorizedAttributes);
                } else {
                    return h.authenticated({ credentials: decodedToken });
                }
            } catch (err) {
                throw boom.unauthorized('Unable to authenticate token', 'firebase', settings.unauthorizedAttributes);
            }
        }
    }
}

async function start() {
    server.auth.scheme('firebase', scheme)
    server.auth.strategy('firebase', 'firebase');

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
        config: {
            auth: 'firebase'
        },
        handler: function (request, h) {
            console.log(util.inspect(request.auth, false, null));
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