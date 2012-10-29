   
/* Global page state defaults */ 
current_station_id = 38 // FIX ME: Hard coded what station to look at for now!
current_hour_selected = 17 // FIX ME: This should be based on user input too. How to handle aggregate?

/* Colors found in sass/viz.scss but if there's a clever way to automate extraction */
var positive_color = '#36ac9c';
var negative_color = '#f9a72b';

/* The station accumulation bars */
function set_up_station_accumulations() {
    var width = $('#aggregates').width();
    var height = $('#aggregates').height();

    var svg = d3.select("#aggregates").append("svg")
	  .attr("width", width)
	  .attr("height", height);

    return svg;
}

function bind_station_accumulation_data(svg, data) {
    var width = $('#aggregates').width();
    var height = $('#aggregates').height();

    var min_acc = _.min(_(data).map(function(d) { return d.accumulation;} ))
    var max_acc = _.max(_(data).map(function(d) { return d.accumulation;} ))
    var y_max = Math.max(-min_acc, max_acc);
    
    // Y scale keep 0 at exactly the midpoint of the SVG canvas
    var y = d3.scale.linear()
	    .domain([-y_max, y_max])
	    .range([0, height])
	    .nice();

    // X scale allocates fixed-size rectangles for stations in order. 
    // FIXME: I think it should be by index, not station id, since it stays sorted. We'll see when things get dynamic
    var x = d3.scale.ordinal()
	    .domain(_(data).map(function(d) { return d.station_id; }))
	    .rangeRoundBands([0, width]);

    // FIXME: I don't see this appearing
    var yAxis = d3.svg.axis()
	    .scale(y)
	    .orient("top");

    // Actually bind the data
    var accumulation_enter = svg.selectAll(".station-accumulation").data(data).enter() 
        .append("g").attr("class", "station-accumulation");
    
    /* The visible bar */
    accumulation_enter.append("rect")
	    .attr("class", function(d) { return d.accumulation > 0 ? "bar negative" : "bar positive"; })
	    .attr("data-station", function(d) { return d.station_id; })
	    .attr("data-accum", function(d) { return d.accumulation; })
	    .attr("x", function(d, i) { return x(d.station_id); })
	    .attr("y", function(d) { return y(Math.min(0, d.accumulation)) })
	    .attr("width", x.rangeBand())
	    .attr("height", function(d) { return Math.abs(y(d.accumulation) - y(0)); });

    /* The station name*/
    accumulation_enter.append("g").attr("transform", function(d) { return "translate(" + ( x(d.station_id) + x.rangeBand()*2/3 )+ ", " + y(0) + ")," + "rotate(270)" })
	    .append("text")
          .attr("class", function(d) { return d.accumulation > 0 ? "bar-label negative" : "bar-label positive"; })
          .attr("dx", function(d) { return d.accumulation > 0 ? "0.6em" : "-0.6em" })
	      .text(function(d) { return d.station.short_name });

    /* An invisible rectangle over everything to receive selection */
    accumulation_enter.append("rect")
	    .attr("class", "activator")
	    .attr("data-station", function(d) { return d.station_id; })
	    .attr("data-accum", function(d) { return d.accumulation; })
	    .attr("x", function(d, i) { return x(d.station_id); })
	    .attr("y", 0)
	    .attr("width", x.rangeBand())
	    .attr("height", height);

    $('#aggregates').on("mouseover mouseout", ".activator", function(event) {
        if (event.type == "mouseover") {
            $(this).attr("class", "activator active");
        } else if (event.type == "mouseout") {
            $(this).attr("class", "activator");
        }
    });
}

function accumulation_data_for_hour(hour) {
    if (_(hour).isNumber()) {
        return _.chain(hourly_data)
            .filter(function(d) { return d.hour == hour; })
            .sortBy(function(d) { return d.accumulation; })
            .value();
    } else {
        // moderate hack: no hour selected: add them all up
        var result = _.chain(hourly_data)
            .groupBy(function(d) { return d.station.id; })
            .map(function(ds, station_id) {
                var template = _(ds).first();
                template.accumulation = _(ds).reduce(function(accum, d) { return accum + d.accumulation; }, 0);
                return template;
            })
            .sortBy(function(d) { return d.accumulation; })
            .value();
        console.log(result);
        return result;
    }
}

function set_up_map(stations) {
    // Center coords, and zoomlevel 13
    var map = L.map('map', {
        scrollWheelZoom: false
    });

    var layer = new L.MAPCTileLayer("basemap");
    map.addLayer(layer);
    
    var min_lat = _.chain(stations).map(function(s) { return s.lat }).min().value();
    var max_lat = _.chain(stations).map(function(s) { return s.lat }).max().value();
    var min_lng = _.chain(stations).map(function(s) { return s.lng }).min().value();
    var max_lng = _.chain(stations).map(function(s) { return s.lng }).max().value();

    // Currently this zooms out too far map.fitBounds(L.latLngBounds([min_lat, min_lng], [max_lat, max_lng]));
    map.setView([42.355, -71.095], 13);

    return map;
}

function bind_map_data(map, data) {
    var circle_scale = 27;
    // TODO: keep circles around and use .setStyle() to change the color and .setRadius()

    _(data).each(function(d) {
        console.log(d);
        d.circle = L.circle([d.station.lat, d.station.lng],
			                // TBD how to handle size and color to indicate total traffic
			                // and net imbance
                            circle_scale * Math.sqrt(Math.abs(d.arrivals+d.departures)),
                            {color: (d.arrivals > d.departures ? positive_color : negative_color), 
			                 weight: 2, opacity: 1.0, fillOpacity: 0.5})
            .addTo(map)
            .bindPopup(d.station.name);
    });
    // TODO: bind on click to mutate selected station id
}

$(document).ready(function() {

    /* Page View State Variables */
    current_station_id = $.url().param('station') || current_station_id;
    current_hour_selected = $.url().param('hour') || current_hour_selected; 
    console.log('Current station / hour:', current_station_id, current_hour_selected);
    
    /* Massage the initial data to make life a little easier */
    stations = _(stations).filter(function(station) { return !station.temporary });
    
    var stations_by_id = {};
    _(stations).each(function(station) {
        //station.flow = { in: 0, out: 0 };
        stations_by_id[station.id] = station;
    });

    _(hourly_data).each(function(d) {
        d.station = stations_by_id[d.station_id];
    });

    /* Initial data */
    var current_hour_data = accumulation_data_for_hour(current_hour_selected);
    
    var one_station_data_arrivals = _.chain(hourly_data)
	.filter(function(d) { return d.station_id == current_station_id;})
	.map(function(d) { return d.arrivals;})
    .sortBy(function(d) { return d.hour })
	.value();

    var one_station_data_departures = _.chain(hourly_data)
	.filter(function(d) { return d.station_id == current_station_id;})
	.map(function(d) { return d.departures;})
    .sortBy(function(d) { return d.hour })
	.value();

    var one_station_max = Math.max(_.max(one_station_data_departures),
				   _.max(one_station_data_arrivals))

    /* Set up the station accumulation chart with some initial data */
    var accumulations_svg = set_up_station_accumulations();
    bind_station_accumulation_data(accumulations_svg, current_hour_data); // FIXME: the default should be a sum, not the current hour
    
    /* Set up the Map with initial data */
    var map = set_up_map(stations);
    bind_map_data(map, current_hour_data);
    
    // Begin Graphical Elements for Station Chart
    // sc for station_chart
    // Margin convention from here: http://bl.ocks.org/3019563
    var width = $('#line-chart').width();    // TODO how to make width '100%' again dynamically?, use width of parent?
    var height = $('#line-chart').height();
    var margin_bottom = 30; // This has to be within the SVG, to make room for x axis labels, but nothing else does

    var chart_svg = d3.select('#line-chart').append('svg')
        //.attr('style', 'border: 1px solid red') // For debugging
        .attr('width', width)
        .attr('height', height);
    

    chart_svg.selectAll();

    var x_scale = d3.scale.ordinal()
        .domain(_.range(0, 23))
        .rangeRoundBands([0, width]);

    var y_scale = d3.scale.linear() 
        .domain([0, one_station_max])
        .range([height-margin_bottom, 0]);

    var line = d3.svg.line()
        .x(function(d, i) { return x_scale(i); })
        .y(function(d) { return y_scale(d); });

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
	.attr("transform", "translate(0,"+ (height - margin_bottom) + ")")
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
});
