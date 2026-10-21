/**
 * PelisMaster TV - API Client
 * Compatible with Chromium 38 (ES5 + XMLHttpRequest)
 */
(function(window) {
  'use strict';

  // Dynamic host determination (same origin if served from express, or configurable LAN IP for .ipk)
  var defaultServer = 'http://192.168.3.155:3000';
  var configured = '';
  try { configured = localStorage.getItem('pm_server_ip'); } catch(e) {}
  var serverHost = (configured && configured.trim()) ? configured.trim() : defaultServer;
  var API_BASE = (window.location && window.location.origin && window.location.origin.indexOf('http') === 0) 
                 ? window.location.origin + '/api' 
                 : (serverHost.replace(/\/+$/, '') + '/api');

  var Api = {
    getBaseUrl: function() {
      return API_BASE;
    },

    setBaseUrl: function(url) {
      API_BASE = url;
      try { localStorage.setItem('pm_server_ip', url); } catch(e) {}
    },

    request: function(endpoint, callback) {
      var url = API_BASE + endpoint;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 15000;

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            if (data.ok) {
              callback(null, data.data);
            } else {
              callback(new Error(data.error || 'API Error'));
            }
          } catch(e) {
            callback(e);
          }
        } else {
          callback(new Error('HTTP Status: ' + xhr.status));
        }
      };

      xhr.onerror = function() {
        callback(new Error('Network connection failed'));
      };

      xhr.ontimeout = function() {
        callback(new Error('Request timed out'));
      };

      xhr.send();
    },

    getHome: function(cb) {
      this.request('/home', cb);
    },

    getCatalog: function(type, sort, page, cb) {
      this.request('/' + type + '?sort=' + encodeURIComponent(sort || 'recent') + '&page=' + (page || 1), cb);
    },

    getGenres: function(cb) {
      this.request('/genres', cb);
    },

    getGenreItems: function(slug, page, cb) {
      this.request('/genre/' + encodeURIComponent(slug) + '?page=' + (page || 1), cb);
    },

    search: function(query, cb) {
      this.request('/search?q=' + encodeURIComponent(query), cb);
    },

    getDetail: function(type, slug, cb) {
      this.request('/detail/' + encodeURIComponent(type) + '/' + slug, cb);
    },

    getStream: function(params, cb) {
      var q = [];
      if (params.season) q.push('season=' + params.season);
      if (params.episode) q.push('episode=' + params.episode);
      if (params.lang) q.push('lang=' + params.lang);
      if (params.serverId) q.push('serverId=' + encodeURIComponent(params.serverId));
      var qs = q.length ? '?' + q.join('&') : '';

      this.request('/stream/' + encodeURIComponent(params.type) + '/' + params.slug + qs, cb);
    }
  };

  window.Api = Api;
})(window);
