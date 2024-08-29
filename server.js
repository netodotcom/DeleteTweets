const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

function deleteTweets(authorization, clientTid, clientUuid) {
    console.log('Authorization:', authorization);
    console.log('X-Client-Transaction-Id:', clientTid);
    console.log('X-Client-Uuid:', clientUuid);

    return 'Tweets deleted successfully';
}

wss.on('connection', ws => {
    console.log('Client connected');

    ws.on('message', message => {
        console.log('Message received:', message);

        const data = JSON.parse(message);
        const result = deleteTweets(data.AUTHORIZATION, data.CLIENT_TID, data.CLIENT_UUID);

        ws.send(result);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

console.log('WebSocket server is listening on port 8080');
