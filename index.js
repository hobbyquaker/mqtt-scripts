#!/usr/bin/env node

var config =            require('./config.js');
var pkg =               require('./package.json');
var log =               require('yalm');

log.setLevel(['debug', 'info', 'warn', 'error'].indexOf(config.verbosity) !== -1 ? config.verbosity : 'info');

var modules = {
    'vm':               require('vm'),
    'fs':               require('fs'),
    'dgram':            require('dgram'),
    'domain':           require('domain'),
    'crypto':           require('crypto'),
    'dns':              require('dns'),
    'events':           require('events'),
    'http':             require('http'),
    'https':            require('https'),
    'net':              require('net'),
    'os':               require('os'),
    'path':             require('path'),
    'util':             require('util'),
    'child_process':    require('child_process'),
    'coffee-compiler':  require('coffee-compiler'),
    'mqtt':             require('mqtt'),
    'watch':            require('watch'),
    'node-schedule':    require('node-schedule'),
    'suncalc':          require('suncalc')
};

var domain =            modules.domain;
var vm =                modules.vm;
var fs =                modules.fs;
var path =              modules.path;
var watch =             modules.watch;
var scheduler =         modules['node-schedule'];
var suncalc =           modules['suncalc'];

var status =            {};
var scripts =           {};
var subscriptions =     [];

var _global =           {};

log.info(pkg.name + ' ' + pkg.version + ' starting');

var mqtt;
mqtt = modules.mqtt.connect(config.url, {will: {topic: config.name + '/connected', payload: '0'}});
mqtt.publish(config.name + '/connected', '2');

var firstConnect = true;
var startTimeout;
var connected;

mqtt.on('connect', function () {
    connected = true;
    log.info('mqtt connected ' + config.url);
    log.debug('mqtt subscribe #');
    mqtt.subscribe('#');
    if (firstConnect) {
        // Wait until retained topics are received before we load the scripts (timeout is prolonged on incoming retained messages)
        startTimeout = setTimeout(start, 500);
    }
});

mqtt.on('close', function () {
    if (connected) {
        firstConnect = false;
        connected = false;
        log.info('mqtt closed ' + config.url);
    }
});

mqtt.on('error', function () {
    log.error('mqtt error ' + config.url);
});

mqtt.on('message', function (topic, payload, msg) {
    //log.debug('mqtt <', topic, payload, {retain: msg.retain, qos: msg.qos, dup: msg.dup});

    if (firstConnect && msg.retain) {
        // retained message received - prolong the timeout
        clearTimeout(startTimeout);
        startTimeout = setTimeout(start, 500);
    }

    payload = payload.toString();

    var state;

    var val = payload;

    if (val === 'true') {
        // Payload was the string "true" - treat it as bool true
        state = {val: true};

    } else if (val === 'false') {
        // Payload was the string "false" - treat it as bool false
        state = {val: false};

    } else if (!isNaN(val)) {
        // Payload seems to be type number
        state = {val: parseFloat(val)};

    } else {
        try {
            state = JSON.parse(payload);
        } catch (e) {
            state = {val: val};
        }
    }

    var topicArr = topic.split('/');
    var oldState;

    if (topicArr[0] === config.s && topicArr[1] === 'set' && !config.t) {

        topicArr[1] = 'status';
        topic = topicArr.join('/');
        var oldState = status[topic] || {};
        var ts = (new Date()).getTime();

        state.ts = ts;

        state.lc = state.val !== oldState.val ? ts : oldState.lc;
        status[topic] = state;

        mqtt.publish(topic, JSON.stringify(state), {retain: true});

    } else {

        if (!state.ts) state.ts = new Date().getTime();
        oldState = status[topic] || {};
        if (oldState.val !== state.val) state.lc = state.ts;
        status[topic] = state;
        if (!msg.retain) stateChange(topic, state, oldState, msg);
    }

});

function stateChange(topic, state, oldState, msg) {
    subscriptions.forEach(function (subs) {
        var options = subs.options || {};
        var delay;
        var match;

        if (typeof subs.topic === 'string') {
            match = mqttWildcards(topic, subs.topic);
        } else if (subs.topic instanceof RegExp) {
            match = topic.match(subs.topic);
        }

        if (typeof subs.callback === 'function' && match) {
            log.debug('match', subs.topic, subs.options, typeof subs.callback);

            if (msg.retain && !options.retain) return;
            if (options.change && (state.val === oldState.val)) return;

            delay = 0;
            if (options.shift) delay += (options.shift * 1000);
            if (options.random) delay += (options.random * Math.random() * 1000);
            if (delay === 0) {
                subs.callback(topic.replace(/^([^\/]+)\/status\/(.+)/, '$1//$2'), state, oldState);
            } else {
                delay = Math.floor(delay);
                //log.debug('delaying', subs.topic, delay);
                setTimeout(function () {
                    subs.callback(topic.replace(/^([^\/]+)\/status\/(.+)/, '$1//$2'), state, oldState);
                }, delay);
            }
        }
    });
}

function mqttWildcards(topic, subscription) {
    return topic.match(new RegExp('^' + subscription.replace(/#$/, '.*').replace(/\+/g, '[^\/]+') + '$'));
}

function createScript(source, name) {
    log.debug(name, 'compiling');
    try {
        if (!process.versions.node.match(/^0\.10\./)) {
            // Node.js >= 0.12, io.js
            return new vm.Script(source, {filename: name});
        } else {
            // Node.js 0.10.x
            return vm.createScript(source, name);
        }
    } catch (e) {
        log.error(name, e.name + ':', e.message);
        return false;
    }
}

function runScript(script, name) {


    log.debug(name, 'creating domain');
    var scriptDomain = domain.create();

    log.debug(name, 'creating sandbox');

    var Sandbox = {

        global: _global,

        setTimeout: setTimeout,
        setInterval: setInterval,
        clearTimeout: clearTimeout,
        clearInterval: clearInterval,

        Buffer: Buffer,

        require: function (md) {
            if (modules[md]) return modules[md];
            try {
                var tmp;
                if (md.match(/^\.\//) || md.match(/^\.\.\//)) {
                    tmp = './' + path.relative(__dirname, path.join(scriptDir, md));
                } else {
                    tmp = md;
                    if (fs.existsSync(path.join(scriptDir, 'node_modules', md, 'package.json'))) {
                        tmp = './' + path.relative(__dirname, path.join(scriptDir, 'node_modules', md));
                    }
                }
                tmp = path.resolve(tmp);
                Sandbox.log.debug('require', tmp);
                modules[md] = require(tmp);
                return modules[md];

            } catch (e) {
                var lines = e.stack.split('\n');
                var stack = [];
                for (var i = 6; i < lines.length; i++) {
                    if (lines[i].match(/runInContext/)) break;
                    stack.push(lines[i]);
                }
                log.error(name + ': ' + e.message + '\n' + stack);
            }
        },

        /**
         * @name log
         */
        log: {
            /**
             * Log a debug message
             * @memberof log
             * @method debug
             * @param {...*}
             */
            debug: function () {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(name + ':');
                log.debug.apply(log, args);
            },
            /**
             * Log an info message
             * @memberof log
             * @method info
             * @param {...*}
             */
            info: function () {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(name + ':');
                log.info.apply(log, args);
            },
            /**
             * Log a warning message
             * @memberof log
             * @method warn
             * @param {...*}
             */
            warn: function () {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(name + ':');
                log.warn.apply(log, args);
            },
            /**
             * Log an error message
             * @memberof log
             * @method error
             * @param {...*}
             */
            error: function () {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(name + ':');
                log.error.apply(log, args);
            }
        },
        /**
         * Subscribe to MQTT topic(s)
         * @method subscribe
         * @param {(string|string[])} topic - topic or array of topics to subscribe
         * @param {Object} [options]
         * @param {number} options.shift - delay execution in seconds. May be negative.
         * @param {number} options.random - random delay execution in seconds.
         * @param {function} [callback]
         *
         */
        subscribe:  function Sandbox_subscribe(topic, /* optional */ options, /* optional */ callback) {
            if ((typeof topic === 'undefined')) {
                throw(new Error('argument topic missing'));
            }

            if (arguments.length === 2 || typeof arguments[2] === 'undefined') {

                if (typeof arguments[1] === 'function') {
                    callback = arguments[1];
                } else {
                    options = arguments[1] || {};
                }

            } else if (arguments.length === 3) {

                if ((typeof arguments[2] !== 'function')) {
                    throw(new Error('argument type mismatch ' + typeof arguments[2]));
                }
                options = arguments[1] || {};
                callback = arguments[2];

            } else if (arguments.length > 3) {
                throw(new Error('wrong number of arguments'));
            }

            if (typeof topic === 'string') {

                topic = topic.replace(/^\$/, config.s + '/status/');
                topic = topic.replace(/^([^/]+)\/\//, '$1/status/');

                subscriptions.push({topic: topic, options: options, callback: (typeof callback === 'function') && scriptDomain.bind(callback)});

            } else if (typeof topic === 'object' && topic.length) {

                topic = Array.prototype.slice.call(topic);
                topic.forEach(function (tp) {
                    Sandbox.subscribe(tp, options, callback);
                });

            }

        },
        /**
         * Schedule an event by cron-syntax, a date object or a suncalc string
         * @method schedule
         * @param {(string|Object)} pattern - schedule pattern, date object or suncalc event
         * @param {Object} [options]
         * @param {number} options.shift - delay execution in seconds. May be negative.
         * @param {number} options.random - random delay execution in seconds.
         * @param {function} callback
         * @example subscribe('0 * * * *', callback); // Call callback every hour
         * subscribe('sunrise', {shift: -900}, callback); // Call callback 15 minutes before sunrise
         */
        schedule:   function Sandbox_schedule(pattern, /* optional */ options, callback) {
            if (arguments.length === 2) {
                if (typeof arguments[1] !== 'function') {
                    throw(new Error('argument type mismatch'));
                }
                options = {};
                callback = arguments[1];
            } else if (arguments.length === 3) {
                if (typeof arguments[2] !== 'function') {
                    throw(new Error('argument type mismatch'));
                }
                options = arguments[1];
                callback = arguments[2];

            } else {
                throw(new Error('wrong number of arguments'));
            }

            log.debug('schedule', pattern, options);


            if (['sunrise', 'sunriseEnd', 'goldenHourEnd', 'solarNoon', 'goldenHour', 'sunsetStart', 'sunset', 'dusk',
                    'nauticalDusk', 'night', 'nadir', 'nightEnd', 'nauticalDawn', 'dawn'].indexOf(pattern) !== -1) {
                // Astro schedule

                var event = astro(pattern, options);

                log.debug('astro', pattern, event);

                if (event.toString !== 'Invalid Date') {

                    scheduler.scheduleJob(event, function () {
                        // Re-schedule in 12 hours // TODO does that really make sense?
                        setTimeout(function () {
                            Sandbox.schedule(pattern, options, callback);
                        }, 12 * 60 * 60 * 1000);

                        scriptDomain.bind(callback);
                        callback();
                    });

                } else {
                    // event does not occur today - re-schedule next UTC midnight
                    var midnight = new Date();
                    midnight.setDate(midnight.getDate() + 1);
                    midnight.setUTCHours(0,0,0,0);

                    scheduler.scheduleJob(midnight, function () {
                        Sandbox.schedule(pattern, options, callback);
                    });
                }

            } else {

                if (options && options.random) {
                    scheduler.scheduleJob(pattern, function () {
                        setTimeout(function () {
                            scriptDomain.bind(callback);
                            callback();
                        }, options.random * 1000 * Math.random());
                    });
                } else {
                    scheduler.scheduleJob(pattern, scriptDomain.bind(callback));
                }
            }

        },
        /**
         * Publish a MQTT message
         * @method publish
         * @param {(string|string[])} topic - topic or array of topics to publish to
         * @param {(string|Object)} payload - the payload string. If an object is given it will be JSON.stringified
         * @param {Object} [options] - the options to publish with
         * @param {number} [options.qos=0] - QoS Level
         * @param {boolean} [options.retain=false] - retain flag
         */
        publish:    function Sandbox_publish(topic, payload, options) {
            if (typeof topic === 'object' && topic.length) {
                topic = Array.prototype.slice.call(topic);
                topic.forEach(function (tp) {
                    Sandbox.publish(tp, payload, options);
                });
                return;
            }

            topic = topic.replace(/^([^/]+)\/\/(.+)$/, '$1/status/$2');

            if (typeof payload === 'object') {
                payload = JSON.stringify(payload);
            } else {
                payload = '' + payload;
            }
            mqtt.publish(topic, payload, options);
        },
        /**
         * Set a value on one or more topics
         * @method setValue
         * @param {(string|string[])} topic - topic or array of topics to set value on
         * @param {*} val
         */
        setValue:   function Sandbox_setValue(topic, val) {

            if (typeof topic === 'object' && topic.length) {
                topic = Array.prototype.slice.call(topic);
                topic.forEach(function (tp) {
                    Sandbox.setValue(tp, val);
                });
                return;
            }

            topic = topic.replace(/^\$/, config.s + '//');

            var tmp = topic.split('/');
            if (tmp[0] === config.s && !config.t) {

                // variable

                tmp[1] = 'status';
                topic = tmp.join('/');
                var oldState = status[topic] || {};
                var ts = (new Date()).getTime();
                if (typeof val !== 'object') {
                    val = {val: val, ts: ts};
                } else {
                    val.ts = ts;
                }
                if (val.val !== oldState.val) val.lc = ts;
                status[topic] = val;
                stateChange(topic, val, oldState, {});
                Sandbox.publish(topic, val, {retain: true});
            } else {
                topic = topic.replace(/^([^/]+)\/\/(.+)$/, '$1/set/$2');
                Sandbox.publish(topic, val, {retain: false});
            }
        },
        /**
         * @method getValue
         * @param {string} topic
         * @returns {*} the topics value
         */
        getValue:   function Sandbox_getValue(topic) {
            topic = topic.replace(/^\$/, config.s + '/status/');
            topic = topic.replace(/^([^/]+)\/\/(.+)$/, '$1/status/$2');
            return status[topic] && status[topic].val;
        },
        /**
         * Link topic(s) to other topic(s)
         * @method link
         * @param {(string|string[])} source - topic or array of topics to subscribe
         * @param {(string|string[])} target - topic or array of topics to publish
         * @param {*} [value] - value to publish. If omitted the sources value is published.
         */
        link:       function Sandbox_link(source, target, /* optional */ value) {
            Sandbox.subscribe(source, function (topic, msg) {
                var val = (typeof value === 'undefined') ? msg.val : value;
                log.debug('link', source, target, val);
                Sandbox.setValue(target, val);
            });
        },
        /**
         * Get a specific property of a topic
         * @method getProp
         * @param {string} topic
         * @param {...string} [property] - the property to retrieve. May be repeated for nested properties. If omitted the whole topic object is returned.
         * @returns {*} the topics properties value
         * @example getProp('hm//Bewegungsmelder Keller/MOTION', 'ts'); // returns the timestamp of a given topic
         */
        getProp:    function Sandbox_getProp(topic /*, optional property, optional nested property, ... */) {
            topic = topic.replace(/^([^/]+)\/\/(.+)$/, '$1/status/$2');
            if (arguments.length > 1) {
                var tmp = status[topic];
                for (var i = 1; i < arguments.length; i++) {
                    if (typeof tmp[arguments[i]] !== 'undefined') {
                        tmp = tmp[arguments[i]];
                    } else {
                        return;
                    }
                }
                return tmp;
            } else {
                return status[topic];
            }
        }
    };

    Sandbox.console = {
        log: Sandbox.log.info,
        error: Sandbox.log.error
    };

    var scriptDir = path.dirname(path.resolve(name));

    log.debug(name, 'contextifying sandbox');
    var context = vm.createContext(Sandbox);


    scriptDomain.on('error', function (e) {
        var lines = e.stack.split('\n');
        var stack = [];
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].match(/\[as runInContext\]/)) break;
            stack.push(lines[i]);
        }

        log.error.apply(log, [name + ' ' + stack.join('\n')]);
    });

    scriptDomain.run(function () {
        log.debug(name, 'running');
        script.runInContext(context);
    });

}

function loadScript(file) {

    if (scripts[file]) {
        log.error(file, 'already loaded?!');
        return;
    }

    log.info(file, 'loading');
    fs.readFile(file, function (err, src) {
        if (err && err.code === 'ENOENT') {
            log.error(file, 'not found');
        } else if (err) {
            log.error(file, err);
        } else {

            if (file.match(/\.coffee$/)) {
                // CoffeeScript
                log.debug(file, 'transpiling');
                modules['coffee-compiler'].fromSource(src.toString(), {sourceMap: false, bare: true}, function (err, js) {
                    if (err) {
                        log.error(file, 'transpile failed', err.message);
                        return;
                    }
                    scripts[file] = createScript(js, file);
                });

            } else if (file.match(/\.js$/)) {
                // Javascript
                scripts[file] = createScript(src, file);
            }
            if (scripts[file]) {
                runScript(scripts[file], file);
            }
        }
    });
}

function loadDir(dir) {
    fs.readdir(dir, function (err, data) {
        if (err) {
            if (err.errno = 34) {
                log.error('directory ' + path.resolve(dir) + ' not found');
            } else {
                log.error('readdir', dir, err);
            }

        } else {
            data.sort().forEach(function (file) {
                if (file.match(/\.(js|coffee)$/)) {
                    loadScript(path.join(dir, file));
                }
            });

            if (!config['disable-watch']) {
                watch.watchTree(dir, {
                    filter: function (path) {
                        return path.match(/\.(js|coffee)$/);
                    }
                }, function (f, curr, prev) {
                    if (typeof f == "object" && prev === null && curr === null) {
                        log.debug('watch', dir, 'initialized');
                    } else {
                        watch.unwatchTree(dir);
                        log.info(f, 'change detected. exiting.');
                        process.exit(0);
                    }
                });
            }

        }
    });


}

function start() {
    if (config.file) {
        if (typeof config.file === 'string') {
            loadScript(config.file);
        } else {
            config.file.forEach(function (file) {
                loadScript(file);
            });
        }
    }

    if (config.dir) {
        if (typeof config.dir === 'string') {
            loadDir(config.dir)
        } else {
            config.dir.forEach(function (dir) {
                loadDir(dir)
            });
        }
    }

}

function astro(pattern, options, start) {

    var now = new Date();
    start = start || new Date();
    var sunTimes = suncalc.getTimes(start, config.l, config.m);

    var event = sunTimes[pattern];

    if (event.toString === 'Invalid Date') return event;

    if (options && typeof options.shift !== 'undefined') {
        event = new Date(event.getTime() + (options.shift * 1000));
    }

    if (options && typeof options.random !== 'undefined') {
        event = new Date(event.getTime() + Math.floor(options.random * 1000 * Math.random()));
    }

    if (event < now) {
        // Event is in the past
        log.debug(pattern, 'in the past', event, '<', now);
        var tomorrow = new Date();
        tomorrow.setDate(start.getDate() + 1);
        tomorrow.setUTCHours(0,0,0,0);
        return astro(pattern, options, tomorrow);
    } else {
        return event;
    }
}

process.on('SIGINT', function () {
    log.info('got SIGINT. exiting.');
    process.exit(0);
});
process.on('SIGTERM', function () {
    log.info('got SIGTERM. exiting.');
    process.exit(0);
});
