log.info('test log');

subscribe('test//incr', function (topic, val) {
    val += 1;
    setValue(topic, val);
});

subscribe('test/target', () => {
    setTimeout(() => {
        log.info('test/target age', age('test/target'));
        log.info('test/target lc', getProp('test/target', 'lc'), now());
    }, 5000);
});

link('test/src', 'test/target');
link(['test/src1', 'test/src2'], ['test/target1', 'test/target2']);
link('test/src3', 'test/target3', '1337');


schedule('* * * * *', () => {
    log.info('schedule callback');
    setTimeout(function () {
        throw new Error('test exception!');
    }, 2000);
});

schedule('0 0 * * *', () => {
    log.info('midnight!');
});

schedule({hour: 0, minute: 0, second: 10}, () => {
    log.info('schedule date');
});

let mscount = 1;

schedule(['12 0 0 * * *', '15 0 0 * * *'], {random: 2}, () => {
    log.info('multi schedule', mscount++);
});

subscribe('test/condition', 'val=="muh"', (topic, val) => {
    log.info(topic, getProp(topic).val);
    getProp(topic, 'does', 'not', 'exist');
});

log.info(getProp('does', 'not', 'exist'));

subscribe('test/change', {change: true}, (topic, val) => {
    log.info(topic, val)
});

subscribe('test/randomshift', {random: 10, shift: 10}, (topic, val) => {
    log.info(topic, val);
});

subscribe(/regexp/, (topic, val) => {
    log.info(topic, val);
});



log.info(require('./lib/libtest.js'));
log.info(require('dummy'));
require('./lib/libtest2.js');
const suncalc = require('suncalc');

sunSchedule('sunrise', {shift: -1620, random: 360}, () => {
    log.info('27-33min before sunrise');
});

sunSchedule(['dawn', 'dusk'], () => {
    log.info('multiple sun events');
});

subscribe('test1', (topic, val) => {
    log.info(topic, getValue('test1'));
});

publish(['test1', 'test2'], {val: true});


setValue('$testvar1', true);
setValue('$testvar1', true);
setValue('var/set/testvar2', true);
setValue('var/set/testvar2', {val:true});
