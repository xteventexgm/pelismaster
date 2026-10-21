/**
 * PelisMaster TV - Main Application Controller
 * Pure ES5 for LG webOS 3.4.3 (Chromium 38)
 */
(function(window) {
  'use strict';

  var App = {
    currentView: 'home',
    viewStack: [],
    homeData: null,
    currentDetail: null,
    heroIndex: 0,
    heroTimer: null,
    searchDebounce: null,

    init: function() {
      var self = this;
      SpatialNav.init();
      Player.init();

      this.bindNav();
      this.loadHome();

      // Diagnostic screen metrics telemetry
      try {
        var diagImg = new Image();
        diagImg.src = Api.getBaseUrl() + '/home?tvDiag=' + (window.innerWidth || 0) + 'x' + (window.innerHeight || 0) + '_screen=' + (screen.width || 0) + 'x' + (screen.height || 0) + '_dpr=' + (window.devicePixelRatio || 1);
      } catch(e) {}

      // Header scroll opacity
      window.addEventListener('scroll', function() {
        var header = document.querySelector('.header');
        if (header) {
          var curY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
          if (curY > 40) {
            header.classList.add('solid');
          } else {
            header.classList.remove('solid');
          }
        }
      });
    },

    bindNav: function() {
      var self = this;
      var links = document.querySelectorAll('.nav-item');
      for (var i = 0; i < links.length; i++) {
        (function(link) {
          link.addEventListener('click', function(e) {
            e.preventDefault();
            var target = link.getAttribute('data-view');
            var sort = link.getAttribute('data-sort');
            self.navigateTo(target, { sort: sort });
          });
        })(links[i]);
      }

      var searchBtn = document.getElementById('btn-nav-search');
      if (searchBtn) {
        searchBtn.addEventListener('click', function() {
          self.navigateTo('search');
        });
      }
    },

    navigateTo: function(viewName, params, isBack) {
      if (!isBack && this.currentView && this.currentView !== viewName) {
        this.viewStack.push({ view: this.currentView, params: this.currentParams });
      }

      this.currentView = viewName;
      this.currentParams = params || {};

      // Update Nav active states
      var navItems = document.querySelectorAll('.nav-item');
      for (var n = 0; n < navItems.length; n++) {
        var item = navItems[n];
        if (item.getAttribute('data-view') === viewName) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      }

      // Hide all views
      var views = document.querySelectorAll('.view');
      for (var v = 0; v < views.length; v++) {
        views[v].classList.remove('active');
      }

      // Show target view
      var targetView = document.getElementById('view-' + viewName);
      if (targetView) {
        targetView.classList.add('active');
      }

      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      // Render view content
      switch (viewName) {
        case 'home':
          this.renderHome();
          break;
        case 'movies':
          this.renderCatalog('movies', params ? params.sort : 'recent');
          break;
        case 'series':
          this.renderCatalog('series', params ? params.sort : 'recent');
          break;
        case 'genres':
          this.renderGenres();
          break;
        case 'genre-items':
          this.renderGenreItems(params.slug);
          break;
        case 'mylist':
          this.renderMyList();
          break;
        case 'search':
          this.setupSearch();
          break;
        case 'detail':
          this.renderDetail(params.type, params.slug);
          break;
      }
    },

    navigateBack: function() {
      if (this.viewStack.length > 0) {
        var prev = this.viewStack.pop();
        this.navigateTo(prev.view, prev.params, true);
      } else if (this.currentView !== 'home') {
        this.navigateTo('home', {}, true);
      }
    },

    /* ==========================================================
       HOME VIEW
       ========================================================== */
    loadHome: function() {
      var self = this;
      Api.getHome(function(err, data) {
        if (err || !data) {
          console.error('Error loading home data:', err);
          self.showConnectionError();
          return;
        }
        self.homeData = data;
        self.renderHome();
      });
    },

    showConnectionError: function() {
      var homeView = document.getElementById('view-home');
      if (homeView) {
        var curIp = Api.getBaseUrl().replace('/api', '');
        homeView.innerHTML = '<div style="padding:120px 48px; text-align:center; max-width:700px; margin:0 auto;">'
          + '<h1 style="font-size:32px; color:#e50914; margin-bottom:16px;">⚠️ No se pudo conectar al servidor</h1>'
          + '<p style="color:#ccc; font-size:16px; line-height:1.6; margin-bottom:24px;">'
          + 'La app intentó conectar a:<br><b style="color:#fff; font-size:18px;">' + curIp + '</b><br><br>'
          + '1. Asegúrate de que el servidor esté encendido en tu PC.<br>'
          + '2. Tu TV y PC deben estar en la misma red Wi-Fi.<br>'
          + '3. Si tu IP cambió, pulsa abajo para editarla y reintentar:'
          + '</p>'
          + '<div style="display:flex; gap:12px; justify-content:center; max-width:480px; margin:0 auto;">'
          + '<input id="ip-config-input" class="focusable" type="text" value="' + curIp + '" style="flex:1; padding:12px 16px; border-radius:5px; background:#222; border:1px solid #555; color:#fff; font-size:16px;">'
          + '<button id="ip-config-save" class="btn btn-primary focusable">Conectar</button>'
          + '</div>'
          + '</div>';

        var saveBtn = document.getElementById('ip-config-save');
        var input = document.getElementById('ip-config-input');
        var self = this;
        if (saveBtn && input) {
          saveBtn.onclick = function() {
            var val = input.value.trim();
            if (val) {
              if (val.indexOf('http') !== 0) val = 'http://' + val;
              if (val.indexOf(':3000') === -1 && val.indexOf(':') === -1) val = val + ':3000';
              Api.setBaseUrl(val.replace(/\/+$/, '') + '/api');
              homeView.innerHTML = '<div style="padding:120px 48px; text-align:center; color:#aaa;">Reconectando...</div>';
              self.loadHome();
            }
          };
          SpatialNav.setFocus(saveBtn);
        }
      }
    },

    renderHome: function() {
      if (!this.homeData) return;
      var self = this;

      // 1. Hero
      this.setupHeroCarousel(this.homeData.heroes);

      // 2. Seguir viendo (LocalStorage)
      this.renderRecentWatchRow();

      // 3. Top 10 de hoy
      this.renderTop10(this.homeData.top10);

      // 4. Rails
      this.renderRails(this.homeData.rails);

      // Set initial focus to Hero Play Button
      var heroBtn = document.getElementById('hero-btn-play');
      if (heroBtn) {
        SpatialNav.setFocus(heroBtn);
      }
    },

    setupHeroCarousel: function(heroes) {
      if (!heroes || heroes.length === 0) return;
      var self = this;
      this.heroIndex = 0;

      this.updateHeroDisplay(heroes[0]);

      clearInterval(this.heroTimer);
      this.heroTimer = setInterval(function() {
        if (self.currentView === 'home' && !Player.isOpen()) {
          self.heroIndex = (self.heroIndex + 1) % heroes.length;
          self.updateHeroDisplay(heroes[self.heroIndex]);
        }
      }, 9000);
    },

    updateHeroDisplay: function(hero) {
      var bgEl = document.getElementById('hero-bg');
      var logoEl = document.getElementById('hero-logo-img');
      var titleEl = document.getElementById('hero-title');
      var matchEl = document.getElementById('hero-match');
      var yearEl = document.getElementById('hero-year');
      var durEl = document.getElementById('hero-duration');
      var genresEl = document.getElementById('hero-genres');
      var ovEl = document.getElementById('hero-overview');
      var playBtn = document.getElementById('hero-btn-play');
      var infoBtn = document.getElementById('hero-btn-info');

      if (bgEl) bgEl.style.backgroundImage = 'url("' + (hero.backdrop || '') + '")';

      if (hero.logoImg) {
        logoEl.src = hero.logoImg;
        logoEl.style.display = 'block';
        titleEl.style.display = 'none';
      } else {
        logoEl.style.display = 'none';
        titleEl.textContent = hero.title || '';
        titleEl.style.display = 'block';
      }

      if (matchEl) matchEl.textContent = hero.match || '';
      if (yearEl) yearEl.textContent = hero.year || '';
      if (durEl) durEl.textContent = hero.duration || '';

      if (genresEl) {
        var gHtml = '';
        for (var g = 0; g < (hero.genres || []).length; g++) {
          gHtml += '<span class="hero-genre-tag">' + hero.genres[g] + '</span>';
          if (g < hero.genres.length - 1) gHtml += ' • ';
        }
        genresEl.innerHTML = gHtml;
      }

      if (ovEl) ovEl.textContent = hero.overview || '';

      var self = this;
      if (playBtn) {
        playBtn.onclick = function() {
          Player.playItem({
            type: hero.type,
            slug: hero.slug,
            title: hero.title,
            backdrop: hero.backdrop,
            season: hero.type === 'series' ? 1 : undefined,
            episode: hero.type === 'series' ? 1 : undefined
          });
        };
      }

      if (infoBtn) {
        infoBtn.onclick = function() {
          self.navigateTo('detail', { type: hero.type, slug: hero.slug });
        };
      }
    },

    renderRecentWatchRow: function() {
      var row = document.getElementById('row-continue-watching');
      var rail = document.getElementById('rail-continue-watching');
      if (!row || !rail) return;

      var recents = this.getRecentWatchList();
      if (!recents || recents.length === 0) {
        row.style.display = 'none';
        return;
      }

      row.style.display = 'block';
      rail.innerHTML = '';

      var self = this;
      for (var i = 0; i < recents.length; i++) {
        (function(item) {
          var card = document.createElement('a');
          card.className = 'card-item focusable';
          card.href = '#';

          var pct = item.duration ? Math.min(100, Math.floor((item.currentTime / item.duration) * 100)) : 0;
          card.innerHTML = '<img class="card-img" src="' + (item.backdrop || '') + '" alt="' + item.title + '">'
            + '<div class="card-gradient"></div>'
            + (item.type === 'series' ? '<span class="card-badge">SERIE</span>' : '')
            + '<span class="card-title">' + item.title + (item.season && item.episode ? ' (T' + item.season + ':E' + item.episode + ')' : '') + '</span>'
            + '<div class="card-progress"><div class="card-progress-bar" style="width:' + pct + '%"></div></div>';

          card.addEventListener('click', function(e) {
            e.preventDefault();
            Player.playItem({
              type: item.type,
              slug: item.slug,
              title: item.title,
              backdrop: item.backdrop,
              season: item.season,
              episode: item.episode,
              resumeTime: item.currentTime
            });
          });

          rail.appendChild(card);
        })(recents[i]);
      }
    },

    renderTop10: function(top10List) {
      var rail = document.getElementById('rail-top10');
      if (!rail || !top10List) return;
      rail.innerHTML = '';

      var self = this;
      for (var i = 0; i < top10List.length; i++) {
        (function(item) {
          var el = document.createElement('a');
          el.className = 't10-item focusable';
          el.href = '#';

          el.innerHTML = '<div class="t10-number">' + item.rank + '</div>'
            + '<div class="t10-poster-wrap">'
            + '<img class="t10-poster" src="' + item.poster + '" alt="' + item.title + '">'
            + '</div>';

          el.addEventListener('click', function(e) {
            e.preventDefault();
            self.navigateTo('detail', { type: item.type, slug: item.slug });
          });

          rail.appendChild(el);
        })(top10List[i]);
      }
    },

    renderRails: function(railsList) {
      var container = document.getElementById('home-rails-container');
      if (!container || !railsList) return;
      container.innerHTML = '';

      var self = this;
      for (var r = 0; r < railsList.length; r++) {
        var railObj = railsList[r];
        var row = document.createElement('section');
        row.className = 'row';

        var header = document.createElement('div');
        header.className = 'row-header';
        header.innerHTML = '<h2 class="row-title">' + railObj.title + '</h2>'
          + (railObj.moreUrl ? '<a class="row-more focusable" href="#">Explorar todo ›</a>' : '');

        var rail = document.createElement('div');
        rail.className = 'rail';

        for (var it = 0; it < railObj.items.length; it++) {
          (function(item) {
            var card = document.createElement('a');
            card.className = 'card-item focusable';
            card.href = '#';

            card.innerHTML = '<img class="card-img" src="' + (item.backdrop || '') + '" alt="' + item.title + '" loading="lazy">'
              + '<div class="card-gradient"></div>'
              + (item.isSeries ? '<span class="card-badge">SERIE</span>' : '')
              + '<span class="card-title">' + item.title + '</span>';

            card.addEventListener('click', function(e) {
              e.preventDefault();
              self.navigateTo('detail', { type: item.type, slug: item.slug });
            });

            rail.appendChild(card);
          })(railObj.items[it]);
        }

        row.appendChild(header);
        row.appendChild(rail);
        container.appendChild(row);
      }
    },

    /* ==========================================================
       CATALOG VIEW (Películas / Series)
       ========================================================== */
    renderCatalog: function(type, sort) {
      var isSeries = (type === 'series');
      var container = document.getElementById(isSeries ? 'view-series' : 'view-movies');
      var titleEl = container ? container.querySelector('.catalog-title') : null;
      var subEl = document.getElementById(isSeries ? 'series-subtitle' : 'catalog-subtitle');
      var grid = document.getElementById(isSeries ? 'series-grid' : 'catalog-grid');
      var pills = container ? container.querySelectorAll('.filter-pills .pill-btn') : [];

      if (titleEl) titleEl.textContent = isSeries ? 'Series' : 'Películas';
      if (grid) grid.innerHTML = '<div style="padding:40px; color:#aaa;">Cargando catálogo...</div>';

      // Update pills
      for (var p = 0; p < pills.length; p++) {
        var pill = pills[p];
        if (pill.getAttribute('data-sort') === sort) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      }

      var self = this;
      Api.getCatalog(type, sort, 1, function(err, res) {
        if (err || !res) {
          if (grid) grid.innerHTML = '<div style="padding:40px; color:#e50914;">Error al cargar catálogo</div>';
          return;
        }

        if (subEl) subEl.textContent = res.totalTitles || '';
        if (grid) grid.innerHTML = '';

        for (var i = 0; i < res.items.length; i++) {
          (function(item) {
            var card = document.createElement('a');
            card.className = 'card-item focusable';
            card.href = '#';

            card.innerHTML = '<img class="card-img" src="' + (item.image || '') + '" alt="' + item.title + '" loading="lazy">'
              + '<div class="card-gradient"></div>'
              + (item.type === 'series' || isSeries ? '<span class="card-badge">SERIE</span>' : '')
              + '<span class="card-title">' + item.title + '</span>';

            card.addEventListener('click', function(e) {
              e.preventDefault();
              self.navigateTo('detail', { type: item.type || type, slug: item.slug });
            });

            if (grid) grid.appendChild(card);
          })(res.items[i]);
        }

        var firstCard = grid ? grid.querySelector('.focusable') : null;
        if (firstCard) SpatialNav.setFocus(firstCard);
      });
    },

    /* ==========================================================
       GENRES VIEW
       ========================================================== */
    renderGenres: function() {
      var grid = document.getElementById('genres-grid');
      if (!grid) return;
      grid.innerHTML = '<div style="padding:40px; color:#aaa;">Cargando géneros...</div>';

      var self = this;
      Api.getGenres(function(err, genres) {
        if (err || !genres) {
          grid.innerHTML = '<div style="padding:40px; color:#e50914;">Error al cargar géneros</div>';
          return;
        }

        grid.innerHTML = '';
        for (var i = 0; i < genres.length; i++) {
          (function(g) {
            var card = document.createElement('a');
            card.className = 'genre-card focusable';
            card.href = '#';

            card.innerHTML = '<img src="' + (g.image || '') + '" alt="' + g.name + '">'
              + '<div class="genre-card-overlay">'
              + '<span class="genre-card-name">' + g.name + '</span>'
              + '<span class="genre-card-count">' + g.count + '</span>'
              + '</div>';

            card.addEventListener('click', function(e) {
              e.preventDefault();
              self.navigateTo('genre-items', { slug: g.slug });
            });

            grid.appendChild(card);
          })(genres[i]);
        }

        var first = grid.querySelector('.focusable');
        if (first) SpatialNav.setFocus(first);
      });
    },

    renderGenreItems: function(slug) {
      var titleEl = document.getElementById('genre-items-title');
      var grid = document.getElementById('genre-items-grid');
      if (grid) grid.innerHTML = '<div style="padding:40px; color:#aaa;">Cargando...</div>';

      var self = this;
      Api.getGenreItems(slug, 1, function(err, res) {
        if (err || !res) {
          if (grid) grid.innerHTML = '<div style="padding:40px; color:#e50914;">Error al cargar género</div>';
          return;
        }

        if (titleEl) titleEl.textContent = res.title || slug;
        grid.innerHTML = '';

        for (var i = 0; i < res.items.length; i++) {
          (function(item) {
            var card = document.createElement('a');
            card.className = 'card-item focusable';
            card.href = '#';

            card.innerHTML = '<img class="card-img" src="' + (item.image || '') + '" alt="' + item.title + '" loading="lazy">'
              + '<div class="card-gradient"></div>'
              + (item.type === 'series' ? '<span class="card-badge">SERIE</span>' : '')
              + '<span class="card-title">' + item.title + '</span>';

            card.addEventListener('click', function(e) {
              e.preventDefault();
              self.navigateTo('detail', { type: item.type, slug: item.slug });
            });

            grid.appendChild(card);
          })(res.items[i]);
        }

        var first = grid.querySelector('.focusable');
        if (first) SpatialNav.setFocus(first);
      });
    },

    /* ==========================================================
       SEARCH VIEW
       ========================================================== */
    setupSearch: function() {
      var input = document.getElementById('search-input');
      var resultsGrid = document.getElementById('search-results-grid');
      if (!input) return;

      var self = this;
      input.value = '';
      if (resultsGrid) resultsGrid.innerHTML = '<div style="padding:40px; color:#777;">Escribe el título de una película o serie...</div>';

      input.oninput = function() {
        clearTimeout(self.searchDebounce);
        self.searchDebounce = setTimeout(function() {
          var query = input.value.trim();
          if (query.length < 2) return;

          Api.search(query, function(err, items) {
            if (err || !items || items.length === 0) {
              if (resultsGrid) resultsGrid.innerHTML = '<div style="padding:40px; color:#777;">No se encontraron resultados para "' + query + '"</div>';
              return;
            }

            resultsGrid.innerHTML = '';
            for (var i = 0; i < items.length; i++) {
              (function(item) {
                var card = document.createElement('a');
                card.className = 'card-item focusable';
                card.href = '#';

                card.innerHTML = '<img class="card-img" src="' + (item.image || '') + '" alt="' + item.title + '">'
                  + '<div class="card-gradient"></div>'
                  + (item.type === 'series' ? '<span class="card-badge">SERIE</span>' : '')
                  + '<span class="card-title">' + item.title + '</span>';

                card.addEventListener('click', function(e) {
                  e.preventDefault();
                  self.navigateTo('detail', { type: item.type, slug: item.slug });
                });

                resultsGrid.appendChild(card);
              })(items[i]);
            }
          });
        }, 400);
      };

      SpatialNav.setFocus(input);
    },

    /* ==========================================================
       MY LIST VIEW (Favoritos + Seguir viendo)
       ========================================================== */
    renderMyList: function() {
      var recentsGrid = document.getElementById('mylist-recents-grid');
      var favsGrid = document.getElementById('mylist-favs-grid');

      // Recents
      var recents = this.getRecentWatchList();
      if (recentsGrid) {
        if (!recents || recents.length === 0) {
          recentsGrid.innerHTML = '<div style="color:#777; padding:20px 0;">No tienes reproducciones recientes.</div>';
        } else {
          recentsGrid.innerHTML = '';
          for (var r = 0; r < recents.length; r++) {
            (function(item) {
              var card = document.createElement('a');
              card.className = 'card-item focusable';
              card.href = '#';

              var pct = item.duration ? Math.min(100, Math.floor((item.currentTime / item.duration) * 100)) : 0;
              card.innerHTML = '<img class="card-img" src="' + (item.backdrop || '') + '" alt="' + item.title + '">'
                + '<div class="card-gradient"></div>'
                + (item.type === 'series' ? '<span class="card-badge">SERIE</span>' : '')
                + '<span class="card-title">' + item.title + '</span>'
                + '<div class="card-progress"><div class="card-progress-bar" style="width:' + pct + '%"></div></div>';

              card.addEventListener('click', function(e) {
                e.preventDefault();
                Player.playItem({
                  type: item.type,
                  slug: item.slug,
                  title: item.title,
                  backdrop: item.backdrop,
                  season: item.season,
                  episode: item.episode,
                  resumeTime: item.currentTime
                });
              });
              recentsGrid.appendChild(card);
            })(recents[r]);
          }
        }
      }

      // Favorites
      var favs = this.getFavorites();
      if (favsGrid) {
        if (!favs || favs.length === 0) {
          favsGrid.innerHTML = '<div style="color:#777; padding:20px 0;">No has añadido títulos a tu lista.</div>';
        } else {
          favsGrid.innerHTML = '';
          var self = this;
          for (var f = 0; f < favs.length; f++) {
            (function(item) {
              var card = document.createElement('a');
              card.className = 'card-item focusable';
              card.href = '#';

              card.innerHTML = '<img class="card-img" src="' + (item.backdrop || '') + '" alt="' + item.title + '">'
                + '<div class="card-gradient"></div>'
                + (item.type === 'series' ? '<span class="card-badge">SERIE</span>' : '')
                + '<span class="card-title">' + item.title + '</span>';

              card.addEventListener('click', function(e) {
                e.preventDefault();
                self.navigateTo('detail', { type: item.type, slug: item.slug });
              });
              favsGrid.appendChild(card);
            })(favs[f]);
          }
        }
      }
    },

    /* ==========================================================
       DETAIL VIEW (Pelicula o Serie)
       ========================================================== */
    renderDetail: function(type, slug) {
      var self = this;
      var container = document.getElementById('view-detail');
      if (!container) return;
      container.innerHTML = '<div style="padding:100px 48px; color:#aaa;">Cargando información...</div>';

      Api.getDetail(type, slug, function(err, detail) {
        if (err || !detail) {
          container.innerHTML = '<div style="padding:100px 48px; color:#e50914;">Error al cargar detalle del título</div>';
          return;
        }

        self.currentDetail = detail;
        var isFav = self.isFavorite(detail.slug);

        var html = '<div class="detail-view">'
          // Detail Hero
          + '<div class="detail-hero">'
          + '<img class="detail-bg" src="' + (detail.backdrop || '') + '" alt="">'
          + '<div class="detail-gradient"></div>'
          + '<div class="detail-hero-content">'
          + (detail.logoImg ? '<img class="detail-logo-img" src="' + detail.logoImg + '" alt="' + detail.title + '">' : '<h1 class="detail-title">' + detail.title + '</h1>')
          + '<div class="detail-meta">'
          + (detail.rating ? '<span class="match-score">' + detail.rating + '</span>' : '')
          + (detail.year ? '<span>' + detail.year + '</span>' : '')
          + (detail.classification ? '<span class="box-badge">' + detail.classification + '</span>' : '')
          + (detail.duration ? '<span>' + detail.duration + '</span>' : '')
          + '</div>'
          + (detail.tagline ? '<p style="font-style:italic; color:#bbb; margin-bottom:10px;">' + detail.tagline + '</p>' : '')
          + '<p class="detail-overview">' + (detail.overview || '') + '</p>'
          + '<div class="hero-buttons">'
          + '<button id="detail-play-btn" class="btn btn-primary focusable">▶ Reproducir</button>'
          + '<button id="detail-fav-btn" class="btn btn-secondary focusable">' + (isFav ? '✓ En Mi lista' : '+ Mi lista') + '</button>'
          + '</div>'
          + '</div></div>'

          // Detail Body
          + '<div class="detail-body">';

        // If Series: Episodes section
        if (detail.type === 'series') {
          html += '<div class="detail-section" style="margin-top:24px;">'
            + '<h2 class="row-title">Episodios</h2>';

          // Seasons selector pills
          if (detail.seasons && detail.seasons.length > 0) {
            html += '<div class="seasons-bar">';
            for (var s = 0; s < detail.seasons.length; s++) {
              var sObj = detail.seasons[s];
              html += '<button class="pill-btn focusable season-tab' + (sObj.isCurrent ? ' active' : '') + '" data-season="' + sObj.seasonNumber + '">' + sObj.name + '</button>';
            }
            html += '</div>';
          }

          // Episodes list
          html += '<div class="episodes-list" id="detail-episodes-list">';
          html += self.buildEpisodesHtml(detail.episodes);
          html += '</div></div>';
        }

        // Full Cast Avatars Rail
        if (detail.cast && detail.cast.length > 0) {
          html += '<div class="detail-section" style="margin-top:36px;">'
            + '<h2 class="row-title" style="margin-bottom:12px;">Reparto</h2>'
            + '<div class="cast-rail">';
          for (var c = 0; c < detail.cast.length; c++) {
            var actor = detail.cast[c];
            html += '<div class="cast-item">'
              + '<div class="cast-avatar-wrap">' + (actor.avatar ? '<img class="cast-avatar" src="' + actor.avatar + '" alt="">' : '') + '</div>'
              + '<div class="cast-name">' + actor.actor + '</div>'
              + (actor.character ? '<div class="cast-char">' + actor.character + '</div>' : '')
              + '</div>';
          }
          html += '</div></div>';
        }

        // Similar Titles Rail
        if (detail.similarTitles && detail.similarTitles.length > 0) {
          html += '<div class="detail-section" style="margin-top:36px;">'
            + '<h2 class="row-title" style="margin-bottom:12px;">Más títulos similares</h2>'
            + '<div class="rail">';
          for (var sim = 0; sim < detail.similarTitles.length; sim++) {
            var sItem = detail.similarTitles[sim];
            html += '<a class="card-item focusable sim-card" href="#" data-type="' + sItem.type + '" data-slug="' + sItem.slug + '">'
              + '<img class="card-img" src="' + (sItem.image || '') + '" alt="' + sItem.title + '" loading="lazy">'
              + '<div class="card-gradient"></div>'
              + (sItem.type === 'series' ? '<span class="card-badge">SERIE</span>' : '')
              + '<span class="card-title">' + sItem.title + '</span>'
              + '</a>';
          }
          html += '</div></div>';
        }

        html += '</div></div>';
        container.innerHTML = html;

        // Bind Detail Buttons
        var playBtn = document.getElementById('detail-play-btn');
        if (playBtn) {
          playBtn.addEventListener('click', function() {
            var resume = self.getResumeTime(detail.slug);
            Player.playItem({
              type: detail.type,
              slug: detail.slug,
              title: detail.title,
              backdrop: detail.backdrop,
              season: detail.type === 'series' ? (detail.currentSeason || 1) : undefined,
              episode: detail.type === 'series' ? 1 : undefined,
              resumeTime: resume
            });
          });
          SpatialNav.setFocus(playBtn);
        }

        var favBtn = document.getElementById('detail-fav-btn');
        if (favBtn) {
          favBtn.addEventListener('click', function() {
            var nowFav = self.toggleFavorite(detail);
            favBtn.textContent = nowFav ? '✓ En Mi lista' : '+ Mi lista';
          });
        }

        // Bind Season Tabs
        var seasonTabs = container.querySelectorAll('.season-tab');
        for (var st = 0; st < seasonTabs.length; st++) {
          (function(tab) {
            tab.addEventListener('click', function() {
              var seasonNum = tab.getAttribute('data-season');
              self.switchSeason(detail.slug, seasonNum, tab);
            });
          })(seasonTabs[st]);
        }

        // Bind Episode Cards
        self.bindEpisodeClicks(container, detail);

        // Bind Similar cards
        var simCards = container.querySelectorAll('.sim-card');
        for (var sc = 0; sc < simCards.length; sc++) {
          (function(card) {
            card.addEventListener('click', function(e) {
              e.preventDefault();
              var sType = card.getAttribute('data-type');
              var sSlug = card.getAttribute('data-slug');
              self.navigateTo('detail', { type: sType, slug: sSlug });
            });
          })(simCards[sc]);
        }
      });
    },

    buildEpisodesHtml: function(episodes) {
      if (!episodes || episodes.length === 0) return '<div style="color:#888;">No hay episodios disponibles.</div>';
      var html = '';
      for (var e = 0; e < episodes.length; e++) {
        var ep = episodes[e];
        html += '<a class="episode-card focusable ep-item" href="#" data-season="' + ep.season + '" data-episode="' + ep.number + '">'
          + '<div class="episode-num">' + ep.number + '</div>'
          + '<div class="episode-thumb-wrap">'
          + '<img class="episode-thumb" src="' + (ep.thumbnail || '') + '" alt="" loading="lazy">'
          + (ep.duration ? '<span class="episode-duration">' + ep.duration + '</span>' : '')
          + '</div>'
          + '<div class="episode-info">'
          + '<div class="episode-title">' + ep.title + '</div>'
          + (ep.airDate ? '<div class="episode-date">' + ep.airDate + '</div>' : '')
          + '<div class="episode-overview">' + (ep.overview || '') + '</div>'
          + '</div>'
          + '</a>';
      }
      return html;
    },

    bindEpisodeClicks: function(container, detail) {
      var self = this;
      var epCards = container.querySelectorAll('.ep-item');
      for (var ep = 0; ep < epCards.length; ep++) {
        (function(card) {
          card.addEventListener('click', function(e) {
            e.preventDefault();
            var sNum = card.getAttribute('data-season');
            var eNum = card.getAttribute('data-episode');
            Player.playItem({
              type: 'series',
              slug: detail.slug,
              title: detail.title,
              backdrop: detail.backdrop,
              season: sNum,
              episode: eNum
            });
          });
        })(epCards[ep]);
      }
    },

    switchSeason: function(slug, seasonNum, activeTab) {
      var self = this;
      var epContainer = document.getElementById('detail-episodes-list');
      if (epContainer) epContainer.innerHTML = '<div style="padding:20px; color:#aaa;">Cargando temporada ' + seasonNum + '...</div>';

      var tabs = document.querySelectorAll('.season-tab');
      for (var t = 0; t < tabs.length; t++) tabs[t].classList.remove('active');
      activeTab.classList.add('active');

      Api.getDetail('series', slug + '/season/' + seasonNum, function(err, sDetail) {
        if (err || !sDetail || !sDetail.episodes) {
          if (epContainer) epContainer.innerHTML = '<div style="color:#e50914;">Error al cargar episodios</div>';
          return;
        }
        if (epContainer) {
          epContainer.innerHTML = self.buildEpisodesHtml(sDetail.episodes);
          self.bindEpisodeClicks(epContainer, self.currentDetail);
        }
      });
    },

    /* ==========================================================
       LOCALSTORAGE (Seguir viendo & Mi lista)
       ========================================================== */
    saveWatchProgress: function(entry) {
      // entry: { slug, type, title, backdrop, season, episode, currentTime, duration, completed }
      try {
        var recents = this.getRecentWatchList();
        // remove existing entry for same slug
        recents = recents.filter(function(r) {
          return r.slug !== entry.slug;
        });

        if (!entry.completed) {
          recents.unshift(entry);
          // keep max 20 recent items
          if (recents.length > 20) recents = recents.slice(0, 20);
        }

        localStorage.setItem('pm_recent', JSON.stringify(recents));
      } catch(e) {
        console.warn('LocalStorage error:', e);
      }
    },

    getRecentWatchList: function() {
      try {
        var data = localStorage.getItem('pm_recent');
        return data ? JSON.parse(data) : [];
      } catch(e) {
        return [];
      }
    },

    getResumeTime: function(slug) {
      var list = this.getRecentWatchList();
      for (var i = 0; i < list.length; i++) {
        if (list[i].slug === slug && list[i].currentTime) {
          return list[i].currentTime;
        }
      }
      return 0;
    },

    getFavorites: function() {
      try {
        var data = localStorage.getItem('pm_favs');
        return data ? JSON.parse(data) : [];
      } catch(e) {
        return [];
      }
    },

    isFavorite: function(slug) {
      var favs = this.getFavorites();
      for (var i = 0; i < favs.length; i++) {
        if (favs[i].slug === slug) return true;
      }
      return false;
    },

    toggleFavorite: function(detail) {
      try {
        var favs = this.getFavorites();
        var exists = false;
        var newFavs = [];

        for (var i = 0; i < favs.length; i++) {
          if (favs[i].slug === detail.slug) {
            exists = true;
          } else {
            newFavs.push(favs[i]);
          }
        }

        if (!exists) {
          newFavs.unshift({
            slug: detail.slug,
            type: detail.type,
            title: detail.title,
            backdrop: detail.backdrop
          });
        }

        localStorage.setItem('pm_favs', JSON.stringify(newFavs));
        return !exists;
      } catch(e) {
        return false;
      }
    }
  };

  window.App = App;

  document.addEventListener('DOMContentLoaded', function() {
    App.init();
  });
})(window);
