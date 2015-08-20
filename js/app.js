var PLACE_NAME = "New York City, New York";
var GM = google.maps;
var MAP = new GM.Map(document.getElementById('map-canvas'));
//var PANO = new GM.StreetViewPanorama(document.getElementById('pano'));
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

	// initializes empty array of Marker objects.
	self.markers = [];

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
	}

	// saves current state of mapData to localStorage
	self.updateStorage = function() {
		store(self.mapData);
	}
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
						zoom: ZOOM
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
			var searchBox = new GM.places.SearchBox(input);
			MAP.controls[GM.ControlPosition.TOP_LEFT].push(input);
			searchBox.setBounds(mapData.centerData.viewport);
			
			// clicking on map causes search to lose focus
			$('#pac-input').click(function(e) {
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

				if (places.length === 0) {
					return;
				}

				// removes old markers
				resultsList.forEach(function(marker) {
					marker.setMap(null);
				});
				resultsList = [];

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
					"map": MAP,
					"icon": "images/marker.png",
					"title": place.name,
					"place": {
						"location": place.location,
						"placeId": place.place_id
					}
				});

				// creates info window
				marker.infoWindow = new AJAXWindow(marker, vm);

				// adds marker to permanent list
				markers.push(marker);
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

	// appends empty loaded content div
	var $loadedContent = $('<div class="loaded-content">');
	$windowContent.append($loadedContent);

	// if this infoWindow belongs to a temp marker,
	// adds option to add it to the map permanently
	if(this.isTemp) {
		var $addMarker = $('<div class="add-marker">');
		$addMarker.html('+ Add <strong>' + name + '</strong> to map');
		$windowContent.append($addMarker);
	}

	// initializes infoWindow with initial content
	this.infoWindow = new GM.InfoWindow();

	// declares observable loaded API type
	this.loadedAPI = ko.observable();

	// sets timeout that will be cleared when any
	// APIs are loaded
	var noAPI = setTimeout(function() {
		// replace loaded content with message
		// saying no relevant info was found
		var msg = '<p><i>No relevant information found.</i></p>';
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
			newContent = '<p><i>Place data loading...</i></p>';
		}
		// adds content to loaded-content div
		$loadedContent.html(newContent);
		// resets infoWindow content
		this.infoWindow.setContent($windowContent[0]);
		// marks window as "fresh" so listeners
		// will be added on launch
		this.fresh = true;
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
// adds relevant listeners
AJAXWindow.prototype.addListeners = function() {
	var marker = this.marker;
	var vm = this.viewModel;
	var markerPlace = marker.getPlace();
	var name = marker.getTitle();
	var place_id = markerPlace.placeId;
	var location = markerPlace.location;

	// adds click handler for add-marker button if
	// this is a temp marker
	if(this.isTemp === true) {
		var parentList = this.parentList;
		$('.add-marker:last').click(function() {
			vm.addPlace(name, place_id, location);
			marker.setMap(null);
			parentList.splice(parentList.indexOf(marker), 1);
		});
	}

	// adds listeners relevant to the loaded API
	var api = this.loadedAPI();
	if(!api) return;
	var self = this;
	if(api === "streetview") {
		$('.streetview:last').click(function() {
			self.launchStreetView();
		});
	} else if(api === "yelp") {
		console.log(api);
	} else if(api === "wiki") {
		console.log(api);
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
			'<div><img class="streetview"' +
			'src="https://maps.googleapis.com/maps/api/streetview?' +
			'size=300x130&location=' +
			lat + ',' + lng +
			'"></div>';
		self.loadedAPI("streetview");
		console.log(self);
	}

	// Checks for valid panorama then passes control
	// to callback
	STREET_VIEW.getPanorama({
		location: loc,
		radius: 50
	}, processSVData);
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