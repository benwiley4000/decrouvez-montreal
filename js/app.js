var PLACE_NAME = "Montreal, Quebec, Canada";
var GM = google.maps;
var MAP = new GM.Map(document.getElementById('map-canvas'));
var SERVICE = new GM.places.PlacesService(MAP);
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

		// converts object literals back to LatLng objects
		function convert(geometry) {
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
function ViewModel() {
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
					bindingContext.$data.updateStorage();
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
			SERVICE.textSearch({query: mapData.placeName}, mapSetUp);
		}

		// sets up the search bar on the map
		function searchSetUp() {

			// Implementation based off of code found here:
			// https://developers.google.com/maps/documentation/javascript/examples/places-searchbox

			var input = document.getElementById('pac-input');
			var searchBox = new GM.places.SearchBox(input);
			MAP.controls[GM.ControlPosition.TOP_LEFT].push(input);
			searchBox.setBounds(mapData.centerData.viewport);

			var markers = [];
			// listens for changes in the searchbox places
			searchBox.addListener('places_changed', function() {
				var places = searchBox.getPlaces();

				if (places.length === 0) {
					return;
				}

				// removes old markers
				markers.forEach(function(marker) {
					marker.setMap(null);
				});
				markers = [];

				// for each place, gets the icon, name and location
				var bounds = new GM.LatLngBounds();
				var lastWindow = null;
				places.forEach(function(place) {
					var icon = {
						url: place.icon,
						size: new GM.Size(71, 71),
						origin: new GM.Point(0, 0),
						anchor: new GM.Point(17, 34),
						scaledSize: new GM.Size(25, 25)
					};

					// Create a marker for each place.
					var marker = new GM.Marker({
						map: MAP,
						icon: icon,
						title: place.name,
						position: place.geometry.location
					});

					marker.infoWindow = new GM.InfoWindow({
						content: '<div class="infoWindow">' +
						'<p class="add-marker">' +
						'Add ' + place.name + 'to map' +
						'</p></div>'
					});

					google.maps.event.addListener(marker, 'click', function() {
						console.log(this);
						if(lastWindow) {
							lastWindow.close();
							if(lastWindow === infoWindow)
								lastWindow = null;
							else {
								infoWindow.open(MAP, marker);
								lastWindow = infoWindow;
							}
						} else {
							infoWindow.open(map,marker);
							lastWindow = infoWindow;
						}
					});

					markers.push(marker);

					if (place.geometry.viewport) {
						// Only geocodes have viewport.
						bounds.union(place.geometry.viewport);
					} else {
						bounds.extend(place.geometry.location);
					}
				});
			    //MAP.fitBounds(bounds);
			});
			// [END region_getplaces]
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