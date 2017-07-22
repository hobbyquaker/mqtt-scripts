#!/usr/bin/env node

require('should');

const cp = require('child_process');
const fs = require('fs');
const request = require('request');
const path = require('path');
const streamSplitter = require('stream-splitter');
const Mqtt = require('mqtt');
let mqtt = Mqtt.connect('mqtt://127.0.0.1');



const msCmd = path.join(__dirname, '/index.js');
const msArgs = ['-d', __dirname + '/testscripts', '-v', 'debug'];
let ms;
let msPipeOut;
let msPipeErr;
const msSubscriptions = {};
const msBuffer = [];

let subIndex = 0;

function subscribe(type, rx, cb) {
    subIndex += 1;
    if (type === 'ms') {
        msSubscriptions[subIndex] = {rx, cb};
    }
    matchSubscriptions(type);
    return subIndex;
}

function unsubscribe(type, subIndex) {
    if (type === 'ms') {
        delete msSubscriptions[subIndex];
    }
}

function matchSubscriptions(type, data) {
    let subs;
    let buf;
    if (type === 'sim') {
        subs = simSubscriptions;
        buf = simBuffer;
    } else if (type === 'ms') {
        subs = msSubscriptions;
        buf = msBuffer;
    }
    if (data) {
        buf.push(data);
    }
    buf.forEach((line, index) => {
        Object.keys(subs).forEach(key => {
            const sub = subs[key];
            let m;
            if (m = line.match(sub.rx)) {
                sub.cb(line, m);
                delete subs[key];
                buf.splice(index, 1);
            }
        });
    });
}

const mqttSubscriptions = {};
function mqttSubscribe(topic, callback) {
    if (mqttSubscriptions[topic]) {
        mqttSubscriptions[topic].push(callback);
    } else {
        mqttSubscriptions[topic] = [callback];
        mqtt.subscribe(topic);
    }
}
mqtt.on('message', (topic, payload) => {
    if (mqttSubscriptions[topic]) {
        mqttSubscriptions[topic].forEach((callback, index) => {
            //console.log('cb', index, topic, payload.toString());
            callback(payload.toString());
        });
    }
});

function startMs() {
    ms = cp.spawn(msCmd, msArgs);
    msPipeOut = ms.stdout.pipe(streamSplitter('\n'));
    msPipeErr = ms.stderr.pipe(streamSplitter('\n'));
    msPipeOut.on('token', data => {
        console.log('ms', data.toString());
        matchSubscriptions('ms', data.toString());
    });
    msPipeErr.on('token', data => {
        console.log('ms', data.toString());
        matchSubscriptions('ms', data.toString());
    });
}



function end(code) {
    if (ms.kill) {
        ms.kill();
    }
    if (typeof code !== 'undefined') {
        process.exit(code);
    }
}

process.on('SIGINT', () => {
    end(1);
});

process.on('exit', () => {
    end();
});

describe('start daemon', () => {
    it('should start without error', function (done) {
        this.timeout(20000);
        subscribe('ms', /mqtt-scripts [0-9.]+ starting/, data => {
            done();
        });
        startMs();
    });
    it('should connect to the mqtt broker', function (done) {
        this.timeout(20000);
        subscribe('ms', /mqtt connected/, data => {
            done();
        });
     });
    it('should subscribe to #', function (done) {
        this.timeout(20000);
        subscribe('ms', /mqtt subscribe #/, data => {
            done();
        });
    });
    it('should publish 2 on logic/connected', function (done) {
        this.timeout(20000);
        mqttSubscribe('logic/connected', payload => {
            if (payload === '2') {
                done();
            }
        });
    });
});

describe('script loading', () => {
    it('should load test1.js script file', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test1\.js loading/, data => {
            done();
        });
    });
    it('should execute test1.js script file', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test1\.js running/, data => {
            done();
        });
    });
    it('should load test2.coffee script file', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test2\.coffee loading/, data => {
            done();
        });
    });
    it('should transpile test2.coffee script file', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test2\.coffee transpiling/, data => {
            done();
        });
    });
    it('should execute test2.coffee script file', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test2\.coffee running/, data => {
            done();
        });
    });
});

describe('testscripts/test1.js execution', () => {
    it('should log a msg', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test1\.js: test log/, data => {
            done();
        });
    });


});

describe('testscripts/test2.coffee execution', () => {
    it('should log a debug msg', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test2\.coffee: coffee debug/, data => {
            done();
        });
    });
    it('should log a info msg', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test2\.coffee: coffee info/, data => {
            done();
        });
    });
    it('should log a warn msg', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test2\.coffee: coffee warn/, data => {
            done();
        });
    });
    it('should log a error msg', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test2\.coffee: coffee error/, data => {
            done();
        });
    });
});


describe('require()', () => {
    it('should load a lib file', function (done) {
        this.timeout(20000);
        subscribe('ms', /require test/, () => {
            done();
        });
    });
});

describe('subscribe(), setValue()', () => {
    it('should increase a number', function (done) {
        this.timeout(20000);
        mqttSubscribe('test/set/incr', payload => {
            if (payload === '5') {
                done();
            }
        });
        mqtt.publish('test/status/incr', '4');
    });
});

describe('link()', () => {
    it('should link one topic to another', function (done) {
        this.timeout(20000);
        mqttSubscribe('test/target', payload => {
            if (payload === 'test') {
                done();
            }
        });
        mqtt.publish('test/src', 'test');
    });
    it('should link multiple topic to other topics', function (done) {
        this.timeout(20000);
        mqttSubscribe('test/target2', payload => {
            if (payload === 'test') {
                done();
            }
        });
        mqtt.publish('test/src1', 'test');
    });
});

describe('age()', () => {
    it('should return an age of 5s', function (done) {
        this.timeout(20000);
        subscribe('ms', /test\/target age ([0-9]+)/, (line, m) => {
            if (m[1] === '5') {
                done();
            }
        });
    })
});

describe('getProp(), now()', () => {
    it('should return a lastchange and a timestamp with ~5000ms difference', function (done) {
        this.timeout(20000);
        subscribe('ms', /test\/target lc ([0-9]+) ([0-9]+)/, (line, m) => {
            const elapsed = parseInt(m[2]) - parseInt(m[1]);
            if (elapsed > 4800 && elapsed < 5200) {
                done();
            }
        });
    })
});

describe('schedule()', () => {
    it('should excute a schedule callback', function (done) {
        this.timeout(180000);
        subscribe('ms', /schedule callback/, () => {
            done();
        });
    });
});

describe('exception', () => {
    it('should catch an exception occuring in a script', function (done) {
        this.timeout(180000);
        subscribe('ms', /testscripts\/test1\.js Error: test exception/, () => {
            done();
        });
    });
});

describe('setting variables', () => {
    it('should publish a number', function (done) {
        this.timeout(20000);
        mqttSubscribe('var/status/testnumber', payload => {
            const state = JSON.parse(payload);
            if (state.val === 1) {
                mqtt.unsubscribe('var/status/testnumber');
                done();
            }
        });
        setTimeout(function () {
            mqtt.publish('var/set/testnumber', '1');
        }, 1000);
    });
    it('should publish a string', function (done) {
        this.timeout(20000);
        mqttSubscribe('var/status/teststring', payload => {
            const state = JSON.parse(payload);
            if (state.val === 'test') {
                mqtt.unsubscribe('var/status/teststring');
                done();
            }
        });
        setTimeout(function () {
            mqtt.publish('var/set/teststring', 'test');
        }, 2000);

    });
    it('should publish a bool', function (done) {
        this.timeout(20000);
        mqttSubscribe('var/status/testbool', payload => {
            const state = JSON.parse(payload);
            if (state.val === true) {
                mqtt.unsubscribe('var/status/testbool');
                done();
            }
        });
        setTimeout(function () {
            mqtt.publish('var/set/testbool', 'true');
        }, 3000);
    });
});

describe('script file changes', () => {
    it('should quit when a script file changes', function (done) {
        this.timeout(10000);
        subscribe('ms', /change detected\. exiting/, () => {
            done();
        });
        setTimeout(function () {
            fs.appendFileSync(__dirname + '/testscripts/test1.js', '\nlog.info(\'appended!\');\n');
        }, 1000);
    });
});

setTimeout(() => {
    ms.kill();
    process.exit(1);
}, 240000);
