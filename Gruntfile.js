
module.exports = function(grunt) {

    grunt.initConfig({
        jsdoc : {
            dist : {
                src: ['./index.js'],
                options: {
                    destination: 'doc',
                    configure : 'jsdoc.conf.json'
                }
            }
        },
        jsdox: {
            generate: {
                options: {
                    contentsTitle: 'mqtt-scripts',
                },

                src: ['./index.js'],
                dest: 'doc'
            }
        }
    });

    grunt.loadNpmTasks('grunt-jsdoc');
    grunt.loadNpmTasks('grunt-jsdox');
    grunt.registerTask('default', ['jsdoc']);

};