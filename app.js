const Discord = require('discord.js');
const client = new Discord.Client();
const https = require('https');
const config = require('./config.json');

var count = getOnlineUsers();
var iid = [];
var signupStatus = 'enabled';
var signupInProgress = false;
var servers = new Map();
client.login(config.token);

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	updateStatus();
});

client.on('message', async msg => {
	if (msg.author.bot) return;
	
	var server = servers.get(msg.guild.id);
	if (!server) {
		server = {
			channels: new Map()
		}
		servers.set(msg.guild.id, server);
	}
	
	var channel = server.channels.get(msg.channel.id);
	if (!channel) {
		channel = {
			waiting: []
		}
		server.channels.set(msg.channel.id, channel);
	}
	
	if (msg.content === 'player.count') {
		replyPlayerCount(msg);
	
	} else if (msg.content === 'sign.ups') {
		replySignupsEnabled(msg);
	
	} else if (msg.content === 'ping.me.acsu') {
		pingWhenSignupsEnabled(msg);
	}
});

async function replyPlayerCount(msg) {
	if (iid.length === 0) {
		clearInterval(iid[0]);
		clearInterval(iid[1]);
	}
	iid = await updateStatus();
	msg.reply('there are currently ' + count + ' players online.')
		.catch(console.error);
}

async function replySignupsEnabled(msg) {
	if (signupInProgress) {
		msg.reply('signups are currently ' + signupStatus + '.')
			.catch(console.error);
		return;
	}
	
	
	if (iid.length === 0) {
		clearInterval(iid[0]);
		clearInterval(iid[1]);
	}
	iid = await updateStatus();
	msg.reply('signups are currently ' + signupStatus + '.')
		.catch(console.error);
	
	if (signupStatus === 'disabled') {
		signupInProgress = false;
		var id = setInterval(async () => {
			await signup();
			if (signupStatus !== 'disabled') {
				clearInterval(id);
			}
		}, 180000);
	}
}

async function pingWhenSignupsEnabled(msg) {
	await signupsEnabled();
	var channel = servers.get(msg.guild.id).channels.get(msg.channel.id);
	waiting = channel.waiting;
	if (signupStatus !== 'enabled') {
		if (waiting.includes(msg.author.id)) {
			msg.reply('you\'re already on the list to be pinged!')
				.catch(console.error);
				
		} else {
			msg.reply('alright, I\'ll ping you when signups are enabled!')
				.catch(console.error);
			
			if (waiting.length > 0) {
				waiting.push(msg.author.id);
				return;
			}
			waiting.push(msg.author.id);
			signupInProgress = false;
			var id = setInterval(async () => {
				await signup();
				if (signupStatus !== 'disabled') {
					clearInterval(id);
					var reply = '';
					for (message of waiting) { 
						reply += '<@' + message + '> ';
					}
					reply += 'signups are now enabled!';
					msg.channel.send(reply)
						.catch(console.error);
					waiting.length = 0;
				}
			}, 180000);
		}
		
	} else msg.reply('signups are already enabled.')
		.catch(console.error);
}

async function updateStatus() {
	count = await getOnlineUsers();
	signupStatus = (await signupsEnabled() ? 'enabled' : 'disabled');
	client.user.setPresence({activity: {name: 'Signups are ' + signupStatus + ', and there are ' + count + ' players online.'}, status: 'online'})
		.catch(console.error);
	
	iid.push(0); iid.push(0);
	
	setTimeout(() => {
		iid[0] = setInterval(async () => {
			count = await getOnlineUsers();
			client.user.setPresence({activity: {name: 'Signups are ' + signupStatus + ', and there are ' + count + ' players online.'}, status: 'online'})
				.catch(console.error);
		}, 60000);
	}, 60000);
	
	setTimeout(() => {
		iid[1] = setInterval(async () => {
			signupStatus = (await signupsEnabled() ? 'enabled' : 'disabled');
			client.user.setPresence({activity: {name: 'Signups are ' + signupStatus + ', and there are ' + count + ' players online.'}, status: 'online'})
				.catch(console.error);
		}, 180000);
	}, 180000);
	return iid;
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
		host: 'secrethitler.io',
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

async function makePOSTRequest(options, encodedData) {
	return new Promise((resolve, reject) => {
		var json = '';
		var data = {};
		
		var req = https.request(options, res => {
			res.on('data', chunk => {
				json += chunk;
			});
			res.on('end', () => {
				if (res.statusCode === 200) {
					try {
						data = JSON.parse(json);
						resolve({
							error: 0,
							statusCode: res.statusCode,
							data: data
						});
						
					} catch (e) {
						reject({
							error: e,
							statusCode: res.statusCode,
							data: data
						});
					}
					
				} else {
					try {
						data = JSON.parse(json);
						reject({
							error: 0,
							statusCode: res.statusCode,
							data: data
						});
						
					} catch (e) {
						reject({
							error: e,
							statusCode: res.statusCode,
							data: data
						});
					}
				}
			});
		}).on('error', function (err) {
			reject({
				error: err,
				statusCode: -1,
				data: ''
			});
		});
		req.write(encodedData);
		req.end();
	});
}

async function signupsEnabled() {
	if (signupInProgress) return false;
	
	var data = {
		username: 'acsutest',
		password: config.password,
		password2: config.password,
		email: 'acsutest@gmail.com',
		isPrivate: false,
		bypassKey: ''
	}
	//"username=acsutest&password=redacted&password2=redacted&email=acsutest@gmail.com&isPrivate=false&bypassKey=" https://secrethitler.io/account/signup

	var encodedData = 'username=' + config.username + '&password=' + config.password + '&password2=' + config.password + '&email=' + config.email + '&isPrivate=false&bypassKey='; // JSON.stringify(data);
	
	var deleteAccountOptions = {
		host: 'secrethitler.io',
		path: '/account/delete-account',
		method: 'POST',
        headers: {
			'Content-Length': Buffer.byteLength(encodedData),
			'Content-Type': 'application/x-www-form-urlencoded' // 'application/json',
        }
	}
	
	try {
		try {
			await makePOSTRequest(deleteAccountOptions, encodedData);
			
		} catch (e) {
		}
		return await signup();
	
	} catch(e) {
		signupStatus = 'disabled';
		return false;
	}
}

async function signup() {
	if (signupInProgress) return;
	signupInProgress = true;
	
	console.log('signupInProgress: ' + signupInProgress);
	
	var encodedData = 'username=' + config.username + '&password=' + config.password + '&password2=' + config.password + '&email=' + config.email + '&isPrivate=false&bypassKey=';
	
	var signupOptions = {
		host: 'secrethitler.io',
		path: '/account/signup',
		method: 'POST',
        headers: {
			'Content-Length': Buffer.byteLength(encodedData),
			'Content-Type': 'application/x-www-form-urlencoded' // 'application/json',
        }
	}
	
	try {
		try {
			let response = await makePOSTRequest(signupOptions, encodedData);
			signupStatus = 'enabled';
	
		} catch (e) {
			signupStatus = 'disabled';
		}
		
		let data = response.data;
	
	} catch(e) {
		signupStatus = 'disabled';
	}
	
	signupInProgress = false;
	return signupStatus === 'enabled';
}