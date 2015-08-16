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
			var obj = {};
			var loc = geometry.location;
			obj.location = new GM.LatLng(loc.G, loc.K);
			if(geometry.viewport) {
				// LatLngBounds (viewport) is accessed
				// via E/W and S/N boundary pairs, but
				// it can only be specified by SW and
				// NE coordinate pairs
				var view = geometry.viewport;
				// construct SW coordinate pair from S
				// bound line (Ia.G) and W bound (Ca.j)
				var sw = new GM.LatLng(view.Ia.G, view.Ca.j);
				// construct NE coordinate pair from N
				// bound line (Ia.j) and E bound (Ca.G)
				var ne = new GM.LatLng(view.Ia.j, view.Ca.G);
				// construct new LatLngBounds from the
				// coordinate pairs
				obj.viewport = new GM.LatLngBounds(sw, ne);
			}
			return obj;
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
	self.addPlace = function(name, place_id, geometry) {
		var list = self.mapData.list;
		var id = 1;
		// id n belongs to nth place with same name
		list().forEach(function(place) {
			if(place.name === name) id++;
		});
		self.mapData.list.push({
			"name": name,
			"id": id,
			"place_id": place_id,
			"geometry": geometry
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

	// returns HTML content for an infoWindow
	self.getInfoContent = function(name, place_id, isPermanent) {
		var $content = $('<div>').addClass('info-window');

		// TODO: procedure for AJAX content loading

		// if this infoWindow belongs to a temp marker,
		// adds option to add it to the map permanently
		if(!isPermanent) {
			var $addMarker = $('<p>').addClass('add-marker');
			$addMarker.html('Add <em>' + name + '</em> to map');
			$content.append($addMarker);
		}

		// converts DOM element to html string & returns
		return $content[0].outerHTML;
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
			SERVICE.textSearch({query: mapData.placeName}, mapSetUp);
		}

		// sets up the search bar on the map
		function searchSetUp() {

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
				var lastWindow = null;
				places.forEach(function(place) {
					// only run if this location is not already pinned
					if(vm.pinned(place.place_id)) {
						return;
					}

					var icon = {
						url: place.icon,
						size: new GM.Size(71, 71),
						origin: new GM.Point(0, 0),
						anchor: new GM.Point(17, 34),
						scaledSize: new GM.Size(25, 25)
					};

					// creates a marker for each place
					var marker = new GM.Marker({
						map: MAP,
						icon: icon,
						title: place.name,
						position: place.geometry.location
					});

					// creates info window
					marker.infoWindow = new GM.InfoWindow({
						content: '<div class="infoWindow">' +
						'<p class="add-marker">' +
						'+ Add <b>' + place.name + '</b> to map' +
						'</p></div>'
					});

					// on marker click, opens this info window and closes the last
					GM.event.addListener(marker, 'click', function() {
						if(lastWindow) {
							lastWindow.close();
							if(lastWindow === this.infoWindow)
								lastWindow = null;
							else {
								this.infoWindow.open(MAP, marker);
								lastWindow = this.infoWindow;
							}
						} else {
							this.infoWindow.open(MAP, marker);
							lastWindow = this.infoWindow;
						}

						var self = this;
						$('.add-marker:last').click(function() {
							vm.addPlace(place.name, place.place_id, place.geometry);
							self.setMap(null);
							markers.splice(markers.indexOf(self), 1);
						});
					});

					markers.push(marker);
				});
			});
		}
	},

	// called whenever entries are added or subtracted from marker data list
	update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
		// gets the list of place data
		var list = valueAccessor().list();

		// gets the Markers array
		var markers = bindingContext.$data.markers;

		// adds markers, if there are more data entries than markers
		if(list.length > markers.length) {
			for(var i = markers.length; i < list.length; i++) {
				var place = list[i];
				markers.push(new GM.Marker({
					"map": MAP,
					"icon": "images/marker.png",
					"title": place.name,
					"place": {
						"location": place.geometry.location,
						"placeId": place.place_id
					}
				}));
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

var vm = new ViewModel();
ko.applyBindings(vm);