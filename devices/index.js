'use strict';

var express = require('express');
var controller = require('./controller');

var router = express.Router();

router.get('/', controller.index);
// router.put('/:id', auth.isAuthenticated(), controller.update);

module.exports = router;