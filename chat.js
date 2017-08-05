
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
  res.send('');
});

io.on('connection', function(socket){
  console.log('a user connected');
socket.on('send_message', function(message,receiverId, senderId, time){
    io.emit('receive_message',
        {
            message:message,
            receiverId:receiverId,
            senderId:senderId,
	    time:time
        }
      );
  });
});

http.listen(5000, function(){
  console.log('listening on *:5000');
});
