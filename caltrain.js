var request = require('request-promise');
const util = require('util');

var API_KEY = process.env.API_KEY_511;
var HOST_NAME = 'http://api.511.org/transit';
var CALTRAIN_CODE = 'CT';

var QUERY_COMMON = {
    api_key: API_KEY,
    operator_id: CALTRAIN_CODE,
    format: 'json',
};

var API_COMMON = {
    qs: QUERY_COMMON,
    json: true,
    gzip: true
};

const LineType = {
    LOCAL: 'Local',
    LIMITED: 'Limited',
    BULLET: 'Baby Bullet'
};

const Direction = {
    NORTH: 'N',
    SOUTH: 'S'
};

class Location {
    constructor(longitude, latitude) {
        this.longitude = longitude;
        this.latitude = latitude;
    }
};

class StopPlace {
    constructor(id, name, location, public_code, direction) {
        this.id = id;
        this.name = name;
        this.location = location;
        this.public_code = public_code;
        this.direction = direction;
    }
};

var API_LINES = _extend(API_COMMON, { uri: `${HOST_NAME}/lines` });

var API_STOP_PLACES = _extend(API_COMMON, { uri: `${HOST_NAME}/stopPlaces`})

function api_path(url, extra_query) {
    var url_object = { url: url }
    var query_object = { qa: extra_query }
    return _extend(API_COMMON, url_object, query_object);
}

function api_pattern(line_id) {
    return _extend(API_COMMON, { uri: `${HOST_NAME}/patterns` }, {qs: { line_id: line_id }});
}

function api_timetable(line_id) {
    return _extend(API_COMMON, { uri: `${HOST_NAME}/timetable` },{ qs: _extend(QUERY_COMMON, { line_id: line_id }) });
}

function _extend() {
    var combined = {};
    [].slice.call(arguments).forEach(function(source) {
        for (var prop in source) {
            combined[prop] = source[prop];
        }
    });
    return combined;
}

function _location_from_cenroid(centroid) {
    if (centroid == null || centroid.Location == null || centroid.Location.Latitude == null || centroid.Location.Longitude == null) {
        return null;
    } else {
        return new Location(centroid.Location.Latitude, centroid.Location.Longitude);
    }
}

function _heading(quays) {
    if (quays == null || quays.Quay.CompassOctant == null) {
        console.log('Quays: ' + quays);
        return null;
    } else {
        return (quays.Quay.CompassOctant == 'E') ? Direction.NORTH : Direction.SOUTH;
    }
}

module.exports = {
    Location,
    StopPlace,
    lines: async function lines() {
        return await request(API_LINES);
    },
    
    patterns: async function patterns(line_id) {
        return await request(api_pattern(line_id));
    },

    timetable: async function timetable(line_id) {
        return await request(api_timetable(line_id));
    },

    stop_places: async function () {
        return await (request(API_STOP_PLACES).then(function(response) {
            var parsed = JSON.parse(response.trim());
            var places = parsed.Siri.ServiceDelivery.DataObjectDelivery.dataObjects.SiteFrame.stopPlaces.StopPlace;
            return places.map(function(server_stop) {
                return new StopPlace(server_stop['@id'], server_stop.Name, _location_from_cenroid(server_stop.Centroid), server_stop.PublicCode, _heading(server_stop.quays));
            });
        }));
    }
}