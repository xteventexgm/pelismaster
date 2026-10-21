/**
 * PelisMaster TV - Spatial Navigation Engine
 * Pure ES5 for LG webOS 3.4.3 (Chromium 38)
 */
(function(window) {
  'use strict';

  var SpatialNav = {
    currentFocus: null,
    backHandlers: [],

    init: function() {
      var self = this;
      document.addEventListener('keydown', function(e) {
        self.handleKeyDown(e);
      });

      // Mouse / Magic Remote hover sync
      document.addEventListener('mouseover', function(e) {
        var target = e.target;
        while (target && target !== document.body) {
          if (target.classList && target.classList.contains('focusable')) {
            self.setFocus(target, false);
            break;
          }
          target = target.parentNode;
        }
      });
    },

    setFocus: function(el, scroll) {
      if (!el) return;
      if (this.currentFocus && this.currentFocus !== el) {
        this.currentFocus.classList.remove('focused');
      }
      this.currentFocus = el;
      el.classList.add('focused');
      try { el.focus(); } catch(e) {}

      if (scroll !== false) {
        this.scrollIntoView(el);
      }
    },

    getScrollY: function() {
      return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    },

    setScrollY: function(y) {
      if (y < 0) y = 0;
      window.scrollTo(0, y);
      document.documentElement.scrollTop = y;
      document.body.scrollTop = y;
    },

    scrollIntoView: function(el) {
      if (!el) return;

      // 1. Horizontal scroll for rail/carousel
      var parent = el.parentNode;
      while (parent && parent !== document.body) {
        if (parent.classList && (parent.classList.contains('rail') || parent.classList.contains('seasons-bar') || parent.classList.contains('filter-pills') || parent.classList.contains('cast-rail'))) {
          var pRect = parent.getBoundingClientRect();
          var eRect = el.getBoundingClientRect();
          if (eRect.left < pRect.left + 50) {
            parent.scrollLeft -= (pRect.left + 100 - eRect.left);
          } else if (eRect.right > pRect.right - 50) {
            parent.scrollLeft += (eRect.right - pRect.right + 100);
          }
          break;
        }
        parent = parent.parentNode;
      }

      // Helper to check if element is inside Hero or Header
      var isInsideHeroOrHeader = false;
      var cur = el;
      while (cur && cur !== document.body) {
        if (cur.classList && (cur.classList.contains('hero-section') || cur.classList.contains('header') || cur.classList.contains('detail-hero'))) {
          isInsideHeroOrHeader = true;
          break;
        }
        cur = cur.parentNode;
      }

      // 2. Vertical scroll for main window
      if (isInsideHeroOrHeader) {
        this.setScrollY(0);
        return;
      }

      var rect = el.getBoundingClientRect();
      var screenHeight = window.innerHeight || document.documentElement.clientHeight || 1080;
      var curY = this.getScrollY();

      // Keep space for fixed header (75px)
      if (rect.top < 110) {
        var targetY = Math.max(0, curY + rect.top - 140);
        this.setScrollY(targetY);
      } else if (rect.bottom > screenHeight - 60) {
        var targetY = curY + (rect.bottom - screenHeight + 140);
        this.setScrollY(targetY);
      }
    },

    handleKeyDown: function(e) {
      var code = e.keyCode || e.which;

      // Dedicated handling when Fullscreen Player is active
      if (window.Player && window.Player.isOpen()) {
        switch (code) {
          case 37: // Left -> Scrub backward (YouTube TV style) or move inside dialog
            e.preventDefault();
            if (window.Player.isNextBannerVisible()) {
              this.move('left');
            } else if (this.currentFocus && this.currentFocus.id === 'player-server-select') {
              this.move('left');
            } else {
              window.Player.handleScrubKey(-1);
            }
            return;
          case 39: // Right -> Scrub forward (YouTube TV style) or move inside dialog
            e.preventDefault();
            if (window.Player.isNextBannerVisible()) {
              this.move('right');
            } else if (this.currentFocus && this.currentFocus.id === 'player-server-select') {
              this.move('right');
            } else {
              window.Player.handleScrubKey(1);
            }
            return;
          case 38: // Up -> focus back button / wake OSD
            e.preventDefault();
            window.Player.showOsd();
            var backBtn = document.getElementById('osd-btn-back');
            if (backBtn) this.setFocus(backBtn);
            return;
          case 40: // Down -> focus play button / wake OSD
            e.preventDefault();
            window.Player.showOsd();
            var playBtn = document.getElementById('osd-btn-play');
            if (playBtn) this.setFocus(playBtn);
            return;
          case 13: // Enter / OK
            e.preventDefault();
            if (window.Player.isScrubbing) {
              window.Player.commitScrub();
            } else if (window.Player.isNextBannerVisible()) {
              if (this.currentFocus) this.currentFocus.click();
            } else if (window.Player.isOsdHidden()) {
              window.Player.showOsd();
            } else if (this.currentFocus && (this.currentFocus.id === 'osd-btn-back' || this.currentFocus.id === 'player-server-select' || this.currentFocus.id === 'osd-btn-next-ep')) {
              this.currentFocus.click();
            } else {
              window.Player.togglePlay();
            }
            return;
          case 461: // Back
          case 27:
          case 8:
            e.preventDefault();
            if (window.Player.isScrubbing) {
              window.Player.commitScrub();
            } else if (window.Player.isNextBannerVisible()) {
              window.Player.cancelNextEpisode();
            } else {
              window.Player.close();
            }
            return;
        }
      }

      // webOS Keycodes:
      // Left: 37, Up: 38, Right: 39, Down: 40, Enter: 13, Back: 461 / 27 / 8
      switch (code) {
        case 37: // Left
          e.preventDefault();
          this.move('left');
          break;
        case 38: // Up
          e.preventDefault();
          this.move('up');
          break;
        case 39: // Right
          e.preventDefault();
          this.move('right');
          break;
        case 40: // Down
          e.preventDefault();
          this.move('down');
          break;
        case 13: // Enter / OK
          e.preventDefault();
          if (this.currentFocus) {
            this.currentFocus.click();
          }
          break;
        case 461: // webOS Back
        case 27:  // Escape
        case 8:   // Backspace
          if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            return;
          }
          e.preventDefault();
          this.handleBack();
          break;
        case 415: // Play
          window.dispatchEvent(new CustomEvent('media-play'));
          break;
        case 19:  // Pause
          window.dispatchEvent(new CustomEvent('media-pause'));
          break;
        case 412: // Rewind
          window.dispatchEvent(new CustomEvent('media-rewind'));
          break;
        case 417: // Fast Forward
          window.dispatchEvent(new CustomEvent('media-forward'));
          break;
      }
    },

    registerBackHandler: function(fn) {
      this.backHandlers.push(fn);
    },

    popBackHandler: function() {
      return this.backHandlers.pop();
    },

    handleBack: function() {
      if (this.backHandlers.length > 0) {
        var handler = this.backHandlers[this.backHandlers.length - 1];
        var handled = handler();
        if (handled !== false) {
          this.backHandlers.pop();
          return;
        }
      }
      // Default back behavior
      if (window.App && window.App.navigateBack) {
        window.App.navigateBack();
      }
    },

    move: function(direction) {
      // Find all visible focusable elements in the active view or dialog
      var container = document.querySelector('.player-view.active') ||
                      document.querySelector('.view.active') ||
                      document.body;

      // Include header focusables if not in player
      var elements = [];
      if (!document.querySelector('.player-view.active')) {
        var headerItems = document.querySelectorAll('.header .focusable');
        for (var h = 0; h < headerItems.length; h++) {
          elements.push(headerItems[h]);
        }
      }

      var viewItems = container.querySelectorAll('.focusable');
      for (var v = 0; v < viewItems.length; v++) {
        var item = viewItems[v];
        // Must have non-zero dimensions and not be hidden by CSS display
        var r = item.getBoundingClientRect();
        var style = window.getComputedStyle(item);
        if ((r.width > 0 || r.height > 0 || item.offsetWidth > 0 || item.offsetHeight > 0) &&
            style.display !== 'none' &&
            style.visibility !== 'hidden') {
          elements.push(item);
        }
      }

      if (elements.length === 0) return;

      if (!this.currentFocus || elements.indexOf(this.currentFocus) === -1) {
        this.setFocus(elements[0]);
        return;
      }

      var currentRect = this.currentFocus.getBoundingClientRect();
      var cX = currentRect.left + currentRect.width / 2;
      var cY = currentRect.top + currentRect.height / 2;

      var bestCandidate = null;
      var bestScore = Infinity;

      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (el === this.currentFocus) continue;

        var rect = el.getBoundingClientRect();
        var tX = rect.left + rect.width / 2;
        var tY = rect.top + rect.height / 2;

        var dX = tX - cX;
        var dY = tY - cY;

        var isValidDirection = false;
        var primaryDist = 0;
        var secondaryDist = 0;

        if (direction === 'left' && dX < -5) {
          isValidDirection = true;
          primaryDist = -dX;
          secondaryDist = Math.abs(dY);
        } else if (direction === 'right' && dX > 5) {
          isValidDirection = true;
          primaryDist = dX;
          secondaryDist = Math.abs(dY);
        } else if (direction === 'up' && dY < -5) {
          isValidDirection = true;
          primaryDist = -dY;
          secondaryDist = Math.abs(dX);
        } else if (direction === 'down' && dY > 5) {
          isValidDirection = true;
          primaryDist = dY;
          secondaryDist = Math.abs(dX);
        }

        if (isValidDirection) {
          // Weight primary direction higher than perpendicular drift
          var score = primaryDist + secondaryDist * 2.2;
          if (score < bestScore) {
            bestScore = score;
            bestCandidate = el;
          }
        }
      }

      if (bestCandidate) {
        this.setFocus(bestCandidate);
      }
    }
  };

  window.SpatialNav = SpatialNav;
})(window);
