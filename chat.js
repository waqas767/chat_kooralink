var app = require('express')();
var where = require('node-where');
var request = require('request');
//var geolib = require('geolib');
var server = require('http').Server(app);
var io = require('socket.io')(server, {
  transports: ['websocket', 'xhr-polling']
});

var oneSignal = require('onesignal')('MTBhZmNlNzUtMTczMy00ODhjLTliYTYtOTIwYWEyMDIwOWY4', 'b3153d7d-1272-42db-b2c0-cacdc7523e2f', true);
var port = 3000;

// userids which are currently connected to the chat
var userids = {};
var numClients = {};

app.use(function(request, response, next) {
    response.header("Access-Control-Allow-Origin", '*');
    response.setHeader('Access-Control-Allow-Headers', 'Origin, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Response-Time, X-PINGOTHER, X-CSRF-Token');
    response.header("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,DELETE,OPTIONS");
    response.header("Access-Control-Allow-Credentials", "true");
    next();
    // response.header("Access-Control-Allow-Origin", '*');
    // response.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
    // response.header("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,DELETE,OPTIONS");
    // response.header("Access-Control-Allow-Credentials", "true");
    // next();
});

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/best_ovpn', function(req, res) {
        where.is(req.ip, function (err, result) {
            req.geoip = result;
            request('https://api.nordvpn.com/server', function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var info = JSON.parse(body);
                    var best_ovpn, best_ovpn_value = null;
                    for (var i = 0; i < info.length; i++) {
                        var _distance = distance(info[i].location.lat,info[i].location.long,result.get('lat'),result.get('lng'), 'K');
                        var _temp = (_distance * 0.7) + (info[i].load * 0.3);
                        var thenum = info[i].name.match(/\d+/)[0];
                        if(thenum>100)console.log(thenum);
                        if (best_ovpn_value==null || _temp < best_ovpn_value) {
                            best_ovpn_value = _temp;
                            best_ovpn = info[i];
                        }
                    }
                    res.send(best_ovpn);
                }
            });
        });
    });

app.get('/uk_best_ovpn', function(req, res) {
        where.is(req.ip, function (err, result) {
            req.geoip = result;
            request('https://api.nordvpn.com/server', function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var info = JSON.parse(body);
                    var uk_best_ovpn, uk_best_ovpn_value=null;
                    for (var i = 0; i < info.length; i++) {
                        var _distance = distance(info[i].location.lat,info[i].location.long,result.get('lat'),result.get('lng'), 'K');
                        var _temp = (_distance * 0.7) + (info[i].load * 0.3);
                        if (info[i].country=='United Kingdom' && (uk_best_ovpn_value==null || _temp < uk_best_ovpn_value)) {
                            uk_best_ovpn_value = _temp;
                            uk_best_ovpn = info[i];
                        }
                    }
                    res.send(uk_best_ovpn);
                }
            });
        });
    });


io.on('connection', function(socket) {
    // when the client emits 'adduser', this listens and executes
    socket.on('adduser', function(userid) {
        // store the userid in the socket session for this client
        socket.userid = userid;
        // store the room name in the socket session for this client
        // socket.room = 'room1';
        // add the client's userid to the global list
        userids[userid] = userid;
        // send client to room 1
        // socket.join('room1');
        // echo to client they've connected
        socket.emit('updatechat', userid, 'have connected to server');
        // echo to room 1 that a person has connected to their room
        // socket.broadcast.to('room1').emit('updatechat', 'SERVER', userid + ' has connected to this room');
        // socket.emit('updaterooms', rooms, 'room1');
    });

    socket.on('join_room', function(data) {
        var room;
        console.log(socket.userid)
        console.log(data.userid)
        if (socket.userid > data.userid)
            room = socket.userid + data.userid;
        else
            room = data.userid + socket.userid;
        if (socket.room)
            decrease_room_joinees(socket.room);
        socket.join(room);
        socket.room = room;
        socket.emit('room_connected', 'you have connected to ' + room);
        socket.broadcast.to(room).emit('updatechat', {type: 'JOIN'});
        increase_room_joinees(room);
    });

    function increase_room_joinees(room) {
        if (numClients[room] == undefined) {
            numClients[room] = 1;
        } else {
            numClients[room]++;
        }
    }

    function decrease_room_joinees(room) {
        if (numClients[room] != undefined) {
            numClients[room]--;
        }
    }

    // when the client emits 'sendchat', this listens and executes
    socket.on('sendchat', function(data) {
        var room = socket.room;
        // we tell the client to execute 'updatechat' with 2 parameters
        io.sockets.in(room).emit('updatechat', data);
        if (numClients[room] < 2) {
            var message = {
                app_id: "b3153d7d-1272-42db-b2c0-cacdc7523e2f",
                contents: { "en": "English Message" },
                filters: [
                    { "field": "tag", "key": "user_id", "relation": "=", "value": data.receiverId }
                ]
                // included_segments: ["All"]
            };
            sendNotification(message);
        }
    });

    socket.on('leaveRoom', function(lastRoom) {
        socket.leave(socket.room);
        socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.userid + ' has left this room');
    });

    socket.on('switchRoom', function(newroom) {
        // leave the current room (stored in session)
        socket.leave(socket.room);
        // join new room, received as function parameter
        socket.join(newroom);
        socket.emit('updatechat', 'SERVER', 'you have connected to ' + newroom);
        // sent message to OLD room
        socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.userid + ' has left this room');
        // update socket session room title
        socket.room = newroom;
        socket.broadcast.to(newroom).emit('updatechat', 'SERVER', socket.userid + ' has joined this room');
        // socket.emit('updaterooms', rooms, newroom);
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function() {
        // remove the userid from global userids list
        delete userids[socket.userid];
        // update list of users in chat, client-side
        io.sockets.emit('updateusers', userids);
        // echo globally that this client has left
        socket.broadcast.emit('updatechat', socket.userid, socket.userid + ' has disconnected');
        socket.leave(socket.room);
        numClients[socket.room]--;
    });
});

function save_notification(userid) {
    var headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": "Basic MTBhZmNlNzUtMTczMy00ODhjLTliYTYtOTIwYWEyMDIwOWY4"
    };

    var options = {
        host: "onesignal.com",
        port: 443,
        path: "/api/v1/notifications",
        method: "POST",
        headers: headers
    };

    var https = require('https');
    var req = https.request(options, function(res) {
        res.on('data', function(data) {
            console.log("Response:");
            console.log(JSON.parse(data));
        });
    });

    req.on('error', function(e) {
        console.log("ERROR:");
        console.log(e);
    });

    req.write(JSON.stringify(data));
    req.end();
}

function distance(lat1, lon1, lat2, lon2, unit) {
        var radlat1 = Math.PI * lat1/180
        var radlat2 = Math.PI * lat2/180
        var radlon1 = Math.PI * lon1/180
        var radlon2 = Math.PI * lon2/180
        var theta = lon1-lon2
        var radtheta = Math.PI * theta/180
        var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
        dist = Math.acos(dist)
        dist = dist * 180/Math.PI
        dist = dist * 60 * 1.1515
        if (unit=="K") { dist = dist * 1.609344 }
        if (unit=="N") { dist = dist * 0.8684 }
        return dist
}

function sendNotification(data) {
    var headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": "Basic MTBhZmNlNzUtMTczMy00ODhjLTliYTYtOTIwYWEyMDIwOWY4"
    };

    var options = {
        host: "onesignal.com",
        port: 443,
        path: "/api/v1/notifications",
        method: "POST",
        headers: headers
    };

    var https = require('https');
    var req = https.request(options, function(res) {
        res.on('data', function(data) {
            console.log("Response:");
            console.log(JSON.parse(data));
        });
    });

    req.on('error', function(e) {
        console.log("ERROR:");
        console.log(e);
    });

    req.write(JSON.stringify(data));
    req.end();
};

server.listen(port, function() {
    console.log('listening on *:' + port);
});
