const Discord = require('discord.js');
const client = new Discord.Client();
const https = require('https');
const config = require('./config.json');

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	updateStatus();
});

client.on('message', async msg => {
	if (msg.content === 'player.count' && !msg.author.bot) {
		reply(msg);
	}
});

client.login(config.token);

var count = getOnlineUsers();

async function reply(msg) {
	count = await getOnlineUsers();
	msg.reply('There are currently ' + count + ' players online.');
}

async function updateStatus() {
	count = await getOnlineUsers();
	client.user.setPresence({activity: {name: 'There are currently ' + count + ' players online.'}, status: 'online'});
	setInterval(async () => {
		count = await getOnlineUsers();
		client.user.setPresence({activity: {name: 'There are currently ' + count + ' players online.'}, status: 'online'});
	}, 60000);
}

function makeJSONRequest(options) {
	return new Promise((resolve, reject) => {
		var json = '';
		var data = {};

		https.get(options, res => {
			res.on('data', chunk => {
				json += chunk;
			});
			res.on('end', () => {
				if (res.statusCode === 200) {
					try {
						data = JSON.parse(json);
						// data is available here:
						resolve(data);
					} catch (e) {
						reject(e);
					}
				} else {
					reject(res.statusCode);
				}
			});
		}).on('error', function (err) {
			reject(err);
		});
	});
}

async function getOnlineUsers() {
	var options = {
		host: 'www.secrethitler.io',
		path: '/online-playercount',
		headers: {'User-Agent': 'request'}
	};

	try {
		let JSONPromise = await makeJSONRequest(options);
		let data = await JSONPromise;
		return data.count;
	} catch(e) {
		console.log('Something\'s wrong, please try again later');
	}
}

