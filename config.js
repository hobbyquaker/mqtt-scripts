const config = require('yargs')
    .env('MQTTSCRIPTS')
    .usage('Usage: $0 [options]')
    .describe('verbosity', 'possible values: "error", "warn", "info", "debug"')
    .describe('name', 'instance name. used as mqtt client id and as prefix for connected topic')
    .describe('variable-prefix', 'topic prefix for $ substitution (shorthand for variables, see docs)')
    .describe('disable-variables', 'disable variable feedback (see docs)')
    .describe('url', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
    .describe('help', 'show help')
    .describe('dir', 'directory to scan for .js and .coffee files. can be used multiple times.')
    .describe('disable-watch', 'disable file watching (don\'t exit process on file changes)')
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
        url: 'mqtt://127.0.0.1',
        latitude: 48.7408,
        longitude: 9.1778,
        name: 'logic',
        'variable-prefix': 'var',
        verbosity: 'info',
        'disable-variables': false,
        'disable-watch': false
    })
    .config('config')
    .version()
    .help('help')
    .argv;

module.exports = config;
