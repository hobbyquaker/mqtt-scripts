var config = require('yargs')
    .usage('Usage: $0 [options]')
    .describe('v', 'possible values: "error", "warn", "info", "debug"')
    .describe('n', 'instance name. used as mqtt client id and as prefix for connected topic')
    .describe('s', 'topic prefix for $ substitution (shorthand for variables, see docs)')
    .describe('t', 'disable variable feedback (see docs)')
    .describe('u', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
    .describe('h', 'show help')
    .describe('d', 'directory to scan for .js and .coffee files. can be used multiple times.')
    .describe('w', 'disable file watching (don\'t exit process on file changes)')
    .alias({
        c: 'config',
        d: 'dir',
        h: 'help',
        s: 'variable-prefix',
        t: 'disable-variables',
        l: 'latitude',
        m: 'longitude',
        n: 'name',
        u: 'url',
        v: 'verbosity',
        w: 'disable-watch'

    })
    .default({
        u: 'mqtt://127.0.0.1',
        l: 48.7408,
        m: 9.1778,
        n: 'logic',
        s: 'var',
        v: 'info',
        t: false,
        w: false
    })
    .config('config')
    .version()
    .help('help')
    .argv;

module.exports = config;
