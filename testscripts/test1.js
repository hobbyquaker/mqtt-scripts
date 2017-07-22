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

schedule('* * * * *', () => {
    log.info('schedule callback');
});

log.info(require('./lib/libtest.js'));
