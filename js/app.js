var PLACE_NAME = "Montreal, Quebec, Canada";
var GM = google.maps;
var MAP = new GM.Map(document.getElementById('map-canvas'));
var SERVICE = new GM.places.PlacesService(MAP);
var ZOOM = 10;

// adds mapData to localStorage
var store = function(mapData) {
	// deep copies data
	dataCopy = JSON.parse(JSON.stringify(mapData));

	// list didn't copy; unwraps it for storage
	dataCopy.list = mapData.list();

	// stores data
	localStorage.mapData = JSON.stringify(dataCopy);
};

// initializes 'mapData' using localStorage if available
var initModel = function() {
	var mapData;
	if(localStorage.mapData) {
		// pulls data from localStorage
		mapData = JSON.parse(localStorage.mapData);

		// converts object literals back to LatLng objects
		var convert = function(geometry) {
			var loc = geometry.location;
			loc = new GM.LatLng(loc.G, loc.K);
			var view = geometry.viewport;
			var sw = new GM.LatLng(view.Ia.G, view.Ca.j);
			var ne = new GM.LatLng(view.Ca.G, view.Ia.j);
			view = new GM.LatLngBounds(sw, ne);
			return {
				location: loc,
				viewport: view
			};
		}
		
		// calls convert on centerData and each place's geometry object
		mapData.centerData = convert(mapData.centerData);
		for(var i = 0; i < mapData.list.length; i++) {
			var place = mapData.list[i];
			place.geometry = convert(place.geometry);
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
var ViewModel = function() {
	var self = this;

	// either initializes new mapData object, or pulls one from localStorage
	self.mapData = initModel();

	// initializes empty array of Marker objects.
	self.markers = [];

	// when called, adds a new place to mapData.list
	self.addPlace = function(name, placeId, geometry) {
		self.mapData.list.push({
			"name": name,
			"placeId": placeId,
			"geometry": geometry
		});
		self.updateStorage();
	};

	// when called, removes all places with the given placeId property
	self.removePlace = function(placeId) {
		self.mapData.list.remove(function(place) {
			return place.placeId === placeId;
		});
		self.updateStorage();
	};

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

		// if map center data exists, go ahead and initialize
		if(mapData.centerData) {
			MAP.setOptions({
				center: mapData.centerData.location,
				zoom: ZOOM
			});
			document.getElementById('sidebar').style.display = "initial";
		}

		// otherwise, data is searched for
		else {
			// callback function (invoked below) sets up initial map properties
			var mapSetUpCallback = function(results, status) {
				if(status === GM.places.PlacesServiceStatus.OK) {
					mapData.centerData = results[0].geometry;
					bindingContext.$data.updateStorage();
					MAP.setOptions({
						center: mapData.centerData.location,
						zoom: ZOOM
					});
					document.getElementById('sidebar').style.display = "initial";
				}
			};

			// searches with name of map center and initializes rest of map data
			SERVICE.textSearch({query: mapData.placeName}, mapSetUpCallback);
		}
	},

	// called whenever entries are added or subtracted from marker data list
	update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
		// gets the list of place data
		var list = valueAccessor().list();

		// gets the Markers array
		var markers = bindingContext.$data.markers;

		// adds a marker, if there are more data entries than markers
		if(list.length > markers.length) {
			var place = list[list.length - 1];
			markers.push(new GM.Marker({
				"map": MAP,
				"place": {
					"location": place.geometry.location,
					"placeId": place.placeId
				},
				"title": place.name,
				"icon": "images/marker.png"
			}));
		}

		// otherwise, if there are more markers, searches for marker to delete
		else if(list.length < markers.length){
			for(var i = 0; i < markers.length; i++) {
				var place = list[i];
				var marker = markers[i];
				if(!place || place.placeId !== marker.getPlace().placeId) {
					marker.setMap(null);
					markers.splice(i, 1);
					return;
				}
			}
		}
	}
};

var vm = new ViewModel();
ko.applyBindings(vm);