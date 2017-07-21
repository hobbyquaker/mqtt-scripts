#!/usr/bin/env node

var config =            require('./config.js');
var pkg =               require('./package.json');
var log =               require('yalm');

log.setLevel(['debug', 'info', 'warn', 'error'].indexOf(config.verbosity) !== -1 ? config.verbosity : 'info');
log.info(pkg.name + ' ' + pkg.version + ' starting');

var modules = {
    'fs':               require('fs'),
    'path':             require('path'),
    'vm':               require('vm'),
    'domain':           require('domain'),

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
var suncalc =           modules.suncalc;


var status =            {};
var scripts =           {};
var subscriptions =     [];

var _global =           {};


// Sun scheduling

var sunEvents =         [];
var sunTimes =          [/* yesterday */ {}, /* today */ {}, /* tomorrow */ {}];

function calculateSunTimes() {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0, 0);
    var yesterday = new Date(today.getTime() - 86400000); //(24 * 60 * 60 * 1000));
    var tomorrow = new Date(today.getTime() + 86400000); //(24 * 60 * 60 * 1000));
    sunTimes = [
        suncalc.getTimes(yesterday, config.l, config.m),
        suncalc.getTimes(today, config.l, config.m),
        suncalc.getTimes(tomorrow, config.l, config.m)
    ];
    //log.debug('calculatedSunTimes', sunTimes);
}

calculateSunTimes();

scheduler.scheduleJob('0 0 * * *', function () {
    // re-calculate every day
    calculateSunTimes();
    // schedule events for this day
    sunEvents.forEach(function (event) {
        sunScheduleEvent(event);
    });
    log.info('re-scheduled', sunEvents.length, 'sun events');
});

function sunScheduleEvent(obj, shift) {
    // shift = -1 -> yesterday
    // shift = 0 -> today
    // shift = 1 -> tomorrow
    var event = sunTimes[1 + (shift || 0)][obj.pattern];
    //log.debug('sunScheduleEvent', obj.pattern, obj.options, shift);
    var now = new Date();

    if (event.toString() !== 'Invalid Date') {
        // Event will occur today

        if (obj.options.shift) event = new Date(event.getTime() + ((parseFloat(obj.options.shift) || 0) * 1000));

        if ((event.getDate() !== now.getDate()) && (typeof shift === 'undefined')) {
            // event shifted to previous or next day
            sunScheduleEvent(obj, (event < now) ? 1 : -1);
            return;
        }

        if ((now.getTime() - event.getTime()) < 1000) {
            // event is less than 1s in the past or occurs later this day

            if (obj.options.random) {
                event = new Date(
                    event.getTime() +
                    (Math.floor((parseFloat(obj.options.random) || 0) * Math.random()) * 1000)
                );
            }

            if ((event.getTime() - now.getTime()) < 1000)  {
                // event is less than 1s in the future or already in the past
                // (options.random may have shifted us further to the past)
                // call the callback immediately!
                obj.domain.bind(obj.callback)();

            } else {
                // schedule the event!
                scheduler.scheduleJob(event, obj.domain.bind(obj.callback));
                //log.debug('scheduled', obj.pattern, obj.options, event);
            }

        } else {
            //log.debug(obj.pattern, obj.options, 'is more than 1s the past', now, event);
        }

    } else {
        //log.debug(obj.pattern, 'doesn\'t occur today');
    }
}



// MQTT

var mqtt;
mqtt = modules.mqtt.connect(config.url, {will: {topic: config.name + '/connected', payload: '0', retain: true}});
mqtt.publish(config.name + '/connected', '2', {retain: true});

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

            if ((typeof state === 'object') && (state instanceof Array)) {
                state = {val: state};
            } else if (!state || typeof state.val === 'undefined') {
                state = {val: state};
            }
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
        if (!state) {
            log.error('invalid state', topic, payload);
            process.exit()
        }
        if (!state.ts) state.ts = new Date().getTime();
        oldState = status[topic] || {};
        if (oldState.val !== state.val) state.lc = state.ts;
        status[topic] = state;
        stateChange(topic, state, oldState, msg);
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
            match = subs.topic.test(topic);
        }

        if (match && typeof options.condition === 'function') {
            if (!options.condition(topic.replace(/^([^\/]+)\/status\/(.+)/, '$1//$2'), state.val, state, oldState, msg)) {
                return;
            }
        }

        if (match && typeof subs.callback === 'function') {
            //log.debug('match', subs.topic, subs.options, typeof subs.callback);

            if (msg.retain && !options.retain) return;
            if (options.change && (state.val === oldState.val)) return;

            delay = 0;
            if (options.shift) delay += ((parseFloat(options.shift) || 0) * 1000);
            if (options.random) delay += ((parseFloat(options.random) || 0)  * Math.random() * 1000);

            delay = Math.floor(delay);

            setTimeout(function () {
                /**
                 * @callback subscribeCallback
                 * @param {string} topic - the topic that triggered this callback. +/status/# will be replaced by +//#
                 * @param {mixed} val - the val property of the new state
                 * @param {object} obj - new state - the whole state object (e.g. {"val": true, "ts": 12346345, "lc": 12346345} )
                 * @param {object} objPrev - previous state - the whole state object
                 * @param {object} msg - the mqtt message as received from MQTT.js
                 */
                subs.callback(topic.replace(/^([^\/]+)\/status\/(.+)/, '$1//$2'), state.val, state, oldState, msg);
            }, delay);

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

    var scriptDir = path.dirname(path.resolve(name));


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
                        tmp = path.resolve(tmp);
                    }
                }
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
         * @class log
         * @classdesc Log to stdout/stderr. Messages are prefixed with a timestamp and the calling scripts path.
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
         * @param {Object|string|function} [options] - Options object or as shorthand to options.condition a function or string
         * @param {number} [options.shift] - delay execution in seconds. Has to be positive
         * @param {number} [options.random] - random delay execution in seconds. Has to be positive
         * @param {boolean} [options.change] - if set to true callback is only called if val changed
         * @param {boolean} [options.retain] - if set to true callback is also called on retained messages
         * @param {(string|function)} [options.condition] - conditional function or condition string
         * @param {subscribeCallback} callback
         */
        subscribe:  function Sandbox_subscribe(topic, /* optional */ options, callback) {
            if (typeof topic === 'undefined') {
                throw(new Error('argument topic missing'));
            }

            if (arguments.length === 2) {

                if (typeof arguments[1] !== 'function') throw new Error('callback is not a function');

                callback = arguments[1];
                options = {};


            } else if (arguments.length === 3) {

                if (typeof arguments[2] !== 'function') throw new Error('callback is not a function');
                options = arguments[1] || {};

                if (typeof options === 'string' || typeof options === 'function') {
                    options = {condition: options};
                }

                callback = arguments[2];

            } else if (arguments.length > 3) {
                throw(new Error('wrong number of arguments'));
            }

            if (typeof topic === 'string') {

                topic = topic.replace(/^\$/, config.s + '/status/');
                topic = topic.replace(/^([^/]+)\/\//, '$1/status/');

                if (typeof options.condition === 'string') {
                    if (options.condition.indexOf('\n') !== -1) throw new Error('options.condition string must be one-line javascript');
                    options.condition = new Function('topic', 'val', 'obj', 'objPrev', 'msg', 'return ' + options.condition + ';');
                }

                if (typeof options.condition === 'function') {
                    options.condition = scriptDomain.bind(options.condition);
                }

                subscriptions.push({topic: topic, options: options, callback: (typeof callback === 'function') && scriptDomain.bind(callback)});

                if (options.retain && status[topic] && typeof callback === 'function') {
                    callback(topic.replace(/^([^\/]+)\/status\/(.+)/, '$1//$2'), status[topic].val, status[topic]);
                } else if (options.retain && (/\/\+\//.test(topic) || /\+$/.test(topic) || /\+/.test(topic) || /#$/.test(topic)) && typeof callback === 'function') {
                    for (var t in status) {
                        if (mqttWildcards(t, topic)) callback(t.replace(/^([^\/]+)\/status\/(.+)/, '$1//$2'), status[t].val, status[t]);
                    }
                }

            } else if (typeof topic === 'object' && topic.length) {

                topic = Array.prototype.slice.call(topic);
                topic.forEach(function (tp) {
                    Sandbox.subscribe(tp, options, callback);
                });

            }

        },
        /**
         * Schedule recurring and one-shot events
         * @method schedule
         * @param {(string|Date|Object|mixed[])} pattern - pattern or array of patterns. May be cron style string, Date object or node-schedule object literal. See {@link https://github.com/tejasmanohar/node-schedule/wiki}
         * @param {Object} [options]
         * @param {number} [options.random] - random delay execution in seconds. Has to be positive
         * @param {function} callback - is called with no arguments
         * @example // every full Hour.
         * schedule('0 * * * *', callback);
         *
         * // Monday till friday, random between 7:30am an 8:00am
         * schedule('30 7 * * 1-5', {random: 30 * 60}, callback);
         *
         * // once on 21. December 2018 at 5:30am
         * schedule(new Date(2018, 12, 21, 5, 30, 0), callback);
         *
         * // every Sunday at 2:30pm
         * schedule({hour: 14, minute: 30, dayOfWeek: 0}, callback);
         * @see {@link sunSchedule} for scheduling based on sun position.
         */
        schedule:   function Sandbox_schedule(pattern, /* optional */ options, callback) {

            if (arguments.length === 2) {
                if (typeof arguments[1] !== 'function') throw new Error('callback is not a function');
                callback = arguments[1];
                options = {};
            } else if (arguments.length === 3) {
                if (typeof arguments[2] !== 'function') throw new Error('callback is not a function');
                options = arguments[1] || {};
                callback = arguments[2];
            } else {
                throw(new Error('wrong number of arguments'));
            }

            if (typeof pattern === 'object' && pattern.length) {
                pattern = Array.prototype.slice.call(topic);
                pattern.forEach(function (pt) {
                    Sandbox.schedule(pt, options, callback);
                });
                return;
            }

            //log.debug('schedule()', pattern, options, typeof callback);

            if (options.random) {
                scheduler.scheduleJob(pattern, function () {
                    setTimeout(scriptDomain.bind(callback), (parseFloat(options.random) || 0) * 1000 * Math.random());
                });
            } else {
                scheduler.scheduleJob(pattern, scriptDomain.bind(callback));
            }


        },
        /**
         * Schedule a recurring event based on sun position
         * @method sunSchedule
         * @param {string|string[]} pattern - a suncalc event or an array of suncalc events. See {@link https://github.com/mourner/suncalc}
         * @param {Object} [options]
         * @param {number} [options.shift] - delay execution in seconds. Allowed Range: -86400...86400 (+/- 24h)
         * @param {number} [options.random] - random delay execution in seconds.
         * @param {function} callback - is called with no arguments
         * @example // Call callback 15 minutes before sunrise
         * sunSchedule('sunrise', {shift: -900}, callback);
         *
         * // Call callback random 0-15 minutes after sunset
         * sunSchedule('sunset', {random: 900}, callback);
         * @see {@link schedule} for time based scheduling.
         */
        sunSchedule: function Sandbox_sunSchedule(pattern, /* optional */ options, callback) {

            if (arguments.length === 2) {
                if (typeof arguments[1] !== 'function') throw new Error('callback is not a function');
                callback = arguments[1];
                options = {};
            } else if (arguments.length === 3) {
                if (typeof arguments[2] !== 'function') throw new Error('callback is not a function');
                options = arguments[1] || {};
                callback = arguments[2];
            } else {
                throw new Error('wrong number of arguments');
            }

            if ((typeof options.shift !== 'undefined') && (options.shift < -86400 || options.shift > 86400)) {
                throw new Error('options.shift out of range');
            }

            if (typeof pattern === 'object' && pattern.length) {
                pattern = Array.prototype.slice.call(topic);
                pattern.forEach(function (pt) {
                    Sandbox.sunSchedule(pt, options, callback);
                });
                return;
            }

            //log.debug('sunSchedule', pattern, options);

            var event = sunTimes[0][pattern];
            if (typeof event === 'undefined') throw new Error('unknown suncalc event ' + pattern);

            var obj = {
                pattern: pattern,
                options: options,
                callback: callback,
                context: Sandbox,
                domain: scriptDomain
            };

            sunEvents.push(obj);

            sunScheduleEvent(obj);

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

            topic = topic.replace(/^([^/]+)\/\/(.+)$/, '$1/set/$2');

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
         * @param {mixed} val
         */
        setValue:   function Sandbox_setValue(topic, val, publishUnchanged) {

            if (typeof topic === 'object' && topic.length) {
                topic = Array.prototype.slice.call(topic);
                topic.forEach(function (tp) {
                    Sandbox.setValue(tp, val);
                });
                return;
            }

            var changed;

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
                if (val.val !== oldState.val) {
                    val.lc = ts;
                    changed = true;
                }
                status[topic] = val;
                stateChange(topic, val, oldState, {});
                if (changed || publishUnchanged) Sandbox.publish(topic, val, {retain: true});
            } else if (tmp[0] === config.s && config.t) {

                tmp[1] = 'status';
                topic = tmp.join('/');
                if (!status[topic] || (status[topic].val !== val)) {
                    tmp[1] = 'set';
                    topic = tmp.join('/');
                    Sandbox.publish(topic, val, {retain: false});
                }

            } else {
                topic = topic.replace(/^([^/]+)\/\/(.+)$/, '$1/set/$2');
                Sandbox.publish(topic, val, {retain: false});

            }
        },
        /**
         * @method getValue
         * @param {string} topic
         * @returns {mixed} the topics value
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
         * @param {mixed} [value] - value to publish. If omitted the sources value is published.
         */
        link:       function Sandbox_link(source, target, /* optional */ value) {
            Sandbox.subscribe(source, function (topic, val) {
                val = (typeof value === 'undefined') ? val : value;
                //log.debug('link', source, target, val);
                Sandbox.setValue(target, val);
            });
        },
        /**
         * Get a specific property of a topic
         * @method getProp
         * @param {string} topic
         * @param {...string} [property] - the property to retrieve. May be repeated for nested properties. If omitted the whole topic object is returned.
         * @returns {mixed} the topics properties value
         * @example // returns the timestamp of a given topic
         * getProp('hm//Bewegungsmelder Keller/MOTION', 'ts');
         */
        getProp:    function Sandbox_getProp(topic /*, optional property, optional nested property, ... */) {
            topic = topic.replace(/^([^/]+)\/\/(.+)$/, '$1/status/$2');
            if (arguments.length > 1) {
                var tmp = status[topic];
                if (typeof tmp === 'undefined') return;
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
        },
        /**
         *
         * @method now
         * @returns {number} ms since epoch
         */
        now:    function Sandbox_now() {
            return (new Date()).getTime();
        },
        /**
         * returns the amount of seconds since last change of the value
         * @param topic
         * @returns {number} seconds since last change
         */
        age: function Sandbox_age(topic) {
            return Math.round(((new Date()).getTime() - Sandbox.getProp(topic, 'lc')) / 1000);
        }


};

    Sandbox.console = {
        log: Sandbox.log.info,
        error: Sandbox.log.error
    };


    log.debug(name, 'contextifying sandbox');
    var context = vm.createContext(Sandbox);


    scriptDomain.on('error', function (e) {
        if (!e.stack) {
            log.error.apply(log, [name + ' unkown exception']);
            return;
        }
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

                if (!modules['coffee-compiler']) {
                    log.info('loading coffee-compiler');
                    modules['coffee-compiler'] = require('coffee-compiler');
                }

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


process.on('SIGINT', function () {
    log.info('got SIGINT. exiting.');
    process.exit(0);
});
process.on('SIGTERM', function () {
    log.info('got SIGTERM. exiting.');
    process.exit(0);
});
