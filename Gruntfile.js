
module.exports = function (grunt) {
    grunt.initConfig({
        jsdoc: {
            dist: {
                src: ['./index.js', './README.md'],
                options: {
                    destination: 'jsdoc/out',
                    configure: 'jsdoc/jsdoc.conf.json'
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-jsdoc');
    grunt.registerTask('default', ['jsdoc']);
};
