var map = new google.maps.Map(document.getElementById('map-canvas'));

var service = new google.maps.places.PlacesService(map);

var place = "Montreal, Quebec, Canada";

function searchCallback(results, status) {
	if(status === google.maps.places.PlacesServiceStatus.OK) {
		service.getDetails({
			placeId: results[0].place_id
		}, detailsCallback);
	}

	function detailsCallback(place, status) {
		if(status === google.maps.places.PlacesServiceStatus.OK) {
			map.setOptions({
				center: place.geometry.location,
				zoom: 10
			});
		}
	};
};

service.textSearch({query: place}, searchCallback);

//KEEP IN MIND:
//Map.panTo(LatLng|LatLngLiteral)
//Map.panToBounds(LatLngBounds)