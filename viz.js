$(document).ready(function() {

    current_station_id = 38 // FIX ME: Hard coded what station to look at for now!
    current_hour_selected = 17 // FIX ME: This should be based on user input too. How to handle aggregate?
    
    stations = _(stations).filter(function(station) { return !station.temporary });

    // Center coords, and zoomlevel 13
    var map = L.map('map');
    map.on('moveend', function(e) {
        console.log(map.getCenter());
    });

    var layer = new L.MAPCTileLayer("basemap");
    map.addLayer(layer);
    
    var stations_by_id = {};
    _(stations).each(function(station) {
        //station.flow = { in: 0, out: 0 };
        stations_by_id[station.id] = station;
    });

    var min_lat = _.chain(stations).map(function(s) { return s.lat }).min().value();
    var max_lat = _.chain(stations).map(function(s) { return s.lat }).max().value();
    var min_lng = _.chain(stations).map(function(s) { return s.lng }).min().value();
    var max_lng = _.chain(stations).map(function(s) { return s.lng }).max().value();

    map.fitBounds(L.latLngBounds([min_lat, min_lng], [max_lat, max_lng]));

    var current_hour_data = _.chain(hourly_data)
        .filter(function(item) { return item.hour == current_hour_selected; })
        .sortBy(function(d) { return d.accumulation; })
        .value();

    
    // FIX ME: not checking the hours explicitly, assuming in order!
    var one_station_data_arrivals = _.chain(hourly_data)
	.filter(function(d) { return d.station_id == current_station_id;})
	.map(function(d) { return d.arrivals;})
	.value();

    var one_station_data_departures = _.chain(hourly_data)
	.filter(function(d) { return d.station_id == current_station_id;})
	.map(function(d) { return d.departures;})
	.value();

    var one_station_max = Math.max(_.max(one_station_data_departures),
				   _.max(one_station_data_arrivals))
    var circle_scale = 20;
    function getStationCoords(id){
	return [stations_by_id[id].lat, stations_by_id[id].lng];
    }
    _(current_hour_data).each(function(d) {
        d.circle = L.circle(getStationCoords(d.station_id),
			    // TBD how to handle size and color to indicate total traffic
			    // and net imbance
                            circle_scale * Math.sqrt(Math.abs(d.arrivals+d.departures)),
                            {color: (d.arrivals > d.departures?'steelBlue':'brown'),
			     weight: 2, opacity: 1.0, fillOpacity: 0.5})
            .addTo(map)
            .bindPopup(stations_by_id[d.station_id].name);
    });

    var width = $('#aggregates').width() 
    height = 200; //$('#aggregate').height() 

    var min_acc = _.min(_(current_hour_data).map(function(d) { return d.accumulation;} ))
    var max_acc = _.max(_(current_hour_data).map(function(d) { return d.accumulation;} ))
    
    var y = d3.scale.linear()
	.domain([min_acc, max_acc])
	.range([0, height])
	.nice();

    var x = d3.scale.ordinal()
	.domain(_(current_hour_data).map(function(d) { return d.station_id; }))
	.rangeRoundBands([0, width], .2);

    var yAxis = d3.svg.axis()
	.scale(y)
	.orient("top");

    var svg = d3.select("#aggregates").append("svg")
	.attr("width", width)
	.attr("height", height)

    svg.selectAll(".bar")
	.data(current_hour_data)
	.enter().append("rect")
	.attr("class", function(d) { return d.accumulation > 0 ? "bar negative" : "bar positive"; })
	.attr("data-station", function(d) { return d.station_id; })
	.attr("data-accum", function(d) { return d.accumulation; })
	.attr("x", function(d, i) { return x(d.station_id); })
	.attr("y", function(d) { return y(Math.min(0, d.accumulation)) })
	.attr("width", x.rangeBand())
	.attr("height", function(d) { return Math.abs(y(d.accumulation) - y(0)); });

    svg.selectAll("text")
	.data(current_hour_data)
	.enter()
    //.append("g").attr("transform", function(d) { return "rotate(270, " + x(d.station_id) + "," + -y(Math.min(0, (d.arrivals - d.departures))) + ")" })
	.append("text")
	.attr("class", "label")
	.text(function(d) { return d.station_name })
	.attr("x", function(d, i) { return x(d.station_id); })
	.attr("y", function(d, i) { return -y(Math.min(0, (d.accumulation))); })
	.attr("width", x.rangeBand())
	.attr("height", 100)

    
    // Begin Graphical Elements for Station Chart
    // sc for station_chart
    // Margin convention from here: http://bl.ocks.org/3019563
    var margin = {top:40, right: 0, bottom:20, left:0};
    var sc_width = 225;    // TODO how to make width '100%' again dynamically?, use width of parent?
    var sc_height = 300;
    var width = sc_width - margin.left - margin.right;
    var height = sc_height - margin.top - margin.bottom;
    sc_pa = 50 // for axis labels etc
    var chart_svg = d3.select('#station-chart')
	.append('svg')
 	.attr('width', sc_width)
	.attr('height', sc_height)
	.append("g")
	.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    chart_svg.selectAll();

    var x_scale = d3.scale.ordinal()
        .domain(_.range(0, 23))
        .rangeRoundBands([0, width]);

    var y_scale = d3.scale.linear() 
        .domain([0, one_station_max])
        .range([height, 0]);

    var line = d3.svg.line()
        .x(function(d, i) { return x_scale(i); })
        .y(function(d) { return y_scale(d); });

    console.log(line);

    chart_svg.append("path")
        .datum(one_station_data_arrivals)
        .attr("class", "line arrivals")
        .attr("d", line);
    chart_svg.append("path")
        .datum(one_station_data_departures)
        .attr("class", "line departures")
        .attr("d", line);

    sc_x_axis = d3.svg.axis()
	.scale(x_scale)
	.orient("bottom")
	//.ticks(d3.time.hours,2);
	.tickValues([0,4,8,12,16, 20]); // TODO, should wrap data so that you can see continuity over midnight - 2am?

    sc_y_axis = d3.svg.axis()
	.scale(y_scale)
	.orient("right")
	.ticks(5);

    chart_svg.append("g")
	.attr("class", "axis")
	.attr("transform", "translate(0,"+ height + ")")
	.call(sc_x_axis);

    chart_svg.append("g")
	.attr("class", "y axis")
	.call(sc_y_axis)
	.append("text")
	.attr("transform", "rotate(-90)")
          .attr("y", 30) // Does this make sense?
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text("Average Weekday Trips");
    // TITLE
    var title = chart_svg.append("g")
	.attr("text-anchor", "start")
	.attr("transform", "translate(10,"+ (-margin.top/2) +")");

    title.append("text")
	.attr("class", "title")
	.text(function(d) { return stations_by_id[current_station_id].name; });
});
