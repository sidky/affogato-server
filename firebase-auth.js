'use strict';

const boom = require('boom');
const hoek = require('hoek');
const firebaseAdmin = require("firebase-admin");

const internals = {};

internals.implementaion = function(server, options) {
    const settings = hoek.clone(options);

    const scheme = {
        authenticate: async function (request, h) {
            const authorization = request.headers.authorization;

            if (!authorization) {
                throw boom.unauthorized(null, 'firebase', settings.unauthorizedAttributes);
            }

            const parts = authorization.split(/s+/);

            if (parts[0].toLowerCase !== 'bearer') {
                throw boom.unauthorized(null, 'firebase', settings.unauthorizedAttributes);
            }

            if (parts.length !== 2) {
                throw boom.badRequest('Bad HTTP authentication header', 'firebase');
            }

            const credential = parts[1];
            try {
                const decodedToken = firebaseAdmin.auth().verifyIdToken(authToken);
                if (!decodedToken) {
                    throw boom.unauthorized('Unable to authenticate user', 'firebase', settings.unauthorizedAttributes);
                } else {
                    return h.authenticated({ decodedToken });
                }
            } catch (err) {
                throw boom.badImplementation('Unable to authenticate token', 'firebase');
            }
        }
    }
    return scheme;
}

exports.plugin = {
    name: 'firebase-custom',
    register: function(server) {
        server.auth.scheme('firebase-custom', internals.implementaion)
    }
};