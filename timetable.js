const util = require('util');
const firebaseAdmin = require("firebase-admin");
var caltrain = require('./caltrain.js');

var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE);

firebaseAdmin.initializeApp({
     credential: firebaseAdmin.credential.cert(serviceAccount),
     databaseURL: "https://affogato-190622.firebaseio.com/"
   });

async function sync_stops(db) {
    console.log("Synchronizing stops");
    var stops = await caltrain.stop_places();

    var stop_list = {};

    stop_list['update_at'] = new Date().getTime();

    var stop_map = {};

    for (var i = 0; i < stops.length; i++) {
        var stop = stops[i];
        stop_map[stop.id] = stop;
    }

    var ref = db.ref("caltrain/stops");

    ref.update(stop_map);

    return stop_list;
}

async function sync_holidays(db) {
    console.log("Synchronizing holidays");
    var holidays = await caltrain.holidays();
    var day_types = holidays.day_types;

    var modified_day_types = {};

    for (var index in day_types) {
        var type = day_types[index];
        modified_day_types[type.id] = type;
    }

    var day_type_ref = db.ref("caltrain/day_types");
    var availability = db.ref("caltrain/availability");

    day_type_ref.update(modified_day_types);
    availability.update(holidays.availability);

    return {
        day_types: modified_day_types,
        availability: holidays.availability
    }
}

class TrainLineDescription {
    constructor(vehicle_id, line_name, day_type_ref, route_id, direction, stop_times) {
        this.vehicle_id = vehicle_id;
        this.line_name = line_name;
        this.day_type_ref = day_type_ref;
        this.route_id = route_id;
        this.direction = direction;
        this.stop_times = stop_times;
    }
}

async function load_timetable_line(line_type) {
    var timetable = await caltrain.timetable(line_type);
    var modified_routes = {};

    for (var index in timetable.routes) {
        var route = timetable.routes[index];
        modified_routes[route.id] = route;
    }

    var journeys = timetable.timetable;
    var trains = {};

    for (var journey_index in journeys) {
        var journey = journeys[journey_index];

        for (var line_index in journey.lines) {
            var line = journey.lines[line_index];
            var train = new TrainLineDescription(
                line.id, 
                journey.name, 
                journey.day_type_ref,
                line.route_id, 
                line.direction, 
                line.stop_times);

            trains[train.vehicle_id] = train;
        }
    }

    return {
        routes: modified_routes,
        trains: trains
    };
}

async function sync_timetable(db) {
    console.log("Synchronizing timetable");
    var local = load_timetable_line(caltrain.LineType.LOCAL);
    var limited = load_timetable_line(caltrain.LineType.LIMITED);
    var bullet = load_timetable_line(caltrain.LineType.BULLET);

    return Promise.all([local, limited, bullet]).then(function(values) {
        var timetable_local = values[0];
        var timetable_limited = values[1];
        var timetable_bullet = values[2];

        var routes = {};
        var trains = {};

        routes = Object.assign(routes, 
            timetable_local.routes, 
            timetable_limited.routes, 
            timetable_bullet.routes);

        trains = Object.assign(trains, 
            timetable_local.trains, 
            timetable_limited.trains,
            timetable_bullet.trains);

        var route_ref = db.ref("caltrain/routes");
        route_ref.update(routes);

        var train_ref = db.ref("caltrain/trains");
        train_ref.update(trains);

        return {
            routes: routes,
            trains: trains
        }
    });
}

class ArrivalAtStop {
    constructor(time, vehicle_id, day_type) {
        this.arrival = time;
        this.vehicle_id = vehicle_id;
        this.day_type = day_type;
    }
}

class TrainJourney {
    constructor(source, destination, departure, arrival, vehicle_id, day_type) {
        this.source = source;
        this.destination = destination;
        this.departure = departure;
        this.arrival = arrival;
        this.vehicle_id = vehicle_id;
        this.day_type = day_type;
    }
}

async function sync_data() {
    var db = firebaseAdmin.database();
    promise_stop =  sync_stops(db);
    promise_holiday = sync_holidays(db);
    promise_timetable = sync_timetable(db);

    await Promise.all([promise_stop, promise_holiday, promise_timetable]).then(function(values) {
        var stops = values[0];
        var holidays = values[1];
        var timetable = values[2];

        var updates = {};

        for (var train_index in timetable.trains) {

            var train = timetable.trains[train_index];

            for (var i = 0; i < train.stop_times.length; i++) {
                var stop_time = train.stop_times[i];
                var train_time = new ArrivalAtStop(
                    stop_time.arrival, 
                    train.vehicle_id,
                    train.day_type_ref);
                if (updates[stop_time.stop_id] === undefined) {
                    updates[stop_time.stop_id] = {
                        trains: [],
                        journeys: {}
                    };
                }
                var source = stop_time.stop_id;
                updates[source].trains.push(train_time);

                var update_stop = updates[source];

                for (var j = i + 1; j < train.stop_times.length; j++) {
                    var dest_stop = train.stop_times[j];
                    var destination = dest_stop.stop_id;
                    var departure = stop_time.arrival;
                    var arrival = dest_stop.arrival;

                    if (update_stop.journeys[destination] === undefined) {
                        update_stop.journeys[destination] = [];
                    }

                    update_stop.journeys[destination].push(
                        new TrainJourney(
                            source,
                            destination, 
                            departure, 
                            arrival, 
                            train.vehicle_id,
                            train.day_type_ref));
                }
            }
        }

        for (var index in updates) {
            var update = updates[index];
            var ref = db.ref("caltrain/stops").child(index);
            ref.update(update);
        }
    }).catch(function(error) {
        console.log(util.inspect(error));
    });
}

sync_data();



