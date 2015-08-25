/*
 * Ben Wiley
 * 2015
 *
 * Google map initialization based in part on sample
 * code found at https://goo.gl/GsKXwE and at
 * https://goo.gl/2a9tjC
 * 
 * Marker search implementation (for new markers) based
 * on sample code found at https://goo.gl/bzucGh
 * 
 * Street view overlay implementation based on sample
 * code found at https://goo.gl/7PjIy4
 *
 * Custom knockout binding for map based on code found
 * in StackOverflow answer at http://goo.gl/qPqtRL
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
	var dataCopy = JSON.parse(JSON.stringify(mapData));

	// list didn't copy; unwraps it for storage
	dataCopy.list = mapData.list();

	// stores data
	localStorage.mapData = JSON.stringify(dataCopy);
}

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
		for(var i = 0, len = mapData.list.length; i < len; i++) {
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
}

// the ViewModel
function ViewModel() {
	var self = this;

	// either initializes new mapData object, or pulls one from localStorage
	self.mapData = initModel();

	// initializes empty search string
	self.searchText = ko.observable("");

	// returns whether there is a search query present
	self.hasQuery = ko.computed(function() {
		return self.searchText().length > 0;
	});

	// returns whether the marker list is showing
	self.listShowing = ko.observable(false);

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
			// closes the marker's window, if the
			// new query isn't empty
			if(self.searchText().length) {
				marker.infoWindow.close();
			}
			// removes marker from map
			marker.setMap(null);
		});
		// adds each selected marker to map
		data.forEach(function(marker) {
			marker.setMap(MAP);
		});
	});

	// initiaizes empty array of marker search results
	self.resultsList = [];

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

	// clears the current query
	self.clearQuery = function() {
		self.searchText("");
		self.filter();
		self.clearResults();
	};

	// clears all search result markers off the map
	// and clears the containing array
	self.clearResults = function() {
		// removes results markers from map
		self.resultsList.forEach(function(marker) {
			marker.setMap(null);
		});
		self.resultsList.length = 0;
	};

	// called when the Enter key is pressed on search
	self.onEnter = function(d, e) {
		if(e.keyCode === 13) { // enter
			// sets alreadyFiltered bool to true
			self.alreadyFiltered = true;
			// in 7 seconds, this will automatically go
			// back to false.
			setTimeout(function() {
				self.alreadyFiltered = false;
			}, 7000);
			// filters markers
			self.filter();
		}
		return true;
	};

	// called to filter markers based on current
	// search text
	self.filter = function() {
		if(!self.markers.length) {	
			if(self.searchText() === "") {
				self.clearResults();
			}
		} else if(self.searchText() === "") {
			self.clearResults();
			// don't filter without a query
			self.selectedMarkers(self.markers);
		} else {
			/*
			 * checks to see if each stored marker should be
			 * displayed for the current search query, w/ 2 steps:
			 * A) See if query terms are all substrings of marker
			 * title.
			 * B) See if query terms are all substrings of any one
			 * of the marker's associated foursquare categories
			 * (if those are available).
			 * :: If a match is found, the marker is selected and
			 * :: the process starts over for the next marker.
			 */

			// starts with no matches
			self.selectedMarkers([]);

			// splits query into array of lowercase terms,
			// without trailing s's (to allow plurals)
			var terms = self.searchText()
						.toLowerCase()
						.split(" ")
						.map(function(term) {
							return term.replace(/s$/, "");
						});
			
			// checks each of the stored markers for matches
			self.markers.forEach(function(marker) {
				// checks if terms match this marker's title
				if(termsMatch(terms, marker.getTitle())) {
					self.selectedMarkers.push(marker);
					return;
				}

				// if not, checks if terms match any of this
				// marker's associated foursquare categories (if
				// available)
				var categories = marker.categories;
				if(categories) {
					for(var i = 0, len = categories.length; i < len; i++) {
						if(termsMatch(terms, categories[i])) {
							self.selectedMarkers.push(marker);
							return;
						}
					}
				}
			});
		}
	};

	// returns whether each give search term is substring
	// of target string
	function termsMatch(terms, target) {
		// terms assumed lowercase; make target lowercase
		target = target.toLowerCase();
		// iterate through terms to to ensure they
		// all match
		for(var i = 0, len = terms.length; i < len; i++) {
			if(target.indexOf(terms[i]) === -1) {
				// if there is a mismatch, return false
				return false;
			}
		}
		// if we get here, all the terms match
		return true;
	}

	// when called, returns true if given place is already
	// pinned on map, false otherwise
	self.pinned = function(place_id) {
		var list = self.mapData.list();
		for(var i = 0, len = list.length; i < len; i++) {
			if(list[i].place_id === place_id) {
				return true;
			}
		}
		return false;
	};

	// toggles truth value of list display
	self.toggleListDisplay = function() {
		self.listShowing(!self.listShowing());
	};

	// saves current state of mapData to localStorage
	self.updateStorage = function() {
		store(self.mapData);
	};
}

// specifies custom binding for map
ko.bindingHandlers.map = {
	// called to initialize the map
	init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
		// gets the mapData object
		var mapData = valueAccessor();

		// gets the ViewModel instance
		var vm = bindingContext.$data;

		// hides sidebar container when streetview is opened
		// and shows it when streetview is hidden
		PANO.addListener('visible_changed', function() {
			if(PANO.getVisible()) {
				$('#sidebar-container').hide();
			} else {
				$('#sidebar-container').show();
			}
		});

		// if map center data exists, go ahead and initialize
		if(mapData.centerData) {
			MAP.setOptions({
				center: mapData.centerData.location,
				zoom: ZOOM,
				disableDefaultUI: true
			});
			// set up the search bar
			searchSetUp();
			// show input
			$('#pac-input').show();
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
					// show input
					$('#pac-input').show();
				}
			}

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
				// won't apply to clicking on input box itself
				e.stopPropagation();
			});
			$('#map-canvas').click(function() {
				$('#pac-input').blur();
			});
			
			// initializes empty array of marker results
			var resultsList = vm.resultsList;
			// listens for changes in the searchbox places
			searchBox.addListener('places_changed', function() {
				// gets place results
				var places = searchBox.getPlaces();

				// returns if there are no results
				if (places.length === 0) {
					return;
				}

				// clears old marker results off map
				vm.clearResults();

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
			for(var i = markers.length, len = list.length; i < len; i++) {
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
			for(var i = 0, len = markers.length; i < len; i++) {
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
		foursquare: null,
		wiki: null
	};

	// initializes loaded API type as null
	this.loadedAPI(null);

	// ajax calls
	this.fetchStreetView();
	this.fetchFoursquare();
	this.fetchWikipedia();

	// listens for marker click, triggers windowSwap
	var self = this;
	GM.event.addListener(marker, 'click', function() {
		AJAXWindow.windowSwap(self);
	});
}
// opens infoWindow, causes marker to bounce for 2 seconds
AJAXWindow.prototype.open = function() {
	var marker = this.marker;
	this.infoWindow.open(MAP, marker);
	marker.setAnimation(GM.Animation.BOUNCE);
	setTimeout(function() {
		marker.setAnimation(null);
	},1400);
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
// fetches from foursquare, and if successful adds
// it to infowindow
AJAXWindow.prototype.fetchFoursquare = function() {
	var marker = this.marker;
	var name = marker.getTitle();
	var loc = marker.getPlace().location;
	var lat = loc.lat();
	var lng = loc.lng();

	var self = this;
	// callback invoked below
	function processFoursquareData(data) {
		// exits now if no venues were returned.
		if(data.response.venues.length === 0) {
			return;
		}

		// grabs venue object from data
		var venue = data.response.venues[0];

		// creates header and info container
		var $foursquareContent = $('<div class="foursquare">');
		$foursquareContent.append('<div class="content-title">Place details (from Foursquare)</div>');
		var $info = $('<div class="foursquare-info">');
		$foursquareContent.append($info);

		// appends venue category
		var categories = venue.categories;
		if(categories.length > 0 && categories[0].name) {
			var tagline = '<i>' + categories[0].name + '</i>';
			$info.append(tagline);

			// adds as property of marker an array filled
			// with category names (but none of the other
			// category-related stuff)
			marker.categories = categories.map(function(category) {
				return category.name;
			});
		}

		// appends menu and/or website, if available
		if(venue.hasMenu || venue.url) {
			$info.append('<br>');
		}
		if(venue.hasMenu) {
			var menuUrl = venue.menu.mobileUrl;
			var formattedMenuLink =
				'<a href="' + menuUrl + '" target="_blank">' +
				'View menu' +
				'</a>';
			$info.append(formattedMenuLink);
		}
		if(venue.hasMenu && venue.url) {
			$info.append(' | ');
		}
		if(venue.url) {
			var formattedWebsite =
				'<a href="' + venue.url + '" target="_blank">' +
				'Visit website' +
				'</a>';
			$info.append(formattedWebsite);
		}

		// appends address
		var location = venue.location;
		if(location.formattedAddress) {
			var formattedAddress =
				'<p><strong>Address:</strong>' +
				'<br>' +
				location.formattedAddress[0] +
				'<br>' +
				location.formattedAddress[1] +
				'</p>';
			$info.append(formattedAddress);
		}

		var contact = venue.contact;
		// appends phone
		if(contact.formattedPhone) {
			var phoneUrl = 'tel:+' + contact.phone;
			var formattedPhone =
				'<p><strong>Phone:</strong> ' +
				'<a href="' + phoneUrl + '" target="_blank">' +
				contact.formattedPhone +
				'</a></p>';
			$info.append(formattedPhone);
		}
		// appends twitter
		if(contact.twitter) {
			var twitterUrl =
				'https://twitter.com/' + contact.twitter;
			var formattedTwitter =
				'<p><strong>Twitter:</strong> ' +
				'<a href="' + twitterUrl + '" target="_blank">' +
				'@' + contact.twitter +
				'</a></p>';
			$info.append(formattedTwitter);
		}

		// appends link to foursquare page
		var foursquareUrl = 'https://foursquare.com/v/' + venue.id;
		var moreMessage =
			'For more info, check out ' +
			'<a href="' + foursquareUrl + '" target="_blank">' +
			venue.name + ' on Foursquare' +
			'</a>.';
		$info.append('<p>' + moreMessage + '</p>');

		// loads foursquare content
        self.contentBlocks.foursquare = $foursquareContent[0].outerHTML;
        // displays navigation arrows if necessary
        self.checkNavigation();
	}

	// forms request url
	var request =
		'https://api.foursquare.com/v2/venues/search?' +
		'll=' + lat + ',' + lng +
		'&query=' + name +
		'&client_id=' +
		'MT2PAXNGUMMPXXGT05EJMHE2B2BEOWDLLLMDIHFYTRXE3DRD' +
		'&client_secret=' +
		'IBE2CFQIOMN4Q0ARJL14BUIVX1T0UOEDLFDNQY412LNMKLWR' +
		'&v=20150822';

	// makes request
	$.getJSON(request, processFoursquareData);
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
		var $list = $('<div class="wiki-list">');
		$wikiContent.append($list);

        // fills list with articles
        for(var i = 0, len = links.length; i < len; i++) {
            var title = titles[i];
            var link = links[i];
            var $entry = $('<div>');
            $entry.append('<a href="' +
				link + '" target="_blank">' +
				title + '</a>');
            $list.append($entry);
        }

        // loads wikipedia content
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