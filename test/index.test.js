var request = require('supertest')
  , express = require('express');

__runningUnderTest = true;

var app = require('../app');

describe('Index Page', function() {
  it("Requires basic auth", function(done) {
    request(app).get('/')
      .expect(401, done);
  }),
  it("Default credentials work with basic auth", function(done) {
    post = request(app).get('/')
        .auth('buildertest', 'iwanttoknow')
        .expect(200)
        .expect(/Welcome/, done);
  })
})