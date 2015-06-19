var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Config file(s)
var config = require('home-config').load('.buildstatus.config');
if(!config.userName) {
    // no config file in the user's home dir, fall back to app's defaults
    config = require('home-config').load(__dirname + '/.buildstatus.config');
}

// override with test config if run from mocha
if(typeof __runningUnderTest !== 'undefined' && __runningUnderTest) {
    config = require('home-config').load(__dirname + '/test/.buildstatus.config');
}
// console.log('read config: ', config)

// Basic Auth
var basicAuth = require('basic-auth');

var auth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required - Check readme.txt');
    return res.send(401);
  };

  var user = basicAuth(req);

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };

  if (user.name === config.user && user.pass === config.password) {
    return next();
  } else {
    return unauthorized(res);
  };
};

// Extract into a separate module such as buildstatus-settings
global.__buildstatusConfig = config;
var devices = require('./devices/index');

app.use('/', auth, routes);
app.use('/users', auth, users);
app.use('/devices', auth, devices);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
