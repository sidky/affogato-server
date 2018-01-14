'use strict';

const scheme = function(server, options) {
    const boom = require('boom');
    const hoek = require('hoek');
    const firebaseAdmin = require("firebase-admin");
    
    const settings = hoek.clone(options);

    return {
        authenticate: async function (request, h) {
            const authorization = request.headers.authorization;

            if (!authorization) {
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
                const decodedToken = await firebaseAdmin.auth().verifyIdToken(credential);
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

module.exports = {
    register: async (server, options) => {
        server.auth.scheme('firebase', scheme)
        server.auth.strategy('firebase', 'firebase');
    },
    name: 'Firebase Authentication Plugin',
    version: '0.0.1'
}