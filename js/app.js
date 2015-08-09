var map = new google.maps.Map(document.getElementById('map-canvas'));

var service = new google.maps.places.PlacesService(map);

var place = "Montreal, Quebec, Canada";

function detailsCallback(place, status) {
	if(status === google.maps.places.PlacesServiceStatus.OK) {
		console.log(place.geometry);
		var mapOptions = {
			center: place.geometry.location,
			zoom: 8
		};
		map.setOptions(mapOptions);
	}
};

function searchCallback(results, status) {
	if(status === google.maps.places.PlacesServiceStatus.OK) {
		var id = results[0].place_id;
		console.log(id);
		service.getDetails({placeId: id}, detailsCallback);
	}
};

service.textSearch({query: place}, searchCallback);