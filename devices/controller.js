/**
 * Reads whole configuration from app.locals.config
 * Writes changes to there as well
 */

'use strict';

var devicesLib = require('../lib/devices')

devicesLib.initDevices();

// Get list of builds
exports.index = function(req, res) {
    res.render('devices', { title: 'Device list' });
};

