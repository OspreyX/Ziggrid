define("appkit/adapter",
  [],
  function() {
    "use strict";
    var Adapter = DS.Adapter.extend({
      /** Start the ball rolling by 'finding' a table.  We ignore the 'type' and just look at the 'id' as the table name
       */
      findQuery: function(store, type, opts, array) {
        throw new Error('findQuery not yet supported');
      },

      find: function(store, type, id) {
        throw new Error('FindById not supported - use watch()');
      },

      // I'm not sure that I really want to support this behavior
      // But at least it's not one at a time
      createRecords: function(store, type, set) {
        throw new Error('Create not yet supported');
      },

      createRecord: function() {
        throw new Error('Create not yet supported');
      },

      updateRecord: function() {
        throw new Error('Ziggrid does not support updating');
      },

      deleteRecord: function() {
        throw new Error('Ziggrid does not support deleting');
      },

      toString: function() {
        return 'Ziggrid.Adapter';
      }
    });



    return Adapter;
  });
define("appkit/app",
  ["appkit/utils/percentage_of_data","resolver","appkit/store","appkit/models/player","appkit/initializers/watcher","appkit/initializers/csv","appkit/initializers/connection_manager","appkit/components/bean-production","appkit/components/bean-leaderboard","appkit/components/bean-homeruns"],
  function(__dependency1__, Resolver, Store, Player, watcherInitializer, csvInitializer, connectionManagerInitializer, BeanProduct, BeanLeaderboard, BeanHomeruns) {
    "use strict";
    var precision = __dependency1__.precision;

    // Enable late registration helpers/components
    Ember.FEATURES['container-renderables'] = true;

    var App = Ember.Application.extend({
      modulePrefix: 'appkit', // TODO: loaded via config
      Store: Store,
      Resolver: Resolver,
      gameDateRanges: {
        '2006': [92, 274],
        '2007': [91, 274],
        '2008': [85, 274],
        '2009': [95, 279],
        '2010': [94, 276],
        '2011': [90, 271],
        '2012': [88, 277]
      }
    });

    App.initializer(watcherInitializer);
    App.initializer(csvInitializer);
    App.initializer(connectionManagerInitializer);

    App = App.create();
    App.deferReadiness(); // defering to allow sync boot with Ziggrid

    function round(val) {
      if (!isNaN(val) && !/^\d+$/.test(val)) {
        return val.toFixed(3);
      } else {
        return (val || val === 0) ? val : 'N/A';
      }
    }

    App.register('helper:round', Ember.Handlebars.makeBoundHelper(round));

    App.register('helper:name-from-code', Ember.Handlebars.makeBoundHelper(function(code) {
      return Player.nameFromCode(code) || code;
    }));

    App.register('helper:precision', Ember.Handlebars.makeBoundHelper(function(value, p) {
      return precision(value, p);
    }));

    App.register('helper:quadrant-value', Ember.Handlebars.makeBoundHelper(function(value) {
      //value = (value && value > 0 && value < 3) ? value : -1; //Math.random() * 0.3 + 0.3;
      return round(value);
    }));



    // TODO: happier way to do this automatically?
    // This way is bad because the component subclasses don't
    // get their injections...
    Ember.Handlebars.helper('bean-production', BeanProduct);
    Ember.Handlebars.helper('bean-leaderboard', BeanLeaderboard);
    Ember.Handlebars.helper('bean-homeruns', BeanHomeruns);

    // For our range input in bean-player
    Ember.TextField.reopen({
      attributeBindings: ['step', 'min', 'max']
    });


    return App;
  });
define("appkit/components/bean-homeruns",
  ["appkit/components/bean-table"],
  function(BeanTable) {
    "use strict";

    var Homeruns = BeanTable.extend({
      type: 'Leaderboard_homeruns_groupedBy_season',
      entryType: 'LeaderboardEntry_homeruns_groupedBy_season',

      headers: ['Home Runs', 'HR']
    });



    return Homeruns;
  });
define("appkit/components/bean-leaderboard",
  ["appkit/components/bean-table"],
  function(BeanTable) {
    "use strict";

    var Leaderboard = BeanTable.extend({
      type: 'Leaderboard_average_groupedBy_season',
      entryType: 'LeaderboardEntry_average_groupedBy_season',

      headers: ['Batting Average', 'AVG']
    });



    return Leaderboard;
  });
define("appkit/components/bean-player-profile",
  [],
  function() {
    "use strict";
    var PlayerProfile = Ember.Component.extend({
      player: null,
      seasonHolder: null,
      init: function () {
        var self = this;
        this.watcher = this.container.lookup('watcher:main'); // inject
        this.seasonHolder = this.container.lookup('controller:application');
        this.seasonHolder.addObserver('season', function() { self.playerWillChange(); self.playerChanged(); });
        this._super();
      },
      players: function() {
        var Player = this.container.lookupFactory('model:player');
        var allStars = Ember.get(Player, 'allStars');

        // just build for real Players the first time
        // this list doesn't change so we don't care
        // also the CP caches.
        return Ember.keys(allStars).map(function(entry) {
          return allStars[entry];
        }).map(function(entry) {
          return Player.create(entry);
        });
      }.property(),

      playerWillChange: function() {
        var oldPlayer = this.get('player');
        if (oldPlayer) {
          this.unwatchProfile();
        }
      }.observesBefore('player'),

      playerChanged: function() {
        var newPlayer = this.get('player');
        if (newPlayer) {
          var self = this;
          var watching = this.watcher.watchProfile(this.get('player.code'), this.seasonHolder.get('season'), function(data) {
            self.set('profile', data);
          });
          this.set('watchHandle', watching.hash);
      
        }
        this.set('imageFailedToLoad', false);
      }.observes('player').on('init'),

      watchHandle: null,
      profile: null,

      unwatchProfile: function() {
        var watchHandle = this.get('watchHandle');

        if (!watchHandle) {
          throw new Error('No handle to unwatch');
        }
    
        this.watcher.unwatch(watchHandle);
      },

      // TODO: combine the various player car
      imageFailedToLoad: false,
      imageUrl: function() {

        if (this.get('imageFailedToLoad')) {
          return '/players/404.png';
        }

        var code = this.get('player.code');
        if (!code) { return; }
        return '/players/' + code + '.png';
      }.property('player.code', 'imageFailedToLoad').readOnly(),

      listenForImageLoadingErrors: function() {
        var component = this;

        this.$('img').error(function() {
          Ember.run(component, 'set', 'imageFailedToLoad', true);
        });
      }.on('didInsertElement')
    });


    return PlayerProfile;
  });
define("appkit/components/bean-player",
  [],
  function() {
    "use strict";
    var Player = Ember.Component.extend({
      progress: 0,
      isPlaying: false,
      progressText: null,
      showNub: true,
      _nubProgress: 0,
      nubProgressIsSynced: true,
  
      init: function() {
        this._super();
        this.container.register('bean-player:main', this, { instantiate: false });
      },

      generators: Ember.computed.alias('connectionManager.generators'),

      progressTextStyle: function() {
        var nubProgress = this.get('nubProgress') || 0;
        return 'left: ' + (nubProgress * 99 + 0) + '%;';
      }.property('nubProgress'),

      nubProgress: function(key, val) {
        if (arguments.length === 2) {
          // Setter. Gets called when user grabs the nub.
          if (this.get('progress') - val < 0.01) {
            this.set('nubProgressIsSynced', true);
            Ember.run.next(this, 'notifyPropertyChange', 'nubProgress');
          } else {
            this.set('nubProgressIsSynced', false);
            this.set('_nubProgress', val);
          }
        } else {
          // Getter
          if (this.get('nubProgressIsSynced')) {
            return this.get('progress');
          } else {
            return this.get('_nubProgress');
          }
        }
      }.property('progress', 'nubProgressIsSynced'),

      progressPercentage: function() {
        return this.get('progress') * 100;
      }.property('progress'),

      progressBarStyle: function() {
        return 'width: ' + this.get('progressPercentage') + '%;';
      }.property('progress'),

      actions: {
        play: function() {
          if (this.get('isPlaying')) { return; }
          var gens = this.get('generators');
          for (var g in gens) {
            gens[g].start();
          }
          this.set('isPlaying', true);
          this.sendAction('didBeginPlaying');
        },

        pause: function() {
          if (!this.get('isPlaying')) { return; }
          var gens = this.get('generators');
          for (var g in gens) {
            gens[g].stop();
          }
          this.set('isPlaying', false);
          this.sendAction('didEndPlaying');
        }
      }
    });


    return Player;
  });
define("appkit/components/bean-production",
  ["appkit/components/bean-table"],
  function(BeanTable) {
    "use strict";

    var Production = BeanTable.extend({
      type: 'Leaderboard_production_groupedBy_season',
      entryType: 'LeaderboardEntry_production_groupedBy_season',

      headers: ['Production', 'PR']
    });



    return Production;
  });
define("appkit/components/bean-quadrant",
  [],
  function() {
    "use strict";
    var w = 690,
        h = 500,
        radius = 5;

    function playerX(scale) {
      return function(player) {
        return scale(Ember.get(player, 'goodness')) + 'px';
      };
    }

    function playerY(scale) {
      return function(player) {
        return scale(Ember.get(player, 'hotness')) + 'px';
      };
    }

    function get(path) {
      return function(object) {
        return Ember.get(object, path);
      };
    }

    function appendPlayers(players, component) {
      players.
        append('span').
          classed('name', true).
          text(get('PlayerName'));

      players.
        append('div').
        classed('circle', true);

      players.
        on('click', function(d, i) {
          clickPlayer.call(this, d, component);
      });
    }

    function clickPlayer(playerData, component) {
      d3.select('.selected').classed('selected', false);
      var selectedPlayer = component.get('selectedPlayer');

      var selected = d3.select(this);

      if (selectedPlayer === playerData) {
        deselect(component);
      } else {
        component.set('selectedPlayer', playerData);
        selected.classed('selected', true);
      }
    }

    function deselect(component) {
      component.set('selectedPlayer', null);
      d3.select('.selected').classed('selected', false);
    }

    var Quadrant = Ember.Component.extend({
      selectedPlayer: null,
      renderGraph: function() {
        var $container = this.$().find('.quadrant-container');
        createSVG($container.get(0));

        this.$popup = this.$().find('.quadrant-popup');
        this.xscale = d3.scale.linear().
          domain([0, 1]).
          range([9.5, w-9.5]).
          clamp(true);

        this.yscale = d3.scale.linear().
          domain([0, 1]).
          range([h-9.5, 9.5]).
          clamp(true);

        this.dataDidChange();

        // TODO: make sure we clean this guy up
        (function syncPopupPosition(){
          var selected = $('.selected');
          var popup = $('.quadrant-popup');

          popup.css({
            left: selected.css('left'),
            top: selected.css('top')
          });

          window.requestAnimationFrame(syncPopupPosition);
        }());

      }.on('didInsertElement'),

      renderD3: function() {
        var season = this.get('season');

        var container = d3.select(this.$('.quadrant-graph')[0]);
        var data = this.get('players').filter(function(player) {
          return player.hasSeason(season);
        }).filterBy('realized');

        var component = this;

        var xscale = this.xscale;
        var yscale = this.yscale;

        var players = container.
          selectAll('.quadrant-player').
          data(data, get('name'));

        players.exit().each(fadeOutPlayer).
          transition().
          duration(300).
          style({
            opacity: 0
          }).remove();

        players.enter().
          append('div').
          attr('data-id', get('name')).
          attr('data-name', get('humanizedName')).
          classed('quadrant-player', true).
          style({
            opacity: 0,
            left: playerX(xscale),
            top: playerY(yscale)
          }).call(function(players) {
            players.
              append('span').
                classed('name', true).
                text(get('humanizedName'));

            players.
              append('div').
              classed('circle', true);

            players.
              on('click', function(d, i) {
                clickPlayer.call(this, d, component);
              });
          });

        players.transition().
          duration(1000).
          ease('linear').
          style({
            opacity: 1,
            left: playerX(xscale),
            top: playerY(yscale)
          });

        function fadeOutPlayer() {
          if (d3.select(this).classed('selected')) {
            deselect(component);
          }
        }
      },

      dataDidChange: function() {
        Ember.run.throttle(this, 'renderD3', 100);
      }.observes('players.@each.hotness', 'players.@each.goodness', 'season'),

      teardownGraph: function() {
        // TODO: what kind of teardown does d3 need?
      }.on('willDestroyElement'),

      click: function(e) {
        if (e.target.tagName !== 'rect') { return; }
        deselect(this);
      }
    });

    function createSVG(parentElement) {
      var svg = d3.select(parentElement).append('svg:svg')
          .attr('width', w)
          .attr('height', h);

      // gradient
      var defs = svg.append('svg:defs');

      var backgroundLinearGradient = defs.append('svg:linearGradient').
        attr('id', 'background-linear-gradient').
        attr('x1', '0%').
        attr('y1', '100%').
        attr('x2', '100%').
        attr('y2', '0%');

      backgroundLinearGradient.append('svg:stop').
          attr('offset', '20%').
          attr('stop-color', '#0A4D65').
          attr('stop-opacity', 1);

      backgroundLinearGradient.append('svg:stop').
          attr('offset', '80%').
          attr('stop-color', '#8D470B').
          attr('stop-opacity', 1);

      var backgroundRadialGradient = defs.append('svg:radialGradient').
        attr('id', 'background-radial-gradient').
        attr('cx', '50%').
        attr('cy', '50%').
        attr('r',  '50%').
        attr('fx', '50%').
        attr('fy', '50%');

      backgroundRadialGradient.append('svg:stop').
          attr('offset', '0%').
          attr('stop-color', 'black').
          attr('stop-opacity', 0.8);

      backgroundRadialGradient.append('svg:stop').
          attr('offset', '100%').
          attr('stop-opacity', 0);

      svg.append('svg:rect').
          attr('width', w).
          attr('height', h).
          style('fill', 'url(#background-linear-gradient)');

      svg.append('svg:rect').
          attr('width', w).
          attr('height', h).
          style('fill', 'url(#background-radial-gradient)');
      // \gradient
      //
      svg.append('line').
        attr('stroke-dasharray', '2 2').
        attr('stroke-width', 0.3).
        attr('stroke', 'rgba(255, 255, 255, 0.52)').
        attr('x1', w/2).
        attr('y1', 0).
        attr('x2', w/2).
        attr('y2', h);

      svg.append('line').
        attr('stroke-dasharray', '2 2').
        attr('stroke-width', 0.3).
        attr('stroke', 'rgba(255, 255, 255, 0.52)').
        attr('y1', h/2).
        attr('x1', 0).
        attr('y2', h/2).
        attr('x2', w);
    }


    return Quadrant;
  });
define("appkit/components/bean-standings",
  [],
  function() {
    "use strict";
    var get = Ember.get;

    var Table = Ember.Component.extend({

      // Template args
      league: null,
      region: null,

      title: Ember.computed.alias('region.name'),

      headers: function() {
        return [this.get('title'), 'W', 'L'];
      }.property()
    });



    return Table;
  });
define("appkit/components/bean-table",
  [],
  function() {
    "use strict";
    var Table = Ember.Component.extend({

      // e.g. 'Leaderboard_production_groupedBy_season'
      type: null,

      // e.g. 'LeaderboardEntry_production_groupedBy_season'
      entryType: null,

      // unique ID assigned by Watcher
      handle: null,

      // Have to specify this so that subclasses get it too.
      templateName: 'components/bean-table',

      season: null,

      headers: null,

      entries: function() {
        // TODO: more efficient way to display just the first N elements?
        return this.get('content').slice(0, 5);
      }.property('content.[]'),

      content: [],

      startWatching: function() {
        var watcher = this.container.lookup('watcher:main'),
            handle = this.get('handle');

        if (handle) {
          watcher.unwatch(handle);
        }

        var config = watcher.watch(this.get('type'),
                                  this.get('entryType'),
                                  { season: '' + this.get('season') });

        this.set('content', config.model.get('table'));
        this.set('handle', config.hash);
      }.observes('season').on('init')
    });



    return Table;
  });
define("appkit/components/bean-team-standing",
  [],
  function() {
    "use strict";
    var TeamStanding = Ember.Component.extend({
      _applicationController: Ember.computed(function(){
        return this.container.lookup('controller:application');
      }),

      season: Ember.computed.alias('_applicationController.season'),
      team: null,
      handle: null,
      watcher: Ember.computed(function() {
        return this.container.lookup('watcher:main');
      }),

      winLoss: function() {
        var watcher = this.get('watcher');
        var code = this.get('team.watchCode');
        var season = this.get('season');

        var handle = this.get('handle');

        if (handle) {
          // unsubscribe;
          watcher.unwatch(handle);
        }

        var subscription = {
          team: code,
          season: '' + season
        };

    //    console.log('watching', subscription);

        var track = watcher.watch('WinLoss', 'WinLoss', subscription);
        this.set('handle', track.hash);

        return track.model;
      }.property('team.code', 'season'),
      wins: Ember.computed.alias('winLoss.wins'),
      losses: Ember.computed.alias('winLoss.losses')
    });


    return TeamStanding;
  });
define("appkit/controllers/application",
  [],
  function() {
    "use strict";
    var ApplicationController = Ember.Controller.extend({

      years: [2007, 2008, 2009, 2010, 2011, 2012],

      season: null,

      currentPage: 0,

      // TODO: move to ApplicationView when it works
      pageContainerStyle: function() {
        var currentPage = this.get('currentPage');
        return "margin-left: " + (-960 * currentPage) +  "px;";
      }.property('currentPage'),

      actions: {
        togglePage: function() {
          this.set('currentPage', +!this.get('currentPage'));
        }
      }
    });


    return ApplicationController;
  });
define("appkit/controllers/filter",
  [],
  function() {
    "use strict";
    var FilterController = Ember.Controller.extend({
      needs: ['application'],

      years: Ember.computed.sort('controllers.application.years', function(a, b){
        return (a > b) ? -1 : 1;
      }),

      selectedFilter: null
    });


    return FilterController;
  });
define("appkit/controllers/filter_item",
  [],
  function() {
    "use strict";
    var FilterItemController = Ember.ObjectController.extend({
      isSelected: function() {
        return this.get('content') === this.get('parentController.selectedFilter');
      }.property('parentController.selectedFilter')
    });


    return FilterItemController;
  });
define("appkit/controllers/quadrant",
  ["appkit/utils/percentage_of_data"],
  function(__dependency1__) {
    "use strict";
    var percentageOfData = __dependency1__.percentageOfData;

    var get = Ember.get;

    var QuadrantController = Ember.Controller.extend({
      needs: ['filter', 'application'],
      filter: Ember.computed.alias('controllers.filter.selectedFilter'),
      showing: Ember.computed.bool('controllers.application.currentPage'),

      progress: function() {
        var gameDate = this.get('currentDate');

        if (!gameDate) {
          return 0;
        }

        return percentageOfData(gameDate.day, parseInt(gameDate.season, 10));
      }.property('currentDate'),

      currentDate: Ember.computed.alias('gameDates.lastObject'),
      //currentDate: { season: '2009', day: '180' },

      currentDateText: function() {
        var date = this.get('currentDate');
        if (!date) { return; }

        var season = get(date, 'season');
        return moment('' + season).day(parseInt(get(date, 'day'), 10) + 1).format('MMMM D, YYYY');
      }.property('currentDate')
    });


    return QuadrantController;
  });
define("appkit/controllers/quadrant_player",
  [],
  function() {
    "use strict";
    var QuadrantPlayerController = Ember.ObjectController.extend({

      playerWillChange: function() {
        var oldPlayer = this.get('content');
        if (oldPlayer) {
          oldPlayer.unwatchProfile();
        }
      }.observesBefore('content'),

      playerChanged: function() {
        var newPlayer = this.get('content');
        if (newPlayer) {
          newPlayer.watchProfile();
        }
      }.observes('content')
    });



    return QuadrantPlayerController;
  });
define("appkit/controllers/standings",
  ["appkit/utils/group_by"],
  function(groupBy) {
    "use strict";

    function Region(name, teams) {
      this.name = name;
      this.teams = teams;
    }

    function League(name, teams) {
      var grouped = groupBy('Division', teams);
      this.regions = [
        new Region('East',    grouped.East),
        new Region('Central', grouped.Central),
        new Region('West',    grouped.West)
      ];

      this.name = name;
    }

    var StandingsController = Ember.Controller.extend({
      needs: ['application'],
      season: Ember.computed.alias('controllers.application.season'),
      leagues: Ember.computed(function(){
        var TeamListing = this.container.lookupFactory('model:team_listing');
        var byLeague = TeamListing.allTeamsByLeague;

        return [
          new League('American League', byLeague.AL),
          new League('National League', byLeague.NL)
        ];
      }),
      // unique ID assigned by Watcher
      handle: null,

      startWatching: function() {
      }.observes('season').on('init')
    });


    return StandingsController;
  });
define("appkit/flags",
  [],
  function() {
    "use strict";
    var flags = {
      LOG_WEBSOCKETS: false
    };


    return flags;
  });
define("appkit/initializers/connection_manager",
  ["appkit/ziggrid/connection_manager"],
  function(ConnectionManager) {
    "use strict";
    var url = '/ziggrid/';


    var initializer = {
      name: 'connection-manager',
      before: 'registerComponents',
      initialize: function(container, application) {
        var connectionManager = ConnectionManager.create({
          url: url,
          namespace: application,
          container: container
        });

        application.register('connection_manager:main', connectionManager, {
          instantiate: false
        });

        application.inject('component:bean-player',
                   'connectionManager',
                   'connection_manager:main');
      }
    };


    return initializer;
  });
define("appkit/initializers/csv",
  ["appkit/utils/index_by","appkit/utils/group_by","appkit/utils/aggregate_players","appkit/utils/csv"],
  function(indexBy, groupBy, aggregatePlayers, csv) {
    "use strict";

    // Load all the csv data
    var initializer = {
      name: 'load-csv',
      initialize: function(container, application) {
        application.deferReadiness();

        Ember.RSVP.hash({
          allStars: csv('all-stars.csv'),
          allTeams: csv('all-teams.csv'),
          allPlayers: csv('all-players.csv')
        }).then(function(hash) {
          application.advanceReadiness();

          var Player = container.lookupFactory('model:player');
          var TeamListing = container.lookupFactory('model:team_listing');

          // TODO: store object would be better
          Player.reopenClass({
            dataByName: indexBy('PlayerCode', hash.allPlayers),
            allStars: aggregatePlayers(hash.allStars)
          });

          TeamListing.reopenClass({
            allTeamsByLeague: groupBy('League', hash.allTeams),
            allTeams: hash.allTeams
          });

        }).fail(Ember.RSVP.rethrow);
      }
    };


    return initializer;
  });
define("appkit/initializers/watcher",
  ["appkit/ziggrid/watcher"],
  function(Watcher) {
    "use strict";

    var initializer = {
      name: 'ziggrid-watcher',
      initialize: function(container, application) {
        var watcher = new Watcher(application);
        application.register('watcher:main', watcher, { instantiate: false });
      }
    };


    return initializer;
  });
define("appkit/models/player",
  [],
  function() {
    "use strict";
    var Player = Ember.Object.extend({
      PlayerName: function(){
        var code = this.get('code');
        var playerData = Player.dataByName[code];
        var name;

        if (playerData) {
          name = playerData.PlayerName;
        }

        return name || this.get('name') || code;
      }.property('code')
    });

    Player.reopenClass({
      getPlayerData: function(code) {
        throw new Error('implement me');
      },

      nameFromCode: function(code) {
        var player = this.dataByName[code];

        return player && player.PlayerName;
      },

      data: undefined,
      playerCodes: function() {
        return Ember.keys(this.allStars);
      }
    });


    return Player;
  });
define("appkit/models/quadrant_player",
  ["appkit/models/player","appkit/flags"],
  function(Player, flags) {
    "use strict";

    var App = window.App;

    var QuadrantPlayer = Ember.Object.extend({
      init: function(){
        this._super();
        QuadrantPlayer.all.pushObject(this);
        QuadrantPlayer.allByCode[this.get('code')] = this;
      },

      code: Ember.computed.alias('data.code'),
      profileData: null,
      profile: null,

      realized: false,
      hotness: 0,
      goodness: 0,
      imageUrl: function(){
        return '/players/' + this.get('code') + '.png';
      }.property('data.name').readOnly(),

      // the actual player data resides on the Player mode,
      // this merely decorates. It is possible for us to have
      // inconsitent data, has this extra abstractoin
      data: function() {
        var name = this.get('name');
        var data = Player.allStars[name] || {};
        var playerData = Player.dataByName[name] || {};
        Ember.merge(data, playerData);
        return data;
      }.property('name'),

      hasSeason: function(season) {
        var seasons = this.get('data.seasons');

        return !!(seasons && seasons[season]);
      },

      humanizedName: Ember.computed.oneWay('profileData.fullname'),

      watchProfile: function() {
        this.set('profile', this.get('profileData'));
      },

      unwatchProfile: function() {
        this.set('profile', null);
      }
    });

    QuadrantPlayer.reopenClass({
      all: [],
      allByCode: {},
      findOrCreateByName: function(playerName) {
        var player = QuadrantPlayer.all.findProperty('name', playerName);

        if (!player) {
          player = QuadrantPlayer.create({
            name: playerName
          });
        }

        return player;
      },
      watchPlayers: function(container, playerNames, season, dayOfYear) {
        var watcher = container.lookup('watcher:main');
        playerNames.forEach(function(playerName, i) {
          watchPlayer(watcher, playerName, season);
          QuadrantPlayer.findOrCreateByName(playerName);
        });

        return QuadrantPlayer.all; // TODO: some record array.
      }
    });

    function updateQuadrantPlayer(data) {
      if (flags.LOG_WEBSOCKETS) {
        console.log('updateQuadrantPlayer', data);
      }

      if (!data.player) return;

      var player = QuadrantPlayer.allByCode[data.player];
      if (!player)
        player = QuadrantPlayer.create({ name: data.player });

      player.set('realized', true);
      player.set('profileData', data);
      player.set('goodness', normalizedQuadrantValue(data['clutchness']));
      player.set('hotness', normalizedQuadrantValue(data['hotness']));
    }

    function normalizedQuadrantValue(value) {
      if (typeof value === undefined) return 0.5;
      if (value <= 0) return 0.0;
      if (value > 1) return 1.0;
      return value;
    }

    function watchPlayer(watcher, playerName, season) {
      watcher.watchProfile(playerName, season, updateQuadrantPlayer);
    }

    // TODO: inject
    function getConnectionManager() {
      return App.__container__.lookup('connection_manager:main');
    }


    return QuadrantPlayer;
  });
define("appkit/models/team_listing",
  [],
  function() {
    "use strict";
    var TeamListing = Ember.Object.extend({
    });

    TeamListing.reopenClass({
      all: []
    });


    return TeamListing;
  });
define("appkit/routes/application",
  ["appkit/models/player","appkit/models/quadrant_player"],
  function(Player, QuadrantPlayer) {
    "use strict";

    var season = 2007;

    var ApplicationRoute = Ember.Route.extend({
      setupController: function(controller) {

        var watcher = this.container.lookup('watcher:main');
        this.watcher = watcher;

        var gameDates = watcher.watchGameDate();

        controller.set('season', season);

        this.controllerFor('quadrant').set('gameDates', gameDates);

        this.updateQuadrantPlayers(season);
      },

      updateQuadrantPlayers: function(filter) {

        var filterController = this.controllerFor('filter');
        filterController.set('selectedFilter', filter);

        // TODO: grab this dynamically from leaderboard.

        var allStarPlayerCodes = this.container.lookupFactory('model:player').playerCodes();

        var players = QuadrantPlayer.watchPlayers(this.container, allStarPlayerCodes, season);
        this.controllerFor('quadrant').set('players', players);
      },

      actions: {
        selectFilter: function(filter) {
          this.updateQuadrantPlayers(filter);
        },
        didBeginPlaying: function() {
          this.watcher.keepSendingGameDates = true;
        },
        didEndPlaying: function() {
          this.watcher.keepSendingGameDates = false;
        }
      }
    });


    return ApplicationRoute;
  });
define("appkit/store",
  ["appkit/adapter"],
  function(Adapter) {
    "use strict";

    var Store = DS.Store.extend({
      adapter: Adapter
    });


    return Store;
  });
define("appkit/utils/aggregate_players",
  [],
  function() {
    "use strict";
    function aggregatePlayers(players) {
      var result = { };

      players.forEach(function(entry) {
        var code = entry.PlayerCode;
        var player = result[code] = result[code] || {
          name: entry.PlayerName,
          code: code,
          seasons: {}
        };

        player.seasons[entry.Year] = entry;
      });

      return result;
    }


    return aggregatePlayers;
  });
define("appkit/utils/csv",
  [],
  function() {
    "use strict";

    return Ember.RSVP.denodeify(d3.csv);
  });
define("appkit/utils/group_by",
  [],
  function() {
    "use strict";
    var get = Ember.get;

    function groupBy(property, collection) {
      var index = {};

      collection.forEach(function(entry) {
        var key = get(entry, property);
        index[key] = index[key] || [];
        index[key].push(entry);
      });

      return index;
    }


    return groupBy;
  });
define("appkit/utils/index_by",
  [],
  function() {
    "use strict";
    function indexBy(property, collection) {
      var index = {};

      collection.forEach(function(entry) {
        index[Ember.get(entry, property)] = entry;
      });

      return index;
    }


    return indexBy;
  });
define("appkit/utils/percentage_of_data",
  ["exports"],
  function(__exports__) {
    "use strict";
    var ranges = {
      2007: [ 91, 274 ],
      2008: [ 85, 274 ],
      2009: [ 95, 279 ],
      2010: [ 94, 276 ],
      2011: [ 90, 271 ],
      2012: [ 88, 277 ]
    };

    var seasons = Object.keys(ranges).map(Number);

    function precision(n, p) {
      return Math.floor(n * p) / p;
    }

    function normalizeDay(dayOfYear, season) {
      var range = ranges[season];

      if (!range) { throw new Error('Unknown Season: ' + season); }

      var start = range[0];
      var end = range[1];

      var totalGameDaysInSeason = end - start;
      var normalizedGameDay = dayOfYear - start;

      return normalizedGameDay;
    }

    function percentageOfSeason(dayOfYear, season) {
      var range = ranges[season];

      if (!range) { throw new Error('Unknown Season: ' + season); }

      var start = range[0];
      var end = range[1];

      var totalGameDaysInSeason = end - start;
      var normalizedGameDay = normalizeDay(dayOfYear, season);

      return precision(normalizedGameDay / totalGameDaysInSeason, 100);
    }

    function percentageOfData(dayOfYear, season) {
      var range = ranges[season];
      if (!range) { throw new Error('Unknown Season: ' + season); }

      var index = seasons.indexOf(season);
      var normalizedGameDay = normalizeDay(dayOfYear, season);

      var proportion = ((index * 180) + normalizedGameDay) / 1108;
      return precision(proportion, 100);
    }


    __exports__.percentageOfSeason = percentageOfSeason;
    __exports__.percentageOfData = percentageOfData;
    __exports__.precision = precision;
  });
define("appkit/views/filter",
  [],
  function() {
    "use strict";
    var FilterView = Ember.View.extend({
      elementId: 'filter-view'
    });


    return FilterView;
  });
define("appkit/ziggrid/connection_manager",
  ["appkit/ziggrid/generator","appkit/ziggrid/observer","appkit/ziggrid/watcher","appkit/flags","zinc"],
  function(Generator, Observer, watcher, flags, zinc) {
    "use strict";

    var ConnectionManager = Ember.Object.extend({
      url: null,

      // Reference to the global app namespace where we'll be installing
      // dynamically generated DS.Model classes
      namespace: null,
  
      requestor: null,

      establishConnection: function() {

        var self = this;

        this.generators = {};
        this.observers = {};

        var servers = [];
        zinc.newRequestor("/ziggrid").then(function(req) {
          self.requestor = req;
          req.subscribe("models", function(msg) {
            self.processModels(msg.models);
          }).send();
          req.subscribe("servers", function(msg) {
            servers.push(msg);
            Ember.run.throttle(self, 'flushServers', servers, 150);  
          }).send();
        });
      }.on('init'),

      processModels: function(models) {
        while (models.length) {
          var body = models.shift();
          this.registerModel(body.modelName, body.model);
        }
        this.modelsRead();
      },

      flushServers: function(messages) {
        while (messages.length) {
          var body = messages.shift().servers[0];
          var endpoint = body.endpoint,
          addr = 'http://' + endpoint + '/ziggrid/',
          server = body.server;

          if (flags.LOG_WEBSOCKETS) {
            console.log('Have new ' + server + ' server at ' + endpoint);
          }
          this.registerServer(server, addr);
        }
      },

    /*
      handleMessage: function(msg) {
        if (msg.status === 200) {

          if (flags.LOG_WEBSOCKETS) {
            console.log('Received message ' + msg.responseBody);
          }

          var body = JSON.parse(msg.responseBody);

          if (body['error']) {
            console.error(body['error']);
          } else if (body['modelName']) {
            this.registerModel(body.modelName, body.model);
          } else if (body['server']) {
            var endpoint = body.endpoint,
            addr = 'http://' + endpoint + '/ziggrid/',
            server = body.server;

            if (flags.LOG_WEBSOCKETS) {
              console.log('Have new ' + server + ' server at ' + endpoint);
            }
              console.log('Have new ' + server + ' server at ' + endpoint);
            this.registerServer(server, addr);

          } else if (body['status']) {
            var stat = body['status'];
            if (stat === 'modelsSent') {
              this.modelsRead();
            } else {
              console.log('Do not recognize ' + stat);
            }
          } else
            console.log('could not understand ' + msg.responseBody);
        } else {
          console.log('HTTP Error:', msg.status);
          //if (callback && callback.error)
          //callback.error('HTTP Error: ' + msg.status);
        }
      },
    */

      registerModel: function(name, model) {
        var attrs = {};
        for (var p in model) {
          if (!model.hasOwnProperty(p)) { continue; }

          var type = model[p];
          if (type.rel === 'attr') {
            attrs[p] = DS.attr(type.name);
          } else if (type.rel === 'hasMany') {
            attrs[p] = DS.hasMany('App.' + type.name.capitalize());
          } else {
            console.log('Unknown type:', type);
          }
        }

        var newClass = DS.Model.extend(attrs);
        newClass.reopenClass({
          model: model
        });

        this.namespace[name] = newClass;
      },

      registerServer: function(server, addr) {
        var self = this;
        console.log(server + " " + addr);
        if (server === 'generator') {
          if (!this.generators[addr]) {
            this.generators[addr] = Generator.create(this, addr, function(gen, newConn) {
              var player = self.container.lookup('bean-player:main');
              if (player.get('isPlaying')) {
                gen.start();
              } else {
                gen.stop();
              }
            });
          }
        } else if (server === 'ziggrid') {
          if (!this.observers[addr]) {
            var obsr = this.observers[addr] = Observer.create(this, addr, function(newConn) {
              self.observers[addr] = newConn;
              var watcher = self.container.lookup('watcher:main');
              watcher.newObserver(addr, newConn); 
            });
          }
        }
      },
  
      deregisterGenerator: function(addr) {
        console.log("Removing ", addr, " from generators: ", this.generators);
        delete this.generators[addr];
        console.log("Remaining generators: ", this.generators);
      },

      deregisterObserver: function(addr) {
        console.log("Removing ", addr, " from observers: ", this.observers);
        var watcher = this.container.lookup('watcher:main');
        watcher.deadObserver(addr); 
        delete this.observers[addr];
        console.log("Remaining observers: ", this.observers);
      },

      modelsRead: function() {
        window.App.advanceReadiness();
      }
    });


    return ConnectionManager;
  });
define("appkit/ziggrid/generator",
  ["appkit/flags","zinc"],
  function(flags, zinc) {
    "use strict";

    function Generator(mgr, addr, callback) {
      var self = this;
      zinc.newRequestor(addr).then(function(req) {
        self.requestor = req;
      });
    }

    Generator.prototype = {
      hasSetDelay: false,

      send: function(msg) {
        if (flags.LOG_WEBSOCKETS) {
          console.log('Sending generator message', msg);
        }
        this.conn.push(msg);
      },

      start: function() {
        if (!this.hasSetDelay) {
          // Don't overload the generator; give it a moderate delay the first time.
          // This is only needed if the system can't keep up; don't use it everywhere
          // this.setDelay(20);
          this.hasSetDelay = true;
        }

        this.requestor.invoke("generator/start").send();
      },

      stop: function() {
        this.requestor.invoke("generator/stop").send();
      },

      setDelay: function(ms) {
        this.requestor.invoke("generator/setDelay").setOption("delay", ms).send();
      }
    };

    Generator.create = function(mgr, url, callback) {
      return new Generator(mgr, url, callback);
    };



    return Generator;
  });
define("appkit/ziggrid/observer",
  ["appkit/flags","zinc"],
  function(flags, zinc) {
    "use strict";

    function Observer(mgr, addr, callback) {
      var url = addr + 'ziggrid';

      if (flags.LOG_WEBSOCKETS) {
        console.log('Observer connecting at ' + url);
      }

      var self = this;
      zinc.newRequestor(url).then(function(req) {
        self.requestor = req;
        callback(req);
      });
    }

    Observer.create = function(mgr, url, callback) {
      return new Observer(mgr, url, callback);
    };


    return Observer;
  });
define("appkit/ziggrid/watcher",
  ["appkit/flags"],
  function(flags) {
    "use strict";

    var container;

    function Loader(type, entryType, id) {
      var store = container.lookup('store:main');

      this.update = type === entryType ? updateIndividualThing : updateTabularData;

      function updateTabularData(body) {
        for (var p in body) {
          if (body.hasOwnProperty(p) && typeof(body[p]) === 'object') {
            body = body[p][0];
            var table = body['table'];
            var rows = [];

            for (var i = 0; i < table.length; i++) {
              var item = table[i];

              var attrs = {};
              attrs[Ember.keys(entryType.model)[0]] = item[0];

              store.load(entryType, item[1], attrs);
              rows.push(item[1]);
            }

            store.load(type, id, {
              table: rows
            });
            return;
          }
        }
      }

      function updateIndividualThing(body) {
        for (var p in body) {
          if (body.hasOwnProperty(p) && typeof(body[p]) === 'object') {
            body = body[p][0];
            body.handle_id = id;
            store.load(type, id, body);
            return;
          }
        }
      }
    }

    function subscribe(observer, hash) {
      var req = observer.subscribe("watch/"+hash.watch, hash.callback);
      if (hash.opts) {
        for (var opt in hash.opts) {
          if (hash.opts.hasOwnProperty(opt))
            req.setOption(opt, hash.opts[opt]);
        }
      }
      req.send();
      if (!hash.subscriptions)
        hash.subscriptions = [];
      hash.subscriptions.push(req);
    }
 
    function Watcher(_namespace) {
      this.namespace = _namespace;
      container = this.container = _namespace.__container__;
    }

    var gameDates = [];
    var randomId = 1;

    Watcher.prototype = {
      observers: {},
      watching: [],
      newObserver: function(addr, obsr) {
        this.observers[addr] = obsr;
        for (var u=0;u<this.watching.length;u++) {
          var hash = this.watching[u];
          subscribe(obsr, hash);
        }
      },
      deadObserver: function(addr) {
        delete this.observers[addr];
      },
      watchGameDate: function() {
        var query = {
          watch: 'GameDate',
          callback: function(o) { gameDates.pushObject(o.gameDates[0]); }
        };

        this.sendToCurrentObservers(query);
        this.watching.push(query);

        //this.sendFakeGameDates();

        return gameDates;
      },

      keepSendingGameDates: false,
      sendFakeGameDates: function() {

        if (this.keepSendingGameDates) {
          gameDates.pushObject({
            day: gameDates.length
          });
        }

        Ember.run.later(this, 'sendFakeGameDates', 400);
      },

      watchProfile: function(player, season, callback) {
        var opts = {
          player: player,
          season: "" + season
        };
  
        return this.watch('Profile', 'Profile', opts, function(ja) { callback(ja['profiles'][0]); });
      },

      watch: function(typeName, entryTypeName, opts, updateHandler) {
        var type = this.namespace[typeName]; // ED limitation
        var entryType = this.namespace[entryTypeName];
        var store = container.lookup('store:main');

    // The use of "handle" here is left over from before
    // I think we should want this passed in, possibly with the whole model
        var handle = ++randomId;
        store.load(type, handle, {});
        var model = store.find(type, handle);

        var hash = {
          watch: typeName,
          opts: opts,
          callback: updateHandler ? updateHandler :
                    new Loader(type, entryType, model.get('id'), opts).update
        };

        // Send the JSON message to the server to begin observing.
        this.sendToCurrentObservers(hash);
        this.watching.push(hash);

        return {"model": model, "handle": handle, "hash": hash};
      },

      unwatch: function(hash) {
        for (var i=0;i<hash.subscriptions.length;i++)
          hash.subscriptions[i].unsubscribe();
        var idx = this.watching.indexOf(hash);
        this.watching.splice(idx, 1); 
      },
  
      sendToCurrentObservers: function(hash) {
        if (flags.LOG_WEBSOCKETS) {
          console.log('watching', hash.watch, 'from', this.observers);
        }

        for (var u in this.observers) {
          if (this.observers.hasOwnProperty(u)) {
            subscribe(this.observers[u], hash);
          }
        }
      }
    };

    return Watcher;
  });
//@ sourceMappingURL=app.js.map
