var request = require('request-promise');
const util = require('util');

// 511.org API constants

// API Key, stored in heroku config
var API_KEY = process.env.API_KEY_511;

// 511.org API Host name
var HOST_NAME = 'http://api.511.org/transit';

// Agency code for caltrain.
var CALTRAIN_CODE = 'CT';


// hapi constants to query 511.org API.

// Common query configuration for all API queries. This includes
// API key, operator code and format.
var QUERY_COMMON = {
    api_key: API_KEY,
    operator_id: CALTRAIN_CODE,
    format: 'json',
};

// Base constant for 511.org API requests. This includes QUERY_COMMON inside
// property qs, since hapi-request uses that to generate the query parameter
// of the outbound request.
// gzip parameter is included so that, the framework would decompress the 
// response payload.
var API_COMMON = {
    qs: QUERY_COMMON,
    json: true,
    gzip: true
};

// Types of caltrain trains. See 
// http://api.511.org/transit/lines?api_key={your-key}&operator_id=CT for
// details.
const LineType = {
    LOCAL: 'Local',
    LIMITED: 'Limited',
    BULLET: 'Baby Bullet'
};

// Direction of train.
const Direction = {
    NORTH: 'N',
    SOUTH: 'S'
};

// Day of the week. The constants are extracted from ServiceCalendarFrame
// property of
// http://api.511.org/transit/timetable?api_key={your-key}&operator_id=CT
const DayOfWeek = {
    SAT: 72983,
    SUN: 72981,
    WEEKDAY: 72983    
}


// Data types returned from Caltrain API.

/**
 * Geographic location. Used to pin point a stop with it's 
 * latitude and longitude.
 */
class Location {
    /**
     * 
     * @param {Number} longitude longitude of the location.
     * @param {Number} latitude latitude of the location.
     */
    constructor(longitude, latitude) {
        this.longitude = longitude;
        this.latitude = latitude;
    }
};

/**
 * Description of a stop.
 */
class StopPlace {
    /**
     * Constructs a StopPlace.
     * @param {string} id identifier of the stop.
     * @param {string} name name of the stop.
     * @param {Location} location geographic location of the stop.
     * @param {string} public_code code used in API to identify the stop.
     * @param {String} direction direction of train, arriving at this stop.
     *                           Either {@link Direction#NORTH} or 
     *                           {@link Direction#SOUTH}.
     */
    constructor(id, name, location, public_code, direction) {
        this.id = id;
        this.name = name;
        this.location = location;
        this.public_code = public_code;
        this.direction = direction;
    }
};

/**
 * Description of stops along a route.
 */
class RouteStops {

    /**
     * 
     * @param {string} id identifier of the route.
     * @param {string} name name of the route.
     * @param {*} line_id identifier of the line. One of {@link LineType#LOCAL},
     *                    {@link LineType#LIMITED} or {@link LineType#BULLET}.
     * @param {*} direction direction of the route. One of 
     *                      {@link Direction#NORTH} or {@link Direction#SOUTH}.
     * @param {*} stops list of stops along the route.
     */
    constructor(id, name, line_id, direction, stops) {
        this.id = id;
        this.name = name;
        this.line_id = line_id;
        this.direction = direction;
        this.stops = stops;
    }

    /**
     * Parses {@link RouteStops} from a route structure JSON returned from 
     * 511.org API.
     * @param {*} route route structure.
     * @returns {@link RouteStops} from the JSON.
     */
    static fromRoute(route) {
        var id = route.id;
        var name = route.Name;
        var line_id = route.LineRef.ref;
        var direction = route.DirectionRef.ref.startsWith("N") 
            ? Direction.NORTH 
            : Direction.SOUTH;
        var stops = [];
        var api_stops = route.pointsInSequence.PointOnRoute;

        for (var index in api_stops) {
            var stop = api_stops[index].PointRef.ref
            stops.push(stop);
        }

        return new RouteStops(id, name, line_id, direction, stops);
    }
}

class DayType {

    /**
     * @param {string} id identifier for the day.
     * @param {string} name name of the day
     * @param {...string} days name of days included by this type.
     */
    constructor(id, name, days) {
        this.id = id;
        this.name = name;
        this.days = days;
    }
}

/**
 * Availability of train, during a holiday. Availability is defined with
 * day types. This structure defines, on a particular day, which day types
 * are available, and which are not. E.g. there won't be any weekday service
 * during christmas.
 */
class Availability {
    /**
     * 
     * @param {string} id identifier of availability
     * @param {Date} date Date of the day.
     * @param {...string} available list of day types made available.
     * @param {...string} unavailable list of day types made unavailable.
     */
    constructor(id, date, available, unavailable) {
        this.id = id;
        this.date = date;
        this.available = available;
        this.unavailable = unavailable;
    }
}

/**
 * Time of an event, to the closest minute.
 */
class TrainTime {

    /**
     * 
     * @param {int} hour hour of the day.
     * @param {int} minute minute of the day.
     * @param {int} day_offset if train arrives in a different day, from
     *                         the time it left the first station.
     */
    constructor(hour, minute, day_offset) {
        this.hour = hour;
        this.minute = minute;
        this.day_offset = day_offset;
    }
}

/**
 * Scheduled stop by a train at a stop. A complute schedule of a train
 * can be described with a list of {@link TrainAtStopSchedule}.
 */
class TrainAtStopSchedule {

    /**
     * 
     * @param {string} stop_id identifier of the stop.
     * @param {TrainTime} arrival arrival time.
     */
    constructor(stop_id, arrival) {
        this.stop_id = stop_id;
        this.arrival = arrival;
    }

    static parse(call) {
        var stop_id = call.ScheduledStopPointRef.ref;
        var time = call.Arrival.Time.split(':');
        var hour = parseInt(time[0], 10);
        var minute = parseInt(time[1], 10);
        var day_offset = parseInt(call.Arrival.DaysOffset);
        return new TrainAtStopSchedule(stop_id, 
            new TrainTime(hour, minute, day_offset));
    }
}

/**
 * Schedule of train stops, along the line.
 */
class LineSchedule {

    /**
     * 
     * @param {string} id journey id of the train. This is the identifier of the
     *                    train.
     * @param {string} route_id identifier of the route. References 
     *                          to {@link RouteStop#id}.
     * @param {string} direction direction of the train. One of 
     *                           {@link Direction#NORTH} or 
     *                           {@link Direction#SOUTH}.
     * @param {...TrainAtStopsSchedule} stop_times stops along a route.
     */
    constructor(id, route_id, direction, stop_times) {
        this.id = id;
        this.route_id = route_id;
        this.direction = direction;
        this.stop_times = stop_times;
    }

    static parse(journey) {
        var id = journey.id;
        var route_id = journey.JourneyPatternView.RouteRef.ref;
        var direction = 
            journey.JourneyPatternView.DirectionRef.ref.startsWith('N') 
                ? Direction.NORTH 
                : Direction.SOUTH;
        var stop_times = [];

        for (var index in journey.calls.Call) {
            var call = TrainAtStopSchedule.parse(journey.calls.Call[index]);
            stop_times.push(call);
        }

        return new LineSchedule(id, route_id, direction, stop_times);
    }
}

/**
 * Predicted train event. This is used to predict both arrival and departure
 * of a train.
 */
class PredictedEvent {

    /**
     * 
     * @param {string} stop_id identifier of the stop.
     * @param {string} vehicle_id identifier of the vehicle, to arrive/depart
     *                            at/from the stop.
     * @param {Date} actual_time  time the train was supposed to arrive/depart.
     * @param {Date} expected_time predicted time, the train would 
     *                             arrive/depart.
     */
    constructor(stop_id, vehicle_id, actual_time, expected_time) {
        this.stop_id = stop_id;
        this.vehicle_id = vehicle_id;
        this.actual_time = actual_time;
        this.expected_time = expected_time;
    }
}

/**
 * Predictions at a stop.
 */
class PredictionsAtStop {

    /**
     * 
     * @param {string} stop_id stop identifier.
     * @param {...PredictedEvent} arrivals list of expected arrivals.
     * @param {...PredictedEvent} departure list of expected departures.
     */
    constructor(stop_id, arrivals, departure) {
        this.stop_id = stop_id;
        this.arrivals = arrivals;
        this.departures = departure;
    }
}

/**
 * Response from 511.org about predictions. This is generated from 
 * Real time predictions at a Stop Message structure (see section C.1.10).
 * 
 * @property {string} identifier of the prediction
 * @property {...PredictionsAtStop} predicted arrival/departures at stop.
 */
class PredictionsReponse {
    constructor(updated_at) {
        this.updated_at = updated_at;
        this.stops = {};
    }

    /**
     * @param {PredictedEvent} predicted_event an arrival event.
     */
    add_arrival(predicted_event) {
        var id = predicted_event.stop_id;

        if (this.stops[id] === undefined) {
            this.stops[id] = new PredictionsAtStop(id, [], []);
        }

        this.stops[id].arrivals.push(predicted_event);
    }

    /**
     * 
     * @param {PredictedEvent} predicted_event a departure event.
     */
    add_departure(predicted_event) {
        var id = predicted_event.stop_id;

        if (this.stops[id] === undefined) {
            this.stops[id] = new PredictionsAtStop(id, [], []);
        }

        this.stops[id].departures.push(predicted_event);
    }
}

/**
 * Train schedule.
 */
class TrainSchedule {

    /**
     * 
     * @param {string} id identifier of the schedule.
     * @param {string} name name of the schedule.
     * @param {string} day_type_ref day types the schedule is active
     * @param {...LineSchedule} lines list of trains running during the schedule.
     */
    constructor(id, name, day_type_ref, lines) {
        this.id = id;
        this.name = name;
        this.lines = lines;
        this.day_type_ref = day_type_ref;
    }

    static parse_all(timetable_frame) {
        var schedules = [];

        for (var index in timetable_frame) {
            var timetable = timetable_frame[index];

            var id = timetable.id;
            var name = timetable.Name;
            var day_type_ref = timetable
                    .frameValidityConditions
                    .AvailabilityCondition
                    .dayTypes
                    .DayTypeRef
                    .ref;
            var lines = [];

            var journeys = timetable.vehicleJourneys.ServiceJourney;

            for (var journey_index in journeys) {
                var journey = LineSchedule.parse(journeys[journey_index]);
                lines.push(journey);
            }

            schedules.push(new TrainSchedule(id, name, day_type_ref, lines));
        }

        return schedules;
    }
}

// 511.org API paths
// See http://assets.511.org/pdf/nextgen/developers/Open_511_Data_Exchange_Specification_v1.25_Transit.pdf
var API_LINES = _extend(API_COMMON, { uri: `${HOST_NAME}/lines` });
var API_STOP_PLACES = _extend(API_COMMON, { uri: `${HOST_NAME}/stopPlaces`});
var API_HOLIDAYS = _extend(API_COMMON, { uri: `${HOST_NAME}/holidays`});
var API_PREDICTION = api_path(`${HOST_NAME}/StopMonitoring`, { agency: 'CT'})

function api_path(url, extra_query) {
    var url_object = { url: url }
    var query_object = { qs: _extend(QUERY_COMMON, extra_query) }
    return _extend(API_COMMON, url_object, query_object);
}

function api_pattern(line_id) {
    return _extend(API_COMMON, 
        { uri: `${HOST_NAME}/patterns` }, 
        {qs: { line_id: line_id }});
}

function api_timetable(line_id) {
    return _extend(API_COMMON, 
        { uri: `${HOST_NAME}/timetable` },
        { qs: _extend(QUERY_COMMON, { line_id: line_id }) });
}

function api_prediction(stop_id) {
    return _extend(API_COMMON, { 
        uri: `${HOST_NAME}/StopMonitoring`,
        qs: _extend(QUERY_COMMON, { agency: 'CT', stopCode: stop_id })
    });
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
    if (centroid == null || centroid.Location == null 
        || centroid.Location.Latitude == null 
        || centroid.Location.Longitude == null) {
        return null;
    } else {
        return new Location(
            centroid.Location.Latitude, 
            centroid.Location.Longitude);
    }
}

function _heading(quays) {
    if (quays == null || quays.Quay.CompassOctant == null) {
        return null;
    } else {
        return (quays.Quay.CompassOctant == 'E') 
            ? Direction.NORTH
            : Direction.SOUTH;
    }
}

function _parse_date(date_time) {
    if (date_time !== undefined) {
        return new Date(date_time);
    } else {
        return undefined;
    }
}

module.exports = {
    LineType,
    Location,
    StopPlace,
    lines: async function lines() {
        return await request(API_LINES);
    },
    
    patterns: async function patterns(line_id) {
        return await request(api_pattern(line_id));
    },

    timetable: async function timetable(line_id) {
        return await request(api_timetable(line_id)).then(function(response) {
            var parsed = JSON.parse(response.trim());
            var timetable = parsed.Content;
            var routes = timetable.ServiceFrame.routes.Route;

            var converted_routes = [];

            for (var route_index in routes) {
                var r = RouteStops.fromRoute(routes[route_index]);
                converted_routes.push(r);
            }

            var timetable = TrainSchedule.parse_all(timetable.TimetableFrame);

            return {
                routes: converted_routes,
                timetable: timetable
            };
        });
    },

    stop_places: async function () {
        return await (request(API_STOP_PLACES).then(function(response) {
            var parsed = JSON.parse(response.trim());
            var places = parsed
                    .Siri
                    .ServiceDelivery
                    .DataObjectDelivery
                    .dataObjects
                    .SiteFrame
                    .stopPlaces
                    .StopPlace;
            return places.map(function(server_stop) {
                return new StopPlace(
                    server_stop['@id'], 
                    server_stop.Name, 
                    _location_from_cenroid(server_stop.Centroid), 
                    server_stop.PublicCode, 
                    _heading(server_stop.quays));
            });
        }));
    },

    holidays: async function () {
        return await(request(API_HOLIDAYS).then(function(response) {
            var parsed = JSON.parse(response.trim()).Content;
            var parsed_daytype = parsed.DayType;
            var parsed_availability = parsed.AvailabilityConditions;
            
            var day_types = [];
            for (var index in parsed_daytype) {
                var parsed_day = parsed_daytype[index];
                var day_list = parsed_day
                    .properties
                    .PropertyOfDay
                    .DaysOfWeek
                    .trim()
                    .split(' ');
                var day = new DayType(parsed_day.id, parsed_day.Name, day_list);
                day_types.push(day);
            }

            var availability = {};

            for (var index in parsed_availability) {
                var availability_at_index = parsed_availability[index];
                var parsed_day_types = availability_at_index.dayTypes.DayTypeRef;
                var types = [];

                if (Array.isArray(parsed_day_types)) {
                    for (var i in parsed_day_types) {
                        types.push(parsed_day_types[i].ref);
                    }
                } else {
                    var date_id = parsed_day_types.ref;
                    types.push(date_id);
                }
                var date = new Date(availability_at_index.FromDate);

                var updated_availability = 
                    typeof availability[date.getTime()] === "undefined" 
                        ? new Availability(
                            availability_at_index.id, 
                            date, 
                            [], 
                            [])
                        : availability[date.getTime()];

                if (availability_at_index.IsAvailable === "true") {
                    updated_availability.available = 
                            updated_availability.available.concat(types);
                } else {
                    updated_availability.unavailable = 
                            updated_availability.unavailable.concat(types);
                }

                availability[date.getTime()] = updated_availability;
            }

            return {
                availability: availability,
                day_types: day_types
            };
        }));
    },

    stop_predictions: async function() {
        return await(request(API_PREDICTION).then(function(response) {
            var parsed = JSON.parse(response.trim()).ServiceDelivery;
            var update_time = new Date(parsed.ResponseTimestamp);

            var predictions = new PredictionsReponse(update_time);

            var visits = parsed.StopMonitoringDelivery.MonitoredStopVisit;

            for (var index in visits) {
                visit = visits[index].MonitoredVehicleJourney;
                var aimed_arrival = 
                    _parse_date(visit.MonitoredCall.AimedArrivalTime);
                var expected_arrival = 
                    _parse_date(visit.MonitoredCall.ExpectedArrivalTime) || aimed_arrival;
                var aimed_departure = 
                    _parse_date(visit.MonitoredCall.AimedDepartureTime);
                var expected_departure = 
                    _parse_date(visit.MonitoredCall.ExpectedDepartureTime) || aimed_departure;

                var arrival = new PredictedEvent(
                    visit.MonitoredCall.StopPointRef, 
                    visit.FramedVehicleJourneyRef.DatedVehicleJourneyRef,
                    aimed_arrival,
                    expected_arrival)
                predictions.add_arrival(arrival);

                var departure = new PredictedEvent(
                    visit.MonitoredCall.StopPointRef, 
                    visit.FramedVehicleJourneyRef.DatedVehicleJourneyRef,
                    aimed_departure,
                    expected_departure)
                predictions.add_departure(departure);
            }

            return predictions;
        }));
    }
}