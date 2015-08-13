var PLACE_NAME = "Montreal, Quebec, Canada";
var MAP = new google.maps.Map(document.getElementById('map-canvas'));
var SERVICE = new google.maps.places.PlacesService(MAP);

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

	self.mapData = initModel();

	// when called, adds a new marker to mapData.list
	self.addMarker = function(place_id, geometry) {
		self.mapData.list.push({
			"place_id": place_id,
			"geometry": geometry
		});
		self.updateStorage();
	};

	// when called, removes all markers with the given place_id property
	self.removeMarker = function(place_id) {
		self.mapData.list = ko.observableArray(this.mapData.list.remove(function(place) {
			return place.place_id === place_id;
		}));
		self.updateStorage();
	};

	// saves current state of mapData to localStorage
	self.updateStorage = function() {
		store(self.mapData);
	}
};

// specifies custom binding for map
ko.bindingHandlers.map = {
	init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
		// gets the mapData object
		var mapData = valueAccessor();

		// if map center data exists, go ahead and initialize
		if(mapData.centerData) {
			MAP.setOptions({
				center: mapData.centerData.location,
				zoom: 10
			});
		}

		// otherwise, data is searched for
		else {
			// callback function (invoked below) sets up initial map properties
			var mapSetUpCallback = function(results, status) {
				if(status === google.maps.places.PlacesServiceStatus.OK) {
					mapData.centerData = results[0].geometry;
					viewModel.updateStorage();
					MAP.setOptions({
						center: mapData.centerData.location,
						zoom: 10
					});
				}
			};

			// searches with name of map center and initializes rest of map data
			SERVICE.textSearch({query: mapData.placeName}, mapSetUpCallback);
		}
	},
	update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
		var mapData = valueAccessor();
		console.log(mapData.list());
	}
};

var vm = new ViewModel();
ko.applyBindings(vm);