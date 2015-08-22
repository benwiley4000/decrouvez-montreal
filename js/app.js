/*
 * Ben Wiley
 * 2015
 *
 * Google map initialization based in part on sample
 * code found at https://goo.gl/GsKXwE and at
 * https://goo.gl/2a9tjC
 * 
 * Marker search implementation based on sample code
 * found at https://goo.gl/bzucGh
 * 
 * Street view overlay implementation based on sample
 * code found at https://goo.gl/7PjIy4
 *
 * Search box knockout binding based on code found in
 * StackOverflow answer at http://goo.gl/70ntzo
 * 
 * MediaWiki API Docs can be found at https://goo.gl/fBmxYC
 * 
 */

var PLACE_NAME = "San Francisco, California";
var GM = google.maps;
var MAP = new GM.Map(document.getElementById('map-canvas'));
var PANO = MAP.getStreetView();
var PLACES = new GM.places.PlacesService(MAP);
var STREET_VIEW = new google.maps.StreetViewService();
var ZOOM = 10;

// adds mapData to localStorage
function store(mapData) {
	// deep copies data
	dataCopy = JSON.parse(JSON.stringify(mapData));

	// list didn't copy; unwraps it for storage
	dataCopy.list = mapData.list();

	// stores data
	localStorage.mapData = JSON.stringify(dataCopy);
};

// initializes 'mapData' using localStorage if available
function initModel() {
	var mapData;
	if(localStorage.mapData) {
		// pulls data from localStorage
		mapData = JSON.parse(localStorage.mapData);

		// converts LatLng literal back to LatLng class instance
		function convertLoc(loc) {
			return new GM.LatLng(loc.G, loc.K);
		}

		// converts object literal back to LatLngBounds class instance
		function convertViewport(v) {
			// LatLngBounds (viewport) is accessed
			// via E/W and S/N boundary pairs, but
			// it can only be specified by SW and
			// NE coordinate pairs

			// construct SW coordinate pair from S
			// bound line (Ia.G) and W bound (Ca.j)
			var sw = new GM.LatLng(v.Ia.G, v.Ca.j);
			// construct NE coordinate pair from N
			// bound line (Ia.j) and E bound (Ca.G)
			var ne = new GM.LatLng(v.Ia.j, v.Ca.G);
			// construct new LatLngBounds from the
			// coordinate pairs
			return new GM.LatLngBounds(sw, ne);
		}

		// converts geometry object descendants back to
		// appropriate class instances
		function convertGeometry(g) {
			return {
				location: convertLoc(g.location),
				viewport: convertViewport(g.viewport)
			};
		}
		
		// calls convert on centerData and each place's geometry object
		mapData.centerData = convertGeometry(mapData.centerData);
		for(var i = 0; i < mapData.list.length; i++) {
			var place = mapData.list[i];
			place.location = convertLoc(place.location);
		}
		
		// converts plain array to observableArray
		mapData.list = ko.observableArray(mapData.list);
	} else {
		// creates new mapData object
		mapData = {
			placeName: PLACE_NAME,
			list: ko.observableArray()
		};

		// puts mapData into localStorage
		store(mapData);
	}
	return mapData;
};

// the ViewModel
function ViewModel() {
	var self = this;

	// either initializes new mapData object, or pulls one from localStorage
	self.mapData = initModel();

	// initializes empty search string
	self.searchText = ko.observable("");

	// indicates whether loading is in process
	self.loading = ko.observable(false);


	// initializes empty array of Marker objects
	self.markers = [];

	// initializes empty observableArray of (selected)
	// Marker objects with shallow copy of markers array
	self.selectedMarkers =
		ko.observableArray(self.markers.slice(0));

	// filters markers visible on map each time
	// array contents change
	self.selectedMarkers.subscribe(function(data) {
		self.markers.forEach(function(marker) {
			marker.setMap(null);
		});
		data.forEach(function(marker) {
			marker.setMap(MAP);
		});
	});

	// initializes current AJAXWindow as null
	self.currWindow = null;

	// when called, adds a new place to mapData.list
	self.addPlace = function(name, place_id, location) {
		var list = self.mapData.list;
		var num = 1;
		// id n belongs to nth place with same name
		list().forEach(function(place) {
			if(place.name === name) num++;
		});
		self.mapData.list.push({
			"name": name,
			"num": num,
			"place_id": place_id,
			"location": location
		});
		self.updateStorage();
	};

	// when called, removes all places with given place_id
	self.removePlace = function(place_id) {
		self.mapData.list.remove(function(place) {
			return place.place_id === place_id;
		});
		self.updateStorage();
	};

	// called when the Enter key is pressed on search
	self.onEnter = function(d, e) {
		if(e.keyCode === 13) { // enter
			self.filter();
		}
		return true;
	};

	// called to filter markers based on current
	// search text
	self.filter = function() {
		if(!self.markers.length) {
			// returns if there are no markers to filter
			return;
		} else if(self.searchText() === "") {
			// don't filter without a query
			self.selectedMarkers(self.markers);
		} else {
			// starts with no matches
			self.selectedMarkers([]);
			// indicates loading has started
			self.loading(true);
			// searches for matches
			PLACES.radarSearch({
				keyword: self.searchText(),
				bounds: self.mapData.centerData.viewport
			}, matchData);
		}
	}

	// sifts through radar search results and
	// adds existing markers with matches to
	// selectedMarkers observableArray
	function matchData(results, status) {
		// if search status is bad, returns
		if(status !== GM.places.PlacesServiceStatus.OK) {
			return;
		}
		// otherwise, continues
		self.markers.forEach(function(marker) {
			var matched = false;
			for(var i = 0; !matched && i < results.length; i++) {
				// if Place IDs match, adds marker
				// to selected marker array
				if(results[i].place_id === marker.place.placeId) {
					self.selectedMarkers.push(marker);
					matched = true;
				} else {
					var _name = marker.getTitle().toLowerCase();
					var _search = self.searchText().toLowerCase();
					// check if searchText is substring
					// of marker place name
					if(_name.indexOf(_search) > -1) {
						self.selectedMarkers.push(marker);
						matched = true;
					}
				}
			}
		});
		// indicates loading is finished
		self.loading(false);
	}

	// when called, returns true if given place is already
	// pinned on map, false otherwise
	self.pinned = function(place_id) {
		var list = self.mapData.list();
		for(var i = 0; i < list.length; i++) {
			if(list[i].place_id === place_id) {
				return true;
			}
		}
		return false;
	};

	// saves current state of mapData to localStorage
	self.updateStorage = function() {
		store(self.mapData);
	};
};

// specifies custom binding for map
ko.bindingHandlers.map = {
	// called to initialize the map
	init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
		// gets the mapData object
		var mapData = valueAccessor();

		// gets the ViewModel instance
		var vm = bindingContext.$data;

		// if map center data exists, go ahead and initialize
		if(mapData.centerData) {
			MAP.setOptions({
				center: mapData.centerData.location,
				zoom: ZOOM,
				disableDefaultUI: true
			});
			// set up the search bar
			searchSetUp();
			// show the sidebar
			$('#sidebar').show();
		}

		// otherwise, data is searched for
		else {
			// callback function (invoked below) sets up initial map properties
			function mapSetUp(results, status) {
				if(status === GM.places.PlacesServiceStatus.OK) {
					mapData.centerData = results[0].geometry;
					vm.updateStorage();
					MAP.setOptions({
						center: mapData.centerData.location,
						zoom: ZOOM,
						disableDefaultUI: true
					});
					// set up the search bar
					searchSetUp();
					// show the sidebar
					$('#sidebar').show();
				}
			};

			// searches with name of map center and initializes rest of map data
			PLACES.textSearch({query: mapData.placeName}, mapSetUp);
		}

		// sets up the search bar on the map
		function searchSetUp() {
			var input = document.getElementById('pac-input');
			window.searchBox = new GM.places.SearchBox(input);
			MAP.controls[GM.ControlPosition.TOP_LEFT].push(input);
			searchBox.setBounds(mapData.centerData.viewport);
			
			// clicking on map causes search to lose focus
			$('#pac-input').click(function(e) {
				// won't apply to clicking on input box itself
				e.stopPropagation();
			});
			$('#map-canvas').click(function() {
				$('#pac-input').blur();
			});
			
			// initializes empty array of marker results
			var resultsList = [];
			// listens for changes in the searchbox places
			searchBox.addListener('places_changed', function() {
				var places = searchBox.getPlaces();

				// returns if there are no results
				if (places.length === 0) {
					return;
				}

				// removes old markers
				resultsList.forEach(function(marker) {
					marker.setMap(null);
				});
				resultsList = [];

				// closes the open InfoWindow (if open)
				if(vm.currWindow) {
					vm.currWindow.close();
				}

				// for each place, gets the icon, name and location
				places.forEach(function(place) {
					// only run if this location is not already pinned
					if(vm.pinned(place.place_id)) {
						return;
					}

					var icon = {
						url: place.icon,
						anchor: new GM.Point(17, 34),
						scaledSize: new GM.Size(25, 25)
					};

					// creates a marker for each place
					var marker = new GM.Marker({
						"map": MAP,
						"icon": icon,
						"title": place.name,
						"place": {
							"location": place.geometry.location,
							"placeId": place.place_id
						}
					});

					// creates info window
					marker.infoWindow = new AJAXWindow(marker, vm, resultsList);

					// adds marker to temp list
					resultsList.push(marker);
				});
			});
		}
	},

	// called whenever entries are added or subtracted from marker data list
	update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
		// gets the list of place data
		var list = valueAccessor().list();

		// gets the ViewModel instance
		var vm = bindingContext.$data;

		// gets the Markers array
		var markers = vm.markers;

		// adds markers, if there are more data entries than markers
		if(list.length > markers.length) {
			for(var i = markers.length; i < list.length; i++) {
				var place = list[i];

				// creates marker
				var marker = new GM.Marker({
					"icon": "images/marker.png",
					"title": place.name,
					"place": {
						"location": place.location,
						"placeId": place.place_id
					}
				});

				// creates info window
				marker.infoWindow = new AJAXWindow(marker, vm);

				// adds place data as property of marker
				marker.data = place;

				// adds marker to lists
				markers.push(marker);
				vm.selectedMarkers.push(marker);
			}
		}

		// otherwise, if there are more markers, searches for marker to delete
		else if(list.length < markers.length) {
			for(var i = 0; i < markers.length; i++) {
				var place = list[i];
				var marker = markers[i];
				if(!place || place.place_id !== marker.getPlace().placeId) {
					marker.setMap(null);
					markers.splice(i, 1);
					vm.selectedMarkers.remove(marker);
					return;
				}
			}
		}
	}
};

// AJAXWindow class contains infoWindow, multiple content
// views, current view, methods for switching views
function AJAXWindow(marker, vm, parentList) {
	this.marker = marker;
	this.viewModel = vm;
	if(parentList) {
		this.parentList = parentList;
		this.isTemp = true;
	} else {
		this.isTemp = false;
	}

	var name = marker.getTitle();

	// initializes infoWindow content div
	var $windowContent = $('<div class="window-content">');

	// appends infoWindow header
	$windowContent.append('<h3>' + name + '</h3>');

	// appends API content navigation arrows
	this.$leftNav = $('<div class="move-left">');
	$windowContent.append(this.$leftNav);
	this.$rightNav = $('<div class="move-right">');
	$windowContent.append(this.$rightNav);

	// appends empty loaded content div
	var $loadedContent = $('<div class="loaded-content">');
	$windowContent.append($loadedContent);

	// if this infoWindow belongs to a temp marker,
	// adds option to add it to the map permanently
	if(this.isTemp) {
		var $addMarker = $('<div class="add-marker">');
		$addMarker.html('+ Add marker to map');
		$windowContent.append($addMarker);
	}

	// initializes infoWindow with initial content
	this.infoWindow = new GM.InfoWindow();

	// set to true until mouse enter/exit listeners added
	this.isNew = true;

	// declares observable loaded API type
	this.loadedAPI = ko.observable();

	// sets timeout that will be cleared when any
	// APIs are loaded
	var noAPI = setTimeout(function() {
		// replace loaded content with message
		// saying no relevant info was found
		var msg = '<p class="pending"><i>No relevant information found.</i></p>';
		$loadedContent.html(msg);
		this.infoWindow.setContent($windowContent[0]);
	}.bind(this), 3000);
	
	// resets window content each time loadedAPI changes
	this.loadedAPI.subscribe(function(newAPI) {
		// sets new content
		var newContent;
		if(newAPI) {
			// removes timeout and sets new content
			clearTimeout(noAPI);
			newContent = this.contentBlocks[newAPI];
		} else {
			// sets content as loading message
			newContent = '<p class="pending"><i>Place data loading...</i></p>';
		}
		// adds content to loaded-content div
		$loadedContent.html(newContent);
		// resets infoWindow content
		this.infoWindow.setContent($windowContent[0]);
		// checks if the window is currently open
		if(this.isOpen()) {
			// if so, adds relevant listeners
			this.addListeners();
		} else {
			// marks window as "fresh" so listeners
			// will be added on launch
			this.fresh = true;
		}
	}.bind(this));
	
	// initializes empty third-party API content blocks
	// (contents change after completion of AJAX calls)
	this.contentBlocks = {
		streetview: null,
		yelp: null,
		wiki: null,
		flickr: null
	};

	// initializes loaded API type as null
	this.loadedAPI(null);

	// ajax calls
	//
	// ...
	//
	// ...
	this.fetchStreetView();
	this.fetchWikipedia();

	// listens for marker click, triggers windowSwap
	var self = this;
	GM.event.addListener(marker, 'click', function() {
		AJAXWindow.windowSwap(self);
	});
}
// opens infoWindow
AJAXWindow.prototype.open = function() {
	this.infoWindow.open(MAP, this.marker);
};
// closes infoWindow
AJAXWindow.prototype.close = function() {
	this.infoWindow.close();
};
// returns true if infoWindow is open, false otherwise
AJAXWindow.prototype.isOpen = function() {
    var map = this.infoWindow.getMap();
    return map !== null && typeof map !== "undefined";
};
// launches infoWindow, sets it as current and adds
// listeners if necessary
AJAXWindow.prototype.launch = function() {
	this.open();
	this.viewModel.currWindow = this;
	if(this.fresh) {
		this.addListeners();
		this.fresh = false;
	}
};
// selects API content block to the left in
// this.contentBlocks
AJAXWindow.prototype.moveLeft = function() {
	this.move(-1);
};
// selects API content block to the right in
// this.contentBlocks
AJAXWindow.prototype.moveRight = function() {
	this.move(1);
};
// loads the API content at 'offset' places
// away from the current content in this.contentBlocks
AJAXWindow.prototype.move = function(offset) {
	// fetches loaded keys array
	var loaded = this.getLoadedKeys();
	// uses the current index to find the index of
	// the new selected API type
	var currIndex = loaded.indexOf(this.loadedAPI());
	var newIndex = currIndex + offset;
	if(newIndex >= loaded.length) {
		newIndex -= loaded.length;
	} else if(newIndex < 0) {
		newIndex += loaded.length;
	}
	// loads the key at the selected index
	this.loadedAPI(loaded[newIndex]);
};
// returns new array only with loaded keys
AJAXWindow.prototype.getLoadedKeys = function() {
	var loaded = [];
	for(var key in this.contentBlocks) {
		if(this.contentBlocks[key]) {
			loaded.push(key);
		}
	}
	return loaded;
};
// launches streetview at the infoWindow's location
AJAXWindow.prototype.launchStreetView = function() {
	var location = this.marker.place.location;
	PANO.setVisible(true);
	PANO.setPosition(location);
	PANO.setPov({
		heading: 270,
		pitch: 0
	});
};
// checks to see if display status should be changed
// for navigation arrows
AJAXWindow.prototype.checkNavigation = function() {
	if(this.getLoadedKeys().length >= 2) {
		this.$leftNav.css("display", "initial");
		this.$rightNav.css("display", "initial");
	} else {
		this.$leftNav.css("display", "none");
		this.$rightNav.css("display", "none");
	}
};
// adds relevant listeners
AJAXWindow.prototype.addListeners = function() {
	var marker = this.marker;
	var vm = this.viewModel;
	var markerPlace = marker.getPlace();
	var name = marker.getTitle();
	var place_id = markerPlace.placeId;
	var location = markerPlace.location;
	var self = this;

	// disables map zooming/dragging inside InfoWindow
	// based on solution found at http://goo.gl/dDtIrh
	if(this.isNew) {
		$(".gm-style-iw").mouseenter(function() {
			MAP.setOptions({
				draggable: false,
				scrollwheel: false
			});
		});
		$(".gm-style-iw").mouseleave(function() {
			MAP.setOptions({
				draggable: true,
				scrollwheel: true
			});
		});
		this.isNew = false;
	}

	// adds click handler for add-marker button if
	// this is a temp marker
	if(this.isTemp === true) {
		var parentList = this.parentList;
		// checks for events on add-marker div
		var addMarkerEvents = $._data($('.add-marker:last')[0], 'events');
		// if none, adds new add-marker click handler
		if(!addMarkerEvents) {
			$('.add-marker:last').click(function() {
				vm.addPlace(name, place_id, location);
				marker.setMap(null);
				parentList.splice(parentList.indexOf(marker), 1);
				// re-enables dragging and zooming, which
				// have been disabled upon entering the
				// infowindow to select this option
				MAP.setOptions({
					draggable: true,
					scrollwheel: true
				});
			});
		}
	}

	// checks for events on nav arrows
	var navEvents = $._data(this.$leftNav[0], 'events');
	// if none, adds navigation arrow click listeners
	if(!navEvents) {
		this.$leftNav.click(function() {
			self.moveLeft();
		});
		this.$rightNav.click(function() {
			self.moveRight();
		});
	}

	// adds listeners relevant to the loaded API
	var api = this.loadedAPI();
	if(!api) return;
	if(api === "streetview") {
		// checks for events on streetview preview
		var streetViewEvents = $._data($('.streetview:last')[0], 'events');
		// if none, adds streetview click listener
		if(!streetViewEvents) {
			$('.streetview:last').click(function() {
				self.launchStreetView();
			});
		}
	} else if(api === "yelp") {
		console.log(api);
	} else if(api === "wiki") {
		//console.log(api);
	} else if(api === "flickr") {
		console.log(api);
	}
};
// fetches street view data, and if successful
// adds it to infowindow
AJAXWindow.prototype.fetchStreetView = function() {
	var marker = this.marker;
	var loc = marker.getPlace().location;
	var lat = loc.lat();
	var lng = loc.lng();

	var self = this;
	// callback invoked below
	function processSVData(data, status) {
		// exits now if status isn't OK
		if(status !== GM.StreetViewStatus.OK) {
			return;
		}
		// otherwise, loads streetview
		self.contentBlocks.streetview =
			'<div class="streetview">' +
			'<img title="Google Street View"' +
			'src="https://maps.googleapis.com/maps/api/streetview?' +
			'size=300x130&location=' +
			lat + ',' + lng +
			'"></div>';
		self.loadedAPI("streetview");
        // displays navigation arrows if necessary
        self.checkNavigation();
	}

	// Checks for valid panorama then passes control
	// to callback
	STREET_VIEW.getPanorama({
		location: loc,
		radius: 50
	}, processSVData);
};
// fetches wikipedia data, and if successful
// adds it to infowindow
AJAXWindow.prototype.fetchWikipedia = function() {
	var name = this.marker.getTitle();

	var self = this;
	// wikipedia data callback invoked below
	function processWikiData(data) {
		// exits now if no articles were returned.
		if(data[1].length === 0) {
			return;
		}
        var titles = data[1];
        var links = data[3];

		var $wikiContent = $('<div class="wiki">');
		$wikiContent.append('<div class="content-title">Wikipedia Results</div>');
		$list = $('<div class="wiki-list">');
		$wikiContent.append($list);

        // fills list with articles
        for(var i = 0; i < links.length; i++) {
            var title = titles[i];
            var link = links[i];
            $entry = $('<div>');
            $entry.append('<a href="' +
				link + '" target="_blank">' +
				title + '</a>');
            $list.append($entry);
        }

        // loads streetview
        self.contentBlocks.wiki = $wikiContent[0].outerHTML;
        // displays navigation arrows if necessary
        self.checkNavigation();
	}

	// querys wikipedia for data relevant to place name
	$.ajax({
        url: 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' +
        	name +
        	'&format=json&callback=wikiCallback',
        dataType: 'jsonp',
        success: processWikiData
    });
};
// opens specified window and closes last, if open
AJAXWindow.windowSwap = function(thisWindow) {
	var vm = thisWindow.viewModel;
	if(vm.currWindow && vm.currWindow.isOpen()) {
		// closes current window
		vm.currWindow.close();
		// checks if this is last-opened window
		if(thisWindow !== vm.currWindow) {
			// if not, launches window
			thisWindow.launch();
		}
	} else {
		// launches window
		thisWindow.launch();
	}
};
// sets streetview to invisible
AJAXWindow.hideStreetView = function() {
	PANO.setVisible(false);
};

var viewModel = new ViewModel();
ko.applyBindings(viewModel);