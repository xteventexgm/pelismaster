/**
 * PelisMaster TV - Fullscreen Native Video Player
 * Supports native HLS on webOS 3.4.3 & OSD
 * YouTube TV-style accelerated scrubbing & Netflix-style auto next episode
 */
(function(window) {
  'use strict';

  var Player = {
    view: null,
    video: null,
    osd: null,
    progressBar: null,
    timeCurrent: null,
    timeDuration: null,
    titleEl: null,
    subTitleEl: null,
    spinner: null,
    serverSelect: null,
    nextEpBtn: null,
    seekBubble: null,
    seekBubbleTime: null,
    seekBubbleDiff: null,
    nextCountdownBanner: null,
    countdownSecsEl: null,
    
    currentStreamData: null,
    currentMeta: null,
    osdTimer: null,
    progressSaveTimer: null,
    waitingTimer: null,
    isPlaying: false,

    // Scrubbing state
    isScrubbing: false,
    scrubStartTime: 0,
    scrubTargetTime: 0,
    scrubClickCount: 0,
    scrubCommitTimer: null,

    // Auto-next countdown
    countdownTimer: null,
    countdownSeconds: 5,

    init: function() {
      var self = this;
      this.view = document.getElementById('player-view');
      this.video = document.getElementById('video-element');
      this.osd = document.getElementById('player-osd');
      this.progressBar = document.getElementById('player-progress-filled');
      this.timeCurrent = document.getElementById('player-time-current');
      this.timeDuration = document.getElementById('player-time-duration');
      this.titleEl = document.getElementById('player-title');
      this.subTitleEl = document.getElementById('player-subtitle');
      this.spinner = document.getElementById('player-spinner');
      this.serverSelect = document.getElementById('player-server-select');
      this.nextEpBtn = document.getElementById('osd-btn-next-ep');
      this.seekBubble = document.getElementById('player-seek-bubble');
      this.seekBubbleTime = document.getElementById('seek-bubble-time');
      this.seekBubbleDiff = document.getElementById('seek-bubble-diff');
      this.nextCountdownBanner = document.getElementById('player-next-countdown');
      this.countdownSecsEl = document.getElementById('countdown-seconds');

      // Video event listeners
      this.video.addEventListener('timeupdate', function() { self.onTimeUpdate(); });
      this.video.addEventListener('play', function() {
        self.isPlaying = true;
        self.updatePlayPauseBtn();
        clearTimeout(self.waitingTimer);
        self.showSpinner(false);
      });
      this.video.addEventListener('pause', function() {
        self.isPlaying = false;
        self.updatePlayPauseBtn();
      });

      // Debounced spinner on waiting: prevents blinking every 10-20s during HLS segment shifts
      this.video.addEventListener('waiting', function() {
        clearTimeout(self.waitingTimer);
        self.waitingTimer = setTimeout(function() {
          self.showSpinner(true);
        }, 900);
      });
      this.video.addEventListener('playing', function() {
        clearTimeout(self.waitingTimer);
        self.showSpinner(false);
      });
      this.video.addEventListener('canplay', function() {
        clearTimeout(self.waitingTimer);
        self.showSpinner(false);
      });

      this.video.addEventListener('loadedmetadata', function() { self.onLoadedMetadata(); });
      this.video.addEventListener('ended', function() { self.onEnded(); });
      this.video.addEventListener('error', function(e) { self.onError(e); });

      // OSD Buttons
      document.getElementById('osd-btn-back').addEventListener('click', function() { self.close(); });
      document.getElementById('osd-btn-play').addEventListener('click', function() { self.togglePlay(); });
      document.getElementById('osd-btn-rewind').addEventListener('click', function() { self.handleScrubKey(-1); });
      document.getElementById('osd-btn-forward').addEventListener('click', function() { self.handleScrubKey(1); });

      if (this.nextEpBtn) {
        this.nextEpBtn.addEventListener('click', function() { self.playNextEpisode(); });
      }

      if (this.serverSelect) {
        this.serverSelect.addEventListener('change', function(e) {
          self.switchServer(e.target.value);
        });
      }

      // Next Episode Banner Buttons
      var btnNextNow = document.getElementById('btn-next-now');
      if (btnNextNow) {
        btnNextNow.addEventListener('click', function() { self.playNextEpisode(); });
      }
      var btnNextCancel = document.getElementById('btn-next-cancel');
      if (btnNextCancel) {
        btnNextCancel.addEventListener('click', function() { self.cancelNextEpisode(); });
      }

      // Remote media keys
      window.addEventListener('media-play', function() { self.play(); });
      window.addEventListener('media-pause', function() { self.pause(); });
      window.addEventListener('media-rewind', function() { self.handleScrubKey(-1); });
      window.addEventListener('media-forward', function() { self.handleScrubKey(1); });

      // Reset OSD timer on any user interaction
      document.addEventListener('keydown', function() {
        if (self.isOpen() && !self.isScrubbing) {
          self.showOsd();
        }
      });
      document.addEventListener('mousemove', function() {
        if (self.isOpen() && !self.isScrubbing) {
          self.showOsd();
        }
      });
    },

    isOpen: function() {
      return this.view && this.view.classList.contains('active');
    },

    isOsdHidden: function() {
      return !this.osd || this.osd.classList.contains('hidden');
    },

    isNextBannerVisible: function() {
      return this.nextCountdownBanner && this.nextCountdownBanner.style.display !== 'none';
    },

    playItem: function(params) {
      // params: { type, slug, title, backdrop, season, episode, resumeTime }
      var self = this;
      this.currentMeta = params;
      this.view.classList.add('active');
      this.showSpinner(true);
      this.showOsd();

      this.titleEl.textContent = params.title || '';
      var sub = '';
      if (params.season && params.episode) {
        sub = 'Temporada ' + params.season + ' · Episodio ' + params.episode;
      }
      this.subTitleEl.textContent = sub;

      if (this.nextEpBtn) {
        this.nextEpBtn.style.display = (params.type === 'series') ? 'inline-block' : 'none';
      }

      this.hideNextCountdown();

      // Register SpatialNav back handler for player
      SpatialNav.registerBackHandler(function() {
        self.close();
        return true;
      });

      // Fetch stream from backend
      Api.getStream({
        type: params.type,
        slug: params.slug,
        season: params.season,
        episode: params.episode,
        lang: 'LAT'
      }, function(err, streamData) {
        if (err || !streamData || !streamData.streamUrl) {
          self.showSpinner(false);
          alert('Error al reproducir: ' + (err ? err.message : 'No hay stream disponible'));
          self.close();
          return;
        }

        self.currentStreamData = streamData;
        self.populateServers(streamData.availableServers, streamData.server);
        self.startPlayback(streamData.streamUrl, params.resumeTime);
      });
    },

    populateServers: function(servers, activeServer) {
      if (!this.serverSelect || !servers) return;
      this.serverSelect.innerHTML = '';
      var langNames = { LAT: 'Latino', ESP: 'Castellano', SUB: 'Subtitulado', ENG: 'Inglés' };

      for (var i = 0; i < servers.length; i++) {
        var s = servers[i];
        var opt = document.createElement('option');
        opt.value = s.id;
        var label = (langNames[s.lang] || s.lang) + ' - ' + (s.name || ('Servidor ' + (i + 1))) + (s.isDirect ? ' (Rápido)' : '');
        opt.textContent = label;
        if (activeServer && s.id === activeServer.id) {
          opt.selected = true;
        }
        this.serverSelect.appendChild(opt);
      }
    },

    switchServer: function(serverId) {
      var self = this;
      var curTime = this.video.currentTime || 0;
      this.showSpinner(true);

      Api.getStream({
        type: this.currentMeta.type,
        slug: this.currentMeta.slug,
        season: this.currentMeta.season,
        episode: this.currentMeta.episode,
        serverId: serverId
      }, function(err, streamData) {
        if (err || !streamData || !streamData.streamUrl) {
          self.showSpinner(false);
          alert('Este servidor no está respondiendo');
          return;
        }
        self.currentStreamData = streamData;
        self.startPlayback(streamData.streamUrl, curTime);
      });
    },

    startPlayback: function(url, resumeTime) {
      var self = this;
      this.video.pause();
      this.video.removeAttribute('src');

      // Native HLS support check
      if (url.indexOf('.m3u8') !== -1) {
        this.video.type = 'application/x-mpegURL';
      } else {
        this.video.type = 'video/mp4';
      }

      this.video.src = url;
      this.video.load();

      var playPromise = this.video.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(function(e) {
          console.warn('Autoplay prevented, retrying on interaction:', e);
        });
      }

      if (resumeTime && resumeTime > 5) {
        var seekOnce = function() {
          self.video.removeEventListener('loadedmetadata', seekOnce);
          try { self.video.currentTime = resumeTime; } catch(e) {}
        };
        this.video.addEventListener('loadedmetadata', seekOnce);
      }

      // Start periodic progress saving for "Seguir viendo"
      clearInterval(this.progressSaveTimer);
      this.progressSaveTimer = setInterval(function() {
        self.saveCurrentProgress();
      }, 5000);

      SpatialNav.setFocus(document.getElementById('osd-btn-play'));
    },

    saveCurrentProgress: function() {
      if (!this.currentMeta || !this.video || !this.video.duration) return;
      var currentTime = Math.floor(this.video.currentTime);
      var duration = Math.floor(this.video.duration);

      if (currentTime < 10) return;

      if (window.App && window.App.saveWatchProgress) {
        window.App.saveWatchProgress({
          slug: this.currentMeta.slug,
          type: this.currentMeta.type,
          title: this.currentMeta.title,
          backdrop: this.currentMeta.backdrop,
          season: this.currentMeta.season,
          episode: this.currentMeta.episode,
          currentTime: currentTime,
          duration: duration,
          completed: (currentTime / duration) > 0.95
        });
      }
    },

    close: function() {
      this.saveCurrentProgress();
      clearInterval(this.progressSaveTimer);
      clearTimeout(this.osdTimer);
      clearTimeout(this.waitingTimer);
      clearTimeout(this.scrubCommitTimer);
      clearInterval(this.countdownTimer);

      this.isScrubbing = false;
      this.scrubClickCount = 0;
      if (this.seekBubble) this.seekBubble.style.display = 'none';
      this.hideNextCountdown();

      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();

      this.view.classList.remove('active');
      this.currentStreamData = null;
      this.currentMeta = null;

      // Focus back to detail view button or home
      var playBtn = document.getElementById('detail-play-btn');
      if (playBtn && playBtn.offsetParent !== null) {
        SpatialNav.setFocus(playBtn);
      } else {
        var heroPlay = document.getElementById('hero-btn-play');
        if (heroPlay) SpatialNav.setFocus(heroPlay);
      }
    },

    togglePlay: function() {
      if (this.video.paused) {
        this.play();
      } else {
        this.pause();
      }
    },

    play: function() {
      this.video.play();
      this.showOsd();
    },

    pause: function() {
      this.video.pause();
      this.showOsd(true);
    },

    /**
     * YouTube TV-style accelerated scrubbing via Remote Left/Right arrows
     * Jumps dynamically: 15s -> 30s -> 1m -> 2m -> 5m -> 10m per tap
     * e.g., reaching minute 32 from 12 in 5 quick presses
     */
    handleScrubKey: function(direction) {
      if (!this.video || !this.video.duration) return;
      var self = this;
      var dur = this.video.duration;

      if (!this.isScrubbing) {
        this.isScrubbing = true;
        this.scrubStartTime = this.video.currentTime || 0;
        this.scrubTargetTime = this.scrubStartTime;
        this.scrubClickCount = 0;
      }

      this.scrubClickCount++;

      // Progressive acceleration curve
      var step = 15;
      if (this.scrubClickCount === 2) {
        step = 30;
      } else if (this.scrubClickCount === 3) {
        step = 60; // 1 min
      } else if (this.scrubClickCount === 4) {
        step = 120; // 2 min
      } else if (this.scrubClickCount === 5) {
        step = 300; // 5 min
      } else if (this.scrubClickCount >= 6) {
        step = 600; // 10 min
      }

      this.scrubTargetTime += (direction * step);
      if (this.scrubTargetTime < 0) this.scrubTargetTime = 0;
      if (this.scrubTargetTime > dur) this.scrubTargetTime = dur;

      var diff = this.scrubTargetTime - this.scrubStartTime;
      var diffSign = diff >= 0 ? '+' : '-';
      var diffStr = diffSign + this.formatTime(Math.abs(diff));

      // Visual feedback: center bubble
      if (this.seekBubble) {
        this.seekBubble.style.display = 'block';
        if (this.seekBubbleTime) this.seekBubbleTime.textContent = this.formatTime(this.scrubTargetTime);
        if (this.seekBubbleDiff) this.seekBubbleDiff.textContent = diffStr;
      }

      // Visual feedback: progress bar & timestamps
      var pct = (this.scrubTargetTime / dur) * 100;
      if (this.progressBar) this.progressBar.style.width = pct + '%';
      if (this.timeCurrent) this.timeCurrent.textContent = this.formatTime(this.scrubTargetTime);

      // Keep OSD visible during scrub
      this.showOsd(true);

      // Debounce commit: apply single seek after 850ms of inactivity
      clearTimeout(this.scrubCommitTimer);
      this.scrubCommitTimer = setTimeout(function() {
        self.commitScrub();
      }, 850);
    },

    commitScrub: function() {
      clearTimeout(this.scrubCommitTimer);
      this.scrubCommitTimer = null;

      if (!this.isScrubbing) return;
      var target = this.scrubTargetTime;
      this.isScrubbing = false;
      this.scrubClickCount = 0;

      if (this.seekBubble) {
        this.seekBubble.style.display = 'none';
      }

      if (this.video && this.video.duration) {
        try {
          this.video.currentTime = target;
        } catch(e) {
          console.warn('Seek error:', e);
        }
      }

      this.onTimeUpdate();
      this.showOsd(false); // auto-hide OSD after 4s
    },

    onTimeUpdate: function() {
      if (this.isScrubbing) return; // Do not overwrite bar during scrubbing
      if (!this.video || !this.video.duration) return;
      var cur = this.video.currentTime || 0;
      var dur = this.video.duration || 0;
      var pct = (cur / dur) * 100;

      if (this.progressBar) this.progressBar.style.width = pct + '%';
      if (this.timeCurrent) this.timeCurrent.textContent = this.formatTime(cur);
      if (this.timeDuration) this.timeDuration.textContent = this.formatTime(dur);
    },

    onLoadedMetadata: function() {
      clearTimeout(this.waitingTimer);
      this.showSpinner(false);
      if (this.timeDuration) {
        this.timeDuration.textContent = this.formatTime(this.video.duration || 0);
      }
    },

    /**
     * Automatic progression:
     * When episode finishes, start Netflix-style countdown to next episode
     */
    onEnded: function() {
      this.saveCurrentProgress();
      if (this.currentMeta && this.currentMeta.type === 'series') {
        this.startNextEpisodeCountdown();
      } else {
        this.close();
      }
    },

    startNextEpisodeCountdown: function() {
      var self = this;
      if (!this.currentMeta || this.currentMeta.type !== 'series') return;
      var curSeason = parseInt(this.currentMeta.season, 10) || 1;
      var curEp = parseInt(this.currentMeta.episode, 10) || 1;
      var nextEp = curEp + 1;

      if (!this.nextCountdownBanner) {
        this.playNextEpisode();
        return;
      }

      var epTitleEl = document.getElementById('next-countdown-ep-title');
      if (epTitleEl) {
        epTitleEl.innerHTML = 'Siguiente episodio (T' + curSeason + ':E' + nextEp + ') en <b id="countdown-seconds">5</b>s';
      }

      this.nextCountdownBanner.style.display = 'block';
      this.countdownSeconds = 5;

      var btnNow = document.getElementById('btn-next-now');
      if (btnNow) SpatialNav.setFocus(btnNow);

      clearInterval(this.countdownTimer);
      this.countdownTimer = setInterval(function() {
        self.countdownSeconds--;
        var secEl = document.getElementById('countdown-seconds');
        if (secEl) secEl.textContent = self.countdownSeconds;

        if (self.countdownSeconds <= 0) {
          clearInterval(self.countdownTimer);
          self.playNextEpisode();
        }
      }, 1000);
    },

    hideNextCountdown: function() {
      clearInterval(this.countdownTimer);
      if (this.nextCountdownBanner) {
        this.nextCountdownBanner.style.display = 'none';
      }
    },

    cancelNextEpisode: function() {
      this.hideNextCountdown();
      this.close();
    },

    playNextEpisode: function() {
      this.hideNextCountdown();
      if (!this.currentMeta || this.currentMeta.type !== 'series') return;
      var curSeason = parseInt(this.currentMeta.season, 10) || 1;
      var curEp = parseInt(this.currentMeta.episode, 10) || 1;
      var nextEp = curEp + 1;

      this.video.pause();
      this.showSpinner(true);
      var spinnerText = this.spinner ? this.spinner.querySelector('.spinner-text') : null;
      if (spinnerText) spinnerText.textContent = 'Cargando Episodio ' + nextEp + '...';

      var self = this;
      Api.getStream({
        type: 'series',
        slug: this.currentMeta.slug,
        season: curSeason,
        episode: nextEp,
        lang: 'LAT'
      }, function(err, streamData) {
        if (err || !streamData || !streamData.streamUrl) {
          // If episode N+1 failed, try next season episode 1
          var nextSeason = curSeason + 1;
          Api.getStream({
            type: 'series',
            slug: self.currentMeta.slug,
            season: nextSeason,
            episode: 1,
            lang: 'LAT'
          }, function(err2, sData2) {
            if (err2 || !sData2 || !sData2.streamUrl) {
              self.showSpinner(false);
              alert('Fin de temporada / serie. No hay más episodios disponibles.');
              self.close();
              return;
            }
            self.currentMeta.season = nextSeason;
            self.currentMeta.episode = 1;
            self.currentStreamData = sData2;
            self.titleEl.textContent = self.currentMeta.title || '';
            self.subTitleEl.textContent = 'Temporada ' + nextSeason + ' · Episodio 1';
            self.populateServers(sData2.availableServers, sData2.server);
            self.startPlayback(sData2.streamUrl, 0);
          });
          return;
        }

        self.currentMeta.season = curSeason;
        self.currentMeta.episode = nextEp;
        self.currentStreamData = streamData;
        self.titleEl.textContent = self.currentMeta.title || '';
        self.subTitleEl.textContent = 'Temporada ' + curSeason + ' · Episodio ' + nextEp;
        self.populateServers(streamData.availableServers, streamData.server);
        self.startPlayback(streamData.streamUrl, 0);
      });
    },

    onError: function(e) {
      console.error('Video playback error:', e);
      clearTimeout(this.waitingTimer);
      this.showSpinner(false);
    },

    updatePlayPauseBtn: function() {
      var btn = document.getElementById('osd-btn-play');
      if (btn) {
        btn.textContent = this.isPlaying ? '❚❚' : '▶';
      }
    },

    showSpinner: function(show) {
      if (this.spinner) {
        this.spinner.style.display = show ? 'flex' : 'none';
      }
    },

    showOsd: function(keepVisible) {
      var self = this;
      if (!this.osd) return;
      this.osd.classList.remove('hidden');
      clearTimeout(this.osdTimer);

      if (!keepVisible) {
        this.osdTimer = setTimeout(function() {
          if (self.isPlaying && !self.isScrubbing && !self.isNextBannerVisible()) {
            self.osd.classList.add('hidden');
          }
        }, 4000);
      }
    },

    formatTime: function(secs) {
      secs = Math.floor(secs || 0);
      var h = Math.floor(secs / 3600);
      var m = Math.floor((secs % 3600) / 60);
      var s = secs % 60;
      if (h > 0) {
        return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
      return m + ':' + (s < 10 ? '0' : '') + s;
    }
  };

  window.Player = Player;
})(window);
